#!/bin/bash
# =============================================================================
# Flow Capture Runner — runs capture-flow.mjs in Docker on Naboo
#
# Usage:
#   CAPTURE_FLOW=login /mnt/user/appdata/scripts/run-capture.sh
#   CAPTURE_FLOW=signup,dashboard /mnt/user/appdata/scripts/run-capture.sh
#   CAPTURE_URLS="/login,/courses,/admin" /mnt/user/appdata/scripts/run-capture.sh
#   CAPTURE_FLOW=all VIEWPORT=both /mnt/user/appdata/scripts/run-capture.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p /tmp/qa-screenshots

# Load credentials from env file (if exists)
[ -f "${SCRIPT_DIR}/qa-env.sh" ] && source "${SCRIPT_DIR}/qa-env.sh"

docker run --rm \
  --name holly-flow-capture \
  --network host \
  -v "${SCRIPT_DIR}/capture-flow.mjs:/tests/capture-flow.mjs:ro" \
  -v "/tmp/qa-screenshots:/tmp/qa-screenshots" \
  -e "TEST_URL=${TEST_URL:-https://bodylytics.coach}" \
  -e "MC_INGEST_URL=${MC_INGEST_URL:-https://holly-mission-control-backend.vercel.app/api/ingest}" \
  -e "MC_API_KEY=${MC_API_KEY:-9eRse679@ohyEdCz&UAUL@V9V6t*xW@%47r4vQfFeThowllEBsIv}" \
  -e "TEST_EMAIL=${TEST_EMAIL:-}" \
  -e "TEST_PASSWORD=${TEST_PASSWORD:-}" \
  -e "ADMIN_EMAIL=${ADMIN_EMAIL:-}" \
  -e "ADMIN_PASSWORD=${ADMIN_PASSWORD:-}" \
  -e "CAPTURE_FLOW=${CAPTURE_FLOW:-}" \
  -e "CAPTURE_URLS=${CAPTURE_URLS:-}" \
  -e "REQUESTING_AGENT=${REQUESTING_AGENT:-bl-content}" \
  -e "TASK_ID=${TASK_ID:-}" \
  -e "VIEWPORT=${VIEWPORT:-desktop}" \
  mcr.microsoft.com/playwright:v1.44.0-jammy \
  bash -c "cd /tmp && cp /tests/capture-flow.mjs . && npm i --no-save playwright@1.44.0 2>/dev/null && node capture-flow.mjs"

echo "[$(date -Iseconds)] Flow capture complete"
