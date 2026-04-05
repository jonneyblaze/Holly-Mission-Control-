/**
 * Budget guardrails — shared logic for sync, state, and dashboard.
 *
 * Monthly spend budget lives at OpenRouter (hard $100 cap enforced by
 * OpenRouter itself — this module is the soft warning layer).
 *
 * Tier ladder (pct_used of the monthly limit):
 *   0-70   → normal    full model matrix (Sonnet orchestrators, Gemini drafters, Haiku support)
 *   70-85  → warn      same config, dashboard warning only
 *   85-95  → caution   orchestrators drop to Haiku, more free-model fallbacks
 *   95-100 → lockdown  free models + Ollama only
 *   ≥100   → frozen    local Ollama only — paid agents disabled
 *
 * The snapshot is written to `agent_activity` as activity_type='budget_snapshot'
 * to avoid new DDL (Supabase PostgREST doesn't allow CREATE TABLE).
 */

export type BudgetTier = "normal" | "warn" | "caution" | "lockdown" | "frozen";

export interface BudgetSnapshotMetadata {
  provider: "openrouter";
  spent_usd_mtd: number;
  limit_usd: number;
  remaining_usd: number;
  pct_used: number;
  current_tier: BudgetTier;
  usage_daily?: number;
  usage_weekly?: number;
  checked_at: string;
}

/** Pick the tier for a given percentage of the monthly limit consumed. */
export function tierForPct(pct: number): BudgetTier {
  if (pct >= 100) return "frozen";
  if (pct >= 95) return "lockdown";
  if (pct >= 85) return "caution";
  if (pct >= 70) return "warn";
  return "normal";
}

/** Human-friendly label for a tier — used on the dashboard. */
export function tierLabel(tier: BudgetTier): string {
  switch (tier) {
    case "normal":
      return "All systems go";
    case "warn":
      return "Approaching budget warning";
    case "caution":
      return "Auto-downgrade active";
    case "lockdown":
      return "Lockdown — free models only";
    case "frozen":
      return "Frozen — budget exhausted";
  }
}

/** Traffic-light colour for the dashboard traffic-light UI. */
export function tierColour(tier: BudgetTier): "green" | "amber" | "red" {
  if (tier === "normal") return "green";
  if (tier === "warn" || tier === "caution") return "amber";
  return "red";
}

/**
 * Decide whether a new snapshot should be written. We don't want to spam the
 * activity feed every 15 minutes with identical rows, so we only write when:
 *   - the tier has changed since the last snapshot, or
 *   - it's been longer than `maxAgeMs` since the last snapshot.
 */
export function shouldWriteSnapshot(
  current: BudgetSnapshotMetadata,
  previous: BudgetSnapshotMetadata | null,
  maxAgeMs: number = 60 * 60_000 // 1 hour
): boolean {
  if (!previous) return true;
  if (previous.current_tier !== current.current_tier) return true;

  const prevTs = Date.parse(previous.checked_at);
  if (Number.isNaN(prevTs)) return true;
  return Date.now() - prevTs > maxAgeMs;
}

/** Fetch the live state from OpenRouter — no DB touch. */
export async function fetchOpenRouterBudget(apiKey: string): Promise<BudgetSnapshotMetadata> {
  const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter /auth/key failed: HTTP ${res.status}`);
  }

  const json = await res.json();
  const d = json.data ?? {};
  const limit = Number(d.limit ?? 0);
  const spent = Number(d.usage ?? 0);
  const remaining = Number(d.limit_remaining ?? Math.max(limit - spent, 0));
  const pct = limit > 0 ? (spent / limit) * 100 : 0;

  return {
    provider: "openrouter",
    spent_usd_mtd: round2(spent),
    limit_usd: round2(limit),
    remaining_usd: round2(remaining),
    pct_used: round2(pct),
    current_tier: tierForPct(pct),
    usage_daily: d.usage_daily != null ? round2(Number(d.usage_daily)) : undefined,
    usage_weekly: d.usage_weekly != null ? round2(Number(d.usage_weekly)) : undefined,
    checked_at: new Date().toISOString(),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
