#!/bin/bash
# =============================================================================
# BodyLytics Browser QA Runner
# Runs Playwright browser tests inside Docker on Naboo
#
# Install:
#   scp scripts/run-qa.sh scripts/qa-browser-tests.mjs root@10.0.1.100:/mnt/user/appdata/scripts/
#   chmod +x /mnt/user/appdata/scripts/run-qa.sh
#
# First-time setup (pull Playwright image):
#   docker pull mcr.microsoft.com/playwright:v1.44.0-jammy
#
# Manual run:
#   /mnt/user/appdata/scripts/run-qa.sh
#
# Cron (every 2 hours):
#   0 */2 * * * /mnt/user/appdata/scripts/run-qa.sh >> /tmp/qa-tests.log 2>&1
#
# With auth (test login flows):
#   TEST_EMAIL=test@bodylytics.coach TEST_PASSWORD=xxxx /mnt/user/appdata/scripts/run-qa.sh
# =============================================================================

set -euo pipefail

echo "[$(date -Iseconds)] Starting browser QA suite..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCREENSHOTS_DIR="/tmp/qa-screenshots"
mkdir -p "$SCREENSHOTS_DIR"

# Config (override via env vars)
TEST_URL="${TEST_URL:-https://bodylytics.coach}"
MC_INGEST_URL="${MC_INGEST_URL:-https://holly-mission-control-backend.vercel.app/api/ingest}"
MC_API_KEY="${MC_API_KEY:-9eRse679@ohyEdCz&UAUL@V9V6t*xW@%47r4vQfFeThowllEBsIv}"
TEST_EMAIL="${TEST_EMAIL:-}"
TEST_PASSWORD="${TEST_PASSWORD:-}"

docker run --rm \
  --name holly-qa-runner \
  --network host \
  -v "${SCRIPT_DIR}/qa-browser-tests.mjs:/tests/qa-browser-tests.mjs:ro" \
  -v "${SCREENSHOTS_DIR}:/tmp/qa-screenshots" \
  -e "TEST_URL=${TEST_URL}" \
  -e "MC_INGEST_URL=${MC_INGEST_URL}" \
  -e "MC_API_KEY=${MC_API_KEY}" \
  -e "TEST_EMAIL=${TEST_EMAIL}" \
  -e "TEST_PASSWORD=${TEST_PASSWORD}" \
  mcr.microsoft.com/playwright:v1.44.0-jammy \
  bash -c "cd /tmp && cp /tests/qa-browser-tests.mjs . && npm i --no-save playwright@1.44.0 2>/dev/null && node qa-browser-tests.mjs"

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "[$(date -Iseconds)] QA suite: ALL PASSED ✅"
else
  echo "[$(date -Iseconds)] QA suite: FAILURES DETECTED ❌ (exit code $EXIT_CODE)"
fi

echo "[$(date -Iseconds)] Screenshots saved to ${SCREENSHOTS_DIR}/"
