"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, ChevronLeft, ChevronRight, Globe, Camera, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";

interface SocialPost {
  id: string;
  platform: string;
  content: string;
  scheduled_date: string;
  status: "draft" | "approved" | "scheduled" | "posted" | "rejected";
  agent_id?: string;
  analytics?: { likes?: number; shares?: number; comments?: number };
}

const platformConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  linkedin: { icon: Globe, color: "text-blue-600", bg: "bg-blue-50" },
  instagram: { icon: Camera, color: "text-pink-600", bg: "bg-pink-50" },
  tiktok: { icon: () => <span className="text-xs font-bold">TT</span>, color: "text-black", bg: "bg-slate-100" },
  youtube: { icon: Play, color: "text-red-600", bg: "bg-red-50" },
};

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  approved: "bg-teal-100 text-teal-700",
  scheduled: "bg-blue-100 text-blue-700",
  posted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

const demoPosts: SocialPost[] = [
  { id: "1", platform: "linkedin", content: "5 micro-expressions that reveal hidden emotions in negotiations. A thread on reading your counterpart...", scheduled_date: "2026-04-07", status: "approved", agent_id: "bl-social" },
  { id: "2", platform: "instagram", content: "Carousel: The 7 Universal Emotions \u2014 Can you spot them all? Swipe to test your skills \u2192", scheduled_date: "2026-04-07", status: "draft", agent_id: "bl-social" },
  { id: "3", platform: "linkedin", content: "Why 93% of communication is non-verbal (and what that really means for your career)...", scheduled_date: "2026-04-08", status: "scheduled", agent_id: "bl-social" },
  { id: "4", platform: "tiktok", content: "POV: You\u2019re a body language expert at a poker game \ud83c\udfb0 #bodylanguage #microexpressions #poker", scheduled_date: "2026-04-09", status: "draft", agent_id: "bl-social" },
  { id: "5", platform: "instagram", content: "Before & after: How one sales manager transformed her close rate by reading body language cues", scheduled_date: "2026-04-10", status: "draft", agent_id: "bl-social" },
  { id: "6", platform: "linkedin", content: "I've trained 200+ professionals to read body language. Here are the 3 mistakes everyone makes...", scheduled_date: "2026-04-11", status: "posted", analytics: { likes: 142, shares: 23, comments: 18 } },
];

export default function SocialPage() {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">Social Calendar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Plan, approve, and publish via Buffer
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-500" />
            Buffer Connected
          </Button>
          <Button className="bg-teal-500 hover:bg-teal-600 text-white gap-2">
            <Plus className="w-4 h-4" />
            Create Post
          </Button>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="text-sm font-semibold text-navy-500">
          {format(weekStart, "d MMM")} \u2014 {format(addDays(weekStart, 6), "d MMM yyyy")}
        </h2>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Week Grid */}
      <div className="grid grid-cols-7 gap-3">
        {days.map((day) => {
          const dayPosts = demoPosts.filter((p) =>
            isSameDay(new Date(p.scheduled_date), day)
          );
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[200px] bg-white rounded-xl border p-3",
                isToday ? "border-teal-300 bg-teal-50/30" : "border-border"
              )}
            >
              <div className="text-center mb-2">
                <p className="text-[10px] uppercase text-muted-foreground font-medium">
                  {format(day, "EEE")}
                </p>
                <p
                  className={cn(
                    "text-lg font-montserrat font-bold",
                    isToday ? "text-teal-600" : "text-navy-500"
                  )}
                >
                  {format(day, "d")}
                </p>
              </div>
              <div className="space-y-2">
                {dayPosts.map((post) => {
                  const platform = platformConfig[post.platform];
                  const PlatformIcon = platform?.icon || (() => null);
                  return (
                    <div
                      key={post.id}
                      className={cn(
                        "p-2 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow",
                        platform?.bg || "bg-slate-50",
                        "border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <PlatformIcon className={cn("w-3 h-3", platform?.color)} />
                        <Badge
                          className={cn(
                            "text-[8px] px-1 py-0 h-3.5",
                            statusColors[post.status]
                          )}
                        >
                          {post.status}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-navy-500 line-clamp-2 leading-tight">
                        {post.content}
                      </p>
                      {post.analytics && (
                        <div className="flex gap-2 mt-1 text-[9px] text-muted-foreground">
                          <span>{post.analytics.likes} likes</span>
                          <span>{post.analytics.shares} shares</span>
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
    </div>
  );
}
