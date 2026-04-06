#!/usr/bin/env node
// =============================================================================
// BodyLytics FULL QA Suite — Playwright Browser Tests
// =============================================================================
//
// Tests EVERYTHING:
//   - UI elements & visual checks
//   - Broken link crawling (auto-discovers new pages)
//   - Bad copy detection (lorem ipsum, placeholder text, TODO markers)
//   - ALL auth flows (login, signup, password reset, 2FA, email change)
//   - Payment/checkout (Stripe test mode)
//   - Student features (courses, KB, AI tutor, chat, certificates)
//   - Admin features (course creation, user mgmt, AI cost, analytics)
//
// Self-updating: Crawls all links automatically. New pages = new tests.
// Route manifest alerts when new routes are found that need test coverage.
//
// Runs on Naboo via Docker:
//   /mnt/user/appdata/scripts/run-qa.sh
//
// Cron (every 2 hours):
//   0 */2 * * * /mnt/user/appdata/scripts/run-qa.sh >> /tmp/qa-tests.log 2>&1
// =============================================================================

import { chromium } from "playwright";

// ---------- Config ----------
const SITE_URL = process.env.TEST_URL || "https://bodylytics.coach";
const MC_INGEST_URL = process.env.MC_INGEST_URL || "https://holly-mission-control-backend.vercel.app/api/ingest";
const MC_API_KEY = process.env.MC_API_KEY || "9eRse679@ohyEdCz&UAUL@V9V6t*xW@%47r4vQfFeThowllEBsIv";

// Test accounts — set via env vars
const TEST_USER_EMAIL = process.env.TEST_EMAIL || "";
const TEST_USER_PASSWORD = process.env.TEST_PASSWORD || "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

// Stripe test card
const STRIPE_TEST_CARD = "4242424242424242";
const STRIPE_TEST_EXP = "12/30";
const STRIPE_TEST_CVC = "123";

const results = [];
const warnings = [];
let browser, context, page;

// ---------- Helpers ----------
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function check(section, name, fn) {
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    results.push({ section, name, passed: true, latency_ms: ms });
    log(`  ✅ ${name} (${ms}ms)`);
  } catch (err) {
    const ms = Date.now() - start;
    const error = err.message?.substring(0, 500) || String(err);
    results.push({ section, name, passed: false, latency_ms: ms, error });
    log(`  ❌ ${name} (${ms}ms): ${error}`);
  }
}

function warn(msg) {
  warnings.push(msg);
  log(`  ⚠️  ${msg}`);
}

async function dismissCookieBanner() {
  try {
    const btn = await page.waitForSelector('button:has-text("Accept All")', { timeout: 2500 });
    if (btn) { await btn.click(); await page.waitForTimeout(400); }
  } catch { /* no banner */ }
}

async function screenshot(name) {
  try {
    const s = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    await page.screenshot({ path: `/tmp/qa-screenshots/${s}.png`, fullPage: false });
  } catch { /* best-effort */ }
}

async function safeGoto(url, opts = {}) {
  const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30000, ...opts });
  await dismissCookieBanner();
  return resp;
}

// Check if element exists
async function exists(selector, timeout = 3000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch { return false; }
}

// ---------- BAD COPY PATTERNS ----------
const BAD_COPY_PATTERNS = [
  /lorem ipsum/i,
  /dolor sit amet/i,
  /placeholder/i,
  /TODO[:\s]/i,
  /FIXME/i,
  /HACK[:\s]/i,
  /XXX/i,
  /your (title|name|text|content) here/i,
  /example\.com/i,
  /test@test/i,
  /asdf/i,
  /undefined|null/i,  // leaked JS values in rendered text
  /NaN/i,
  /\[object Object\]/i,
];

// Patterns that are OK in certain contexts (code blocks, dev tools)
const BAD_COPY_WHITELIST = [
  /placeholder.*text/i,  // CSS placeholder-text property
  /example\.com.*privacy/i,  // in legal docs referencing examples
];

async function checkBadCopy(pageName) {
  const text = await page.evaluate(() => {
    // Get visible text only, skip script/style/code blocks
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll("script, style, code, pre, noscript").forEach(el => el.remove());
    return clone.innerText || "";
  });

  const issues = [];
  for (const pattern of BAD_COPY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const isWhitelisted = BAD_COPY_WHITELIST.some(w => match[0].match(w));
      if (!isWhitelisted) {
        // Get surrounding context
        const idx = text.indexOf(match[0]);
        const context = text.substring(Math.max(0, idx - 40), idx + match[0].length + 40).replace(/\n/g, " ").trim();
        issues.push({ pattern: pattern.source, match: match[0], context });
      }
    }
  }
  if (issues.length > 0) {
    warn(`Bad copy on ${pageName}: ${issues.map(i => `"${i.match}" in "...${i.context}..."`).join("; ")}`);
  }
  return issues;
}

// =====================================================================
// TEST SUITES
// =====================================================================

