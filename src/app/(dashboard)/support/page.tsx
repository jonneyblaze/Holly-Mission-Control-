"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BookOpen, AlertCircle, CheckCircle2, Clock, Bot } from "lucide-react";

const tickets = [
  { id: "47", subject: "Can't reset my password", status: "answered", priority: "low", student: "Maria G.", created: "2h ago", repliedBy: "bl-support", autoReplied: true },
  { id: "46", subject: "Certificate not showing after completion", status: "open", priority: "medium", student: "Ahmed K.", created: "4h ago", repliedBy: null, autoReplied: false },
  { id: "45", subject: "Request for refund - NVC course", status: "escalated", priority: "high", student: "John D.", created: "6h ago", repliedBy: null, autoReplied: false },
  { id: "44", subject: "Video not loading in lesson 3", status: "answered", priority: "medium", student: "Lisa M.", created: "1d ago", repliedBy: "bl-support", autoReplied: true },
  { id: "43", subject: "How do I enroll in a second course?", status: "closed", priority: "low", student: "Carlos R.", created: "2d ago", repliedBy: "bl-support", autoReplied: true },
];

const kbGaps = [
  { topic: "Certificate download issues", occurrences: 5, status: "drafting", draftedBy: "bl-support" },
  { topic: "Video playback troubleshooting", occurrences: 3, status: "identified" },
  { topic: "Course enrollment process", occurrences: 3, status: "published" },
  { topic: "Referral code usage", occurrences: 2, status: "identified" },
];

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

export default function SupportPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">Support</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tickets.filter(t => t.status === "open" || t.status === "escalated").length} open &middot;
            Avg response: 2.1h &middot; 3 auto-replied today
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Open", value: 2, icon: AlertCircle, color: "text-amber-500" },
          { label: "Auto-Replied", value: 3, icon: Bot, color: "text-teal-500" },
          { label: "Escalated", value: 1, icon: AlertCircle, color: "text-red-500" },
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

      {/* Tickets Table */}
      <div>
        <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">Recent Tickets</h2>
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
                const config = statusConfig[ticket.status];
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
      </div>

      {/* KB Gaps */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-5 h-5 text-navy-400" />
          <h2 className="text-lg font-montserrat font-semibold text-navy-500">Knowledge Base Gaps</h2>
        </div>
        <div className="bg-white rounded-xl border border-border divide-y">
          {kbGaps.map((gap) => (
            <div key={gap.topic} className="flex items-center gap-4 p-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-navy-500">{gap.topic}</p>
                <p className="text-xs text-muted-foreground">{gap.occurrences} occurrences in tickets</p>
              </div>
              <Badge className={cn("text-[10px]", kbStatusColors[gap.status])}>{gap.status}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
