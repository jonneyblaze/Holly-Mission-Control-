# Playwright Browser Automation — Shared Agent Guide

You have access to a **real Chromium browser** via Playwright running in Docker on Naboo (10.0.1.100). This lets you take screenshots, run tests, interact with pages, and capture user flows on BodyLytics.

## How It Works

Playwright scripts run inside Docker on Naboo using:
```
mcr.microsoft.com/playwright:v1.44.0-jammy
```

You do NOT open a browser yourself. You write/trigger Playwright scripts that run headless in Docker.

---

## 3 Ways to Use Playwright

### Method 1: Pre-built Flow Captures (Easiest)
Request screenshots of pre-defined flows via the Mission Control API:

```bash
curl -s -X POST "https://holly-mission-control-backend.vercel.app/api/capture-flow" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{INGEST_API_KEY}}" \
  -d '{
    "flow": "login,dashboard,courses",
    "viewport": "desktop",
    "requesting_agent": "YOUR_AGENT_ID"
  }'
```

**Available flows:**

| Category | Flows |
|----------|-------|
| Auth | `login`, `signup`, `forgot-password` |
| Student | `dashboard`, `courses`, `course-detail`, `course-learning`, `ai-tutor`, `knowledge-base`, `certificates`, `profile`, `community`, `challenges`, `live-training`, `referrals`, `team-dashboard` |
| Admin | `admin-dashboard`, `admin-courses`, `admin-users`, `admin-blog`, `admin-analytics`, `admin-ai-usage` |
| Public | `homepage`, `pricing` |
| All | `all` (captures every flow) |

**Viewports:** `desktop` (1440x900), `mobile` (375x812), `both`

**Custom URLs** (any page, no pre-defined flow needed):
```json
{
  "urls": "/courses,/courses/body-language-101,/blog/latest-post",
  "viewport": "both",
  "requesting_agent": "YOUR_AGENT_ID"
}
```

The capture script runs on Naboo and posts screenshots (base64 PNG) back to `agent_activity` in Mission Control. You then retrieve them.

### Method 2: Direct Shell Command on Naboo (More Control)
If you have shell access on Naboo, run captures directly:

```bash
# Capture specific flows
CAPTURE_FLOW="login,signup,dashboard" \
VIEWPORT="desktop" \
REQUESTING_AGENT="bl-content" \
/mnt/user/appdata/scripts/run-capture.sh

# Capture specific URLs
CAPTURE_URLS="/courses,/blog,/pricing" \
VIEWPORT="both" \
REQUESTING_AGENT="bl-community" \
/mnt/user/appdata/scripts/run-capture.sh

# Capture everything
CAPTURE_FLOW="all" \
VIEWPORT="both" \
REQUESTING_AGENT="bl-qa" \
/mnt/user/appdata/scripts/run-capture.sh
```

Screenshots are saved to `/tmp/qa-screenshots/` AND posted to Mission Control.

### Method 3: Write a Custom Playwright Script (Full Power)
For anything the pre-built flows don't cover, write a custom Playwright `.mjs` script and run it in Docker on Naboo.

