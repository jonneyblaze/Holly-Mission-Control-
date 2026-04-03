"use client";

import { useMemo } from "react";
import MetricCard from "@/components/dashboard/MetricCard";
import GoalGauge from "@/components/dashboard/GoalGauge";
import { useMCTable } from "@/lib/hooks/use-mission-control";
import { DollarSign, TrendingUp, Users, ShoppingCart } from "lucide-react";

// ---------- Types ----------
interface GoalSnapshot {
  id: string;
  snapshot_date: string;
  period_type: string;
  metrics: {
    revenue_mtd?: number;
    revenue_target?: number;
    projected_mrr?: number;
    avg_deal_value?: number;
    closed_deals?: number;
    revenue_per_student?: number;
    active_students?: number;
    revenue_trend?: string;
    mrr_trend?: string;
    deal_trend?: string;
    student_trend?: string;
    daily_run_rate?: number;
    days_remaining?: number;
    month_end_forecast?: number;
    forecast_vs_target_pct?: number;
    pipeline?: {
      stage: string;
      value: number;
      count: number;
    }[];
  };
  alerts: unknown[];
  corrective_actions: unknown[];
  created_at: string;
}

// ---------- Demo / fallback data ----------
const DEMO_METRICS = {
  revenue_mtd: 2340,
  revenue_target: 5000,
  projected_mrr: 3800,
  avg_deal_value: 1600,
  closed_deals: 2,
  revenue_per_student: 49.78,
  active_students: 47,
  revenue_trend: "+12%",
  mrr_trend: "+8%",
  deal_trend: "stable",
  student_trend: "+3%",
  daily_run_rate: 78,
  days_remaining: 12,
  month_end_forecast: 3276,
  forecast_vs_target_pct: -34.5,
};

const DEMO_PIPELINE = [
  { stage: "Lead", value: 0, count: 45 },
  { stage: "Prospect", value: 12600, count: 18 },
  { stage: "Proposal", value: 9800, count: 7 },
  { stage: "Negotiation", value: 5400, count: 3 },
  { stage: "Won", value: 3200, count: 2 },
  { stage: "Lost", value: 1800, count: 4 },
];

// ---------- Helpers ----------
function trendDirection(val: string | undefined): "up" | "down" | "flat" {
  if (!val) return "flat";
  if (val.startsWith("+")) return "up";
  if (val.startsWith("-")) return "down";
  return "flat";
}

