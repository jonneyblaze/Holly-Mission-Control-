import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// POST: Record feedback (approve/reject) for agent learning
// GET: Retrieve feedback history for an agent (used by trigger-agent to build learning context)

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await request.json();
    const { task_id, agent_id, action, feedback_note, task_title, task_summary, attempt_number } = body;

    if (!agent_id || !action) {
      return NextResponse.json(
        { error: "Missing required fields: agent_id, action" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("agent_feedback")
      .insert({
        task_id: task_id || null,
        agent_id,
        action, // 'approved' or 'rejected'
        feedback_note: feedback_note || null,
        task_title: task_title || null,
        task_summary: task_summary || null,
        attempt_number: attempt_number || 1,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[agent-feedback] Insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
  } catch (err) {
    console.error("[agent-feedback] Error:", err);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

// GET: Fetch recent feedback for an agent (for building learning context in prompts)
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const agentId = searchParams.get("agent_id");

  if (!agentId) {
    return NextResponse.json({ error: "agent_id required" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Get last 20 feedback entries for this agent
  const { data, error } = await supabase
    .from("agent_feedback")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Build a summary: approval rate, common rejection reasons
  const total = data?.length || 0;
  const approved = data?.filter((f) => f.action === "approved").length || 0;
  const rejected = data?.filter((f) => f.action === "rejected").length || 0;
  const rejectionReasons = data
    ?.filter((f) => f.action === "rejected" && f.feedback_note)
    .map((f) => ({ note: f.feedback_note, task: f.task_title, date: f.created_at }))
    .slice(0, 10); // Last 10 rejection reasons

  return NextResponse.json({
    agent_id: agentId,
    total,
    approved,
    rejected,
    approval_rate: total > 0 ? Math.round((approved / total) * 100) : null,
    recent_rejections: rejectionReasons,
    recent_feedback: data?.slice(0, 10),
  });
}
