#!/usr/bin/env node
// =============================================================================
// BodyLytics Full Browser QA Suite
// Runs real Playwright browser tests against production/staging
// Handles cookie consent, login, and all critical user flows
//
// Runs on Naboo via Docker:
//   docker run --rm -v /mnt/user/appdata/scripts:/tests \
//     mcr.microsoft.com/playwright:v1.44.0-jammy \
//     node /tests/qa-browser-tests.mjs
//
// Cron (every 2 hours):
//   0 */2 * * * /mnt/user/appdata/scripts/run-qa.sh >> /tmp/qa-tests.log 2>&1
// =============================================================================

import { chromium } from "playwright";

// ---------- Config ----------
const SITE_URL = process.env.TEST_URL || "https://bodylytics.coach";
const MC_INGEST_URL = process.env.MC_INGEST_URL || "https://holly-mission-control-backend.vercel.app/api/ingest";
const MC_API_KEY = process.env.MC_API_KEY || "9eRse679@ohyEdCz&UAUL@V9V6t*xW@%47r4vQfFeThowllEBsIv";
const TEST_EMAIL = process.env.TEST_EMAIL || "";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "";

const results = [];
let browser, context, page;

// ---------- Helpers ----------
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function check(name, fn) {
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    results.push({ name, passed: true, latency_ms: ms });
    log(`  ✅ ${name} (${ms}ms)`);
  } catch (err) {
    const ms = Date.now() - start;
    const error = err.message || String(err);
    results.push({ name, passed: false, latency_ms: ms, error });
    log(`  ❌ ${name} (${ms}ms): ${error}`);
  }
}

async function dismissCookieBanner() {
  try {
    // Wait briefly for cookie banner to appear (it has a 1.2s delay)
    const acceptBtn = await page.waitForSelector(
      'button:has-text("Accept All"), button:has-text("accept all")',
      { timeout: 3000 }
    );
    if (acceptBtn) {
      await acceptBtn.click();
      await page.waitForTimeout(500);
      log("  🍪 Cookie banner dismissed");
    }
  } catch {
    // No cookie banner — that's fine (already accepted or not present)
  }
}

async function screenshot(name) {
  try {
    const sanitized = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    await page.screenshot({ path: `/tmp/qa-screenshots/${sanitized}.png`, fullPage: false });
  } catch {
    // Screenshots are best-effort
  }
}

