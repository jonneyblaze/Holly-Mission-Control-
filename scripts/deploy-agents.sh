#!/bin/bash
# Deploy consolidated SOUL.md + AGENT.md to Naboo (OpenClaw)
# Usage: ./scripts/deploy-agents.sh [--dry-run] [--skip-restart]
#
# This script:
#   1. Backs up existing workspace files
#   2. Copies SOUL.md to the CORRECT workspace path
#   3. Copies AGENT.md alongside it (for QMD memory indexing)
#   4. Cleans up old duplicate workspace dirs (workspace-bl-* pattern)
#   5. Cleans up stale openclaw.json.bak* files (keeps 2 most recent)
#   6. Restarts OpenClaw container
#   7. Verifies the container comes back healthy

set -euo pipefail

NABOO="root@10.0.1.100"
# CORRECT workspace path — inside container this maps to /root/.openclaw/workspace/agents/{agent-id}/
WORKSPACE_BASE="/mnt/user/appdata/openclaw/config/workspace/agents"
# OLD incorrect path (agents/ dir used by previous deploy script)
OLD_AGENTS_BASE="/mnt/user/appdata/openclaw/config/agents"
OPENCLAW_CONFIG_DIR="/mnt/user/appdata/openclaw/config"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS_DIR="$SCRIPT_DIR/../agents"
BACKUP_DIR="/mnt/user/appdata/openclaw/backups/$(date +%Y%m%d-%H%M%S)"
DRY_RUN=false
SKIP_RESTART=false
CONTAINER_NAME="openclaw"

# Parse flags
for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --skip-restart) SKIP_RESTART=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

AGENTS=(holly bl-social bl-community bl-marketing bl-content bl-support bl-qa infra devops duracell-prep lead-gen)

log() { echo "[deploy] $1"; }
warn() { echo "[deploy] WARNING: $1"; }

if $DRY_RUN; then
  log "DRY RUN — no changes will be made on Naboo"
fi

# --- Preflight: check all SOUL.md files exist locally ---
log "Preflight check..."
MISSING=0
for agent in "${AGENTS[@]}"; do
  if [ ! -f "$AGENTS_DIR/$agent/SOUL.md" ]; then
    warn "Missing SOUL.md for $agent"
    MISSING=$((MISSING + 1))
  fi
  if [ ! -f "$AGENTS_DIR/$agent/AGENT.md" ]; then
    warn "Missing AGENT.md for $agent (will skip AGENT.md copy)"
  fi
done
if [ "$MISSING" -gt 0 ]; then
  echo "ERROR: $MISSING SOUL.md files missing. Aborting."
  exit 1
fi
log "All $((${#AGENTS[@]})) SOUL.md files found."

# --- Test SSH connectivity ---
log "Testing SSH to Naboo..."
if ! ssh -o ConnectTimeout=5 "$NABOO" "echo ok" >/dev/null 2>&1; then
  echo "ERROR: Cannot SSH to $NABOO. Check connectivity."
  exit 1
fi
log "SSH OK."

if $DRY_RUN; then
  log "Would create backup at $BACKUP_DIR"
  log "Would deploy SOUL.md + AGENT.md for: ${AGENTS[*]}"
  log "Would clean up workspace-bl-* dirs and stale .bak files"
  log "Would restart $CONTAINER_NAME container"
  exit 0
fi

# --- Step 1: Backup existing workspace files ---
log "Step 1/7: Backing up existing workspace files..."
ssh "$NABOO" "mkdir -p $BACKUP_DIR"
# Backup the workspace dir if it exists
ssh "$NABOO" "if [ -d '$WORKSPACE_BASE' ]; then cp -r '$WORKSPACE_BASE' '$BACKUP_DIR/workspace-agents'; fi"
# Backup the old agents dir if it exists
ssh "$NABOO" "if [ -d '$OLD_AGENTS_BASE' ]; then cp -r '$OLD_AGENTS_BASE' '$BACKUP_DIR/old-agents'; fi"
log "Backup saved to $BACKUP_DIR"

# --- Step 2: Deploy SOUL.md to correct workspace path ---
log "Step 2/7: Deploying SOUL.md files to workspace..."
for agent in "${AGENTS[@]}"; do
  log "  -> $agent"
  ssh "$NABOO" "mkdir -p '$WORKSPACE_BASE/$agent'"
  scp -q "$AGENTS_DIR/$agent/SOUL.md" "$NABOO:$WORKSPACE_BASE/$agent/SOUL.md"
done