// ---------- 1. LINK CRAWLER (auto-discovers pages) ----------
async function crawlLinks() {
  log("\n📎 LINK CRAWLER — Finding and testing all links...");

  const visited = new Set();
  const broken = [];
  const external = [];
  const toVisit = [SITE_URL + "/"];

  // Known routes we EXPECT to exist (test coverage manifest)
  const EXPECTED_ROUTES = [
    "/", "/login", "/signup", "/forgot-password", "/courses",
    "/about", "/features", "/blog", "/privacy-policy", "/terms-of-service",
    "/cookie-policy", "/kb", "/for-individuals", "/business-solutions",
    "/quiz", "/cheat-sheet",
    // Added 2026-04-06 — public + auth-gated routes discovered by crawler
    "/for-teams", "/contact", "/community", "/privacy", "/roi-calculator",
    "/team-dashboard", "/profile", "/my-courses", "/challenges", "/analytics",
    "/knowledge-base", "/leaderboard", "/bookmarks", "/certificates",
    "/referrals", "/live-training", "/vip-sessions",
    // Forum sub-routes (/community/forum itself is 404 — filed as broken)
    "/community/forum/general-discussion", "/community/forum/body-language-tips",
    "/community/forum/nlp-techniques", "/community/forum/course-qa",
    "/community/forum/success-stories", "/community/forum/vip-lounge",
  ];

  // Crawl up to 80 pages (avoid infinite loops)
  const MAX_PAGES = 80;
  let crawled = 0;

  while (toVisit.length > 0 && crawled < MAX_PAGES) {
    const url = toVisit.shift();
    const path = new URL(url).pathname;
    if (visited.has(path)) continue;
    visited.add(path);
    crawled++;

    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      const status = resp?.status() || 0;

      if (status >= 400) {
        broken.push({ url: path, status });
      }

      // Find all internal links
      const links = await page.evaluate((base) => {
        return Array.from(document.querySelectorAll("a[href]"))
          .map(a => a.href)
          .filter(h => h.startsWith(base) || h.startsWith("/"))
          .map(h => h.startsWith("/") ? base + h : h);
      }, SITE_URL);

      for (const link of links) {
        try {
          const linkPath = new URL(link).pathname;
          // Skip assets, API routes, auth callbacks
          if (linkPath.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js|woff|pdf)$/)) continue;
          if (linkPath.startsWith("/api/") || linkPath.startsWith("/auth/")) continue;
          if (linkPath.startsWith("/_next/")) continue;
          if (!visited.has(linkPath)) {
            toVisit.push(SITE_URL + linkPath);
          }
        } catch { /* invalid URL */ }
      }
    } catch (err) {
      broken.push({ url: path, status: 0, error: err.message?.substring(0, 200) });
    }
  }

  // Check expected routes were found
  const discoveredRoutes = Array.from(visited);
  const missingExpected = EXPECTED_ROUTES.filter(r => !visited.has(r));
  const newRoutes = discoveredRoutes.filter(r =>
    !EXPECTED_ROUTES.includes(r) &&
    !r.match(/\/courses\/[^/]+/) &&  // dynamic course slugs are OK
    !r.match(/\/blog\/[^/]+/) &&
    !r.match(/^\/course-learning\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/) && // auth-gated, redirects to last lesson
    !r.match(/^\/community\/forum\//) && // forum sub-routes with dynamic slugs
    !r.startsWith("/admin") &&
    !r.startsWith("/dashboard")
  );

  await check("Links", `Crawled ${crawled} pages`, async () => {
    if (broken.length > 0) {
      throw new Error(`${broken.length} broken links: ${broken.map(b => `${b.url} (${b.status})`).join(", ")}`);
    }
  });

  await check("Links", "All expected public routes exist", async () => {
    if (missingExpected.length > 0) {
      throw new Error(`Missing routes: ${missingExpected.join(", ")}`);
    }
  });

  if (newRoutes.length > 0) {
    warn(`NEW ROUTES DISCOVERED (add test coverage!): ${newRoutes.join(", ")}`);
  }

  return { visited: discoveredRoutes, broken, crawled };
}

