#!/usr/bin/env bash
# naboo-budget-degrade.sh — pull the current budget tier from Mission Control
# and rewrite openclaw.json per the degradation ladder. Safe to run on a cron.
#
# Designed to run on Naboo (Unraid) alongside the OpenClaw container.
#
# Tier ladder:
#   normal   → full Profile A matrix (Sonnet orchestrators, Gemini drafters, Haiku support)
#   warn     → same as normal, log only
#   caution  → orchestrators drop to Haiku, more free-model fallbacks
#   lockdown → free models + Ollama only
#   frozen   → Ollama only
#
# Usage:
#   MC_URL=https://mission-control.vercel.app ./naboo-budget-degrade.sh
#
# Cron suggestion (Unraid user scripts, every 15 minutes):
#   */15 * * * * /mnt/user/appdata/openclaw/scripts/naboo-budget-degrade.sh >> /var/log/budget-degrade.log 2>&1

set -euo pipefail

MC_URL="${MC_URL:-https://mission-control.vercel.app}"
CONFIG="${OPENCLAW_CONFIG:-/mnt/user/appdata/openclaw/data/openclaw.json}"
STATE_FILE="${STATE_FILE:-/mnt/user/appdata/openclaw/data/.last-tier}"
CONTAINER="${CONTAINER:-openclaw}"

log() { echo "[$(date -Iseconds)] $*"; }

if ! command -v jq >/dev/null 2>&1; then
  log "ERROR: jq not installed"
  exit 1
fi

# 1. Fetch current tier from Mission Control.
resp="$(curl -fsS --max-time 10 "${MC_URL}/api/budget/state" || true)"
if [[ -z "$resp" ]]; then
  log "WARN: could not reach ${MC_URL}/api/budget/state — leaving config alone"
  exit 0
fi

tier="$(echo "$resp" | jq -r '.current.current_tier // "normal"')"
pct="$(echo "$resp" | jq -r '.current.pct_used // 0')"
spent="$(echo "$resp" | jq -r '.current.spent_usd_mtd // 0')"

log "Current tier=${tier} pct=${pct}% spent=\$${spent}"

# 2. No-op if tier is unchanged.
last_tier=""
[[ -f "$STATE_FILE" ]] && last_tier="$(cat "$STATE_FILE")"
if [[ "$tier" == "$last_tier" ]]; then
  log "No change (${tier}) — nothing to do."
  exit 0
fi

log "Tier changed: ${last_tier:-<none>} → ${tier}"

# 3. Build the per-agent model map for this tier.
#    (Profile A is the baseline; caution/lockdown/frozen downgrade from it.)
case "$tier" in
  normal|warn)
    holly="openrouter/anthropic/claude-sonnet-4.5"
    qa="openrouter/anthropic/claude-sonnet-4.5"
    devops="openrouter/anthropic/claude-sonnet-4.5"
    drafter="openrouter/google/gemini-2.5-flash"
    support="openrouter/anthropic/claude-haiku-4.5"
    ;;
  caution)
    # Orchestrators drop from Sonnet → Haiku; drafters stay on free Gemini Flash
    holly="openrouter/anthropic/claude-haiku-4.5"
    qa="openrouter/anthropic/claude-haiku-4.5"
    devops="openrouter/anthropic/claude-haiku-4.5"
    drafter="openrouter/google/gemini-2.5-flash"
    support="openrouter/anthropic/claude-haiku-4.5"
    ;;
  lockdown)
    # Free models + local only
    holly="openrouter/deepseek/deepseek-chat-v3.1:free"
    qa="openrouter/deepseek/deepseek-chat-v3.1:free"
    devops="openrouter/deepseek/deepseek-chat-v3.1:free"
    drafter="openrouter/meta-llama/llama-3.3-70b-instruct:free"
    support="openrouter/meta-llama/llama-3.3-70b-instruct:free"
    ;;
  frozen)
    # Ollama only
    holly="ollama/qwen2.5:32b"
    qa="ollama/qwen2.5:32b"
    devops="ollama/qwen2.5:32b"
    drafter="ollama/qwen2.5:32b"
    support="ollama/qwen2.5:32b"
    ;;
  *)
    log "ERROR: unknown tier '${tier}'"
    exit 1
    ;;
esac

# 4. Backup + rewrite openclaw.json with jq.
ts="$(date +%s)"
backup="${CONFIG}.bak.degrade-${ts}"
cp "$CONFIG" "$backup"
log "Backup written to $backup"

tmp="$(mktemp)"
# agents.list is an array of { id, model, ... } — map over it and replace
# the model field per the tier's assignment table. Unknown ids are left alone.
# Do NOT add unknown root-level keys (OpenClaw's config schema is strict and
# will reject them, crash-looping the container).
jq \
  --arg holly "$holly" \
  --arg qa "$qa" \
  --arg devops "$devops" \
  --arg drafter "$drafter" \
  --arg support "$support" \
  '
    ( { "holly": $holly,
        "bl-qa": $qa,
        "devops": $devops,
        "bl-marketing": $drafter,
        "bl-community":  $drafter,
        "bl-content":    $drafter,
        "bl-social":     $drafter,
        "infra":         $drafter,
        "bl-support":    $support,
        "duracell-prep": $support
      }
    ) as $map
    | .agents.list |= map(
        if ($map[.id] // null) != null then .model = $map[.id] else . end
      )
  ' "$CONFIG" > "$tmp"

if ! jq empty "$tmp" >/dev/null 2>&1; then
  log "ERROR: jq output invalid — aborting, config untouched"
  rm -f "$tmp"
  exit 1
fi

# Idempotency guard: if the rewritten config is byte-identical to the live
# one, don't touch anything (no backup churn, no container restart). This
# handles first-run when `.last-tier` is empty but the config is already
# on the right tier.
if cmp -s "$tmp" "$CONFIG"; then
  log "Config already on tier=${tier} — no changes, skipping restart."
  rm -f "$tmp"
  # Remove the pre-emptive backup we wrote earlier — it's just clutter now.
  rm -f "$backup"
  echo "$tier" > "$STATE_FILE"
  exit 0
fi

mv "$tmp" "$CONFIG"
echo "$tier" > "$STATE_FILE"
log "Config rewritten for tier=${tier}"

# 5. Restart OpenClaw so the new config takes effect.
if command -v docker >/dev/null 2>&1; then
  log "Restarting container ${CONTAINER}..."
  docker restart "$CONTAINER" >/dev/null && log "Container restarted."
else
  log "WARN: docker CLI not found — skip restart"
fi

log "Degradation step complete (tier=${tier})."
