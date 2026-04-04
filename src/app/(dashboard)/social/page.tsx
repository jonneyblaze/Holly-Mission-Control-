"use client";

import { useState, useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  Check,
  Globe,
  Camera,
  Play,
  Sparkles,
  Send,
  RefreshCw,
  AlertCircle,
  Zap,
  Calendar,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { useMCTable, useMCInsert, useMCUpdate } from "@/lib/hooks/use-mission-control";
import { toast } from "sonner";

const INGEST_KEY = "9eRse679@ohyEdCz&UAUL@V9V6t*xW@%47r4vQfFeThowllEBsIv";

interface SocialPost {
  id: string;
  platform: string;
  content: string;
  scheduled_date: string;
  scheduled_time?: string;
  status: "draft" | "approved" | "scheduled" | "posted" | "rejected";
  agent_id?: string;
  buffer_id?: string;
  blog_post_id?: string;
  media_url?: string;
  notes?: string;
  analytics?: { likes?: number; shares?: number; comments?: number; clicks?: number };
  created_at?: string;
}

// Simple markdown-ish rendering for social post content
function renderFormattedContent(text: string) {
  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map((para, i) => {
    // Process inline formatting
    const parts = para.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className={i > 0 ? "mt-3" : ""}>
        {parts.map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={j} className="font-bold text-navy-600">{part.slice(2, -2)}</strong>;
          }
          // Handle single newlines within a paragraph
          const lines = part.split("\n");
          return lines.map((line, k) => (
            <span key={`${j}-${k}`}>
              {k > 0 && <br />}
              {line}
            </span>
          ));
        })}
      </p>
    );
  });
}

interface BufferChannel {
  id: string;
  name: string;
  service: string;
}

const platformConfig: Record<string, { icon: React.ElementType; color: string; bg: string; label: string; charLimit: number }> = {
  linkedin: { icon: Globe, color: "text-blue-600", bg: "bg-blue-50", label: "LinkedIn", charLimit: 3000 },
  instagram: { icon: Camera, color: "text-pink-600", bg: "bg-pink-50", label: "Instagram", charLimit: 2200 },
  tiktok: { icon: () => <span className="text-xs font-bold">TT</span>, color: "text-black", bg: "bg-slate-100", label: "TikTok", charLimit: 2200 },
  youtube: { icon: Play, color: "text-red-600", bg: "bg-red-50", label: "YouTube", charLimit: 5000 },
  twitter: { icon: () => <span className="text-xs font-bold">X</span>, color: "text-black", bg: "bg-slate-100", label: "X / Twitter", charLimit: 280 },
};

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  approved: "bg-teal-100 text-teal-700",
  scheduled: "bg-blue-100 text-blue-700",
  posted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

