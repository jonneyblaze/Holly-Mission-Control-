import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Must be dynamic — hits OpenRouter live + reads the latest DB snapshot.
// Without this, Vercel prerenders the response at build time and the
// dashboard shows frozen data forever.
export const dynamic = "force-dynamic";
export const revalidate = 0;
import {
  fetchOpenRouterBudget,
  tierColour,
  tierLabel,
  type BudgetSnapshotMetadata,
} from "@/lib/budget";
import { fetchAnthropicMtdCost } from "@/lib/anthropic-admin";

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

  // Fetch OpenRouter + Anthropic in parallel. The Anthropic admin key
  // is optional — if it's missing or the call fails we still return the
  // OR budget data.
  const anthropicAdminKey = process.env.ANTHROPIC_ADMIN_API_KEY;
  const [orResult, anthropicResult] = await Promise.allSettled([
    openRouterKey
      ? fetchOpenRouterBudget(openRouterKey)
      : Promise.reject(new Error("OPENROUTER_API_KEY not configured")),
    anthropicAdminKey
      ? fetchAnthropicMtdCost(anthropicAdminKey)
      : Promise.resolve(null),
  ]);

  let current: BudgetSnapshotMetadata | null = null;
  let liveError: string | null = null;
  if (orResult.status === "fulfilled") {
    current = orResult.value;
  } else {
    liveError =
      orResult.reason instanceof Error
        ? orResult.reason.message
        : "OpenRouter fetch failed";
  }

  const anthropicMtd =
    anthropicResult.status === "fulfilled" ? anthropicResult.value : null;
  const anthropicError =
    anthropicResult.status === "rejected"
      ? anthropicResult.reason instanceof Error
        ? anthropicResult.reason.message
        : "Anthropic fetch failed"
      : null;

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

  // Combined spend across providers (just OR + Anthropic for now).
  const openrouterMtd = effective?.spent_usd_mtd ?? 0;
  const anthropicMtdUsd = anthropicMtd?.total_usd ?? 0;
  const combinedMtd = Math.round((openrouterMtd + anthropicMtdUsd) * 100) / 100;

  return NextResponse.json({
    ok: true,
    live_error: liveError,
    current: effective,
    tier_label: effective ? tierLabel(effective.current_tier) : null,
    tier_colour: effective ? tierColour(effective.current_tier) : null,
    last_snapshot: lastSnapshot,
    history,
    providers: {
      openrouter: {
        mtd_usd: openrouterMtd,
        limit_usd: effective?.limit_usd ?? 0,
      },
      anthropic: {
        mtd_usd: anthropicMtdUsd,
        error: anthropicError,
        buckets: anthropicMtd?.buckets ?? [],
      },
    },
    combined_mtd_usd: combinedMtd,
  });
}
