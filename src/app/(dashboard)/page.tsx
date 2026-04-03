"use client";

import {
  DollarSign,
  GraduationCap,
  Headphones,
  Bot,
  PenLine,
  Search,
  Megaphone,
  Target,
} from "lucide-react";
import MetricCard from "@/components/dashboard/MetricCard";
import GoalGauge from "@/components/dashboard/GoalGauge";
import RecentActivity from "@/components/dashboard/RecentActivity";
import AlertBanner from "@/components/dashboard/AlertBanner";
import Link from "next/link";

// Demo data — will be replaced with live Supabase queries
const metrics = [
  {
    title: "Revenue This Month",
    value: "\u20AC2,340",
    subtitle: "Target: \u20AC5,000",
    icon: DollarSign,
    trend: "up" as const,
    trendValue: "+12%",
    accentColor: "teal" as const,
  },
  {
    title: "Active Enrollments",
    value: "47",
    subtitle: "3 new this week",
    icon: GraduationCap,
    trend: "up" as const,
    trendValue: "+6.8%",
    accentColor: "navy" as const,
  },
  {
    title: "Open Tickets",
    value: "3",
    subtitle: "Avg response: 2.1h",
    icon: Headphones,
    trend: "down" as const,
    trendValue: "-2",
    accentColor: "copper" as const,
  },
  {
    title: "Agent Tasks Today",
    value: "12",
    subtitle: "8 completed, 4 running",
    icon: Bot,
    trend: "flat" as const,
    trendValue: "normal",
    accentColor: "teal" as const,
  },
];

const goals = [
  { label: "Revenue", actual: 2340, target: 5000, unit: "\u20AC" },
  { label: "Enrollments", actual: 12, target: 20 },
  { label: "Blog Posts", actual: 3, target: 8 },
  { label: "Discovery Calls", actual: 2, target: 6 },
  { label: "Deals Closed", actual: 1, target: 3 },
  { label: "LinkedIn Posts", actual: 8, target: 12 },
];

const recentActivities = [
  {
    id: "1",
    agent_id: "bl-marketing",
    activity_type: "content",
    title: "Blog post: 5 Body Language Mistakes That Kill Sales",
    summary: "1,200 words, SEO optimised, ready for review",
    created_at: new Date(Date.now() - 25 * 60000).toISOString(),
  },
  {
    id: "2",
    agent_id: "infra",
    activity_type: "report",
    title: "Daily Infrastructure Report",
    summary: "All 14 containers healthy. Disk at 62%.",
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: "3",
    agent_id: "bl-support",
    activity_type: "task_complete",
    title: "Auto-replied to ticket #47: Password reset",
    summary: "Standard KB response sent",
    created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  {
    id: "4",
    agent_id: "bl-social",
    activity_type: "content",
    title: "Weekly social calendar created",
    summary: "5 posts: 2 LinkedIn, 2 Instagram, 1 TikTok",
    created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
  },
  {
    id: "5",
    agent_id: "bl-qa",
    activity_type: "report",
    title: "Smoke test passed: staging",
    summary: "All 6 checks green",
    created_at: new Date(Date.now() - 8 * 3600000).toISOString(),
  },
];

const activeAlerts = [
  {
    id: "a1",
    severity: "warning" as const,
    message: "Revenue at 47% of monthly target with 12 days remaining — corrective action triggered",
  },
];

const quickActions = [
  { label: "Write Blog Post", icon: PenLine, href: "/content" },
  { label: "Find Leads", icon: Search, href: "/pipeline" },
  { label: "Run Promo", icon: Megaphone, href: "/social" },
  { label: "Check Goals", icon: Target, href: "/goals" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-montserrat font-bold text-navy-500">
          Command Centre
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Good morning, Sean. Here&apos;s your overview.
        </p>
      </div>

      {/* Alerts */}
      <AlertBanner alerts={activeAlerts} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <MetricCard key={m.title} {...m} />
        ))}
      </div>

      {/* Main Content: Goals + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Goals - 2 cols */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-montserrat font-semibold text-navy-500">
              Goal Progress
            </h2>
            <Link
              href="/goals"
              className="text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors"
            >
              View all &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {goals.map((g) => (
              <GoalGauge key={g.label} {...g} size="sm" />
            ))}
          </div>
        </div>

        {/* Recent Activity - 1 col */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-montserrat font-semibold text-navy-500">
              Recent Activity
            </h2>
            <Link
              href="/agents"
              className="text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors"
            >
              View all &rarr;
            </Link>
          </div>
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <RecentActivity activities={recentActivities} />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="flex items-center gap-3 p-4 bg-white rounded-xl border border-border hover:border-teal-300 hover:shadow-md transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center group-hover:bg-teal-100 transition-colors">
                <action.icon className="w-4 h-4 text-teal-600" />
              </div>
              <span className="text-sm font-medium text-navy-500">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
