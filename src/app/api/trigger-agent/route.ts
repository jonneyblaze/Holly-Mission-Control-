import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const OPENCLAW_URL = process.env.OPENCLAW_GATEWAY_URL || "https://openclaw.naboo.network/v1/chat/completions";
const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const apiKey = process.env.INGEST_API_KEY;

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { agent_id, task_title, task_description, task_id } = body;

    if (!agent_id || !task_title) {
      return NextResponse.json(
        { error: "Missing required fields: agent_id, task_title" },
        { status: 400 }
      );
    }

    const prompt = buildPrompt(agent_id, task_title, task_description, task_id);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // ALWAYS queue the task to Supabase first (reliable — works on serverless)
    let queued = false;
    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey);

      const { error: queueError } = await supabase.from("agent_activity").insert({
        agent_id,
        activity_type: "trigger",
        title: `Task: ${task_title}`,
        summary: task_description || null,
        full_content: prompt,
        metadata: { task_id, queued: true, source: "mission-control" },
        status: "pending",
      });

      if (!queueError) {
        queued = true;
      } else {
        console.error("[trigger-agent] Queue error:", queueError.message);
      }
    }

    // ALSO try direct OpenClaw call (best-effort, with timeout)
    // On serverless, this must complete before the response is sent
    let directTriggered = false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(OPENCLAW_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENCLAW_TOKEN}`,
          "x-openclaw-agent-id": agent_id,
          ...(process.env.CF_ACCESS_CLIENT_ID && {
            "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID,
            "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET || "",
          }),
        },
        body: JSON.stringify({
          model: `openclaw:${agent_id}`,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        directTriggered = true;

        // Mark the queued trigger as actioned since we triggered directly
        if (queued && supabaseUrl && serviceKey) {
          const supabase = createClient(supabaseUrl, serviceKey);
          await supabase
            .from("agent_activity")
            .update({ status: "actioned" })
            .eq("agent_id", agent_id)
            .eq("activity_type", "trigger")
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(1);
        }
      } else {
        console.log(`[trigger-agent] Direct call returned ${response.status}, relying on queue`);
      }
    } catch (err) {
      // Timeout or network error — task is queued, agent will pick it up via cron
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (isAbort) {
        // Timeout means we don't know if agent received it — keep it queued as fallback
        console.log("[trigger-agent] Direct call timed out — relying on queue as backup");
      } else {
        console.log("[trigger-agent] Direct call failed, relying on queue");
      }
    }

    if (!queued && !directTriggered) {
      return NextResponse.json(
        { error: "Failed to trigger agent and couldn't queue" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      queued,
      directTriggered,
      agent_id,
      task_id,
      message: directTriggered
        ? "Agent triggered — working on it now"
        : "Task queued — agent will pick it up shortly",
    });
  } catch (err) {
    console.error("[trigger-agent] Error:", err);
    return NextResponse.json({ error: "Failed to trigger agent" }, { status: 500 });
  }
}

function buildPrompt(
  agentId: string,
  taskTitle: string,
  taskDescription: string | undefined,
  taskId: string | undefined
): string {
  const desc = taskDescription ? `\n\nDetails: ${taskDescription}` : "";
  const taskRef = taskId
    ? `\n\nTask ID: ${taskId} — When done, POST your result to Mission Control's /api/ingest endpoint with activity_type "task_complete" (NOT "task") and include this task_id in metadata like: "metadata": {"task_id": "${taskId}"}`
    : "";

  return `TASK ASSIGNED: ${taskTitle}${desc}${taskRef}

Please complete this task now. When finished, POST your result to Mission Control using the curl command from your SOUL.md instructions. Use activity_type "task_complete" and include a title, summary, and full_content with your results. The task will automatically be moved to review.

If you need more information to complete this task, POST a clarification request to Mission Control with activity_type "clarification" and metadata: {"task_id": "${taskId || "unknown"}"} — you may only ask for clarification ONCE.`;
}
