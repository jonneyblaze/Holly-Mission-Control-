#!/bin/bash
# =============================================================================
# Naboo Infrastructure Monitor
# Runs on Naboo (10.0.1.100) via cron every 5 minutes
# Collects Docker stats, system metrics, Prometheus data, Alertmanager alerts
# POSTs structured snapshot to Mission Control /api/ingest
#
# Install:
#   scp scripts/infra-monitor.sh root@10.0.1.100:/mnt/user/appdata/scripts/infra-monitor.sh
#   chmod +x /mnt/user/appdata/scripts/infra-monitor.sh
#
# Cron (every 5 min):
#   */5 * * * * /mnt/user/appdata/scripts/infra-monitor.sh >> /tmp/infra-monitor.log 2>&1
# =============================================================================

set -euo pipefail

# ---------- Config ----------
MC_INGEST_URL="${MC_INGEST_URL:-https://holly-mission-control-backend.vercel.app/api/ingest}"
MC_API_KEY="${MC_API_KEY:-9eRse679@ohyEdCz&UAUL@V9V6t*xW@%47r4vQfFeThowllEBsIv}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://10.0.1.100:9090}"
ALERTMANAGER_URL="${ALERTMANAGER_URL:-http://10.0.1.100:9093}"

echo "[$(date -Iseconds)] Starting infrastructure monitor..."

# ---------- Docker Containers ----------
echo "  Collecting Docker container stats..."

CONTAINERS_JSON="[]"
TMPCONTAINERS="/tmp/infra-containers.json"
if command -v docker &>/dev/null; then
  # Get all containers (running and stopped) — build JSON with jq
  echo '[]' > "$TMPCONTAINERS"
  while IFS='|' read -r name status image; do
    state="stopped"
    uptime=""
    if echo "$status" | grep -qi "up"; then
      state="running"
      uptime=$(echo "$status" | sed 's/Up //' | sed 's/ (.*//')
    elif echo "$status" | grep -qi "restarting"; then
      state="restarting"
    elif echo "$status" | grep -qi "exited"; then
      state="exited"
    fi

    jq --arg n "$name" --arg s "$state" --arg u "$uptime" --arg i "$image" \
      '. + [{"name":$n,"status":$s,"uptime":$u,"image":$i,"memory_mb":0,"memory_percent":0,"cpu_percent":0}]' \
      "$TMPCONTAINERS" > "${TMPCONTAINERS}.tmp" && mv "${TMPCONTAINERS}.tmp" "$TMPCONTAINERS"
  done < <(docker ps -a --format '{{.Names}}|{{.Status}}|{{.Image}}')

  CONTAINERS_JSON=$(cat "$TMPCONTAINERS")

  # Get live stats for running containers (1 snapshot, no stream)
  STATS=$(docker stats --no-stream --format '{{.Name}}|{{.MemUsage}}|{{.MemPerc}}|{{.CPUPerc}}' 2>/dev/null || echo "")

  if [ -n "$STATS" ]; then
    while IFS='|' read -r name mem_usage mem_pct cpu_pct; do
      [ -z "$name" ] && continue
      mem_mb=$(echo "$mem_usage" | awk '{gsub(/[^0-9.]/, "", $1); print int($1)}')
      mem_p=$(echo "$mem_pct" | tr -d '% ' || echo "0")
      cpu_p=$(echo "$cpu_pct" | tr -d '% ' || echo "0")
      # Validate numbers
      [ -z "$mem_mb" ] && mem_mb=0
      [ -z "$mem_p" ] && mem_p=0
      [ -z "$cpu_p" ] && cpu_p=0

      CONTAINERS_JSON=$(echo "$CONTAINERS_JSON" | jq \
        --arg name "$name" --argjson mem "${mem_mb:-0}" --argjson memp "${mem_p:-0}" --argjson cpup "${cpu_p:-0}" '
        map(if .name == $name then .memory_mb = $mem | .memory_percent = $memp | .cpu_percent = $cpup else . end)
      ')
    done <<< "$STATS"
  fi

  rm -f "$TMPCONTAINERS" "${TMPCONTAINERS}.tmp"
fi

CONTAINER_COUNT=$(echo "$CONTAINERS_JSON" | jq 'length')
RUNNING_COUNT=$(echo "$CONTAINERS_JSON" | jq '[.[] | select(.status == "running")] | length')
echo "  Found $CONTAINER_COUNT containers ($RUNNING_COUNT running)"

# ---------- System Metrics ----------
echo "  Collecting system metrics..."

# Disk usage (root filesystem)
DISK_JSON="{}"
if command -v df &>/dev/null; then
  DISK_TOTAL=$(df -BG / 2>/dev/null | tail -1 | awk '{gsub("G",""); print $2}')
  DISK_USED=$(df -BG / 2>/dev/null | tail -1 | awk '{gsub("G",""); print $3}')
  DISK_PCT=$(df / 2>/dev/null | tail -1 | awk '{gsub("%",""); print $5}')
  DISK_JSON="{\"total_gb\":${DISK_TOTAL:-0},\"used_gb\":${DISK_USED:-0},\"percent\":${DISK_PCT:-0}}"
fi

# Also check array disk if on Unraid
ARRAY_DISK_JSON="{}"
if [ -d "/mnt/user" ]; then
  ARR_TOTAL=$(df -BG /mnt/user 2>/dev/null | tail -1 | awk '{gsub("G",""); print $2}')
  ARR_USED=$(df -BG /mnt/user 2>/dev/null | tail -1 | awk '{gsub("G",""); print $3}')
  ARR_PCT=$(df /mnt/user 2>/dev/null | tail -1 | awk '{gsub("%",""); print $5}')
  # Validate — Unraid can return '-' for some mounts
  case "$ARR_PCT" in ''|*[!0-9]*) ARR_PCT=0 ;; esac
  case "$ARR_TOTAL" in ''|*[!0-9]*) ARR_TOTAL=0 ;; esac
  case "$ARR_USED" in ''|*[!0-9]*) ARR_USED=0 ;; esac
  ARRAY_DISK_JSON="{\"total_gb\":${ARR_TOTAL},\"used_gb\":${ARR_USED},\"percent\":${ARR_PCT}}"