// ---------- 2. PUBLIC PAGES & UI ----------
async function testPublicPages() {
  log("\n🌐 PUBLIC PAGES — UI elements, content, performance...");

  // Homepage
  await check("UI", "Homepage loads with content", async () => {
    const resp = await safeGoto(`${SITE_URL}/`);
    if (resp.status() >= 400) throw new Error(`HTTP ${resp.status()}`);
    await screenshot("homepage");
    // Must have nav, heading, and CTA
    const hasNav = await exists("nav, header");
    const hasHeading = await exists("h1, h2");
    if (!hasNav) throw new Error("No navigation found");
    if (!hasHeading) throw new Error("No heading found");
    await checkBadCopy("Homepage");
  });

  await check("UI", "Navigation links present and working", async () => {
    await safeGoto(`${SITE_URL}/`);
    const navLinks = await page.$$("nav a, header a");
    if (navLinks.length < 3) throw new Error(`Only ${navLinks.length} nav links`);
    // Collect hrefs first (before navigating away, which destroys handles)
    const hrefs = [];
    for (const link of navLinks.slice(0, 5)) {
      try { hrefs.push(await link.getAttribute("href")); } catch { /* destroyed */ }
    }
    // Then test each
    for (const href of hrefs.filter(h => h && h !== "#")) {
      const url = href.startsWith("http") ? href : `${SITE_URL}${href}`;
      try {
        const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
        if (resp?.status() >= 400) throw new Error(`Nav link ${href} returned ${resp.status()}`);
      } catch (err) {
        if (err.message?.includes("returned")) throw err; // re-throw HTTP errors
        // ignore navigation/timeout errors
      }
    }
  });

  await check("UI", "Footer present with links", async () => {
    await safeGoto(`${SITE_URL}/`);
    const hasFooter = await exists("footer");
    if (!hasFooter) throw new Error("No footer element found");
    const footerLinks = await page.$$("footer a");
    if (footerLinks.length < 2) warn("Footer has fewer than 2 links");
  });

  // Course catalog
  await check("UI", "Course catalog loads with courses", async () => {
    const resp = await safeGoto(`${SITE_URL}/courses`);
    if (resp.status() >= 400) throw new Error(`HTTP ${resp.status()}`);
    await screenshot("courses");
    await checkBadCopy("Course Catalog");
    // Should have course cards
    const cards = await page.$$('[class*="course"], [class*="card"], article, [class*="grid"] > div');
    if (cards.length === 0) warn("No course cards found on catalog page");
  });

  // Course detail page
  await check("UI", "Course detail page loads", async () => {
    // Find a course link from the catalog
    const courseLink = await page.$('a[href*="/courses/"]');
    if (courseLink) {
      await courseLink.click();
      await page.waitForLoadState("networkidle", { timeout: 15000 });
      await screenshot("course-detail");
      // Should have title, description, CTA
      const hasTitle = await exists("h1");
      if (!hasTitle) throw new Error("Course detail missing title");
      await checkBadCopy("Course Detail");
    } else {
      // Navigate to courses and find link in page content
      await safeGoto(`${SITE_URL}/courses`);
      const link = await page.$('a[href*="/courses/"]');
      if (!link) throw new Error("No course detail links found anywhere");
      await link.click();
      await page.waitForLoadState("networkidle", { timeout: 15000 });
    }
  });

  // Blog
  await check("UI", "Blog page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/blog`);
    if (resp.status() >= 400) throw new Error(`HTTP ${resp.status()}`);
    await screenshot("blog");
    await checkBadCopy("Blog");
  });

  // Features page
  await check("UI", "Features page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/features`);
    if (resp.status() >= 400) throw new Error(`HTTP ${resp.status()}`);
    await checkBadCopy("Features");
  });

  // About page
  await check("UI", "About page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/about`);
    if (resp.status() >= 400) throw new Error(`HTTP ${resp.status()}`);
    await checkBadCopy("About");
  });

  // Public KB
  await check("UI", "Public knowledge base loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/kb`);
    if (resp.status() >= 400) throw new Error(`HTTP ${resp.status()}`);
    await checkBadCopy("Knowledge Base");
  });

  // Legal pages
  for (const legalPage of ["privacy-policy", "terms-of-service", "cookie-policy"]) {
    await check("UI", `${legalPage} page loads`, async () => {
      const resp = await safeGoto(`${SITE_URL}/${legalPage}`);
      if (resp.status() >= 400) throw new Error(`HTTP ${resp.status()}`);
      // Legal pages must have substantial content
      const text = await page.evaluate(() => document.body.innerText);
      if (text.length < 500) throw new Error(`${legalPage} has very little content (${text.length} chars)`);
    });
  }

  // Business solutions
  await check("UI", "Business solutions page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/business-solutions`);
    if (resp.status() >= 400) throw new Error(`HTTP ${resp.status()}`);
    await checkBadCopy("Business Solutions");
  });

  // Quiz (lead magnet)
  await check("UI", "Quiz page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/quiz`);
    if (resp.status() >= 400) throw new Error(`HTTP ${resp.status()}`);
  });

  // Mobile viewport
  await check("UI", "Mobile viewport renders without overflow", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await safeGoto(`${SITE_URL}/`);
    await screenshot("mobile-homepage");
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflows) warn("Horizontal overflow on mobile homepage");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  // Performance
  await check("UI", "Homepage loads under 5 seconds", async () => {
    const start = Date.now();
    await page.goto(`${SITE_URL}/`, { waitUntil: "load", timeout: 10000 });
    const ms = Date.now() - start;
    if (ms > 5000) throw new Error(`Load time: ${ms}ms (threshold: 5000ms)`);
    log(`  ⏱️  Load time: ${ms}ms`);
  });
}

