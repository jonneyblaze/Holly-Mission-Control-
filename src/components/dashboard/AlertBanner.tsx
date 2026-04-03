"use client";

import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  message: string;
}

const severityConfig = {
  critical: {
    bg: "bg-red-50 border-red-200",
    icon: "text-red-600",
    text: "text-red-800",
  },
  warning: {
    bg: "bg-amber-50 border-amber-200",
    icon: "text-amber-600",
    text: "text-amber-800",
  },
  info: {
    bg: "bg-blue-50 border-blue-200",
    icon: "text-blue-600",
    text: "text-blue-800",
  },
};

export default function AlertBanner({ alerts }: { alerts: Alert[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((alert) => {
        const config = severityConfig[alert.severity];
        return (
          <div
            key={alert.id}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 rounded-lg border",
              config.bg
            )}
          >
            <AlertTriangle className={cn("w-4 h-4 flex-shrink-0", config.icon)} />
            <p className={cn("text-sm font-medium flex-1", config.text)}>
              {alert.message}
            </p>
            <button
              onClick={() => setDismissed((s) => new Set(Array.from(s).concat(alert.id)))}
              className="p-1 rounded hover:bg-black/5 transition-colors"
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
