"use client";

import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, GripVertical, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMCTable, useMCInsert, useMCUpdate } from "@/lib/hooks/use-mission-control";
import { toast } from "sonner";

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

// Fallback tasks when DB is empty
const fallbackTasks: Task[] = [
  { id: "f1", title: "Write blog post about micro-expressions", status: "todo", priority: "high", segment: "bodylytics", assigned_agent: "bl-marketing", source: "workflow" },
  { id: "f2", title: "Prepare Duracell onboarding talking points", status: "todo", priority: "medium", segment: "duracell", assigned_agent: "duracell-prep", source: "manual" },
  { id: "f3", title: "Fix certificate download bug", status: "in_progress", priority: "urgent", segment: "bodylytics", assigned_agent: "devops", source: "agent" },
  { id: "f4", title: "Create Instagram carousel: deception cues", status: "in_progress", priority: "medium", segment: "bodylytics", assigned_agent: "bl-social", source: "workflow" },
  { id: "f5", title: "Review SEO audit results", status: "review", priority: "medium", segment: "bodylytics", source: "agent" },
  { id: "f6", title: "Weekly infrastructure report", status: "done", priority: "low", segment: "bodylytics", assigned_agent: "infra", source: "workflow" },
];

export default function TasksPage() {
  const { data: liveTasks, loading, refetch } = useMCTable<Task>("tasks", {
    limit: 200,
    realtime: true,
  });
  const { insert, loading: inserting } = useMCInsert("tasks");
  const { update } = useMCUpdate("tasks");

  const tasks = liveTasks.length > 0 ? liveTasks : fallbackTasks;
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
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
      // Only update if we have live tasks (not fallback)
      if (liveTasks.length > 0) {
        try {
          await update(draggedTask, {
            status: columnId,
            ...(columnId === "done" ? { completed_at: new Date().toISOString() } : {}),
          });
          toast.success("Task moved");
          refetch();
        } catch {
          toast.error("Failed to move task");
        }
      }
      setDraggedTask(null);
    },
    [draggedTask, liveTasks.length, update, refetch]
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

  return (
    <div className="space-y-6">
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
            return (
              <div
                key={col.id}
                className={cn("bg-muted/50 rounded-xl p-3 border-t-4", col.color)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(col.id)}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-sm font-semibold text-navy-500">{col.label}</h3>
                  <span className="text-xs text-muted-foreground bg-white px-2 py-0.5 rounded-full">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => setDraggedTask(task.id)}
                      className={cn(
                        "bg-white rounded-lg border border-border p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow",
                        draggedTask === task.id && "opacity-50"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="w-3 h-3 text-muted-foreground mt-1 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-navy-500 mb-1.5">{task.title}</p>
                          <div className="flex flex-wrap gap-1">
                            <Badge className={cn("text-[9px] px-1.5 py-0", priorityColors[task.priority] || "bg-slate-100")}>{task.priority}</Badge>
                            {task.segment && <Badge className={cn("text-[9px] px-1.5 py-0", segmentColors[task.segment] || "bg-slate-100")}>{task.segment}</Badge>}
                            {task.assigned_agent && <Badge variant="outline" className="text-[9px] px-1.5 py-0">{task.assigned_agent}</Badge>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
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
                  placeholder="What needs to be done?"
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
                  <option value="bl-marketing">📈 Marketing</option>
                  <option value="bl-social">📱 Social</option>
                  <option value="bl-content">✍️ Content</option>
                  <option value="bl-support">🎧 Support</option>
                  <option value="bl-community">🤝 Community</option>
                  <option value="bl-qa">🧪 QA</option>
                  <option value="infra">🏗️ Infra</option>
                  <option value="devops">⚙️ DevOps</option>
                  <option value="duracell-prep">💼 Duracell Prep</option>
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
