#!/usr/bin/env node
// =============================================================================
// BodyLytics Flow Capture Tool
// Takes screenshots of specific user flows for KB articles and help docs
//
// Usage:
//   node capture-flow.mjs --flow login
//   node capture-flow.mjs --flow "signup,dashboard,courses,course-detail"
//   node capture-flow.mjs --urls "/login,/signup,/courses,/dashboard"
//   node capture-flow.mjs --flow all
//
// Called by Mission Control /api/capture-flow endpoint
// Results posted to MC with base64 screenshots for KB/help article creation
// =============================================================================

import { chromium } from "playwright";

const SITE_URL = process.env.TEST_URL || "https://bodylytics.coach";
const MC_INGEST_URL = process.env.MC_INGEST_URL || "https://holly-mission-control-backend.vercel.app/api/ingest";
const MC_API_KEY = process.env.MC_API_KEY || "9eRse679@ohyEdCz&UAUL@V9V6t*xW@%47r4vQfFeThowllEBsIv";
const TEST_EMAIL = process.env.TEST_EMAIL || "";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

// Which flow(s) to capture — passed via env or CLI args
const FLOW_ARG = process.env.CAPTURE_FLOW || process.argv.find(a => a.startsWith("--flow="))?.split("=")[1] || "";
const URLS_ARG = process.env.CAPTURE_URLS || process.argv.find(a => a.startsWith("--urls="))?.split("=")[1] || "";
const REQUESTING_AGENT = process.env.REQUESTING_AGENT || "bl-content";
const TASK_ID = process.env.TASK_ID || "";
const VIEWPORT = process.env.VIEWPORT || "desktop"; // desktop, mobile, both

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// =============================================================================
// PREDEFINED FLOWS — step-by-step captures with annotations
// =============================================================================
const FLOWS = {
  // ---- Auth Flows ----
  "login": {
    name: "Login Flow",
    description: "How to log in to BodyLytics",
    requiresAuth: false,
    steps: [
      { url: "/login", action: "screenshot", name: "login-page", caption: "Navigate to the Login page" },
      { action: "fill", selector: 'input[type="email"], input[name="email"]', value: "your-email@example.com" },
      { action: "screenshot", name: "login-email-filled", caption: "Enter your email address" },
      { action: "fill", selector: 'input[type="password"]', value: "••••••••" },
      { action: "screenshot", name: "login-ready", caption: "Enter your password and click Sign In" },
    ]
  },
  "signup": {
    name: "Signup Flow",
    description: "How to create a new BodyLytics account",
    requiresAuth: false,
    steps: [
      { url: "/signup", action: "screenshot", name: "signup-page", caption: "Navigate to the Signup page" },
      { action: "fill", selector: 'input[name="fullName"], input[name="name"]', value: "John Smith" },
      { action: "screenshot", name: "signup-name", caption: "Enter your full name" },
      { action: "fill", selector: 'input[type="email"]', value: "john@example.com" },
      { action: "fill", selector: 'input[type="password"]', value: "SecurePass123!" },
      { action: "screenshot", name: "signup-filled", caption: "Fill in email and password (must meet strength requirements)" },
      { action: "screenshot", name: "signup-terms", caption: "Check the Terms & Privacy checkbox, then click Create Account" },
    ]
  },
  "forgot-password": {
    name: "Password Reset Flow",
    description: "How to reset your password",
    requiresAuth: false,
    steps: [
      { url: "/login", action: "screenshot", name: "login-forgot-link", caption: "On the Login page, click 'Forgot password?'" },
      { url: "/forgot-password", action: "screenshot", name: "forgot-password-page", caption: "Enter your email address" },
      { action: "fill", selector: 'input[type="email"], input[name="email"]', value: "your-email@example.com" },
      { action: "screenshot", name: "forgot-password-filled", caption: "Click 'Send Reset Link' — check your email for the link" },
    ]
  },

  // ---- Student Flows ----
  "dashboard": {
    name: "Student Dashboard",
    description: "Overview of your learning dashboard",
    requiresAuth: true,
    steps: [
      { url: "/dashboard", action: "screenshot", name: "dashboard-overview", caption: "Your personal learning dashboard" },
    ]
  },
  "courses": {
    name: "Browse Courses",
    description: "How to browse and find courses",
    requiresAuth: false,
    steps: [
      { url: "/courses", action: "screenshot", name: "course-catalog", caption: "Browse the full course catalog" },
      { action: "click", selector: 'a[href*="/courses/"]', fallback: true },
      { action: "screenshot", name: "course-detail", caption: "Click any course to see details, curriculum, and enrollment options" },
    ]
  },
  "course-detail": {
    name: "Course Detail Page",
    description: "Understanding the course detail page",
    requiresAuth: false,
    steps: [
      { url: "/courses", action: "navigate-to-first-course" },
      { action: "screenshot", name: "course-hero", caption: "Course overview with title, description, and instructor" },
      { action: "scroll", amount: 600 },
      { action: "screenshot", name: "course-curriculum", caption: "Course curriculum showing all modules and lessons" },
      { action: "scroll", amount: 600 },
      { action: "screenshot", name: "course-enrollment", caption: "Pricing and enrollment options" },
    ]
  },
  "course-learning": {
    name: "Learning a Course",
    description: "How the course learning experience works",
    requiresAuth: true,
    steps: [
      { url: "/my-courses", action: "screenshot", name: "my-courses", caption: "Your enrolled courses with progress tracking" },
      { action: "click", selector: 'a[href*="course-learning"]', fallback: true },
      { action: "screenshot", name: "lesson-view", caption: "The lesson viewer with sidebar navigation" },
    ]
  },
  "ai-tutor": {
    name: "Using the AI Tutor",
    description: "How to use the AI Tutor during lessons",
    requiresAuth: true,
    steps: [
      { action: "navigate-to-lesson" },
      { action: "screenshot", name: "lesson-before-tutor", caption: "On any lesson page, look for the AI Tutor button" },
      { action: "click", selector: 'button:has-text("AI Tutor"), button:has-text("Tutor")' },
      { action: "wait", ms: 1000 },
      { action: "screenshot", name: "ai-tutor-panel", caption: "The AI Tutor panel opens with suggested questions" },
    ]
  },
  "knowledge-base": {
    name: "Knowledge Base",
    description: "How to search the knowledge base",
    requiresAuth: true,
    steps: [
      { url: "/knowledge-base", action: "screenshot", name: "kb-overview", caption: "The Knowledge Base with searchable articles" },
    ]
  },
  "certificates": {
    name: "Certificates",
    description: "How to view and download certificates",
    requiresAuth: true,
    steps: [
      { url: "/certificates", action: "screenshot", name: "certificates-page", caption: "Your earned certificates" },
    ]
  },
  "profile": {
    name: "Profile Settings",
    description: "How to manage your profile and security settings",
    requiresAuth: true,
    steps: [
      { url: "/profile", action: "screenshot", name: "profile-page", caption: "Your profile settings" },
      { url: "/profile?tab=security", action: "screenshot", name: "profile-security", caption: "Security settings: change password and enable 2FA" },
      { url: "/profile?tab=emails", action: "screenshot", name: "profile-emails", caption: "Email notification preferences" },
    ]
  },
  "community": {
    name: "Community & Forum",
    description: "How to participate in the community",
    requiresAuth: true,
    steps: [
      { url: "/community", action: "screenshot", name: "community-overview", caption: "The community hub and forum" },
    ]
  },
  "challenges": {
    name: "Challenges & Gamification",
    description: "Daily challenges and earning points",
    requiresAuth: true,
    steps: [
      { url: "/challenges", action: "screenshot", name: "challenges-page", caption: "Active challenges and rewards" },
      { url: "/leaderboard", action: "screenshot", name: "leaderboard", caption: "The leaderboard showing top learners" },
    ]
  },
  "live-training": {
    name: "Live Training Sessions",
    description: "How to join live training sessions",
    requiresAuth: true,
    steps: [
      { url: "/live-training", action: "screenshot", name: "live-training-list", caption: "Available live training sessions" },
    ]
  },
  "referrals": {
    name: "Referral Program",
    description: "How the referral program works",
    requiresAuth: true,
    steps: [
      { url: "/referrals", action: "screenshot", name: "referrals-page", caption: "Your referral link and rewards" },
    ]
  },
  "team-dashboard": {
    name: "Team Dashboard",
    description: "Team management and member progress",
    requiresAuth: true,
    steps: [
      { url: "/team-dashboard", action: "screenshot", name: "team-dashboard", caption: "Team analytics and member management" },
    ]
  },

  // ---- Admin Flows ----
  "admin-dashboard": {
    name: "Admin Dashboard",
    description: "Admin overview and metrics",
    requiresAdmin: true,
    steps: [
      { url: "/admin", action: "screenshot", name: "admin-dashboard", caption: "Admin dashboard with key metrics" },
    ]
  },
  "admin-courses": {
    name: "Admin: Course Management",
    description: "How to create and manage courses",
    requiresAdmin: true,
    steps: [
      { url: "/admin/courses", action: "screenshot", name: "admin-courses-list", caption: "Course management overview" },
      { url: "/admin/courses/new", action: "screenshot", name: "admin-course-create", caption: "Create a new course" },
    ]
  },
  "admin-users": {
    name: "Admin: User Management",
    description: "Managing users, resetting 2FA, impersonation",
    requiresAdmin: true,
    steps: [
      { url: "/admin/users", action: "screenshot", name: "admin-users", caption: "User management and search" },
    ]
  },
  "admin-blog": {
    name: "Admin: Blog Management",
    description: "Creating and publishing blog posts",
    requiresAdmin: true,
    steps: [
      { url: "/admin/blog", action: "screenshot", name: "admin-blog-list", caption: "Blog post management" },
      { url: "/admin/blog/new", action: "screenshot", name: "admin-blog-create", caption: "Create a new blog post with AI writer" },
    ]
  },
  "admin-analytics": {
    name: "Admin: Analytics",
    description: "Platform analytics and insights",
    requiresAdmin: true,
    steps: [
      { url: "/admin/analytics", action: "screenshot", name: "admin-analytics", caption: "Platform-wide analytics" },
    ]
  },
  "admin-ai-usage": {
    name: "Admin: AI Usage & Costs",
    description: "Tracking AI API costs and limits",
    requiresAdmin: true,
    steps: [
      { url: "/admin/ai-usage", action: "screenshot", name: "admin-ai-usage", caption: "AI usage tracking and cost monitoring" },
    ]
  },

  // ---- Public Flows ----
  "homepage": {
    name: "Homepage",
    description: "The BodyLytics homepage",
    requiresAuth: false,
    steps: [
      { url: "/", action: "screenshot", name: "homepage-hero", caption: "BodyLytics homepage hero section" },
      { action: "scroll", amount: 800 },
      { action: "screenshot", name: "homepage-features", caption: "Key features and benefits" },
      { action: "scroll", amount: 800 },
      { action: "screenshot", name: "homepage-cta", caption: "Call to action and social proof" },
    ]
  },
  "pricing": {
    name: "Pricing",
    description: "Individual and team pricing options",
    requiresAuth: false,
    steps: [
      { url: "/for-individuals", action: "screenshot", name: "pricing-individuals", caption: "Individual pricing plans" },
      { url: "/business-solutions", action: "screenshot", name: "pricing-teams", caption: "Business and team pricing" },
    ]
  },
};