export default function SocialPage() {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: livePosts, refetch } = useMCTable<SocialPost>("social_posts", {
    limit: 200,
    orderBy: "scheduled_date",
    orderAsc: true,
    realtime: true,
  });
  const { insert, loading: inserting } = useMCInsert("social_posts");
  const { update } = useMCUpdate("social_posts");

  const posts = livePosts;
  const isLive = livePosts.length > 0;

  // Buffer connection status
  const [bufferStatus, setBufferStatus] = useState<{ connected: boolean; channels: number; error?: string } | null>(null);
  const [bufferChannels, setBufferChannels] = useState<BufferChannel[]>([]);

  useEffect(() => {
    fetch("/api/buffer?action=health")
      .then((r) => r.json())
      .then((data) => {
        setBufferStatus(data);
        // If connected, fetch channels
        if (data.connected) {
          fetch("/api/buffer?action=channels")
            .then((r) => r.json())
            .then((d) => setBufferChannels(d.channels || []))
            .catch(() => {});
        }
      })
      .catch(() => setBufferStatus({ connected: false, channels: 0, error: "Failed to check" }));
  }, []);

  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<SocialPost | null>(null);
  const [newPost, setNewPost] = useState({
    platform: "linkedin",
    content: "",
    scheduled_date: format(new Date(), "yyyy-MM-dd"),
  });

  // Approve + schedule to Buffer
  const handleApprove = useCallback(async (post: SocialPost) => {
    if (!isLive) { toast.info("Connect Supabase to approve posts"); return; }

    try {
      // Update status in MC
      await update(post.id, { status: "approved" });

      // Find matching Buffer channel
      const channel = bufferChannels.find(
        (c) => c.service.toLowerCase() === post.platform.toLowerCase()
      );

      if (channel) {
        // Schedule to Buffer
        try {
          const scheduleDate = post.scheduled_date
            ? new Date(`${post.scheduled_date}T${post.scheduled_time || "10:00"}:00Z`).toISOString()
            : undefined;

          const res = await fetch("/api/buffer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channelId: channel.id,
              text: post.content,
              scheduledAt: scheduleDate,
            }),
          });

          if (res.ok) {
            const result = await res.json();
            const bufferId = result.post?.id;
            await update(post.id, {
              status: "scheduled",
              buffer_id: bufferId || null,
              buffer_profile_id: channel.id,
            });
            toast.success(`Approved & scheduled to ${platformConfig[post.platform]?.label || post.platform} via Buffer`);
          } else {
            toast.success("Approved — Buffer scheduling failed, will retry");
          }
        } catch {
          toast.success("Approved — Buffer not reachable, post saved");
        }
      } else {
        toast.success(`Approved — no Buffer channel found for ${post.platform}`);
      }

      refetch();
    } catch {
      toast.error("Failed to approve post");
    }
  }, [isLive, update, refetch, bufferChannels]);

  // Reject post
  const handleReject = useCallback(async (postId: string) => {
    try {
      await update(postId, { status: "rejected" });
      toast.info("Post rejected");
      refetch();
      setShowDetail(null);
    } catch {
      toast.error("Failed to reject");
    }
  }, [update, refetch]);

  // Create new post
  const handleCreate = async () => {
    if (!newPost.content.trim()) return;
    try {
      await insert({
        ...newPost,
        status: "draft",
        agent_id: "manual",
      });
      toast.success("Post created as draft");
      setShowCreate(false);
      setNewPost({ platform: "linkedin", content: "", scheduled_date: format(new Date(), "yyyy-MM-dd") });
      refetch();
    } catch {
      toast.error("Failed to create post");
    }
  };

  // Generate social posts via bl-social
  const [generating, setGenerating] = useState(false);
  const handleGenerateAI = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/trigger-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INGEST_KEY}`,
        },
        body: JSON.stringify({
          agent_id: "bl-social",
          task_title: "Generate this week's social media posts",
          task_description: `Generate social media posts for BodyLytics for the week of ${format(weekStart, "d MMM yyyy")}.\n\nCreate 2-3 posts per platform (LinkedIn, Instagram, TikTok).\nTopics: body language tips, micro-expression insights, sales techniques, deception detection.\nEach post should be platform-appropriate.\nPOST each one to Mission Control /api/ingest with activity_type "social_post" and metadata: { platform: "linkedin|instagram|tiktok", scheduled_date: "YYYY-MM-DD" }`,
        }),
      });

      const result = await res.json();
      toast.success(result.queued ? "Social generation queued" : "bl-social is generating posts!");
    } catch {
      toast.error("Failed to trigger bl-social");
    } finally {
      setGenerating(false);
    }
  };

  // Stats
  const draftCount = posts.filter((p) => p.status === "draft").length;
  const scheduledCount = posts.filter((p) => p.status === "scheduled" || p.status === "approved").length;
  const postedCount = posts.filter((p) => p.status === "posted").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">Social Calendar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {draftCount} drafts awaiting approval &middot; {scheduledCount} scheduled &middot; {postedCount} posted
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Buffer status indicator */}
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border",
            bufferStatus?.connected
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-amber-50 text-amber-700 border-amber-200"
          )}>
            <span className={cn("w-2 h-2 rounded-full", bufferStatus?.connected ? "bg-emerald-500" : "bg-amber-500")} />
            {bufferStatus?.connected
              ? `Buffer (${bufferStatus.channels} channels)`
              : "Buffer not connected"}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateAI}
            disabled={generating}
            className="gap-1.5"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generate with AI
          </Button>
          <Button
            onClick={() => setShowCreate(true)}
            className="bg-teal-500 hover:bg-teal-600 text-white gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Post
          </Button>
        </div>
      </div>

      {/* Buffer not connected warning */}
      {bufferStatus && !bufferStatus.connected && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Buffer API key needed</p>
            <p className="text-xs text-amber-600 mt-1">
              Go to <a href="https://publish.buffer.com/settings/api" target="_blank" rel="noopener noreferrer" className="underline font-medium">publish.buffer.com/settings/api</a> to generate an API key, then update <code className="bg-amber-100 px-1 rounded">BUFFER_ACCESS_TOKEN</code> in your environment variables.
              {bufferStatus.error && <span className="block mt-1 opacity-75">Error: {bufferStatus.error}</span>}
            </p>
          </div>
        </div>
      )}

      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-semibold text-navy-500">
            {format(weekStart, "d MMM")} — {format(addDays(weekStart, 6), "d MMM yyyy")}
          </h2>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Week Grid */}
      <div className="grid grid-cols-7 gap-3">
        {days.map((day) => {
          const dayPosts = posts.filter((p) => p.scheduled_date && isSameDay(new Date(p.scheduled_date), day));
          const isToday = isSameDay(day, new Date());
          return (
            <div key={day.toISOString()} className={cn("min-h-[220px] bg-white rounded-xl border p-3", isToday ? "border-teal-300 bg-teal-50/30" : "border-border")}>
              <div className="text-center mb-2">
                <p className="text-[10px] uppercase text-muted-foreground font-medium">{format(day, "EEE")}</p>
                <p className={cn("text-lg font-montserrat font-bold", isToday ? "text-teal-600" : "text-navy-500")}>{format(day, "d")}</p>
              </div>
              <div className="space-y-2">
                {dayPosts.map((post) => {
                  const platform = platformConfig[post.platform];
                  const PlatformIcon = platform?.icon || Globe;
                  return (
                    <div
                      key={post.id}
                      onClick={() => setShowDetail(post)}
                      className={cn(
                        "p-2 rounded-lg border cursor-pointer hover:shadow-sm transition-all",
                        platform?.bg || "bg-slate-50",
                        "border-transparent hover:border-slate-200"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <PlatformIcon className={cn("w-3 h-3", platform?.color)} />
                          <Badge className={cn("text-[8px] px-1 py-0 h-3.5", statusColors[post.status])}>{post.status}</Badge>
                        </div>
                        {post.status === "draft" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleApprove(post); }}
                            className="p-0.5 rounded hover:bg-teal-200 transition-colors"
                            title="Approve & schedule"
                          >
                            <Check className="w-3 h-3 text-teal-600" />
                          </button>
                        )}
                      </div>
                      {post.media_url && (
                        <div className="rounded overflow-hidden mb-1 -mx-0.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={post.media_url} alt="" className="w-full h-12 object-cover rounded" />
                        </div>
                      )}
                      <p className="text-[10px] text-navy-500 line-clamp-3 leading-tight">{post.content}</p>
                      {post.agent_id && (
                        <p className="text-[8px] text-muted-foreground mt-1 flex items-center gap-0.5">
                          <Zap className="w-2 h-2" />
                          {post.agent_id}
                        </p>
                      )}
                      {post.analytics && (post.analytics.likes || post.analytics.shares || post.analytics.comments) && (
                        <div className="flex gap-2 mt-1 text-[9px] text-muted-foreground">
                          {post.analytics.likes ? <span>{post.analytics.likes} likes</span> : null}
                          {post.analytics.shares ? <span>{post.analytics.shares} shares</span> : null}
                          {post.analytics.comments ? <span>{post.analytics.comments} comments</span> : null}
                        </div>
                      )}
                    </div>
                  );
                })}
                {dayPosts.length === 0 && (
                  <p className="text-[9px] text-muted-foreground text-center py-3 opacity-50">No posts</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unscheduled Posts (no date) */}
      {posts.filter((p) => !p.scheduled_date).length > 0 && (
        <div>
          <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">
            Unscheduled Posts ({posts.filter((p) => !p.scheduled_date).length})
          </h2>
          <div className="grid gap-2">
            {posts.filter((p) => !p.scheduled_date).map((post) => {
              const platform = platformConfig[post.platform];
              const PlatformIcon = platform?.icon || Globe;
              return (
                <div
                  key={post.id}
                  onClick={() => setShowDetail(post)}
                  className="bg-white rounded-xl border border-border p-3 hover:shadow-sm transition-shadow cursor-pointer flex items-start gap-3"
                >
                  <div className={cn("p-2 rounded-lg", platform?.bg || "bg-slate-50")}>
                    <PlatformIcon className={cn("w-4 h-4", platform?.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={cn("text-[10px]", statusColors[post.status])}>{post.status}</Badge>
                      <span className="text-[10px] text-muted-foreground">{platform?.label || post.platform}</span>
                      {post.agent_id && <span className="text-[10px] text-muted-foreground">by {post.agent_id}</span>}
                    </div>
                    <p className="text-xs text-navy-500 line-clamp-2">{post.content}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {post.status === "draft" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleApprove(post); }}
                        className="p-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 transition-colors"
                        title="Approve"
                      >
                        <Check className="w-3.5 h-3.5 text-teal-600" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Post Detail / Edit Modal */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            {/* Fixed header */}
            <div className="flex items-center justify-between p-5 pb-3 border-b border-border/50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-montserrat font-bold text-navy-500">Post Details</h2>
                <Badge className={cn("text-xs", statusColors[showDetail.status])}>{showDetail.status}</Badge>
              </div>
              <button onClick={() => setShowDetail(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X className="w-4 h-4" /></button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* Platform + author */}
              <div className="flex items-center gap-2">
                {(() => {
                  const platform = platformConfig[showDetail.platform];
                  const PIcon = platform?.icon || Globe;
                  return (
                    <>
                      <div className={cn("p-2 rounded-lg", platform?.bg)}>
                        <PIcon className={cn("w-4 h-4", platform?.color)} />
                      </div>
                      <span className="text-sm font-medium">{platform?.label || showDetail.platform}</span>
                    </>
                  );
                })()}
                {showDetail.agent_id && (
                  <span className="text-xs text-muted-foreground ml-auto">Created by {showDetail.agent_id}</span>
                )}
              </div>

              {/* Image / media */}
              {showDetail.media_url && (
                <div className="rounded-lg overflow-hidden border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={showDetail.media_url}
                    alt="Post media"
                    className="w-full h-auto max-h-80 object-cover"
                  />
                </div>
              )}

              {/* Formatted content */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="text-sm text-navy-500 leading-relaxed">
                  {renderFormattedContent(showDetail.content)}
                </div>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200">
                  <p className="text-[10px] text-muted-foreground">
                    {showDetail.content.length} / {platformConfig[showDetail.platform]?.charLimit || "?"} characters
                  </p>
                  {showDetail.content.length > (platformConfig[showDetail.platform]?.charLimit || 9999) && (
                    <p className="text-[10px] text-red-500 font-medium">Over limit!</p>
                  )}
                </div>
              </div>

              {/* Meta info */}
              <div className="space-y-2">
                {showDetail.scheduled_date && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Scheduled: {format(new Date(showDetail.scheduled_date), "EEEE d MMM yyyy")}</span>
                    {showDetail.scheduled_time && <span>at {showDetail.scheduled_time}</span>}
                  </div>
                )}

                {showDetail.blog_post_id && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Linked to blog post</span>
                  </div>
                )}

                {showDetail.notes && (
                  <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                    <p className="text-xs font-medium text-amber-800 mb-1">Notes</p>
                    <p className="text-xs text-amber-700">{showDetail.notes}</p>
                  </div>
                )}
              </div>

              {/* Analytics */}
              {showDetail.analytics && (showDetail.analytics.likes || showDetail.analytics.shares || showDetail.analytics.comments || showDetail.analytics.clicks) && (
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                  <p className="text-xs font-medium text-emerald-800 mb-2">Analytics</p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-emerald-700">{showDetail.analytics.likes || 0}</p>
                      <p className="text-[10px] text-emerald-600">Likes</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-emerald-700">{showDetail.analytics.shares || 0}</p>
                      <p className="text-[10px] text-emerald-600">Shares</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-emerald-700">{showDetail.analytics.comments || 0}</p>
                      <p className="text-[10px] text-emerald-600">Comments</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-emerald-700">{showDetail.analytics.clicks || 0}</p>
                      <p className="text-[10px] text-emerald-600">Clicks</p>
                    </div>
                  </div>
                </div>
              )}

              {showDetail.buffer_id && (
                <p className="text-[10px] text-muted-foreground">Buffer ID: {showDetail.buffer_id}</p>
              )}
            </div>

            {/* Fixed footer with actions */}
            <div className="p-5 pt-3 border-t border-border/50 flex-shrink-0">
              <div className="flex gap-2">
                {showDetail.status === "draft" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleReject(showDetail.id)}
                      className="flex-1 text-red-600 hover:bg-red-50 border-red-200"
                    >
                      <X className="w-4 h-4 mr-1.5" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => { handleApprove(showDetail); setShowDetail(null); }}
                      className="flex-1 bg-teal-500 hover:bg-teal-600 text-white gap-1.5"
                    >
                      <Send className="w-4 h-4" />
                      Approve & Schedule
                    </Button>
                  </>
                )}
                {showDetail.status !== "draft" && (
                  <Button variant="outline" onClick={() => setShowDetail(null)} className="w-full">
                    Close
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Post Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-montserrat font-bold text-navy-500">Create Post</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Platform</label>
                <select
                  value={newPost.platform}
                  onChange={(e) => setNewPost({ ...newPost, platform: e.target.value })}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                >
                  {Object.entries(platformConfig).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Content</label>
                <textarea
                  value={newPost.content}
                  onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                  placeholder="Write your post content..."
                  rows={5}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-none"
                />
                <div className="flex justify-between mt-1">
                  <p className="text-[10px] text-muted-foreground">{newPost.content.length} characters</p>
                  <p className={cn("text-[10px]", newPost.content.length > (platformConfig[newPost.platform]?.charLimit || 9999) ? "text-red-500" : "text-muted-foreground")}>
                    Limit: {platformConfig[newPost.platform]?.charLimit || "?"}
                  </p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Scheduled Date</label>
                <input
                  type="date"
                  value={newPost.scheduled_date}
                  onChange={(e) => setNewPost({ ...newPost, scheduled_date: e.target.value })}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
              </div>
              <Button onClick={handleCreate} disabled={inserting || !newPost.content.trim()} className="w-full bg-teal-500 hover:bg-teal-600 text-white">
                {inserting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Draft
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
