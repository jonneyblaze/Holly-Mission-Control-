#!/usr/bin/env bash
# openclaw-keys-sync.sh
#
# Runs on Naboo (Unraid) as a 5-min cron. Pulls the desired per-agent
# OR-key state from Holly Mission Control's /api/budget/keys/sync-manifest,
# rebuilds the target `openclaw.json` with per-agent virtual-provider
# entries, and only restarts OpenClaw if the file actually changed.
#
# Self-healing: Supabase is source of truth. Create/rotate/delete a key
# from the dashboard, wait up to 5 min, Naboo catches up automatically.
#
# Safety net: backup → validate → restart → /healthz poll → rollback on
# any failure. Uses the direct healthz endpoint, NOT docker inspect,
# because docker's built-in healthcheck is broken by a runc/systemd-logind
# environmental bug on Naboo.
#
# Env (from /etc/openclaw-keys-sync.env):
#   MC_URL             e.g. https://missioncontrol.bodylytics.coach
#   INGEST_API_KEY     bearer for the sync-manifest endpoint
#   OPENCLAW_CFG       path to openclaw.json (default: /mnt/user/appdata/openclaw/data/openclaw.json)
#   OPENCLAW_CONTAINER container name (default: openclaw)
#   OPENCLAW_HEALTHZ   health URL (default: http://127.0.0.1:18789/healthz)
#
# Exit codes:
#   0  no-op or successful apply
#   1  pre-flight failure (missing deps, env, or baseline unhealthy)
#   2  manifest fetch / parse error
#   3  schema validation failed on candidate (reverted before apply)
#   4  post-apply health check failed (rolled back)
#   5  post-rollback health still failing (needs human)

set -euo pipefail

# ---- env ----
if [[ -f /etc/openclaw-keys-sync.env ]]; then
  # shellcheck disable=SC1091
  source /etc/openclaw-keys-sync.env
fi

: "${MC_URL:?MC_URL not set}"
: "${INGEST_API_KEY:?INGEST_API_KEY not set}"
OPENCLAW_CFG="${OPENCLAW_CFG:-/mnt/user/appdata/openclaw/data/openclaw.json}"
OPENCLAW_CONTAINER="${OPENCLAW_CONTAINER:-openclaw}"
OPENCLAW_HEALTHZ="${OPENCLAW_HEALTHZ:-http://127.0.0.1:18789/healthz}"
LOG_FILE="${LOG_FILE:-/var/log/openclaw-keys-sync.log}"
STATE_DIR="${STATE_DIR:-/var/lib/openclaw-keys-sync}"
LAST_OK_FILE="$STATE_DIR/last-ok"

mkdir -p "$STATE_DIR"

log() {
  local ts
  ts=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
  printf '%s [%s] %s\n' "$ts" "${1:-info}" "${2:-}" | tee -a "$LOG_FILE" >/dev/null
}

die() {
  log "error" "$2"
  exit "$1"
}

# ---- pre-flight ----
for bin in curl jq docker sha256sum; do
  command -v "$bin" >/dev/null 2>&1 || die 1 "missing dependency: $bin"
done

[[ -f "$OPENCLAW_CFG" ]] || die 1 "config not found at $OPENCLAW_CFG"

# Baseline liveness — skip rollback decisions if OpenClaw is already down
if ! curl -sf -m 3 "$OPENCLAW_HEALTHZ" >/dev/null 2>&1; then
  die 1 "baseline unhealthy: $OPENCLAW_HEALTHZ not responding — aborting without changes"
fi

# ---- fetch manifest ----
MANIFEST=$(mktemp)
trap 'rm -f "$MANIFEST" "$CANDIDATE" 2>/dev/null || true' EXIT
if ! curl -sf -m 10 -H "Authorization: Bearer $INGEST_API_KEY" \
     "$MC_URL/api/budget/keys/sync-manifest" > "$MANIFEST"; then
  die 2 "failed to fetch manifest from $MC_URL"
fi
jq empty "$MANIFEST" 2>/dev/null || die 2 "manifest is not valid JSON"

AGENT_COUNT=$(jq '.agents | length' "$MANIFEST")
WITH_KEYS=$(jq '[.agents[] | select(.api_key != null and .disabled == false)] | length' "$MANIFEST")

