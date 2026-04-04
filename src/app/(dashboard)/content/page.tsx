"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PenLine,
  Eye,
  Calendar,
  ExternalLink,
  Loader2,
  Check,
  X,
  Sparkles,
  Send,
  RefreshCw,
  FileText,
  Globe,
} from "lucide-react";
import { toast } from "sonner";

// ---------- Types ----------

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  status: string;
  excerpt?: string;
  category?: string;
  seo_title?: string;
  seo_description?: string;
  reading_time_minutes?: number;
  featured_image_url?: string;
  created_at: string;
  updated_at?: string;
  published_at?: string;
}

const INGEST_KEY = "9eRse679@ohyEdCz&UAUL@V9V6t*xW@%47r4vQfFeThowllEBsIv";

const statusColors: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  published: "bg-emerald-100 text-emerald-700",
  archived: "bg-slate-100 text-slate-600",
  review: "bg-blue-100 text-blue-700",
};

const categoryColors: Record<string, string> = {
  "body-language": "bg-teal-50 text-teal-700",
  "micro-expressions": "bg-purple-50 text-purple-700",
  "sales-techniques": "bg-copper-50 text-copper-700",
  "deception-detection": "bg-red-50 text-red-700",
  default: "bg-slate-50 text-slate-600",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------- Component ----------

export default function ContentPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "draft" | "published">("all");
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState<BlogPost | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestTopic, setRequestTopic] = useState("");
  const [requestNotes, setRequestNotes] = useState("");
  const [generatingSocial, setGeneratingSocial] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    try {
      const statusParam = filter === "all" ? "all" : filter;
      const res = await fetch(`/api/publish-blog?status=${statusParam}`);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const json = await res.json();
      setPosts(json.posts || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchPosts();
    const interval = setInterval(fetchPosts, 30_000);
    return () => clearInterval(interval);
  }, [fetchPosts]);

  // Publish a draft
  const handlePublish = async (post: BlogPost) => {
    setPublishing(true);
    try {
      const res = await fetch("/api/publish-blog", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INGEST_KEY}`,
        },
        body: JSON.stringify({
          blog_post_id: post.id,
          title: post.title,
          slug: post.slug,
          content: "", // The API handles updating status
          excerpt: post.excerpt,
          category: post.category,
          seo_title: post.seo_title,
          seo_description: post.seo_description,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to publish");
      }

      const result = await res.json();
      toast.success(`Published! Live at bodylytics.co/blog/${result.slug}`);
      setShowPublishModal(null);
      fetchPosts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  // Request a new blog post from bl-marketing via Holly
  const handleRequestBlog = async () => {
    if (!requestTopic.trim()) return;
    setRequesting(true);
    try {
      const res = await fetch("/api/trigger-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INGEST_KEY}`,
        },
        body: JSON.stringify({
          agent_id: "bl-marketing",
          task_title: `Write blog post: ${requestTopic}`,
          task_description: `Write a full blog post about "${requestTopic}" for the BodyLytics blog. ${requestNotes ? `Additional notes: ${requestNotes}` : ""}\n\nRequirements:\n- SEO optimised title and meta description\n- 800-1500 words\n- Include relevant examples\n- HTML formatted content\n- When done, POST to Mission Control /api/publish-blog with status "draft"`,
        }),
      });

      const result = await res.json();
      if (result.queued) {
        toast.success("Blog request queued — bl-marketing will pick it up shortly");
      } else {
        toast.success("Blog request sent to bl-marketing — writing now!");
      }
      setShowRequestModal(false);
      setRequestTopic("");
      setRequestNotes("");
    } catch {
      toast.error("Failed to request blog post");
    } finally {
      setRequesting(false);
    }
  };

  // Generate social posts from a blog
  const handleGenerateSocial = async (post: BlogPost) => {
    setGeneratingSocial(post.id);
    try {
      const res = await fetch("/api/trigger-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INGEST_KEY}`,
        },
        body: JSON.stringify({
          agent_id: "bl-social",
          task_title: `Generate social posts for: ${post.title}`,
          task_description: `Create social media posts promoting the blog post "${post.title}" (${post.slug}) on bodylytics.co/blog/${post.slug}.\n\nExcerpt: ${post.excerpt || "N/A"}\nCategory: ${post.category || "body-language"}\n\nGenerate posts for: LinkedIn, Instagram, TikTok\nEach post should be platform-appropriate (tone, length, hashtags).\nPOST each one to Mission Control /api/ingest with activity_type "social_post" and metadata: { platform, blog_post_id: "${post.id}" }`,
        }),
      });

      const result = await res.json();
      if (result.queued) {
        toast.success("Social generation queued — bl-social will create posts");
      } else {
        toast.success("bl-social is generating social posts now!");
      }
    } catch {
      toast.error("Failed to trigger social generation");
    } finally {
      setGeneratingSocial(null);
    }
  };

  const filteredPosts = posts;
  const draftCount = posts.filter((p) => p.status === "draft").length;
  const publishedCount = posts.filter((p) => p.status === "published").length;

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">
            Content Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? (
              "Loading blog posts..."
            ) : error ? (
              <span className="text-red-500">Error: {error}</span>
            ) : (
              <>
                {posts.length} posts &middot;{" "}
                <span className="text-amber-600">{draftCount} drafts</span>{" "}
                &middot;{" "}
                <span className="text-emerald-600">
                  {publishedCount} published
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchPosts()}
            className="gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Button
            onClick={() => setShowRequestModal(true)}
            className="bg-teal-500 hover:bg-teal-600 text-white gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Request Blog Post
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        {(["all", "draft", "published"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              filter === f
                ? "bg-white shadow-sm text-navy-500"
                : "text-muted-foreground hover:text-navy-500"
            )}
          >
            {f === "all" ? "All" : f === "draft" ? "Drafts" : "Published"}
          </button>
        ))}
      </div>

      {/* Blog Posts Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-border">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No blog posts found</p>
          <Button
            onClick={() => setShowRequestModal(true)}
            className="mt-3 bg-teal-500 hover:bg-teal-600 text-white gap-2"
            size="sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Request one from bl-marketing
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredPosts.map((post) => (
            <div
              key={post.id}
              className="bg-white rounded-xl border border-border p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <PenLine className="w-4 h-4 text-navy-400 flex-shrink-0" />
                    <h3 className="text-sm font-semibold text-navy-500 truncate">
                      {post.title}
                    </h3>
                  </div>
                  {post.excerpt && (
                    <p className="text-xs text-muted-foreground line-clamp-2 ml-6 mb-2">
                      {post.excerpt}
                    </p>
                  )}
                  <div className="flex items-center gap-3 ml-6 flex-wrap">
                    <Badge
                      className={cn(
                        "text-[10px]",
                        statusColors[post.status] ?? statusColors.draft
                      )}
                    >
                      {post.status}
                    </Badge>
                    {post.category && (
                      <Badge
                        className={cn(
                          "text-[10px]",
                          categoryColors[post.category] ||
                            categoryColors.default
                        )}
                      >
                        {post.category}
                      </Badge>
                    )}
                    {post.reading_time_minutes && (
                      <span className="text-[10px] text-muted-foreground">
                        {post.reading_time_minutes} min read
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(post.created_at)}
                    </span>
                    {post.published_at && (
                      <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {formatDate(post.published_at)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {post.status === "published" && (
                    <>
                      <a
                        href={`https://bodylytics.co/blog/${post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg hover:bg-muted transition-colors"
                        title="View on site"
                      >
                        <ExternalLink className="w-4 h-4 text-navy-400" />
                      </a>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateSocial(post)}
                        disabled={generatingSocial === post.id}
                        className="gap-1.5 text-xs"
                      >
                        {generatingSocial === post.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Globe className="w-3 h-3" />
                        )}
                        Generate Social
                      </Button>
                    </>
                  )}
                  {post.status === "draft" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateSocial(post)}
                        disabled={generatingSocial === post.id}
                        className="gap-1.5 text-xs"
                      >
                        {generatingSocial === post.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Globe className="w-3 h-3" />
                        )}
                        Generate Social
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setShowPublishModal(post)}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 text-xs"
                      >
                        <Check className="w-3 h-3" />
                        Publish
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Content Pipeline Stats */}
      <div>
        <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">
          Pipeline Overview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-navy-500">
                Total Posts
              </span>
              <span className="text-lg font-montserrat font-bold text-navy-500">
                {posts.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              All blog posts on BodyLytics
            </p>
          </div>
          <div className="bg-white rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-navy-500">
                Drafts
              </span>
              <span className="text-lg font-montserrat font-bold text-amber-500">
                {draftCount}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Awaiting review & publish
            </p>
          </div>
          <div className="bg-white rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-navy-500">
                Published
              </span>
              <span className="text-lg font-montserrat font-bold text-emerald-500">
                {publishedCount}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Live on the site</p>
          </div>
          <div className="bg-white rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-navy-500">
                This Month
              </span>
              <span className="text-lg font-montserrat font-bold text-teal-500">
                {
                  posts.filter((p) => {
                    const d = new Date(p.created_at);
                    const now = new Date();
                    return (
                      d.getMonth() === now.getMonth() &&
                      d.getFullYear() === now.getFullYear()
                    );
                  }).length
                }
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Created this month</p>
          </div>
        </div>
      </div>

      {/* Publish Confirmation Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-montserrat font-bold text-navy-500">
                Publish Post
              </h2>
              <button
                onClick={() => setShowPublishModal(null)}
                className="p-1 rounded-lg hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                <p className="text-sm font-medium text-emerald-800 mb-1">
                  Ready to publish?
                </p>
                <p className="text-xs text-emerald-600">
                  &ldquo;{showPublishModal.title}&rdquo; will be published to{" "}
                  <strong>bodylytics.co/blog/{showPublishModal.slug}</strong>
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowPublishModal(null)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handlePublish(showPublishModal)}
                  disabled={publishing}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white gap-2"
                >
                  {publishing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Publish Now
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Request Blog Post Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-montserrat font-bold text-navy-500">
                Request Blog Post
              </h2>
              <button
                onClick={() => setShowRequestModal(false)}
                className="p-1 rounded-lg hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                bl-marketing will write a draft, Holly will review it, then you
                can publish.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Topic / Title
                </label>
                <input
                  type="text"
                  value={requestTopic}
                  onChange={(e) => setRequestTopic(e.target.value)}
                  placeholder="e.g. How to Read Body Language in Video Calls"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Additional Notes{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="Target audience, keywords to include, angle..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-none"
                />
              </div>
              <Button
                onClick={handleRequestBlog}
                disabled={requesting || !requestTopic.trim()}
                className="w-full bg-teal-500 hover:bg-teal-600 text-white gap-2"
              >
                {requesting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Send to bl-marketing
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
