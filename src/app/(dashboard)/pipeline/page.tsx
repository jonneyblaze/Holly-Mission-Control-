"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Megaphone,
  Sparkles,
  Filter,
  ArrowDownRight,
  Loader2,
} from "lucide-react";
import {
  useBodylyticsRpc,
  useBodylyticsTable,
} from "@/lib/hooks/use-bodylytics";
import { toast } from "sonner";

// ---------- Types ----------
interface PipelineStage {
  stage: string;
  count: number;
}

interface DashboardV2 {
  crm_pipeline: PipelineStage[];
  revenue: { total_revenue: number; monthly_revenue: number };
  students: {
    total_students: number;
    new_students: number;
    active_students: number;
  };
  get_sales_funnel?: { stage: string; count: number }[];
}

interface CrmContact {
  id: string;
  email: string;
  full_name: string;
  crm_status: string;
  crm_source: string;
  total_paid_amount: number;
  total_courses_enrolled: number;
  created_at: string;
}

// ---------- Constants ----------
const INGEST_KEY = "9eRse679@ohyEdCz&UAUL@V9V6t*xW@%47r4vQfFeThowllEBsIv";

const FUNNEL_STAGES = ["lead", "prospect", "customer"] as const;

const FUNNEL_COLORS: Record<string, { bg: string; bar: string }> = {
  lead: { bg: "bg-slate-100", bar: "bg-slate-400" },
  prospect: { bg: "bg-teal-50", bar: "bg-teal-400" },
  customer: { bg: "bg-emerald-50", bar: "bg-emerald-500" },
  inactive: { bg: "bg-red-50", bar: "bg-red-300" },
};

const STATUS_BADGE: Record<string, string> = {
  lead: "bg-slate-100 text-slate-700",
  prospect: "bg-teal-100 text-teal-700",
  qualified: "bg-teal-200 text-teal-800",
  customer: "bg-emerald-100 text-emerald-700",
  inactive: "bg-red-100 text-red-700",
  churned: "bg-red-100 text-red-700",
};

const SOURCE_BADGE: Record<string, string> = {
  lead_magnet: "bg-purple-100 text-purple-700",
  quiz: "bg-amber-100 text-amber-700",
  referral: "bg-copper-100 text-copper-700",
  organic: "bg-emerald-100 text-emerald-700",
  outbound: "bg-navy-100 text-navy-700",
  website_form: "bg-teal-100 text-teal-700",
  inbound: "bg-blue-100 text-blue-700",
};

const SOURCE_LABELS: Record<string, string> = {
  lead_magnet: "Lead Magnet",
  quiz: "Quiz",
  referral: "Referral",
  organic: "Organic",
  outbound: "Outbound",
  website_form: "Website Form",
  inbound: "Inbound",
};

const FILTER_TABS = ["all", "lead", "prospect", "customer"] as const;

// ---------- Helpers ----------
function formatEuro(value: number): string {
  if (value === 0) return "\u20AC0";
  return "\u20AC" + value.toLocaleString("en-IE");
}

function capitalize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysAgo(iso: string): number {
  return Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)
  );
}

// ---------- Sub-components ----------

function FunnelBar({
  label,
  count,
  total,
  conversionPct,
  color,
  widthPct,
}: {
  label: string;
  count: number;
  total: number;
  conversionPct: number | null;
  color: { bg: string; bar: string };
  widthPct: number;
}) {
  const pctOfTotal = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-navy-500">
          {capitalize(label)}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-lg font-montserrat font-bold text-navy-500">
            {count}
          </span>
          <span className="text-xs text-muted-foreground">({pctOfTotal}%)</span>
        </div>
      </div>
      <div className={cn("rounded-lg h-10 transition-all", color.bg)}>
        <div
          className={cn("h-full rounded-lg flex items-center justify-end pr-3", color.bar)}
          style={{ width: `${widthPct}%`, minWidth: count > 0 ? "2rem" : "0" }}
        >
          {count > 0 && (
            <span className="text-xs font-bold text-white">{count}</span>
          )}
        </div>
      </div>
      {conversionPct !== null && (
        <div className="flex items-center gap-1 justify-center">
          <ArrowDownRight className="w-3 h-3 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground font-medium">
            {conversionPct}% conversion
          </span>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  trend?: { value: string; positive: boolean } | null;
}) {
  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center">
          <Icon className="w-4 h-4 text-navy-500" />
        </div>
      </div>
      <p className="text-2xl font-montserrat font-bold text-navy-500">
        {value}
      </p>
      <div className="flex items-center gap-2 mt-1">
        {trend && (
          <div
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium",
              trend.positive ? "text-emerald-600" : "text-red-500"
            )}
          >
            {trend.positive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {trend.value}
          </div>
        )}
        {sub && (
          <span className="text-xs text-muted-foreground">{sub}</span>
        )}
      </div>
    </div>
  );
}

