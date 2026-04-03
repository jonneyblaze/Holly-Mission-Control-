"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Users, ArrowRight } from "lucide-react";
import { useMCTable } from "@/lib/hooks/use-mission-control";
import { useMemo } from "react";

// ---------- Types ----------
interface LeadSnapshot {
  id: string;
  snapshot_date: string;
  total_leads: number;
  by_status: Record<string, number>;
  by_source: Record<string, number>;
  deals_pipeline: Record<string, { count: number; value: number }>;
  total_pipeline_value: number;
  created_at: string;
}

interface FunnelStage {
  stage: string;
  count: number;
  value: string;
  color: string;
}

interface Lead {
  id: string;
  name: string;
  company: string;
  source: string;
  temperature: string;
  lastInteraction: string;
  score: number;
}

// ---------- Demo / fallback data ----------
const DEMO_FUNNEL: FunnelStage[] = [
  { stage: "Lead", count: 45, value: "\u20AC0", color: "bg-slate-200" },
  { stage: "Prospect", count: 18, value: "\u20AC12,600", color: "bg-navy-200" },
  { stage: "Proposal", count: 7, value: "\u20AC9,800", color: "bg-teal-300" },
  { stage: "Negotiation", count: 3, value: "\u20AC5,400", color: "bg-teal-500" },
  { stage: "Won", count: 2, value: "\u20AC3,200", color: "bg-emerald-500" },
];

const DEMO_LEADS: Lead[] = [
  { id: "1", name: "Sarah Chen", company: "Accenture L&D", source: "outbound", temperature: "hot", lastInteraction: "Called yesterday", score: 85 },
  { id: "2", name: "Marcus Weber", company: "SalesForce EU", source: "inbound", temperature: "warm", lastInteraction: "Downloaded whitepaper", score: 65 },
  { id: "3", name: "Ana Rodrigues", company: "IESE Business School", source: "outbound", temperature: "warm", lastInteraction: "LinkedIn connection accepted", score: 55 },
  { id: "4", name: "James Thornton", company: "Deloitte", source: "referral", temperature: "cold", lastInteraction: "No reply (14d)", score: 20 },
  { id: "5", name: "Elena Popova", company: "Booking.com", source: "inbound", temperature: "hot", lastInteraction: "Requested demo", score: 90 },
];

const STAGE_COLORS: Record<string, string> = {
  lead: "bg-slate-200",
  prospect: "bg-navy-200",
  proposal: "bg-teal-300",
  negotiation: "bg-teal-500",
  won: "bg-emerald-500",
};

const STAGE_ORDER = ["lead", "prospect", "proposal", "negotiation", "won"];

const tempColors: Record<string, string> = {
  hot: "bg-red-100 text-red-700",
  warm: "bg-amber-100 text-amber-700",
  cold: "bg-blue-100 text-blue-700",
};

const sourceColors: Record<string, string> = {
  inbound: "bg-teal-100 text-teal-700",
  outbound: "bg-navy-100 text-navy-700",
  referral: "bg-copper-100 text-copper-700",
};

// ---------- Helpers ----------
function formatEuro(value: number): string {
  if (value === 0) return "\u20AC0";
  return "\u20AC" + value.toLocaleString("en-IE");
}

function buildFunnelFromSnapshot(snapshot: LeadSnapshot): FunnelStage[] {
  const pipeline = snapshot.deals_pipeline;
  if (!pipeline || Object.keys(pipeline).length === 0) return DEMO_FUNNEL;

  return STAGE_ORDER.map((key) => {
    const stage = pipeline[key] || { count: 0, value: 0 };
    return {
      stage: key.charAt(0).toUpperCase() + key.slice(1),
      count: stage.count,
      value: formatEuro(stage.value),
      color: STAGE_COLORS[key] || "bg-slate-200",
    };
  });
}

// ---------- Component ----------
export default function PipelinePage() {
  const { data: snapshots, loading } = useMCTable<LeadSnapshot>("lead_snapshots", {
    orderBy: "created_at",
    orderAsc: false,
    limit: 1,
    realtime: true,
  });

  const latestSnapshot = snapshots.length > 0 ? snapshots[0] : null;

  const funnelStages = useMemo<FunnelStage[]>(() => {
    if (!latestSnapshot) return DEMO_FUNNEL;
    return buildFunnelFromSnapshot(latestSnapshot);
  }, [latestSnapshot]);

  const totalPipelineValue = latestSnapshot
    ? formatEuro(Number(latestSnapshot.total_pipeline_value))
    : "\u20AC31,000";

  const totalLeads = latestSnapshot
    ? latestSnapshot.total_leads
    : 45;

  const leads = DEMO_LEADS;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-montserrat font-bold text-navy-500">Sales Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {totalPipelineValue} total pipeline value &middot; {totalLeads} active leads
          {loading && " (loading\u2026)"}
        </p>
      </div>

      {/* Funnel */}
      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-sm font-semibold text-navy-500 mb-4">Pipeline Funnel</h2>
        <div className="flex items-center gap-2">
          {funnelStages.map((stage, i) => (
            <div key={stage.stage} className="flex items-center gap-2 flex-1">
              <div className="flex-1">
                <div
                  className={cn("rounded-lg p-4 text-center", stage.color)}
                  style={{ opacity: 0.6 + i * 0.1 }}
                >
                  <p className="text-2xl font-montserrat font-bold text-navy-500">{stage.count}</p>
                  <p className="text-xs font-semibold text-navy-500">{stage.stage}</p>
                  <p className="text-[10px] text-navy-400 mt-0.5">{stage.value}</p>
                </div>
                {i < funnelStages.length - 1 && (
                  <div className="text-center mt-1">
                    <span className="text-[10px] text-muted-foreground">
                      {stage.count > 0
                        ? Math.round((funnelStages[i + 1].count / stage.count) * 100)
                        : 0}%
                    </span>
                  </div>
                )}
              </div>
              {i < funnelStages.length - 1 && (
                <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Leads Table */}
      <div>
        <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">Active Leads</h2>
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left text-xs font-semibold text-muted-foreground p-3">Name</th>
                <th className="text-left text-xs font-semibold text-muted-foreground p-3">Company</th>
                <th className="text-left text-xs font-semibold text-muted-foreground p-3">Source</th>
                <th className="text-left text-xs font-semibold text-muted-foreground p-3">Temp</th>
                <th className="text-left text-xs font-semibold text-muted-foreground p-3">Last Interaction</th>
                <th className="text-right text-xs font-semibold text-muted-foreground p-3">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-muted/30 transition-colors cursor-pointer">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-navy-100 flex items-center justify-center">
                        <Users className="w-3.5 h-3.5 text-navy-500" />
                      </div>
                      <span className="text-sm font-medium text-navy-500">{lead.name}</span>
                    </div>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{lead.company}</td>
                  <td className="p-3">
                    <Badge className={cn("text-[10px]", sourceColors[lead.source])}>{lead.source}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge className={cn("text-[10px]", tempColors[lead.temperature])}>{lead.temperature}</Badge>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{lead.lastInteraction}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full", lead.score >= 70 ? "bg-teal-500" : lead.score >= 40 ? "bg-amber-500" : "bg-slate-400")}
                          style={{ width: `${lead.score}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-navy-500 w-6">{lead.score}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
