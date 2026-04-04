#!/bin/bash
# =============================================================================
# BodyLytics Full Browser QA Runner
# Runs Playwright browser tests inside Docker on Naboo
#
# Install:
#   scp scripts/run-qa.sh scripts/qa-browser-tests.mjs root@10.0.1.100:/mnt/user/appdata/scripts/
#   chmod +x /mnt/user/appdata/scripts/run-qa.sh
#
# Cron (every 2 hours):
#   0 */2 * * * /mnt/user/appdata/scripts/run-qa.sh >> /tmp/qa-tests.log 2>&1
# =============================================================================

set -euo pipefail

echo "[$(date -Iseconds)] Starting FULL QA browser suite..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load credentials from env file (if exists)
[ -f "${SCRIPT_DIR}/qa-env.sh" ] && source "${SCRIPT_DIR}/qa-env.sh"
SCREENSHOTS_DIR="/tmp/qa-screenshots"
rm -rf "$SCREENSHOTS_DIR" && mkdir -p "$SCREENSHOTS_DIR"

# ---------- Config (override via env or edit defaults) ----------
TEST_URL="${TEST_URL:-https://bodylytics.coach}"
MC_INGEST_URL="${MC_INGEST_URL:-https://holly-mission-control-backend.vercel.app/api/ingest}"
MC_API_KEY="${MC_API_KEY:-9eRse679@ohyEdCz&UAUL@V9V6t*xW@%47r4vQfFeThowllEBsIv}"

# Student test account (set these to enable auth + student feature tests)
TEST_EMAIL="${TEST_EMAIL:-}"
TEST_PASSWORD="${TEST_PASSWORD:-}"

# Admin test account (set these to enable admin feature tests)
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

# ---------- Run tests ----------
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
  -e "ADMIN_EMAIL=${ADMIN_EMAIL}" \
  -e "ADMIN_PASSWORD=${ADMIN_PASSWORD}" \
  mcr.microsoft.com/playwright:v1.44.0-jammy \
  bash -c "cd /tmp && cp /tests/qa-browser-tests.mjs . && npm i --no-save playwright@1.44.0 2>/dev/null && node qa-browser-tests.mjs"

EXIT_CODE=$?

# ---------- Upload screenshots to Mission Control ----------
SCREENSHOT_COUNT=$(ls -1 "$SCREENSHOTS_DIR"/*.png 2>/dev/null | wc -l || echo "0")
echo "[$(date -Iseconds)] $SCREENSHOT_COUNT screenshots captured"

if [ "$SCREENSHOT_COUNT" -gt 0 ]; then
  # Create a combined report with base64 screenshots
  SCREENSHOT_JSON="["
  FIRST=true
  for img in "$SCREENSHOTS_DIR"/*.png; do
    [ ! -f "$img" ] && continue
    BASENAME=$(basename "$img" .png)
    B64=$(base64 -w 0 "$img" 2>/dev/null || base64 "$img" 2>/dev/null)
    SIZE=$(stat -c%s "$img" 2>/dev/null || stat -f%z "$img" 2>/dev/null || echo "0")

    if [ "$FIRST" = true ]; then FIRST=false; else SCREENSHOT_JSON+=","; fi
    SCREENSHOT_JSON+="{\"name\":\"${BASENAME}\",\"size_bytes\":${SIZE},\"base64\":\"${B64}\"}"
  done
  SCREENSHOT_JSON+="]"

  # POST screenshots as a separate activity entry
  PAYLOAD=$(jq -n \
    --arg agent_id "bl-qa" \
    --arg activity_type "report" \
    --arg title "QA Screenshots — $(date +%Y-%m-%d %H:%M)" \
    --arg summary "$SCREENSHOT_COUNT screenshots captured during QA run" \
    --arg workflow "full-qa-suite" \
    --argjson screenshots "$SCREENSHOT_JSON" \
    '{
      agent_id: $agent_id,
      activity_type: $activity_type,
      title: $title,
      summary: $summary,
      workflow: $workflow,
      full_content: "Screenshots from the latest QA browser test run. Each screenshot is base64-encoded PNG.",
      metadata: {
        screenshot_count: ($screenshots | length),
        screenshots: $screenshots,
        test_url: "'"$TEST_URL"'",
        captured_at: (now | todate)
      }
    }')

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$MC_INGEST_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${MC_API_KEY}" \
    -d "$PAYLOAD" 2>/dev/null || echo "000")

  echo "[$(date -Iseconds)] Screenshots posted to Mission Control (HTTP $HTTP_CODE)"
fi

if [ $EXIT_CODE -eq 0 ]; then
  echo "[$(date -Iseconds)] QA suite: ALL PASSED ✅"
else
  echo "[$(date -Iseconds)] QA suite: FAILURES DETECTED ❌ (exit code $EXIT_CODE)"
fi
