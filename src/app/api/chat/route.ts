import { NextRequest, NextResponse } from "next/server";

const OPENCLAW_URL = process.env.OPENCLAW_GATEWAY_URL || "https://openclaw.naboo.network/v1/chat/completions";
const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";

// Cloudflare Access service token for Vercel → OpenClaw tunnel
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

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

    // If no gateway token configured, don't even try
    if (!OPENCLAW_TOKEN) {
      return NextResponse.json({
        ok: false,
        reply: "Holly's gateway connection isn't configured yet. Add OPENCLAW_GATEWAY_TOKEN to your environment variables, or message Holly on Telegram instead!",
      }, { status: 200 });
    }

    // If going through Cloudflare tunnel without service token, fail fast
    const isTunnel = OPENCLAW_URL.includes("naboo.network") || OPENCLAW_URL.includes("cloudflare");
    if (isTunnel && !CF_CLIENT_ID) {
      return NextResponse.json({
        ok: false,
        reply: "Holly lives behind a Cloudflare tunnel and I need access credentials to reach her from the cloud. Ask Sean to set up a Cloudflare Access Service Token, or message Holly on Telegram — she's online there! 💬",
      }, { status: 200 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENCLAW_TOKEN}`,
      "x-openclaw-agent-id": agent_id,
      "x-openclaw-session-key": `mission-control-chat-${agent_id}`,
    };

    // Add Cloudflare Access service token headers if configured
    if (CF_CLIENT_ID) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }

    const response = await fetch(OPENCLAW_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: `openclaw:${agent_id}`,
        messages: [{ role: "user", content: message }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      // Check if it's a Cloudflare Access redirect/block
      if (response.status === 302 || response.status === 403 || errorText.includes("cloudflareaccess") || errorText.includes("Access denied")) {
        return NextResponse.json({
          ok: false,
          reply: "Cloudflare Access blocked the request — the service token may be invalid or expired. Message Holly on Telegram instead! 💬",
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
        reply: "Holly is taking too long to respond. She might be busy with another task — try again in a moment, or message her on Telegram! 💬",
      }, { status: 200 });
    }

    console.error("[chat] Error:", err);
    return NextResponse.json({
      ok: false,
      reply: "Can't reach Holly right now — she's behind the Cloudflare tunnel. Message her on Telegram instead! 💬",
    }, { status: 200 });
  }
}
