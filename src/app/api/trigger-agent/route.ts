import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { triggerAgent } from "@/lib/agent-trigger";

// Agent calls via OpenClaw can take ~20s (model generation + response parsing).
// Allow up to 60s for the whole function to avoid premature serverless termination.
export const maxDuration = 60;

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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { queued, directTriggered } = await triggerAgent(
      supabase,
      agent_id,
      task_title,
      task_description,
      task_id
    );

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