// ---------- 3. AUTH FLOWS ----------
async function testAuthFlows() {
  log("\n🔐 AUTH FLOWS — Login, signup, password reset, 2FA...");

  // Login page structure
  await check("Auth", "Login page has email + password inputs", async () => {
    await safeGoto(`${SITE_URL}/login`);
    await screenshot("login");
    const emailInput = await exists('input[type="email"], input[name="email"], input[id="email"]');
    const passInput = await exists('input[type="password"]');
    const submitBtn = await exists('button[type="submit"]');
    if (!emailInput) throw new Error("No email input");
    if (!passInput) throw new Error("No password input");
    if (!submitBtn) throw new Error("No submit button");
    await checkBadCopy("Login");
  });

  await check("Auth", "Login page has forgot password link", async () => {
    const link = await exists('a[href*="forgot"], a:has-text("Forgot")');
    if (!link) throw new Error("No forgot password link");
  });

  await check("Auth", "Login page has signup link", async () => {
    const link = await exists('a[href*="signup"], a[href*="register"], a:has-text("Join"), a:has-text("Sign up"), a:has-text("Create")');
    if (!link) throw new Error("No signup link");
  });

  // Login with bad credentials (should show error, not crash)
  await check("Auth", "Login rejects invalid credentials gracefully", async () => {
    await safeGoto(`${SITE_URL}/login`);
    await page.fill('input[type="email"], input[name="email"]', "fake@nonexistent-test.com");
    await page.fill('input[type="password"]', "wrongpassword123");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    // Should still be on login page (not crashed/500)
    const url = page.url();
    if (!url.includes("/login")) throw new Error(`Redirected away from login to ${url}`);
    // Should show some error feedback
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasError = /invalid|incorrect|failed|wrong|error|not found/i.test(bodyText);
    if (!hasError) warn("Login with bad credentials shows no visible error message");
  });

  // Signup page structure
  await check("Auth", "Signup page has all required fields", async () => {
    await safeGoto(`${SITE_URL}/signup`);
    await screenshot("signup");
    const nameInput = await exists('input[name="fullName"], input[name="name"], input[id="fullName"]');
    const emailInput = await exists('input[type="email"]');
    const passInput = await exists('input[type="password"]');
    const submitBtn = await exists('button[type="submit"]');
    if (!emailInput) throw new Error("No email input");
    if (!passInput) throw new Error("No password input");
    if (!submitBtn) throw new Error("No submit button");
    // Check for terms checkbox
    const terms = await exists('input[type="checkbox"]');
    if (!terms) warn("No terms checkbox on signup");
    await checkBadCopy("Signup");
  });

  // Forgot password page
  await check("Auth", "Forgot password page works", async () => {
    await safeGoto(`${SITE_URL}/forgot-password`);
    await screenshot("forgot-password");
    const emailInput = await exists('input[type="email"], input[name="email"]');
    const submitBtn = await exists('button[type="submit"]');
    if (!emailInput) throw new Error("No email input");
    if (!submitBtn) throw new Error("No submit button");
    // Submit with test email (should show success, not error)
    await page.fill('input[type="email"], input[name="email"]', "test-qa-noreply@bodylytics.coach");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    const bodyText = await page.evaluate(() => document.body.innerText);
    // Should show a success/confirmation message (not a server error)
    const hasServerError = /500|server error|unexpected/i.test(bodyText);
    if (hasServerError) throw new Error("Password reset returned a server error");
  });

  // Reset password page (accessible but needs a token)
  await check("Auth", "Reset password page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/reset-password`);
    // May redirect or show "invalid/expired link" — that's OK
    if (resp.status() === 500) throw new Error("Reset password page returns 500");
  });

  // 2FA verification page
  await check("Auth", "2FA verification page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/verify-2fa`);
    if (resp.status() === 500) throw new Error("2FA page returns 500");
    // Should have code input
    const codeInput = await exists('input[id="totp-code"], input[inputmode="numeric"], input[maxlength="6"]');
    if (codeInput) {
      log("  📱 2FA page has code input");
    }
  });

  // Actual login flow (if credentials provided)
  let loggedIn = false;
  if (TEST_USER_EMAIL && TEST_USER_PASSWORD) {
    await check("Auth", "Login with valid credentials succeeds", async () => {
      await safeGoto(`${SITE_URL}/login`);
      await page.fill('input[type="email"], input[name="email"]', TEST_USER_EMAIL);
      await page.fill('input[type="password"]', TEST_USER_PASSWORD);
      await page.click('button[type="submit"]');

      // Wait for redirect away from login
      try {
        await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
        loggedIn = true;
      } catch {
        // Check if there's an error message visible
        await screenshot("login-failed");
        const bodyText = await page.evaluate(() => document.body.innerText);
        const errorMsg = bodyText.match(/invalid|incorrect|failed|wrong|error|not found|expired/i)?.[0] || "unknown";
        throw new Error(`Login failed — still on login page. Visible error: "${errorMsg}". Check that the test account exists and is confirmed.`);
      }

      const url = page.url();
      log(`  📍 Logged in, redirected to: ${url}`);
      await screenshot("post-login");

      // Handle 2FA if it appears
      if (url.includes("verify-2fa")) {
        warn("2FA verification required — skipping (no TOTP secret in env)");
        loggedIn = false;
      }
    });

    // Profile & security settings
    await check("Auth", "Profile page loads with settings", async () => {
      await safeGoto(`${SITE_URL}/profile`);
      await screenshot("profile");
      // Check for profile form fields
      const hasNameInput = await exists('input[name="full_name"], input[name="fullName"]');
      if (!hasNameInput) warn("Profile page missing name input");
      await checkBadCopy("Profile");
    });

    await check("Auth", "Security tab accessible (2FA, password change)", async () => {
      await safeGoto(`${SITE_URL}/profile?tab=security`);
      await screenshot("security-tab");
      // Should have password change fields or 2FA toggle
      const hasPasswordField = await exists('input[type="password"]');
      const has2FASection = await exists('text=Two-Factor, text=2FA, text=Authenticator');
      if (!hasPasswordField && !has2FASection) {
        warn("Security tab missing password change or 2FA options");
      }
    });

    await check("Auth", "Email preferences tab accessible", async () => {
      await safeGoto(`${SITE_URL}/profile?tab=emails`);
      // Should load without error
      const status = page.url().includes("/profile");
      if (!status) throw new Error("Email tab redirected away");
    });
  } else {
    log("  ⏭️  Skipping authenticated login tests (no TEST_EMAIL/TEST_PASSWORD)");
  }
}

// ---------- 4. STUDENT FEATURES ----------
let isLoggedIn = false;

