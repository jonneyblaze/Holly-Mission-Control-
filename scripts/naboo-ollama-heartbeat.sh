#!/usr/bin/env bash
# naboo-ollama-heartbeat.sh — query the local Ollama daemon on Naboo and
# POST its status to Mission Control so the AI Providers card can render
# a fresh "Ollama (Local)" snapshot. Vercel can't reach the LAN Ollama
# directly, so this heartbeat is the bridge.
#
# Cron (every 5 minutes via Unraid user scripts or /boot/config/go):
#   */5 * * * * /mnt/user/appdata/openclaw/scripts/naboo-ollama-heartbeat.sh >> /var/log/ollama-heartbeat.log 2>&1
#
# Required env (set via the wrapping cron line or a small env file):
#   MC_URL         — e.g. https://missioncontrol.bodylytics.coach
#   INGEST_API_KEY — matches the Vercel env var of the same name

set -euo pipefail

MC_URL="${MC_URL:-https://missioncontrol.bodylytics.coach}"
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
INGEST_API_KEY="${INGEST_API_KEY:-}"

log() { echo "[$(date -Iseconds)] $*"; }

if [[ -z "$INGEST_API_KEY" ]]; then
  log "ERROR: INGEST_API_KEY not set"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  log "ERROR: jq not installed"
  exit 1
fi

# 1. Query local Ollama for its model list.
status="active"
error_msg=""
models_json="[]"

if tags="$(curl -fsS --max-time 5 "${OLLAMA_URL}/api/tags" 2>&1)"; then
  # Flatten to ["qwen2.5:32b", "llama3.2:3b", ...]
  models_json="$(echo "$tags" | jq -c '[.models[]?.name]')"
else
  status="error"
  error_msg="Ollama unreachable at ${OLLAMA_URL}"
  log "WARN: ${error_msg}"
fi

# 2. POST the heartbeat to Mission Control.
payload="$(jq -cn \
  --arg status "$status" \
  --arg error "$error_msg" \
  --argjson models "$models_json" \
  '{ provider: "ollama", status: $status, models: $models, error: (if $error == "" then null else $error end) }'
)"

resp="$(curl -fsS --max-time 10 \
  -X POST \
  -H "Authorization: Bearer ${INGEST_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$payload" \
  "${MC_URL}/api/infra/heartbeat" || true)"

if [[ -z "$resp" ]]; then
  log "ERROR: heartbeat POST failed (no response)"
  exit 1
fi

log "Heartbeat ok: status=${status} models=$(echo "$models_json" | jq 'length') resp=${resp}"
