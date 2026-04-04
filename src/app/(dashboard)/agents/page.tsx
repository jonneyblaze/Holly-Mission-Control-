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
  MessageCircleQuestion,
  Bell,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { toast } from "sonner";
import { ViewOutputButton } from "@/components/dashboard/ContentModal";

// ---------- Agent roster ----------
const agentRoster = [
  { name: "Holly", emoji: "📋", model: "Gemini 2.5 Flash", agentId: "holly", role: "Executive PA & Orchestrator" },
  { name: "Social", emoji: "📱", model: "Gemini 2.5 Flash", agentId: "bl-social", role: "Social media content" },
  { name: "Community", emoji: "🤝", model: "Gemini 2.5 Flash", agentId: "bl-community", role: "Community engagement" },
  { name: "Marketing", emoji: "📈", model: "Gemini 2.5 Pro", agentId: "bl-marketing", role: "Blog, SEO, email copy" },
  { name: "Content", emoji: "✍️", model: "Gemini 2.5 Pro", agentId: "bl-content", role: "Course lessons & quizzes" },
  { name: "Duracell Prep", emoji: "💼", model: "Gemini 2.5 Pro", agentId: "duracell-prep", role: "Career prep & plans" },
  { name: "Support", emoji: "🎧", model: "Gemini 2.5 Flash", agentId: "bl-support", role: "Ticket replies & KB" },
  { name: "QA", emoji: "🧪", model: "Gemini 2.5 Flash", agentId: "bl-qa", role: "Testing & quality checks" },
  { name: "Infra", emoji: "🏗️", model: "DeepSeek V3", agentId: "infra", role: "Server health & Docker" },
  { name: "DevOps", emoji: "⚙️", model: "DeepSeek V3", agentId: "devops", role: "CI/CD & deployments" },
  { name: "Private", emoji: "🔒", model: "Qwen 2.5 32B (Ollama)", agentId: "private", role: "Local private assistant" },
];

// ---------- Types ----------
interface Activity {
  id: string;
  agent_id: string;
  activity_type: string;
  title: string;
  summary: string;
  full_content: string | null;
  status: string;
  metadata: Record<string, unknown>;
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
  task_complete: "bg-emerald-100 text-emerald-700",
  goal_snapshot: "bg-amber-100 text-amber-700",
  kb_gap: "bg-orange-100 text-orange-700",
  clarification: "bg-amber-100 text-amber-700",
  trigger: "bg-indigo-100 text-indigo-700",
};

const priorityColor: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

const INGEST_KEY = "9eRse679@ohyEdCz&UAUL@V9V6t*xW@%47r4vQfFeThowllEBsIv";

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
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const { insert, loading } = useMCInsert("tasks");
  const [triggering, setTriggering] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    try {
      // Create the task and capture the returned ID
      const taskData = {
        title: title.trim(),
        description: description.trim() || null,
        status: "in_progress",
        priority,
        assigned_agent: agentId,
        source: "manual",
      };
      const result = await insert(taskData);
      const taskId = result?.id;

      // Trigger the agent via OpenClaw — WITH the task_id so agent can link back
      setTriggering(true);
      try {
        const res = await fetch("/api/trigger-agent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${INGEST_KEY}`,
          },
          body: JSON.stringify({
            agent_id: agentId,
            task_title: title.trim(),
            task_description: description.trim() || undefined,
            task_id: taskId,
          }),
        });
        const data = await res.json();
        if (data.ok && !data.queued) {
          toast.success(`${agentName} is now working on it!`);
        } else if (data.ok && data.queued) {
          toast.success(`Task queued — ${agentName} will pick it up shortly`);
        } else {
          toast.warning(`Task created but couldn't trigger ${agentName}: ${data.error}`);
        }
      } catch {
        toast.warning(`Task created but couldn't reach ${agentName}`);
      }

      onCreated();
      onClose();
    } catch {
      toast.error("Failed to create task");
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-navy-500">Assign task to {agentName}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-navy-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <input
          type="text"
          placeholder="Task title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
          autoFocus
          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
        />

        <textarea
          placeholder="Additional context or instructions..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 resize-none"
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
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-navy-500 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || loading || triggering}
            className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading || triggering ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {triggering ? "Triggering..." : "Assign & Run"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Agent Working Animation ----------
function WorkingAnimation() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5 items-end h-4">
        {[0, 150, 300, 450].map((delay, i) => (
          <div
            key={i}
            className="w-1 bg-teal-500 rounded-full"
            style={{
              animation: `equalizer 0.8s ease-in-out ${delay}ms infinite alternate`,
              height: "40%",
            }}
          />
        ))}
      </div>
      <span className="text-[10px] font-bold text-teal-600 uppercase tracking-wider animate-pulse">Working</span>
      <style jsx>{`
        @keyframes equalizer {
          0% { height: 20%; }
          100% { height: 100%; }
        }
      `}</style>
    </div>
  );
}

