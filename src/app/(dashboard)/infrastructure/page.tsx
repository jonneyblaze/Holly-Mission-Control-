"use client";

import { cn } from "@/lib/utils";
import { useMCTable } from "@/lib/hooks/use-mission-control";
import { useState, useMemo } from "react";
import {
  Server,
  HardDrive,
  Cpu,
  MemoryStick,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  Loader2,
  Wifi,
  WifiOff,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  XCircle,
  Shield,
  Database,
  Globe,
  Gauge,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ViewOutputButton } from "@/components/dashboard/ContentModal";

// ---------- Types ----------
interface Container {
  name: string;
  status: string;
  uptime: string;
  image?: string;
  memory_mb: number;
  memory_percent: number;
  cpu_percent: number;
  memory?: string; // Legacy field
  cpu?: string; // Legacy field
}

interface SystemMetric {
  total_mb?: number;
  total_gb?: number;
  used_mb?: number;
  used_gb?: number;
  available_mb?: number;
  percent: number;
}

interface CpuMetric {
  load_1m: number;
  load_5m: number;
  load_15m: number;
  cores: number;
  percent: number;
}

interface InfraAlert {
  name: string;
  severity: string;
  status: string;
  instance?: string;
  summary: string;
  starts_at?: string;
  ends_at?: string;
  // Legacy fields
  id?: string;
  message?: string;
  time?: string;
  resolved?: boolean;
}

interface InfraSnapshot {
  id: string;
  snapshot_at: string;
  containers: Container[];
  disk_usage: SystemMetric | null;
  memory_usage: SystemMetric | null;
  cpu_usage?: CpuMetric | null;
  array_disk_usage?: SystemMetric | null;
  alerts: InfraAlert[];
  edge_functions: { name: string; status: string; lastInvoked?: string; last_invoked?: string; errorRate?: string }[];
  health_status?: string;
  system_uptime?: string;
  prometheus_up?: boolean;
  alertmanager_up?: boolean;
  prometheus?: Record<string, unknown>;
}

interface AgentActivity {
  id: string;
  agent_id: string;
  activity_type: string;
  title: string;
  summary: string;
  full_content: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---------- Gauge Component ----------
function RadialGauge({ value, max, label, unit, size = 120, color }: {
  value: number;
  max: number;
  label: string;
  unit?: string;
  size?: number;
  color: "emerald" | "amber" | "red" | "teal" | "blue";
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (pct / 100) * circumference;

  const colorMap = {
    emerald: { stroke: "#10b981", bg: "bg-emerald-50", text: "text-emerald-600" },
    amber: { stroke: "#f59e0b", bg: "bg-amber-50", text: "text-amber-600" },
    red: { stroke: "#ef4444", bg: "bg-red-50", text: "text-red-600" },
    teal: { stroke: "#14b8a6", bg: "bg-teal-50", text: "text-teal-600" },
    blue: { stroke: "#3b82f6", bg: "bg-blue-50", text: "text-blue-600" },
  };

  const autoColor = pct > 85 ? "red" : pct > 70 ? "amber" : color;
  const c = colorMap[autoColor];

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={c.stroke} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-2xl font-bold", c.text)}>{Math.round(pct)}%</span>
          {unit && <span className="text-[10px] text-muted-foreground">{value}{unit} / {max}{unit}</span>}
        </div>
      </div>
      <span className="text-xs font-medium text-slate-600 mt-1">{label}</span>
    </div>
  );
}

// ---------- Container Card ----------
function ContainerCard({ container }: { container: Container }) {
  const isRunning = container.status === "running";
  const isRestarting = container.status === "restarting";
  const isStopped = container.status === "stopped" || container.status === "exited";

  const statusIcon = isRunning
    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
    : isRestarting
    ? <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin" />
    : <XCircle className="w-3.5 h-3.5 text-red-500" />;

  const borderColor = isRunning ? "border-emerald-200" : isRestarting ? "border-amber-200" : "border-red-200";
  const bgColor = isRunning ? "bg-white" : isRestarting ? "bg-amber-50/50" : "bg-red-50/50";

  // Get real values or parse legacy strings
  const cpuPct = container.cpu_percent || parseFloat(container.cpu || "0");
  const memPct = container.memory_percent || 0;
  const memMb = container.memory_mb || 0;

  // Container icon based on name
  const getIcon = (name: string) => {
    if (name.includes("postgres") || name.includes("supabase-db") || name.includes("redis")) return <Database className="w-4 h-4" />;
    if (name.includes("nginx") || name.includes("cloudflare") || name.includes("caddy")) return <Globe className="w-4 h-4" />;
    if (name.includes("prometheus") || name.includes("grafana") || name.includes("alertmanager")) return <Gauge className="w-4 h-4" />;
    if (name.includes("shield") || name.includes("auth")) return <Shield className="w-4 h-4" />;
    return <Server className="w-4 h-4" />;
  };

  return (
    <div className={cn("rounded-xl border p-3.5 transition-all hover:shadow-md", borderColor, bgColor)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-slate-400 flex-shrink-0">{getIcon(container.name)}</div>
          <span className="text-sm font-semibold text-navy-500 truncate">{container.name}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {statusIcon}
          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full",
            isRunning ? "bg-emerald-100 text-emerald-700" :
            isRestarting ? "bg-amber-100 text-amber-700" :
            "bg-red-100 text-red-700"
          )}>
            {container.status}
          </span>
        </div>
      </div>

      {isRunning && (
        <div className="space-y-2">
          {/* CPU bar */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-muted-foreground">CPU</span>
              <span className="text-[10px] font-medium text-navy-500">{cpuPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500",
                  cpuPct > 80 ? "bg-red-500" : cpuPct > 50 ? "bg-amber-500" : "bg-teal-500"
                )}
                style={{ width: `${Math.min(100, cpuPct)}%` }}
              />
            </div>
          </div>

          {/* Memory bar */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-muted-foreground">Memory</span>
              <span className="text-[10px] font-medium text-navy-500">
                {memMb > 0 ? `${memMb}MB` : memPct > 0 ? `${memPct.toFixed(1)}%` : container.memory || "—"}
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500",
                  memPct > 80 ? "bg-red-500" : memPct > 50 ? "bg-amber-500" : "bg-blue-500"
                )}
                style={{ width: `${Math.min(100, memPct || 0)}%` }}
              />
            </div>
          </div>

          {/* Uptime */}
          {container.uptime && (
            <div className="flex items-center gap-1 mt-1">
              <ArrowUpCircle className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] text-muted-foreground">Up {container.uptime}</span>
            </div>
          )}
        </div>
      )}

      {!isRunning && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
          <ArrowDownCircle className="w-3 h-3" />
          <span>{isStopped ? "Container stopped" : "Restarting..."}</span>
        </div>
      )}
    </div>
  );
}

