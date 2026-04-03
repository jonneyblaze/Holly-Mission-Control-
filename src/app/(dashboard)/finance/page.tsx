"use client";

import { useMemo } from "react";
import MetricCard from "@/components/dashboard/MetricCard";
import GoalGauge from "@/components/dashboard/GoalGauge";
import { useBodylyticsRpc } from "@/lib/hooks/use-bodylytics";
import { DollarSign, TrendingUp, Users, Target, AlertCircle, RefreshCw } from "lucide-react";

// ---------- Types ----------
interface TopCourse {
  course_id: string;
  title: string;
  total_enrolled: number;
  stripe_revenue: number;
  invoice_revenue: number;
}

interface EnrollmentTrendPoint {
  day: string;
  date: string;
  enrollments: number;
  stripe_revenue: number;
}

interface RevenueTrendPoint {
  week_start: string;
  label: string;
  stripe_revenue: number;
  invoice_revenue: number;
}

interface CurrentGoals {
  revenue_target: number;
  enrollment_target: number;
  actual_revenue: number;
  actual_enrollments: number;
}

interface DashboardData {
  total_revenue: number;
  stripe_revenue: number;
  invoice_revenue: number;
  monthly_costs: number;
  net_profit: number;
  total_students: number;
  new_enrollments: number;
  paid_enrollments: number;
  top_courses: TopCourse[];
  enrollment_trend: EnrollmentTrendPoint[];
  revenue_trend: RevenueTrendPoint[];
  current_goals: CurrentGoals;
}

// ---------- Demo / fallback data ----------
const DEMO: DashboardData = {
  total_revenue: 0,
  stripe_revenue: 0,
  invoice_revenue: 0,
  monthly_costs: 15,
  net_profit: -15,
  total_students: 0,
  new_enrollments: 0,
  paid_enrollments: 0,
  top_courses: [],
  enrollment_trend: [],
  revenue_trend: [],
  current_goals: {
    revenue_target: 35000,
    enrollment_target: 60,
    actual_revenue: 0,
    actual_enrollments: 0,
  },
};

export default function FinancePage() {
  const { data, loading, error, refetch } = useBodylyticsRpc<DashboardData>(
    "get_admin_dashboard_v2",
    { refreshInterval: 60_000 }
  );

  // Use live data, fall back to demo only on error
  const d = useMemo(() => {
    if (error || !data) return DEMO;
    return data;
  }, [data, error]);

  const isLive = !!data && !error;

  const financialMetrics = [
    {
      title: "Total Revenue",
      value: `\u20AC${d.total_revenue.toLocaleString()}`,
      subtitle: `Stripe: \u20AC${d.stripe_revenue.toLocaleString()} | Invoice: \u20AC${d.invoice_revenue.toLocaleString()}`,
      icon: DollarSign,
      accentColor: "teal" as const,
    },
    {
      title: "Monthly Costs",
      value: `\u20AC${d.monthly_costs.toLocaleString()}`,
      subtitle: "Hosting, services, subscriptions",
      icon: TrendingUp,
      accentColor: "copper" as const,
    },
    {
      title: "Net Profit",
      value: `\u20AC${d.net_profit.toLocaleString()}`,
      subtitle: d.net_profit >= 0 ? "In the green" : "Pre-launch investment phase",
      icon: Target,
      trend: d.net_profit >= 0 ? ("up" as const) : ("down" as const),
      trendValue: d.net_profit >= 0 ? "Profitable" : "Pre-revenue",
      accentColor: "navy" as const,
    },
    {
      title: "Total Students",
      value: d.total_students.toLocaleString(),
      subtitle: `${d.new_enrollments} enrollments (${d.paid_enrollments} paid)`,
      icon: Users,
      accentColor: "teal" as const,
    },
  ];

  // Enrollment trend: last 7 points
  const recentEnrollments = d.enrollment_trend.slice(-7);
  const totalRecentEnrollments = recentEnrollments.reduce(
    (sum, p) => sum + p.enrollments,
    0
  );

  // Revenue trend: last 4 weeks
  const recentRevenue = d.revenue_trend.slice(-4);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Loading financial data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">
            Financial Health
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            BodyLytics &middot; Live from Supabase
            {!isLive && (
              <span className="ml-2 text-amber-600 font-medium">
                (showing fallback data)
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs text-muted-foreground hover:text-navy-500 flex items-center gap-1 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Could not fetch live data: {error}. Showing fallback values.</span>
        </div>
      )}

      {/* Key Financials */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {financialMetrics.map((metric) => (
          <MetricCard key={metric.title} {...metric} />
        ))}
      </div>

      {/* Goal Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <GoalGauge
          label="Revenue vs Target"
          actual={d.current_goals.actual_revenue}
          target={d.current_goals.revenue_target}
          unit={"\u20AC"}
        />
        <GoalGauge
          label="Enrollments vs Target"
          actual={d.current_goals.actual_enrollments}
          target={d.current_goals.enrollment_target}
        />
        <div className="lg:col-span-2 bg-white rounded-xl border border-border p-5">
          <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">
            Top Courses
          </h2>
          {d.top_courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No course data yet. Courses will appear here once students enrol.
            </p>
          ) : (
            <div className="space-y-2.5">
              {d.top_courses.slice(0, 5).map((course) => (
                <div
                  key={course.course_id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-navy-500 font-medium truncate max-w-[60%]">
                    {course.title}
                  </span>
                  <div className="flex items-center gap-3 text-muted-foreground text-xs">
                    <span>{course.total_enrolled} students</span>
                    <span className="font-medium text-teal-600">
                      &euro;{(course.stripe_revenue + course.invoice_revenue).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Enrollment Trend */}
      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-2">
          Enrollment Trend (Last 7 Days)
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {totalRecentEnrollments} total enrollments in the last 7 days
        </p>
        {recentEnrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No enrollment data available yet.
          </p>
        ) : (
          <div className="flex items-end gap-2 h-32">
            {recentEnrollments.map((point) => {
              const maxEnroll = Math.max(
                ...recentEnrollments.map((p) => p.enrollments),
                1
              );
              const heightPct = (point.enrollments / maxEnroll) * 100;
              return (
                <div
                  key={point.day}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {point.enrollments}
                  </span>
                  <div
                    className="w-full bg-teal-500/70 rounded-t-md transition-all duration-500"
                    style={{
                      height: `${Math.max(heightPct, 4)}%`,
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {point.date}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Weekly Revenue Trend */}
      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-2">
          Weekly Revenue Trend
        </h2>
        {recentRevenue.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No revenue data available yet.
          </p>
        ) : (
          <div className="space-y-3">
            {recentRevenue.map((week) => {
              const weekTotal = week.stripe_revenue + week.invoice_revenue;
              const maxWeekly = Math.max(
                ...recentRevenue.map(
                  (w) => w.stripe_revenue + w.invoice_revenue
                ),
                1
              );
              const widthPct = (weekTotal / maxWeekly) * 100;
              return (
                <div key={week.week_start} className="flex items-center gap-4">
                  <span className="text-sm font-medium text-navy-500 w-20">
                    {week.label}
                  </span>
                  <div className="flex-1 h-8 bg-muted rounded-lg overflow-hidden relative">
                    <div
                      className="h-full bg-teal-500/70 rounded-lg transition-all duration-500 flex items-center px-3"
                      style={{
                        width: `${Math.max(widthPct, 5)}%`,
                      }}
                    >
                      <span className="text-[10px] font-bold text-white whitespace-nowrap">
                        &euro;{weekTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
