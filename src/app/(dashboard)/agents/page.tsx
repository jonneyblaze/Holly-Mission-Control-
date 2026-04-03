"use client";

import AgentStatusCard from "@/components/dashboard/AgentStatusCard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import { useMCTable } from "@/lib/hooks/use-mission-control";
import { Loader2 } from "lucide-react";

const agentRoster = [
  { name: "Holly", emoji: "🤖", model: "Claude Sonnet", agentId: "holly" },
  { name: "Social", emoji: "📱", model: "Gemini 2.5 Flash", agentId: "bl-social" },
  { name: "Community", emoji: "🤝", model: "Gemini 2.5 Flash", agentId: "bl-community" },
  { name: "Marketing", emoji: "📈", model: "Claude Sonnet", agentId: "bl-marketing" },
  { name: "Content", emoji: "✍️", model: "Claude Sonnet", agentId: "bl-content" },
  { name: "Duracell Prep", emoji: "💼", model: "Claude Sonnet", agentId: "duracell-prep" },
  { name: "Support", emoji: "🎧", model: "Gemini 2.5 Flash", agentId: "bl-support" },
  { name: "QA", emoji: "🧪", model: "Claude Haiku", agentId: "bl-qa" },
  { name: "Infra", emoji: "🏗️", model: "Claude Sonnet", agentId: "infra" },
  { name: "DevOps", emoji: "⚙️", model: "Claude Sonnet", agentId: "devops" },
];

interface Activity {
  id: string;
  agent_id: string;
  activity_type: string;
  title: string;
  summary: string;
  created_at: string;
}

// Fallback data
const fallbackActivities: Activity[] = [
  { id: "1", agent_id: "bl-marketing", activity_type: "content", title: "Blog post: 5 Body Language Mistakes That Kill Sales", summary: "1,200 words, SEO optimised, ready for review", created_at: new Date(Date.now() - 25 * 60000).toISOString() },
  { id: "2", agent_id: "infra", activity_type: "report", title: "Daily Infrastructure Report", summary: "All 14 containers healthy. Disk at 62%.", created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
  { id: "3", agent_id: "bl-support", activity_type: "task_complete", title: "Auto-replied to ticket #47: Password reset", summary: "Standard KB response sent", created_at: new Date(Date.now() - 3 * 3600000).toISOString() },
  { id: "4", agent_id: "bl-social", activity_type: "content", title: "Weekly social calendar created", summary: "5 posts: 2 LinkedIn, 2 Instagram, 1 TikTok", created_at: new Date(Date.now() - 5 * 3600000).toISOString() },
  { id: "5", agent_id: "bl-qa", activity_type: "report", title: "Smoke test passed: staging", summary: "All 6 checks green", created_at: new Date(Date.now() - 8 * 3600000).toISOString() },
];

export default function AgentsPage() {
  const { data: activities, loading } = useMCTable<Activity>("agent_activity", {
    limit: 20,
    realtime: true,
  });

  const displayActivities = activities.length > 0 ? activities : fallbackActivities;

  // Compute agent stats from activity data
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600000);

  const agentCards = agentRoster.map((agent) => {
    const agentActivities = displayActivities.filter((a) => a.agent_id === agent.agentId);
    const weekActivities = agentActivities.filter((a) => new Date(a.created_at) >= weekAgo);
    const lastActivity = agentActivities[0]?.created_at;
    const isRecent = lastActivity && Date.now() - new Date(lastActivity).getTime() < 30 * 60000;

    return {
      ...agent,
      status: (isRecent ? "active" : "idle") as "active" | "idle" | "error",
      lastActivity,
      tasksThisWeek: weekActivities.length,
    };
  });

  const totalWeek = agentCards.reduce((sum, a) => sum + a.tasksThisWeek, 0);
  const activeCount = agentCards.filter((a) => a.status === "active").length;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-montserrat font-bold text-navy-500">Agent Fleet</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          10 agents &middot; {activeCount} active &middot; {totalWeek} tasks this week
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {agentCards.map((agent) => (
          <AgentStatusCard key={agent.name} {...agent} />
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-montserrat font-semibold text-navy-500">Activity Timeline</h2>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border">
            <RecentActivity activities={displayActivities} />
          </div>
        )}
      </div>
    </div>
  );
}
