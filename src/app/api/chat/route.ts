import { NextRequest, NextResponse } from "next/server";

const OPENCLAW_URL = "http://10.0.1.100:18789/v1/chat/completions";
const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const apiKey = process.env.INGEST_API_KEY;

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { message, agent_id = "holly" } = body;

    if (!message) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    const response = await fetch(OPENCLAW_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENCLAW_TOKEN}`,
        "x-openclaw-agent-id": agent_id,
        // Use a stable session key so Holly remembers the conversation
        "x-openclaw-session-key": `mission-control-chat-${agent_id}`,
      },
      body: JSON.stringify({
        model: `openclaw:${agent_id}`,
        messages: [{ role: "user", content: message }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Agent returned ${response.status}`, detail: errorText },
        { status: 502 }
      );
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || "No response";

    return NextResponse.json({ ok: true, reply, agent_id });
  } catch (err) {
    console.error("[chat] Error:", err);
    return NextResponse.json({ error: "Failed to reach agent" }, { status: 500 });
  }
}
