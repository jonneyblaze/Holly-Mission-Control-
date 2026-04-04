"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Star,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  Award,
  ThumbsUp,
  Minus,
  ThumbsDown,
  Bot,
  Loader2,
  BarChart3,
  BookOpen,
  MonitorSmartphone,
  Headphones,
  Coins,
} from "lucide-react";
import { useBodylyticsRpc } from "@/lib/hooks/use-bodylytics";
import { useMCTable } from "@/lib/hooks/use-mission-control";
import { toast } from "sonner";

// ---------- Types ----------
interface FeedbackDashboard {
  nps_score?: number;
  nps_trend?: number;
  course_ratings?: CourseRating[];
  recent_reviews?: ReviewData[];
  feedback_categories?: CategoryData[];
  total_reviews?: number;
  avg_rating?: number;
}

interface CourseRating {
  course_name: string;
  avg_rating: number;
  review_count: number;
  trend?: number;
}

interface ReviewData {
  id: string;
  student_name: string;
  course_name: string;
  rating: number;
  comment: string;
  created_at: string;
  is_testimonial?: boolean;
}

interface CategoryData {
  category: string;
  count: number;
  avg_sentiment: number;
}

interface AgentActivity {
  id: string;
  activity_type: string;
  title?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ---------- Constants ----------
const INGEST_KEY = "9eRse679@ohyEdCz&UAUL@V9V6t*xW@%47r4vQfFeThowllEBsIv";

const FEEDBACK_TYPES = ["feedback", "review", "testimonial", "nps", "rating"];

const CATEGORY_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string }
> = {
  "Content Quality": { icon: BookOpen, color: "text-teal-500" },
  "Platform UX": { icon: MonitorSmartphone, color: "text-navy-500" },
  Support: { icon: Headphones, color: "text-amber-500" },
  "Value for Money": { icon: Coins, color: "text-emerald-500" },
};

// ---------- Helpers ----------
function isFeedbackActivity(activity: AgentActivity): boolean {
  const t = (activity.activity_type ?? "").toLowerCase();
  return FEEDBACK_TYPES.some((ft) => t.includes(ft));
}

function activityToReview(a: AgentActivity): ReviewData {
  const meta = (a.metadata ?? {}) as Record<string, unknown>;
  return {
    id: a.id,
    student_name:
      (meta.student as string) ?? (meta.user as string) ?? "Anonymous",
    course_name:
      (meta.course as string) ?? (a.title as string) ?? "Unknown Course",
    rating: typeof meta.rating === "number" ? meta.rating : 4,
    comment: (meta.comment as string) ?? (a.description as string) ?? "",
    created_at: a.created_at ? a.created_at.slice(0, 10) : "",
    is_testimonial: Boolean(meta.testimonial),
  };
}

function getSentiment(rating: number): {
  label: string;
  icon: React.ElementType;
  color: string;
} {
  if (rating >= 4) return { label: "Positive", icon: ThumbsUp, color: "text-emerald-500" };
  if (rating === 3) return { label: "Neutral", icon: Minus, color: "text-amber-500" };
  return { label: "Negative", icon: ThumbsDown, color: "text-red-500" };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------- Sub-components ----------

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const dim = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(
            dim,
            s <= Math.round(rating)
              ? "text-amber-400 fill-amber-400"
              : "text-slate-200"
          )}
        />
      ))}
    </div>
  );
}

