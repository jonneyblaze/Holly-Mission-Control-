"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BookOpen, AlertCircle, CheckCircle2, Clock, Bot, Loader2 } from "lucide-react";
import { useMCTable } from "@/lib/hooks/use-mission-control";
import { useBodylyticsTable } from "@/lib/hooks/use-bodylytics";

// ── Types ────────────────────────────────────────────────────────────────────

interface KBGapRow {
  id: string;
  topic: string;
  occurrence_count: number;
  status: string;
  drafted_by?: string | null;
  created_at: string;
}

interface SupportTicketRow {
  id: string;
  subject: string;
  status: string; // open | closed | escalated
  created_at: string;
  student_name?: string | null;
  response?: string | null;
  responded_by?: string | null;
  response_time?: string | null;
}

// ── Config ───────────────────────────────────────────────────────────────────

const statusConfig: Record<string, { color: string; icon: React.ElementType }> = {
  open: { color: "bg-amber-100 text-amber-700", icon: AlertCircle },
  answered: { color: "bg-teal-100 text-teal-700", icon: CheckCircle2 },
  escalated: { color: "bg-red-100 text-red-700", icon: AlertCircle },
  closed: { color: "bg-slate-100 text-slate-600", icon: CheckCircle2 },
};

const kbStatusColors: Record<string, string> = {
  identified: "bg-amber-100 text-amber-700",
  drafting: "bg-blue-100 text-blue-700",
  published: "bg-emerald-100 text-emerald-700",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SupportPage() {
  // Live ticket data from BodyLytics via proxy
  const {
    data: liveTicketRows,
    loading: ticketsLoading,
    error: ticketsError,
  } = useBodylyticsTable<SupportTicketRow>(
    "support_tickets",
    "*",
    50,
    { refreshInterval: 30_000 }
  );

  // KB gaps from Mission Control's own Supabase
  const { data: liveKBGaps, loading: kbLoading } = useMCTable<KBGapRow>("kb_gaps", {
    realtime: true,
    orderBy: "occurrence_count",
    orderAsc: false,
  });

  // Map live BodyLytics rows into display shape
  const tickets = useMemo(
    () =>
      (liveTicketRows ?? []).map((t) => ({
        id: String(t.id),
        subject: t.subject,
        status: t.status,
        priority: t.status === "escalated" ? "high" : "medium",
        student: t.student_name ?? "Unknown",
        created: t.created_at ? timeAgo(t.created_at) : "\u2014",
        repliedBy: t.responded_by ?? null,
        autoReplied: !!t.responded_by && t.responded_by !== "sean",
        responseTime: t.response_time ?? null,
      })),
    [liveTicketRows]
  );

  const kbGaps = useMemo(
    () =>
      liveKBGaps.map((g) => ({
        topic: g.topic,
        occurrences: g.occurrence_count,
        status: g.status,
        draftedBy: g.drafted_by ?? undefined,
      })),
    [liveKBGaps]
  );

  const openCount = tickets.filter((t) => t.status === "open" || t.status === "escalated").length;
  const autoRepliedCount = tickets.filter((t) => t.autoReplied).length;
  const escalatedCount = tickets.filter((t) => t.status === "escalated").length;

  // Show a single loading spinner until BOTH sources have finished their initial fetch
  if (ticketsLoading || kbLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Loading support data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">Support</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {ticketsError
              ? "Could not load tickets from BodyLytics"
              : tickets.length > 0
                ? <>{openCount} open &middot; {autoRepliedCount} auto-replied</>
                : "No tickets yet"
            }
          </p>
        </div>
      </div>

      {/* Stats Row — only show if we have ticket data */}
      {tickets.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Open", value: tickets.filter((t) => t.status === "open").length, icon: AlertCircle, color: "text-amber-500" },
            { label: "Auto-Replied", value: autoRepliedCount, icon: Bot, color: "text-teal-500" },
            { label: "Escalated", value: escalatedCount, icon: AlertCircle, color: "text-red-500" },
            { label: "Avg Response", value: "2.1h", icon: Clock, color: "text-navy-400" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-border p-4 flex items-center gap-3">
              <stat.icon className={cn("w-5 h-5", stat.color)} />
              <div>
                <p className="text-xl font-montserrat font-bold text-navy-500">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tickets Table */}
      <div>
        <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">Recent Tickets</h2>
        {ticketsError ? (
          <div className="bg-white rounded-xl border border-border p-8 text-center">
            <AlertCircle className="w-5 h-5 text-amber-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Could not connect to BodyLytics. Tickets will appear once the connection is restored.
            </p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="bg-white rounded-xl border border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No support tickets yet. Tickets will appear when students submit them.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left text-xs font-semibold text-muted-foreground p-3">#</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground p-3">Subject</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground p-3">Student</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground p-3">Status</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground p-3">Replied By</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground p-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tickets.map((ticket) => {
                  const config = statusConfig[ticket.status] ?? statusConfig.open;
                  return (
                    <tr key={ticket.id} className="hover:bg-muted/30 transition-colors cursor-pointer">
                      <td className="p-3 text-sm text-muted-foreground">#{ticket.id}</td>
                      <td className="p-3">
                        <span className="text-sm font-medium text-navy-500">{ticket.subject}</span>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">{ticket.student}</td>
                      <td className="p-3">
                        <Badge className={cn("text-[10px] gap-1", config.color)}>
                          <config.icon className="w-3 h-3" />
                          {ticket.status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {ticket.autoReplied ? (
                          <div className="flex items-center gap-1 text-xs text-teal-600">
                            <Bot className="w-3 h-3" />
                            Auto
                          </div>
                        ) : ticket.status === "escalated" ? (
                          <span className="text-xs text-red-500 font-medium">Needs Sean</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        )}
                      </td>
                      <td className="p-3 text-right text-xs text-muted-foreground">{ticket.created}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* KB Gaps */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-5 h-5 text-navy-400" />
          <h2 className="text-lg font-montserrat font-semibold text-navy-500">Knowledge Base Gaps</h2>
        </div>
        <div className="bg-white rounded-xl border border-border divide-y">
          {kbGaps.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No KB gaps identified yet. The support agent will flag these during ticket triage.
            </div>
          ) : (
            kbGaps.map((gap) => (
              <div key={gap.topic} className="flex items-center gap-4 p-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-navy-500">{gap.topic}</p>
                  <p className="text-xs text-muted-foreground">{gap.occurrences} occurrences in tickets</p>
                </div>
                <Badge className={cn("text-[10px]", kbStatusColors[gap.status] ?? "bg-slate-100 text-slate-600")}>{gap.status}</Badge>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
