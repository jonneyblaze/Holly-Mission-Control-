"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  GraduationCap,
  Headphones,
  Bot,
  PenLine,
  Search,
  Megaphone,
  Target,
  Loader2,
} from "lucide-react";
import MetricCard from "@/components/dashboard/MetricCard";
import GoalGauge from "@/components/dashboard/GoalGauge";
import RecentActivity from "@/components/dashboard/RecentActivity";
import AlertBanner from "@/components/dashboard/AlertBanner";
import Link from "next/link";
import { useMCTable } from "@/lib/hooks/use-mission-control";
import { useBodylyticsRpc } from "@/lib/hooks/use-bodylytics";

// Fallback demo data when DB isn't connected yet
const fallbackActivities = [
  { id: "1", agent_id: "bl-marketing", activity_type: "content", title: "Blog post: 5 Body Language Mistakes That Kill Sales", summary: "1,200 words, SEO optimised, ready for review", created_at: new Date(Date.now() - 25 * 60000).toISOString() },
  { id: "2", agent_id: "infra", activity_type: "report", title: "Daily Infrastructure Report", summary: "All 14 containers healthy. Disk at 62%.", created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
  { id: "3", agent_id: "bl-support", activity_type: "task_complete", title: "Auto-replied to ticket #47: Password reset", summary: "Standard KB response sent", created_at: new Date(Date.now() - 3 * 3600000).toISOString() },
  { id: "4", agent_id: "bl-social", activity_type: "content", title: "Weekly social calendar created", summary: "5 posts: 2 LinkedIn, 2 Instagram, 1 TikTok", created_at: new Date(Date.now() - 5 * 3600000).toISOString() },
  { id: "5", agent_id: "bl-qa", activity_type: "report", title: "Smoke test passed: staging", summary: "All 6 checks green", created_at: new Date(Date.now() - 8 * 3600000).toISOString() },
];

interface DashboardMetrics {
  total_users?: number;
  total_enrollments?: number;
  total_revenue?: number;
  open_tickets?: number;
}

const quickActions = [
  { label: "Write Blog Post", icon: PenLine, href: "/content" },
  { label: "Find Leads", icon: Search, href: "/pipeline" },
  { label: "Run Promo", icon: Megaphone, href: "/social" },
  { label: "Check Goals", icon: Target, href: "/goals" },
];

export default function DashboardPage() {
  // Live data from Mission Control DB
  const { data: activities, loading: activitiesLoading, error: activitiesError } = useMCTable<{
    id: string;
    agent_id: string;
    activity_type: string;
    title: string;
    summary: string;
    created_at: string;
  }>("agent_activity", { limit: 10, realtime: true });

  // Live data from BodyLytics (via proxy)
  const { data: blDashboard, loading: blLoading } = useBodylyticsRpc<DashboardMetrics>(
    "get_admin_dashboard_v2",
    { refreshInterval: 300000 } // 5 min
  );

  // Goal data from BodyLytics
  const { data: blGoals } = useBodylyticsRpc<Array<{
    kpi: string;
    target_value: number;
    current_value: number;
  }>>("get_business_goals_progress", { refreshInterval: 300000 });

  const [greeting, setGreeting] = useState("Good morning");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  // Use live data or fallback
  const isLive = activities.length > 0;
  const displayActivities = isLive ? activities : fallbackActivities;

  // Build metrics from live data or fallback
  const revenue = blDashboard?.total_revenue ?? 2340;
  const enrollments = blDashboard?.total_enrollments ?? 47;
  const openTickets = blDashboard?.open_tickets ?? 3;
  const agentTasksToday = activities.filter(
    (a) => new Date(a.created_at).toDateString() === new Date().toDateString()
  ).length || 12;

  const metrics = [
    { title: "Revenue This Month", value: `\u20AC${revenue.toLocaleString()}`, subtitle: "Target: \u20AC5,000", icon: DollarSign, trend: "up" as const, trendValue: "+12%", accentColor: "teal" as const },
    { title: "Active Enrollments", value: String(enrollments), subtitle: "3 new this week", icon: GraduationCap, trend: "up" as const, trendValue: "+6.8%", accentColor: "navy" as const },
    { title: "Open Tickets", value: String(openTickets), subtitle: "Avg response: 2.1h", icon: Headphones, trend: "down" as const, trendValue: "-2", accentColor: "copper" as const },
    { title: "Agent Tasks Today", value: String(agentTasksToday), subtitle: `${Math.round(agentTasksToday * 0.67)} completed`, icon: Bot, trend: "flat" as const, trendValue: "normal", accentColor: "teal" as const },
  ];

  // Build goals from live data or fallback
  const defaultGoals = [
    { label: "Revenue", actual: revenue, target: 5000, unit: "\u20AC" },
    { label: "Enrollments", actual: 12, target: 20 },
    { label: "Blog Posts", actual: 3, target: 8 },
    { label: "Discovery Calls", actual: 2, target: 6 },
    { label: "Deals Closed", actual: 1, target: 3 },
    { label: "LinkedIn Posts", actual: 8, target: 12 },
  ];

  const goals = blGoals
    ? blGoals.map((g) => ({
        label: g.kpi,
        actual: g.current_value,
        target: g.target_value,
      }))
    : defaultGoals;

  // Alerts based on goal progress
  const alerts = goals
    .filter((g) => g.target > 0 && g.actual / g.target < 0.5)
    .map((g, i) => ({
      id: `alert-${i}`,
      severity: "warning" as const,
      message: `${g.label} at ${Math.round((g.actual / g.target) * 100)}% of target — corrective action may be needed`,
    }));

  if (blLoading && activitiesLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-montserrat font-bold text-navy-500">Command Centre</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{greeting}, Sean. Here&apos;s your overview.</p>
      </div>

      {activitiesError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <strong>Supabase connection error:</strong> {activitiesError} — Check NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel env vars
        </div>
      )}
      {!activitiesError && !activitiesLoading && !isLive && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          Showing demo data — no live data found. Either the database is empty or the connection failed silently.
        </div>
      )}

      <AlertBanner alerts={alerts} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <MetricCard key={m.title} {...m} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-montserrat font-semibold text-navy-500">Goal Progress</h2>
            <Link href="/goals" className="text-xs font-medium text-teal-600 hover:text-teal-700">&rarr; View all</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {goals.slice(0, 6).map((g) => (
              <GoalGauge key={g.label} {...g} size="sm" />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-montserrat font-semibold text-navy-500">Recent Activity</h2>
            <Link href="/agents" className="text-xs font-medium text-teal-600 hover:text-teal-700">&rarr; View all</Link>
          </div>
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <RecentActivity activities={displayActivities} />
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link key={action.label} href={action.href} className="flex items-center gap-3 p-4 bg-white rounded-xl border border-border hover:border-teal-300 hover:shadow-md transition-all group">
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
