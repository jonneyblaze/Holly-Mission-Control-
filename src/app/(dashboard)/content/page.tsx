"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
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
  ImagePlus,
  Image as ImageIcon,
  ArrowLeft,
  Clock,
  Tag,
} from "lucide-react";
import { toast } from "sonner";

// ---------- Types ----------

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  status: string;
  excerpt?: string;
  content?: string;
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

const categoryLabels: Record<string, string> = {
  "body-language": "Body Language",
  "micro-expressions": "Micro-Expressions",
  "sales-techniques": "Sales Techniques",
  "deception-detection": "Deception Detection",
  leadership: "Leadership",
  negotiations: "Negotiations",
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
  const [previewPost, setPreviewPost] = useState<BlogPost | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState<BlogPost | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestTopic, setRequestTopic] = useState("");
  const [requestNotes, setRequestNotes] = useState("");
  const [generatingSocial, setGeneratingSocial] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState<string | null>(null);

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

  // Open full preview (fetch content)
  const openPreview = async (post: BlogPost) => {
    setPreviewPost(post);
    if (!post.content) {
      setPreviewLoading(true);
      try {
        const res = await fetch(`/api/publish-blog?status=all&content=true`);
        const json = await res.json();
        const fullPost = (json.posts || []).find((p: BlogPost) => p.id === post.id);
        if (fullPost) {
          setPreviewPost(fullPost);
        }
      } catch {
        // Keep the post without content
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  // Generate AI image for a blog post
  const handleGenerateImage = async (post: BlogPost) => {
    setGeneratingImage(post.id);
    try {
      const prompt = `${post.title}, body language, professional business setting, ${post.category || "communication"}`;
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          style: "professional editorial photography, warm lighting, business",
          width: 1200,
          height: 630,
        }),
      });

      if (!res.ok) throw new Error("Image generation failed");
      const data = await res.json();

      // Save to BodyLytics
      const patchRes = await fetch("/api/publish-blog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blog_post_id: post.id,
          featured_image_url: data.url,
        }),
      });

      if (patchRes.ok) {
        toast.success("Featured image generated and saved!");
        // Update local state
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id ? { ...p, featured_image_url: data.url } : p
          )
        );
        if (previewPost?.id === post.id) {
          setPreviewPost((prev) => prev ? { ...prev, featured_image_url: data.url } : null);
        }
      }
    } catch {
      toast.error("Failed to generate image");
    } finally {
      setGeneratingImage(null);
    }
  };

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
      setPreviewPost(null);
      fetchPosts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  // Request blog post from bl-marketing
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
      toast.success(result.directTriggered ? "bl-marketing is writing now!" : "Blog request queued");
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
          task_description: `Create social media posts promoting "${post.title}" at bodylytics.co/blog/${post.slug}.\n\nExcerpt: ${post.excerpt || "N/A"}\nCategory: ${post.category || "body-language"}\n\nGenerate for: LinkedIn, Instagram, TikTok.\nPOST each to /api/ingest with activity_type "social_post" and metadata: { platform, blog_post_id: "${post.id}" }`,
        }),
      });
      const result = await res.json();
      toast.success(result.directTriggered ? "bl-social is creating posts!" : "Social generation queued");
    } catch {
      toast.error("Failed to trigger social generation");
    } finally {
      setGeneratingSocial(null);
    }
  };

  const draftCount = posts.filter((p) => p.status === "draft").length;
  const publishedCount = posts.filter((p) => p.status === "published").length;
  const noImageCount = posts.filter((p) => !p.featured_image_url).length;

  // ---------- Preview Mode ----------
  if (previewPost) {
    return (
      <div className="max-w-4xl mx-auto">
        {/* Preview header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setPreviewPost(null)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-navy-500 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to content
          </button>
          <div className="flex items-center gap-2">
            <Badge className={cn("text-xs", statusColors[previewPost.status] || statusColors.draft)}>
              {previewPost.status}
            </Badge>
            {previewPost.status === "draft" && (
              <Button
                size="sm"
                onClick={() => setShowPublishModal(previewPost)}
                className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 text-xs"
              >
                <Send className="w-3 h-3" />
                Publish
              </Button>
            )}
            {previewPost.status === "published" && (
              <a
                href={`https://bodylytics.co/blog/${previewPost.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-600 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                View live
              </a>
            )}
          </div>
        </div>

        {/* Blog preview — mimics the BodyLytics blog layout */}
        <article className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
          {/* Featured image */}
          <div className="relative aspect-[1200/630] bg-slate-100 overflow-hidden group">
            {previewPost.featured_image_url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewPost.featured_image_url}
                  alt={previewPost.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <button
                    onClick={() => handleGenerateImage(previewPost)}
                    disabled={generatingImage === previewPost.id}
                    className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm text-navy-500 px-4 py-2 rounded-lg text-sm font-medium shadow-lg flex items-center gap-2"
                  >
                    {generatingImage === previewPost.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ImagePlus className="w-4 h-4" />
                    )}
                    Regenerate Image
                  </button>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
                <ImageIcon className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-sm text-muted-foreground mb-3">No featured image</p>
                <Button
                  size="sm"
                  onClick={() => handleGenerateImage(previewPost)}
                  disabled={generatingImage === previewPost.id}
                  className="bg-teal-500 hover:bg-teal-600 text-white gap-2"
                >
                  {generatingImage === previewPost.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Generate AI Image
                </Button>
              </div>
            )}
          </div>

          {/* Article content */}
          <div className="p-8 md:p-12">
            {/* Meta */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              {previewPost.category && (
                <span className="text-xs font-semibold text-teal-600 uppercase tracking-wider">
                  {categoryLabels[previewPost.category] || previewPost.category}
                </span>
              )}
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(previewPost.published_at || previewPost.created_at)}
              </span>
              {previewPost.reading_time_minutes && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {previewPost.reading_time_minutes} min read
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-montserrat font-bold text-navy-500 leading-tight mb-4">
              {previewPost.title}
            </h1>

            {/* Excerpt */}
            {previewPost.excerpt && (
              <p className="text-lg text-muted-foreground leading-relaxed mb-8 border-l-4 border-teal-400 pl-4 italic">
                {previewPost.excerpt}
              </p>
            )}

            {/* Content */}
            {previewLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                <span className="ml-2 text-sm text-muted-foreground">Loading content...</span>
              </div>
            ) : previewPost.content ? (
              <div
                className="prose prose-slate max-w-none prose-headings:font-montserrat prose-headings:text-navy-500 prose-a:text-teal-600 prose-strong:text-navy-600 prose-img:rounded-xl"
                dangerouslySetInnerHTML={{ __html: previewPost.content }}
              />
            ) : (
              <div className="bg-slate-50 rounded-xl p-8 text-center">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Content not available for preview</p>
                <p className="text-xs text-muted-foreground mt-1">The full content will be visible on the live site</p>
              </div>
            )}
          </div>

          {/* SEO Preview */}
          <div className="border-t border-border p-6 bg-slate-50/50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Tag className="w-3 h-3" />
              SEO Preview
            </h3>
            <div className="bg-white rounded-lg border border-border p-4 max-w-xl">
              <p className="text-blue-700 text-base font-medium truncate hover:underline cursor-pointer">
                {previewPost.seo_title || previewPost.title}
              </p>
              <p className="text-emerald-700 text-xs mt-0.5">
                bodylytics.co/blog/{previewPost.slug}
              </p>
              <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                {previewPost.seo_description || previewPost.excerpt || "No description"}
              </p>
            </div>
          </div>

          {/* Actions bar */}
          <div className="border-t border-border p-4 flex items-center gap-2 bg-white">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerateSocial(previewPost)}
              disabled={generatingSocial === previewPost.id}
              className="gap-1.5 text-xs"
            >
              {generatingSocial === previewPost.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Globe className="w-3 h-3" />
              )}
              Generate Social Posts
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerateImage(previewPost)}
              disabled={generatingImage === previewPost.id}
              className="gap-1.5 text-xs"
            >
              {generatingImage === previewPost.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ImagePlus className="w-3 h-3" />
              )}
              {previewPost.featured_image_url ? "New Image" : "Generate Image"}
            </Button>
          </div>
        </article>
      </div>
    );
  }

  // ---------- List View ----------
  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">Content Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "Loading..." : error ? (
              <span className="text-red-500">Error: {error}</span>
            ) : (
              <>
                {posts.length} posts &middot;{" "}
                <span className="text-amber-600">{draftCount} drafts</span> &middot;{" "}
                <span className="text-emerald-600">{publishedCount} published</span>
                {noImageCount > 0 && (
                  <> &middot; <span className="text-red-500">{noImageCount} missing images</span></>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchPosts} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button onClick={() => setShowRequestModal(true)} className="bg-teal-500 hover:bg-teal-600 text-white gap-2">
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
              filter === f ? "bg-white shadow-sm text-navy-500" : "text-muted-foreground hover:text-navy-500"
            )}
          >
            {f === "all" ? "All" : f === "draft" ? "Drafts" : "Published"}
          </button>
        ))}
      </div>

      {/* Blog Post Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-border">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No blog posts found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {posts.map((post) => (
            <div
              key={post.id}
              className="bg-white rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
              onClick={() => openPreview(post)}
            >
              {/* Image */}
              <div className="relative aspect-[16/9] bg-slate-100 overflow-hidden">
                {post.featured_image_url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={post.featured_image_url}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
                    <ImageIcon className="w-8 h-8 text-slate-200 mb-2" />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleGenerateImage(post); }}
                      disabled={generatingImage === post.id}
                      className="text-[10px] font-medium text-teal-600 hover:text-teal-700 flex items-center gap-1"
                    >
                      {generatingImage === post.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      Generate image
                    </button>
                  </div>
                )}
                {/* Status badge overlay */}
                <div className="absolute top-2 left-2">
                  <Badge className={cn("text-[10px] shadow-sm", statusColors[post.status] || statusColors.draft)}>
                    {post.status}
                  </Badge>
                </div>
              </div>

              {/* Card content */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  {post.category && (
                    <span className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider">
                      {categoryLabels[post.category] || post.category}
                    </span>
                  )}
                  {post.reading_time_minutes && (
                    <span className="text-[10px] text-muted-foreground">{post.reading_time_minutes} min</span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-navy-500 line-clamp-2 leading-snug mb-2 group-hover:text-teal-600 transition-colors">
                  {post.title}
                </h3>
                {post.excerpt && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{post.excerpt}</p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(post.created_at)}
                  </span>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {post.status === "published" && (
                      <a
                        href={`https://bodylytics.co/blog/${post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-muted transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                      </a>
                    )}
                    {post.status === "draft" && (
                      <button
                        onClick={() => setShowPublishModal(post)}
                        className="p-1.5 rounded bg-emerald-50 hover:bg-emerald-100 transition-colors"
                        title="Publish"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      </button>
                    )}
                    <button
                      onClick={() => handleGenerateSocial(post)}
                      disabled={generatingSocial === post.id}
                      className="p-1.5 rounded hover:bg-muted transition-colors"
                      title="Generate social posts"
                    >
                      {generatingSocial === post.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[
          { label: "Total Posts", value: posts.length, color: "text-navy-500" },
          { label: "Drafts", value: draftCount, color: "text-amber-500" },
          { label: "Published", value: publishedCount, color: "text-emerald-500" },
          { label: "Missing Images", value: noImageCount, color: noImageCount > 0 ? "text-red-500" : "text-emerald-500" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-navy-500">{stat.label}</span>
              <span className={cn("text-lg font-montserrat font-bold", stat.color)}>{stat.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Publish Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-montserrat font-bold text-navy-500">Publish Post</h2>
              <button onClick={() => setShowPublishModal(null)} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            {!showPublishModal.featured_image_url && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                <ImageIcon className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-800">No featured image</p>
                  <p className="text-[10px] text-amber-600">Consider generating an image before publishing</p>
                </div>
              </div>
            )}
            <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200 mb-4">
              <p className="text-sm font-medium text-emerald-800 mb-1">Ready to publish?</p>
              <p className="text-xs text-emerald-600">
                &ldquo;{showPublishModal.title}&rdquo; will be live at <strong>bodylytics.co/blog/{showPublishModal.slug}</strong>
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowPublishModal(null)} className="flex-1">Cancel</Button>
              <Button
                onClick={() => handlePublish(showPublishModal)}
                disabled={publishing}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white gap-2"
              >
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Publish Now
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-montserrat font-bold text-navy-500">Request Blog Post</h2>
              <button onClick={() => setShowRequestModal(false)} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">bl-marketing will write a draft, Holly reviews, then you publish.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Topic / Title</label>
                <input
                  type="text"
                  value={requestTopic}
                  onChange={(e) => setRequestTopic(e.target.value)}
                  placeholder="e.g. How to Read Body Language in Video Calls"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes <span className="text-muted-foreground">(optional)</span></label>
                <textarea
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="Target audience, keywords, angle..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-none"
                />
              </div>
              <Button
                onClick={handleRequestBlog}
                disabled={requesting || !requestTopic.trim()}
                className="w-full bg-teal-500 hover:bg-teal-600 text-white gap-2"
              >
                {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Send to bl-marketing
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
