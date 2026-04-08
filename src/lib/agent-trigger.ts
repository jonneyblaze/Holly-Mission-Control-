import type { SupabaseClient } from "@supabase/supabase-js";

const OPENCLAW_URL =
  process.env.OPENCLAW_GATEWAY_URL || "https://openclaw.naboo.network/v1/chat/completions";
const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";

interface FeedbackEntry {
  action: string;
  feedback_note: string | null;
  task_title: string | null;
  created_at: string;
}

/**
 * Fetch recent approve/reject feedback for an agent so Holly can learn from
 * past outcomes when building the prompt.
 */
export async function fetchAgentFeedback(
  supabase: SupabaseClient,
  agentId: string
): Promise<string> {
  try {
    const { data } = await supabase
      .from("agent_feedback")
      .select("action, feedback_note, task_title, created_at")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(15);

    if (!data || data.length === 0) return "";

    const entries = data as FeedbackEntry[];
    const approved = entries.filter((f) => f.action === "approved").length;
    const rejected = entries.filter((f) => f.action === "rejected").length;
    const rejections = entries
      .filter((f) => f.action === "rejected" && f.feedback_note)
      .slice(0, 5);

    let context = `\n\n--- LEARNING FROM PAST FEEDBACK ---\nYour recent approval rate: ${approved}/${approved + rejected} tasks approved.`;

    if (rejections.length > 0) {
      context += `\n\nRecent rejections (LEARN from these — do NOT repeat these mistakes):`;
      for (const r of rejections) {
        context += `\n• Task "${r.task_title}": ${r.feedback_note}`;
      }
    }

    const approvals = entries
      .filter((f) => f.action === "approved" && f.feedback_note)
      .slice(0, 3);

    if (approvals.length > 0) {
      context += `\n\nRecent approvals (this is the quality standard to maintain):`;
      for (const a of approvals) {
        context += `\n• Task "${a.task_title}"${a.feedback_note ? `: ${a.feedback_note}` : ""}`;
      }
    }

    context += `\n--- END FEEDBACK ---\n`;
    return context;
  } catch (err) {
    console.warn("[agent-trigger] Could not fetch feedback:", err);
    return "";
  }
}

/**
 * Build the prompt sent directly to the assigned agent.
 *
 * Pre-2026-04-06: ALL tasks were routed through Holly, who would spawn
 * the target agent as a sub-agent. This caused the Holly runaway incident
 * ($6.58 in 20min) — a 30-route QA task was sent to Holly who delegated
 * to bl-qa as a subagent; the 5min subagent timeout triggered cascade,
 * and each fallback level carried forward Holly's growing conversation.
 *
 * Now: triggers go directly to the assigned agent. The agent itself can
 * spawn sub-agents via its own tools if it needs to. Holly is just
 * another agent you explicitly choose, not the default wrapper.
 */
export async function buildPrompt(
  supabase: SupabaseClient,
  agentId: string,
  taskTitle: string,
  taskDescription: string | undefined,
  taskId: string | undefined
): Promise<string> {
  const desc = taskDescription ? `\n\nDetails: ${taskDescription}` : "";
  const taskRef = taskId
    ? `\n\nTask ID: ${taskId} — When done, POST your result to Mission Control's /api/ingest endpoint with activity_type "task_complete" (NOT "task") and include this task_id in metadata like: "metadata": {"task_id": "${taskId}"}`
    : "";

  const feedbackContext = await fetchAgentFeedback(supabase, agentId);

  return `MISSION CONTROL TASK: ${taskTitle}${desc}${taskRef}${feedbackContext}

Complete this task now. When finished, POST your result to Mission Control's /api/ingest endpoint with activity_type "task_complete". Include a title, summary, and full_content with your results.

The task will automatically be moved to review in the Kanban board.

If you need more information, POST a clarification request to Mission Control with activity_type "clarification" and metadata: {"task_id": "${taskId || "unknown"}"} — you may only ask for clarification ONCE.`;
}

export interface TriggerResult {
  queued: boolean;
  directTriggered: boolean;
  prompt: string;
}

/**
 * Core trigger logic: queue to agent_activity as a reliable fallback, then
 * attempt a direct OpenClaw call to the assigned agent.
 *
 * Previously hardcoded to Holly — now routes directly to the target agent
 * via `x-openclaw-agent-id` and `model: "openclaw:<agentId>"`.
 */
