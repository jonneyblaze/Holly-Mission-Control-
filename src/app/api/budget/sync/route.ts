import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchOpenRouterBudget,
  shouldWriteSnapshot,
  tierLabel,
  type BudgetSnapshotMetadata,
} from "@/lib/budget";

/**
 * POST /api/budget/sync  — pulls the current OpenRouter spend and writes a
 * `budget_snapshot` row to `agent_activity` when the tier has changed or the
 * last snapshot is stale (>1 hour old). Intended to be called by the 15-min
 * cron; also safe to call manually from the dashboard.
 *
 * Auth: Bearer token via `INGEST_API_KEY` env (same token the cron already
 * uses for other Mission Control writes).
 *
 * GET is allowed too so you can poke it from a browser during dev — same
 * behaviour, just returns the current state without requiring a POST body.
 */

async function handler(request: NextRequest) {
  // Auth: either Vercel Cron secret, INGEST_API_KEY, or localhost in dev
  // (same pattern as /api/task-watchdog).
  const authHeader = request.headers.get("authorization");
  const cronSecret = request.headers.get("x-vercel-cron-secret");
  const apiKey = process.env.INGEST_API_KEY;
  const vercelCronSecret = process.env.CRON_SECRET;
  const isAuthed =
    (apiKey && authHeader === `Bearer ${apiKey}`) ||
    (vercelCronSecret && cronSecret === vercelCronSecret) ||
    (vercelCronSecret && authHeader === `Bearer ${vercelCronSecret}`) ||
    request.headers.get("host")?.includes("localhost");
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY not configured" },
      { status: 500 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let current: BudgetSnapshotMetadata;
  try {
    current = await fetchOpenRouterBudget(openRouterKey);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OpenRouter fetch failed" },
      { status: 502 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Read the latest snapshot to decide whether to write a new row.
  const { data: latest } = await supabase
    .from("agent_activity")
    .select("id, metadata, created_at")
    .eq("agent_id", "system")
    .eq("activity_type", "budget_snapshot")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previous = (latest?.metadata as BudgetSnapshotMetadata | null) ?? null;
  const write = shouldWriteSnapshot(current, previous);
  const tierChanged = previous && previous.current_tier !== current.current_tier;

  let snapshotId: string | null = null;
  if (write) {
    const { data, error } = await supabase
      .from("agent_activity")
      .insert({
        agent_id: "system",
        activity_type: "budget_snapshot",
        title: `Budget ${current.current_tier.toUpperCase()} — ${current.pct_used}% of $${current.limit_usd}`,
        summary: `${tierLabel(current.current_tier)}. Spent $${current.spent_usd_mtd} / $${current.limit_usd} MTD ($${current.remaining_usd} remaining).`,
        metadata: current,
        status: current.current_tier,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    snapshotId = data.id;
  }

  return NextResponse.json({
    ok: true,
    wrote_snapshot: write,
    tier_changed: tierChanged,
    snapshot_id: snapshotId,
    state: current,
  });
}

export async function POST(request: NextRequest) {
  return handler(request);
}

export async function GET(request: NextRequest) {
  return handler(request);
}