// =============================================================================
// CAPTURE ENGINE
// =============================================================================
let browser, context, page;
const screenshots = [];

async function dismissCookieBanner() {
  try {
    const btn = await page.waitForSelector('button:has-text("Accept All")', { timeout: 2500 });
    if (btn) { await btn.click(); await page.waitForTimeout(400); }
  } catch {}
}

async function loginAs(email, password) {
  await page.goto(`${SITE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await dismissCookieBanner();
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.includes("/login"), { timeout: 15000 });
  log(`  Logged in as ${email} → ${page.url()}`);
}

async function captureScreenshot(name, caption, viewport = "desktop") {
  const filename = `${viewport === "mobile" ? "mobile-" : ""}${name}`;
  const path = `/tmp/qa-screenshots/${filename}.png`;
  await page.screenshot({ path, fullPage: false });

  // Read as base64
  const { readFileSync } = await import("fs");
  const b64 = readFileSync(path).toString("base64");
  const size = readFileSync(path).length;

  screenshots.push({
    name: filename,
    caption,
    viewport,
    base64: b64,
    size_bytes: size,
    url: page.url(),
  });
  log(`  📸 ${filename}: ${caption}`);
}

async function executeStep(step) {
  if (step.url) {
    await page.goto(`${SITE_URL}${step.url}`, { waitUntil: "networkidle", timeout: 20000 });
    await dismissCookieBanner();
  }

  switch (step.action) {
    case "screenshot":
      if (VIEWPORT === "both") {
        await captureScreenshot(step.name, step.caption, "desktop");
        await page.setViewportSize({ width: 375, height: 812 });
        await page.waitForTimeout(500);
        await captureScreenshot(step.name, step.caption, "mobile");
        await page.setViewportSize({ width: 1440, height: 900 });
      } else {
        await captureScreenshot(step.name, step.caption, VIEWPORT);
      }
      break;

    case "fill":
      try {
        const el = await page.waitForSelector(step.selector, { timeout: 5000 });
        if (el) await el.fill(step.value);
      } catch { log(`  ⚠️ Could not fill ${step.selector}`); }
      break;

    case "click":
      try {
        const el = await page.waitForSelector(step.selector, { timeout: 5000 });
        if (el) {
          await el.click();
          await page.waitForLoadState("networkidle", { timeout: 10000 });
        }
      } catch {
        if (step.fallback) log(`  ⚠️ Could not click ${step.selector} (continuing)`);
        else throw new Error(`Could not click ${step.selector}`);
      }
      break;

    case "scroll":
      await page.evaluate((px) => window.scrollBy(0, px), step.amount || 500);
      await page.waitForTimeout(500);
      break;

    case "wait":
      await page.waitForTimeout(step.ms || 1000);
      break;

    case "navigate-to-first-course":
      await page.goto(`${SITE_URL}/courses`, { waitUntil: "networkidle", timeout: 15000 });
      await dismissCookieBanner();
      try {
        const link = await page.waitForSelector('a[href*="/courses/"]', { timeout: 5000 });
        if (link) {
          await link.click();
          await page.waitForLoadState("networkidle", { timeout: 15000 });
        }
      } catch { log("  ⚠️ No course link found"); }
      break;

    case "navigate-to-lesson":
      await page.goto(`${SITE_URL}/my-courses`, { waitUntil: "networkidle", timeout: 15000 });
      try {
        const link = await page.waitForSelector('a[href*="course-learning"]', { timeout: 5000 });
        if (link) {
          await link.click();
          await page.waitForLoadState("networkidle", { timeout: 15000 });
          // Try to click into a specific lesson
          const lessonLink = await page.$('a[href*="/lesson/"]');
          if (lessonLink) {
            await lessonLink.click();
            await page.waitForLoadState("networkidle", { timeout: 15000 });
          }
        }
      } catch { log("  ⚠️ No lesson link found"); }
      break;
  }
}

async function captureFlow(flowKey) {
  const flow = FLOWS[flowKey];
  if (!flow) {
    log(`  ❌ Unknown flow: ${flowKey}`);
    return;
  }

  log(`\n📷 Capturing: ${flow.name}`);
  log(`   ${flow.description}`);

  // Handle auth requirements
  if (flow.requiresAdmin) {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      log(`  ⏭️ Skipping (no admin credentials)`);
      return;
    }
    await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD);
  } else if (flow.requiresAuth) {
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      log(`  ⏭️ Skipping (no test user credentials)`);
      return;
    }
    await loginAs(TEST_EMAIL, TEST_PASSWORD);
  }

  for (const step of flow.steps) {
    try {
      await executeStep(step);
    } catch (err) {
      log(`  ❌ Step failed: ${err.message}`);
    }
  }
}

async function captureUrls(urlList) {
  log(`\n📷 Capturing custom URLs...`);
  for (const url of urlList) {
    const path = url.startsWith("/") ? url : `/${url}`;
    try {
      await page.goto(`${SITE_URL}${path}`, { waitUntil: "networkidle", timeout: 20000 });
      await dismissCookieBanner();
      const name = path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
      await captureScreenshot(name || "page", `Screenshot of ${path}`);
    } catch (err) {
      log(`  ❌ Failed to capture ${path}: ${err.message}`);
    }
  }
}

// =============================================================================
// MAIN
// =============================================================================
async function run() {
  log("=".repeat(60));
  log("BODYLYTICS FLOW CAPTURE TOOL");
  log(`Target: ${SITE_URL}`);
  log(`Flow: ${FLOW_ARG || "(custom URLs)"}`);
  log(`Viewport: ${VIEWPORT}`);
  log("=".repeat(60));

  try { const { mkdirSync } = await import("fs"); mkdirSync("/tmp/qa-screenshots", { recursive: true }); } catch {}

  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const vp = VIEWPORT === "mobile" ? { width: 375, height: 812 } : { width: 1440, height: 900 };
  context = await browser.newContext({ viewport: vp, userAgent: "HollyQA/2.0 (Flow Capture)", ignoreHTTPSErrors: true });
  page = await context.newPage();

  if (URLS_ARG) {
    // Custom URLs
    const urls = URLS_ARG.split(",").map(u => u.trim()).filter(Boolean);
    // Check if auth needed (student/admin paths)
    const needsAuth = urls.some(u => u.match(/^\/(dashboard|my-courses|profile|certificates|course-learning|bookmarks|knowledge-base|community|challenges|leaderboard|analytics|referrals|live-training|vip-sessions|team-dashboard)/));
    const needsAdmin = urls.some(u => u.startsWith("/admin"));

    if (needsAdmin && ADMIN_EMAIL && ADMIN_PASSWORD) {
      await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD);
    } else if (needsAuth && TEST_EMAIL && TEST_PASSWORD) {
      await loginAs(TEST_EMAIL, TEST_PASSWORD);
    }
    await captureUrls(urls);
  } else if (FLOW_ARG === "all") {
    // Capture ALL flows
    for (const key of Object.keys(FLOWS)) {
      await captureFlow(key);
    }
  } else if (FLOW_ARG) {
    // Capture specific flow(s)
    const flows = FLOW_ARG.split(",").map(f => f.trim()).filter(Boolean);
    for (const key of flows) {
      await captureFlow(key);
    }
  } else {
    log("No flow or URLs specified. Use --flow=login or --urls=/login,/signup");
    process.exit(1);
  }

  await browser.close();

  // Post results
  log(`\n📦 Captured ${screenshots.length} screenshots`);
  await postResults();

  log("Done.");
}

async function postResults() {
  if (screenshots.length === 0) return;

  // Build markdown report with inline image references
  const flowNames = FLOW_ARG ? FLOW_ARG.split(",").map(f => FLOWS[f]?.name || f).join(", ") : "Custom URLs";

  let markdown = `# Flow Capture: ${flowNames}\n\n`;
  markdown += `**Site:** ${SITE_URL}\n`;
  markdown += `**Captured:** ${new Date().toISOString()}\n`;
  markdown += `**Screenshots:** ${screenshots.length}\n`;
  markdown += `**Viewport:** ${VIEWPORT}\n\n`;

  for (const s of screenshots) {
    markdown += `## ${s.caption}\n`;
    markdown += `**URL:** ${s.url}\n`;
    markdown += `**File:** ${s.name}.png (${Math.round(s.size_bytes / 1024)}KB)\n\n`;
    markdown += `---\n\n`;
  }

  const payload = {
    agent_id: REQUESTING_AGENT,
    activity_type: "report",
    title: `Flow Capture: ${flowNames}`,
    summary: `${screenshots.length} screenshots captured for ${flowNames}`,
    full_content: markdown,
    workflow: "flow-capture",
    metadata: {
      capture_type: "flow-screenshots",
      flow: FLOW_ARG || null,
      urls: URLS_ARG || null,
      viewport: VIEWPORT,
      requesting_agent: REQUESTING_AGENT,
      task_id: TASK_ID || null,
      screenshot_count: screenshots.length,
      screenshots: screenshots.map(s => ({
        name: s.name,
        caption: s.caption,
        url: s.url,
        viewport: s.viewport,
        size_bytes: s.size_bytes,
        base64: s.base64,
      })),
    },
  };

  try {
    const resp = await fetch(MC_INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${MC_API_KEY}` },
      body: JSON.stringify(payload),
    });
    log(resp.ok ? `  Posted to MC (HTTP ${resp.status})` : `  POST failed (HTTP ${resp.status})`);
  } catch (err) {
    log(`  POST failed: ${err.message}`);
  }
}

run().catch(err => { log(`Fatal: ${err.message}`); process.exit(1); });
