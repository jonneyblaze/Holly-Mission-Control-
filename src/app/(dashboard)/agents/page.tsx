"use client";

import { useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useMCTable, useMCUpdate, useMCInsert } from "@/lib/hooks/use-mission-control";
import {
  Loader2,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  CircleDot,
  ListTodo,
  ChevronDown,
  Plus,
  X,
  Play,
  Pause,
  Send,
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
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
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

// ---------- Quick Task Modal ----------
function QuickTaskModal({
  agentId,
  agentName,
  onClose,
  onCreated,
}: {
  agentId: string;
  agentName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const { insert, loading } = useMCInsert("tasks");

  const handleSubmit = async () => {
    if (!title.trim()) return;
    await insert({
      title: title.trim(),
      status: "todo",
      priority,
      assigned_agent: agentId,
      source: "manual",
    });
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-navy-500">
            Assign task to {agentName}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-navy-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <input
          type="text"
          placeholder="Task title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          autoFocus
          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
        />

        <div className="flex gap-2">
          {(["low", "medium", "high", "urgent"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                priority === p
                  ? priorityColor[p] + " ring-2 ring-offset-1 ring-current/20"
                  : "bg-white text-muted-foreground border-border hover:border-slate-300"
              )}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-navy-500 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || loading}
            className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Assign Task
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Main Component ----------
export default function AgentsPage() {
  const { data: activities, loading: activitiesLoading } = useMCTable<Activity>("agent_activity", {
    limit: 50,
    realtime: true,
  });

  const { data: tasks, loading: tasksLoading, refetch: refetchTasks } = useMCTable<Task>("tasks", {
    limit: 100,
    realtime: true,
  });

  const { update: updateTask } = useMCUpdate("tasks");

  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [taskModalAgent, setTaskModalAgent] = useState<{ id: string; name: string } | null>(null);

  const isLoading = activitiesLoading && tasksLoading;

  const toggleAgent = useCallback((agentId: string) => {
    setExpandedAgent((prev) => (prev === agentId ? null : agentId));
  }, []);

  const handleTaskStatusChange = useCallback(
    async (taskId: string, newStatus: string) => {
      await updateTask(taskId, {
        status: newStatus,
        ...(newStatus === "done" ? { completed_at: new Date().toISOString() } : {}),
      });
      refetchTasks();
    },
    [updateTask, refetchTasks]
  );

  const { agentCards, totalWeek, totalOutputs } = useMemo(() => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600000);

    const cards = agentRoster.map((agent) => {
      const agentActivities = activities.filter((a) => a.agent_id === agent.agentId);
      const weekActivities = agentActivities.filter((a) => new Date(a.created_at) >= weekAgo);
      const lastActivityTime = agentActivities[0]?.created_at;

      const agentTasks = tasks.filter((t) => t.assigned_agent === agent.agentId);
      const currentTask = agentTasks.find((t) => t.status === "in_progress");
      const queuedTasks = agentTasks.filter((t) => t.status === "todo");
      const reviewTasks = agentTasks.filter((t) => t.status === "review");
      const doneTasks = agentTasks.filter((t) => t.status === "done");

      const timing = getTimingStatus(lastActivityTime);
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
        allOutputs: agentActivities,
        recentOutputs: agentActivities.slice(0, 3),
        tasksThisWeek: weekActivities.length,
      };
    });

    return {
      agentCards: cards,
      totalWeek: cards.reduce((sum, a) => sum + a.tasksThisWeek, 0),
      totalOutputs: activities.length,
    };
  }, [activities, tasks]);

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
      {/* Quick Task Modal */}
      {taskModalAgent && (
        <QuickTaskModal
          agentId={taskModalAgent.id}
          agentName={taskModalAgent.name}
          onClose={() => setTaskModalAgent(null)}
          onCreated={refetchTasks}
        />
      )}

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
              {" "}&mdash; assign to an agent on the Kanban board
            </p>
          </div>
        </Link>
      )}

      {/* Agent Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agentCards.map((agent) => {
          const isExpanded = expandedAgent === agent.agentId;

          return (
            <div
              key={agent.agentId}
              className={cn(
                "bg-white rounded-xl border overflow-hidden transition-all",
                agent.isWorking ? "border-teal-300 shadow-md" : "border-border",
                isExpanded ? "shadow-xl ring-1 ring-teal-200" : "hover:shadow-lg"
              )}
            >
              {/* Clickable Agent Header */}
              <button
                onClick={() => toggleAgent(agent.agentId)}
                className="w-full text-left p-4 pb-3 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-colors",
                      agent.isWorking ? "bg-teal-50" : "bg-slate-50"
                    )}>
                      {agent.emoji}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-navy-500">{agent.name}</h3>
                      <p className="text-[11px] text-muted-foreground">{agent.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
                    <ChevronDown className={cn(
                      "w-4 h-4 text-muted-foreground transition-transform",
                      isExpanded && "rotate-180"
                    )} />
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
              </button>

              {/* Current task + quick summary (always visible) */}
              {agent.currentTask && (
                <div className="px-4 py-2.5 bg-blue-50/50 border-t border-blue-100 flex items-center gap-2">
                  <CircleDot className="w-3.5 h-3.5 text-blue-500 animate-pulse flex-shrink-0" />
                  <p className="text-xs font-medium text-blue-800 truncate flex-1">{agent.currentTask.title}</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTaskStatusChange(agent.currentTask!.id, "done");
                    }}
                    className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded font-medium hover:bg-emerald-200 transition-colors flex-shrink-0"
                  >
                    Mark done
                  </button>
                </div>
              )}

              {/* Expanded Detail Panel */}
              {isExpanded && (
                <div className="bg-slate-50/70 border-t border-border/40">
                  {/* Action buttons */}
                  <div className="px-4 py-3 flex gap-2 border-b border-border/30">
                    <button
                      onClick={() => setTaskModalAgent({ id: agent.agentId, name: agent.name })}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-medium rounded-lg hover:bg-teal-700 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Assign Task
                    </button>
                    {agent.queuedTasks.length > 0 && !agent.currentTask && (
                      <button
                        onClick={() => handleTaskStatusChange(agent.queuedTasks[0].id, "in_progress")}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Play className="w-3 h-3" />
                        Start Next Task
                      </button>
                    )}
                    {agent.currentTask && (
                      <button
                        onClick={() => handleTaskStatusChange(agent.currentTask!.id, "todo")}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-600 border border-slate-200 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <Pause className="w-3 h-3" />
                        Pause Task
                      </button>
                    )}
                  </div>

                  {/* Task Queue */}
                  {agent.queuedTasks.length > 0 && (
                    <div className="px-4 py-3 border-b border-border/30">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Task Queue</span>
                      </div>
                      <div className="space-y-1.5">
                        {agent.queuedTasks.map((task) => (
                          <div key={task.id} className="flex items-center gap-2 group/task">
                            <button
                              onClick={() => handleTaskStatusChange(task.id, "in_progress")}
                              className="w-5 h-5 rounded border border-slate-300 flex items-center justify-center hover:bg-blue-50 hover:border-blue-300 transition-colors flex-shrink-0"
                              title="Start task"
                            >
                              <Play className="w-2.5 h-2.5 text-slate-400 group-hover/task:text-blue-500" />
                            </button>
                            <p className="text-xs text-navy-500 truncate flex-1">{task.title}</p>
                            <span className={cn(
                              "text-[8px] px-1.5 py-0.5 rounded font-medium flex-shrink-0",
                              priorityColor[task.priority] || "bg-slate-100 text-slate-600"
                            )}>
                              {task.priority}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Review tasks */}
                  {agent.reviewTasks.length > 0 && (
                    <div className="px-4 py-3 border-b border-border/30">
                      <div className="flex items-center gap-1.5 mb-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Needs Review</span>
                      </div>
                      {agent.reviewTasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-2 py-1">
                          <p className="text-xs text-navy-500 truncate flex-1">{task.title}</p>
                          <button
                            onClick={() => handleTaskStatusChange(task.id, "done")}
                            className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded font-medium hover:bg-emerald-200 transition-colors"
                          >
                            Approve
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* All outputs */}
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                        All Output ({agent.allOutputs.length})
                      </span>
                    </div>
                    {agent.allOutputs.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {agent.allOutputs.map((output) => {
                          const badgeColor = typeColor[output.activity_type] || "bg-slate-100 text-slate-600";
                          return (
                            <div key={output.id} className="bg-white rounded-lg border border-border/50 p-2.5">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className={cn("text-[8px] px-1.5 py-0.5 rounded font-medium", badgeColor)}>
                                  {output.activity_type.replace(/_/g, " ")}
                                </span>
                                <span className="text-[10px] text-muted-foreground ml-auto">
                                  {formatDistanceToNow(new Date(output.created_at), { addSuffix: true })}
                                </span>
                              </div>
                              <p className="text-xs font-medium text-navy-500">{output.title}</p>
                              {output.summary && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">{output.summary}</p>
                              )}
                              {output.full_content && (
                                <details className="mt-1.5">
                                  <summary className="text-[10px] text-teal-600 cursor-pointer hover:text-teal-700 font-medium">
                                    View full output
                                  </summary>
                                  <pre className="mt-1 text-[10px] text-navy-400 whitespace-pre-wrap bg-slate-50 rounded p-2 max-h-40 overflow-y-auto">
                                    {output.full_content}
                                  </pre>
                                </details>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic">No outputs yet</p>
                    )}
                  </div>
                </div>
              )}

              {/* Collapsed preview (when not expanded) */}
              {!isExpanded && agent.recentOutputs.length > 0 && (
                <div className="bg-slate-50/70 border-t border-border/40 px-4 py-2">
                  <p className="text-[11px] text-muted-foreground truncate">
                    <span className="font-medium text-navy-500">Latest:</span>{" "}
                    {agent.recentOutputs[0].title}
                    <span className="text-[10px] ml-1">
                      ({formatDistanceToNow(new Date(agent.recentOutputs[0].created_at), { addSuffix: true })})
                    </span>
                  </p>
                </div>
              )}

              {!isExpanded && !agent.currentTask && agent.recentOutputs.length === 0 && (
                <div className="bg-slate-50/70 border-t border-border/40 px-4 py-2.5 text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTaskModalAgent({ id: agent.agentId, name: agent.name });
                    }}
                    className="text-[11px] text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1 mx-auto"
                  >
                    <Plus className="w-3 h-3" />
                    Assign first task
                  </button>
                </div>
              )}
            </div>
          );
        })}
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