// ---------- Main page ----------
export default function PipelinePage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [triggeringAgent, setTriggeringAgent] = useState<string | null>(null);

  const {
    data: dashboard,
    loading: dashLoading,
    error: dashError,
  } = useBodylyticsRpc<DashboardV2>("get_admin_dashboard_v2", {
    refreshInterval: 30_000,
  });

  const {
    data: contacts,
    loading: contactsLoading,
    error: contactsError,
  } = useBodylyticsTable<CrmContact>("crm_contacts_view", "*", 200, {
    refreshInterval: 30_000,
  });

  const pipeline = useMemo(() => dashboard?.crm_pipeline ?? [], [dashboard?.crm_pipeline]);
  const loading = dashLoading || contactsLoading;
  const error = dashError || contactsError;

  // Build funnel data from pipeline
  const funnelData = useMemo(() => {
    const stageMap = new Map(pipeline.map((s) => [s.stage, s.count]));
    return FUNNEL_STAGES.map((stage) => ({
      stage,
      count: stageMap.get(stage) ?? 0,
    }));
  }, [pipeline]);

  const totalLeads = funnelData[0]?.count ?? 0;
  const totalCustomers = funnelData[2]?.count ?? 0;
  const totalContacts = pipeline.reduce((sum, s) => sum + s.count, 0);
  const conversionRate =
    totalLeads > 0 ? Math.round((totalCustomers / totalLeads) * 100) : 0;

  // Lead source breakdown from contacts
  const sourceBreakdown = useMemo(() => {
    if (!contacts) return [];
    const counts = new Map<string, number>();
    contacts.forEach((c) => {
      const src = c.crm_source || "unknown";
      counts.set(src, (counts.get(src) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
  }, [contacts]);

  const maxSourceCount = sourceBreakdown[0]?.count ?? 1;

  // Revenue pipeline: sum of total_paid_amount for prospects
  const revenuePipeline = useMemo(() => {
    if (!contacts) return 0;
    return contacts
      .filter((c) => c.crm_status === "prospect")
      .reduce((sum, c) => sum + (c.total_paid_amount || 0), 0);
  }, [contacts]);

  // Average days to convert (customers only)
  const avgTimeToConvert = useMemo(() => {
    if (!contacts) return null;
    const customers = contacts.filter((c) => c.crm_status === "customer");
    if (customers.length === 0) return null;
    const totalDays = customers.reduce((sum, c) => sum + daysAgo(c.created_at), 0);
    return Math.round(totalDays / customers.length);
  }, [contacts]);

  // New leads this month
  const newLeadsThisMonth = useMemo(() => {
    if (!contacts) return 0;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return contacts.filter(
      (c) =>
        c.crm_status === "lead" && new Date(c.created_at) >= startOfMonth
    ).length;
  }, [contacts]);

  // Filtered contacts for table
  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    const sorted = [...contacts].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (statusFilter === "all") return sorted.slice(0, 20);
    return sorted.filter((c) => c.crm_status === statusFilter).slice(0, 20);
  }, [contacts, statusFilter]);

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
            Sales Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalContacts} contact{totalContacts !== 1 ? "s" : ""} across{" "}
            {pipeline.length} stage{pipeline.length !== 1 ? "s" : ""}
            {loading && " (loading...)"}
            {error && (
              <span className="text-red-500 ml-2">Error: {error}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            disabled={triggeringAgent === "bl-marketing"}
            onClick={() =>
              triggerAgent(
                "bl-marketing",
                "Lead Magnet Promotion",
                "Promote existing lead magnets across channels to drive new lead captures. Focus on quiz funnel and free resources."
              )
            }
          >
            {triggeringAgent === "bl-marketing" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Megaphone className="w-3.5 h-3.5" />
            )}
            Promote Lead Magnet
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            disabled={triggeringAgent === "bl-social"}
            onClick={() =>
              triggerAgent(
                "bl-social",
                "Generate Quiz Traffic",
                "Create social posts promoting the body language quiz page to drive traffic and lead captures."
              )
            }
          >
            {triggeringAgent === "bl-social" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Quiz Traffic
          </Button>
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Leads"
          value={String(totalLeads)}
          sub={`${newLeadsThisMonth} this month`}
          icon={Users}
          trend={
            newLeadsThisMonth > 0
              ? { value: `+${newLeadsThisMonth}`, positive: true }
              : null
          }
        />
        <StatCard
          label="Conversion Rate"
          value={`${conversionRate}%`}
          sub="Lead to Customer"
          icon={TrendingUp}
          trend={
            conversionRate >= 10
              ? { value: "Healthy", positive: true }
              : conversionRate > 0
                ? { value: "Needs work", positive: false }
                : null
          }
        />
        <StatCard
          label="Revenue Pipeline"
          value={formatEuro(revenuePipeline)}
          sub="Prospect value"
          icon={DollarSign}
        />
        <StatCard
          label="Avg Time to Convert"
          value={avgTimeToConvert !== null ? `${avgTimeToConvert}d` : "--"}
          sub="Days from signup"
          icon={Clock}
        />
      </div>

      {/* Funnel Visualization + Lead Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Funnel */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-border p-6">
          <h2 className="text-sm font-semibold text-navy-500 mb-5">
            Pipeline Funnel
          </h2>
          {pipeline.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No pipeline stages yet
            </p>
          ) : (
            <div className="space-y-4">
              {funnelData.map((stage, i) => {
                const widthPct =
                  totalLeads > 0
                    ? Math.max(
                        (stage.count / totalLeads) * 100,
                        stage.count > 0 ? 8 : 0
                      )
                    : 0;
                const conversionPct =
                  i < funnelData.length - 1 && stage.count > 0
                    ? Math.round(
                        (funnelData[i + 1].count / stage.count) * 100
                      )
                    : null;
                const color = FUNNEL_COLORS[stage.stage] ?? FUNNEL_COLORS.lead;
                return (
                  <FunnelBar
                    key={stage.stage}
                    label={stage.stage}
                    count={stage.count}
                    total={totalLeads}
                    conversionPct={conversionPct}
                    color={color}
                    widthPct={widthPct}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Lead Source Breakdown */}
        <div className="bg-white rounded-xl border border-border p-6">
          <h2 className="text-sm font-semibold text-navy-500 mb-5">
            Lead Sources
          </h2>
          {sourceBreakdown.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No source data yet
            </p>
          ) : (
            <div className="space-y-3">
              {sourceBreakdown.map(({ source, count }) => {
                const pct =
                  totalContacts > 0
                    ? Math.round((count / totalContacts) * 100)
                    : 0;
                const barPct = Math.round((count / maxSourceCount) * 100);
                return (
                  <div key={source} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-navy-500">
                        {SOURCE_LABELS[source] ?? capitalize(source)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          SOURCE_BADGE[source]
                            ? "bg-teal-400"
                            : "bg-slate-300"
                        )}
                        style={{
                          width: `${barPct}%`,
                          backgroundColor:
                            source === "lead_magnet"
                              ? "#9333ea"
                              : source === "quiz"
                                ? "#d97706"
                                : source === "referral"
                                  ? "#b45309"
                                  : source === "organic"
                                    ? "#059669"
                                    : source === "outbound"
                                      ? "#1e3a5f"
                                      : source === "website_form"
                                        ? "#0d9488"
                                        : "#94a3b8",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Leads Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-montserrat font-semibold text-navy-500">
            Recent Leads
          </h2>
          <div className="flex items-center gap-1 bg-white rounded-lg border border-border p-0.5">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  statusFilter === tab
                    ? "bg-navy-500 text-white"
                    : "text-muted-foreground hover:text-navy-500"
                )}
              >
                {tab === "all" ? (
                  <span className="flex items-center gap-1">
                    <Filter className="w-3 h-3" />
                    All
                  </span>
                ) : (
                  capitalize(tab)
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {!contacts || contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {contactsLoading ? "Loading contacts..." : "No contacts yet"}
            </p>
          ) : filteredContacts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No {statusFilter} contacts found
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left text-xs font-semibold text-muted-foreground p-3">
                    Name
                  </th>
                  <th className="text-left text-xs font-semibold text-muted-foreground p-3">
                    Email
                  </th>
                  <th className="text-left text-xs font-semibold text-muted-foreground p-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-semibold text-muted-foreground p-3">
                    Source
                  </th>
                  <th className="text-right text-xs font-semibold text-muted-foreground p-3">
                    Courses
                  </th>
                  <th className="text-right text-xs font-semibold text-muted-foreground p-3">
                    Paid
                  </th>
                  <th className="text-left text-xs font-semibold text-muted-foreground p-3">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredContacts.map((contact) => (
                  <tr
                    key={contact.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-navy-100 flex items-center justify-center">
                          <span className="text-xs font-bold text-navy-500">
                            {(contact.full_name || "?")
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2)}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-navy-500">
                          {contact.full_name || "Unknown"}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground max-w-[200px] truncate">
                      {contact.email}
                    </td>
                    <td className="p-3">
                      <Badge
                        className={cn(
                          "text-[10px]",
                          STATUS_BADGE[contact.crm_status] ??
                            "bg-slate-100 text-slate-700"
                        )}
                      >
                        {capitalize(contact.crm_status)}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        className={cn(
                          "text-[10px]",
                          SOURCE_BADGE[contact.crm_source] ??
                            "bg-slate-100 text-slate-700"
                        )}
                      >
                        {SOURCE_LABELS[contact.crm_source] ??
                          capitalize(contact.crm_source)}
                      </Badge>
                    </td>
                    <td className="p-3 text-right text-sm font-medium text-navy-500">
                      {contact.total_courses_enrolled}
                    </td>
                    <td className="p-3 text-right text-sm font-medium text-navy-500">
                      {formatEuro(contact.total_paid_amount)}
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {formatDate(contact.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