// ---------- Idle Breathing Animation ----------
function IdleBreathing() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2 h-2 rounded-full bg-slate-300 animate-pulse" style={{ animationDuration: "3s" }} />
      <span className="text-[10px] text-slate-400">Idle</span>
    </div>
  );
}

// ---------- Recent Activity Sparkline ----------
function ActivitySparkline({ activities }: { activities: Activity[] }) {
  const now = Date.now();
  const hours = 24;
  const buckets = new Array(hours).fill(0);

  activities.forEach((a) => {
    const hoursAgo = (now - new Date(a.created_at).getTime()) / 3600000;
    if (hoursAgo < hours) {
      buckets[Math.floor(hoursAgo)] += 1;
    }
  });

  const max = Math.max(1, ...buckets);

  return (
    <div className="flex items-end gap-px h-3" title="Activity last 24h (newest → oldest)">
      {buckets.map((count, i) => (
        <div
          key={i}
          className={cn(
            "w-[3px] rounded-t-sm transition-all",
            count > 0 ? "bg-teal-400" : "bg-slate-200"
          )}
          style={{ height: `${Math.max(15, (count / max) * 100)}%` }}
        />
      ))}
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
  const [triggeringAgent, setTriggeringAgent] = useState<string | null>(null);

  const isLoading = activitiesLoading && tasksLoading;

  const toggleAgent = useCallback((agentId: string) => {
    setExpandedAgent((prev) => (prev === agentId ? null : agentId));
  }, []);

  const triggerAgent = useCallback(
    async (agentId: string, agentName: string, taskId: string, taskTitle: string, taskDescription: string | null) => {
      setTriggeringAgent(agentId);
      try {
        const res = await fetch("/api/trigger-agent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${INGEST_KEY}`,
          },
          body: JSON.stringify({
            agent_id: agentId,
            task_title: taskTitle,
            task_description: taskDescription || undefined,
            task_id: taskId,
          }),
        });
        const data = await res.json();
        if (data.ok && !data.queued) {
          toast.success(`${agentName} is working on it!`);
        } else if (data.ok && data.queued) {
          toast.success(`Task queued for ${agentName} — will pick it up shortly`);
        } else {
          toast.error(`Couldn't trigger ${agentName}: ${data.error}`);
        }
      } catch {
        toast.error(`Failed to reach ${agentName}`);
      } finally {
        setTriggeringAgent(null);
      }
    },
    []
  );

  const handleTaskStatusChange = useCallback(
    async (taskId: string, newStatus: string, agentId?: string, agentName?: string, taskTitle?: string, taskDescription?: string | null) => {
      await updateTask(taskId, {
        status: newStatus,
        ...(newStatus === "done" ? { completed_at: new Date().toISOString() } : {}),
      });
      refetchTasks();

      // If starting a task, trigger the agent
      if (newStatus === "in_progress" && agentId && taskTitle) {
        await triggerAgent(agentId, agentName || agentId, taskId, taskTitle, taskDescription || null);
      }
    },
    [updateTask, refetchTasks, triggerAgent]
  );

  // Pending clarifications
  const pendingClarifications = useMemo(() => {
    const map = new Map<string, Activity>();
    activities
      .filter((a) => a.activity_type === "clarification" && a.status !== "actioned")
      .forEach((a) => {
        const taskId = (a.metadata as Record<string, string>)?.task_id;
        if (taskId) map.set(taskId, a);
      });
    return map;
  }, [activities]);

  // Clarifications per agent
  const agentClarifications = useMemo(() => {
    const map = new Map<string, Activity[]>();
    pendingClarifications.forEach((clar) => {
      const list = map.get(clar.agent_id) || [];
      list.push(clar);
      map.set(clar.agent_id, list);
    });
    return map;
  }, [pendingClarifications]);

  const { agentCards, totalWeek, totalOutputs } = useMemo(() => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600000);

    const cards = agentRoster.map((agent) => {
      const agentActivities = activities.filter((a) => a.agent_id === agent.agentId && a.activity_type !== "clarification" && a.activity_type !== "trigger");
      const weekActivities = agentActivities.filter((a) => new Date(a.created_at) >= weekAgo);
      const lastActivityTime = agentActivities[0]?.created_at;

      const agentTasks = tasks.filter((t) => t.assigned_agent === agent.agentId);
      const currentTask = agentTasks.find((t) => t.status === "in_progress");
      const queuedTasks = agentTasks.filter((t) => t.status === "todo");
      const reviewTasks = agentTasks.filter((t) => t.status === "review");
      const doneTasks = agentTasks.filter((t) => t.status === "done");

      const timing = getTimingStatus(lastActivityTime);
      const isWorking = !!currentTask || timing.pulse;
      const clarifications = agentClarifications.get(agent.agentId) || [];

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
        clarifications,
      };
    });

    return {
      agentCards: cards,
      totalWeek: cards.reduce((sum, a) => sum + a.tasksThisWeek, 0),
      totalOutputs: activities.filter((a) => a.activity_type !== "clarification" && a.activity_type !== "trigger").length,
    };
  }, [activities, tasks, agentClarifications]);

  const totalClarifications = pendingClarifications.size;
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
        <div className="flex items-center gap-3">
          {totalClarifications > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
              <Bell className="w-4 h-4 text-amber-600 animate-bounce" />
              <span className="text-sm font-medium text-amber-800">
                {totalClarifications} clarification{totalClarifications > 1 ? "s" : ""} needed
              </span>
            </div>
          )}
          <Link
            href="/tasks"
            className="flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700 transition-colors"
          >
            <ListTodo className="w-4 h-4" />
            Manage Tasks
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
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
          const isBeingTriggered = triggeringAgent === agent.agentId;
          const hasClarifications = agent.clarifications.length > 0;

          return (
            <div
              key={agent.agentId}
              className={cn(
                "bg-white rounded-xl border overflow-hidden transition-all",
                agent.isWorking || isBeingTriggered ? "border-teal-300 shadow-md" : hasClarifications ? "border-amber-300 shadow-md" : "border-border",
                isExpanded ? "shadow-xl ring-1 ring-teal-200" : "hover:shadow-lg"
              )}
            >
              {/* Working progress bar animation */}
              {(agent.isWorking || isBeingTriggered) && (
                <div className="h-1 bg-gradient-to-r from-teal-400 via-teal-500 to-teal-400 animate-shimmer bg-[length:200%_100%]" />
              )}

              {/* Clarification banner */}
              {hasClarifications && (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
                  <MessageCircleQuestion className="w-4 h-4 text-amber-600 animate-bounce" />
                  <span className="text-xs font-medium text-amber-800">
                    Asking for clarification on a task
                  </span>
                  <Link
                    href="/tasks"
                    className="ml-auto text-[10px] font-bold text-amber-700 bg-amber-200 px-2 py-0.5 rounded-full hover:bg-amber-300 transition-colors"
                  >
                    Respond
                  </Link>
                </div>
              )}

              {/* Clickable Agent Header */}
              <button
                onClick={() => toggleAgent(agent.agentId)}
                className="w-full text-left p-4 pb-3 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center text-lg transition-all relative",
                      agent.isWorking || isBeingTriggered ? "bg-teal-50 scale-110" : "bg-slate-50"
                    )}>
                      <span className={cn(agent.isWorking && "animate-bounce")} style={{ animationDuration: "2s" }}>
                        {agent.emoji}
                      </span>
                      {/* Activity ring animation */}
                      {(agent.isWorking || isBeingTriggered) && (
                        <div className="absolute inset-0 rounded-xl border-2 border-teal-400 animate-ping opacity-30" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-navy-500">{agent.name}</h3>
                      <p className="text-[11px] text-muted-foreground">{agent.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {agent.isWorking || isBeingTriggered ? (
                      <WorkingAnimation />
                    ) : agent.timing.label === "Never run" ? (
                      <IdleBreathing />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="relative">
                          <div className={cn("w-2.5 h-2.5 rounded-full transition-colors", agent.timing.dotColor)} />
                          {agent.timing.pulse && (
                            <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping opacity-75" />
                          )}
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {agent.timing.label}
                        </span>
                      </div>
                    )}
                    <ChevronDown className={cn(
                      "w-4 h-4 text-muted-foreground transition-transform duration-200",
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
                  <div className="ml-auto flex items-center gap-2">
                    <ActivitySparkline activities={agent.allOutputs} />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {agent.model}
                    </span>
                  </div>
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
                      Assign & Run
                    </button>
                    {agent.queuedTasks.length > 0 && !agent.currentTask && (
                      <button
                        onClick={() => {
                          const task = agent.queuedTasks[0];
                          handleTaskStatusChange(task.id, "in_progress", agent.agentId, agent.name, task.title, task.description);
                        }}
                        disabled={isBeingTriggered}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {isBeingTriggered ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
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

                  {/* Clarification requests */}
                  {agent.clarifications.length > 0 && (
                    <div className="px-4 py-3 border-b border-border/30 bg-amber-50/50">
                      <div className="flex items-center gap-1.5 mb-2">
                        <MessageCircleQuestion className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Needs Your Input</span>
                      </div>
                      {agent.clarifications.map((clar) => (
                        <div key={clar.id} className="bg-white rounded-lg border border-amber-200 p-2.5 mb-1.5">
                          <p className="text-xs font-medium text-amber-900">{clar.title}</p>
                          {clar.full_content && (
                            <p className="text-[11px] text-amber-800 mt-1 bg-amber-50 rounded px-2 py-1.5">
                              {clar.full_content}
                            </p>
                          )}
                          <Link
                            href="/tasks"
                            className="inline-block mt-1.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded hover:bg-amber-200 transition-colors"
                          >
                            Go to task &rarr;
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}

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
                              onClick={() => handleTaskStatusChange(task.id, "in_progress", agent.agentId, agent.name, task.title, task.description)}
                              disabled={!!agent.currentTask || isBeingTriggered}
                              className="w-5 h-5 rounded border border-slate-300 flex items-center justify-center hover:bg-blue-50 hover:border-blue-300 transition-colors flex-shrink-0 disabled:opacity-30"
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
                                <ViewOutputButton
                                  content={output.full_content}
                                  title={output.title}
                                  summary={output.summary}
                                  badge={output.activity_type.replace(/_/g, " ")}
                                  className="mt-1.5 text-[10px]"
                                />
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
              {activities
                .filter((a) => a.activity_type !== "clarification" && a.activity_type !== "trigger")
                .slice(0, 15)
                .map((activity, i) => {
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
                          <ViewOutputButton
                            content={activity.full_content}
                            title={activity.title}
                            summary={activity.summary}
                            badge={activity.activity_type.replace(/_/g, " ")}
                            emoji={agent?.emoji || "🤖"}
                            subtitle={agent?.name || activity.agent_id}
                            className="mt-1"
                          />
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
