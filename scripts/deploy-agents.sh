#!/bin/bash
# Deploy agent workspace files to Naboo (OpenClaw)
# Usage: ./scripts/deploy-agents.sh
#
# This copies each agent's AGENT.md + shared INGEST.md to their
# workspace on Naboo so they know how to POST to Mission Control.

NABOO="root@10.0.1.100"
OPENCLAW_BASE="/mnt/user/appdata/openclaw/config/agents"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS_DIR="$SCRIPT_DIR/../agents"

echo "🚀 Deploying agent configs to Naboo ($NABOO)"
echo ""

# Ensure base directory exists
ssh "$NABOO" "mkdir -p $OPENCLAW_BASE/_shared"

# Copy shared ingest instructions
echo "📋 Copying shared INGEST.md..."
scp "$AGENTS_DIR/_shared/INGEST.md" "$NABOO:$OPENCLAW_BASE/_shared/INGEST.md"

# Copy each agent's AGENT.md
for agent_dir in "$AGENTS_DIR"/*/; do
  agent_name=$(basename "$agent_dir")
  if [ "$agent_name" = "_shared" ]; then continue; fi

  echo "🤖 Deploying $agent_name..."
  ssh "$NABOO" "mkdir -p $OPENCLAW_BASE/$agent_name"
  scp "$agent_dir/AGENT.md" "$NABOO:$OPENCLAW_BASE/$agent_name/AGENT.md"
  # Also copy shared ingest doc into each agent's workspace for easy reference
  scp "$AGENTS_DIR/_shared/INGEST.md" "$NABOO:$OPENCLAW_BASE/$agent_name/INGEST.md"
done

echo ""
echo "✅ All agents deployed!"
echo ""
echo "Agent workspaces on Naboo:"
ssh "$NABOO" "ls -la $OPENCLAW_BASE/"
echo ""
echo "Next steps:"
echo "  1. Set INGEST_API_KEY in OpenClaw environment so agents can authenticate"
echo "  2. Restart OpenClaw: ssh $NABOO 'docker restart openclaw'"
echo "  3. Test: ssh $NABOO and trigger a Holly goal check"