export async function triggerAgent(
  supabase: SupabaseClient,
  agentId: string,
  taskTitle: string,
  taskDescription: string | undefined,
  taskId: string | undefined
): Promise<TriggerResult> {
  const prompt = await buildPrompt(supabase, agentId, taskTitle, taskDescription, taskId);

  // 1. Always queue to Supabase first for reliability
  let queued = false;
  const { error: queueError } = await supabase.from("agent_activity").insert({
    agent_id: agentId,
    activity_type: "trigger",
    title: `Task: ${taskTitle}`,
    summary: taskDescription || null,
    full_content: prompt,
    metadata: { task_id: taskId, queued: true, source: "mission-control" },
    status: "pending",
  });

  if (!queueError) {
    queued = true;
  } else {
    console.error("[agent-trigger] Queue error:", queueError.message);
  }

  // 2. Try direct OpenClaw call (best-effort)
  let directTriggered = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const response = await fetch(OPENCLAW_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENCLAW_TOKEN}`,
        "x-openclaw-agent-id": agentId,
        ...(process.env.CF_ACCESS_CLIENT_ID && {
          "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID,
          "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET || "",
        }),
      },
      body: JSON.stringify({
        model: `openclaw:${agentId}`,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      directTriggered = true;

      // Mark the queued trigger as actioned
      if (queued) {
        await supabase
          .from("agent_activity")
          .update({ status: "actioned" })
          .eq("agent_id", agentId)
          .eq("activity_type", "trigger")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1);
      }

      // Parse the agent's response and extract ingest payloads
      // The gateway returns tool calls as text — execute them server-side
      try {
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || "";
        await extractAndIngest(supabase, agentId, content);
      } catch (parseErr) {
        console.log(`[agent-trigger] Could not parse response for ingest extraction:`, parseErr);
      }
    } else {
      console.log(`[agent-trigger] Direct call to ${agentId} returned ${response.status}, relying on queue`);
    }
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === "AbortError";
    if (isAbort) {
      console.log(`[agent-trigger] Direct call to ${agentId} timed out — relying on queue as backup`);
    } else {
      console.log(`[agent-trigger] Direct call to ${agentId} failed, relying on queue`);
    }
  }

  return { queued, directTriggered, prompt };
}

/**
 * Extract ingest payloads from the agent's text response and insert them
 * directly into the appropriate tables. This handles the case where the
 * OpenClaw gateway returns tool calls as text instead of executing them.
 */
async function extractAndIngest(
  supabase: SupabaseClient,
  agentId: string,
  content: string
): Promise<void> {
  // Match JSON bodies from web_fetch calls targeting /api/ingest
  const jsonBlocks = content.match(/\{[^{}]*"activity_type"\s*:\s*"[^"]+?"[^{}]*\}/g);
  if (!jsonBlocks || jsonBlocks.length === 0) return;

  let ingested = 0;
  for (const block of jsonBlocks) {
    try {
      const payload = JSON.parse(block);
      const activityType = payload.activity_type;
      if (!activityType) continue;

      if (activityType === "social_post") {
        const { error } = await supabase.from("social_posts").insert({
          platform: payload.metadata?.platform || "linkedin",
          content: payload.full_content || payload.content || payload.title,
          status: "draft",
          agent_id: agentId,
          scheduled_date: payload.metadata?.scheduled_date || null,
        });
        if (!error) ingested++;
        else console.log(`[agent-trigger] social_post insert failed:`, error.message);
      } else if (activityType === "task_complete") {
        // Log task completion to agent_activity
        await supabase.from("agent_activity").insert({
          agent_id: agentId,
          activity_type: "task_complete",
          title: payload.title || "Task completed",
          summary: payload.summary || null,
          full_content: payload.full_content || null,
          status: "new",
        });
      } else {
        // Generic ingest to agent_activity
        await supabase.from("agent_activity").insert({
          agent_id: agentId,
          activity_type: activityType,
          title: payload.title || activityType,
          summary: payload.summary || null,
          full_content: payload.full_content || null,
          metadata: payload.metadata || {},
          status: "new",
        });
      }
    } catch {
      // Skip unparseable blocks
    }
  }

  if (ingested > 0) {
    console.log(`[agent-trigger] Extracted and ingested ${ingested} items from ${agentId} response`);
  }
}
