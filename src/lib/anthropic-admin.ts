/**
 * Anthropic Admin API wrapper.
 *
 * Uses an Admin API key (prefix `sk-ant-admin01-…`) — NOT the inference
 * key — to read org-level cost and usage data. The inference key can
 * only call /v1/messages; the admin key is read/write for org settings,
 * cost reports, usage reports, and API key management.
 *
 * Env:
 *   ANTHROPIC_ADMIN_API_KEY — the admin key
 *
 * Docs: https://docs.anthropic.com/en/api/admin-api/
 */

const BASE = "https://api.anthropic.com/v1";
const VERSION = "2023-06-01";

export interface AnthropicCostBucket {
  starting_at: string;
  ending_at: string;
  /** Total USD cost for this bucket across all models. */
  total_usd: number;
  /** Per-model breakdown (model id → USD) when available. */
  by_model: Record<string, number>;
}

export interface AnthropicCostSnapshot {
  /** Sum of `total_usd` across all buckets in the requested range. */
  total_usd: number;
  /** Daily buckets, oldest first. */
  buckets: AnthropicCostBucket[];
  /** ISO timestamp of when this was fetched. */
  fetched_at: string;
}

/**
 * Fetch Anthropic cost report for the given date range.
 *
 * The Anthropic cost_report endpoint returns daily buckets with a list
 * of per-model `results`. Each `results[]` item has `amount.value` in
 * currency units (USD cents when currency='usd').
 */
export async function fetchAnthropicCostReport(
  adminKey: string,
  startingAt: Date,
  endingAt: Date
): Promise<AnthropicCostSnapshot> {
  const params = new URLSearchParams({
    starting_at: startingAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
    ending_at: endingAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
  });

  const all: AnthropicCostBucketRaw[] = [];
  let nextPage: string | undefined;

  // Paginate through all daily buckets in the range.
  for (let page = 0; page < 20; page++) {
    const url = nextPage
      ? `${BASE}/organizations/cost_report?${params}&page=${encodeURIComponent(nextPage)}`
      : `${BASE}/organizations/cost_report?${params}`;

    const res = await fetch(url, {
      headers: {
        "x-api-key": adminKey,
        "anthropic-version": VERSION,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`Anthropic cost_report HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      data: AnthropicCostBucketRaw[];
      has_more?: boolean;
      next_page?: string;
    };

    all.push(...(json.data ?? []));
    if (!json.has_more || !json.next_page) break;
    nextPage = json.next_page;
  }

  const buckets: AnthropicCostBucket[] = all.map((b) => {
    const by_model: Record<string, number> = {};
    let total = 0;
    for (const r of b.results ?? []) {
      const usd = parseCostAmount(r.amount);
      total += usd;
      const model =
        (typeof r.model === "string" && r.model) ||
        (typeof r.context?.model === "string" && r.context.model) ||
        "unknown";
      by_model[model] = (by_model[model] ?? 0) + usd;
    }
    return {
      starting_at: b.starting_at,
      ending_at: b.ending_at,
      total_usd: round2(total),
      by_model: Object.fromEntries(
        Object.entries(by_model).map(([k, v]) => [k, round2(v)])
      ),
    };
  });

  const total_usd = round2(
    buckets.reduce((sum, b) => sum + b.total_usd, 0)
  );

  return {
    total_usd,
    buckets,
    fetched_at: new Date().toISOString(),
  };
}

/**
 * Convenience: fetch month-to-date Anthropic spend.
 */
export async function fetchAnthropicMtdCost(
  adminKey: string
): Promise<AnthropicCostSnapshot> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return fetchAnthropicCostReport(adminKey, start, now);
}

/**
 * Anthropic's cost_report returns amounts as either a number (USD
 * dollars) or an object { value, currency }. This normalises to USD
 * dollars regardless of shape.
 */
function parseCostAmount(amount: unknown): number {
  if (typeof amount === "number") return amount;
  if (amount && typeof amount === "object") {
    const obj = amount as { value?: number; currency?: string };
    const value = typeof obj.value === "number" ? obj.value : 0;
    // Anthropic returns USD in dollars (not cents) in the current API.
    // If a `currency` field is present and equals 'cents' or similar in
    // the future, we'd divide; today we just trust the value.
    return value;
  }
  return 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface AnthropicCostBucketRaw {
  starting_at: string;
  ending_at: string;
  results?: Array<{
    amount?: unknown;
    model?: string;
    context?: { model?: string };
  }>;
}
