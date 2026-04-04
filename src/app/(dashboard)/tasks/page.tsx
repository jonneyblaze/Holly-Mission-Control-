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

  const handleSave = async () => {
    if (!form.title.trim()) return;
    try {
      await update(task.id, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        segment: form.segment || null,
        assigned_agent: form.assigned_agent || null,
        due_date: form.due_date || null,
        updated_at: new Date().toISOString(),
      });

      // If there was a clarification response, append it to description and mark responded
      if (clarification && clarResponse.trim()) {
        const updatedDesc = [
          form.description.trim(),
          `\n---\n**Clarification (${agentLabels[clarification.agent_id] || clarification.agent_id} asked):** ${clarification.full_content || clarification.summary}`,
          `**Response:** ${clarResponse.trim()}`,
        ]
          .filter(Boolean)
          .join("\n");

        await update(task.id, {
          description: updatedDesc,
          updated_at: new Date().toISOString(),
        });

        // Mark clarification as actioned
        await updateActivity(clarification.id, { status: "actioned" });
      }

      toast.success("Task updated");
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
              disabled={loading || !form.title.trim()}
              className="flex-1 bg-teal-500 hover:bg-teal-600 text-white"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Save Changes
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

  const handleAddTask = async () => {
    if (!newTask.title.trim()) return;
    try {
      await insert({
        title: newTask.title.trim(),
        description: newTask.description.trim() || null,
        priority: newTask.priority,
        segment: newTask.segment || null,
        assigned_agent: newTask.assigned_agent || null,
        due_date: newTask.due_date || null,
        status: "todo",
        source: "manual",
      });
      toast.success("Task created");
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
            disabled={inserting || !newTask.title.trim()}
            className="w-full bg-teal-500 hover:bg-teal-600 text-white"
          >
            {inserting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Create Task
          </Button>
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

  // Fetch clarification requests from agent_activity
  const { data: clarifications, refetch: refetchClarifications } =
    useMCTable<ClarificationRequest>("agent_activity", {
      limit: 100,
      realtime: true,
    });

  const { update } = useMCUpdate("tasks");

  const tasks = liveTasks;
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
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

  const totalClarifications = pendingClarifications.size;

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
          {/* Clarification notification badge */}
          {totalClarifications > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl animate-pulse">
              <Bell className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">
                {totalClarifications} agent{totalClarifications > 1 ? "s" : ""}{" "}
                asking for details
              </span>
            </div>
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
                              onClick={() => setEditingTask(task)}
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
