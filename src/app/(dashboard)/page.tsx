"use client";

import { useEffect, useState, useMemo } from "react";
import {
  DollarSign,
  GraduationCap,
  Bot,
  PenLine,
  Search,
  Megaphone,
  Target,
  Loader2,
  Wifi,
  WifiOff,
  Users,
} from "lucide-react";
import MetricCard from "@/components/dashboard/MetricCard";
import GoalGauge from "@/components/dashboard/GoalGauge";
import RecentActivity from "@/components/dashboard/RecentActivity";
import AlertBanner from "@/components/dashboard/AlertBanner";
import Link from "next/link";
import { useMCTable } from "@/lib/hooks/use-mission-control";
import { useBodylyticsRpc } from "@/lib/hooks/use-bodylytics";

// ---------- Types ----------
interface Activity {
  id: string;
  agent_id: string;
  activity_type: string;
  title: string;
  summary: string;
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

interface BodylyticsDashboard {
  total_revenue?: number;
  total_students?: number;
  new_students?: number;
  active_students?: number;
  new_enrollments?: number;
  paid_enrollments?: number;
  completion_rate?: number;
  top_courses?: Array<{ title: string; students_enrolled: number; revenue: number }>;
  current_goals?: {
    revenue_target?: number;
    enrollment_target?: number;
    blog_posts_target?: number;
    discovery_calls_target?: number;
    deals_closed_target?: number;
    linkedin_posts_target?: number;
    actual_revenue?: number;
    actual_enrollments?: number;
    actual_course_sales?: number;
  };
  crm_pipeline?: Array<{ stage: string; count: number }>;
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
  // Mission Control data
  const { data: activities, loading: activitiesLoading, error: activitiesError } = useMCTable<Activity>(
    "agent_activity", { limit: 10, realtime: true }
  );
  const { data: tasks } = useMCTable<Task>("tasks", { limit: 50 });
  const { data: infraSnapshots } = useMCTable<InfraSnapshot>(
    "infra_snapshots", { limit: 1, orderBy: "created_at", orderAsc: false }
  );

  // BodyLytics production data (real business metrics)
  const { data: blDashboard, loading: blLoading } = useBodylyticsRpc<BodylyticsDashboard>(
    "get_admin_dashboard_v2",
    { refreshInterval: 300000 }
  );

  const [greeting, setGreeting] = useState("Good morning");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  // Connection status
  const isLive = activities.length > 0 || !!blDashboard;
  const isLoading = activitiesLoading && blLoading;

  // BodyLytics metrics
  const revenue = blDashboard?.total_revenue ?? 0;
  const revenueTarget = blDashboard?.current_goals?.revenue_target ?? 35000;
  const totalStudents = blDashboard?.total_students ?? 0;
  const newEnrollments = blDashboard?.new_enrollments ?? 0;
  const completionRate = blDashboard?.completion_rate ?? 0;

  // Mission Control metrics
  const openTasks = tasks.filter((t) => t.status === "todo" || t.status === "in_progress").length;
  const completedTasks = tasks.filter((t) => t.status === "done").length;

  const agentTasksToday = activities.filter(
    (a) => new Date(a.created_at).toDateString() === new Date().toDateString()
  ).length;

  const latestInfra = infraSnapshots.length > 0 ? infraSnapshots[0] : null;
  const healthyContainers = latestInfra?.containers?.filter((c) => c.status === "running").length ?? 0;
  const totalContainers = latestInfra?.containers?.length ?? 0;
  const activeAlerts = latestInfra?.alerts?.length ?? 0;

  // CRM pipeline total
  const pipelineLeads = blDashboard?.crm_pipeline?.reduce((sum, s) => sum + s.count, 0) ?? 0;

