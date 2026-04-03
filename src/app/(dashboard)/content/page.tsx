"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PenLine, Plus, Eye, Calendar } from "lucide-react";
import { useMCTable } from "@/lib/hooks/use-mission-control";

// ---------- Demo / fallback data ----------

const demoBlogPosts = [
  { id: "1", title: "5 Body Language Mistakes That Kill Sales Deals", status: "draft", author: "bl-marketing", created: "2026-04-02", wordCount: 1200, seoScore: 92 },
  { id: "2", title: "Reading Micro-Expressions: A Practical Guide", status: "published", author: "bl-marketing", created: "2026-03-28", wordCount: 1500, seoScore: 88, views: 342 },
  { id: "3", title: "Non-Verbal Communication in Job Interviews", status: "published", author: "bl-marketing", created: "2026-03-21", wordCount: 1100, seoScore: 85, views: 528 },
  { id: "4", title: "The Science Behind Deception Detection", status: "draft", author: "bl-marketing", created: "2026-03-15", wordCount: 900, seoScore: 78 },
  { id: "5", title: "Building Trust Through Body Language", status: "published", author: "bl-marketing", created: "2026-03-10", wordCount: 1300, seoScore: 91, views: 412 },
];

const contentAudit = [
  { type: "Thin Lessons", count: 4, severity: "warning", detail: "Less than 3 content blocks" },
  { type: "No Interactives", count: 7, severity: "warning", detail: "Missing quizzes or exercises" },
  { type: "Stale Content", count: 2, severity: "info", detail: "Not updated in 60+ days" },
  { type: "Missing Certificates", count: 1, severity: "info", detail: "Course without certificate" },
];

const statusColors: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  published: "bg-emerald-100 text-emerald-700",
  archived: "bg-slate-100 text-slate-600",
};

// ---------- Types ----------

interface AgentActivity {
  id: string;
  activity_type: string;
  title?: string;
  status?: string;
  agent_name?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
}

interface BlogPost {
  id: string;
  title: string;
  status: string;
  author: string;
  created: string;
  wordCount: number;
  seoScore: number;
  views?: number;
}

// ---------- Helpers ----------

function activityToBlogPost(a: AgentActivity): BlogPost {
  const meta = (a.metadata ?? {}) as Record<string, unknown>;
  return {
    id: a.id,
    title: (a.title as string) || "Untitled",
    status: (a.status as string) || "draft",
    author: (a.agent_name as string) || "agent",
    created: a.created_at ? a.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
    wordCount: (meta.word_count as number) ?? 0,
    seoScore: (meta.seo_score as number) ?? 0,
    views: (meta.views as number) ?? undefined,
  };
}

// ---------- Component ----------

export default function ContentPage() {
  const { data: activities, loading } = useMCTable<AgentActivity>("agent_activity", {
    orderBy: "created_at",
    orderAsc: false,
    limit: 50,
  });

  // Client-side filter for content-related activity types
  const contentActivities = useMemo(
    () => activities.filter((a) => a.activity_type === "content" || a.activity_type === "report"),
    [activities]
  );

  const livePosts = useMemo(() => contentActivities.map(activityToBlogPost), [contentActivities]);

  // Use live data when available, otherwise fall back to demo data
  const blogPosts = livePosts.length > 0 ? livePosts : demoBlogPosts;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">Content Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "Loading..." : (
              <>
                {blogPosts.length} posts &middot; {blogPosts.filter(p => p.status === "draft").length} drafts awaiting review
              </>
            )}
          </p>
        </div>
        <Button className="bg-teal-500 hover:bg-teal-600 text-white gap-2">
          <Plus className="w-4 h-4" />
          Write Blog Post
        </Button>
      </div>

      {/* Blog Posts */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left text-xs font-semibold text-muted-foreground p-3">Title</th>
              <th className="text-left text-xs font-semibold text-muted-foreground p-3">Status</th>
              <th className="text-left text-xs font-semibold text-muted-foreground p-3">Date</th>
              <th className="text-right text-xs font-semibold text-muted-foreground p-3">Words</th>
              <th className="text-right text-xs font-semibold text-muted-foreground p-3">SEO</th>
              <th className="text-right text-xs font-semibold text-muted-foreground p-3">Views</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {blogPosts.map((post) => (
              <tr key={post.id} className="hover:bg-muted/30 transition-colors cursor-pointer">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <PenLine className="w-4 h-4 text-navy-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-navy-500">{post.title}</span>
                  </div>
                </td>
                <td className="p-3">
                  <Badge className={cn("text-[10px]", statusColors[post.status])}>{post.status}</Badge>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {post.created}
                  </div>
                </td>
                <td className="p-3 text-right text-sm text-muted-foreground">{post.wordCount.toLocaleString()}</td>
                <td className="p-3 text-right">
                  <span className={cn("text-sm font-medium", post.seoScore >= 90 ? "text-emerald-600" : post.seoScore >= 80 ? "text-amber-600" : "text-red-600")}>
                    {post.seoScore}
                  </span>
                </td>
                <td className="p-3 text-right">
                  {post.views ? (
                    <div className="flex items-center justify-end gap-1 text-sm text-muted-foreground">
                      <Eye className="w-3 h-3" />
                      {post.views}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Content Audit */}
      <div>
        <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">Content Audit</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {contentAudit.map((item) => (
            <div key={item.type} className="bg-white rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-navy-500">{item.type}</span>
                <span className={cn("text-lg font-montserrat font-bold", item.severity === "warning" ? "text-amber-500" : "text-blue-500")}>
                  {item.count}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
