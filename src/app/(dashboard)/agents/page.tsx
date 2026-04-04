"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useMCTable } from "@/lib/hooks/use-mission-control";
import {
  Loader2,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  CircleDot,
  ListTodo,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

// ---------- Agent roster ----------
const agentRoster = [
  { name: "Holly", emoji: "📋", model: "Claude Sonnet", agentId: "holly", role: "Executive PA & Orchestrator" },
  { name: "Social", emoji: "📱", model: "Gemini Flash", agentId: "bl-social", role: "Social media content" },
  { name: "Community", emoji: "🤝", model: "Gemini Flash", agentId: "bl-community", role: "Community engagement" },
  { name: "Marketing", emoji: "📈", model: "Claude Sonnet", agentId: "bl-marketing", role: "Blog, SEO, email copy" },
  { name: "Content", emoji: "✍️", model: "Claude Sonnet", agentId: "bl-content", role: "Course lessons & quizzes" },
  { name: "Duracell Prep", emoji: "💼", model: "Claude Sonnet", agentId: "duracell-prep", role: "Career prep & plans" },
  { name: "Support", emoji: "🎧", model: "Gemini Flash", agentId: "bl-support", role: "Ticket replies & KB" },
  { name: "QA", emoji: "🧪", model: "Claude Haiku", agentId: "bl-qa", role: "Testing & quality checks" },
  { name: "Infra", emoji: "🏗️", model: "Claude Sonnet", agentId: "infra", role: "Server health & Docker" },
  { name: "DevOps", emoji: "⚙️", model: "Claude Sonnet", agentId: "devops", role: "CI/CD & deployments" },
];

// ---------- Types ----------
interface Activity {
  id: string;
  agent_id: string;
  activity_type: string;
  title: string;
  summary: string;
  full_content: string | null;
  created_at: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  segment: string | null;
  assigned_agent: string | null;
  source: string;
  created_at: string;
  completed_at: string | null;
}

// ---------- Helpers ----------
const typeColor: Record<string, string> = {
  social_post: "bg-blue-100 text-blue-700",
  report: "bg-slate-100 text-slate-700",
  alert: "bg-red-100 text-red-700",
  infra_snapshot: "bg-teal-100 text-teal-700",
  content: "bg-purple-100 text-purple-700",
  task: "bg-emerald-100 text-emerald-700",
  goal_snapshot: "bg-amber-100 text-amber-700",
  kb_gap: "bg-orange-100 text-orange-700",
};

const priorityColor: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

function getTimingStatus(lastActivity: string | undefined): {
  label: string;
  dotColor: string;
  pulse: boolean;
} {
  if (!lastActivity) return { label: "Never run", dotColor: "bg-slate-300", pulse: false };
  const mins = (Date.now() - new Date(lastActivity).getTime()) / 60000;
  if (mins < 5) return { label: "Just now", dotColor: "bg-emerald-500", pulse: true };
  if (mins < 60) return { label: `${Math.round(mins)}m ago`, dotColor: "bg-teal-500", pulse: false };
  if (mins < 1440) return { label: `${Math.round(mins / 60)}h ago`, dotColor: "bg-slate-400", pulse: false };
  return { label: `${Math.round(mins / 1440)}d ago`, dotColor: "bg-slate-300", pulse: false };
}

// ---------- Component ----------
export default function AgentsPage() {
  const { data: activities, loading: activitiesLoading } = useMCTable<Activity>("agent_activity", {
    limit: 50,
    realtime: true,
  });

  const { data: tasks, loading: tasksLoading } = useMCTable<Task>("tasks", {
    limit: 100,
    realtime: true,
  });

  const isLoading = activitiesLoading && tasksLoading;

  const { agentCards, totalWeek, totalOutputs } = useMemo(() => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600000);

    const cards = agentRoster.map((agent) => {
      // Activity (completed work / outputs)
      const agentActivities = activities.filter((a) => a.agent_id === agent.agentId);
      const weekActivities = agentActivities.filter((a) => new Date(a.created_at) >= weekAgo);
      const lastActivityTime = agentActivities[0]?.created_at;

      // Tasks assigned to this agent
      const agentTasks = tasks.filter((t) => t.assigned_agent === agent.agentId);
      const currentTask = agentTasks.find((t) => t.status === "in_progress");
      const queuedTasks = agentTasks.filter((t) => t.status === "todo");
      const reviewTasks = agentTasks.filter((t) => t.status === "review");
      const doneTasks = agentTasks.filter((t) => t.status === "done");

      const timing = getTimingStatus(lastActivityTime);

      // Working = has in_progress task OR very recent activity
      const isWorking = !!currentTask || timing.pulse;

      return {
        ...agent,
        timing,
        isWorking,
        currentTask,
        queuedTasks,
        reviewTasks,
        doneTasks,
        totalAssigned: agentTasks.length,
        recentOutputs: agentActivities.slice(0, 3),
        tasksThisWeek: weekActivities.length,
      };
    });

    const tw = cards.reduce((sum, a) => sum + a.tasksThisWeek, 0);
    const to = activities.length;

    return { agentCards: cards, totalWeek: tw, totalOutputs: to };
  }, [activities, tasks]);

  // Unassigned tasks
  const unassignedTasks = tasks.filter((t) => !t.assigned_agent && t.status !== "done");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">Agent Fleet</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {agentRoster.length} agents &middot; {agentCards.filter((a) => a.isWorking).length} working &middot; {totalWeek} outputs this week &middot; {totalOutputs} total
          </p>
        </div>
        <Link
          href="/tasks"
          className="flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700 transition-colors"
        >
          <ListTodo className="w-4 h-4" />
          Manage Tasks
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Unassigned tasks alert */}
      {unassignedTasks.length > 0 && (
        <Link href="/tasks" className="block">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3 hover:bg-amber-100 transition-colors">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              <span className="font-semibold">{unassignedTasks.length} unassigned task{unassignedTasks.length > 1 ? "s" : ""}</span>
              {" "} — assign to an agent on the Kanban board
            </p>
          </div>
        </Link>
      )}

      {/* Agent Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agentCards.map((agent) => (
          <div
            key={agent.agentId}
            className={cn(
              "bg-white rounded-xl border overflow-hidden transition-all hover:shadow-lg",
              agent.isWorking ? "border-teal-300 shadow-md" : "border-border"
            )}
          >
            {/* Agent Header */}
            <div className="p-4 pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center text-lg",
                    agent.isWorking ? "bg-teal-50" : "bg-slate-50"
                  )}>
                    {agent.emoji}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-navy-500">{agent.name}</h3>
                    <p className="text-[11px] text-muted-foreground">{agent.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <div className={cn("w-2.5 h-2.5 rounded-full", agent.timing.dotColor)} />
                    {agent.timing.pulse && (
                      <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping opacity-75" />
                    )}
                  </div>
                  <span className={cn(
                    "text-[10px] font-medium",
                    agent.isWorking ? "text-teal-600" : "text-muted-foreground"
                  )}>
                    {agent.isWorking ? "Working" : agent.timing.label}
                  </span>
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/60 text-xs">
                <div className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-500" />
                  <span className="font-semibold text-navy-500">{agent.tasksThisWeek}</span>
                  <span className="text-muted-foreground">outputs</span>
                </div>
                <div className="flex items-center gap-1">
                  <ListTodo className="w-3 h-3 text-blue-500" />
                  <span className="font-semibold text-navy-500">{agent.queuedTasks.length}</span>
                  <span className="text-muted-foreground">queued</span>
                </div>
                {agent.doneTasks.length > 0 && (
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <span className="font-semibold text-navy-500">{agent.doneTasks.length}</span>
                    <span className="text-muted-foreground">done</span>
                  </div>
                )}
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide ml-auto">
                  {agent.model}
                </span>
              </div>
            </div>

            {/* Current Work Section */}
            <div className="bg-slate-50/70 border-t border-border/40">
              {/* Currently working on */}
              {agent.currentTask && (
                <div className="px-4 py-2.5 border-b border-border/30">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CircleDot className="w-3 h-3 text-blue-500 animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Working on</span>
                  </div>
                  <p className="text-xs font-medium text-navy-500">{agent.currentTask.title}</p>
                  {agent.currentTask.priority && (
                    <span className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded font-medium mt-1 inline-block",
                      priorityColor[agent.currentTask.priority] || "bg-slate-100 text-slate-600"
                    )}>
                      {agent.currentTask.priority}
                    </span>
                  )}
                </div>
              )}

              {/* Queued tasks */}
              {agent.queuedTasks.length > 0 && (
                <div className="px-4 py-2 border-b border-border/30">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Up next</span>
                  </div>
                  {agent.queuedTasks.slice(0, 2).map((task) => (
                    <div key={task.id} className="flex items-center gap-2 py-0.5">
                      <div className="w-1 h-1 rounded-full bg-slate-400" />
                      <p className="text-[11px] text-muted-foreground truncate">{task.title}</p>
                      <span className={cn(
                        "text-[8px] px-1 py-0 rounded font-medium ml-auto flex-shrink-0",
                        priorityColor[task.priority] || "bg-slate-100 text-slate-600"
                      )}>
                        {task.priority}
                      </span>
                    </div>
                  ))}
                  {agent.queuedTasks.length > 2 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      +{agent.queuedTasks.length - 2} more
                    </p>
                  )}
                </div>
              )}

              {/* Recent outputs */}
              {agent.recentOutputs.length > 0 ? (
                <div className="divide-y divide-border/30">
                  <div className="px-4 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Recent output</span>
                    </div>
                  </div>
                  {agent.recentOutputs.map((output) => {
                    const badgeColor = typeColor[output.activity_type] || "bg-slate-100 text-slate-600";

                    return (
                      <div key={output.id} className="px-4 py-2 flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-navy-500 truncate">{output.title}</p>
                          {output.summary && (
                            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{output.summary}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={cn("text-[8px] px-1 py-0.5 rounded font-medium", badgeColor)}>
                            {output.activity_type.replace(/_/g, " ")}
                          </span>
                          <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(output.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : !agent.currentTask && agent.queuedTasks.length === 0 ? (
                <div className="px-4 py-4 text-center">
                  <p className="text-[11px] text-muted-foreground italic">No tasks or activity yet</p>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Full Activity Stream */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-montserrat font-semibold text-navy-500">Activity Stream</h2>
          <Link href="/reports" className="text-xs font-medium text-teal-600 hover:text-teal-700">
            View all reports &rarr;
          </Link>
        </div>
        {activities.length > 0 ? (
          <div className="relative">
            <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />
            <div className="space-y-0.5">
              {activities.slice(0, 15).map((activity, i) => {
                const agent = agentRoster.find((a) => a.agentId === activity.agent_id);
                const badgeColor = typeColor[activity.activity_type] || "bg-slate-100 text-slate-600";
                const isFirst = i === 0;
                return (
                  <div key={activity.id} className="relative flex items-start gap-3 pl-10 py-2.5">
                    <div className={cn(
                      "absolute left-[14px] top-[16px] w-[11px] h-[11px] rounded-full border-2 border-white z-10",
                      isFirst ? "bg-teal-500" : "bg-slate-300"
                    )} />
                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-sm flex-shrink-0">
                      {agent?.emoji || "🤖"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-navy-500">{agent?.name || activity.agent_id}</span>
                        <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-medium", badgeColor)}>
                          {activity.activity_type.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-navy-500 mt-0.5">{activity.title}</p>
                      {activity.summary && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{activity.summary}</p>
                      )}
                      {activity.full_content && (
                        <details className="mt-1">
                          <summary className="text-[11px] text-teal-600 cursor-pointer hover:text-teal-700 font-medium">
                            View full output
                          </summary>
                          <pre className="mt-1 text-[11px] text-navy-400 whitespace-pre-wrap bg-white rounded-lg p-3 max-h-48 overflow-y-auto border border-border/50">
                            {activity.full_content}
                          </pre>
                        </details>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0 pt-0.5">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No agent activity yet. Outputs will appear here as agents POST to the ingest API.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
