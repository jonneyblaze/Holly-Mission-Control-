import { NextRequest, NextResponse } from "next/server";

// Triggers the browser QA suite on Naboo via SSH
// This calls run-qa.sh which spins up Playwright in Docker

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const apiKey = process.env.INGEST_API_KEY;

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const testEmail = body.test_email || "";
    const testPassword = body.test_password || "";

    // Trigger via the smoke-test endpoint (HTTP-level, runs on Vercel)
    // The full browser suite runs on Naboo via cron or manual SSH
    // This endpoint runs the quick HTTP checks immediately

    const baseUrl = request.nextUrl.origin;
    const smokeResp = await fetch(`${baseUrl}/api/smoke-test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const smokeResult = await smokeResp.json();

    return NextResponse.json({
      ok: true,
      message: "HTTP smoke tests completed. Browser QA suite runs on Naboo via cron (every 2 hours) or trigger manually via SSH.",
      smoke_test: smokeResult,
      browser_qa: {
        status: "scheduled",
        note: "Full browser tests run on Naboo. Check agent activity feed for results.",
        manual_trigger: "ssh root@10.0.1.100 '/mnt/user/appdata/scripts/run-qa.sh'",
      },
    });
  } catch (err) {
    console.error("[trigger-qa] Error:", err);
    return NextResponse.json({ error: "Failed to run QA" }, { status: 500 });
  }
}
