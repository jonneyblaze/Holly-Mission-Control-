import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BODYLYTICS_URL = process.env.BODYLYTICS_PUBLIC_URL || "https://bodylytics.coach";

interface CheckResult {
  name: string;
  passed: boolean;
  status?: number;
  latency_ms: number;
  error?: string;
}

async function runCheck(
  name: string,
  url: string,
  opts?: { expectRedirect?: boolean; expectText?: string; method?: string }
): Promise<CheckResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      method: opts?.method || "GET",
      redirect: opts?.expectRedirect ? "manual" : "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "HollyQA/1.0 (Mission Control Smoke Test)",
      },
    });

    clearTimeout(timeout);
    const latency = Date.now() - start;
    const status = res.status;

    // Check for redirect if expected
    if (opts?.expectRedirect) {
      const passed = status >= 300 && status < 400;
      return { name, passed, status, latency_ms: latency, error: passed ? undefined : `Expected redirect, got ${status}` };
    }

    // Check for expected text in body
    if (opts?.expectText) {
      const body = await res.text();
      const found = body.toLowerCase().includes(opts.expectText.toLowerCase());
      return {
        name,
        passed: status >= 200 && status < 400 && found,
        status,
        latency_ms: latency,
        error: !found ? `Text "${opts.expectText}" not found in response` : undefined,
      };
    }

    // Default: just check status
    const passed = status >= 200 && status < 400;
    return { name, passed, status, latency_ms: latency };
  } catch (err) {
    return {
      name,
      passed: false,
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function POST(request: NextRequest) {
  // Verify API key
  const authHeader = request.headers.get("authorization");
  const apiKey = process.env.INGEST_API_KEY;

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks: CheckResult[] = [];

  // 1. Homepage loads and contains "BodyLytics"
  checks.push(await runCheck("Homepage loads", `${BODYLYTICS_URL}/`, { expectText: "BodyLytics" }));

  // 2. Login page accessible
  checks.push(await runCheck("Login page loads", `${BODYLYTICS_URL}/login`, { expectText: "sign in" }));

  // 3. Public course catalog
  checks.push(await runCheck("Course catalog loads", `${BODYLYTICS_URL}/courses`));

  // 4. API health endpoint
  checks.push(await runCheck("API health", `${BODYLYTICS_URL}/api/health`));

  // 5. Admin portal responds (should redirect to login)
  checks.push(await runCheck("Admin portal responds", `${BODYLYTICS_URL}/admin`, { expectRedirect: true }));

  // 6. Static assets (check a Next.js chunk exists)
  checks.push(await runCheck("Static assets accessible", `${BODYLYTICS_URL}/_next/static/chunks/main-app.js`));

  // 7. Privacy policy (public page)
  checks.push(await runCheck("Privacy policy loads", `${BODYLYTICS_URL}/privacy-policy`));

  // 8. Signup page
  checks.push(await runCheck("Signup page loads", `${BODYLYTICS_URL}/signup`));

  // Results
  const passed = checks.filter((c) => c.passed).length;
  const total = checks.length;
  const allPassed = passed === total;
  const avgLatency = Math.round(checks.reduce((sum, c) => sum + c.latency_ms, 0) / total);

  const healthStatus = allPassed ? "healthy" : passed >= total * 0.7 ? "degraded" : "critical";

  // Auto-post results to ingest
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    const supabase = createClient(supabaseUrl, serviceKey);

    // Log as agent activity
    await supabase.from("agent_activity").insert({
      agent_id: "bl-qa",
      activity_type: "report",
      title: allPassed
        ? `Smoke Test: All ${total} Checks Passed ✅`
        : `Smoke Test: ${passed}/${total} Passed ${healthStatus === "critical" ? "🔴" : "🟡"}`,
      summary: `${passed}/${total} checks passed. Avg latency: ${avgLatency}ms. ${
        !allPassed ? `Failed: ${checks.filter((c) => !c.passed).map((c) => c.name).join(", ")}` : "All systems operational."
      }`,
      full_content: formatReport(checks, passed, total, avgLatency),
      workflow: "smoke-test-automated",
      metadata: {
        environment: "production",
        checks_passed: passed,
        checks_total: total,
        avg_latency_ms: avgLatency,
        health_status: healthStatus,
        checks,
      },
      status: "new",
    });

    // If anything failed, create a task
    const failures = checks.filter((c) => !c.passed);
    if (failures.length > 0) {
      await supabase.from("tasks").insert({
        title: `QA Alert: ${failures.length} smoke test(s) failing`,
        description: `The following checks failed on ${BODYLYTICS_URL}:\n\n${failures
          .map((f) => `- **${f.name}**: ${f.error || `HTTP ${f.status}`} (${f.latency_ms}ms)`)
          .join("\n")}`,
        status: "todo",
        priority: healthStatus === "critical" ? "urgent" : "high",
        segment: "bodylytics",
        assigned_agent: "bl-qa",
        source: "agent",
        source_workflow: "smoke-test-automated",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    health: healthStatus,
    passed,
    total,
    avg_latency_ms: avgLatency,
    checks,
  });
}

// Also support GET for manual/cron triggering
export async function GET(request: NextRequest) {
  // For GET, still require API key via query param or header
  const authHeader = request.headers.get("authorization");
  const apiKey = process.env.INGEST_API_KEY;
  const queryKey = request.nextUrl.searchParams.get("key");

  if (!apiKey || (authHeader !== `Bearer ${apiKey}` && queryKey !== apiKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Delegate to POST handler logic
  return POST(request);
}

function formatReport(checks: CheckResult[], passed: number, total: number, avgLatency: number): string {
  const lines = [
    `# Smoke Test Report`,
    `**Environment:** Production (${process.env.BODYLYTICS_PUBLIC_URL || "https://bodylytics.coach"})`,
    `**Time:** ${new Date().toISOString()}`,
    `**Result:** ${passed}/${total} checks passed`,
    `**Avg Latency:** ${avgLatency}ms`,
    ``,
    `## Results`,
    ``,
  ];

  for (const c of checks) {
    const icon = c.passed ? "✅" : "❌";
    const detail = c.status ? ` (HTTP ${c.status}, ${c.latency_ms}ms)` : ` (${c.latency_ms}ms)`;
    lines.push(`${icon} **${c.name}**${detail}`);
    if (c.error) lines.push(`   → ${c.error}`);
  }

  if (passed < total) {
    lines.push(``, `## Action Required`);
    for (const c of checks.filter((c) => !c.passed)) {
      lines.push(`- **${c.name}**: ${c.error || "Failed"}`);
    }
  }

  return lines.join("\n");
}
