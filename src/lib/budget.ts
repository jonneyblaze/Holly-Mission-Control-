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

/**
 * Account-level credit balance on OpenRouter. This is independent of any
 * individual API key's spend cap — it's the prepaid credits sitting on
 * the whole org. When `remaining_usd` hits zero, every key stops working
 * regardless of its own limit.
 */
export interface OpenRouterCreditBalance {
  total_credits_usd: number;
  total_usage_usd: number;
  remaining_usd: number;
  checked_at: string;
}

/**
 * Fetch the account-level credit balance. Uses `/api/v1/credits`, which
 * works with either the runtime key or the provisioning key.
 */
export async function fetchOpenRouterCredits(
  apiKey: string
): Promise<OpenRouterCreditBalance> {
  const res = await fetch("https://openrouter.ai/api/v1/credits", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter /credits failed: HTTP ${res.status}`);
  }

  const json = await res.json();
  const d = json.data ?? {};
  const totalCredits = Number(d.total_credits ?? 0);
  const totalUsage = Number(d.total_usage ?? 0);

  return {
    total_credits_usd: round2(totalCredits),
    total_usage_usd: round2(totalUsage),
    remaining_usd: round2(Math.max(totalCredits - totalUsage, 0)),
    checked_at: new Date().toISOString(),
  };
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

/**
 * One row from OpenRouter's /api/v1/activity endpoint. The endpoint
 * returns per-model × per-provider × per-day rows — so the same model
 * can appear twice in a single day if it was routed through different
 * providers (e.g. google-ai-studio vs google-vertex/global).
 */
export interface OpenRouterActivityRow {
  date: string;
  model: string;
  provider_name: string;
  usage: number;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens?: number;
}

/**
 * Fetch one day of org-level activity from OpenRouter. Requires the
 * provisioning key (not the runtime key). The `date` argument is a
 * UTC `YYYY-MM-DD` string and must be within the last 30 completed
 * UTC days — OpenRouter rejects today's date and anything older than
 * 30 days with HTTP 400.
 */
export async function fetchOpenRouterActivityDay(
  provisioningKey: string,
  date: string
): Promise<OpenRouterActivityRow[]> {
  const res = await fetch(
    `https://openrouter.ai/api/v1/activity?date=${encodeURIComponent(date)}`,
    {
      headers: { Authorization: `Bearer ${provisioningKey}` },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!res.ok) {
    throw new Error(`OpenRouter /activity ${date} failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as { data?: OpenRouterActivityRow[] };
  return json.data ?? [];
}

/**
 * Fetch the last `days` completed UTC days of activity and roll them
 * up. OpenRouter's endpoint is strictly per-day, so we fan out in
 * parallel and merge the results. `days=7` is the usual panel window.
 */
export async function fetchOpenRouterActivityRange(
  provisioningKey: string,
  days: number = 7
): Promise<{
  rows: OpenRouterActivityRow[];
  by_day: Array<{ date: string; usage: number; requests: number }>;
  by_model: Array<{
    model: string;
    usage: number;
    requests: number;
    prompt_tokens: number;
    completion_tokens: number;
  }>;
  total_usage: number;
  total_requests: number;
}> {
  // Build the list of UTC dates — skip today (OR only serves completed days).
  const dates: string[] = [];
  const now = new Date();
  for (let i = 1; i <= days; i++) {
    const d = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - i
    ));
    dates.push(d.toISOString().slice(0, 10));
  }

  const results = await Promise.allSettled(
    dates.map((d) => fetchOpenRouterActivityDay(provisioningKey, d))
  );

  const rows: OpenRouterActivityRow[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") rows.push(...r.value);
  }

  // Roll up by day (sum across all models/providers for that day).
  const dayMap = new Map<string, { usage: number; requests: number }>();
  for (const row of rows) {
    // OR returns `date` like "2026-04-04 00:00:00" — strip the time.
    const day = row.date.slice(0, 10);
    const cur = dayMap.get(day) ?? { usage: 0, requests: 0 };
    cur.usage += Number(row.usage) || 0;
    cur.requests += Number(row.requests) || 0;
    dayMap.set(day, cur);
  }
  const by_day = Array.from(dayMap.entries())
    .map(([date, v]) => ({
      date,
      usage: round2(v.usage),
      requests: v.requests,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Roll up by model (sum across days + providers — the table is
  // easier to read when google/gemini-2.5-flash is one row, not two).
  const modelMap = new Map<
    string,
    {
      usage: number;
      requests: number;
      prompt_tokens: number;
      completion_tokens: number;
    }
  >();
  for (const row of rows) {
    const cur = modelMap.get(row.model) ?? {
      usage: 0,
      requests: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
    };
    cur.usage += Number(row.usage) || 0;
    cur.requests += Number(row.requests) || 0;
    cur.prompt_tokens += Number(row.prompt_tokens) || 0;
    cur.completion_tokens += Number(row.completion_tokens) || 0;
    modelMap.set(row.model, cur);
  }
  const by_model = Array.from(modelMap.entries())
    .map(([model, v]) => ({
      model,
      usage: round2(v.usage),
      requests: v.requests,
      prompt_tokens: v.prompt_tokens,
      completion_tokens: v.completion_tokens,
    }))
    .sort((a, b) => b.usage - a.usage);

  const total_usage = round2(
    rows.reduce((sum, r) => sum + (Number(r.usage) || 0), 0)
  );
  const total_requests = rows.reduce(
    (sum, r) => sum + (Number(r.requests) || 0),
    0
  );

  return { rows, by_day, by_model, total_usage, total_requests };
}