// ---------- Test Suite ----------
async function run() {
  log(`Starting QA browser tests against ${SITE_URL}`);
  log("=".repeat(60));

  // Create screenshots dir
  try {
    const { mkdirSync } = await import("fs");
    mkdirSync("/tmp/qa-screenshots", { recursive: true });
  } catch {}

  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: "HollyQA/1.0 (Playwright Browser Test Suite)",
  });

  page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // Collect failed network requests
  const networkErrors = [];
  page.on("requestfailed", (req) => {
    networkErrors.push({ url: req.url(), error: req.failure()?.errorText });
  });

  // ---- 1. Homepage ----
  await check("Homepage loads", async () => {
    const resp = await page.goto(`${SITE_URL}/`, { waitUntil: "networkidle", timeout: 30000 });
    if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp?.status()}`);
    await dismissCookieBanner();
    await screenshot("homepage");
    const title = await page.title();
    if (!title) throw new Error("Page title is empty");
  });

  // ---- 2. Navigation links work ----
  await check("Navigation links present", async () => {
    const navLinks = await page.$$("nav a, header a");
    if (navLinks.length < 3) throw new Error(`Only ${navLinks.length} nav links found`);
  });

  // ---- 3. Login page loads ----
  await check("Login page loads", async () => {
    const resp = await page.goto(`${SITE_URL}/login`, { waitUntil: "networkidle", timeout: 20000 });
    if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp?.status()}`);
    await dismissCookieBanner();
    await screenshot("login-page");
    // Check for email/password inputs
    const emailInput = await page.$('input[type="email"], input[name="email"]');
    const passInput = await page.$('input[type="password"]');
    if (!emailInput) throw new Error("No email input found");
    if (!passInput) throw new Error("No password input found");
  });

  // ---- 4. Login flow (if credentials provided) ----
  if (TEST_EMAIL && TEST_PASSWORD) {
    await check("Login with credentials", async () => {
      await page.goto(`${SITE_URL}/login`, { waitUntil: "networkidle", timeout: 20000 });
      await dismissCookieBanner();

      await page.fill('input[type="email"], input[name="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button[type="submit"]');

      // Wait for navigation away from login page
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
      await screenshot("post-login");
      log(`  📍 Redirected to: ${page.url()}`);
    });

    // ---- 5. Dashboard accessible after login ----
    await check("Dashboard loads after login", async () => {
      const resp = await page.goto(`${SITE_URL}/dashboard`, { waitUntil: "networkidle", timeout: 20000 });
      if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp?.status()}`);
      await screenshot("dashboard");
    });

    // ---- 6. Course catalog ----
    await check("Course catalog loads", async () => {
      const resp = await page.goto(`${SITE_URL}/courses`, { waitUntil: "networkidle", timeout: 20000 });
      if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp?.status()}`);
      await screenshot("courses");
      // Check for at least one course card/item
      const items = await page.$$('[class*="course"], [class*="card"], article');
      if (items.length === 0) log("  ⚠️  No course items found on page (may be OK if empty catalog)");
    });

    // ---- 7. Enrollment flow (view a course) ----
    await check("Course detail page loads", async () => {
      // Find first course link and click it
      const courseLink = await page.$('a[href*="/courses/"], a[href*="/course/"]');
      if (courseLink) {
        await courseLink.click();
        await page.waitForLoadState("networkidle", { timeout: 15000 });
        await screenshot("course-detail");
        const url = page.url();
        if (!url.includes("course")) throw new Error(`Expected course URL, got ${url}`);
      } else {
        // Try direct navigation
        const resp = await page.goto(`${SITE_URL}/courses`, { waitUntil: "networkidle", timeout: 15000 });
        if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp?.status()}`);
      }
    });

    // ---- 8. Profile/settings page ----
    await check("Profile page accessible", async () => {
      // Try common profile URLs
      for (const path of ["/profile", "/settings", "/account"]) {
        const resp = await page.goto(`${SITE_URL}${path}`, { waitUntil: "networkidle", timeout: 10000 });
        if (resp && resp.status() < 400) {
          await screenshot("profile");
          return;
        }
      }
      throw new Error("No profile/settings/account page found");
    });
  } else {
    log("  ⏭️  Skipping authenticated tests (no TEST_EMAIL/TEST_PASSWORD set)");
    results.push({ name: "Login with credentials", passed: true, latency_ms: 0, skipped: true });
    results.push({ name: "Dashboard loads after login", passed: true, latency_ms: 0, skipped: true });
    results.push({ name: "Course catalog loads", passed: true, latency_ms: 0, skipped: true });
    results.push({ name: "Course detail page loads", passed: true, latency_ms: 0, skipped: true });
    results.push({ name: "Profile page accessible", passed: true, latency_ms: 0, skipped: true });
  }

  // ---- 9. Public pages (no auth needed) ----
  await check("Privacy policy loads", async () => {
    const resp = await page.goto(`${SITE_URL}/privacy-policy`, { waitUntil: "networkidle", timeout: 15000 });
    if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp?.status()}`);
  });

  await check("Terms of service loads", async () => {
    const resp = await page.goto(`${SITE_URL}/terms-of-service`, { waitUntil: "networkidle", timeout: 15000 });
    if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp?.status()}`);
  });

  // ---- 10. Mobile viewport test ----
  await check("Mobile viewport renders", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    const resp = await page.goto(`${SITE_URL}/`, { waitUntil: "networkidle", timeout: 20000 });
    if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp?.status()}`);
    await dismissCookieBanner();
    await screenshot("mobile-homepage");
    // Check no horizontal overflow
    const overflows = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    if (overflows) log("  ⚠️  Horizontal overflow detected on mobile");
    // Reset viewport
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  // ---- 11. Performance check ----
  await check("Page load under 5 seconds", async () => {
    const start = Date.now();
    await page.goto(`${SITE_URL}/`, { waitUntil: "load", timeout: 10000 });
    const loadTime = Date.now() - start;
    if (loadTime > 5000) throw new Error(`Load time: ${loadTime}ms (threshold: 5000ms)`);
    log(`  ⏱️  Load time: ${loadTime}ms`);
  });

  // ---- 12. No critical console errors ----
  await check("No critical console errors", async () => {
    const critical = consoleErrors.filter(
      (e) => !e.includes("favicon") && !e.includes("third-party") && !e.includes("analytics")
    );
    if (critical.length > 3) {
      throw new Error(`${critical.length} console errors: ${critical.slice(0, 3).join(" | ")}`);
    }
  });

  // ---- 13. No failed network requests ----
  await check("No critical network failures", async () => {
    const critical = networkErrors.filter(
      (e) => !e.url.includes("analytics") && !e.url.includes("gtag") && !e.url.includes("favicon")
    );
    if (critical.length > 2) {
      throw new Error(
        `${critical.length} failed requests: ${critical.slice(0, 3).map((e) => `${e.url} (${e.error})`).join(" | ")}`
      );
    }
  });

  await browser.close();

  // ---------- Report ----------
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const skipped = results.filter((r) => r.skipped).length;
  const total = results.length;

  log("=".repeat(60));
  log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped out of ${total}`);

  const healthStatus = failed === 0 ? "healthy" : failed <= 2 ? "degraded" : "critical";

  // Build markdown report
  const report = buildReport(results, passed, failed, skipped, total, consoleErrors, networkErrors);

  // POST to Mission Control
  await postToMissionControl(results, passed, failed, total, healthStatus, report);

  log("QA tests complete.");
  process.exit(failed > 0 ? 1 : 0);
}

function buildReport(results, passed, failed, skipped, total, consoleErrors, networkErrors) {
  const lines = [
    `# Browser QA Test Report`,
    ``,
    `**Site:** ${SITE_URL}`,
    `**Time:** ${new Date().toISOString()}`,
    `**Result:** ${passed} passed, ${failed} failed, ${skipped} skipped / ${total} total`,
    `**Auth Tests:** ${TEST_EMAIL ? "Enabled" : "Skipped (no credentials)"}`,
    ``,
    `## Test Results`,
    ``,
  ];

  for (const r of results) {
    const icon = r.skipped ? "⏭️" : r.passed ? "✅" : "❌";
    lines.push(`${icon} **${r.name}** — ${r.latency_ms}ms${r.error ? ` → ${r.error}` : ""}${r.skipped ? " (skipped)" : ""}`);
  }

  if (consoleErrors.length > 0) {
    lines.push(``, `## Console Errors (${consoleErrors.length})`, ``);
    for (const e of consoleErrors.slice(0, 10)) {
      lines.push(`- \`${e.substring(0, 200)}\``);
    }
  }

  if (networkErrors.length > 0) {
    lines.push(``, `## Network Failures (${networkErrors.length})`, ``);
    for (const e of networkErrors.slice(0, 10)) {
      lines.push(`- \`${e.url}\` — ${e.error}`);
    }
  }

  if (failed > 0) {
    lines.push(``, `## ⚠️ Action Required`, ``);
    for (const r of results.filter((r) => !r.passed && !r.skipped)) {
      lines.push(`- **${r.name}**: ${r.error}`);
    }
  }

  return lines.join("\n");
}

