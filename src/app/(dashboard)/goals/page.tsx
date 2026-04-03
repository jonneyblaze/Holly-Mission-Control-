"use client";

import GoalGauge from "@/components/dashboard/GoalGauge";
import { Badge } from "@/components/ui/badge";
import { Bot, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

const goals = [
  { label: "Revenue", actual: 2340, target: 5000, unit: "\u20AC" },
  { label: "Enrollments", actual: 12, target: 20 },
  { label: "Blog Posts", actual: 3, target: 8 },
  { label: "Discovery Calls", actual: 2, target: 6 },
  { label: "Deals Closed", actual: 1, target: 3 },
  { label: "LinkedIn Posts", actual: 8, target: 12 },
  { label: "YouTube Videos", actual: 0, target: 2 },
  { label: "Proposals Sent", actual: 4, target: 8 },
];

const correctiveActions = [
  {
    id: "1",
    kpi: "Revenue",
    action: "Flash sale campaign: 20% off NVC for Sales course",
    agent: "bl-marketing",
    status: "pending",
    triggeredAt: "2026-04-02T09:00:00Z",
  },
  {
    id: "2",
    kpi: "Revenue",
    action: "Email blast to unconverted leads with value-first content",
    agent: "bl-marketing",
    status: "executing",
    triggeredAt: "2026-04-02T09:00:00Z",
  },
  {
    id: "3",
    kpi: "Blog Posts",
    action: "Batch write 3 blog posts: micro-expressions, deception cues, mirroring",
    agent: "bl-marketing",
    status: "done",
    triggeredAt: "2026-04-01T09:00:00Z",
  },
  {
    id: "4",
    kpi: "Enrollments",
    action: "Referral boost campaign to existing students",
    agent: "bl-social",
    status: "pending",
    triggeredAt: "2026-04-02T09:00:00Z",
  },
];

const statusConfig = {
  pending: { icon: Clock, color: "bg-amber-100 text-amber-700", label: "Pending" },
  executing: { icon: Bot, color: "bg-teal-100 text-teal-700", label: "Executing" },
  done: { icon: CheckCircle2, color: "bg-emerald-100 text-emerald-700", label: "Done" },
};

export default function GoalsPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-montserrat font-bold text-navy-500">Business Goals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          April 2026 &middot; Monthly targets with mid-week correction
        </p>
      </div>

      {/* Goal Gauges Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {goals.map((g) => (
          <GoalGauge key={g.label} {...g} />
        ))}
      </div>

      {/* Corrective Actions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-copper-500" />
          <h2 className="text-lg font-montserrat font-semibold text-navy-500">
            Corrective Actions
          </h2>
        </div>
        <div className="bg-white rounded-xl border border-border divide-y divide-border">
          {correctiveActions.map((action) => {
            const config = statusConfig[action.status as keyof typeof statusConfig];
            const StatusIcon = config.icon;
            return (
              <div key={action.id} className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] font-bold">
                      {action.kpi}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{action.agent}</span>
                  </div>
                  <p className="text-sm font-medium text-navy-500 truncate">{action.action}</p>
                </div>
                <Badge className={`${config.color} text-[10px] gap-1`}>
                  <StatusIcon className="w-3 h-3" />
                  {config.label}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
