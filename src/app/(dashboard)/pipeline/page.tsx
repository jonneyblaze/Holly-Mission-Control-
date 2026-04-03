"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Users, ArrowRight } from "lucide-react";
import { useBodylyticsRpc, useBodylyticsTable } from "@/lib/hooks/use-bodylytics";

// ---------- Types ----------
interface PipelineStage {
  stage: string;
  count: number;
}

interface DashboardV2 {
  crm_pipeline: PipelineStage[];
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

// ---------- Stage config ----------
const STAGE_COLORS: Record<string, string> = {
  lead: "bg-slate-200",
  prospect: "bg-navy-200",
  qualified: "bg-teal-200",
  customer: "bg-teal-400",
  churned: "bg-red-200",
};

const STATUS_BADGE: Record<string, string> = {
  lead: "bg-slate-100 text-slate-700",
  prospect: "bg-navy-100 text-navy-700",
  qualified: "bg-teal-100 text-teal-700",
  customer: "bg-emerald-100 text-emerald-700",
  churned: "bg-red-100 text-red-700",
};

const SOURCE_BADGE: Record<string, string> = {
  referral: "bg-copper-100 text-copper-700",
  website_form: "bg-teal-100 text-teal-700",
  outbound: "bg-navy-100 text-navy-700",
  inbound: "bg-blue-100 text-blue-700",
  organic: "bg-emerald-100 text-emerald-700",
};

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

// ---------- Component ----------
export default function PipelinePage() {
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

  const pipeline = dashboard?.crm_pipeline ?? [];
  const totalContacts = pipeline.reduce((sum, s) => sum + s.count, 0);
  const loading = dashLoading || contactsLoading;
  const error = dashError || contactsError;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-montserrat font-bold text-navy-500">
          Sales Pipeline
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {totalContacts} contact{totalContacts !== 1 ? "s" : ""} across{" "}
          {pipeline.length} stage{pipeline.length !== 1 ? "s" : ""}
          {loading && " (loading\u2026)"}
          {error && (
            <span className="text-red-500 ml-2">Error: {error}</span>
          )}
        </p>
      </div>

      {/* Funnel */}
      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-sm font-semibold text-navy-500 mb-4">
          Pipeline Funnel
        </h2>
        {pipeline.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No pipeline stages yet
          </p>
        ) : (
          <div className="flex items-center gap-2">
            {pipeline.map((stage, i) => {
              const color = STAGE_COLORS[stage.stage] ?? "bg-slate-200";
              return (
                <div
                  key={stage.stage}
                  className="flex items-center gap-2 flex-1"
                >
                  <div className="flex-1">
                    <div
                      className={cn("rounded-lg p-4 text-center", color)}
                      style={{ opacity: 0.6 + i * 0.1 }}
                    >
                      <p className="text-2xl font-montserrat font-bold text-navy-500">
                        {stage.count}
                      </p>
                      <p className="text-xs font-semibold text-navy-500">
                        {capitalize(stage.stage)}
                      </p>
                    </div>
                    {i < pipeline.length - 1 && (
                      <div className="text-center mt-1">
                        <span className="text-[10px] text-muted-foreground">
                          {stage.count > 0
                            ? Math.round(
                                (pipeline[i + 1].count / stage.count) * 100
                              )
                            : 0}
                          %
                        </span>
                      </div>
                    )}
                  </div>
                  {i < pipeline.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Contacts Table */}
      <div>
        <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">
          Contacts
        </h2>
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {!contacts || contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {contactsLoading ? "Loading contacts\u2026" : "No contacts yet"}
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
                {contacts.map((contact) => (
                  <tr
                    key={contact.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-navy-100 flex items-center justify-center">
                          <Users className="w-3.5 h-3.5 text-navy-500" />
                        </div>
                        <span className="text-sm font-medium text-navy-500">
                          {contact.full_name || "Unknown"}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">
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
                        {capitalize(contact.crm_source)}
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
