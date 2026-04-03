import AgentStatusCard from "@/components/dashboard/AgentStatusCard";
import RecentActivity from "@/components/dashboard/RecentActivity";

const agents = [
  { name: "Holly", emoji: "🤖", model: "Claude Sonnet", status: "active" as const, lastActivity: new Date(Date.now() - 15 * 60000).toISOString(), tasksThisWeek: 34 },
  { name: "Social", emoji: "📱", model: "Gemini 2.5 Flash", status: "idle" as const, lastActivity: new Date(Date.now() - 3 * 3600000).toISOString(), tasksThisWeek: 8 },
  { name: "Community", emoji: "🤝", model: "Gemini 2.5 Flash", status: "idle" as const, lastActivity: new Date(Date.now() - 5 * 3600000).toISOString(), tasksThisWeek: 5 },
  { name: "Marketing", emoji: "📈", model: "Claude Sonnet", status: "active" as const, lastActivity: new Date(Date.now() - 25 * 60000).toISOString(), tasksThisWeek: 12 },
  { name: "Content", emoji: "✍️", model: "Claude Sonnet", status: "idle" as const, lastActivity: new Date(Date.now() - 8 * 3600000).toISOString(), tasksThisWeek: 3 },
  { name: "Duracell Prep", emoji: "💼", model: "Claude Sonnet", status: "idle" as const, lastActivity: new Date(Date.now() - 48 * 3600000).toISOString(), tasksThisWeek: 1 },
  { name: "Support", emoji: "🎧", model: "Gemini 2.5 Flash", status: "idle" as const, lastActivity: new Date(Date.now() - 3 * 3600000).toISOString(), tasksThisWeek: 6 },
  { name: "QA", emoji: "🧪", model: "Claude Haiku", status: "idle" as const, lastActivity: new Date(Date.now() - 6 * 3600000).toISOString(), tasksThisWeek: 4 },
  { name: "Infra", emoji: "🏗️", model: "Claude Sonnet", status: "idle" as const, lastActivity: new Date(Date.now() - 2 * 3600000).toISOString(), tasksThisWeek: 7 },
  { name: "DevOps", emoji: "⚙️", model: "Claude Sonnet", status: "idle" as const, lastActivity: new Date(Date.now() - 12 * 3600000).toISOString(), tasksThisWeek: 3 },
];

const recentActivities = [
  { id: "1", agent_id: "bl-marketing", activity_type: "content", title: "Blog post: 5 Body Language Mistakes That Kill Sales", summary: "1,200 words, SEO optimised, ready for review", created_at: new Date(Date.now() - 25 * 60000).toISOString() },
  { id: "2", agent_id: "infra", activity_type: "report", title: "Daily Infrastructure Report", summary: "All 14 containers healthy. Disk at 62%.", created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
  { id: "3", agent_id: "bl-support", activity_type: "task_complete", title: "Auto-replied to ticket #47: Password reset", summary: "Standard KB response sent", created_at: new Date(Date.now() - 3 * 3600000).toISOString() },
  { id: "4", agent_id: "bl-social", activity_type: "content", title: "Weekly social calendar created", summary: "5 posts: 2 LinkedIn, 2 Instagram, 1 TikTok", created_at: new Date(Date.now() - 5 * 3600000).toISOString() },
  { id: "5", agent_id: "bl-qa", activity_type: "report", title: "Smoke test passed: staging", summary: "All 6 checks green", created_at: new Date(Date.now() - 8 * 3600000).toISOString() },
];

export default function AgentsPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-montserrat font-bold text-navy-500">Agent Fleet</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          10 agents &middot; 2 active &middot; 83 tasks this week
        </p>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {agents.map((agent) => (
          <AgentStatusCard key={agent.name} {...agent} />
        ))}
      </div>

      {/* Activity Timeline */}
      <div className="space-y-3">
        <h2 className="text-lg font-montserrat font-semibold text-navy-500">Activity Timeline</h2>
        <div className="bg-white rounded-xl border border-border">
          <RecentActivity activities={recentActivities} />
        </div>
      </div>
    </div>
  );
}
