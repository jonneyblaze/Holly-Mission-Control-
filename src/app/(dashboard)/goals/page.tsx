"use client";

import { useMemo } from "react";
import GoalGauge from "@/components/dashboard/GoalGauge";
import { Badge } from "@/components/ui/badge";
import { Bot, CheckCircle2, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { useMCTable } from "@/lib/hooks/use-mission-control";
import { useBodylyticsRpc } from "@/lib/hooks/use-bodylytics";

// ── Types ──────────────────────────────────────────────────────────────────────

interface GoalSnapshot {
  id: string;
  snapshot_date: string;
  period_type: string;
  metrics: Record<string, { target: number; actual: number; pace: number }>;
  alerts: { kpi: string; message: string; severity: string }[];
  corrective_actions: { kpi: string; action: string; agent: string; status: string }[];
  created_at: string;
}

interface BodylyticsDashboard {
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
  new_enrollments?: number;
  total_revenue?: number;
}

// ── Demo / fallback data ───────────────────────────────────────────────────────

const DEMO_GOALS = [
  { label: "Revenue", actual: 2340, target: 5000, unit: "€" },
  { label: "Enrollments", actual: 12, target: 20 },
  { label: "Blog Posts", actual: 3, target: 8 },
  { label: "Discovery Calls", actual: 2, target: 6 },
  { label: "Deals Closed", actual: 1, target: 3 },
  { label: "LinkedIn Posts", actual: 8, target: 12 },
  { label: "YouTube Videos", actual: 0, target: 2 },
  { label: "Proposals Sent", actual: 4, target: 8 },
];

interface CorrectiveAction {
  id: string;
  kpi: string;
  action: string;
  agent: string;
  status: string;
}

const DEMO_CORRECTIVE_ACTIONS: CorrectiveAction[] = [
  { id: "1", kpi: "Revenue", action: "Flash sale campaign: 20% off NVC for Sales course", agent: "bl-marketing", status: "pending" },
  { id: "2", kpi: "Revenue", action: "Email blast to unconverted leads with value-first content", agent: "bl-marketing", status: "executing" },
  { id: "3", kpi: "Blog Posts", action: "Batch write 3 blog posts: micro-expressions, deception cues, mirroring", agent: "bl-marketing", status: "done" },
  { id: "4", kpi: "Enrollments", action: "Referral boost campaign to existing students", agent: "bl-social", status: "pending" },
];

const statusConfig = {
  pending: { icon: Clock, color: "bg-amber-100 text-amber-700", label: "Pending" },
  executing: { icon: Bot, color: "bg-teal-100 text-teal-700", label: "Executing" },
  done: { icon: CheckCircle2, color: "bg-emerald-100 text-emerald-700", label: "Done" },
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  // Mission Control: goal_snapshots with realtime (latest first)
  const {
    data: goalSnapshots,
    loading: goalsLoading,
  } = useMCTable<GoalSnapshot>("goal_snapshots", { realtime: true, orderBy: "created_at", orderAsc: false, limit: 1 });

  // Bodylytics: real business metrics via RPC proxy
  const {
    data: blDashboard,
  } = useBodylyticsRpc<BodylyticsDashboard>("get_admin_dashboard_v2");

  const latestSnapshot = goalSnapshots.length > 0 ? goalSnapshots[0] : null;

  // Merge: live goal_snapshots > bodylytics business_goals > demo fallback
  const goals = useMemo(() => {
    if (latestSnapshot?.metrics) {
      const m = latestSnapshot.metrics;
      return Object.entries(m)
        .filter(([, v]) => typeof v === "object" && v !== null && "target" in v)
        .map(([key, v]) => ({
          label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
          actual: v.actual ?? 0,
          target: v.target ?? 1,
          unit: key === "revenue" ? "€" : undefined,
        }));
    }
    if (blDashboard?.current_goals) {
      const g = blDashboard.current_goals;
      return [
        { label: "Revenue", actual: Number(g.actual_revenue ?? blDashboard.total_revenue ?? 0), target: g.revenue_target ?? 35000, unit: "€" },
        { label: "Enrollments", actual: g.actual_enrollments ?? blDashboard.new_enrollments ?? 0, target: g.enrollment_target ?? 60 },
        { label: "Blog Posts", actual: 0, target: g.blog_posts_target ?? 12 },
        { label: "Discovery Calls", actual: 0, target: g.discovery_calls_target ?? 80 },
        { label: "Deals Closed", actual: 0, target: g.deals_closed_target ?? 30 },
        { label: "LinkedIn Posts", actual: 0, target: g.linkedin_posts_target ?? 36 },
      ];
    }
    return DEMO_GOALS;
  }, [latestSnapshot, blDashboard]);

  // Corrective actions from snapshot or demo
  const correctiveActions = useMemo(() => {
    if (latestSnapshot?.corrective_actions && latestSnapshot.corrective_actions.length > 0) {
      return latestSnapshot.corrective_actions.map((a, i) => ({
        id: String(i),
        ...a,
      }));
    }
    return DEMO_CORRECTIVE_ACTIONS;
  }, [latestSnapshot]);

  const isLoading = goalsLoading;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-montserrat font-bold text-navy-500">Business Goals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          April 2026 &middot; Monthly targets with mid-week correction
        </p>
      </div>

      {/* Goal Gauges Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {goals.map((g) => (
            <GoalGauge key={g.label} {...g} />
          ))}
        </div>
      )}

      {/* Corrective Actions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-copper-500" />
          <h2 className="text-lg font-montserrat font-semibold text-navy-500">
            Corrective Actions
          </h2>
        </div>
        <div className="bg-white rounded-xl border border-border divide-y divide-border">
          {correctiveActions.map((action) => {
            const config = statusConfig[action.status as keyof typeof statusConfig];
            const StatusIcon = config?.icon ?? Clock;
            const statusColor = config?.color ?? "bg-gray-100 text-gray-700";
            const statusLabel = config?.label ?? action.status;
            return (
              <div key={action.id} className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] font-bold">
                      {action.kpi}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{action.agent}</span>
                  </div>
                  <p className="text-sm font-medium text-navy-500 truncate">{action.action}</p>
                </div>
                <Badge className={`${statusColor} text-[10px] gap-1`}>
                  <StatusIcon className="w-3 h-3" />
                  {statusLabel}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