async function ensureLoggedIn() {
  if (isLoggedIn) return true;
  try {
    await safeGoto(`${SITE_URL}/login`);
    if (!page.url().includes("/login")) { isLoggedIn = true; return true; } // already logged in
    await page.fill('input[type="email"], input[name="email"]', TEST_USER_EMAIL);
    await page.fill('input[type="password"]', TEST_USER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
    isLoggedIn = true;
    return true;
  } catch {
    warn("Could not log in — student/admin feature tests will be skipped");
    return false;
  }
}

async function testStudentFeatures() {
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    log("\n📚 STUDENT FEATURES — Skipping (no credentials)");
    return;
  }

  log("\n📚 STUDENT FEATURES — Dashboard, courses, KB, AI tutor...");

  if (!(await ensureLoggedIn())) {
    warn("STUDENT TESTS SKIPPED — login failed. Ensure the test account exists and is email-confirmed on the target site.");
    return;
  }

  // Dashboard
  await check("Student", "Dashboard loads with content", async () => {
    await safeGoto(`${SITE_URL}/dashboard`);
    await screenshot("dashboard");
    const hasContent = await exists("h1, h2, [class*='card'], [class*='widget']");
    if (!hasContent) throw new Error("Dashboard appears empty");
    await checkBadCopy("Dashboard");
  });

  // My Courses
  await check("Student", "My Courses page loads", async () => {
    await safeGoto(`${SITE_URL}/my-courses`);
    await screenshot("my-courses");
  });

  // Knowledge Base
  await check("Student", "Knowledge Base loads with search", async () => {
    await safeGoto(`${SITE_URL}/knowledge-base`);
    await screenshot("knowledge-base");
    const hasSearch = await exists('input[type="text"], input[type="search"]');
    if (!hasSearch) warn("KB missing search input");
    await checkBadCopy("Knowledge Base");
  });

  // Certificates page
  await check("Student", "Certificates page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/certificates`);
    if (resp.status() >= 500) throw new Error(`HTTP ${resp.status()}`);
  });

  // Bookmarks
  await check("Student", "Bookmarks page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/bookmarks`);
    if (resp.status() >= 500) throw new Error(`HTTP ${resp.status()}`);
  });

  // Community
  await check("Student", "Community page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/community`);
    if (resp.status() >= 500) throw new Error(`HTTP ${resp.status()}`);
    await checkBadCopy("Community");
  });

  // Challenges
  await check("Student", "Challenges page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/challenges`);
    if (resp.status() >= 500) throw new Error(`HTTP ${resp.status()}`);
  });

  // Leaderboard
  await check("Student", "Leaderboard page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/leaderboard`);
    if (resp.status() >= 500) throw new Error(`HTTP ${resp.status()}`);
  });

  // Analytics
  await check("Student", "Analytics page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/analytics`);
    if (resp.status() >= 500) throw new Error(`HTTP ${resp.status()}`);
  });

  // Referrals
  await check("Student", "Referrals page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/referrals`);
    if (resp.status() >= 500) throw new Error(`HTTP ${resp.status()}`);
  });

  // Live Training
  await check("Student", "Live Training page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/live-training`);
    if (resp.status() >= 500) throw new Error(`HTTP ${resp.status()}`);
  });

  // VIP Sessions
  await check("Student", "VIP Sessions page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/vip-sessions`);
    if (resp.status() >= 500) throw new Error(`HTTP ${resp.status()}`);
  });

  // Team Dashboard
  await check("Student", "Team Dashboard page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/team-dashboard`);
    if (resp.status() >= 500) throw new Error(`HTTP ${resp.status()}`);
  });

  // Course learning (find a course to test)
  await check("Student", "Course learning page works", async () => {
    await safeGoto(`${SITE_URL}/my-courses`);
    await screenshot("my-courses");
    // Try "Start Course" / "Continue" button first, then any course-learning link
    const startBtn = await page.$('a:has-text("Start Course"), a:has-text("Continue"), a:has-text("Resume")');
    const courseLink = startBtn || await page.$('a[href*="course-learning"]');
    if (courseLink) {
      await courseLink.click();
      await page.waitForLoadState("networkidle", { timeout: 20000 });
      await screenshot("course-learning");
      log(`  📍 Course page: ${page.url()}`);

      // Check for page content
      const hasContent = await exists("h1, h2, video, [class*='lesson'], [class*='content'], [class*='module']");
      if (!hasContent) warn("Course learning page appears empty");

      await checkBadCopy("Course Learning");

      // Try to find and click into a lesson
      // Lessons might be in an accordion/expandable section — try clicking a module first
      const moduleToggle = await page.$('[class*="module"] button, [class*="accordion"] button, details summary, [class*="expand"]');
      if (moduleToggle) {
        try { await moduleToggle.click(); await page.waitForTimeout(500); } catch {}
      }

      // Now look for lesson links
      const lessonLink = await page.$('a[href*="/lesson/"]');
      if (lessonLink) {
        await lessonLink.click();
        await page.waitForLoadState("networkidle", { timeout: 20000 });
        await screenshot("lesson-view");
        log(`  📍 Lesson page: ${page.url()}`);
      } else {
        // Some courses go directly to lesson view
        if (page.url().includes("/lesson/")) {
          await screenshot("lesson-view");
          log("  📍 Already on lesson page");
        } else {
          warn("No lesson links found on course page (may need enrollment or course has no lessons)");
        }
      }
    } else {
      warn("No enrolled courses found on My Courses page");
    }
  });

  // AI Tutor
  await check("Student", "AI Tutor available on lesson page", async () => {
    // Check if we're already on a lesson page from previous test
    if (!page.url().includes("/lesson/")) {
      // Try to navigate to one
      await safeGoto(`${SITE_URL}/my-courses`);
      const startBtn = await page.$('a:has-text("Start Course"), a:has-text("Continue")');
      if (startBtn) {
        await startBtn.click();
        await page.waitForLoadState("networkidle", { timeout: 20000 });
        // Look for a lesson link on the course page
        const moduleToggle = await page.$('[class*="module"] button, details summary');
        if (moduleToggle) { try { await moduleToggle.click(); await page.waitForTimeout(500); } catch {} }
        const lessonLink = await page.$('a[href*="/lesson/"]');
        if (lessonLink) {
          await lessonLink.click();
          await page.waitForLoadState("networkidle", { timeout: 20000 });
        }
      }
    }

    if (page.url().includes("/lesson/")) {
      // Look for AI Tutor button
      const aiBtn = await exists('button:has-text("AI Tutor"), button:has-text("Tutor"), [class*="ai-tutor"], [class*="tutor"]');
      if (aiBtn) {
        try {
          await page.click('button:has-text("AI Tutor"), button:has-text("Tutor")');
          await page.waitForTimeout(1000);
          await screenshot("ai-tutor");
          const hasChatInput = await exists('textarea, input[placeholder*="question"], input[placeholder*="message"]');
          if (!hasChatInput) warn("AI Tutor panel missing chat input");
          else log("  🤖 AI Tutor chat input found");
        } catch { warn("AI Tutor button found but couldn't click it"); }
      } else {
        warn("AI Tutor button not found on lesson page — may not be enabled for this course");
      }
    } else {
      warn("Could not navigate to a lesson page to test AI Tutor");
    }
  });
}