fi

# Memory
MEM_JSON="{}"
if command -v free &>/dev/null; then
  MEM_TOTAL=$(free -m | awk '/Mem:/ {print $2}')
  MEM_USED=$(free -m | awk '/Mem:/ {print $3}')
  MEM_AVAILABLE=$(free -m | awk '/Mem:/ {print $7}')
  MEM_PCT=$(( (MEM_USED * 100) / MEM_TOTAL ))
  MEM_JSON="{\"total_mb\":${MEM_TOTAL},\"used_mb\":${MEM_USED},\"available_mb\":${MEM_AVAILABLE},\"percent\":${MEM_PCT}}"
fi

# CPU load average
CPU_JSON="{}"
if [ -f /proc/loadavg ]; then
  LOAD1=$(cat /proc/loadavg | awk '{print $1}')
  LOAD5=$(cat /proc/loadavg | awk '{print $2}')
  LOAD15=$(cat /proc/loadavg | awk '{print $3}')
  NPROC=$(nproc 2>/dev/null || echo 1)
  CPU_PCT=$(echo "$LOAD1 $NPROC" | awk '{printf "%.0f", ($1/$2)*100}')
  CPU_JSON="{\"load_1m\":$LOAD1,\"load_5m\":$LOAD5,\"load_15m\":$LOAD15,\"cores\":$NPROC,\"percent\":$CPU_PCT}"
fi

# System uptime
SYS_UPTIME=$(uptime -p 2>/dev/null || uptime | sed 's/.*up //' | sed 's/,.*//')

# ---------- Prometheus Metrics ----------
echo "  Querying Prometheus..."

PROM_METRICS="{}"
PROM_UP=false
if curl -sf "${PROMETHEUS_URL}/api/v1/query?query=up" -o /dev/null 2>/dev/null; then
  PROM_UP=true

  # Instant queries
  PROM_METRICS=$(jq -n '{}')
  for pair in \
    "container_cpu_usage:sum by (name) (rate(container_cpu_usage_seconds_total{name!=\"\"}[5m]) * 100)" \
    "node_cpu_pct:100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)" \
    "node_memory_available:node_memory_MemAvailable_bytes"; do

    key="${pair%%:*}"
    query="${pair#*:}"
    result=$(curl -sf "${PROMETHEUS_URL}/api/v1/query" --data-urlencode "query=$query" 2>/dev/null || echo '{"data":{"result":[]}}')
    data=$(echo "$result" | jq -c '.data.result // []' 2>/dev/null || echo '[]')
    PROM_METRICS=$(echo "$PROM_METRICS" | jq --arg k "$key" --argjson v "$data" '. + {($k): $v}')
  done

  # Time-series (last 2 hours, 5-min steps) for charts
  END_TS=$(date +%s)
  START_TS=$((END_TS - 7200))
  CHARTS=$(jq -n '{}')
  for pair in \
    "cpu:100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)" \
    "memory:(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100" \
    "disk_io:rate(node_disk_read_bytes_total{device=~\"sd.*|nvme.*\"}[5m]) + rate(node_disk_written_bytes_total{device=~\"sd.*|nvme.*\"}[5m])" \
    "network:rate(node_network_receive_bytes_total{device!=\"lo\"}[5m]) + rate(node_network_transmit_bytes_total{device!=\"lo\"}[5m])"; do

    key="${pair%%:*}"
    query="${pair#*:}"
    result=$(curl -sf "${PROMETHEUS_URL}/api/v1/query_range" \
      --data-urlencode "query=$query" \
      --data-urlencode "start=$START_TS" \
      --data-urlencode "end=$END_TS" \
      --data-urlencode "step=300" 2>/dev/null || echo '{"data":{"result":[]}}')

    # Extract values as [{t: timestamp, v: value}]
    data=$(echo "$result" | jq -c '[.data.result[0].values[]? | {t: .[0], v: (.[1] | tonumber | . * 100 | round / 100)}]' 2>/dev/null || echo '[]')
    CHARTS=$(echo "$CHARTS" | jq --arg k "$key" --argjson v "$data" '. + {($k): $v}')
  done
  PROM_METRICS=$(echo "$PROM_METRICS" | jq --argjson charts "$CHARTS" '. + {charts: $charts}')

  echo "  Prometheus: OK"