export default function FinancePage() {
  // Fetch the latest goal snapshot (ordered by snapshot_date desc, limit 1)
  const { data: snapshots } = useMCTable<GoalSnapshot>("goal_snapshots", {
    orderBy: "snapshot_date",
    orderAsc: false,
    limit: 1,
  });

  const latest = snapshots.length > 0 ? snapshots[0] : null;

  // Derive metrics: live snapshot wins, otherwise fall back to demo
  const m = useMemo(() => {
    if (!latest?.metrics) return DEMO_METRICS;
    const lm = latest.metrics;
    return {
      revenue_mtd: lm.revenue_mtd ?? DEMO_METRICS.revenue_mtd,
      revenue_target: lm.revenue_target ?? DEMO_METRICS.revenue_target,
      projected_mrr: lm.projected_mrr ?? DEMO_METRICS.projected_mrr,
      avg_deal_value: lm.avg_deal_value ?? DEMO_METRICS.avg_deal_value,
      closed_deals: lm.closed_deals ?? DEMO_METRICS.closed_deals,
      revenue_per_student: lm.revenue_per_student ?? DEMO_METRICS.revenue_per_student,
      active_students: lm.active_students ?? DEMO_METRICS.active_students,
      revenue_trend: lm.revenue_trend ?? DEMO_METRICS.revenue_trend,
      mrr_trend: lm.mrr_trend ?? DEMO_METRICS.mrr_trend,
      deal_trend: lm.deal_trend ?? DEMO_METRICS.deal_trend,
      student_trend: lm.student_trend ?? DEMO_METRICS.student_trend,
      daily_run_rate: lm.daily_run_rate ?? DEMO_METRICS.daily_run_rate,
      days_remaining: lm.days_remaining ?? DEMO_METRICS.days_remaining,
      month_end_forecast: lm.month_end_forecast ?? DEMO_METRICS.month_end_forecast,
      forecast_vs_target_pct: lm.forecast_vs_target_pct ?? DEMO_METRICS.forecast_vs_target_pct,
    };
  }, [latest]);

  const dealPipeline = useMemo(() => {
    if (latest?.metrics?.pipeline && latest.metrics.pipeline.length > 0) {
      return latest.metrics.pipeline;
    }
    return DEMO_PIPELINE;
  }, [latest]);

  const totalPipeline = dealPipeline.reduce((sum, d) => sum + d.value, 0);

  const financialMetrics = [
    {
      title: "Revenue (MTD)",
      value: `\u20AC${m.revenue_mtd.toLocaleString()}`,
      subtitle: `Target: \u20AC${m.revenue_target.toLocaleString()}`,
      icon: DollarSign,
      trend: trendDirection(m.revenue_trend),
      trendValue: m.revenue_trend,
      accentColor: "teal" as const,
    },
    {
      title: "Projected MRR",
      value: `\u20AC${m.projected_mrr.toLocaleString()}`,
      subtitle: "Based on current pace",
      icon: TrendingUp,
      trend: trendDirection(m.mrr_trend),
      trendValue: m.mrr_trend,
      accentColor: "navy" as const,
    },
    {
      title: "Avg Deal Value",
      value: `\u20AC${m.avg_deal_value.toLocaleString()}`,
      subtitle: `From ${m.closed_deals} closed deals`,
      icon: ShoppingCart,
      trend: trendDirection(m.deal_trend),
      trendValue: m.deal_trend,
      accentColor: "copper" as const,
    },
    {
      title: "Revenue per Student",
      value: `\u20AC${m.revenue_per_student.toLocaleString()}`,
      subtitle: `${m.active_students} active students`,
      icon: Users,
      trend: trendDirection(m.student_trend),
      trendValue: m.student_trend,
      accentColor: "teal" as const,
    },
  ];

  const forecastPct = m.forecast_vs_target_pct;
  const forecastPctLabel =
    forecastPct >= 0
      ? `(+${forecastPct}% vs target)`
      : `(${forecastPct}% vs target)`;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-montserrat font-bold text-navy-500">Financial Health</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          April 2026 &middot; &euro;{totalPipeline.toLocaleString()} total pipeline
        </p>
      </div>

      {/* Key Financials */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {financialMetrics.map((metric) => (
          <MetricCard key={metric.title} {...metric} />
        ))}
      </div>

      {/* Revenue Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="flex justify-center">
          <GoalGauge label="Monthly Revenue" actual={m.revenue_mtd} target={m.revenue_target} unit={"\u20AC"} />
        </div>
        <div className="lg:col-span-2">
          <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">Deal Pipeline</h2>
          <div className="bg-white rounded-xl border border-border p-5 space-y-3">
            {dealPipeline.map((d) => (
              <div key={d.stage} className="flex items-center gap-4">
                <span className="text-sm font-medium text-navy-500 w-24">{d.stage}</span>
                <div className="flex-1 h-8 bg-muted rounded-lg overflow-hidden relative">
                  <div
                    className="h-full bg-teal-500/70 rounded-lg transition-all duration-500 flex items-center px-3"
                    style={{ width: `${totalPipeline > 0 ? Math.max((d.value / totalPipeline) * 100, 5) : 5}%` }}
                  >
                    <span className="text-[10px] font-bold text-white whitespace-nowrap">
                      &euro;{d.value.toLocaleString()}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground w-16 text-right">{d.count} deals</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Forecast */}
      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-2">Month-End Forecast</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Based on current daily run rate of &euro;{m.daily_run_rate}/day with {m.days_remaining} days remaining
        </p>
        <div className="flex items-baseline gap-4">
          <span className="text-3xl font-montserrat font-bold text-copper-500">
            &euro;{m.month_end_forecast.toLocaleString()}
          </span>
          <span className="text-sm text-muted-foreground">projected</span>
          <span className={`text-sm font-medium ${forecastPct >= 0 ? "text-green-500" : "text-red-500"}`}>
            {forecastPctLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
