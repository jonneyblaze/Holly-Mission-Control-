"use client";

import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, ChevronLeft, ChevronRight, Globe, Camera, Play, X, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { useMCTable, useMCInsert, useMCUpdate } from "@/lib/hooks/use-mission-control";
import { toast } from "sonner";

interface SocialPost {
  id: string;
  platform: string;
  content: string;
  scheduled_date: string;
  scheduled_time?: string;
  status: "draft" | "approved" | "scheduled" | "posted" | "rejected";
  agent_id?: string;
  buffer_id?: string;
  analytics?: { likes?: number; shares?: number; comments?: number };
}

const platformConfig: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  linkedin: { icon: Globe, color: "text-blue-600", bg: "bg-blue-50", label: "LinkedIn" },
  instagram: { icon: Camera, color: "text-pink-600", bg: "bg-pink-50", label: "Instagram" },
  tiktok: { icon: () => <span className="text-xs font-bold">TT</span>, color: "text-black", bg: "bg-slate-100", label: "TikTok" },
  youtube: { icon: Play, color: "text-red-600", bg: "bg-red-50", label: "YouTube" },
};

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  approved: "bg-teal-100 text-teal-700",
  scheduled: "bg-blue-100 text-blue-700",
  posted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

const fallbackPosts: SocialPost[] = [
  { id: "f1", platform: "linkedin", content: "5 micro-expressions that reveal hidden emotions in negotiations...", scheduled_date: format(addDays(new Date(), 1), "yyyy-MM-dd"), status: "approved", agent_id: "bl-social" },
  { id: "f2", platform: "instagram", content: "Carousel: The 7 Universal Emotions — Can you spot them all?", scheduled_date: format(addDays(new Date(), 1), "yyyy-MM-dd"), status: "draft", agent_id: "bl-social" },
  { id: "f3", platform: "linkedin", content: "Why 93% of communication is non-verbal...", scheduled_date: format(addDays(new Date(), 2), "yyyy-MM-dd"), status: "scheduled", agent_id: "bl-social" },
  { id: "f4", platform: "tiktok", content: "POV: You're a body language expert at a poker game", scheduled_date: format(addDays(new Date(), 3), "yyyy-MM-dd"), status: "draft", agent_id: "bl-social" },
  { id: "f5", platform: "instagram", content: "Before & after: How one sales manager transformed her close rate", scheduled_date: format(addDays(new Date(), 4), "yyyy-MM-dd"), status: "draft", agent_id: "bl-social" },
];

export default function SocialPage() {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: livePosts, refetch } = useMCTable<SocialPost>("social_posts", {
    limit: 100,
    orderBy: "scheduled_date",
    orderAsc: true,
    realtime: true,
  });
  const { insert, loading: inserting } = useMCInsert("social_posts");
  const { update } = useMCUpdate("social_posts");

  const posts = livePosts.length > 0 ? livePosts : fallbackPosts;

  const [showCreate, setShowCreate] = useState(false);
  const [newPost, setNewPost] = useState({
    platform: "linkedin",
    content: "",
    scheduled_date: format(new Date(), "yyyy-MM-dd"),
  });

  const handleApprove = useCallback(async (postId: string) => {
    if (livePosts.length === 0) { toast.info("Connect Supabase to approve posts"); return; }
    try {
      await update(postId, { status: "approved" });
      // In production, this would also POST to /api/buffer to schedule
      toast.success("Post approved — will be sent to Buffer");
      refetch();
    } catch {
      toast.error("Failed to approve post");
    }
  }, [livePosts.length, update, refetch]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">Social Calendar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Plan, approve, and publish via Buffer</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-500" />
            Buffer Connected
          </Button>
          <Button onClick={() => setShowCreate(true)} className="bg-teal-500 hover:bg-teal-600 text-white gap-2">
            <Plus className="w-4 h-4" />
            Create Post
          </Button>
        </div>
      </div>

      {/* Week Navigation */}
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

      {/* Week Grid */}
      <div className="grid grid-cols-7 gap-3">
        {days.map((day) => {
          const dayPosts = posts.filter((p) => isSameDay(new Date(p.scheduled_date), day));
          const isToday = isSameDay(day, new Date());
          return (
            <div key={day.toISOString()} className={cn("min-h-[200px] bg-white rounded-xl border p-3", isToday ? "border-teal-300 bg-teal-50/30" : "border-border")}>
              <div className="text-center mb-2">
                <p className="text-[10px] uppercase text-muted-foreground font-medium">{format(day, "EEE")}</p>
                <p className={cn("text-lg font-montserrat font-bold", isToday ? "text-teal-600" : "text-navy-500")}>{format(day, "d")}</p>
              </div>
              <div className="space-y-2">
                {dayPosts.map((post) => {
                  const platform = platformConfig[post.platform];
                  const PlatformIcon = platform?.icon || (() => null);
                  return (
                    <div key={post.id} className={cn("p-2 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow", platform?.bg || "bg-slate-50", "border-transparent")}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <PlatformIcon className={cn("w-3 h-3", platform?.color)} />
                          <Badge className={cn("text-[8px] px-1 py-0 h-3.5", statusColors[post.status])}>{post.status}</Badge>
                        </div>
                        {post.status === "draft" && (
                          <button onClick={() => handleApprove(post.id)} className="p-0.5 rounded hover:bg-teal-200 transition-colors" title="Approve">
                            <Check className="w-3 h-3 text-teal-600" />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-navy-500 line-clamp-2 leading-tight">{post.content}</p>
                      {post.analytics && (
                        <div className="flex gap-2 mt-1 text-[9px] text-muted-foreground">
                          {post.analytics.likes && <span>{post.analytics.likes} likes</span>}
                          {post.analytics.shares && <span>{post.analytics.shares} shares</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

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
                <p className="text-[10px] text-muted-foreground mt-1">{newPost.content.length} characters</p>
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