else
  echo "  Prometheus: not reachable"
fi

# ---------- Alertmanager ----------
echo "  Querying Alertmanager..."

ALERTS_JSON="[]"
ALERTMANAGER_UP=false
ALERT_RESPONSE=$(curl -sf "${ALERTMANAGER_URL}/api/v2/alerts" 2>/dev/null || echo "")
if [ -n "$ALERT_RESPONSE" ]; then
  ALERTMANAGER_UP=true
  ALERTS_JSON=$(echo "$ALERT_RESPONSE" | jq -c '[.[] | {
    name: .labels.alertname,
    severity: (.labels.severity // "warning"),
    status: .status.state,
    instance: (.labels.instance // ""),
    summary: (.annotations.summary // .annotations.description // ""),
    starts_at: .startsAt,
    ends_at: .endsAt
  }]' 2>/dev/null || echo "[]")
  ALERT_COUNT=$(echo "$ALERTS_JSON" | jq 'length')
  echo "  Alertmanager: OK ($ALERT_COUNT active alerts)"
else
  echo "  Alertmanager: not reachable"
fi

# ---------- Build Summary ----------
HEALTHY_PCT=0
if [ "$CONTAINER_COUNT" -gt 0 ]; then
  HEALTHY_PCT=$(( (RUNNING_COUNT * 100) / CONTAINER_COUNT ))
fi

# Determine overall health status
HEALTH_STATUS="healthy"
if [ "$HEALTHY_PCT" -lt 90 ]; then HEALTH_STATUS="degraded"; fi
if [ "$HEALTHY_PCT" -lt 70 ]; then HEALTH_STATUS="critical"; fi
DISK_PCT_VAL=$(echo "$DISK_JSON" | jq '.percent // 0')
if [ "$DISK_PCT_VAL" -gt 90 ]; then HEALTH_STATUS="critical"; fi
MEM_PCT_VAL=$(echo "$MEM_JSON" | jq '.percent // 0')
if [ "$MEM_PCT_VAL" -gt 90 ]; then HEALTH_STATUS="critical"; fi

SUMMARY="$RUNNING_COUNT/$CONTAINER_COUNT containers running. Disk: ${DISK_PCT_VAL}%. Memory: ${MEM_PCT_VAL}%. Status: ${HEALTH_STATUS}."
if [ "$(echo "$ALERTS_JSON" | jq 'length')" -gt 0 ]; then
  SUMMARY+=" $(echo "$ALERTS_JSON" | jq 'length') active alert(s)."
fi

echo "  Summary: $SUMMARY"

# ---------- POST to Mission Control ----------
echo "  Posting to Mission Control..."

PAYLOAD=$(jq -n \
  --arg agent_id "infra" \
  --arg activity_type "infra_snapshot" \
  --arg title "Infrastructure Health: ${HEALTH_STATUS}" \
  --arg summary "$SUMMARY" \
  --arg workflow "infra-monitor-5m" \
  --argjson containers "$CONTAINERS_JSON" \
  --argjson disk "$DISK_JSON" \
  --argjson array_disk "$ARRAY_DISK_JSON" \
  --argjson memory "$MEM_JSON" \
  --argjson cpu "$CPU_JSON" \
  --argjson alerts "$ALERTS_JSON" \
  --argjson prometheus "$PROM_METRICS" \
  --arg uptime "$SYS_UPTIME" \
  --arg health_status "$HEALTH_STATUS" \
  --argjson prometheus_up "$PROM_UP" \
  --argjson alertmanager_up "$ALERTMANAGER_UP" \
  '{
    agent_id: $agent_id,
    activity_type: $activity_type,
    title: $title,
    summary: $summary,
    workflow: $workflow,
    metadata: {
      containers: $containers,
      disk_usage: $disk,
      array_disk_usage: $array_disk,
      memory_usage: $memory,
      cpu_usage: $cpu,
      alerts: $alerts,
      prometheus: $prometheus,
      system_uptime: $uptime,
      health_status: $health_status,
      prometheus_up: $prometheus_up,
      alertmanager_up: $alertmanager_up,
      snapshot_time: (now | todate)
    }
  }')

HTTP_CODE=$(curl -s -o /tmp/infra-response.json -w "%{http_code}" \
  -X POST "$MC_INGEST_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${MC_API_KEY}" \
  -d "$PAYLOAD" 2>/dev/null)

[ -z "$HTTP_CODE" ] && HTTP_CODE="000"

if [ "$HTTP_CODE" = "201" ]; then
  echo "  Posted successfully (HTTP $HTTP_CODE)"
else
  echo "  POST failed (HTTP $HTTP_CODE)"
  cat /tmp/infra-response.json 2>/dev/null || true
  echo ""
fi

echo "[$(date -Iseconds)] Monitor complete."