**Template:**
```javascript
#!/usr/bin/env node
import { chromium } from "playwright";
import fs from "fs";

const SITE = process.env.TEST_URL || "https://staging.bodylytics.coach";
const SCREENSHOTS_DIR = "/tmp/qa-screenshots";
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
  });
  const page = await context.newPage();

  try {
    // ---- Dismiss cookie banner (always do this first) ----
    await page.goto(SITE);
    try {
      const cookieBtn = await page.waitForSelector(
        'button:has-text("Accept All"), button:has-text("Accept")',
        { timeout: 3000 }
      );
      if (cookieBtn) await cookieBtn.click();
      await page.waitForTimeout(500);
    } catch {}

    // ---- Login (if needed) ----
    const email = process.env.TEST_EMAIL;
    const password = process.env.TEST_PASSWORD;
    if (email && password) {
      await page.goto(`${SITE}/login`);
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
    }

    // ---- YOUR CUSTOM LOGIC HERE ----

    // Example: Screenshot a specific page
    await page.goto(`${SITE}/courses`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/courses.png`, fullPage: true });

    // Example: Click something and screenshot
    await page.click('a[href*="/courses/"]');
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/course-detail.png`, fullPage: true });

    // Example: Fill a form
    await page.fill('input[placeholder="Search"]', "body language");
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/search-results.png`, fullPage: true });

    // Example: Check for elements
    const hasError = await page.locator('.error-message').count();
    if (hasError > 0) {
      console.log("ERROR FOUND:", await page.locator('.error-message').textContent());
    }

    console.log("Done! Screenshots saved to", SCREENSHOTS_DIR);
  } catch (err) {
    console.error("Script failed:", err.message);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/error.png` });
  } finally {
    await browser.close();
  }
})();
```

**Run it on Naboo:**
```bash
docker run --rm \
  --name custom-playwright-run \
  --network host \
  -v "/path/to/your-script.mjs:/tests/script.mjs:ro" \
  -v "/tmp/qa-screenshots:/tmp/qa-screenshots" \
  -e "TEST_URL=https://staging.bodylytics.coach" \
  -e "TEST_EMAIL=bl-qa@bodylytics.coach" \
  -e "TEST_PASSWORD=BL-Qa!2026#Stag1ng" \
  mcr.microsoft.com/playwright:v1.44.0-jammy \
  bash -c "cd /tmp && cp /tests/script.mjs . && npm i --no-save playwright@1.44.0 2>/dev/null && node script.mjs"
```

---

## Common Playwright Patterns

### Dismiss Cookie Banner (ALWAYS do this)
```javascript
try {
  const btn = await page.waitForSelector(
    'button:has-text("Accept All"), button:has-text("Accept")',
    { timeout: 3000 }
  );
  if (btn) await btn.click();
  await page.waitForTimeout(500);
} catch {} // Ignore if no banner
```

### Login
```javascript
await page.goto(`${SITE}/login`);
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL("**/dashboard**", { timeout: 10000 });
```

### Wait for Page Load
```javascript
await page.waitForLoadState("networkidle"); // Wait for all network requests to finish
await page.waitForTimeout(1000);            // Extra safety buffer
```

### Screenshot
```javascript
// Visible viewport only
await page.screenshot({ path: "/tmp/qa-screenshots/name.png" });

// Full page (scrolls entire page)
await page.screenshot({ path: "/tmp/qa-screenshots/name.png", fullPage: true });

// Specific element only
await page.locator(".hero-section").screenshot({ path: "/tmp/qa-screenshots/hero.png" });
```

### Click Elements
```javascript
await page.click('button:has-text("Start Course")');         // By text
await page.click('a[href="/courses"]');                       // By href
await page.click('[data-testid="enroll-button"]');            // By test ID
await page.click('.card >> nth=0');                            // First card
```

### Fill Forms
```javascript
await page.fill('input[name="email"]', "test@example.com");
await page.fill('textarea[name="message"]', "Hello world");
await page.selectOption('select[name="country"]', "NL");
await page.check('input[type="checkbox"]');
```

### Check Elements Exist
```javascript
const count = await page.locator('.course-card').count();
const isVisible = await page.locator('h1').isVisible();
const text = await page.locator('.title').textContent();
```

### Navigate and Extract Links
```javascript
const links = await page.$$eval('a[href]', (els) => els.map(el => el.href));
const allNavLinks = await page.$$eval('nav a', (els) =>
  els.map(el => ({ text: el.textContent.trim(), href: el.href }))
);
```

### Monitor Console Errors
```javascript
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
// ... run your test ...
if (errors.length > 0) console.log("Console errors:", errors);
```

### Monitor Network Failures
```javascript
const failures = [];
page.on("requestfailed", (req) => {
  failures.push({ url: req.url(), error: req.failure()?.errorText });
});
```

### Mobile Viewport
```javascript
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  isMobile: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)"
});
```

### Check for Bad Copy
```javascript
const BAD_PATTERNS = [
  /lorem ipsum/i, /placeholder/i, /TODO/i, /FIXME/i,
  /\[object Object\]/, /undefined/, /NaN(?![a-z])/,
  /example\.com/i, /test@test/i, /asdf/i
];
const bodyText = await page.locator("body").textContent();
for (const pattern of BAD_PATTERNS) {
  if (pattern.test(bodyText)) {
    console.log(`BAD COPY FOUND: ${pattern}`);
  }
}
```

---

## Posting Results to Mission Control

After your script runs, post findings to Mission Control:

```javascript
async function postToMC(data) {
  await fetch(MC_INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MC_API_KEY}`,
    },
    body: JSON.stringify(data),
  });
}

// Post a report
await postToMC({
  agent_id: "YOUR_AGENT_ID",
  activity_type: "report",
  title: "Custom QA Check: Course Enrollment Flow",
  summary: "Tested enrollment on 5 courses. 1 failed (timeout on payment page).",
  full_content: "# Enrollment Test Report\n\n## Results\n...",
  workflow: "custom-qa-check",
  metadata: { tests_run: 5, passed: 4, failed: 1 }
});

// Post screenshots
const fs = await import("fs");
const screenshots = [];
for (const file of fs.readdirSync("/tmp/qa-screenshots")) {
  if (!file.endsWith(".png")) continue;
  const data = fs.readFileSync(`/tmp/qa-screenshots/${file}`);
  screenshots.push({
    name: file.replace(".png", ""),
    base64: data.toString("base64"),
    size_bytes: data.length,
  });
}

await postToMC({
  agent_id: "YOUR_AGENT_ID",
  activity_type: "report",
  title: `Screenshots: ${screenshots.length} captures`,
  summary: `Captured ${screenshots.length} screenshots`,
  full_content: "Screenshots from browser capture run.",
  workflow: "flow-capture",
  metadata: { screenshots, screenshot_count: screenshots.length }
});
```

---

## Test Credentials (Staging Only)

```
URL:      https://staging.bodylytics.coach
Email:    bl-qa@bodylytics.coach
Password: BL-Qa!2026#Stag1ng
```

These credentials are stored in `/mnt/user/appdata/scripts/qa-env.sh` on Naboo. The Docker wrappers load them automatically. **NEVER use these on production.**

---

## Existing Automation (Already Running)

| What | Script | Schedule | Scope |
|------|--------|----------|-------|
| Full QA Suite | `run-qa.sh` → `qa-browser-tests.mjs` | Every 2 hours (cron) | 55+ tests: UI, auth, student, payment, links, health |
| Flow Capture | `run-capture.sh` → `capture-flow.mjs` | On-demand (API or shell) | 25+ pre-defined flows with step-by-step screenshots |
| HTTP Smoke | `/api/smoke-test` | On-demand (API call) | 8 endpoint checks, no browser |

All scripts live in `/mnt/user/appdata/scripts/` on Naboo.

---

## Important Rules

1. **Always dismiss the cookie banner** before doing anything else
2. **Always use staging** (`staging.bodylytics.coach`) — never run automated tests against production
3. **Wrap navigation in try/catch** — pages can timeout, elements can be missing
4. **Use `waitForLoadState("networkidle")`** before taking screenshots
5. **Screenshots go in `/tmp/qa-screenshots/`** — the Docker wrapper expects this path
6. **Post results to Mission Control** using the ingest API so other agents and Sean can see them
7. **Test credentials are staging-only** — they have access to all courses and admin features