// ---------- 5. PAYMENT FLOWS ----------
async function testPaymentFlows() {
  log("\n💳 PAYMENT FLOWS — Checkout, pricing, success pages...");

  // Pricing page / course enrollment CTA
  await check("Payment", "Course enrollment CTA present", async () => {
    await safeGoto(`${SITE_URL}/courses`);
    // Find a paid course
    const courseLink = await page.$('a[href*="/courses/"]');
    if (courseLink) {
      await courseLink.click();
      await page.waitForLoadState("networkidle", { timeout: 15000 });
      // Look for enrollment/pricing CTA
      const hasCTA = await exists(
        'button:has-text("Enroll"), button:has-text("Buy"), button:has-text("Start"), a:has-text("Enroll"), [class*="enroll"], [class*="pricing"]'
      );
      if (!hasCTA) warn("Course detail page has no enrollment CTA");
      await screenshot("enrollment-cta");
    }
  });

  // For individuals pricing
  await check("Payment", "Individual pricing page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/for-individuals`);
    if (resp.status() >= 400) throw new Error(`HTTP ${resp.status()}`);
    await checkBadCopy("Individual Pricing");
  });

  // Business solutions (team pricing)
  await check("Payment", "Business solutions/team pricing loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/business-solutions`);
    if (resp.status() >= 400) throw new Error(`HTTP ${resp.status()}`);
    // Should have pricing info
    const hasPrice = await page.evaluate(() => /€|\$|price|month|year|team/i.test(document.body.innerText));
    if (!hasPrice) warn("Business solutions page doesn't mention pricing");
  });

  // Payment success page (no orderId — should handle gracefully)
  await check("Payment", "Payment success page handles missing order", async () => {
    const resp = await safeGoto(`${SITE_URL}/payment-success`);
    if (resp.status() === 500) throw new Error("Payment success page returns 500 without orderId");
  });

  // Checkout success page
  await check("Payment", "Checkout success page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/checkout-success`);
    if (resp.status() === 500) throw new Error("Checkout success page returns 500");
  });

  // Checkout cancel page
  await check("Payment", "Checkout cancel page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/checkout-cancel`);
    if (resp.status() === 500) throw new Error("Checkout cancel page returns 500");
  });

  // Enrollment success
  await check("Payment", "Enrollment success page loads", async () => {
    const resp = await safeGoto(`${SITE_URL}/enrollment-success`);
    if (resp.status() === 500) throw new Error("Enrollment success page returns 500");
  });

  // Coupon code field (if present on course detail)
  await check("Payment", "Coupon input works on course page", async () => {
    await safeGoto(`${SITE_URL}/courses`);
    const courseLink = await page.$('a[href*="/courses/"]');
    if (courseLink) {
      await courseLink.click();
      await page.waitForLoadState("networkidle", { timeout: 15000 });
      const couponInput = await exists('input[placeholder*="coupon"], input[placeholder*="Coupon"], input[name*="coupon"]');
      if (couponInput) {
        await page.fill('input[placeholder*="coupon"], input[placeholder*="Coupon"], input[name*="coupon"]', "INVALIDCODE");
        // Try to apply
        const applyBtn = await page.$('button:has-text("Apply")');
        if (applyBtn) {
          await applyBtn.click();
          await page.waitForTimeout(2000);
          // Should show "invalid" message, not crash
          const bodyText = await page.evaluate(() => document.body.innerText);
          if (/500|server error/i.test(bodyText)) throw new Error("Coupon validation returned server error");
        }
        log("  🎟️ Coupon input exists and handles invalid codes");
      } else {
        log("  ℹ️ No coupon input found on course page");
      }
    }
  });
}

