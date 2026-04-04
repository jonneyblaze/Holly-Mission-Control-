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

    // Try direct OpenClaw API call first (works from LAN)
    let triggered = false;
    let agentResponse = "";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(OPENCLAW_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENCLAW_TOKEN}`,
          "x-openclaw-agent-id": agent_id,
        },
        body: JSON.stringify({
          model: `openclaw:${agent_id}`,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        agentResponse = data?.choices?.[0]?.message?.content || "";
        triggered = true;
      }
    } catch {
      // Direct call failed (likely Cloudflare Access or network issue)
      console.log("[trigger-agent] Direct OpenClaw call failed, queueing via Supabase");
    }

    // If direct call failed, queue the trigger via Supabase
    // Agents poll this table via their cron jobs
    if (!triggered) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && serviceKey) {
        const supabase = createClient(supabaseUrl, serviceKey);

        // Log as agent_activity so agents can find it
        await supabase.from("agent_activity").insert({
          agent_id,
          activity_type: "trigger",
          title: `Task: ${task_title}`,
          summary: task_description || null,
          full_content: prompt,
          metadata: { task_id, queued: true, source: "mission-control" },
          status: "pending",
        });

        return NextResponse.json({
          ok: true,
          queued: true,
          agent_id,
          task_id,
          message: "Task queued — agent will pick it up shortly",
        });
      }

      return NextResponse.json(
        { error: "Failed to trigger agent and couldn't queue" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      queued: false,
      agent_id,
      task_id,
      response: agentResponse.substring(0, 500),
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
    ? `\n\nTask ID: ${taskId} — When done, POST your result to Mission Control's /api/ingest endpoint with activity_type "task" and include this task_id in metadata.`
    : "";

  return `TASK ASSIGNED: ${taskTitle}${desc}${taskRef}

Please complete this task now. When finished, POST your result to Mission Control using the curl command from your SOUL.md instructions. If you need more information to complete this task, POST a clarification request to Mission Control with activity_type "clarification" and metadata: {"task_id": "${taskId || "unknown"}"} — you may only ask for clarification ONCE.`;
}
