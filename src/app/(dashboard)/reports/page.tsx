"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, Download } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Report {
  id: string;
  agent_id: string;
  activity_type: string;
  title: string;
  summary: string;
  workflow: string;
  created_at: string;
}

const agentEmojis: Record<string, string> = {
  "bl-marketing": "📈",
  infra: "🏗️",
  "bl-support": "🎧",
  "bl-qa": "🧪",
  devops: "⚙️",
  "bl-content": "✍️",
  "bl-social": "📱",
  holly: "🤖",
};

const reports: Report[] = [
  { id: "1", agent_id: "infra", activity_type: "report", title: "Daily Infrastructure Report — Apr 3", summary: "All 14 containers healthy. Disk at 62%. Redis restarted once (auto-recovered). No critical alerts.", workflow: "daily-infra", created_at: "2026-04-03T08:30:00Z" },
  { id: "2", agent_id: "bl-marketing", activity_type: "report", title: "Weekly SEO Audit — W14", summary: "Checked 12 blog posts. 3 missing meta descriptions. 1 broken image link. Recommendations included.", workflow: "seo-audit-monthly", created_at: "2026-04-02T17:00:00Z" },
  { id: "3", agent_id: "bl-qa", activity_type: "report", title: "Weekly Regression Test — W14", summary: "Auth flow: PASS. Enrollment: PASS. Checkout: PASS. Certificate: FAIL (timeout on PDF generation). Progress tracking: PASS.", workflow: "qa-weekly", created_at: "2026-04-02T14:00:00Z" },
  { id: "4", agent_id: "bl-support", activity_type: "report", title: "Feedback Analysis — W14", summary: "12 new support tickets. 8 auto-replied. 2 escalated. Top theme: certificate downloads. KB gap identified.", workflow: "feedback-weekly", created_at: "2026-04-02T10:00:00Z" },
  { id: "5", agent_id: "bl-marketing", activity_type: "report", title: "Competitor Analysis — March 2026", summary: "Monitored 5 competitors. New course launch by BodyTalk Pro (pricing undercuts by 15%). Recommendations included.", workflow: "competitor-monthly", created_at: "2026-03-31T17:00:00Z" },
  { id: "6", agent_id: "bl-content", activity_type: "report", title: "Course Content Audit — March 2026", summary: "4 thin lessons identified. 7 lessons missing interactives. 2 courses with stale content. Improvement plan attached.", workflow: "course-audit-monthly", created_at: "2026-03-31T12:00:00Z" },
  { id: "7", agent_id: "holly", activity_type: "report", title: "Weekly Business Report — W13", summary: "Revenue: \u20AC4,200 (84% target). 8 new enrollments. NPS: 72. 3 deals progressed. Full breakdown below.", workflow: "weekly-report", created_at: "2026-03-28T17:00:00Z" },
];

const typeBadgeColors: Record<string, string> = {
  report: "bg-blue-100 text-blue-700",
  alert: "bg-red-100 text-red-700",
  content: "bg-purple-100 text-purple-700",
};

export default function ReportsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAgent, setFilterAgent] = useState<string | null>(null);

  const filtered = reports.filter((r) => {
    const matchesSearch =
      !searchQuery ||
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.summary.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAgent = !filterAgent || r.agent_id === filterAgent;
    return matchesSearch && matchesAgent;
  });

  const agents = Array.from(new Set(reports.map((r) => r.agent_id)));

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-montserrat font-bold text-navy-500">Reports</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          All agent outputs &middot; {reports.length} reports
        </p>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full pl-9 pr-4 rounded-lg bg-white border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          />
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilterAgent(null)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              !filterAgent ? "bg-navy-500 text-white" : "bg-white border text-muted-foreground hover:bg-muted"
            )}
          >
            All
          </button>
          {agents.map((agent) => (
            <button
              key={agent}
              onClick={() => setFilterAgent(agent === filterAgent ? null : agent)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                filterAgent === agent ? "bg-navy-500 text-white" : "bg-white border text-muted-foreground hover:bg-muted"
              )}
            >
              {agentEmojis[agent]} {agent}
            </button>
          ))}
        </div>
      </div>

      {/* Report List */}
      <div className="space-y-3">
        {filtered.map((report) => (
          <div
            key={report.id}
            className="bg-white rounded-xl border border-border p-4 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-base">{agentEmojis[report.agent_id] || "🤖"}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-navy-500">{report.title}</h3>
                    <Badge className={cn("text-[10px]", typeBadgeColors[report.activity_type] || "bg-slate-100")}>
                      {report.activity_type}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {report.agent_id} &middot; {report.workflow} &middot;{" "}
                    {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
              <button className="p-2 rounded-lg hover:bg-muted transition-colors">
                <Download className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground pl-8">{report.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
