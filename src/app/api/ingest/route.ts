import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SPECIAL_TYPES: Record<string, string> = {
  infra_snapshot: "infra_snapshots",
  goal_snapshot: "goal_snapshots",
  lead_snapshot: "lead_snapshots",
  social_post: "social_posts",
  task: "tasks",
  kb_gap: "kb_gaps",
};

export async function POST(request: NextRequest) {
  // Verify API key
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
    const { activity_type, agent_id, title, summary, full_content, metadata, workflow } = body;

    if (!activity_type || !agent_id) {
      return NextResponse.json(
        { error: "Missing required fields: activity_type, agent_id" },
        { status: 400 }
      );
    }

    // If the agent references a task_id, auto-update that task to "review"
    // But NOT for clarification requests — those should leave the task in progress
    const taskId = metadata?.task_id as string | undefined;
    if (taskId && activity_type !== "clarification") {
      try {
        const { error: taskError } = await supabase
          .from("tasks")
          .update({
            status: "review",
            updated_at: new Date().toISOString(),
          })
          .eq("id", taskId)
          .in("status", ["in_progress", "todo"]); // Only update if still active

        if (taskError) {
          console.warn(`[ingest] Could not update task ${taskId}:`, taskError.message);
        } else {
          console.log(`[ingest] Task ${taskId} moved to review`);
        }
      } catch (e) {
        console.warn("[ingest] Task update failed:", e);
      }
    }

    // Route to specialised table if applicable
    const specialTable = SPECIAL_TYPES[activity_type];

    if (specialTable) {
      // For special types, insert the metadata/content into the appropriate table
      // Note: don't spread metadata for infra_snapshots — only use explicit fields
      const insertData = {
        ...(specialTable !== "infra_snapshots" ? metadata : {}),
        ...(specialTable === "social_posts" && {
          platform: metadata?.platform || "linkedin",
          content: full_content || title,
          status: "draft",
          agent_id,
        }),
        ...(specialTable === "tasks" && {
          title,
          description: full_content || summary,
          status: "todo",
          source: "agent",
          assigned_agent: agent_id,
          source_workflow: workflow,
        }),
        ...(specialTable === "kb_gaps" && {
          topic: title,
          status: "identified",
        }),
        ...(specialTable === "infra_snapshots" && {
          containers: metadata?.containers || [],
          disk_usage: metadata?.disk_usage,
          memory_usage: metadata?.memory_usage,
          alerts: metadata?.alerts || [],
          edge_functions: metadata?.edge_functions || [],
          cpu_usage: metadata?.cpu_usage || null,
          array_disk_usage: metadata?.array_disk_usage || null,
          health_status: metadata?.health_status || "unknown",
          system_uptime: metadata?.system_uptime || null,
          prometheus_up: metadata?.prometheus_up ?? false,
          alertmanager_up: metadata?.alertmanager_up ?? false,
          prometheus: metadata?.prometheus || {},
        }),
        ...(specialTable === "goal_snapshots" && {
          snapshot_date: metadata?.snapshot_date || new Date().toISOString().split("T")[0],
          period_type: metadata?.period_type || "monthly",
          metrics: metadata?.metrics || {},
          alerts: metadata?.alerts || [],
          corrective_actions: metadata?.corrective_actions || [],
        }),
        ...(specialTable === "lead_snapshots" && {
          snapshot_date: metadata?.snapshot_date || new Date().toISOString().split("T")[0],
          total_leads: metadata?.total_leads || 0,
          by_status: metadata?.by_status || {},
          by_source: metadata?.by_source || {},
          deals_pipeline: metadata?.deals_pipeline || {},
          total_pipeline_value: metadata?.total_pipeline_value || 0,
        }),
      };

      const { error } = await supabase.from(specialTable).insert(insertData);

      if (error) {
        console.error(`[ingest] Error inserting into ${specialTable}:`, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // Suppress routine infra_snapshot activity entries — only log to feed when:
    // 1. Health is degraded/critical (something is wrong)
    // 2. There are active alerts
    // 3. It's a morning (7-9am) or afternoon (14-16pm) summary window
    // The infra_snapshots table ALWAYS gets the data (above) — this just controls the activity feed noise.
    const isInfraRoutine = activity_type === "infra_snapshot";
    let skipActivityLog = false;

    if (isInfraRoutine) {
      const healthStatus = metadata?.health_status || "unknown";
      const alertCount = Array.isArray(metadata?.alerts) ? metadata.alerts.length : 0;
      const hour = new Date().getUTCHours(); // UTC
      // Morning window: 7-9 UTC, Afternoon: 14-16 UTC (adjust for your timezone)
      const isSummaryWindow = (hour >= 7 && hour < 9) || (hour >= 14 && hour < 16);
      const isUrgent = healthStatus === "degraded" || healthStatus === "critical" || alertCount > 0;

      if (!isUrgent && !isSummaryWindow) {
        skipActivityLog = true;
      }
    }

    if (!skipActivityLog) {
      const { data, error } = await supabase
        .from("agent_activity")
        .insert({
          agent_id,
          activity_type,
          title: title || "Untitled",
          summary,
          full_content,
          metadata: metadata || {},
          workflow,
          status: "new",
        })
        .select("id")
        .single();

      if (error) {
        console.error("[ingest] Error inserting activity:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
    }

    // Infra snapshot saved to table but activity feed suppressed (routine healthy check)
    return NextResponse.json({ ok: true, id: null, suppressed: true }, { status: 201 });
  } catch (err) {
    console.error("[ingest] Unexpected error:", err);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