  const metrics = [
    {
      title: "Revenue",
      value: `\u20AC${revenue.toLocaleString("en-IE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      subtitle: `Target: \u20AC${revenueTarget.toLocaleString()}`,
      icon: DollarSign,
      trend: (revenue / revenueTarget > 0.8 ? "up" : revenue / revenueTarget > 0.5 ? "flat" : "down") as "up" | "flat" | "down",
      trendValue: revenueTarget > 0 ? `${Math.round((revenue / revenueTarget) * 100)}% of target` : "—",
      accentColor: "teal" as const,
    },
    {
      title: "Students",
      value: String(totalStudents),
      subtitle: `${newEnrollments} enrollments · ${completionRate}% completion`,
      icon: GraduationCap,
      trend: newEnrollments > 0 ? "up" as const : "flat" as const,
      trendValue: `${newEnrollments} new`,
      accentColor: "navy" as const,
    },
    {
      title: "Pipeline",
      value: String(pipelineLeads),
      subtitle: `${openTasks} open tasks · ${completedTasks} done`,
      icon: Users,
      trend: "flat" as const,
      trendValue: `${tasks.length} tasks`,
      accentColor: "copper" as const,
    },
    {
      title: "Agent Activity",
      value: String(agentTasksToday),
      subtitle: totalContainers > 0
        ? `${healthyContainers}/${totalContainers} containers${activeAlerts > 0 ? ` · ${activeAlerts} alert${activeAlerts > 1 ? "s" : ""}` : ""}`
        : `${activities.length} total entries`,
      icon: Bot,
      trend: activeAlerts > 0 ? "down" as const : "up" as const,
      trendValue: `${new Set(activities.map((a) => a.agent_id)).size} agents`,
      accentColor: "teal" as const,
    },
  ];

  // Build goals from BodyLytics current_goals
  const goals = useMemo(() => {
    const g = blDashboard?.current_goals;
    if (!g) return [];

    const actualEnrollments = g.actual_enrollments ?? newEnrollments;
    const actualRevenue = g.actual_revenue ?? revenue;

    return [
      { label: "Revenue", actual: Number(actualRevenue), target: g.revenue_target ?? 35000, unit: "\u20AC" },
      { label: "Enrollments", actual: actualEnrollments, target: g.enrollment_target ?? 60 },
      { label: "Blog Posts", actual: 0, target: g.blog_posts_target ?? 12 },
      { label: "Discovery Calls", actual: 0, target: g.discovery_calls_target ?? 80 },
      { label: "Deals Closed", actual: 0, target: g.deals_closed_target ?? 30 },
      { label: "LinkedIn Posts", actual: 0, target: g.linkedin_posts_target ?? 36 },
    ];
  }, [blDashboard, newEnrollments, revenue]);

  // Alerts based on goal progress (only if we have goals data)
  const alerts = goals
    .filter((g) => g.target > 0 && g.actual / g.target < 0.3)
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

      {alerts.length > 0 && <AlertBanner alerts={alerts} />}

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
          {goals.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {goals.slice(0, 6).map((g) => (
                <GoalGauge key={g.label} {...g} size="sm" />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
              Loading goals from BodyLytics...
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-montserrat font-semibold text-navy-500">Recent Activity</h2>
            <Link href="/agents" className="text-xs font-medium text-teal-600 hover:text-teal-700">&rarr; View all</Link>
          </div>
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            {activities.length > 0 ? (
              <RecentActivity activities={activities} />
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No agent activity yet. Activities appear as agents POST to the ingest API.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Courses from BodyLytics */}
      {blDashboard?.top_courses && blDashboard.top_courses.length > 0 && (
        <div>
          <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">Top Courses</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {blDashboard.top_courses.slice(0, 3).map((course) => (
              <div key={course.title} className="bg-white rounded-xl border border-border p-4">
                <p className="text-sm font-semibold text-navy-500 truncate">{course.title}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-muted-foreground">{course.students_enrolled} students</span>
                  <span className="text-xs text-muted-foreground">\u20AC{course.revenue}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
