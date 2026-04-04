"use client";

import { useState, useCallback } from "react";
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

export default function TasksPage() {
  const { data: liveTasks, loading, refetch } = useMCTable<Task>("tasks", {
    limit: 200,
    realtime: true,
  });
  const { insert, loading: inserting } = useMCInsert("tasks");
  const { update } = useMCUpdate("tasks");

  const tasks = liveTasks;
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "medium",
    segment: "bodylytics",
    assigned_agent: "",
  });

  const handleDrop = useCallback(
    async (columnId: string) => {
      if (!draggedTask) return;
      try {
        await update(draggedTask, {
          status: columnId,
          ...(columnId === "done" ? { completed_at: new Date().toISOString() } : { completed_at: null }),
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
          ...(newStatus === "done" ? { completed_at: new Date().toISOString() } : { completed_at: null }),
        });
        toast.success(`Task moved to ${columns.find((c) => c.id === newStatus)?.label}`);
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
        const { error } = await supabase.from("tasks").delete().eq("id", taskId);
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

  const handleAddTask = async () => {
    if (!newTask.title.trim()) return;
    try {
      await insert({
        ...newTask,
        status: "todo",
        source: "manual",
      });
      toast.success("Task created");
      setShowAddModal(false);
      setNewTask({ title: "", description: "", priority: "medium", segment: "bodylytics", assigned_agent: "" });
      refetch();
    } catch {
      toast.error("Failed to create task");
    }
  };

  // Close menus when clicking outside
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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tasks.filter((t) => t.status !== "done").length} open &middot;{" "}
            {tasks.filter((t) => t.status === "done").length} completed
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="bg-teal-500 hover:bg-teal-600 text-white gap-2">
          <Plus className="w-4 h-4" />
          Add Task
        </Button>
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
                className={cn("bg-muted/50 rounded-xl p-3 border-t-4", col.color)}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-teal-300"); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove("ring-2", "ring-teal-300"); }}
                onDrop={(e) => { e.currentTarget.classList.remove("ring-2", "ring-teal-300"); handleDrop(col.id); }}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-sm font-semibold text-navy-500">{col.label}</h3>
                  <span className="text-xs text-muted-foreground bg-white px-2 py-0.5 rounded-full">{colTasks.length}</span>
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
                    colTasks.map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => setDraggedTask(task.id)}
                        onDragEnd={() => setDraggedTask(null)}
                        className={cn(
                          "bg-white rounded-lg border border-border p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all group relative",
                          draggedTask === task.id && "opacity-50 scale-95"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-3 h-3 text-muted-foreground mt-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-navy-500 mb-1.5 pr-6">{task.title}</p>
                            {task.description && (
                              <p className="text-[11px] text-muted-foreground mb-1.5 line-clamp-2">{task.description}</p>
                            )}
                            <div className="flex flex-wrap gap-1">
                              <Badge className={cn("text-[9px] px-1.5 py-0", priorityColors[task.priority] || "bg-slate-100")}>{task.priority}</Badge>
                              {task.segment && <Badge className={cn("text-[9px] px-1.5 py-0", segmentColors[task.segment] || "bg-slate-100")}>{task.segment}</Badge>}
                              {task.assigned_agent && <Badge variant="outline" className="text-[9px] px-1.5 py-0">{task.assigned_agent}</Badge>}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1.5">
                              {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                            </p>
                          </div>

                          {/* Action menu button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenu(openMenu === task.id ? null : task.id);
                            }}
                            className="absolute top-2.5 right-2.5 p-1 rounded hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          >
                            <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>

                          {/* Action menu dropdown */}
                          {openMenu === task.id && (
                            <div className="absolute top-8 right-2 bg-white rounded-lg shadow-xl border border-border py-1 z-40 min-w-[160px]">
                              {/* Move options */}
                              {colIndex < columnOrder.length - 1 && (
                                <button
                                  onClick={() => moveTask(task.id, columnOrder[colIndex + 1])}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 text-navy-500"
                                >
                                  <ArrowRight className="w-3.5 h-3.5 text-teal-500" />
                                  Move to {columns[colIndex + 1].label}
                                </button>
                              )}
                              {colIndex > 0 && (
                                <button
                                  onClick={() => moveTask(task.id, columnOrder[colIndex - 1])}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 text-navy-500"
                                >
                                  <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                                  Move to {columns[colIndex - 1].label}
                                </button>
                              )}

                              {/* Jump to specific column */}
                              {columnOrder
                                .filter((c) => c !== col.id && c !== columnOrder[colIndex + 1] && c !== columnOrder[colIndex - 1])
                                .map((targetCol) => (
                                  <button
                                    key={targetCol}
                                    onClick={() => moveTask(task.id, targetCol)}
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 text-navy-500"
                                  >
                                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                    Move to {columns.find((c) => c.id === targetCol)?.label}
                                  </button>
                                ))}

                              <div className="border-t border-border my-1" />

                              {/* Cancel (move back to todo) */}
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
                              <p className="text-xs font-medium text-navy-500 mb-2">Delete this task?</p>
                              <p className="text-[11px] text-muted-foreground mb-3">This cannot be undone.</p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => { setConfirmDelete(null); setOpenMenu(null); }}
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
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-montserrat font-bold text-navy-500">New Task</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                  placeholder="What needs to be done?"
                  autoFocus
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Optional details..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Segment</label>
                  <select
                    value={newTask.segment}
                    onChange={(e) => setNewTask({ ...newTask, segment: e.target.value })}
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Assign to Agent (optional)</label>
                <select
                  value={newTask.assigned_agent}
                  onChange={(e) => setNewTask({ ...newTask, assigned_agent: e.target.value })}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                >
                  <option value="">Manual (no agent)</option>
                  <option value="holly">Holly</option>
                  <option value="bl-marketing">Marketing</option>
                  <option value="bl-social">Social</option>
                  <option value="bl-content">Content</option>
                  <option value="bl-support">Support</option>
                  <option value="bl-community">Community</option>
                  <option value="bl-qa">QA</option>
                  <option value="infra">Infra</option>
                  <option value="devops">DevOps</option>
                  <option value="duracell-prep">Duracell Prep</option>
                </select>
              </div>
              <Button onClick={handleAddTask} disabled={inserting || !newTask.title.trim()} className="w-full bg-teal-500 hover:bg-teal-600 text-white">
                {inserting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Task
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
