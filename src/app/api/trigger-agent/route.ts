import { NextRequest, NextResponse } from "next/server";

const OPENCLAW_URL = process.env.OPENCLAW_GATEWAY_URL || "https://openclaw.naboo.network/v1/chat/completions";
const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";

export async function POST(request: NextRequest) {
  // Verify caller is authenticated (use same ingest key for now)
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
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[trigger-agent] OpenClaw error: ${response.status}`, errorText);
      return NextResponse.json(
        { error: `OpenClaw returned ${response.status}`, detail: errorText },
        { status: 502 }
      );
    }

    const data = await response.json();
    const agentResponse = data?.choices?.[0]?.message?.content || "";

    return NextResponse.json({
      ok: true,
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
  const taskRef = taskId ? `\n\nTask ID: ${taskId} — When done, POST your result to Mission Control's /api/ingest endpoint with activity_type "task" and include this task_id in metadata.` : "";

  return `TASK ASSIGNED: ${taskTitle}${desc}${taskRef}

Please complete this task now. When finished, POST your result to Mission Control using the curl command from your SOUL.md instructions. If you need more information to complete this task, POST a clarification request to Mission Control with activity_type "clarification" and metadata: {"task_id": "${taskId || "unknown"}"} — you may only ask for clarification ONCE.`;
}
