"use client";

import { cn } from "@/lib/utils";
import { useMCTable } from "@/lib/hooks/use-mission-control";
import { Server, HardDrive, Cpu, CircuitBoard, AlertTriangle, CheckCircle2 } from "lucide-react";

// ---------- Types for infra_snapshots row ----------
interface InfraContainer {
  name: string;
  status: string;
  uptime: string;
  memory: string;
  cpu: string;
}

interface InfraAlert {
  id: string;
  severity: string;
  message: string;
  time: string;
  resolved: boolean;
}

interface InfraEdgeFunction {
  name: string;
  status: string;
  lastInvoked: string;
  errorRate: string;
}

interface InfraSnapshot {
  id: string;
  snapshot_at: string;
  containers: InfraContainer[];
  disk_usage: number;
  memory_usage: number;
  cpu_usage?: number;
  alerts: InfraAlert[];
  edge_functions: InfraEdgeFunction[];
}

// ---------- Demo / fallback data ----------
const demoContainers: InfraContainer[] = [
  { name: "bodylytics-nextjs", status: "running", uptime: "12d 4h", memory: "245MB", cpu: "2.1%" },
  { name: "supabase-studio", status: "running", uptime: "12d 4h", memory: "180MB", cpu: "0.8%" },
  { name: "openclaw", status: "running", uptime: "3d 16h", memory: "6.2GB", cpu: "12.4%" },
  { name: "ollama", status: "running", uptime: "3d 16h", memory: "4.1GB", cpu: "0.2%" },
  { name: "prometheus", status: "running", uptime: "12d 4h", memory: "320MB", cpu: "1.5%" },
  { name: "alertmanager", status: "running", uptime: "12d 4h", memory: "45MB", cpu: "0.1%" },
  { name: "grafana", status: "running", uptime: "12d 4h", memory: "160MB", cpu: "0.4%" },
  { name: "cadvisor", status: "running", uptime: "12d 4h", memory: "85MB", cpu: "0.6%" },
  { name: "node-exporter", status: "running", uptime: "12d 4h", memory: "22MB", cpu: "0.1%" },
  { name: "filebrowser", status: "running", uptime: "1d 2h", memory: "28MB", cpu: "0.0%" },
  { name: "nginx-proxy", status: "running", uptime: "12d 4h", memory: "15MB", cpu: "0.2%" },
  { name: "cloudflared", status: "running", uptime: "12d 4h", memory: "52MB", cpu: "0.3%" },
  { name: "postgres-backup", status: "running", uptime: "12d 4h", memory: "38MB", cpu: "0.0%" },
  { name: "redis", status: "restarting", uptime: "0h 2m", memory: "64MB", cpu: "0.5%" },
];

const demoAlerts: InfraAlert[] = [
  { id: "1", severity: "warning", message: "Redis container restarting (2 restarts in 5 min)", time: "2 min ago", resolved: false },
  { id: "2", severity: "info", message: "Disk space at 62% — approaching 80% threshold", time: "2h ago", resolved: false },
  { id: "3", severity: "critical", message: "OpenClaw agent timeout exceeded (resolved)", time: "6h ago", resolved: true },
];

const demoEdgeFunctions: InfraEdgeFunction[] = [
  { name: "engagement-nudges", status: "healthy", lastInvoked: "1h ago", errorRate: "0%" },
  { name: "create-checkout-session", status: "healthy", lastInvoked: "3h ago", errorRate: "0%" },
  { name: "stripe-webhook", status: "healthy", lastInvoked: "45m ago", errorRate: "0.2%" },
  { name: "send-email", status: "healthy", lastInvoked: "2h ago", errorRate: "0%" },
  { name: "admin-seed-content", status: "healthy", lastInvoked: "3d ago", errorRate: "0%" },
];

const demoDiskUsage = 62;
const demoMemoryUsage = 71;
const demoCpuUsage = 18;

const statusColor = {
  running: "bg-emerald-500",
  restarting: "bg-amber-500",
  stopped: "bg-red-500",
};

export default function InfrastructurePage() {
  const { data: snapshots } = useMCTable<InfraSnapshot>("infra_snapshots", {
    realtime: true,
    orderBy: "snapshot_at",
    orderAsc: false,
    limit: 1,
  });

  const latest = snapshots.length > 0 ? snapshots[0] : null;

  // Use live data when available, otherwise fall back to demo data
  const containers = latest?.containers ?? demoContainers;
  const alerts = latest?.alerts ?? demoAlerts;
  const edgeFunctions = latest?.edge_functions ?? demoEdgeFunctions;
  const diskUsage = latest?.disk_usage ?? demoDiskUsage;
  const memoryUsage = latest?.memory_usage ?? demoMemoryUsage;
  const cpuUsage = latest?.cpu_usage ?? demoCpuUsage;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">Infrastructure</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Naboo (10.0.1.100) &middot; {containers.filter(c => c.status === "running").length}/{containers.length} containers healthy
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border">
            <HardDrive className="w-4 h-4 text-navy-400" />
            <span className="text-navy-500 font-medium">{diskUsage}%</span>
            <span className="text-muted-foreground">Disk</span>
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border">
            <CircuitBoard className="w-4 h-4 text-navy-400" />
            <span className="text-navy-500 font-medium">{memoryUsage}%</span>
            <span className="text-muted-foreground">Memory</span>
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border">
            <Cpu className="w-4 h-4 text-navy-400" />
            <span className="text-navy-500 font-medium">{cpuUsage}%</span>
            <span className="text-muted-foreground">CPU</span>
          </div>
        </div>
      </div>

      {/* Container Grid */}
      <div>
        <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">Containers</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {containers.map((c) => (
            <div
              key={c.name}
              className="bg-white rounded-xl border border-border p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-navy-400" />
                  <span className="text-sm font-semibold text-navy-500">{c.name}</span>
                </div>
                <div className={cn("w-2.5 h-2.5 rounded-full", statusColor[c.status as keyof typeof statusColor] || "bg-slate-400")} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <div>
                  <p className="font-medium text-navy-500">{c.memory}</p>
                  <p>Memory</p>
                </div>
                <div>
                  <p className="font-medium text-navy-500">{c.cpu}</p>
                  <p>CPU</p>
                </div>
                <div>
                  <p className="font-medium text-navy-500">{c.uptime}</p>
                  <p>Uptime</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alerts */}
      <div>
        <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">Alert History</h2>
        <div className="bg-white rounded-xl border border-border divide-y">
          {alerts.map((alert) => (
            <div key={alert.id} className="flex items-center gap-4 p-4">
              {alert.resolved ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              ) : (
                <AlertTriangle className={cn("w-4 h-4 flex-shrink-0", alert.severity === "critical" ? "text-red-500" : alert.severity === "warning" ? "text-amber-500" : "text-blue-500")} />
              )}
              <p className={cn("text-sm flex-1", alert.resolved ? "text-muted-foreground line-through" : "text-navy-500 font-medium")}>{alert.message}</p>
              <span className="text-xs text-muted-foreground">{alert.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Edge Functions */}
      <div>
        <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">Edge Functions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {edgeFunctions.map((fn) => (
            <div key={fn.name} className="bg-white rounded-xl border border-border p-4 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-navy-500">{fn.name}</p>
                <p className="text-xs text-muted-foreground">Last: {fn.lastInvoked} &middot; Errors: {fn.errorRate}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
