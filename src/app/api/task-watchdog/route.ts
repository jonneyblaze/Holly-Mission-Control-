import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Task Watchdog — finds stuck tasks and re-triggers agents
// Runs via Vercel Cron every 5 minutes or can be called manually
//
// A task is "stuck" if:
// - status is "in_progress"
// - has an assigned_agent
// - updated_at is older than STUCK_THRESHOLD_MINUTES
// - no recent agent_activity (trigger/task_complete/clarification) for that task

const STUCK_THRESHOLD_MINUTES = 15;
const MAX_RETRIES = 3; // Don't retry more than 3 times

const OPENCLAW_URL = process.env.OPENCLAW_GATEWAY_URL || "https://openclaw.naboo.network/v1/chat/completions";
const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";

// Watchdog may re-trigger multiple stuck tasks; give it headroom for Holly's
// ~15s per-call latency plus DB queries.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Auth: either Vercel Cron secret or INGEST_API_KEY
  const authHeader = request.headers.get("authorization");
  const cronSecret = request.headers.get("x-vercel-cron-secret");
  const apiKey = process.env.INGEST_API_KEY;
  const vercelCronSecret = process.env.CRON_SECRET;

  const isAuthed =
    (apiKey && authHeader === `Bearer ${apiKey}`) ||
    (vercelCronSecret && cronSecret === vercelCronSecret) ||
    // Allow from localhost in dev
    request.headers.get("host")?.includes("localhost");

  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000).toISOString();

    // Find tasks that are in_progress with an assigned agent, updated before cutoff
    const { data: stuckTasks, error: taskError } = await supabase
      .from("tasks")
      .select("id, title, description, assigned_agent, updated_at, created_at")
      .eq("status", "in_progress")
      .not("assigned_agent", "is", null)
      .lt("updated_at", cutoff)
      .order("updated_at", { ascending: true })
      .limit(10);

    if (taskError) {
      console.error("[watchdog] Task query error:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    if (!stuckTasks || stuckTasks.length === 0) {
      return NextResponse.json({ ok: true, stuck: 0, retried: 0, message: "No stuck tasks" });
    }

    console.log(`[watchdog] Found ${stuckTasks.length} potentially stuck tasks`);

    const results: { task_id: string; title: string; action: string; agent: string }[] = [];

    for (const task of stuckTasks) {
      // Check activity specifically linked to this task
      const { data: taskActivity } = await supabase
        .from("agent_activity")
        .select("id, activity_type, created_at")
        .contains("metadata", { task_id: task.id })
        .order("created_at", { ascending: false })
        .limit(5);

      // Count how many times we've already retried (trigger entries for this task)
      const triggerCount = taskActivity?.filter(a => a.activity_type === "trigger").length || 0;

      // Skip if already completed or has recent linked activity
      const hasRecentLinkedActivity = taskActivity?.some(
        a => a.activity_type !== "trigger" && new Date(a.created_at) > new Date(cutoff)
      );

      if (hasRecentLinkedActivity) {
        console.log(`[watchdog] Task ${task.id} has recent activity, skipping`);
        results.push({ task_id: task.id, title: task.title, action: "skipped_has_activity", agent: task.assigned_agent });
        continue;
      }

      // Don't retry too many times
      if (triggerCount >= MAX_RETRIES) {
        console.log(`[watchdog] Task ${task.id} already retried ${triggerCount} times, marking as stuck`);

        // Log a stuck notification
        await supabase.from("agent_activity").insert({
          agent_id: task.assigned_agent,
          activity_type: "alert",
          title: `Task stuck after ${triggerCount} retries: ${task.title}`,
          summary: `Task has been in_progress for ${STUCK_THRESHOLD_MINUTES}+ min with ${triggerCount} trigger attempts. May need manual intervention.`,
          metadata: { task_id: task.id, retries: triggerCount, watchdog: true },
          status: "new",
        });

        results.push({ task_id: task.id, title: task.title, action: "max_retries_reached", agent: task.assigned_agent });
        continue;
      }

      // Re-trigger the agent
      console.log(`[watchdog] Re-triggering ${task.assigned_agent} for task ${task.id} (attempt ${triggerCount + 1})`);

      // Fetch feedback context
      let feedbackContext = "";
      try {
        const { data: feedback } = await supabase
          .from("agent_feedback")
          .select("action, feedback_note, task_title")
          .eq("agent_id", task.assigned_agent)
          .order("created_at", { ascending: false })
          .limit(5);

        if (feedback && feedback.length > 0) {
          const rejections = feedback.filter(f => f.action === "rejected" && f.feedback_note);
          if (rejections.length > 0) {
            feedbackContext = "\n\n--- LEARNING FROM PAST FEEDBACK ---\nRecent rejections to avoid:";
            for (const r of rejections.slice(0, 3)) {
              feedbackContext += `\n• "${r.task_title}": ${r.feedback_note}`;
            }
            feedbackContext += "\n--- END FEEDBACK ---";
          }
        }
      } catch { /* feedback is optional */ }

      const isSubAgent = task.assigned_agent !== "holly";
      const delegation = isSubAgent
        ? `\n\nDELEGATE TO: ${task.assigned_agent} — Spawn this as a sub-agent using sessions_spawn. Monitor its progress and report back to Mission Control when complete.`
        : "";

      const prompt = `MISSION CONTROL TASK REMINDER (retry ${triggerCount + 1}): ${task.title}${
        task.description ? `\n\nDetails: ${task.description}` : ""
      }${delegation}\n\nTask ID: ${task.id} — This task was assigned but no completion was received. ${
        isSubAgent
          ? `Spawn the ${task.assigned_agent} sub-agent to handle it.`
          : "Complete it now."
      } POST the result to Mission Control's /api/ingest endpoint with activity_type "task_complete" and metadata: {"task_id": "${task.id}"}${feedbackContext}

IMPORTANT: You MUST complete this task and POST your result. If you cannot complete it, POST a clarification request with activity_type "clarification" explaining what you need.`;

      // Queue to agent_activity
      await supabase.from("agent_activity").insert({
        agent_id: task.assigned_agent,
        activity_type: "trigger",
        title: `Retry: ${task.title}`,
        summary: `Watchdog retry #${triggerCount + 1} — no response after ${STUCK_THRESHOLD_MINUTES}+ min`,
        full_content: prompt,
        metadata: { task_id: task.id, queued: true, source: "watchdog", retry: triggerCount + 1 },
        status: "pending",
      });

      // Update task updated_at so we don't immediately re-trigger
      await supabase
        .from("tasks")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", task.id);

      // Try direct OpenClaw call (best-effort)
      try {
        const controller = new AbortController();
        // Holly on Gemini 2.5 Pro typically takes 10-15s to acknowledge;
        // 25s gives comfortable headroom within Vercel's function budget.
        const timeout = setTimeout(() => controller.abort(), 25000);

        // Always route through Holly — she orchestrates sub-agents
        const response = await fetch(OPENCLAW_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENCLAW_TOKEN}`,
            "x-openclaw-agent-id": "holly",
            ...(process.env.CF_ACCESS_CLIENT_ID && {
              "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID,
              "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET || "",
            }),
          },
          body: JSON.stringify({
            model: "openclaw:holly",
            messages: [{ role: "user", content: prompt }],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          results.push({ task_id: task.id, title: task.title, action: "retried_direct", agent: task.assigned_agent });
        } else {
          results.push({ task_id: task.id, title: task.title, action: "retried_queued", agent: task.assigned_agent });
        }
      } catch {
        results.push({ task_id: task.id, title: task.title, action: "retried_queued", agent: task.assigned_agent });
      }
    }

    const retriedCount = results.filter(r => r.action.startsWith("retried")).length;
    console.log(`[watchdog] Done. ${retriedCount} tasks retried out of ${stuckTasks.length} stuck.`);

    return NextResponse.json({
      ok: true,
      stuck: stuckTasks.length,
      retried: retriedCount,
      results,
    });
  } catch (err) {
    console.error("[watchdog] Error:", err);
    return NextResponse.json({ error: "Watchdog failed" }, { status: 500 });
  }
}
