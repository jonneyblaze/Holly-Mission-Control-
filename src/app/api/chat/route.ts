import { NextRequest, NextResponse } from "next/server";

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
    const { message, agent_id = "holly" } = body;

    if (!message) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(OPENCLAW_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENCLAW_TOKEN}`,
        "x-openclaw-agent-id": agent_id,
        "x-openclaw-session-key": `mission-control-chat-${agent_id}`,
      },
      body: JSON.stringify({
        model: `openclaw:${agent_id}`,
        messages: [{ role: "user", content: message }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      // Check if it's a Cloudflare Access redirect
      if (response.status === 302 || response.status === 403 || errorText.includes("cloudflareaccess")) {
        return NextResponse.json({
          error: "cloudflare_access",
          reply: "I can only chat when you're on the local network (LAN). The Vercel deployment can't reach OpenClaw through Cloudflare Access yet. Run the dashboard locally or use Telegram to talk to me!",
        }, { status: 200 });
      }
      return NextResponse.json(
        { error: `Agent returned ${response.status}`, detail: errorText },
        { status: 502 }
      );
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || "No response";

    return NextResponse.json({ ok: true, reply, agent_id });
  } catch (err) {
    // AbortController timeout or network error
    const isAbort = err instanceof DOMException && err.name === "AbortError";
    if (isAbort) {
      return NextResponse.json({
        ok: false,
        reply: "Holly is taking too long to respond. She might be busy with another task. Try again in a moment!",
      }, { status: 200 });
    }

    console.error("[chat] Error:", err);
    return NextResponse.json({
      ok: false,
      reply: "Can't reach Holly right now. If you're on Vercel, the chat only works from the local network. Use Telegram to message Holly directly!",
    }, { status: 200 });
  }
}
