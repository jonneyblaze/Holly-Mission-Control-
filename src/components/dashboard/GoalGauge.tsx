"use client";

import { cn } from "@/lib/utils";

interface GoalGaugeProps {
  label: string;
  actual: number;
  target: number;
  unit?: string;
  size?: "sm" | "md";
}

export default function GoalGauge({
  label,
  actual,
  target,
  unit = "",
  size = "md",
}: GoalGaugeProps) {
  const percentage = target > 0 ? Math.min((actual / target) * 100, 100) : 0;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const status =
    percentage >= 80
      ? "on-track"
      : percentage >= 60
      ? "at-risk"
      : "behind";

  const statusColors = {
    "on-track": { stroke: "#00BFA5", bg: "bg-teal-50", text: "text-teal-700", label: "On Track" },
    "at-risk": { stroke: "#C77B4A", bg: "bg-copper-50", text: "text-copper-700", label: "At Risk" },
    behind: { stroke: "#EF4444", bg: "bg-red-50", text: "text-red-700", label: "Behind" },
  };

  const colors = statusColors[status];
  const dims = size === "sm" ? "w-24 h-24" : "w-32 h-32";

  return (
    <div className="bg-white rounded-xl border border-border p-4 flex flex-col items-center hover:shadow-md transition-shadow">
      <div className={cn("relative", dims)}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-muted/40"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={colors.stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-montserrat font-bold text-navy-500">
            {Math.round(percentage)}%
          </span>
        </div>
      </div>
      <p className="mt-2 text-sm font-semibold text-navy-500 text-center">{label}</p>
      <p className="text-xs text-muted-foreground">
        {unit}{actual.toLocaleString()} / {unit}{target.toLocaleString()}
      </p>
      <span
        className={cn(
          "mt-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
          colors.bg,
          colors.text
        )}
      >
        {colors.label}
      </span>
    </div>
  );
}
