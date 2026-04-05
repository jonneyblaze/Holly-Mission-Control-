"use client";

import { useEffect, useState, useCallback } from "react";
import { DollarSign, TrendingUp, Gauge, RefreshCw, AlertTriangle, CheckCircle2, Zap } from "lucide-react";
import MetricCard from "@/components/dashboard/MetricCard";
import KeysPanel from "@/components/dashboard/KeysPanel";
import { cn } from "@/lib/utils";
import type { BudgetSnapshotMetadata, BudgetTier } from "@/lib/budget";

interface HistoryRow {
  id: string;
  created_at: string;
  snapshot: BudgetSnapshotMetadata;
}

interface ProviderBreakdown {
  openrouter: {
    mtd_usd: number;
    limit_usd: number;
    account_balance: {
      total_credits_usd: number;
      total_usage_usd: number;
      remaining_usd: number;
      checked_at: string;
    } | null;
  };
  anthropic: {
    mtd_usd: number;
    error: string | null;
    buckets: Array<{
      starting_at: string;
      ending_at: string;
      total_usd: number;
      by_model: Record<string, number>;
    }>;
    synthetic_balance: {
      budget_usd: number;
      spent_usd: number;
      remaining_usd: number;
      source: "self_imposed";
    } | null;
  };
}

interface BudgetState {
  ok: boolean;
  live_error: string | null;
  current: BudgetSnapshotMetadata | null;
  tier_label: string | null;
  tier_colour: "green" | "amber" | "red" | null;
  last_snapshot: HistoryRow | null;
  history: HistoryRow[];
  providers?: ProviderBreakdown;
  combined_mtd_usd?: number;
}

interface ActivityState {
  ok: boolean;
  days: number;
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
  fetched_at: string;
}

const TIER_COPY: Record<BudgetTier, { heading: string; detail: string }> = {
  normal: {
    heading: "All systems go",
    detail: "Full model matrix active. Sonnet orchestrators, Gemini drafters, Haiku support.",
  },
  warn: {
    heading: "Approaching limit",
    detail: "Dashboard warning only. No model downgrades yet.",
  },
  caution: {
    heading: "Auto-downgrade active",
    detail: "Orchestrators downgraded to Haiku. Free-model fallbacks favoured.",
  },
  lockdown: {
    heading: "Lockdown",
    detail: "Free models + local Ollama only. Paid models disabled.",
  },
  frozen: {
    heading: "Frozen",
    detail: "Budget exhausted. Only local Ollama is servicing agents.",
  },
};

