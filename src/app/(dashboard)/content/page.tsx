"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PenLine, Plus, Eye, Calendar } from "lucide-react";
import { useBodylyticsTable } from "@/lib/hooks/use-bodylytics";

// ---------- Types ----------

interface BlogPostRow {
  id: string;
  title: string;
  status: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  author?: string;
  created_at: string;
  published_at?: string;
}

// ---------- Demo / fallback data ----------

const demoBlogPosts: BlogPostRow[] = [
  { id: "1", title: "5 Body Language Mistakes That Kill Sales Deals", status: "draft", author: "bl-marketing", created_at: "2026-04-02T00:00:00Z" },
  { id: "2", title: "Reading Micro-Expressions: A Practical Guide", status: "published", author: "bl-marketing", created_at: "2026-03-28T00:00:00Z", published_at: "2026-03-28T00:00:00Z" },
  { id: "3", title: "Non-Verbal Communication in Job Interviews", status: "published", author: "bl-marketing", created_at: "2026-03-21T00:00:00Z", published_at: "2026-03-21T00:00:00Z" },
  { id: "4", title: "The Science Behind Deception Detection", status: "draft", author: "bl-marketing", created_at: "2026-03-15T00:00:00Z" },
  { id: "5", title: "Building Trust Through Body Language", status: "published", author: "bl-marketing", created_at: "2026-03-10T00:00:00Z", published_at: "2026-03-10T00:00:00Z" },
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

// ---------- Helpers ----------

function formatDate(dateStr: string): string {
  return dateStr.slice(0, 10);
}

// ---------- Component ----------

export default function ContentPage() {
  const { data, loading, error } = useBodylyticsTable<BlogPostRow>(
    "blog_posts",
    "*",
    50,
    { refreshInterval: 60_000 }
  );

  // Use live data when available, otherwise fall back to demo data
  const blogPosts = data && data.length > 0 ? data : demoBlogPosts;
  const isDemo = !data || data.length === 0;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">Content Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "Loading blog posts..." : error ? (
              <span className="text-red-500">Error: {error}</span>
            ) : (
              <>
                {blogPosts.length} posts &middot; {blogPosts.filter(p => p.status === "draft").length} drafts awaiting review
                {isDemo && (
                  <span className="ml-2 text-amber-500 text-xs">(demo data)</span>
                )}
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
              <th className="text-left text-xs font-semibold text-muted-foreground p-3">Author</th>
              <th className="text-left text-xs font-semibold text-muted-foreground p-3">Created</th>
              <th className="text-left text-xs font-semibold text-muted-foreground p-3">Published</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {blogPosts.map((post) => (
              <tr key={post.id} className="hover:bg-muted/30 transition-colors cursor-pointer">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <PenLine className="w-4 h-4 text-navy-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-navy-500 block truncate">{post.title}</span>
                      {post.excerpt && (
                        <span className="text-xs text-muted-foreground block truncate max-w-md">{post.excerpt}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <Badge className={cn("text-[10px]", statusColors[post.status] ?? statusColors.draft)}>
                    {post.status}
                  </Badge>
                </td>
                <td className="p-3 text-sm text-muted-foreground">
                  {post.author ?? "unknown"}
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {formatDate(post.created_at)}
                  </div>
                </td>
                <td className="p-3">
                  {post.published_at ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Eye className="w-3 h-3" />
                      {formatDate(post.published_at)}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
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
