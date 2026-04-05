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
#
# Two transformations, driven entirely by the manifest (which is the
# source of truth — pricing, cascade, labels are all computed by the
# sync-manifest endpoint, this script just drops them in place):
#
#   1. .models.providers — drop every prior openrouter-<agent> virtual
#      provider, then re-add one per active agent. Each virtual provider
#      carries the agent's per-agent OR key and its fully-expanded
#      `models[]` (primary + fallback cascade, per-agent labeled), so
#      that *every* model the agent can select routes through its own
#      capped key — not just the primary.
#
#   2. .agents.list[].model — for active agents, rewrite to the object
#      form `{primary, fallbacks}` with both primary and every fallback
#      prefixed with the agent's virtual provider. OpenClaw's runtime
#      (resolveAgentModelFallbacksOverride) reads the per-agent override
#      before the global agents.defaults.model.fallbacks cascade, so
#      this closes the rogue-agent gap where Gemini-Pro fallbacks used
#      to leak through the shared openrouter provider.
#
#      The last-resort `ollama/qwen2.5:32b` is appended universally —
#      the manifest deliberately omits it because it's not a per-agent
#      OR model.
#
#   3. Missing/disabled agents: strip any stale openrouter-<agent>/
#      prefix (string OR object form) so they fall back cleanly to the
#      shared openrouter provider until a key is provisioned for them.
CANDIDATE=$(mktemp)
jq --slurpfile mf "$MANIFEST" '
  ($mf[0].agents | map(select(.api_key != null and .disabled == false))) as $active
  | ($mf[0].base_url) as $base
  | .models.providers |= (
      to_entries
      | map(select(.key | startswith("openrouter-") | not))
      | from_entries
    )
  | .models.providers += ($active | map({
      key: ("openrouter-" + .agent_id),
      value: {
        baseUrl: $base,
        apiKey: .api_key,
        models: .all_models
      }
    }) | from_entries)
  | .agents.list |= map(
      . as $a
      | ($active | map(select(.agent_id == $a.id)) | first) as $match
      | if $match then
          .model = {
            primary: ("openrouter-" + $match.agent_id + "/" + $match.primary_model),
            fallbacks: (
              ($match.fallback_models | map("openrouter-" + $match.agent_id + "/" + .))
              + ["ollama/qwen2.5:32b"]
            )
          }
        else
          # No active key for this agent — revert to bare shared-provider string.
          if ($a.model | type) == "object" then
            .model = (
              ($a.model.primary // "")
              | if (type == "string") and startswith("openrouter-")
                then (split("/")[1:] | join("/"))
                else .
                end
            )
          elif ($a.model | type) == "string" and ($a.model | startswith("openrouter-")) then
            .model = ($a.model | split("/")[1:] | join("/"))
          else
            .
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
