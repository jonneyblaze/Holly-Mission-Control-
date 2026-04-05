import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { triggerAgent } from "@/lib/agent-trigger";

// Matches /api/trigger-agent — Holly's direct call needs up to 25s + DB writes.
export const maxDuration = 30;

/**
 * One-shot helper: create a Kanban task row AND fire the assigned agent in a
 * single call. Replaces the old two-step flow of:
 *   1. POST /api/ingest with activity_type=task to create the row
 *   2. Query tasks table to get the new id
 *   3. POST /api/trigger-agent with that id
 *
 * Dedup: if an open task (status in todo/in_progress/review) already exists
 * with the same (title, assigned_agent), we reuse its id and still fire the
 * trigger so the agent gets a fresh brief.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const apiKey = process.env.INGEST_API_KEY;

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await request.json();
    const {
      agent_id,
      title,
      description,
      summary,
      priority,
      segment,
      due_date,
      source_workflow,
      trigger = true, // allow callers to create without triggering if needed
    } = body;

    if (!agent_id || !title) {
      return NextResponse.json(
        { error: "Missing required fields: agent_id, title" },
        { status: 400 }
      );
    }

    // 1. Dedup check — match any open task by (title, assigned_agent)
    let taskId: string | null = null;
    let deduped = false;

    const { data: existing } = await supabase
      .from("tasks")
      .select("id, status")
      .eq("title", title)
      .eq("assigned_agent", agent_id)
      .in("status", ["todo", "in_progress", "review"])
      .limit(1);

    if (existing && existing.length > 0) {
      taskId = existing[0].id;
      deduped = true;

      // Bump updated_at so Sean can see it's "active" again
      await supabase
        .from("tasks")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", taskId);

      console.log(
        `[create-and-trigger] Reusing existing open task ${taskId} for ${agent_id}: "${title}"`
      );
    } else {
      // 2. Create new task row
      const { data: created, error: createError } = await supabase
        .from("tasks")
        .insert({
          title,
          description: description || summary,
          status: "todo",
          source: "mission-control",
          assigned_agent: agent_id,
          priority: priority || null,
          segment: segment || null,
          due_date: due_date || null,
          source_workflow: source_workflow || null,
        })
        .select("id")
        .single();

      if (createError || !created) {
        console.error("[create-and-trigger] Task insert failed:", createError?.message);
        return NextResponse.json(
          { error: createError?.message || "Failed to create task" },
          { status: 500 }
        );
      }

      taskId = created.id;
      console.log(`[create-and-trigger] Created new task ${taskId} for ${agent_id}: "${title}"`);
    }

    // 3. Fire the trigger (unless caller explicitly opted out)
    if (!trigger) {
      return NextResponse.json({
        ok: true,
        task_id: taskId,
        deduped,
        triggered: false,
        message: "Task created (trigger skipped)",
      });
    }

    const { queued, directTriggered } = await triggerAgent(
      supabase,
      agent_id,
      title,
      description || summary,
      taskId!
    );

    return NextResponse.json({
      ok: true,
      task_id: taskId,
      deduped,
      triggered: true,
      queued,
      directTriggered,
      agent_id,
      message: directTriggered
        ? `Task ${deduped ? "reused" : "created"}, agent working on it now`
        : `Task ${deduped ? "reused" : "created"}, queued for agent pickup`,
    });
  } catch (err) {
    console.error("[create-and-trigger] Error:", err);
    return NextResponse.json({ error: "Failed to create-and-trigger" }, { status: 500 });
  }
}
