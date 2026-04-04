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

    // Try direct OpenClaw API call with streaming
    // We use stream:true so we get an immediate response confirming the agent started,
    // then we don't wait for the full completion
    let triggered = false;

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
          stream: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // If we get a 200 with streaming, the agent has started
      if (response.ok && response.body) {
        triggered = true;
        // Don't await the full stream — just confirm it started
        // The agent will complete in the background and POST results to /api/ingest
        try {
          const reader = response.body.getReader();
          // Read just the first chunk to confirm streaming started
          const { value } = await reader.read();
          if (value) {
            triggered = true;
          }
          // Cancel the stream — we don't need to wait for the full response
          reader.cancel();
        } catch {
          // Stream read failed but response was ok, agent likely started
          triggered = true;
        }
      } else if (response.ok) {
        // Non-streaming 200 response
        triggered = true;
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (!isAbort) {
        console.log("[trigger-agent] Direct OpenClaw call failed, queueing via Supabase");
      }
    }

    // If direct call failed, queue the trigger via Supabase
    if (!triggered) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && serviceKey) {
        const supabase = createClient(supabaseUrl, serviceKey);

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
      message: "Agent triggered — working on it now",
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
