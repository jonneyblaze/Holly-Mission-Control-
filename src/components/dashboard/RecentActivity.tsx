"use client";

import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface Activity {
  id: string;
  agent_id: string;
  activity_type: string;
  title: string;
  summary?: string;
  created_at: string;
}

const agentEmojis: Record<string, string> = {
  holly: "🤖",
  "bl-social": "📱",
  "bl-community": "🤝",
  "bl-marketing": "📈",
  "bl-content": "✍️",
  "duracell-prep": "💼",
  "bl-support": "🎧",
  "bl-qa": "🧪",
  infra: "🏗️",
  devops: "⚙️",
  private: "🔒",
};

const typeBadgeColors: Record<string, string> = {
  report: "bg-blue-100 text-blue-700",
  alert: "bg-red-100 text-red-700",
  content: "bg-purple-100 text-purple-700",
  lead: "bg-copper-100 text-copper-700",
  task_complete: "bg-teal-100 text-teal-700",
  kb_article: "bg-amber-100 text-amber-700",
};

export default function RecentActivity({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No recent activity. Agents are standing by.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {activities.map((activity) => (
        <div
          key={activity.id}
          className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <span className="text-base mt-0.5">
            {agentEmojis[activity.agent_id] || "🤖"}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-medium text-navy-500">{activity.agent_id}</span>
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] px-1.5 py-0 h-4",
                  typeBadgeColors[activity.activity_type] || "bg-slate-100 text-slate-700"
                )}
              >
                {activity.activity_type}
              </Badge>
            </div>
            <p className="text-sm font-medium text-foreground truncate">{activity.title}</p>
            {activity.summary && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{activity.summary}</p>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-1">
            {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
          </span>
        </div>
      ))}
    </div>
  );
}