// ---------- Alert Card ----------
function AlertCard({ alert }: { alert: InfraAlert }) {
  const isResolved = alert.resolved || alert.status === "resolved" || alert.status === "suppressed";
  const isCritical = alert.severity === "critical";

  return (
    <div className={cn(
      "flex items-start gap-3 p-3 rounded-lg border transition-colors",
      isResolved ? "bg-slate-50 border-slate-200" :
      isCritical ? "bg-red-50 border-red-200" :
      "bg-amber-50 border-amber-200"
    )}>
      {isResolved ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
      ) : (
        <AlertTriangle className={cn("w-4 h-4 mt-0.5 flex-shrink-0",
          isCritical ? "text-red-500" : "text-amber-500"
        )} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={cn("text-sm font-semibold",
            isResolved ? "text-slate-500 line-through" :
            isCritical ? "text-red-700" : "text-amber-700"
          )}>
            {alert.name || alert.message}
          </span>
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium",
            isCritical ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
          )}>
            {alert.severity}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{alert.summary || alert.message}</p>
        {alert.instance && <p className="text-[10px] text-muted-foreground mt-0.5">Instance: {alert.instance}</p>}
        {alert.starts_at && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Since {formatDistanceToNow(new Date(alert.starts_at), { addSuffix: true })}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- Service Status Pill ----------
function ServicePill({ name, up, url }: { name: string; up: boolean; url?: string }) {
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border",
      up ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-600"
    )}>
      {up ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      {name}
      {url && <span className="text-[10px] opacity-60">{url}</span>}
    </div>
  );
}

