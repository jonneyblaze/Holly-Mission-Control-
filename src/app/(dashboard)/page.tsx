"use client";

import { useEffect, useState, useMemo } from "react";
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
  CheckCircle2,
  Wifi,
  WifiOff,
} from "lucide-react";
import MetricCard from "@/components/dashboard/MetricCard";
import GoalGauge from "@/components/dashboard/GoalGauge";
import RecentActivity from "@/components/dashboard/RecentActivity";
import AlertBanner from "@/components/dashboard/AlertBanner";
import Link from "next/link";
import { useMCTable } from "@/lib/hooks/use-mission-control";

// ---------- Types ----------
interface Activity {
  id: string;
  agent_id: string;
  activity_type: string;
  title: string;
  summary: string;
  created_at: string;
}

interface GoalSnapshot {
  id: string;
  snapshot_date: string;
  metrics: Record<string, { target: number; actual: number; pace?: string }>;
  corrective_actions?: Array<{ kpi: string; action: string }>;
  created_at: string;
}

interface Task {
  id: string;
  status: string;
  created_at: string;
}

interface InfraSnapshot {
  id: string;
  containers: Array<{ name: string; status: string }>;
  alerts: Array<{ message: string }>;
  created_at: string;
}

// ---------- Quick Actions ----------
const quickActions = [
  { label: "Write Blog Post", icon: PenLine, href: "/content" },
  { label: "Find Leads", icon: Search, href: "/pipeline" },
  { label: "Run Promo", icon: Megaphone, href: "/social" },
  { label: "Check Goals", icon: Target, href: "/goals" },
];

// ---------- Component ----------
export default function DashboardPage() {
  // All data from Mission Control's own Supabase
  const { data: activities, loading: activitiesLoading, error: activitiesError } = useMCTable<Activity>(
    "agent_activity", { limit: 10, realtime: true }
  );

  const { data: goalSnapshots, loading: goalsLoading } = useMCTable<GoalSnapshot>(
    "goal_snapshots", { limit: 1, orderBy: "created_at", orderAsc: false }
  );

  const { data: tasks } = useMCTable<Task>("tasks", { limit: 50 });

  const { data: infraSnapshots } = useMCTable<InfraSnapshot>(
    "infra_snapshots", { limit: 1, orderBy: "created_at", orderAsc: false }
  );

  const [greeting, setGreeting] = useState("Good morning");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  // Connection status
  const isLive = activities.length > 0;
  const isLoading = activitiesLoading && goalsLoading;

  // Activities feed
  const displayActivities = activities;

  // Build metrics from Mission Control data
  const latestGoals = goalSnapshots.length > 0 ? goalSnapshots[0] : null;
  const goalMetrics = latestGoals?.metrics ?? {};

  const revenue = goalMetrics.revenue?.actual ?? 0;
  const revenueTarget = goalMetrics.revenue?.target ?? 5000;
  const enrollments = goalMetrics.enrollments?.actual ?? goalMetrics.active_enrollments?.actual ?? 0;

  const openTasks = tasks.filter((t) => t.status === "todo" || t.status === "in_progress").length;
  const completedTasks = tasks.filter((t) => t.status === "done").length;

  const agentTasksToday = activities.filter(
    (a) => new Date(a.created_at).toDateString() === new Date().toDateString()
  ).length;

  const latestInfra = infraSnapshots.length > 0 ? infraSnapshots[0] : null;
  const healthyContainers = latestInfra?.containers?.filter((c) => c.status === "running").length ?? 0;
  const totalContainers = latestInfra?.containers?.length ?? 0;
  const activeAlerts = latestInfra?.alerts?.length ?? 0;

  const metrics = [
    {
      title: "Revenue This Month",
      value: revenue > 0 ? `\u20AC${revenue.toLocaleString()}` : "\u20AC0",
      subtitle: `Target: \u20AC${revenueTarget.toLocaleString()}`,
      icon: DollarSign,
      trend: (revenue / revenueTarget > 0.8 ? "up" : revenue / revenueTarget > 0.5 ? "flat" : "down") as "up" | "flat" | "down",
      trendValue: revenueTarget > 0 ? `${Math.round((revenue / revenueTarget) * 100)}%` : "—",
      accentColor: "teal" as const,
    },
    {
      title: "Open Tasks",
      value: String(openTasks),
      subtitle: `${completedTasks} completed`,
      icon: CheckCircle2,
      trend: "flat" as const,
      trendValue: `${tasks.length} total`,
      accentColor: "navy" as const,
    },
    {
      title: "Infrastructure",
      value: totalContainers > 0 ? `${healthyContainers}/${totalContainers}` : "—",
      subtitle: activeAlerts > 0 ? `${activeAlerts} active alert${activeAlerts > 1 ? "s" : ""}` : "All clear",
      icon: Headphones,
      trend: (activeAlerts === 0 ? "up" : "down") as "up" | "down",
      trendValue: activeAlerts === 0 ? "healthy" : `${activeAlerts} alert${activeAlerts > 1 ? "s" : ""}`,
      accentColor: "copper" as const,
    },
    {
      title: "Agent Activity Today",
      value: String(agentTasksToday),
      subtitle: `${activities.length} total entries`,
      icon: Bot,
      trend: "flat" as const,
      trendValue: `${new Set(activities.map((a) => a.agent_id)).size} agents`,
      accentColor: "teal" as const,
    },
  ];

  // Build goals from goal_snapshots
  const goals = useMemo(() => {
    if (!latestGoals?.metrics) {
      return [
        { label: "Revenue", actual: 0, target: 5000, unit: "\u20AC" },
        { label: "Enrollments", actual: 0, target: 20 },
        { label: "Blog Posts", actual: 0, target: 8 },
        { label: "Discovery Calls", actual: 0, target: 6 },
        { label: "Deals Closed", actual: 0, target: 3 },
        { label: "LinkedIn Posts", actual: 0, target: 12 },
      ];
    }
    return Object.entries(latestGoals.metrics).map(([key, val]) => ({
      label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      actual: val.actual ?? 0,
      target: val.target ?? 0,
      unit: key.includes("revenue") ? "\u20AC" : undefined,
    }));
  }, [latestGoals]);

  // Alerts based on goal progress
  const alerts = goals
    .filter((g) => g.target > 0 && g.actual / g.target < 0.5)
    .map((g, i) => ({
      id: `alert-${i}`,
      severity: "warning" as const,
      message: `${g.label} at ${Math.round((g.actual / g.target) * 100)}% of target — corrective action may be needed`,
    }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">Command Centre</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{greeting}, Sean. Here&apos;s your overview.</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {isLive ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-600 font-medium">Live</span>
            </>
          ) : activitiesError ? (
            <>
              <WifiOff className="w-3.5 h-3.5 text-red-500" />
              <span className="text-red-600 font-medium">Disconnected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-amber-600 font-medium">No data yet</span>
            </>
          )}
        </div>
      </div>

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
            {displayActivities.length > 0 ? (
              <RecentActivity activities={displayActivities} />
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No agent activity yet. Activities will appear here as agents POST to the ingest API.
              </div>
            )}
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
