"use client";

import { useState, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Plus,
  GripVertical,
  X,
  Loader2,
  Trash2,
  ArrowRight,
  ArrowLeft,
  MoreVertical,
  ChevronRight,
  Ban,
  Pencil,
  MessageCircleQuestion,
  Bell,
  CheckCircle2,
  Calendar,
  Eye,
  ThumbsUp,
  RotateCcw,
  FileText,
  Copy,
  Check,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMCTable, useMCInsert, useMCUpdate } from "@/lib/hooks/use-mission-control";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: "low" | "medium" | "high" | "urgent";
  segment?: string;
  assigned_agent?: string;
  source: string;
  due_date?: string;
  created_at: string;
}

interface ClarificationRequest {
  id: string;
  agent_id: string;
  activity_type: string;
  title: string;
  summary: string;
  full_content: string | null;
  metadata: { task_id?: string };
  status: string;
  created_at: string;
}

const columns = [
  { id: "todo", label: "To Do", color: "border-t-slate-400" },
  { id: "in_progress", label: "In Progress", color: "border-t-teal-500" },
  { id: "review", label: "Review", color: "border-t-copper-500" },
  { id: "done", label: "Done", color: "border-t-emerald-500" },
];

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-700",
  urgent: "bg-red-100 text-red-700",
};

const segmentColors: Record<string, string> = {
  bodylytics: "bg-teal-100 text-teal-700",
  duracell: "bg-navy-100 text-navy-700",
  djing: "bg-purple-100 text-purple-700",
  driving: "bg-copper-100 text-copper-700",
  general: "bg-slate-100 text-slate-600",
};

const columnOrder = ["todo", "in_progress", "review", "done"];

const agentEmojis: Record<string, string> = {
  holly: "📋",
  "bl-marketing": "📈",
  "bl-social": "📱",
  "bl-community": "🤝",
  "bl-content": "✍️",
  "bl-support": "🎧",
  "bl-qa": "🧪",
  infra: "🏗️",
  devops: "⚙️",
  "duracell-prep": "💼",
};

const agentLabels: Record<string, string> = {
  holly: "Holly",
  "bl-marketing": "Marketing",
  "bl-social": "Social",
  "bl-content": "Content",
  "bl-support": "Support",
  "bl-community": "Community",
  "bl-qa": "QA",
  infra: "Infra",
  devops: "DevOps",
  "duracell-prep": "Duracell Prep",
};

// ---------- Expandable clarification text ----------
function ClarificationText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 200;

  return (
    <div className="mb-2">
      <p className={cn("text-xs text-amber-800 whitespace-pre-wrap", !expanded && isLong && "line-clamp-2")}>
        {text}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] font-medium text-amber-600 hover:text-amber-800 mt-0.5"
        >
          {expanded ? "Show less" : "Read full message →"}
        </button>
      )}
    </div>
  );
}

const INGEST_KEY = "9eRse679@ohyEdCz&UAUL@V9V6t*xW@%47r4vQfFeThowllEBsIv";

async function triggerAgentAPI(
  agentId: string,
  taskId: string,
  taskTitle: string,
  taskDescription?: string
) {
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
  return res.json();
}

