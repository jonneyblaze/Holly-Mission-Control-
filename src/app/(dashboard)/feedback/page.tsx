"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Star, TrendingUp, MessageSquare, Award } from "lucide-react";
import { useMCTable } from "@/lib/hooks/use-mission-control";

// --- Demo / fallback data ---------------------------------------------------

const demoNpsData = {
  overall: 72,
  trend: "+5",
  courses: [
    { name: "NVC for Sales", nps: 82, reviews: 24 },
    { name: "Reading Micro-Expressions", nps: 78, reviews: 18 },
    { name: "Body Language Fundamentals", nps: 65, reviews: 31 },
    { name: "Deception Detection", nps: 58, reviews: 12 },
  ],
};

const demoReviews = [
  { id: "1", student: "Maria G.", course: "NVC for Sales", rating: 5, comment: "Incredibly practical. I used the mirroring techniques in a client meeting the next day and it worked!", date: "2026-04-01", testimonial: true },
  { id: "2", student: "Ahmed K.", course: "Body Language Fundamentals", rating: 4, comment: "Good content but some lessons felt a bit short. Would love more video examples.", date: "2026-03-30", testimonial: false },
  { id: "3", student: "Lisa M.", course: "Reading Micro-Expressions", rating: 5, comment: "Sean's teaching style is brilliant. Clear, practical, evidence-based. Best online course I've taken.", date: "2026-03-28", testimonial: true },
  { id: "4", student: "James T.", course: "Deception Detection", rating: 3, comment: "Interesting but the quiz questions were confusing. Lesson 4 needs more explanation.", date: "2026-03-25", testimonial: false },
  { id: "5", student: "Carlos R.", course: "NVC for Sales", rating: 5, comment: "Worth every cent. My close rate is up 20% since completing this course.", date: "2026-03-22", testimonial: true },
];

// --- Types -------------------------------------------------------------------

interface AgentActivity {
  id: string;
  activity_type: string;
  title?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface Review {
  id: string;
  student: string;
  course: string;
  rating: number;
  comment: string;
  date: string;
  testimonial: boolean;
}

// Activity types we treat as feedback / review entries
const FEEDBACK_TYPES = ["feedback", "review", "testimonial", "nps", "rating"];

function isFeedbackActivity(activity: AgentActivity): boolean {
  const t = (activity.activity_type ?? "").toLowerCase();
  return FEEDBACK_TYPES.some((ft) => t.includes(ft));
}

/** Map an agent_activity row into the Review shape used by the UI */
function activityToReview(a: AgentActivity): Review {
  const meta = (a.metadata ?? {}) as Record<string, unknown>;
  return {
    id: a.id,
    student: (meta.student as string) ?? (meta.user as string) ?? "Anonymous",
    course: (meta.course as string) ?? (a.title as string) ?? "Unknown Course",
    rating: typeof meta.rating === "number" ? meta.rating : 4,
    comment: (meta.comment as string) ?? (a.description as string) ?? "",
    date: a.created_at ? a.created_at.slice(0, 10) : "",
    testimonial: Boolean(meta.testimonial),
  };
}

// --- Components --------------------------------------------------------------

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn("w-3.5 h-3.5", s <= rating ? "text-amber-400 fill-amber-400" : "text-slate-200")}
        />
      ))}
    </div>
  );
}

// --- Page --------------------------------------------------------------------

export default function FeedbackPage() {
  const { data: activities, loading } = useMCTable<AgentActivity>("agent_activity", {
    limit: 100,
    orderBy: "created_at",
    orderAsc: false,
    realtime: true,
  });

  // Filter client-side for feedback/review-related activity
  const liveReviews = useMemo(
    () => activities.filter(isFeedbackActivity).map(activityToReview),
    [activities]
  );

  // Use live data when available; otherwise fall back to demo data
  const reviews: Review[] = liveReviews.length > 0 ? liveReviews : demoReviews;
  const npsData = demoNpsData; // NPS always uses demo data (no live source yet)

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-montserrat font-bold text-navy-500">Feedback & Reviews</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Student satisfaction, NPS scores, and testimonial opportunities
        </p>
      </div>

      {/* NPS Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-border p-6 flex flex-col items-center justify-center">
          <p className="text-xs text-muted-foreground font-medium mb-1">Overall NPS</p>
          <p className="text-4xl font-montserrat font-bold text-teal-500">{npsData.overall}</p>
          <div className="flex items-center gap-1 mt-1 text-emerald-600">
            <TrendingUp className="w-3 h-3" />
            <span className="text-xs font-medium">{npsData.trend} this month</span>
          </div>
        </div>
        {npsData.courses.map((course) => (
          <div key={course.name} className="bg-white rounded-xl border border-border p-4">
            <p className="text-sm font-semibold text-navy-500 mb-1">{course.name}</p>
            <div className="flex items-baseline gap-2">
              <span className={cn("text-2xl font-montserrat font-bold", course.nps >= 70 ? "text-teal-500" : course.nps >= 50 ? "text-amber-500" : "text-red-500")}>
                {course.nps}
              </span>
              <span className="text-xs text-muted-foreground">NPS</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{course.reviews} reviews</p>
          </div>
        ))}
      </div>

      {/* Reviews */}
      <div>
        <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">Recent Reviews</h2>
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
              Loading feedback...
            </div>
          ) : (
            reviews.map((review) => (
              <div key={review.id} className="bg-white rounded-xl border border-border p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-navy-100 flex items-center justify-center">
                      <MessageSquare className="w-3.5 h-3.5 text-navy-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-navy-500">{review.student}</p>
                      <p className="text-xs text-muted-foreground">{review.course} &middot; {review.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StarRating rating={review.rating} />
                    {review.testimonial && (
                      <Badge className="bg-amber-100 text-amber-700 text-[10px] gap-1">
                        <Award className="w-3 h-3" />
                        Testimonial
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="text-sm text-foreground leading-relaxed pl-11">{review.comment}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