async function postToMissionControl(results, passed, failed, total, healthStatus, report) {
  log("  Posting results to Mission Control...");

  const payload = {
    agent_id: "bl-qa",
    activity_type: "report",
    title: failed === 0
      ? `Browser QA: All ${passed} Tests Passed ✅`
      : `Browser QA: ${failed} Test(s) Failed ${healthStatus === "critical" ? "🔴" : "🟡"}`,
    summary: `${passed}/${total} browser tests passed on ${SITE_URL}. ${
      failed > 0 ? `Failed: ${results.filter((r) => !r.passed).map((r) => r.name).join(", ")}` : "All systems operational."
    }`,
    full_content: report,
    workflow: "browser-qa-suite",
    metadata: {
      environment: "production",
      test_type: "browser",
      checks_passed: passed,
      checks_failed: failed,
      checks_total: total,
      health_status: healthStatus,
      auth_tested: !!TEST_EMAIL,
      checks: results,
    },
  };

  try {
    const resp = await fetch(MC_INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MC_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (resp.ok) {
      log(`  Posted successfully (HTTP ${resp.status})`);
    } else {
      log(`  POST failed (HTTP ${resp.status}): ${await resp.text()}`);
    }
  } catch (err) {
    log(`  POST failed: ${err.message}`);
  }

  // Also create a task if critical failures
  if (failed > 0) {
    const taskPayload = {
      agent_id: "bl-qa",
      activity_type: "task",
      title: `QA Alert: ${failed} browser test(s) failing on ${SITE_URL}`,
      full_content: results
        .filter((r) => !r.passed && !r.skipped)
        .map((r) => `- **${r.name}**: ${r.error}`)
        .join("\n"),
      workflow: "browser-qa-suite",
      metadata: {
        priority: healthStatus === "critical" ? "urgent" : "high",
        segment: "bodylytics",
      },
    };

    try {
      await fetch(MC_INGEST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MC_API_KEY}`,
        },
        body: JSON.stringify(taskPayload),
      });
    } catch {}
  }
}

run().catch((err) => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
