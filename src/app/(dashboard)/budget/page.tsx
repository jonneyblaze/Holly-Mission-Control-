"use client";

import { useEffect, useState, useCallback } from "react";
import { DollarSign, TrendingUp, Gauge, RefreshCw, AlertTriangle, CheckCircle2, Zap } from "lucide-react";
import MetricCard from "@/components/dashboard/MetricCard";
import { cn } from "@/lib/utils";
import type { BudgetSnapshotMetadata, BudgetTier } from "@/lib/budget";

interface HistoryRow {
  id: string;
  created_at: string;
  snapshot: BudgetSnapshotMetadata;
}

interface ProviderBreakdown {
  openrouter: { mtd_usd: number; limit_usd: number };
  anthropic: {
    mtd_usd: number;
    error: string | null;
    buckets: Array<{
      starting_at: string;
      ending_at: string;
      total_usd: number;
      by_model: Record<string, number>;
    }>;
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

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // refresh every minute
    return () => clearInterval(t);
  }, [load]);

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

/** Pulls the sync token from a cookie/localStorage — for manual sync. */
function getCookieToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("ingest_api_key") || "";
}