// ---------- Edit Task Modal ----------
function EditTaskModal({
  task,
  onClose,
  onSaved,
  clarification,
}: {
  task: Task;
  onClose: () => void;
  onSaved: () => void;
  clarification?: ClarificationRequest | null;
}) {
  const { update, loading } = useMCUpdate("tasks");
  const { update: updateActivity } = useMCUpdate("agent_activity");
  const [form, setForm] = useState({
    title: task.title,
    description: task.description || "",
    priority: task.priority,
    segment: task.segment || "bodylytics",
    assigned_agent: task.assigned_agent || "",
    due_date: task.due_date || "",
  });
  const [clarResponse, setClarResponse] = useState("");

  const [triggering, setTriggering] = useState(false);

  const handleSave = async () => {
    if (!form.title.trim()) return;
    try {
      const agentChanged = form.assigned_agent !== (task.assigned_agent || "");
      const newAgent = form.assigned_agent;
      let finalDescription = form.description.trim() || null;

      // If there was a clarification response, append it to description and mark responded
      if (clarification && clarResponse.trim()) {
        finalDescription = [
          form.description.trim(),
          `\n---\n**Clarification (${agentLabels[clarification.agent_id] || clarification.agent_id} asked):** ${clarification.full_content || clarification.summary}`,
          `**Response:** ${clarResponse.trim()}`,
        ]
          .filter(Boolean)
          .join("\n");

        // Mark clarification as actioned
        await updateActivity(clarification.id, { status: "actioned" });
      }

      // If assigning to a new agent, set status to in_progress
      const statusUpdate =
        newAgent && (agentChanged || task.status === "todo")
          ? { status: "in_progress" }
          : {};

      await update(task.id, {
        title: form.title.trim(),
        description: finalDescription,
        priority: form.priority,
        segment: form.segment || null,
        assigned_agent: newAgent || null,
        due_date: form.due_date || null,
        ...statusUpdate,
        updated_at: new Date().toISOString(),
      });

      // Trigger agent if: new agent assigned, or clarification answered (re-trigger same agent)
      const shouldTrigger =
        (newAgent && agentChanged) ||
        (newAgent && clarification && clarResponse.trim());

      if (shouldTrigger) {
        setTriggering(true);
        try {
          const data = await triggerAgentAPI(
            newAgent,
            task.id,
            form.title.trim(),
            (finalDescription || undefined) as string | undefined
          );
          const label = agentLabels[newAgent] || newAgent;
          if (data.ok) {
            toast.success(`${label} is now working on it!`);
          } else {
            toast.warning(`Task saved but couldn't trigger ${label}`);
          }
        } catch {
          toast.warning("Task saved but couldn't reach agent");
        } finally {
          setTriggering(false);
        }
      } else {
        toast.success("Task updated");
      }

      onSaved();
      onClose();
    } catch {
      toast.error("Failed to update task");
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-montserrat font-bold text-navy-500">
            Edit Task
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Clarification banner */}
        {clarification && clarification.status !== "actioned" && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
            <div className="flex items-start gap-2">
              <MessageCircleQuestion className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-bold text-amber-800 mb-1">
                  {agentLabels[clarification.agent_id] || clarification.agent_id} is asking for clarification:
                </p>
                <p className="text-sm text-amber-900 bg-amber-100/60 rounded-lg px-3 py-2">
                  {clarification.full_content || clarification.summary || clarification.title}
                </p>
                <div className="mt-2">
                  <label className="block text-xs font-medium text-amber-700 mb-1">
                    Your response:
                  </label>
                  <textarea
                    value={clarResponse}
                    onChange={(e) => setClarResponse(e.target.value)}
                    placeholder="Add context or answer the question..."
                    rows={2}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 resize-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Title
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              autoFocus
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description / Context
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Add more details, requirements, links..."
              rows={4}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Priority
              </label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as "low" | "medium" | "high" | "urgent" })}
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Segment
              </label>
              <select
                value={form.segment}
                onChange={(e) => setForm({ ...form, segment: e.target.value })}
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              >
                <option value="bodylytics">BodyLytics</option>
                <option value="duracell">Duracell</option>
                <option value="djing">DJing</option>
                <option value="driving">Driving</option>
                <option value="general">General</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Assign to Agent
              </label>
              <select
                value={form.assigned_agent}
                onChange={(e) =>
                  setForm({ ...form, assigned_agent: e.target.value })
                }
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              >
                <option value="">Manual (no agent)</option>
                {Object.entries(agentLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading || triggering || !form.title.trim()}
              className="flex-1 bg-teal-500 hover:bg-teal-600 text-white"
            >
              {loading || triggering ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              {triggering ? "Triggering agent..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Add Task Modal ----------
function AddTaskModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { insert, loading: inserting } = useMCInsert("tasks");
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "medium",
    segment: "bodylytics",
    assigned_agent: "",
    due_date: "",
  });

  const [triggering, setTriggering] = useState(false);

  const handleAddTask = async () => {
    if (!newTask.title.trim()) return;
    try {
      const hasAgent = !!newTask.assigned_agent;
      const result = await insert({
        title: newTask.title.trim(),
        description: newTask.description.trim() || null,
        priority: newTask.priority,
        segment: newTask.segment || null,
        assigned_agent: newTask.assigned_agent || null,
        due_date: newTask.due_date || null,
        status: hasAgent ? "in_progress" : "todo",
        source: "manual",
      });

      // If agent assigned, trigger it immediately with the task ID
      if (hasAgent && result?.id) {
        setTriggering(true);
        try {
          const data = await triggerAgentAPI(
            newTask.assigned_agent,
            result.id,
            newTask.title.trim(),
            newTask.description.trim() || undefined
          );
          const label = agentLabels[newTask.assigned_agent] || newTask.assigned_agent;
          if (data.ok) {
            toast.success(`${label} is now working on it!`);
          } else {
            toast.warning(`Task created but couldn't trigger ${label}: ${data.error}`);
          }
        } catch {
          toast.warning("Task created but couldn't reach agent");
        } finally {
          setTriggering(false);
        }
      } else {
        toast.success("Task created");
      }

      onCreated();
      onClose();
    } catch {
      toast.error("Failed to create task");
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-montserrat font-bold text-navy-500">
            New Task
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Title
            </label>
            <input
              type="text"
              value={newTask.title}
              onChange={(e) =>
                setNewTask({ ...newTask, title: e.target.value })
              }
              onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
              placeholder="What needs to be done?"
              autoFocus
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea
              value={newTask.description}
              onChange={(e) =>
                setNewTask({ ...newTask, description: e.target.value })
              }
              placeholder="Requirements, context, links..."
              rows={3}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Priority
              </label>
              <select
                value={newTask.priority}
                onChange={(e) =>
                  setNewTask({ ...newTask, priority: e.target.value })
                }
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Segment
              </label>
              <select
                value={newTask.segment}
                onChange={(e) =>
                  setNewTask({ ...newTask, segment: e.target.value })
                }
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              >
                <option value="bodylytics">BodyLytics</option>
                <option value="duracell">Duracell</option>
                <option value="djing">DJing</option>
                <option value="driving">Driving</option>
                <option value="general">General</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Assign to Agent
              </label>
              <select
                value={newTask.assigned_agent}
                onChange={(e) =>
                  setNewTask({ ...newTask, assigned_agent: e.target.value })
                }
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              >
                <option value="">Manual (no agent)</option>
                {Object.entries(agentLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={newTask.due_date}
                onChange={(e) =>
                  setNewTask({ ...newTask, due_date: e.target.value })
                }
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              />
            </div>
          </div>
          <Button
            onClick={handleAddTask}
            disabled={inserting || triggering || !newTask.title.trim()}
            className="w-full bg-teal-500 hover:bg-teal-600 text-white"
          >
            {inserting || triggering ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            {triggering
              ? "Triggering agent..."
              : newTask.assigned_agent
              ? "Create & Assign to Agent"
              : "Create Task"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Clarification Card (inline respond) ----------
function ClarificationCard({
  clarification,
  matchingTask,
  onResponded,
  onOpenTask,
}: {
  clarification: ClarificationRequest;
  matchingTask: Task | null;
  onResponded: () => void;
  onOpenTask: (task: Task) => void;
}) {
  const [response, setResponse] = useState("");
  const [sending, setSending] = useState(false);
  const { update: updateActivity } = useMCUpdate("agent_activity");
  const { update: updateTask } = useMCUpdate("tasks");
  const { insert: insertTask } = useMCInsert("tasks");

  const agentName = agentLabels[clarification.agent_id] || clarification.agent_id;

  const handleRespond = async () => {
    if (!response.trim()) return;
    setSending(true);
    try {
      // Mark clarification as actioned
      await updateActivity(clarification.id, { status: "actioned" });

      if (matchingTask) {
        // Has a linked task — append Q&A to description and re-trigger
        const updatedDesc = [
          matchingTask.description || "",
          `\n---\n**${agentName} asked:** ${clarification.full_content || clarification.summary || clarification.title}`,
          `**Response:** ${response.trim()}`,
        ].filter(Boolean).join("\n");

        await updateTask(matchingTask.id, {
          description: updatedDesc,
          status: "in_progress",
        });

        try {
          await triggerAgentAPI(
            clarification.agent_id,
            matchingTask.id,
            matchingTask.title,
            updatedDesc
          );
          toast.success(`Response sent — ${agentName} is continuing work`);
        } catch {
          toast.warning("Response saved but couldn't re-trigger agent");
        }
      } else {
        // No linked task — create one from the clarification context + response, then trigger
        const taskTitle = clarification.title || `Task for ${agentName}`;
        const taskDesc = [
          `**Original task context:** ${clarification.summary || clarification.title}`,
          `\n---\n**${agentName} asked:** ${clarification.full_content || clarification.summary || clarification.title}`,
          `**Response:** ${response.trim()}`,
        ].join("\n");

        try {
          const newTask = await insertTask({
            title: taskTitle,
            description: taskDesc,
            status: "in_progress",
            priority: "medium",
            assigned_agent: clarification.agent_id,
            source: "clarification",
          });

          if (newTask?.id) {
            await triggerAgentAPI(
              clarification.agent_id,
              newTask.id,
              taskTitle,
              taskDesc
            );
            toast.success(`Task created & ${agentName} is working on it`);
          } else {
            toast.success("Response recorded");
          }
        } catch {
          toast.warning("Clarification answered but couldn't create task");
        }
      }

      onResponded();
    } catch (err) {
      console.error("Clarification respond error:", err);
      toast.error("Failed to send response");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white border border-amber-200 rounded-lg p-3">
      <div className="flex items-start gap-2.5">
        <span className="text-base mt-0.5">
          {agentEmojis[clarification.agent_id] || "🤖"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-bold text-amber-900">{agentName}</span>
            <span className="text-[10px] text-amber-500">
              {formatDistanceToNow(new Date(clarification.created_at), { addSuffix: true })}
            </span>
            {matchingTask ? (
              <button
                onClick={() => onOpenTask(matchingTask)}
                className="text-[10px] text-teal-600 hover:text-teal-700 font-medium underline"
              >
                Task: {matchingTask.title}
              </button>
            ) : (
              <span className="text-[10px] text-amber-400 italic">no linked task</span>
            )}
          </div>
          <ClarificationText text={clarification.full_content || clarification.summary || clarification.title} />
          <div className="flex gap-1.5">
            <input
              type="text"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRespond()}
              placeholder="Type your response..."
              className="flex-1 h-8 px-2.5 bg-slate-50 border border-amber-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-amber-400/30"
            />
            <Button
              onClick={handleRespond}
              disabled={sending || !response.trim()}
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white h-8 px-3 text-xs"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Simple Markdown Renderer ----------
function renderMarkdown(md: string): string {
  return md
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto text-sm my-3 font-mono"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-navy-500 mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-navy-500 mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-navy-500 mt-5 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-800">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc text-slate-600 text-sm">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-slate-600 text-sm">$1</li>')
    .replace(/^---$/gm, '<hr class="border-slate-200 my-3" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-teal-600 underline hover:text-teal-700">$1</a>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-teal-300 pl-4 py-1 my-2 text-slate-600 italic text-sm">$1</blockquote>')
    .replace(/^(?!<[a-z])((?!<[a-z]).+)$/gm, (match) => {
      if (!match.trim()) return "";
      return `<p class="text-sm text-slate-600 leading-relaxed my-1">${match}</p>`;
    });
}

// ---------- Review Modal ----------
function ReviewModal({
  task,
  agentOutput,
  onClose,
  onApprove,
  onReject,
  onEdit,
}: {
  task: Task;
  agentOutput: ClarificationRequest[];
  onClose: () => void;
  onApprove: (approveNote?: string) => void;
  onReject: (rejectNote: string) => void;
  onEdit: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const agentName = agentLabels[task.assigned_agent || ""] || task.assigned_agent || "Agent";
  const agentEmoji = agentEmojis[task.assigned_agent || ""] || "🤖";

  // Get the completion output (most recent task_complete for this task)
  const completion = agentOutput.find(
    (a) =>
      a.metadata?.task_id === task.id &&
      (a.activity_type === "task_complete" || a.activity_type === "report" || a.activity_type === "content")
  );

  // All activity for this task
  const taskActivity = agentOutput.filter(
    (a) => a.metadata?.task_id === task.id && a.activity_type !== "trigger"
  );

  const content = completion?.full_content || completion?.summary || null;

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (content) {
      const blob = new Blob([content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${task.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-2xl mt-0.5">{agentEmoji}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-copper-100 text-copper-700 text-[10px]">Review</Badge>
                <span className="text-xs text-muted-foreground">
                  {agentName} · {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                </span>
              </div>
              <h2 className="text-lg font-montserrat font-bold text-navy-500 pr-8">
                {task.title}
              </h2>
              {task.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {task.description.split("\n---")[0]}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {content && (
              <>
                <button
                  onClick={handleCopy}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                  title="Copy output"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                </button>
                <button
                  onClick={handleDownload}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                  title="Download"
                >
                  <Download className="w-4 h-4 text-muted-foreground" />
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition-colors ml-1">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {completion ? (
            <div className="p-5">
              {/* Summary */}
              {completion.summary && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-slate-700">
                    <strong>Summary:</strong> {completion.summary}
                  </p>
                </div>
              )}

              {/* Full content */}
              {content && (
                <div
                  className="max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                />
              )}
            </div>
          ) : taskActivity.length > 0 ? (
            /* No completion but has other activity */
            <div className="p-5 space-y-3">
              <p className="text-sm text-slate-500 italic mb-3">
                No completion report found. Showing all activity for this task:
              </p>
              {taskActivity.map((a) => (
                <div key={a.id} className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="text-[10px] bg-slate-100 text-slate-600">{a.activity_type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-navy-500">{a.title}</p>
                  {a.summary && <p className="text-xs text-slate-500 mt-1">{a.summary}</p>}
                  {a.full_content && (
                    <div
                      className="mt-2 text-xs text-slate-600 max-h-40 overflow-y-auto"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(a.full_content) }}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* No output at all */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="w-12 h-12 text-slate-200 mb-3" />
              <p className="text-sm font-medium text-slate-500">No agent output found</p>
              <p className="text-xs text-muted-foreground mt-1">
                The agent may still be working, or the output wasn&apos;t linked to this task.
              </p>
              <button
                onClick={onEdit}
                className="mt-4 text-xs text-teal-600 hover:text-teal-700 font-medium underline"
              >
                Edit task details
              </button>
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-3 p-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-white rounded-lg border border-slate-200 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit Task
          </button>

          <div className="flex-1" />

          {showRejectInput ? (
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <input
                type="text"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setRejecting(true);
                    onReject(rejectNote);
                  }
                  if (e.key === "Escape") setShowRejectInput(false);
                }}
                placeholder="What needs fixing? (required for agent learning)"
                autoFocus
                className="flex-1 h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-red-400/30"
              />
              <Button
                onClick={() => {
                  setRejecting(true);
                  onReject(rejectNote);
                }}
                disabled={rejecting}
                size="sm"
                className="bg-red-500 hover:bg-red-600 text-white h-9"
              >
                {rejecting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Send Back"}
              </Button>
              <button
                onClick={() => setShowRejectInput(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <Button
                onClick={() => setShowRejectInput(true)}
                variant="outline"
                size="sm"
                className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Send Back
              </Button>
              <Button
                onClick={() => {
                  setApproving(true);
                  onApprove();
                }}
                disabled={approving}
                size="sm"
                className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                {approving ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                Approve ✓
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Main Page ----------
export default function TasksPage() {
  const {
    data: liveTasks,
    loading,
    refetch,
  } = useMCTable<Task>("tasks", {
    limit: 200,
    realtime: true,
  });

  // Fetch ALL agent_activity (clarifications + completions for review)
  const { data: allActivity, refetch: refetchActivity } =
    useMCTable<ClarificationRequest>("agent_activity", {
      limit: 300,
      realtime: true,
    });

  // Alias for clarity
  const clarifications = allActivity;
  const refetchClarifications = refetchActivity;

  const { update } = useMCUpdate("tasks");

  const tasks = liveTasks;
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [reviewingTask, setReviewingTask] = useState<Task | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Build a map of pending clarifications per task_id
  const pendingClarifications = useMemo(() => {
    const map = new Map<string, ClarificationRequest>();
    clarifications
      .filter(
        (c) =>
          c.activity_type === "clarification" &&
          c.metadata?.task_id &&
          c.status !== "actioned"
      )
      .forEach((c) => {
        map.set(c.metadata.task_id!, c);
      });
    return map;
  }, [clarifications]);

  // Clarifications that have no matching task (orphaned) or ALL clarifications for direct access
  const allPendingClarifications = useMemo(() => {
    return clarifications.filter(
      (c) =>
        c.activity_type === "clarification" &&
        c.status !== "actioned"
    );
  }, [clarifications]);

  const totalClarifications = allPendingClarifications.length;

  const handleDrop = useCallback(
    async (columnId: string) => {
      if (!draggedTask) return;
      try {
        await update(draggedTask, {
          status: columnId,
          ...(columnId === "done"
            ? { completed_at: new Date().toISOString() }
            : { completed_at: null }),
        });
        toast.success("Task moved");
        refetch();
      } catch {
        toast.error("Failed to move task");
      }
      setDraggedTask(null);
    },
    [draggedTask, update, refetch]
  );

  const moveTask = useCallback(
    async (taskId: string, newStatus: string) => {
      try {
        await update(taskId, {
          status: newStatus,
          ...(newStatus === "done"
            ? { completed_at: new Date().toISOString() }
            : { completed_at: null }),
        });
        toast.success(
          `Task moved to ${columns.find((c) => c.id === newStatus)?.label}`
        );
        refetch();
      } catch {
        toast.error("Failed to move task");
      }
      setOpenMenu(null);
    },
    [update, refetch]
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      try {
        const supabase = createClient();
        const { error } = await supabase
          .from("tasks")
          .delete()
          .eq("id", taskId);
        if (error) throw error;
        toast.success("Task deleted");
        refetch();
      } catch {
        toast.error("Failed to delete task");
      }
      setConfirmDelete(null);
      setOpenMenu(null);
    },
    [refetch]
  );

  const handleBackdropClick = () => {
    setOpenMenu(null);
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-6">
      {/* Click-away backdrop for menus */}
      {(openMenu || confirmDelete) && (
        <div className="fixed inset-0 z-30" onClick={handleBackdropClick} />
      )}

      {/* Edit Modal */}
      {editingTask && (
        <EditTaskModal
          task={editingTask}
          clarification={pendingClarifications.get(editingTask.id)}
          onClose={() => setEditingTask(null)}
          onSaved={() => {
            refetch();
            refetchClarifications();
          }}
        />
      )}

      {/* Review Modal */}
      {reviewingTask && (
        <ReviewModal
          task={reviewingTask}
          agentOutput={allActivity}
          onClose={() => setReviewingTask(null)}
          onApprove={async (approveNote?: string) => {
            // 1. Mark task as done
            await update(reviewingTask.id, {
              status: "done",
              completed_at: new Date().toISOString(),
            });

            // 2. Find agent's output summary for feedback context
            const completion = allActivity.find(
              (a) => a.metadata?.task_id === reviewingTask.id &&
                (a.activity_type === "task_complete" || a.activity_type === "report" || a.activity_type === "content")
            );

            // 3. Save positive feedback for agent learning
            if (reviewingTask.assigned_agent) {
              try {
                await fetch("/api/agent-feedback", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    task_id: reviewingTask.id,
                    agent_id: reviewingTask.assigned_agent,
                    action: "approved",
                    feedback_note: approveNote || null,
                    task_title: reviewingTask.title,
                    task_summary: completion?.summary || null,
                  }),
                });
              } catch (err) {
                console.warn("Could not save feedback:", err);
              }
            }

            toast.success("Task approved — feedback saved for agent learning!");
            setReviewingTask(null);
            refetch();
          }}
          onReject={async (rejectNote: string) => {
            // 1. Find agent's output summary for feedback context
            const completion = allActivity.find(
              (a) => a.metadata?.task_id === reviewingTask.id &&
                (a.activity_type === "task_complete" || a.activity_type === "report" || a.activity_type === "content")
            );

            // 2. Count previous rejections for this task to track attempt number
            const prevRejections = allActivity.filter(
              (a) => a.metadata?.task_id === reviewingTask.id && a.activity_type === "trigger"
            ).length;

            // 3. Save rejection feedback for agent learning
            if (reviewingTask.assigned_agent) {
              try {
                await fetch("/api/agent-feedback", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    task_id: reviewingTask.id,
                    agent_id: reviewingTask.assigned_agent,
                    action: "rejected",
                    feedback_note: rejectNote.trim() || "No specific feedback provided",
                    task_title: reviewingTask.title,
                    task_summary: completion?.summary || null,
                    attempt_number: prevRejections + 1,
                  }),
                });
              } catch (err) {
                console.warn("Could not save feedback:", err);
              }
            }

            // 4. Append rejection feedback to task description so agent sees it
            const feedbackBlock = rejectNote.trim()
              ? `\n\n---\n**⚠️ REJECTED — Human Feedback (attempt ${prevRejections + 1}):** ${rejectNote.trim()}\nPlease address this feedback and resubmit.`
              : `\n\n---\n**⚠️ REJECTED (attempt ${prevRejections + 1}):** Work was not satisfactory. Please improve and resubmit.`;

            const updatedDescription = (reviewingTask.description || "") + feedbackBlock;

            await update(reviewingTask.id, {
              status: "in_progress",
              description: updatedDescription,
            });

            // 5. Re-trigger agent with updated description (now includes feedback)
            if (reviewingTask.assigned_agent) {
              try {
                await triggerAgentAPI(
                  reviewingTask.assigned_agent,
                  reviewingTask.id,
                  reviewingTask.title,
                  updatedDescription
                );
                toast.success("Sent back with feedback — agent is reworking it");
              } catch {
                toast.warning("Sent back but couldn't re-trigger agent");
              }
            } else {
              toast.success("Task sent back to In Progress");
            }
            setReviewingTask(null);
            refetch();
          }}
          onEdit={() => {
            const task = reviewingTask;
            setReviewingTask(null);
            setEditingTask(task);
          }}
        />
      )}

      {/* Add Modal */}
      {showAddModal && (
        <AddTaskModal
          onClose={() => setShowAddModal(false)}
          onCreated={refetch}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">
            Tasks
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tasks.filter((t) => t.status !== "done").length} open &middot;{" "}
            {tasks.filter((t) => t.status === "done").length} completed
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Clarification count badge */}
          {totalClarifications > 0 && (
            <Badge className="bg-amber-100 text-amber-800 border border-amber-300 animate-pulse gap-1.5 px-3 py-1.5">
              <Bell className="w-3.5 h-3.5" />
              {totalClarifications} awaiting response
            </Badge>
          )}
          <Button
            onClick={() => setShowAddModal(true)}
            className="bg-teal-500 hover:bg-teal-600 text-white gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Task
          </Button>
        </div>
      </div>

      {/* Clarification Strip — compact, collapsible */}
      {allPendingClarifications.length > 0 && (
        <details
          id="clarification-panel"
          open
          className="bg-amber-50/80 border border-amber-200 rounded-xl overflow-hidden"
        >
          <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none hover:bg-amber-100/60 transition-colors">
            <MessageCircleQuestion className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-amber-800 flex-1">
              {totalClarifications} Agent{totalClarifications > 1 ? "s" : ""} Asking for Details
            </span>
            <ChevronRight className="w-4 h-4 text-amber-500 transition-transform [details[open]_&]:rotate-90" />
          </summary>
          <div className="px-3 pb-3 space-y-2 max-h-[350px] overflow-y-auto">
            {allPendingClarifications.map((clar) => {
              const matchingTask = tasks.find((t) => t.id === clar.metadata?.task_id);
              return (
                <ClarificationCard
                  key={clar.id}
                  clarification={clar}
                  matchingTask={matchingTask || null}
                  onResponded={() => {
                    refetch();
                    refetchClarifications();
                  }}
                  onOpenTask={(task) => setEditingTask(task)}
                />
              );
            })}
          </div>
        </details>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-h-[600px]">
          {columns.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.id);
            const colIndex = columnOrder.indexOf(col.id);

            return (
              <div
                key={col.id}
                className={cn(
                  "bg-muted/50 rounded-xl p-3 border-t-4",
                  col.color
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add("ring-2", "ring-teal-300");
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove("ring-2", "ring-teal-300");
                }}
                onDrop={(e) => {
                  e.currentTarget.classList.remove("ring-2", "ring-teal-300");
                  handleDrop(col.id);
                }}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-sm font-semibold text-navy-500">
                    {col.label}
                  </h3>
                  <span className="text-xs text-muted-foreground bg-white px-2 py-0.5 rounded-full">
                    {colTasks.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {colTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <p className="text-sm text-muted-foreground">No tasks</p>
                      {col.id === "todo" && (
                        <button
                          onClick={() => setShowAddModal(true)}
                          className="mt-2 text-xs text-teal-500 hover:text-teal-600 font-medium"
                        >
                          + Add Task
                        </button>
                      )}
                    </div>
                  ) : (
                    colTasks.map((task) => {
                      const hasClarification = pendingClarifications.has(
                        task.id
                      );
                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={() => setDraggedTask(task.id)}
                          onDragEnd={() => setDraggedTask(null)}
                          className={cn(
                            "bg-white rounded-lg border p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all group relative",
                            draggedTask === task.id && "opacity-50 scale-95",
                            hasClarification
                              ? "border-amber-300 ring-1 ring-amber-200"
                              : "border-border"
                          )}
                        >
                          {/* Clarification indicator */}
                          {hasClarification && (
                            <div
                              className="absolute -top-2 -right-2 z-10 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTask(task);
                              }}
                            >
                              <div className="relative">
                                <div className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center shadow-md">
                                  <MessageCircleQuestion className="w-3.5 h-3.5 text-white" />
                                </div>
                                <div className="absolute inset-0 w-6 h-6 bg-amber-400 rounded-full animate-ping opacity-50" />
                              </div>
                            </div>
                          )}

                          <div className="flex items-start gap-2">
                            <GripVertical className="w-3 h-3 text-muted-foreground mt-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() =>
                                col.id === "review"
                                  ? setReviewingTask(task)
                                  : setEditingTask(task)
                              }
                            >
                              <p className="text-sm font-medium text-navy-500 mb-1.5 pr-6">
                                {task.title}
                              </p>
                              {task.description && (
                                <p className="text-[11px] text-muted-foreground mb-1.5 line-clamp-2">
                                  {task.description}
                                </p>
                              )}
                              <div className="flex flex-wrap gap-1">
                                <Badge
                                  className={cn(
                                    "text-[9px] px-1.5 py-0",
                                    priorityColors[task.priority] ||
                                      "bg-slate-100"
                                  )}
                                >
                                  {task.priority}
                                </Badge>
                                {task.segment && (
                                  <Badge
                                    className={cn(
                                      "text-[9px] px-1.5 py-0",
                                      segmentColors[task.segment] ||
                                        "bg-slate-100"
                                    )}
                                  >
                                    {task.segment}
                                  </Badge>
                                )}
                                {task.assigned_agent && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] px-1.5 py-0"
                                  >
                                    {agentLabels[task.assigned_agent] ||
                                      task.assigned_agent}
                                  </Badge>
                                )}
                                {task.due_date && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] px-1.5 py-0 text-slate-500"
                                  >
                                    <Calendar className="w-2.5 h-2.5 mr-0.5" />
                                    {task.due_date}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-1.5">
                                {formatDistanceToNow(
                                  new Date(task.created_at),
                                  { addSuffix: true }
                                )}
                              </p>
                            </div>

                            {/* Action menu button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenu(
                                  openMenu === task.id ? null : task.id
                                );
                              }}
                              className="absolute top-2.5 right-2.5 p-1 rounded hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            >
                              <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>

                            {/* Action menu dropdown */}
                            {openMenu === task.id && (
                              <div className="absolute top-8 right-2 bg-white rounded-lg shadow-xl border border-border py-1 z-40 min-w-[170px]">
                                {/* Edit */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenu(null);
                                    setEditingTask(task);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 text-navy-500"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-teal-500" />
                                  Edit task
                                </button>

                                <div className="border-t border-border my-1" />

                                {/* Move options */}
                                {colIndex < columnOrder.length - 1 && (
                                  <button
                                    onClick={() =>
                                      moveTask(
                                        task.id,
                                        columnOrder[colIndex + 1]
                                      )
                                    }
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 text-navy-500"
                                  >
                                    <ArrowRight className="w-3.5 h-3.5 text-teal-500" />
                                    Move to {columns[colIndex + 1].label}
                                  </button>
                                )}
                                {colIndex > 0 && (
                                  <button
                                    onClick={() =>
                                      moveTask(
                                        task.id,
                                        columnOrder[colIndex - 1]
                                      )
                                    }
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 text-navy-500"
                                  >
                                    <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                                    Move to {columns[colIndex - 1].label}
                                  </button>
                                )}

                                {/* Jump to specific column */}
                                {columnOrder
                                  .filter(
                                    (c) =>
                                      c !== col.id &&
                                      c !== columnOrder[colIndex + 1] &&
                                      c !== columnOrder[colIndex - 1]
                                  )
                                  .map((targetCol) => (
                                    <button
                                      key={targetCol}
                                      onClick={() =>
                                        moveTask(task.id, targetCol)
                                      }
                                      className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 text-navy-500"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                      Move to{" "}
                                      {
                                        columns.find((c) => c.id === targetCol)
                                          ?.label
                                      }
                                    </button>
                                  ))}

                                <div className="border-t border-border my-1" />

                                {/* Cancel */}
                                {col.id !== "todo" && (
                                  <button
                                    onClick={() => moveTask(task.id, "todo")}
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 flex items-center gap-2 text-amber-700"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                    Cancel &amp; move to To Do
                                  </button>
                                )}

                                {/* Delete */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDelete(task.id);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 flex items-center gap-2 text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete task
                                </button>
                              </div>
                            )}

                            {/* Delete confirmation */}
                            {confirmDelete === task.id && (
                              <div className="absolute top-8 right-2 bg-white rounded-lg shadow-xl border border-red-200 p-3 z-40 min-w-[200px]">
                                <p className="text-xs font-medium text-navy-500 mb-2">
                                  Delete this task?
                                </p>
                                <p className="text-[11px] text-muted-foreground mb-3">
                                  This cannot be undone.
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      setConfirmDelete(null);
                                      setOpenMenu(null);
                                    }}
                                    className="flex-1 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-slate-50 text-navy-500"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => deleteTask(task.id)}
                                    className="flex-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Quick action bar on hover */}
                          <div className="flex gap-1 mt-2 pt-2 border-t border-border/50 opacity-0 group-hover:opacity-100 transition-opacity">
                            {col.id === "review" ? (
                              /* Review column: show Review + Approve actions */
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReviewingTask(task);
                                  }}
                                  className="flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-medium text-copper-600 hover:bg-copper-50 rounded transition-colors"
                                >
                                  <Eye className="w-3 h-3" />
                                  Review
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveTask(task.id, "done");
                                  }}
                                  className="flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                >
                                  <ThumbsUp className="w-3 h-3" />
                                  Approve
                                </button>
                              </>
                            ) : (
                              /* Other columns: standard Edit + Move actions */
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTask(task);
                                  }}
                                  className="flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 rounded transition-colors"
                                >
                                  <Pencil className="w-3 h-3" />
                                  Edit
                                </button>
                                {colIndex < columnOrder.length - 1 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveTask(task.id, columnOrder[colIndex + 1]);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-medium text-teal-600 hover:bg-teal-50 rounded transition-colors"
                                  >
                                    <ArrowRight className="w-3 h-3" />
                                    {columns[colIndex + 1].label}
                                  </button>
                                )}
                                {col.id !== "done" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveTask(task.id, "done");
                                    }}
                                    className="flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                  >
                                    Done
                                  </button>
                                )}
                              </>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete(task.id);
                              }}
                              className="px-2 py-1 text-[10px] font-medium text-red-500 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