# ---- build candidate config ----
CANDIDATE=$(mktemp)
jq --slurpfile mf "$MANIFEST" '
  . as $root
  | ($mf[0].agents | map(select(.api_key != null and .disabled == false))) as $active
  | ($mf[0].base_url) as $base
  # Drop any prior openrouter-<agent> virtual providers (clean slate)
  | .models.providers |= (
      to_entries
      | map(select(.key | startswith("openrouter-") | not))
      | from_entries
    )
  # Add fresh virtual providers from the manifest
  | .models.providers += ($active | map({
      key: ("openrouter-" + .agent_id),
      value: {
        baseUrl: $base,
        apiKey: .api_key,
        models: (
          if .model == "anthropic/claude-sonnet-4.6" then
            [{id:"anthropic/claude-sonnet-4.6", name:("Claude Sonnet 4.6 (per-agent " + .agent_id + ")"), reasoning:true, input:["text","image"], cost:{input:3,output:15,cacheRead:0.3,cacheWrite:3.75}, contextWindow:200000, maxTokens:64000}]
          elif .model == "anthropic/claude-haiku-4.5" then
            [{id:"anthropic/claude-haiku-4.5", name:("Claude Haiku 4.5 (per-agent " + .agent_id + ")"), reasoning:false, input:["text","image"], cost:{input:1,output:5,cacheRead:0.1,cacheWrite:1.25}, contextWindow:200000, maxTokens:64000}]
          elif .model == "google/gemini-2.5-flash" then
            [{id:"google/gemini-2.5-flash", name:("Gemini 2.5 Flash (per-agent " + .agent_id + ")"), reasoning:true, input:["text","image"], cost:{input:0.15,output:0.6,cacheRead:0.0375,cacheWrite:0}, contextWindow:1048576, maxTokens:65536}]
          else
            []
          end
        )
      }
    }) | from_entries)
  # Rewrite agent .model fields — active ones point at their virtual
  # provider; missing / disabled ones fall back to the shared provider.
  | .agents.list |= map(
      . as $a
      | ($active | map(select(.agent_id == $a.id)) | first) as $match
      | if $match then
          .model = ("openrouter-" + $match.agent_id + "/" + $match.model)
        else
          # Strip any stale openrouter-<agent>/ prefix if key was removed
          if ($a.model | type == "string") and ($a.model | startswith("openrouter-")) then
            .model = (($a.model | split("/")[1:] | join("/")))
          else .
          end
        end
    )
' "$OPENCLAW_CFG" > "$CANDIDATE" 2>/dev/null || die 2 "jq patch failed"

jq empty "$CANDIDATE" 2>/dev/null || die 2 "candidate config is not valid JSON"

# ---- diff check ----
CUR_HASH=$(sha256sum "$OPENCLAW_CFG" | awk '{print $1}')
NEW_HASH=$(sha256sum "$CANDIDATE" | awk '{print $1}')

if [[ "$CUR_HASH" == "$NEW_HASH" ]]; then
  date -u +%s > "$LAST_OK_FILE"
  log "noop" "already in sync ($AGENT_COUNT agents, $WITH_KEYS with keys)"
  exit 0
fi

log "drift" "config drift detected — applying ($AGENT_COUNT agents, $WITH_KEYS with keys)"

# ---- stage + validate ----
TS=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="${OPENCLAW_CFG}.sync-${TS}"
cp "$OPENCLAW_CFG" "$BACKUP"
cp "$CANDIDATE" "$OPENCLAW_CFG"

if ! docker exec "$OPENCLAW_CONTAINER" openclaw config validate >/dev/null 2>&1; then
  log "schema_fail" "openclaw config validate rejected candidate — reverting"
  cp "$BACKUP" "$OPENCLAW_CFG"
  exit 3
fi

# ---- restart + poll ----
docker restart "$OPENCLAW_CONTAINER" >/dev/null
sleep 5
HEALTHY=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -sf -m 3 "$OPENCLAW_HEALTHZ" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 2
done

if [[ "$HEALTHY" -ne 1 ]]; then
  log "health_fail" "post-apply health check failed — rolling back to $BACKUP"
  cp "$BACKUP" "$OPENCLAW_CFG"
  docker restart "$OPENCLAW_CONTAINER" >/dev/null
  sleep 5
  if curl -sf -m 3 "$OPENCLAW_HEALTHZ" >/dev/null 2>&1; then
    log "rolled_back" "rollback succeeded, service restored"
    exit 4
  else
    log "rollback_failed" "ROLLBACK HEALTH CHECK FAILED — manual intervention required"
    exit 5
  fi
fi

date -u +%s > "$LAST_OK_FILE"
log "applied" "sync complete ($AGENT_COUNT agents, $WITH_KEYS with keys), backup=$BACKUP"
exit 0