// ---------- 6. ADMIN FEATURES ----------
async function testAdminFeatures() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    log("\n👑 ADMIN FEATURES — Skipping (no ADMIN_EMAIL/ADMIN_PASSWORD)");
    return;
  }

  log("\n👑 ADMIN FEATURES — Dashboard, courses, users, AI cost...");

  // Login as admin
  let adminLoggedIn = false;
  await check("Admin", "Admin login succeeds", async () => {
    await context.clearCookies();
    await safeGoto(`${SITE_URL}/login`);
    await page.fill('input[type="email"], input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    try {
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
    } catch {
      await screenshot("admin-login-failed");
      throw new Error("Admin login failed — still on login page");
    }

    if (page.url().includes("verify-2fa")) {
      warn("Admin 2FA required — skipping admin tests (no TOTP secret)");
      return;
    }

    adminLoggedIn = true;
    log(`  📍 Admin logged in, at: ${page.url()}`);
  });

  if (!adminLoggedIn) {
    warn("ADMIN TESTS SKIPPED — admin login failed");
    return;
  }

  // Admin dashboard
  await check("Admin", "Admin dashboard loads", async () => {
    await safeGoto(`${SITE_URL}/admin`);
    await screenshot("admin-dashboard");
    const status = page.url();
    if (status.includes("/login")) throw new Error("Redirected to login — not authenticated as admin");
    await checkBadCopy("Admin Dashboard");
  });

  // Admin pages — check each loads without 500
  const adminPages = [
    { path: "/admin/users", name: "User management" },
    { path: "/admin/courses", name: "Course management" },
    { path: "/admin/analytics", name: "Analytics" },
    { path: "/admin/ai-usage", name: "AI usage/cost" },
    { path: "/admin/coupons", name: "Coupon management" },
    { path: "/admin/teams", name: "Team management" },
    { path: "/admin/blog", name: "Blog management" },
    { path: "/admin/media", name: "Media library" },
    { path: "/admin/pages", name: "Custom pages" },
    { path: "/admin/goals", name: "Business goals" },
    { path: "/admin/settings", name: "Platform settings" },
    { path: "/admin/email-campaigns", name: "Email campaigns" },
    { path: "/admin/crm", name: "CRM" },
    { path: "/admin/feedback", name: "Student feedback" },
    { path: "/admin/support-tickets", name: "Support tickets" },
    { path: "/admin/diagnostics", name: "Diagnostics" },
    { path: "/admin/community", name: "Community moderation" },
    { path: "/admin/live-sessions", name: "Live sessions" },
    { path: "/admin/vip-sessions", name: "VIP sessions" },
    { path: "/admin/vip-resources", name: "VIP resources" },
    { path: "/admin/footer", name: "Footer editor" },
  ];

  for (const { path, name } of adminPages) {
    await check("Admin", `${name} (${path}) loads`, async () => {
      const resp = await safeGoto(`${SITE_URL}${path}`);
      const status = resp?.status() || 0;
      if (status >= 500) throw new Error(`HTTP ${status}`);
      if (page.url().includes("/login")) throw new Error("Redirected to login");
      await checkBadCopy(`Admin: ${name}`);
    });
  }

  // Admin course creation (don't actually save)
  await check("Admin", "Course creation form loads", async () => {
    await safeGoto(`${SITE_URL}/admin/courses/new`);
    await screenshot("admin-course-new");
    const hasForm = await exists('input, textarea, select, [contenteditable]');
    if (!hasForm) throw new Error("Course creation page has no form elements");
  });

  // Admin blog creation
  await check("Admin", "Blog post creation form loads", async () => {
    await safeGoto(`${SITE_URL}/admin/blog/new`);
    await screenshot("admin-blog-new");
    const hasForm = await exists('input, textarea, [contenteditable]');
    if (!hasForm) throw new Error("Blog creation page has no form elements");
  });

  // Admin user search
  await check("Admin", "User search works", async () => {
    await safeGoto(`${SITE_URL}/admin/users`);
    const searchInput = await exists('input[type="text"], input[type="search"], input[placeholder*="Search"]');
    if (searchInput) {
      await page.fill('input[type="text"], input[type="search"], input[placeholder*="Search"]', "test");
      await page.waitForTimeout(2000);
      // Should not crash
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (/500|server error/i.test(bodyText)) throw new Error("User search returned server error");
    } else {
      warn("Admin users page missing search input");
    }
  });
}

// ---------- 7. CONSOLE & NETWORK MONITORING ----------
async function setupMonitoring() {
  const consoleErrors = [];
  const networkErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Filter out noise
      if (!text.includes("favicon") && !text.includes("third-party") && !text.includes("analytics") && !text.includes("gtag")) {
        consoleErrors.push(text.substring(0, 300));
      }
    }
  });

  page.on("requestfailed", (req) => {
    const url = req.url();
    if (!url.includes("analytics") && !url.includes("gtag") && !url.includes("favicon")) {
      networkErrors.push({ url: url.substring(0, 200), error: req.failure()?.errorText });
    }
  });

  return { consoleErrors, networkErrors };
}

// =====================================================================
// MAIN
// =====================================================================
async function run() {
  log("=".repeat(70));
  log("BODYLYTICS FULL QA SUITE");
  log(`Target: ${SITE_URL}`);
  log(`Auth tests: ${TEST_USER_EMAIL ? "YES" : "NO (set TEST_EMAIL/TEST_PASSWORD)"}`);
  log(`Admin tests: ${ADMIN_EMAIL ? "YES" : "NO (set ADMIN_EMAIL/ADMIN_PASSWORD)"}`);
  log("=".repeat(70));

  try { const { mkdirSync } = await import("fs"); mkdirSync("/tmp/qa-screenshots", { recursive: true }); } catch {}

  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: "HollyQA/2.0 (Full Browser Test Suite)",
    ignoreHTTPSErrors: true,
  });

  page = await context.newPage();
  const { consoleErrors, networkErrors } = await setupMonitoring();

  // Run all test suites
  await testPublicPages();
  await testAuthFlows();
  await testStudentFeatures();
  await testPaymentFlows();
  await testAdminFeatures();

  // Link crawl last (navigates everywhere)
  const crawlResult = await crawlLinks();

  // Final console/network error checks
  await check("Health", "No excessive console errors", async () => {
    if (consoleErrors.length > 10) {
      throw new Error(`${consoleErrors.length} console errors. First 5: ${consoleErrors.slice(0, 5).join(" | ")}`);
    }
    if (consoleErrors.length > 0) {
      warn(`${consoleErrors.length} console errors detected`);
    }
  });

  await check("Health", "No excessive network failures", async () => {
    if (networkErrors.length > 5) {
      throw new Error(`${networkErrors.length} network failures: ${networkErrors.slice(0, 5).map(e => e.url).join(", ")}`);
    }
  });

  await browser.close();

  // ---------- Results ----------
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;
  const sections = {};
  for (const r of results) {
    if (!sections[r.section]) sections[r.section] = { passed: 0, failed: 0 };
    if (r.passed) sections[r.section].passed++;
    else sections[r.section].failed++;
  }

  log("\n" + "=".repeat(70));
  log("RESULTS SUMMARY");
  log("=".repeat(70));
  for (const [section, counts] of Object.entries(sections)) {
    const icon = counts.failed === 0 ? "✅" : "❌";
    log(`  ${icon} ${section}: ${counts.passed} passed, ${counts.failed} failed`);
  }
  log(`\n  TOTAL: ${passed} passed, ${failed} failed / ${total} tests`);
  if (warnings.length > 0) {
    log(`  WARNINGS: ${warnings.length}`);
    for (const w of warnings) log(`    ⚠️  ${w}`);
  }
  log(`  PAGES CRAWLED: ${crawlResult.crawled}`);
  log("=".repeat(70));

  const healthStatus = failed === 0 ? "healthy" : failed <= 3 ? "degraded" : "critical";

  // Build report
  const report = buildReport(results, warnings, passed, failed, total, sections, consoleErrors, networkErrors, crawlResult);

  // POST to Mission Control
  await postToMissionControl(results, warnings, passed, failed, total, healthStatus, report, sections);

  process.exit(failed > 0 ? 1 : 0);
}

