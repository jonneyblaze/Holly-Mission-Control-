import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Flow Capture API — agents request screenshots of specific flows
 *
 * POST /api/capture-flow
 * {
 *   flow: "login" | "signup,dashboard,courses" | "all",
 *   urls: "/page1,/page2",          // OR specific URLs
 *   viewport: "desktop" | "mobile" | "both",
 *   requesting_agent: "bl-content",  // who's asking
 *   task_id: "optional-task-id"
 * }
 *
 * Creates a task that triggers the capture script on Naboo.
 * Results are posted back to agent_activity by the script.
 */

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const apiKey = process.env.INGEST_API_KEY;

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { flow, urls, viewport = "desktop", requesting_agent = "bl-content", task_id } = body;

    if (!flow && !urls) {
      return NextResponse.json(
        { error: "Provide 'flow' (e.g. 'login', 'signup,courses', 'all') or 'urls' (e.g. '/login,/courses')" },
        { status: 400 }
      );
    }

    // Available flows for reference
    const availableFlows = [
      "login", "signup", "forgot-password",
      "dashboard", "courses", "course-detail", "course-learning", "ai-tutor",
      "knowledge-base", "certificates", "profile", "community", "challenges",
      "live-training", "referrals", "team-dashboard",
      "admin-dashboard", "admin-courses", "admin-users", "admin-blog",
      "admin-analytics", "admin-ai-usage",
      "homepage", "pricing",
    ];

    // Queue as a pending capture task in agent_activity
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey);

      await supabase.from("agent_activity").insert({
        agent_id: requesting_agent,
        activity_type: "trigger",
        title: `Flow Capture Request: ${flow || urls}`,
        summary: `Requesting screenshots of ${flow || urls} (${viewport} viewport)`,
        metadata: {
          capture_type: "flow-capture",
          flow,
          urls,
          viewport,
          requesting_agent,
          task_id,
          status: "queued",
          trigger_command: flow
            ? `CAPTURE_FLOW="${flow}" VIEWPORT="${viewport}" REQUESTING_AGENT="${requesting_agent}" TASK_ID="${task_id || ""}" /mnt/user/appdata/scripts/run-capture.sh`
            : `CAPTURE_URLS="${urls}" VIEWPORT="${viewport}" REQUESTING_AGENT="${requesting_agent}" TASK_ID="${task_id || ""}" /mnt/user/appdata/scripts/run-capture.sh`,
        },
        status: "pending",
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Flow capture queued. Screenshots will be posted to agent_activity when complete.",
      flow: flow || null,
      urls: urls || null,
      viewport,
      requesting_agent,
      available_flows: availableFlows,
      trigger_command: flow
        ? `CAPTURE_FLOW="${flow}" VIEWPORT="${viewport}" REQUESTING_AGENT="${requesting_agent}" /mnt/user/appdata/scripts/run-capture.sh`
        : `CAPTURE_URLS="${urls}" VIEWPORT="${viewport}" REQUESTING_AGENT="${requesting_agent}" /mnt/user/appdata/scripts/run-capture.sh`,
    });
  } catch (err) {
    console.error("[capture-flow] Error:", err);
    return NextResponse.json({ error: "Failed to queue capture" }, { status: 500 });
  }
}
