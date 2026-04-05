import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchOpenRouterBudget,
  tierColour,
  tierLabel,
  type BudgetSnapshotMetadata,
} from "@/lib/budget";

/**
 * GET /api/budget/state  — read-only dashboard endpoint.
 *
 * Returns:
 *   - `current`: the live OpenRouter spend (fresh fetch, ~1s)
 *   - `lastSnapshot`: the most recent row from `agent_activity`
 *   - `history`: up to 100 recent `budget_snapshot` rows for the burn-down chart
 *
 * If OpenRouter is unreachable the endpoint falls back to `lastSnapshot` so the
 * dashboard never goes dark.
 */
export async function GET() {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Pull history in parallel with the live fetch.
  const historyPromise = supabase
    .from("agent_activity")
    .select("id, metadata, created_at")
    .eq("agent_id", "system")
    .eq("activity_type", "budget_snapshot")
    .order("created_at", { ascending: false })
    .limit(100);

  let current: BudgetSnapshotMetadata | null = null;
  let liveError: string | null = null;
  if (openRouterKey) {
    try {
      current = await fetchOpenRouterBudget(openRouterKey);
    } catch (err) {
      liveError = err instanceof Error ? err.message : "OpenRouter fetch failed";
    }
  } else {
    liveError = "OPENROUTER_API_KEY not configured";
  }

  const { data: historyRows, error: historyError } = await historyPromise;
  if (historyError) {
    return NextResponse.json({ error: historyError.message }, { status: 500 });
  }

  const history = (historyRows ?? []).map((r) => ({
    id: r.id as string,
    created_at: r.created_at as string,
    snapshot: r.metadata as BudgetSnapshotMetadata,
  }));
  const lastSnapshot = history[0] ?? null;

  // If live fetch failed, degrade gracefully to the last known snapshot.
  const effective = current ?? lastSnapshot?.snapshot ?? null;

  return NextResponse.json({
    ok: true,
    live_error: liveError,
    current: effective,
    tier_label: effective ? tierLabel(effective.current_tier) : null,
    tier_colour: effective ? tierColour(effective.current_tier) : null,
    last_snapshot: lastSnapshot,
    history,
  });
}