function NpsGauge({ score, trend }: { score: number; trend: number | null }) {
  const color =
    score >= 50
      ? "text-emerald-500"
      : score >= 20
        ? "text-amber-500"
        : "text-red-500";
  const label =
    score >= 50 ? "Excellent" : score >= 20 ? "Good" : "Needs Improvement";

  return (
    <div className="bg-white rounded-xl border border-border p-6 flex flex-col items-center justify-center">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Net Promoter Score
      </p>
      <div className="relative w-28 h-28 flex items-center justify-center">
        <svg className="absolute inset-0 w-28 h-28" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={
              score >= 50 ? "#059669" : score >= 20 ? "#d97706" : "#ef4444"
            }
            strokeWidth="8"
            strokeDasharray={`${Math.max(0, Math.min(100, score)) * 2.64} 264`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            className="transition-all duration-700"
          />
        </svg>
        <span className={cn("text-3xl font-montserrat font-bold", color)}>
          {score}
        </span>
      </div>
      <p className="text-xs font-medium text-muted-foreground mt-2">{label}</p>
      {trend !== null && (
        <div
          className={cn(
            "flex items-center gap-1 mt-1 text-xs font-medium",
            trend >= 0 ? "text-emerald-600" : "text-red-500"
          )}
        >
          {trend >= 0 ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          {trend >= 0 ? "+" : ""}
          {trend} this month
        </div>
      )}
    </div>
  );
}

function CourseRatingCard({ course }: { course: CourseRating }) {
  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <p className="text-sm font-semibold text-navy-500 mb-2 truncate">
        {course.course_name}
      </p>
      <div className="flex items-center gap-2 mb-1.5">
        <StarRating rating={course.avg_rating} size="md" />
        <span className="text-lg font-montserrat font-bold text-navy-500">
          {course.avg_rating.toFixed(1)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {course.review_count} review{course.review_count !== 1 ? "s" : ""}
        </span>
        {course.trend !== undefined && course.trend !== 0 && (
          <div
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium",
              course.trend > 0 ? "text-emerald-600" : "text-red-500"
            )}
          >
            {course.trend > 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {course.trend > 0 ? "+" : ""}
            {course.trend.toFixed(1)}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Main page ----------
export default function FeedbackPage() {
  const [triggeringAgent, setTriggeringAgent] = useState<string | null>(null);

  // Primary data source: BodyLytics feedback dashboard
  const {
    data: feedbackDashboard,
    loading: fbLoading,
    error: fbError,
  } = useBodylyticsRpc<FeedbackDashboard>("get_feedback_dashboard", {
    refreshInterval: 60_000,
  });

  // Fallback data source: agent_activity feedback entries
  const { data: activities, loading: activitiesLoading } =
    useMCTable<AgentActivity>("agent_activity", {
      limit: 100,
      orderBy: "created_at",
      orderAsc: false,
      realtime: true,
    });

  const loading = fbLoading || activitiesLoading;

  // Fallback reviews from agent_activity
  const fallbackReviews = useMemo(
    () => activities.filter(isFeedbackActivity).map(activityToReview),
    [activities]
  );

  // Use RPC data when available, fall back to agent_activity data
  const reviews: ReviewData[] =
    feedbackDashboard?.recent_reviews && feedbackDashboard.recent_reviews.length > 0
      ? feedbackDashboard.recent_reviews
      : fallbackReviews;

  // NPS score
  const npsScore = feedbackDashboard?.nps_score ?? null;
  const npsTrend = feedbackDashboard?.nps_trend ?? null;

  // Compute NPS from reviews if RPC doesn't provide it
  const computedNps = useMemo(() => {
    if (npsScore !== null) return npsScore;
    if (reviews.length === 0) return null;
    const promoters = reviews.filter((r) => r.rating >= 4).length;
    const detractors = reviews.filter((r) => r.rating <= 2).length;
    const total = reviews.length;
    return Math.round(((promoters - detractors) / total) * 100);
  }, [npsScore, reviews]);

  // Course ratings: from RPC or computed from reviews
  const courseRatings: CourseRating[] = useMemo(() => {
    if (
      feedbackDashboard?.course_ratings &&
      feedbackDashboard.course_ratings.length > 0
    ) {
      return feedbackDashboard.course_ratings;
    }
    // Compute from reviews
    const courseMap = new Map<
      string,
      { totalRating: number; count: number }
    >();
    reviews.forEach((r) => {
      const existing = courseMap.get(r.course_name) ?? {
        totalRating: 0,
        count: 0,
      };
      existing.totalRating += r.rating;
      existing.count += 1;
      courseMap.set(r.course_name, existing);
    });
    return Array.from(courseMap.entries()).map(([name, data]) => ({
      course_name: name,
      avg_rating: data.totalRating / data.count,
      review_count: data.count,
    }));
  }, [feedbackDashboard, reviews]);

  // Feedback categories: from RPC or derived from reviews
  const categories: CategoryData[] = useMemo(() => {
    if (
      feedbackDashboard?.feedback_categories &&
      feedbackDashboard.feedback_categories.length > 0
    ) {
      return feedbackDashboard.feedback_categories;
    }
    // Derive approximate categories from reviews
    if (reviews.length === 0) return [];
    const cats = [
      { category: "Content Quality", count: 0, totalRating: 0 },
      { category: "Platform UX", count: 0, totalRating: 0 },
      { category: "Support", count: 0, totalRating: 0 },
      { category: "Value for Money", count: 0, totalRating: 0 },
    ];
    // Distribute all reviews across Content Quality as default category
    reviews.forEach((r) => {
      const text = (r.comment || "").toLowerCase();
      if (
        text.includes("platform") ||
        text.includes("ux") ||
        text.includes("site") ||
        text.includes("interface") ||
        text.includes("navigate")
      ) {
        cats[1].count++;
        cats[1].totalRating += r.rating;
      } else if (
        text.includes("support") ||
        text.includes("help") ||
        text.includes("response")
      ) {
        cats[2].count++;
        cats[2].totalRating += r.rating;
      } else if (
        text.includes("price") ||
        text.includes("value") ||
        text.includes("worth") ||
        text.includes("money") ||
        text.includes("cent")
      ) {
        cats[3].count++;
        cats[3].totalRating += r.rating;
      } else {
        cats[0].count++;
        cats[0].totalRating += r.rating;
      }
    });
    return cats
      .filter((c) => c.count > 0)
      .map((c) => ({
        category: c.category,
        count: c.count,
        avg_sentiment: c.totalRating / c.count,
      }));
  }, [feedbackDashboard, reviews]);

  // Summary stats
  const totalReviews =
    feedbackDashboard?.total_reviews ?? reviews.length;
  const avgRating =
    feedbackDashboard?.avg_rating ??
    (reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0);

  // Trigger agent action
  const triggerAgent = async (
    agentId: string,
    title: string,
    description: string
  ) => {
    setTriggeringAgent(agentId);
    try {
      const res = await fetch("/api/trigger-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INGEST_KEY}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          task_title: title,
          task_description: description,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.message || "Agent triggered successfully");
      } else {
        toast.error(data.error || "Failed to trigger agent");
      }
    } catch {
      toast.error("Network error triggering agent");
    } finally {
      setTriggeringAgent(null);
    }
  };

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">
            Feedback & Reviews
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Student satisfaction, ratings, and feedback analysis
            {loading && " (loading...)"}
            {fbError && (
              <span className="text-red-500 ml-2">
                RPC error (using fallback data)
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            disabled={triggeringAgent === "holly"}
            onClick={() =>
              triggerAgent(
                "holly",
                "Analyze Feedback Trends",
                "Analyze recent student feedback and reviews for BodyLytics courses. Identify common themes, sentiment patterns, and actionable insights. Summarize findings in a report."
              )
            }
          >
            {triggeringAgent === "holly" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <BarChart3 className="w-3.5 h-3.5" />
            )}
            Analyze Trends
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            disabled={triggeringAgent === "bl-support"}
            onClick={() =>
              triggerAgent(
                "bl-support",
                "Generate Response Templates",
                "Generate response templates for common student feedback themes. Include templates for positive reviews (thank you), constructive feedback (action plan), and negative reviews (resolution offer)."
              )
            }
          >
            {triggeringAgent === "bl-support" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Bot className="w-3.5 h-3.5" />
            )}
            Response Templates
          </Button>
        </div>
      </div>

      {/* NPS + Summary Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* NPS Gauge */}
        {computedNps !== null ? (
          <NpsGauge score={computedNps} trend={npsTrend} />
        ) : (
          <div className="bg-white rounded-xl border border-border p-6 flex flex-col items-center justify-center">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Net Promoter Score
            </p>
            <p className="text-sm text-muted-foreground">
              {loading ? "Loading..." : "No data yet"}
            </p>
          </div>
        )}

        {/* Summary stat cards */}
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Total Reviews
          </p>
          <p className="text-3xl font-montserrat font-bold text-navy-500">
            {totalReviews}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Across {courseRatings.length} course{courseRatings.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Average Rating
          </p>
          <div className="flex items-center gap-2">
            <p className="text-3xl font-montserrat font-bold text-navy-500">
              {avgRating > 0 ? avgRating.toFixed(1) : "--"}
            </p>
            {avgRating > 0 && <StarRating rating={avgRating} size="md" />}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Out of 5.0</p>
        </div>

        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Sentiment Breakdown
          </p>
          <div className="space-y-1.5 mt-1">
            {[
              {
                label: "Positive",
                count: reviews.filter((r) => r.rating >= 4).length,
                color: "bg-emerald-400",
              },
              {
                label: "Neutral",
                count: reviews.filter((r) => r.rating === 3).length,
                color: "bg-amber-400",
              },
              {
                label: "Negative",
                count: reviews.filter((r) => r.rating <= 2).length,
                color: "bg-red-400",
              },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", s.color)} />
                <span className="text-xs text-muted-foreground flex-1">
                  {s.label}
                </span>
                <span className="text-xs font-semibold text-navy-500">
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Course Ratings */}
      {courseRatings.length > 0 && (
        <div>
          <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">
            Course Ratings
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {courseRatings.map((course) => (
              <CourseRatingCard key={course.course_name} course={course} />
            ))}
          </div>
        </div>
      )}

      {/* Feedback Categories + Recent Reviews */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Categories */}
        <div className="bg-white rounded-xl border border-border p-6">
          <h2 className="text-sm font-semibold text-navy-500 mb-4">
            Feedback Categories
          </h2>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {loading ? "Loading..." : "No categorized feedback yet"}
            </p>
          ) : (
            <div className="space-y-4">
              {categories.map((cat) => {
                const config = CATEGORY_CONFIG[cat.category] ?? {
                  icon: MessageSquare,
                  color: "text-slate-500",
                };
                const CatIcon = config.icon;
                const sentimentLabel =
                  cat.avg_sentiment >= 4
                    ? "Positive"
                    : cat.avg_sentiment >= 3
                      ? "Neutral"
                      : "Needs Attention";
                const sentimentColor =
                  cat.avg_sentiment >= 4
                    ? "text-emerald-600"
                    : cat.avg_sentiment >= 3
                      ? "text-amber-600"
                      : "text-red-600";
                const maxCount = Math.max(...categories.map((c) => c.count), 1);
                const barPct = Math.round((cat.count / maxCount) * 100);

                return (
                  <div key={cat.category} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <CatIcon className={cn("w-4 h-4", config.color)} />
                      <span className="text-sm font-medium text-navy-500 flex-1">
                        {cat.category}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {cat.count}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          cat.avg_sentiment >= 4
                            ? "bg-emerald-400"
                            : cat.avg_sentiment >= 3
                              ? "bg-amber-400"
                              : "bg-red-400"
                        )}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <p className={cn("text-[11px] font-medium", sentimentColor)}>
                      {sentimentLabel} (avg {cat.avg_sentiment.toFixed(1)}/5)
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Reviews */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-navy-500 mb-4">
            Recent Reviews
          </h2>
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {loading && reviews.length === 0 ? (
              <div className="bg-white rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
                Loading feedback...
              </div>
            ) : reviews.length === 0 ? (
              <div className="bg-white rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
                No reviews yet
              </div>
            ) : (
              reviews.map((review) => {
                const sentiment = getSentiment(review.rating);
                const SentimentIcon = sentiment.icon;
                return (
                  <div
                    key={review.id}
                    className="bg-white rounded-xl border border-border p-4"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-navy-100 flex items-center justify-center">
                          <MessageSquare className="w-3.5 h-3.5 text-navy-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-navy-500">
                            {review.student_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {review.course_name} &middot;{" "}
                            {formatDate(review.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StarRating rating={review.rating} />
                        <Badge
                          className={cn(
                            "text-[10px] gap-1",
                            review.rating >= 4
                              ? "bg-emerald-100 text-emerald-700"
                              : review.rating === 3
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                          )}
                        >
                          <SentimentIcon className="w-3 h-3" />
                          {sentiment.label}
                        </Badge>
                        {review.is_testimonial && (
                          <Badge className="bg-amber-100 text-amber-700 text-[10px] gap-1">
                            <Award className="w-3 h-3" />
                            Testimonial
                          </Badge>
                        )}
                      </div>
                    </div>
                    {review.comment && (
                      <p className="text-sm text-foreground leading-relaxed pl-11">
                        {review.comment}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