// ---------- Main Page ----------
export default function InfrastructurePage() {
  const [showAllReports, setShowAllReports] = useState(false);

  // Structured snapshots
  const { data: snapshots, loading: snapshotsLoading } = useMCTable<InfraSnapshot>("infra_snapshots", {
    realtime: true,
    orderBy: "snapshot_at",
    orderAsc: false,
    limit: 24, // Last 24 snapshots for history
  });

  // Agent activity from infra agent
  const { data: infraActivity, loading: activityLoading } = useMCTable<AgentActivity>("agent_activity", {
    realtime: true,
    orderBy: "created_at",
    orderAsc: false,
    limit: 20,
    filter: { agent_id: "infra" },
  });

  const latest = snapshots.length > 0 ? snapshots[0] : null;
  const hasData = latest && latest.containers && latest.containers.length > 0;

  // Parse metadata for enriched data (from monitoring script)
  const meta = (latest as unknown as { health_status?: string; system_uptime?: string; prometheus_up?: boolean; alertmanager_up?: boolean; cpu_usage?: CpuMetric; array_disk_usage?: SystemMetric }) || {};
  const healthStatus = meta.health_status || "unknown";
  const systemUptime = meta.system_uptime || "";
  const promUp = meta.prometheus_up ?? false;
  const alertmanagerUp = meta.alertmanager_up ?? false;
  const cpuUsage = meta.cpu_usage || null;
  const arrayDisk = meta.array_disk_usage || null;

  // Container counts
  const containers = latest?.containers || [];
  const totalContainers = containers.length;
  const runningContainers = containers.filter((c) => c.status === "running").length;
  const stoppedContainers = containers.filter((c) => c.status === "stopped" || c.status === "exited").length;
  const restartingContainers = containers.filter((c) => c.status === "restarting").length;

  // System metrics
  const diskPct = latest?.disk_usage?.percent ?? 0;
  const memPct = latest?.memory_usage?.percent ?? 0;
  const cpuPct = cpuUsage?.percent ?? 0;

  // Alerts
  const alerts = latest?.alerts || [];
  const activeAlerts = alerts.filter((a) => !a.resolved && a.status !== "resolved" && a.status !== "suppressed");

  // Sort containers: running first, then by name
  const sortedContainers = useMemo(() =>
    [...containers].sort((a, b) => {
      if (a.status === "running" && b.status !== "running") return -1;
      if (a.status !== "running" && b.status === "running") return 1;
      return a.name.localeCompare(b.name);
    }),
    [containers]
  );

  // Historical data points from snapshots
  const historyPoints = useMemo(() =>
    snapshots.slice(0, 24).reverse().map((s) => ({
      time: s.snapshot_at,
      disk: s.disk_usage?.percent ?? 0,
      memory: s.memory_usage?.percent ?? 0,
      containers: s.containers?.filter((c) => c.status === "running").length ?? 0,
      total: s.containers?.length ?? 0,
      alerts: s.alerts?.length ?? 0,
    })),
    [snapshots]
  );

  const isLoading = snapshotsLoading && activityLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">Infrastructure</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Naboo (10.0.1.100)
            {systemUptime && <span> &middot; Up {systemUptime}</span>}
            {latest && (
              <span className="ml-1">
                &middot; Last scan {formatDistanceToNow(new Date(latest.snapshot_at), { addSuffix: true })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Health badge */}
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold",
            healthStatus === "healthy" ? "bg-emerald-100 text-emerald-700" :
            healthStatus === "degraded" ? "bg-amber-100 text-amber-700" :
            healthStatus === "critical" ? "bg-red-100 text-red-700" :
            "bg-slate-100 text-slate-600"
          )}>
            <div className={cn("w-2 h-2 rounded-full animate-pulse",
              healthStatus === "healthy" ? "bg-emerald-500" :
              healthStatus === "degraded" ? "bg-amber-500" :
              healthStatus === "critical" ? "bg-red-500" :
              "bg-slate-400"
            )} />
            {healthStatus === "healthy" ? "All Systems Operational" :
             healthStatus === "degraded" ? "Degraded Performance" :
             healthStatus === "critical" ? "Critical Issues" :
             "No Data"}
          </div>
        </div>
      </div>

      {/* Active Alerts Banner */}
      {activeAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h2 className="text-sm font-bold text-red-700">
              {activeAlerts.length} Active Alert{activeAlerts.length > 1 ? "s" : ""}
            </h2>
          </div>
          <div className="space-y-2">
            {activeAlerts.map((alert, i) => (
              <AlertCard key={alert.name || i} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {/* System Gauges */}
      {hasData && (
        <div className="bg-white rounded-xl border border-border p-6">
          <h2 className="text-sm font-semibold text-navy-500 mb-5 flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-600" />
            System Resources
          </h2>
          <div className="flex items-center justify-around flex-wrap gap-6">
            {cpuPct > 0 && (
              <RadialGauge
                value={cpuPct}
                max={100}
                label="CPU"
                color="teal"
              />
            )}
            <RadialGauge
              value={memPct}
              max={100}
              label="Memory"
              color="blue"
            />
            <RadialGauge
              value={diskPct}
              max={100}
              label="System Disk"
              color="teal"
            />
            {arrayDisk && arrayDisk.percent > 0 && (
              <RadialGauge
                value={arrayDisk.percent}
                max={100}
                label="Array Disk"
                color="teal"
              />
            )}
            <div className="flex flex-col items-center">
              <div className="w-[120px] h-[120px] rounded-full border-[8px] border-emerald-200 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-emerald-600">{runningContainers}</span>
                <span className="text-[10px] text-muted-foreground">/ {totalContainers}</span>
              </div>
              <span className="text-xs font-medium text-slate-600 mt-1">Containers</span>
            </div>
            {cpuUsage && (
              <div className="flex flex-col items-center gap-1 text-center">
                <Cpu className="w-5 h-5 text-teal-500" />
                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  <p><span className="font-medium text-navy-500">{cpuUsage.load_1m}</span> 1m</p>
                  <p><span className="font-medium text-navy-500">{cpuUsage.load_5m}</span> 5m</p>
                  <p><span className="font-medium text-navy-500">{cpuUsage.load_15m}</span> 15m</p>
                  <p className="text-muted-foreground">{cpuUsage.cores} cores</p>
                </div>
                <span className="text-xs font-medium text-slate-600">Load Avg</span>
              </div>
            )}
          </div>

          {/* Memory detail bar */}
          {latest?.memory_usage && (latest.memory_usage.total_mb || latest.memory_usage.total_gb) && (
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-muted-foreground flex items-center gap-1">
                  <MemoryStick className="w-3.5 h-3.5" /> Memory
                </span>
                <span className="font-medium text-navy-500">
                  {latest.memory_usage.used_mb
                    ? `${(latest.memory_usage.used_mb / 1024).toFixed(1)}GB / ${(latest.memory_usage.total_mb! / 1024).toFixed(1)}GB`
                    : `${latest.memory_usage.used_gb}GB / ${latest.memory_usage.total_gb}GB`
                  }
                  {latest.memory_usage.available_mb && (
                    <span className="text-muted-foreground ml-1">({(latest.memory_usage.available_mb / 1024).toFixed(1)}GB free)</span>
                  )}
                </span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-700",
                    memPct > 85 ? "bg-gradient-to-r from-red-400 to-red-500" :
                    memPct > 70 ? "bg-gradient-to-r from-amber-400 to-amber-500" :
                    "bg-gradient-to-r from-blue-400 to-teal-500"
                  )}
                  style={{ width: `${memPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Disk detail bar */}
          {latest?.disk_usage && (latest.disk_usage.total_gb || latest.disk_usage.total_mb) && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-muted-foreground flex items-center gap-1">
                  <HardDrive className="w-3.5 h-3.5" /> System Disk
                </span>
                <span className="font-medium text-navy-500">
                  {latest.disk_usage.used_gb || latest.disk_usage.used_mb}GB / {latest.disk_usage.total_gb || latest.disk_usage.total_mb}GB
                </span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-700",
                    diskPct > 85 ? "bg-gradient-to-r from-red-400 to-red-500" :
                    diskPct > 70 ? "bg-gradient-to-r from-amber-400 to-amber-500" :
                    "bg-gradient-to-r from-teal-400 to-teal-500"
                  )}
                  style={{ width: `${diskPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Service Status */}
      {hasData && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-500 mr-1">Services:</span>
          <ServicePill name="Prometheus" up={promUp} />
          <ServicePill name="Alertmanager" up={alertmanagerUp} />
          <ServicePill name="OpenClaw" up={containers.some(c => c.name.includes("openclaw") && c.status === "running")} />
          <ServicePill name="Grafana" up={containers.some(c => c.name.includes("grafana") && c.status === "running")} />
          {stoppedContainers > 0 && (
            <span className="text-[10px] text-red-500 font-medium ml-2">
              {stoppedContainers} stopped
            </span>
          )}
          {restartingContainers > 0 && (
            <span className="text-[10px] text-amber-500 font-medium ml-1">
              {restartingContainers} restarting
            </span>
          )}
        </div>
      )}

      {/* Container Grid */}
      {hasData && (
        <div>
          <h2 className="text-sm font-semibold text-navy-500 mb-3 flex items-center gap-2">
            <Server className="w-4 h-4 text-teal-600" />
            Containers ({runningContainers}/{totalContainers} running)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {sortedContainers.map((c) => (
              <ContainerCard key={c.name} container={c} />
            ))}
          </div>
        </div>
      )}

      {/* Historical Trend (mini sparkline-style) */}
      {historyPoints.length > 2 && (
        <div className="bg-white rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold text-navy-500 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-teal-600" />
            Health History (Last {historyPoints.length} snapshots)
          </h2>
          <div className="flex items-end gap-1 h-20">
            {historyPoints.map((p, i) => {
              const maxMem = 100;
              const h = Math.max(4, (p.memory / maxMem) * 80);
              const allHealthy = p.containers === p.total && p.alerts === 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                  <div
                    className={cn("w-full rounded-t transition-all",
                      allHealthy ? "bg-emerald-400" : p.alerts > 0 ? "bg-red-400" : "bg-amber-400"
                    )}
                    style={{ height: `${h}px`, minWidth: "4px" }}
                  />
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-navy-500 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                    {format(new Date(p.time), "MMM d, HH:mm")} — Mem: {p.memory}% · {p.containers}/{p.total} up
                    {p.alerts > 0 && ` · ${p.alerts} alerts`}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            {historyPoints.length > 0 && (
              <>
                <span>{format(new Date(historyPoints[0].time), "HH:mm")}</span>
                <span>{format(new Date(historyPoints[historyPoints.length - 1].time), "HH:mm")}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edge Functions */}
      {latest?.edge_functions && latest.edge_functions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-navy-500 mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4 text-teal-600" />
            Edge Functions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {latest.edge_functions.map((fn) => (
              <div key={fn.name} className="bg-white rounded-xl border border-border p-3.5 flex items-center gap-3">
                <div className={cn("w-2.5 h-2.5 rounded-full",
                  fn.status === "active" ? "bg-emerald-500" : "bg-red-500"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy-500 truncate">{fn.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {fn.lastInvoked || fn.last_invoked
                      ? `Last: ${formatDistanceToNow(new Date(fn.lastInvoked || fn.last_invoked!), { addSuffix: true })}`
                      : "No invocations"
                    }
                    {fn.errorRate && ` · Errors: ${fn.errorRate}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Health Reports Feed */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-navy-500 flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-600" />
            Agent Reports
          </h2>
          {infraActivity.length > 5 && (
            <button
              onClick={() => setShowAllReports(!showAllReports)}
              className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
            >
              {showAllReports ? "Show less" : `Show all (${infraActivity.length})`}
              {showAllReports ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>

        {infraActivity.length > 0 ? (
          <div className="bg-white rounded-xl border border-border divide-y divide-border">
            {(showAllReports ? infraActivity : infraActivity.slice(0, 5)).map((report) => {
              const isAlert = report.activity_type === "alert" ||
                report.title.toLowerCase().includes("critical") ||
                report.title.toLowerCase().includes("issue");
              const isOk = report.title.toLowerCase().includes("healthy") ||
                report.title.toLowerCase().includes("operational") ||
                report.title.toLowerCase().includes("all clear");

              return (
                <div key={report.id} className="p-3.5">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                      isAlert ? "bg-red-50" : isOk ? "bg-emerald-50" : "bg-teal-50"
                    )}>
                      {isAlert ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                      ) : isOk ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Server className="w-3.5 h-3.5 text-teal-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className={cn("text-sm font-semibold", isAlert ? "text-red-700" : "text-navy-500")}>
                          {report.title}
                        </h3>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-medium",
                          report.activity_type === "alert" ? "bg-red-100 text-red-700"
                            : report.activity_type === "infra_snapshot" ? "bg-teal-100 text-teal-700"
                            : "bg-gray-100 text-gray-600"
                        )}>
                          {report.activity_type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{report.summary}</p>
                      {report.full_content && (
                        <ViewOutputButton
                          content={report.full_content}
                          title={report.title}
                          summary={report.summary}
                          badge={report.activity_type}
                          emoji="🏗️"
                          subtitle="Infra Agent"
                          label="View full report"
                          className="mt-2 text-[10px]"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : !hasData ? (
          <div className="bg-white rounded-xl border border-border p-12 text-center">
            <Server className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500 mb-1">No infrastructure data yet</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Deploy the monitoring script to Naboo to start collecting container stats,
              system metrics, and Prometheus data every 5 minutes.
            </p>
            <div className="mt-4 bg-slate-50 rounded-lg p-3 text-left max-w-lg mx-auto">
              <p className="text-[10px] font-mono text-slate-500">
                scp scripts/infra-monitor.sh root@10.0.1.100:/mnt/user/appdata/scripts/<br />
                ssh root@10.0.1.100<br />
                chmod +x /mnt/user/appdata/scripts/infra-monitor.sh<br />
                crontab -e<br />
                */5 * * * * /mnt/user/appdata/scripts/infra-monitor.sh
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
