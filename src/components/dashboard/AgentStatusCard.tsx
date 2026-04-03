"use client";

import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface AgentStatusCardProps {
  name: string;
  emoji: string;
  model: string;
  status: "idle" | "active" | "error";
  lastActivity?: string;
  tasksThisWeek?: number;
}

const statusConfig = {
  idle: { color: "bg-slate-400", label: "Idle", ring: "" },
  active: { color: "bg-teal-500", label: "Active", ring: "ring-2 ring-teal-500/30" },
  error: { color: "bg-red-500", label: "Error", ring: "ring-2 ring-red-500/30" },
};

export default function AgentStatusCard({
  name,
  emoji,
  model,
  status,
  lastActivity,
  tasksThisWeek = 0,
}: AgentStatusCardProps) {
  const config = statusConfig[status];

  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-border p-4 hover:shadow-md transition-all",
        config.ring
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <div>
            <p className="text-sm font-semibold text-navy-500">{name}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{model}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn("w-2 h-2 rounded-full", config.color)} />
          <span className="text-[10px] font-medium text-muted-foreground">{config.label}</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
        <span>
          {lastActivity
            ? formatDistanceToNow(new Date(lastActivity), { addSuffix: true })
            : "No activity"}
        </span>
        <span className="font-medium">{tasksThisWeek} this week</span>
      </div>
    </div>
  );
}
