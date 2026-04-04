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
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
ALERTMANAGER_URL="${ALERTMANAGER_URL:-http://localhost:9093}"

echo "[$(date -Iseconds)] Starting infrastructure monitor..."

# ---------- Docker Containers ----------
echo "  Collecting Docker container stats..."

CONTAINERS_JSON="[]"
if command -v docker &>/dev/null; then
  # Get all containers (running and stopped)
  CONTAINERS_JSON=$(docker ps -a --format '{{.Names}}|{{.Status}}|{{.Image}}' | while IFS='|' read -r name status image; do
    # Determine state
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

    echo "{\"name\":\"$name\",\"status\":\"$state\",\"uptime\":\"$uptime\",\"image\":\"$image\",\"memory_mb\":0,\"memory_percent\":0,\"cpu_percent\":0}"
  done | jq -s '.')

  # Get live stats for running containers (1 snapshot, no stream)
  STATS=$(docker stats --no-stream --format '{{.Name}}|{{.MemUsage}}|{{.MemPerc}}|{{.CPUPerc}}' 2>/dev/null || echo "")

  if [ -n "$STATS" ]; then
    # Merge stats into container data
    while IFS='|' read -r name mem_usage mem_pct cpu_pct; do
      # Parse memory (e.g., "256.4MiB / 31.25GiB" -> 256)
      mem_mb=$(echo "$mem_usage" | awk '{gsub(/[^0-9.]/, "", $1); print int($1)}')
      mem_p=$(echo "$mem_pct" | tr -d '%' | xargs)
      cpu_p=$(echo "$cpu_pct" | tr -d '%' | xargs)

      CONTAINERS_JSON=$(echo "$CONTAINERS_JSON" | jq --arg name "$name" --argjson mem "$mem_mb" --arg memp "$mem_p" --arg cpup "$cpu_p" '
        map(if .name == $name then .memory_mb = $mem | .memory_percent = ($memp | tonumber) | .cpu_percent = ($cpup | tonumber) else . end)
      ')
    done <<< "$STATS"
  fi
elif command -v podman &>/dev/null; then
  CONTAINERS_JSON=$(podman ps -a --format '{{.Names}}|{{.Status}}|{{.Image}}' | while IFS='|' read -r name status image; do
    state="stopped"
    uptime=""
    if echo "$status" | grep -qi "up"; then state="running"; uptime=$(echo "$status" | sed 's/Up //'); fi
    echo "{\"name\":\"$name\",\"status\":\"$state\",\"uptime\":\"$uptime\",\"image\":\"$image\",\"memory_mb\":0,\"memory_percent\":0,\"cpu_percent\":0}"
  done | jq -s '.')
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
  ARRAY_DISK_JSON="{\"total_gb\":${ARR_TOTAL:-0},\"used_gb\":${ARR_USED:-0},\"percent\":${ARR_PCT:-0}}"
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

PROM_METRICS="[]"
PROM_UP=false
if curl -sf "${PROMETHEUS_URL}/api/v1/query?query=up" -o /dev/null 2>/dev/null; then
  PROM_UP=true

  # Collect key metrics from Prometheus
  declare -A PROM_QUERIES=(
    ["container_cpu_usage"]="sum by (name) (rate(container_cpu_usage_seconds_total{name!=\"\"}[5m]) * 100)"
    ["container_memory_usage"]="container_memory_usage_bytes{name!=\"\"}"
    ["node_cpu_seconds"]="100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)"
    ["node_memory_available"]="node_memory_MemAvailable_bytes"
    ["node_disk_read_bytes"]="rate(node_disk_read_bytes_total[5m])"
    ["node_disk_write_bytes"]="rate(node_disk_written_bytes_total[5m])"
    ["node_network_receive"]="rate(node_network_receive_bytes_total{device!=\"lo\"}[5m])"
    ["node_network_transmit"]="rate(node_network_transmit_bytes_total{device!=\"lo\"}[5m])"
  )

  PROM_METRICS="{"
  first=true
  for key in "${!PROM_QUERIES[@]}"; do
    query="${PROM_QUERIES[$key]}"
    result=$(curl -sf "${PROMETHEUS_URL}/api/v1/query" --data-urlencode "query=$query" 2>/dev/null || echo '{"data":{"result":[]}}')
    data=$(echo "$result" | jq -c '.data.result // []' 2>/dev/null || echo '[]')

    if [ "$first" = true ]; then first=false; else PROM_METRICS+=","; fi
    PROM_METRICS+="\"$key\":$data"
  done
  PROM_METRICS+="}"

  echo "  Prometheus: OK"
else
  PROM_METRICS="{}"
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

HTTP_CODE=$(curl -sf -o /tmp/infra-response.json -w "%{http_code}" \
  -X POST "$MC_INGEST_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -d "$PAYLOAD" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "201" ]; then
  echo "  Posted successfully (HTTP $HTTP_CODE)"
else
  echo "  POST failed (HTTP $HTTP_CODE)"
  cat /tmp/infra-response.json 2>/dev/null || true
  echo ""
fi

echo "[$(date -Iseconds)] Monitor complete."
