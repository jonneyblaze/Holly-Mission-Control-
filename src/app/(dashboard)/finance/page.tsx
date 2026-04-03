"use client";

import MetricCard from "@/components/dashboard/MetricCard";
import GoalGauge from "@/components/dashboard/GoalGauge";
import { DollarSign, TrendingUp, Users, ShoppingCart } from "lucide-react";

const financialMetrics = [
  { title: "Revenue (MTD)", value: "\u20AC2,340", subtitle: "Target: \u20AC5,000", icon: DollarSign, trend: "up" as const, trendValue: "+12%", accentColor: "teal" as const },
  { title: "Projected MRR", value: "\u20AC3,800", subtitle: "Based on current pace", icon: TrendingUp, trend: "up" as const, trendValue: "+8%", accentColor: "navy" as const },
  { title: "Avg Deal Value", value: "\u20AC1,600", subtitle: "From 2 closed deals", icon: ShoppingCart, trend: "flat" as const, trendValue: "stable", accentColor: "copper" as const },
  { title: "Revenue per Student", value: "\u20AC49.78", subtitle: "47 active students", icon: Users, trend: "up" as const, trendValue: "+3%", accentColor: "teal" as const },
];

const dealPipeline = [
  { stage: "Lead", value: 0, count: 45 },
  { stage: "Prospect", value: 12600, count: 18 },
  { stage: "Proposal", value: 9800, count: 7 },
  { stage: "Negotiation", value: 5400, count: 3 },
  { stage: "Won", value: 3200, count: 2 },
  { stage: "Lost", value: 1800, count: 4 },
];

const totalPipeline = dealPipeline.reduce((sum, d) => sum + d.value, 0);

export default function FinancePage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-montserrat font-bold text-navy-500">Financial Health</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          April 2026 &middot; \u20AC{totalPipeline.toLocaleString()} total pipeline
        </p>
      </div>

      {/* Key Financials */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {financialMetrics.map((m) => (
          <MetricCard key={m.title} {...m} />
        ))}
      </div>

      {/* Revenue Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="flex justify-center">
          <GoalGauge label="Monthly Revenue" actual={2340} target={5000} unit={"\u20AC"} />
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
                      \u20AC{d.value.toLocaleString()}
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
          Based on current daily run rate of \u20AC78/day with 12 days remaining
        </p>
        <div className="flex items-baseline gap-4">
          <span className="text-3xl font-montserrat font-bold text-copper-500">\u20AC3,276</span>
          <span className="text-sm text-muted-foreground">projected</span>
          <span className="text-sm text-red-500 font-medium">(-34.5% vs target)</span>
        </div>
      </div>
    </div>
  );
}
