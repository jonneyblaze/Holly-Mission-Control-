"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

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

const priorityColors = {
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

const initialTasks: Task[] = [
  { id: "1", title: "Write blog post about micro-expressions", status: "todo", priority: "high", segment: "bodylytics", assigned_agent: "bl-marketing", source: "workflow" },
  { id: "2", title: "Prepare Duracell onboarding talking points", status: "todo", priority: "medium", segment: "duracell", assigned_agent: "duracell-prep", source: "manual" },
  { id: "3", title: "Fix certificate download bug", status: "in_progress", priority: "urgent", segment: "bodylytics", assigned_agent: "devops", source: "agent" },
  { id: "4", title: "Create Instagram carousel: deception cues", status: "in_progress", priority: "medium", segment: "bodylytics", assigned_agent: "bl-social", source: "workflow" },
  { id: "5", title: "Review SEO audit results", status: "review", priority: "medium", segment: "bodylytics", source: "agent" },
  { id: "6", title: "Weekly infrastructure report", status: "done", priority: "low", segment: "bodylytics", assigned_agent: "infra", source: "workflow" },
  { id: "7", title: "Auto-reply: password reset tickets", status: "done", priority: "low", segment: "bodylytics", assigned_agent: "bl-support", source: "workflow" },
  { id: "8", title: "Book DJ studio session", status: "todo", priority: "low", segment: "djing", source: "manual" },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);

  const handleDragStart = (taskId: string) => {
    setDraggedTask(taskId);
  };

  const handleDrop = (columnId: string) => {
    if (!draggedTask) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === draggedTask ? { ...t, status: columnId } : t))
    );
    setDraggedTask(null);
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
        <Button className="bg-teal-500 hover:bg-teal-600 text-white gap-2">
          <Plus className="w-4 h-4" />
          Add Task
        </Button>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-h-[600px]">
        {columns.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          return (
            <div
              key={col.id}
              className={cn(
                "bg-muted/50 rounded-xl p-3 border-t-4",
                col.color
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(col.id)}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-sm font-semibold text-navy-500">{col.label}</h3>
                <span className="text-xs text-muted-foreground bg-white px-2 py-0.5 rounded-full">
                  {colTasks.length}
                </span>
              </div>
              <div className="space-y-2">
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => handleDragStart(task.id)}
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
                          <Badge className={cn("text-[9px] px-1.5 py-0", priorityColors[task.priority])}>
                            {task.priority}
                          </Badge>
                          {task.segment && (
                            <Badge className={cn("text-[9px] px-1.5 py-0", segmentColors[task.segment] || "bg-slate-100")}>
                              {task.segment}
                            </Badge>
                          )}
                          {task.assigned_agent && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                              {task.assigned_agent}
                            </Badge>
                          )}
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
    </div>
  );
}