# --- Step 3: Deploy AGENT.md alongside (for QMD memory indexing) ---
log "Step 3/7: Deploying AGENT.md files..."
for agent in "${AGENTS[@]}"; do
  if [ -f "$AGENTS_DIR/$agent/AGENT.md" ]; then
    scp -q "$AGENTS_DIR/$agent/AGENT.md" "$NABOO:$WORKSPACE_BASE/$agent/AGENT.md"
  fi
done

# --- Step 4: Clean up old duplicate workspace dirs ---
log "Step 4/7: Cleaning up old workspace-bl-* directories..."
STALE_DIRS=$(ssh "$NABOO" "ls -d $OPENCLAW_CONFIG_DIR/workspace-bl-* 2>/dev/null || true")
if [ -n "$STALE_DIRS" ]; then
  log "  Found stale workspace dirs:"
  echo "$STALE_DIRS" | while read -r d; do
    log "    Removing: $d"
    ssh "$NABOO" "rm -rf '$d'"
  done
else
  log "  No stale workspace-bl-* dirs found."
fi

# Also clean up any workspace files in the OLD (incorrect) agents/ path
# Move them to backup but don't delete — they may have session data
log "  Checking old agents/ path for workspace files..."
for agent in "${AGENTS[@]}"; do
  OLD_SOUL="$OLD_AGENTS_BASE/$agent/SOUL.md"
  OLD_AGENT="$OLD_AGENTS_BASE/$agent/AGENT.md"
  OLD_INGEST="$OLD_AGENTS_BASE/$agent/INGEST.md"
  ssh "$NABOO" "
    if [ -f '$OLD_SOUL' ] || [ -f '$OLD_AGENT' ] || [ -f '$OLD_INGEST' ]; then
      echo '  Cleaning old workspace files from agents/$agent'
      rm -f '$OLD_SOUL' '$OLD_AGENT' '$OLD_INGEST'
    fi
  " 2>/dev/null || true
done

# --- Step 5: Clean up stale openclaw.json.bak* files (keep 2 most recent) ---
log "Step 5/7: Cleaning up stale openclaw.json.bak* files..."
ssh "$NABOO" "
  BAK_COUNT=\$(ls -1t $OPENCLAW_CONFIG_DIR/openclaw.json.bak* 2>/dev/null | wc -l)
  if [ \"\$BAK_COUNT\" -gt 2 ]; then
    ls -1t $OPENCLAW_CONFIG_DIR/openclaw.json.bak* | tail -n +3 | while read -r f; do
      echo \"  Removing old backup: \$f\"
      rm -f \"\$f\"
    done
  else
    echo \"  \$BAK_COUNT .bak files found, nothing to clean.\"
  fi
"

# --- Step 6: Restart OpenClaw container ---
if $SKIP_RESTART; then
  log "Step 6/7: Skipping restart (--skip-restart flag)."
else
  log "Step 6/7: Restarting OpenClaw container..."
  ssh "$NABOO" "docker restart $CONTAINER_NAME"
  log "  Container restarting..."
  sleep 5
fi

# --- Step 7: Verify container health ---
log "Step 7/7: Verifying container health..."
RETRIES=6
HEALTHY=false
for i in $(seq 1 $RETRIES); do
  STATUS=$(ssh "$NABOO" "docker inspect --format='{{.State.Status}}' $CONTAINER_NAME 2>/dev/null || echo 'not_found'")
  if [ "$STATUS" = "running" ]; then
    HEALTHY=true
    break
  fi
  log "  Attempt $i/$RETRIES: status=$STATUS, waiting 5s..."
  sleep 5
done

if $HEALTHY; then
  log "Container is running."
else
  warn "Container did not come back healthy after $((RETRIES * 5))s. Status: $STATUS"
  warn "Check manually: ssh $NABOO 'docker logs $CONTAINER_NAME --tail 50'"
  exit 1
fi

# --- Summary ---
echo ""
log "===== DEPLOYMENT COMPLETE ====="
log "Agents deployed: ${#AGENTS[@]}"
log "Workspace path: $WORKSPACE_BASE/{agent-id}/SOUL.md"
log "Backup: $BACKUP_DIR"
echo ""
log "Verify on Naboo:"
log "  ssh $NABOO 'ls -la $WORKSPACE_BASE/*/SOUL.md'"
log "  ssh $NABOO 'docker logs $CONTAINER_NAME --tail 20'"
echo ""
log "Inside container, agents will read from:"
log "  /root/.openclaw/workspace/agents/{agent-id}/SOUL.md"