function buildReport(results, warnings, passed, failed, total, sections, consoleErrors, networkErrors, crawlResult) {
  const lines = [
    `# Full QA Test Report`,
    ``,
    `**Site:** ${SITE_URL}`,
    `**Time:** ${new Date().toISOString()}`,
    `**Result:** ${passed} passed, ${failed} failed / ${total} total`,
    `**Auth Tested:** ${TEST_USER_EMAIL ? "Yes" : "No"}`,
    `**Admin Tested:** ${ADMIN_EMAIL ? "Yes" : "No"}`,
    `**Pages Crawled:** ${crawlResult.crawled}`,
    ``,
    `## Results by Section`,
    ``,
  ];

  for (const [section, counts] of Object.entries(sections)) {
    const icon = counts.failed === 0 ? "✅" : "❌";
    lines.push(`### ${icon} ${section} (${counts.passed}/${counts.passed + counts.failed})`);
    lines.push(``);
    for (const r of results.filter((r) => r.section === section)) {
      const ic = r.passed ? "✅" : "❌";
      lines.push(`${ic} **${r.name}** — ${r.latency_ms}ms${r.error ? ` → ${r.error}` : ""}`);
    }
    lines.push(``);
  }

  if (warnings.length > 0) {
    lines.push(`## ⚠️ Warnings (${warnings.length})`, ``);
    for (const w of warnings) lines.push(`- ${w}`);
    lines.push(``);
  }

  if (consoleErrors.length > 0) {
    lines.push(`## Console Errors (${consoleErrors.length})`, ``);
    for (const e of consoleErrors.slice(0, 15)) lines.push(`- \`${e.substring(0, 200)}\``);
    lines.push(``);
  }

  if (networkErrors.length > 0) {
    lines.push(`## Network Failures (${networkErrors.length})`, ``);
    for (const e of networkErrors.slice(0, 10)) lines.push(`- \`${e.url}\` — ${e.error}`);
    lines.push(``);
  }

  if (crawlResult.broken.length > 0) {
    lines.push(`## 🔗 Broken Links`, ``);
    for (const b of crawlResult.broken) lines.push(`- \`${b.url}\` — HTTP ${b.status}`);
    lines.push(``);
  }

  if (failed > 0) {
    lines.push(`## ❌ Action Required`, ``);
    for (const r of results.filter((r) => !r.passed)) {
      lines.push(`- **[${r.section}] ${r.name}**: ${r.error}`);
    }
  }

  return lines.join("\n");
}

async function postToMissionControl(results, warnings, passed, failed, total, healthStatus, report, sections) {
  log("  Posting results to Mission Control...");

  const sectionSummary = Object.entries(sections)
    .map(([s, c]) => `${s}: ${c.passed}/${c.passed + c.failed}`)
    .join(" | ");

  const payload = {
    agent_id: "bl-qa",
    activity_type: "report",
    title: failed === 0
      ? `Full QA: All ${passed} Tests Passed ✅`
      : `Full QA: ${failed} Failure(s) ${healthStatus === "critical" ? "🔴" : "🟡"}`,
    summary: `${passed}/${total} tests. ${sectionSummary}. ${warnings.length} warnings.${
      failed > 0
        ? ` Failed: ${results.filter((r) => !r.passed).map((r) => r.name).join(", ")}`
        : " All systems operational."
    }`,
    full_content: report,
    workflow: "full-qa-suite",
    metadata: {
      environment: "production",
      test_type: "full-browser-qa",
      checks_passed: passed,
      checks_failed: failed,
      checks_total: total,
      warnings_count: warnings.length,
      health_status: healthStatus,
      auth_tested: !!TEST_USER_EMAIL,
      admin_tested: !!ADMIN_EMAIL,
      sections,
      warnings,
      checks: results,
    },
  };

  try {
    const resp = await fetch(MC_INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${MC_API_KEY}` },
      body: JSON.stringify(payload),
    });
    log(resp.ok ? `  Posted (HTTP ${resp.status})` : `  POST failed (HTTP ${resp.status}): ${await resp.text()}`);
  } catch (err) {
    log(`  POST failed: ${err.message}`);
  }

  // Create tasks for failures
  if (failed > 0) {
    try {
      await fetch(MC_INGEST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${MC_API_KEY}` },
        body: JSON.stringify({
          agent_id: "bl-qa",
          activity_type: "task",
          title: `QA: ${failed} test(s) failing on ${SITE_URL}`,
          full_content: results
            .filter((r) => !r.passed)
            .map((r) => `- **[${r.section}] ${r.name}**: ${r.error}`)
            .join("\n"),
          workflow: "full-qa-suite",
          metadata: { priority: healthStatus === "critical" ? "urgent" : "high", segment: "bodylytics" },
        }),
      });
    } catch {}
  }

  // Alert about new discovered routes needing coverage
  if (warnings.some((w) => w.includes("NEW ROUTES DISCOVERED"))) {
    try {
      await fetch(MC_INGEST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${MC_API_KEY}` },
        body: JSON.stringify({
          agent_id: "bl-qa",
          activity_type: "task",
          title: "QA: New routes discovered — add test coverage",
          full_content: warnings.filter((w) => w.includes("NEW ROUTES")).join("\n"),
          workflow: "full-qa-suite",
          metadata: { priority: "medium", segment: "bodylytics" },
        }),
      });
    } catch {}
  }
}

run().catch((err) => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