export default function BudgetPage() {
  const [state, setState] = useState<BudgetState | null>(null);
  const [activity, setActivity] = useState<ActivityState | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/budget/state", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setState(json as BudgetState);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/budget/activity?days=7", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setActivity(json as ActivityState);
      setActivityError(null);
    } catch (err) {
      setActivityError(err instanceof Error ? err.message : "Failed to load activity");
    }
  }, []);

  useEffect(() => {
    load();
    loadActivity();
    const t = setInterval(load, 60_000); // refresh every minute
    // Activity is pricier (8 parallel OR fetches) — refresh every 5 min.
    const a = setInterval(loadActivity, 5 * 60_000);
    return () => {
      clearInterval(t);
      clearInterval(a);
    };
  }, [load, loadActivity]);

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/budget/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${getCookieToken()}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse text-muted-foreground">Loading budget state…</div>
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertTriangle className="inline w-4 h-4 mr-2" />
          {error}
        </div>
      </div>
    );
  }

  const current = state?.current ?? null;
  const tier = current?.current_tier ?? "normal";
  const colour = state?.tier_colour ?? "green";
  const copy = TIER_COPY[tier];

  const colourClasses = {
    green: "bg-emerald-50 border-emerald-200 text-emerald-700",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    red: "bg-red-50 border-red-200 text-red-700",
  }[colour];

  // Tier transitions = history rows where tier differs from the row before it.
  const transitions = (state?.history ?? []).filter((row, i, arr) => {
    if (i === arr.length - 1) return true;
    return row.snapshot.current_tier !== arr[i + 1].snapshot.current_tier;
  });

  // Build a simple burn curve from history (reverse → oldest first).
  const burnPoints = (state?.history ?? [])
    .map((h) => ({ t: h.created_at, spend: h.snapshot.spent_usd_mtd }))
    .reverse();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">Budget</h1>
          <p className="text-sm text-muted-foreground mt-1">
            OpenRouter monthly spend + auto-degradation state.
          </p>
        </div>
        <button
          onClick={runSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
        >
          <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {state?.live_error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800 text-sm">
          <AlertTriangle className="inline w-4 h-4 mr-2" />
          Live OpenRouter fetch failed ({state.live_error}). Showing last snapshot.
        </div>
      )}

      {/* Traffic light */}
      <div className={cn("rounded-xl border p-6 flex items-center gap-4", colourClasses)}>
        <div className="flex-shrink-0">
          {colour === "green" ? (
            <CheckCircle2 className="w-10 h-10" />
          ) : colour === "amber" ? (
            <AlertTriangle className="w-10 h-10" />
          ) : (
            <Zap className="w-10 h-10" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wider opacity-70">
            Current tier · {tier}
          </div>
          <div className="text-xl font-bold mt-0.5">{copy.heading}</div>
          <div className="text-sm opacity-80 mt-1">{copy.detail}</div>
        </div>
      </div>

      {/* Big numbers */}
      {current && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard
            title="Spent this month"
            value={`$${current.spent_usd_mtd.toFixed(2)}`}
            subtitle={`of $${current.limit_usd.toFixed(0)} limit`}
            icon={DollarSign}
            accentColor="copper"
          />
          <MetricCard
            title="Remaining"
            value={`$${current.remaining_usd.toFixed(2)}`}
            subtitle={`${(100 - current.pct_used).toFixed(1)}% left`}
            icon={TrendingUp}
            accentColor="teal"
          />
          <MetricCard
            title="Percent used"
            value={`${current.pct_used.toFixed(1)}%`}
            subtitle={`Tier breaks at 70/85/95/100%`}
            icon={Gauge}
            accentColor="navy"
          />
          <MetricCard
            title="Today"
            value={`$${(current.usage_daily ?? 0).toFixed(2)}`}
            subtitle={`week $${(current.usage_weekly ?? 0).toFixed(2)}`}
            icon={TrendingUp}
            accentColor="teal"
          />
        </div>
      )}

      {/* Account credit balance — account-level, independent of per-key caps */}
      {state?.providers?.openrouter.account_balance && (() => {
        const bal = state.providers!.openrouter.account_balance!;
        const pctRemaining = bal.total_credits_usd > 0
          ? (bal.remaining_usd / bal.total_credits_usd) * 100
          : 0;
        const balColour =
          bal.remaining_usd < 5
            ? "border-red-300 bg-red-50"
            : bal.remaining_usd < 15
              ? "border-amber-300 bg-amber-50"
              : "border-emerald-300 bg-emerald-50";
        const barColour =
          bal.remaining_usd < 5
            ? "bg-red-500"
            : bal.remaining_usd < 15
              ? "bg-amber-500"
              : "bg-emerald-500";
        return (
          <div className={cn("rounded-xl border p-5", balColour)}>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h2 className="font-montserrat font-bold text-navy-500">
                  OpenRouter account balance
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Prepaid credits across the whole org — when this hits $0,
                  every key stops regardless of its own cap
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-navy-500">
                  ${bal.remaining_usd.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">remaining</div>
              </div>
            </div>
            <div className="h-2 bg-white/60 rounded-full overflow-hidden mb-2">
              <div
                className={cn("h-full rounded-full transition-all duration-500", barColour)}
                style={{ width: `${Math.min(100, Math.max(0, pctRemaining))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                ${bal.total_usage_usd.toFixed(2)} used of ${bal.total_credits_usd.toFixed(2)} ever added
              </span>
              <span>{pctRemaining.toFixed(1)}% remaining</span>
            </div>
          </div>
        );
      })()}

      {/* Anthropic synthetic budget — no real balance endpoint exists on
          Anthropic's Admin API, so this is a self-imposed monthly ceiling
          set via ANTHROPIC_MONTHLY_BUDGET_USD env var. */}
      {state?.providers?.anthropic.synthetic_balance && (() => {
        const bal = state.providers!.anthropic.synthetic_balance!;
        const pctRemaining = bal.budget_usd > 0
          ? (bal.remaining_usd / bal.budget_usd) * 100
          : 0;
        const balColour =
          bal.remaining_usd < bal.budget_usd * 0.1
            ? "border-red-300 bg-red-50"
            : bal.remaining_usd < bal.budget_usd * 0.3
              ? "border-amber-300 bg-amber-50"
              : "border-emerald-300 bg-emerald-50";
        const barColour =
          bal.remaining_usd < bal.budget_usd * 0.1
            ? "bg-red-500"
            : bal.remaining_usd < bal.budget_usd * 0.3
              ? "bg-amber-500"
              : "bg-emerald-500";
        return (
          <div className={cn("rounded-xl border p-5", balColour)}>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h2 className="font-montserrat font-bold text-navy-500">
                  Anthropic direct budget
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Self-imposed monthly ceiling — Anthropic&apos;s API doesn&apos;t
                  expose a credit balance, so this is{" "}
                  <code className="text-[10px] px-1 py-0.5 bg-white/60 rounded">
                    ANTHROPIC_MONTHLY_BUDGET_USD
                  </code>{" "}
                  minus real cost_report MTD
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-navy-500">
                  ${bal.remaining_usd.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">remaining</div>
              </div>
            </div>
            <div className="h-2 bg-white/60 rounded-full overflow-hidden mb-2">
              <div
                className={cn("h-full rounded-full transition-all duration-500", barColour)}
                style={{ width: `${Math.min(100, Math.max(0, pctRemaining))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                ${bal.spent_usd.toFixed(2)} used of ${bal.budget_usd.toFixed(2)} budget this month
              </span>
              <span>{pctRemaining.toFixed(1)}% remaining</span>
            </div>
          </div>
        );
      })()}

      {/* Per-provider spend breakdown — OpenRouter + Anthropic direct */}
      {state?.providers && (
        <div className="bg-white rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-montserrat font-bold text-navy-500">
                Spend by provider
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Month-to-date across all AI providers
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-navy-500">
                ${(state.combined_mtd_usd ?? 0).toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">combined MTD</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  OpenRouter
                </span>
                <span className="text-[10px] text-muted-foreground">
                  hard cap ${state.providers.openrouter.limit_usd.toFixed(0)}
                </span>
              </div>
              <div className="text-xl font-bold text-navy-500">
                ${state.providers.openrouter.mtd_usd.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Routes Sonnet, Gemini Flash, Haiku, DeepSeek
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Anthropic (direct)
                </span>
                {state.providers.anthropic.error && (
                  <span
                    className="text-[10px] text-amber-600"
                    title={state.providers.anthropic.error}
                  >
                    admin key issue
                  </span>
                )}
              </div>
              <div className="text-xl font-bold text-navy-500">
                ${state.providers.anthropic.mtd_usd.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Failover bypass when OpenRouter is unavailable
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OpenRouter org activity — per-model rollup for the last 7
          completed UTC days. Uses the provisioning key. OR's /activity
          endpoint doesn't include today, so this trails by ~1 day. */}
      {(activity || activityError) && (
        <div className="bg-white rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-montserrat font-bold text-navy-500">
                OpenRouter activity — last 7 days
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Org-level spend by model across all keys. Trails today by
                ~24h (OR only serves completed UTC days).
              </p>
            </div>
            {activity && (
              <div className="text-right">
                <div className="text-2xl font-bold text-navy-500">
                  ${activity.total_usage.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {activity.total_requests.toLocaleString()} requests
                </div>
              </div>
            )}
          </div>

          {activityError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs mb-3">
              <AlertTriangle className="inline w-3 h-3 mr-1" />
              {activityError}
            </div>
          )}

          {activity && activity.by_day.length >= 2 && (
            <div className="mb-4">
              <DailySparkline points={activity.by_day} />
            </div>
          )}

          {activity && activity.by_model.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                    <th className="py-2 pr-3 font-semibold">Model</th>
                    <th className="py-2 px-3 font-semibold text-right">Spend</th>
                    <th className="py-2 px-3 font-semibold text-right">Requests</th>
                    <th className="py-2 px-3 font-semibold text-right">Input tokens</th>
                    <th className="py-2 px-3 font-semibold text-right">Output tokens</th>
                    <th className="py-2 pl-3 font-semibold text-right">% of spend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activity.by_model.map((m) => {
                    const pct =
                      activity.total_usage > 0
                        ? (m.usage / activity.total_usage) * 100
                        : 0;
                    return (
                      <tr key={m.model}>
                        <td className="py-2 pr-3 font-mono text-xs text-navy-500">
                          {m.model}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold">
                          ${m.usage.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground">
                          {m.requests.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground">
                          {formatTokens(m.prompt_tokens)}
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground">
                          {formatTokens(m.completion_tokens)}
                        </td>
                        <td className="py-2 pl-3 text-right">
                          <div className="inline-flex items-center gap-2 justify-end">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-teal-500 rounded-full"
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-10 text-right">
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : activity && !activityError ? (
            <p className="text-sm text-muted-foreground">
              No activity in the last 7 days.
            </p>
          ) : null}
        </div>
      )}

      {/* Burn curve — lightweight inline SVG, no chart lib */}
      {burnPoints.length >= 2 && current && (
        <div className="bg-white rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-montserrat font-bold text-navy-500">Spend burn</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Last {burnPoints.length} snapshots
              </p>
            </div>
          </div>
          <BurnSparkline points={burnPoints} limit={current.limit_usd} />
        </div>
      )}

      {/* Tier history */}
      <div className="bg-white rounded-xl border border-border p-5">
        <h2 className="font-montserrat font-bold text-navy-500 mb-4">Tier transitions</h2>
        {transitions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history yet. Hit Sync to create the first snapshot.</p>
        ) : (
          <div className="divide-y divide-border">
            {transitions.slice(0, 10).map((row) => (
              <div key={row.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold capitalize">
                    {row.snapshot.current_tier}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="text-right text-sm flex-shrink-0">
                  <div className="font-semibold">${row.snapshot.spent_usd_mtd.toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.snapshot.pct_used.toFixed(1)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <KeysPanel />
    </div>
  );
}

function BurnSparkline({
  points,
  limit,
}: {
  points: { t: string; spend: number }[];
  limit: number;
}) {
  const w = 800;
  const h = 160;
  const pad = 8;

  const xs = points.map((_, i) => (i / (points.length - 1)) * (w - pad * 2) + pad);
  const maxY = Math.max(limit, ...points.map((p) => p.spend));
  const ys = points.map((p) => h - pad - (p.spend / maxY) * (h - pad * 2));

  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x},${ys[i]}`).join(" ");
  const area = `${d} L${xs[xs.length - 1]},${h - pad} L${xs[0]},${h - pad} Z`;

  const limitY = h - pad - (limit / maxY) * (h - pad * 2);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40">
      <defs>
        <linearGradient id="burnFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#burnFill)" />
      <path d={d} stroke="#0d9488" strokeWidth="2" fill="none" />
      <line
        x1={pad}
        x2={w - pad}
        y1={limitY}
        y2={limitY}
        stroke="#ef4444"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      <text x={w - pad} y={limitY - 4} textAnchor="end" fontSize="10" fill="#ef4444">
        limit ${limit.toFixed(0)}
      </text>
    </svg>
  );
}

function DailySparkline({
  points,
}: {
  points: { date: string; usage: number; requests: number }[];
}) {
  const w = 800;
  const h = 80;
  const pad = 8;
  const xs = points.map((_, i) => (i / (points.length - 1)) * (w - pad * 2) + pad);
  const maxY = Math.max(0.01, ...points.map((p) => p.usage));
  const ys = points.map((p) => h - pad - (p.usage / maxY) * (h - pad * 2));
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x},${ys[i]}`).join(" ");
  const area = `${d} L${xs[xs.length - 1]},${h - pad} L${xs[0]},${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20">
      <defs>
        <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0d9488" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#0d9488" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#activityFill)" />
      <path d={d} stroke="#0d9488" strokeWidth="2" fill="none" />
      {points.map((p, i) => (
        <g key={p.date}>
          <circle cx={xs[i]} cy={ys[i]} r="2.5" fill="#0d9488" />
          <title>{`${p.date}: $${p.usage.toFixed(2)} · ${p.requests.toLocaleString()} req`}</title>
        </g>
      ))}
    </svg>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

/** Pulls the sync token from a cookie/localStorage — for manual sync. */
function getCookieToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("ingest_api_key") || "";
}
