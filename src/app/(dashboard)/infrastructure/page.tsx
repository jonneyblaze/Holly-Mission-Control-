"use client";

import { cn } from "@/lib/utils";
import { useMCTable } from "@/lib/hooks/use-mission-control";
import { useState, useMemo, useEffect, useCallback } from "react";
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
  Cloud,
  ExternalLink,
  GitBranch,
  Zap,
  DollarSign,
  Brain,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ViewOutputButton } from "@/components/dashboard/ContentModal";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

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
  prometheus?: {
    charts?: {
      cpu?: { t: number; v: number }[];
      memory?: { t: number; v: number }[];
      disk_io?: { t: number; v: number }[];
      network?: { t: number; v: number }[];
    };
    [key: string]: unknown;
  };
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

// ---------- Cloud Status Types ----------
interface CloudSubProject {
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  url: string;
  latency_ms?: number;
  details: Record<string, unknown>;
}

interface CloudDeployment {
  uid: string;
  name: string;
  url: string;
  state: string;
  created: number;
  meta?: { githubCommitMessage?: string; githubCommitRef?: string };
}

interface CloudStatus {
  health: "healthy" | "degraded" | "critical";
  checked_at: string;
  vercel: {
    mission_control: CloudSubProject | null;
    bodylytics: CloudSubProject | null;
    recent_deployments: CloudDeployment[];
  };
  supabase: {
    mission_control: CloudSubProject | null;
    bodylytics: CloudSubProject | null;
  };
  uptime: CloudSubProject[];
}

// ---------- AI Cost Types ----------
interface AIProviderStatus {
  provider: string;
  status: "active" | "error" | "no_key" | "limit_exceeded";
  error?: string;
  usage?: number;
  limit?: number;
  remaining?: number;
  usageDaily?: number;
  usageWeekly?: number;
  usageMonthly?: number;
  percentUsed?: number;
  models?: string[];
}

interface AICostData {
  providers: AIProviderStatus[];
  totalDailySpend: number;
  totalWeeklySpend: number;
  totalMonthlySpend: number;
  warnings: string[];
  fetchedAt: string;
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

// ---------- Prometheus Chart ----------
function PrometheusChart({ data, title, color, unit, domain }: {
  data: { t: number; v: number }[];
  title: string;
  color: string;
  unit?: string;
  domain?: [number, number];
}) {
  if (!data || data.length === 0) return null;

  const chartData = data.map((d) => ({
    time: d.t * 1000,
    value: d.v,
  }));

  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <h3 className="text-xs font-semibold text-navy-500 mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="time"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(ts) => format(new Date(ts), "HH:mm")}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={domain || ["auto", "auto"]}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={35}
            tickFormatter={(v) => `${Math.round(v)}${unit || ""}`}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
            labelFormatter={(ts) => format(new Date(ts as number), "HH:mm:ss")}
            formatter={(v) => [`${Number(v).toFixed(1)}${unit || ""}`, title]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#grad-${title})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- Main Page ----------
export default function InfrastructurePage() {
  const [showAllReports, setShowAllReports] = useState(false);
  const [containersExpanded, setContainersExpanded] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus | null>(null);
  const [cloudLoading, setCloudLoading] = useState(true);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [aiCosts, setAiCosts] = useState<AICostData | null>(null);
  const [aiCostsLoading, setAiCostsLoading] = useState(true);

  const fetchCloudStatus = useCallback(async () => {
    try {
      setCloudLoading(true);
      const resp = await fetch("/api/cloud-status");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setCloudStatus(data);
      setCloudError(null);
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setCloudLoading(false);
    }
  }, []);

  const fetchAiCosts = useCallback(async () => {
    try {
      setAiCostsLoading(true);
      const resp = await fetch("/api/ai-costs");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setAiCosts(data);
    } catch {
      // silently fail — section just won't render
    } finally {
      setAiCostsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCloudStatus();
    fetchAiCosts();
    const cloudInterval = setInterval(fetchCloudStatus, 120_000); // Refresh every 2 min
    const aiInterval = setInterval(fetchAiCosts, 120_000); // Refresh every 2 min
    return () => {
      clearInterval(cloudInterval);
      clearInterval(aiInterval);
    };
  }, [fetchCloudStatus, fetchAiCosts]);

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

  // Prometheus time-series charts
  const charts = latest?.prometheus?.charts || null;

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

      {/* ==================== Cloud Infrastructure ==================== */}
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-navy-500 flex items-center gap-2">
            <Cloud className="w-4 h-4 text-teal-600" />
            Cloud Infrastructure
          </h2>
          <div className="flex items-center gap-2">
            {cloudStatus && (
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-medium",
                cloudStatus.health === "healthy" ? "bg-emerald-100 text-emerald-700" :
                cloudStatus.health === "degraded" ? "bg-amber-100 text-amber-700" :
                "bg-red-100 text-red-700"
              )}>
                {cloudStatus.health === "healthy" ? "All Cloud Services Up" :
                 cloudStatus.health === "degraded" ? "Some Issues" : "Critical"}
              </span>
            )}
            <button
              onClick={fetchCloudStatus}
              disabled={cloudLoading}
              className="text-muted-foreground hover:text-navy-500 transition-colors"
              title="Refresh cloud status"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", cloudLoading && "animate-spin")} />
            </button>
          </div>
        </div>

        {cloudLoading && !cloudStatus ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-teal-500 animate-spin" />
            <span className="text-xs text-muted-foreground ml-2">Checking cloud services...</span>
          </div>
        ) : cloudError && !cloudStatus ? (
          <div className="text-center py-6">
            <XCircle className="w-6 h-6 text-red-300 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">{cloudError}</p>
          </div>
        ) : cloudStatus ? (
          <div className="space-y-5">
            {/* Site Uptime Checks */}
            {cloudStatus.uptime.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-slate-500 mb-2.5 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  Site Uptime
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {cloudStatus.uptime.map((site) => (
                    <div
                      key={site.name}
                      className={cn(
                        "rounded-lg border p-3 transition-all",
                        site.status === "healthy" ? "border-emerald-200 bg-emerald-50/50" :
                        site.status === "degraded" ? "border-amber-200 bg-amber-50/50" :
                        "border-red-200 bg-red-50/50"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-navy-500">{site.name}</span>
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          site.status === "healthy" ? "bg-emerald-500" :
                          site.status === "degraded" ? "bg-amber-500" :
                          "bg-red-500"
                        )} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "text-[10px] font-medium",
                          site.status === "healthy" ? "text-emerald-600" :
                          site.status === "degraded" ? "text-amber-600" :
                          "text-red-600"
                        )}>
                          {site.status === "healthy" ? "Online" :
                           site.status === "degraded" ? "Degraded" : "Offline"}
                        </span>
                        {site.latency_ms != null && (
                          <span className="text-[10px] text-muted-foreground">{site.latency_ms}ms</span>
                        )}
                      </div>
                      {site.details?.http_status != null && (
                        <span className="text-[9px] text-muted-foreground">
                          HTTP {String(site.details.http_status)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Vercel + Supabase Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Vercel Section */}
              <div>
                <h3 className="text-xs font-medium text-slate-500 mb-2.5 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  Vercel Deployments
                </h3>
                <div className="space-y-2">
                  {[
                    { label: "Mission Control", data: cloudStatus.vercel.mission_control },
                    { label: "BodyLytics", data: cloudStatus.vercel.bodylytics },
                  ].map(({ label, data }) => (
                    <div
                      key={label}
                      className={cn(
                        "rounded-lg border p-3",
                        !data ? "border-slate-200 bg-slate-50/50" :
                        data.status === "healthy" ? "border-emerald-200 bg-emerald-50/30" :
                        data.status === "degraded" ? "border-amber-200 bg-amber-50/30" :
                        "border-red-200 bg-red-50/30"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-navy-500">{label}</span>
                        {data ? (
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            data.status === "healthy" ? "bg-emerald-100 text-emerald-700" :
                            data.status === "degraded" ? "bg-amber-100 text-amber-700" :
                            "bg-red-100 text-red-700"
                          )}>
                            {data.status === "healthy" ? "READY" :
                             data.status === "degraded" ? "BUILDING" : "ERROR"}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">No token</span>
                        )}
                      </div>
                      {data?.details?.latest_deploy != null && (() => {
                        const dep = data.details.latest_deploy as Record<string, unknown>;
                        const commit = dep?.commit ? String(dep.commit) : null;
                        const branch = dep?.branch ? String(dep.branch) : null;
                        const created = dep?.created ? String(dep.created) : null;
                        return (
                          <div className="text-[10px] text-muted-foreground space-y-0.5">
                            {commit && (
                              <p className="truncate flex items-center gap-1">
                                <GitBranch className="w-2.5 h-2.5 flex-shrink-0" />
                                {commit}
                              </p>
                            )}
                            {branch && (
                              <p className="text-[9px] opacity-70">Branch: {branch}</p>
                            )}
                            {created && (
                              <p className="text-[9px] opacity-70">
                                {formatDistanceToNow(new Date(created), { addSuffix: true })}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      {!data && (
                        <p className="text-[10px] text-muted-foreground">
                          Set VERCEL_TOKEN + project IDs in env
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Supabase Section */}
              <div>
                <h3 className="text-xs font-medium text-slate-500 mb-2.5 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" />
                  Supabase Health
                </h3>
                <div className="space-y-2">
                  {[
                    { label: "Mission Control", data: cloudStatus.supabase.mission_control },
                    { label: "BodyLytics", data: cloudStatus.supabase.bodylytics },
                  ].map(({ label, data }) => (
                    <div
                      key={label}
                      className={cn(
                        "rounded-lg border p-3",
                        !data ? "border-slate-200 bg-slate-50/50" :
                        data.status === "healthy" ? "border-emerald-200 bg-emerald-50/30" :
                        data.status === "degraded" ? "border-amber-200 bg-amber-50/30" :
                        "border-red-200 bg-red-50/30"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-navy-500">{label}</span>
                        {data ? (
                          <div className="flex items-center gap-1.5">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              data.status === "healthy" ? "bg-emerald-500" :
                              data.status === "degraded" ? "bg-amber-500" :
                              "bg-red-500"
                            )} />
                            {data.latency_ms != null && (
                              <span className="text-[10px] text-muted-foreground">{data.latency_ms}ms</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Not configured</span>
                        )}
                      </div>
                      {data?.details && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {["rest_api", "auth", "storage"].map((svc) => {
                            const svcData = data.details[svc] as { status?: string; latency_ms?: number } | undefined;
                            if (!svcData) return null;
                            const isUp = svcData.status === "up";
                            return (
                              <div
                                key={svc}
                                className={cn(
                                  "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded",
                                  isUp ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                                )}
                              >
                                <div className={cn("w-1.5 h-1.5 rounded-full", isUp ? "bg-emerald-400" : "bg-red-400")} />
                                {svc === "rest_api" ? "REST" : svc.charAt(0).toUpperCase() + svc.slice(1)}
                                {svcData.latency_ms != null && (
                                  <span className="opacity-60">{svcData.latency_ms}ms</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Deployments */}
            {cloudStatus.vercel.recent_deployments.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-slate-500 mb-2.5 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  Recent Deployments
                </h3>
                <div className="space-y-1.5">
                  {cloudStatus.vercel.recent_deployments.slice(0, 5).map((deploy) => (
                    <div
                      key={deploy.uid}
                      className="flex items-center gap-3 text-xs bg-slate-50/80 rounded-lg px-3 py-2"
                    >
                      <div className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        deploy.state === "READY" ? "bg-emerald-500" :
                        deploy.state === "ERROR" ? "bg-red-500" :
                        "bg-amber-500"
                      )} />
                      <span className="font-medium text-navy-500 truncate max-w-[120px]">{deploy.name}</span>
                      {deploy.meta?.githubCommitMessage && (
                        <span className="text-muted-foreground truncate flex-1 min-w-0">
                          {deploy.meta.githubCommitMessage.substring(0, 60)}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {formatDistanceToNow(new Date(deploy.created), { addSuffix: true })}
                      </span>
                      <a
                        href={`https://${deploy.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-500 hover:text-teal-700 flex-shrink-0"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Last checked */}
            <p className="text-[10px] text-muted-foreground text-right">
              Last checked: {format(new Date(cloudStatus.checked_at), "HH:mm:ss")}
            </p>
          </div>
        ) : null}
      </div>

      {/* ==================== AI Provider Status ==================== */}
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-navy-500 flex items-center gap-2">
            <Brain className="w-4 h-4 text-teal-600" />
            AI Providers
          </h2>
          <div className="flex items-center gap-2">
            {aiCosts && aiCosts.warnings.length === 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
                All Providers Healthy
              </span>
            )}
            {aiCosts && aiCosts.warnings.length > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                {aiCosts.warnings.length} Warning{aiCosts.warnings.length > 1 ? "s" : ""}
              </span>
            )}
            <button
              onClick={fetchAiCosts}
              disabled={aiCostsLoading}
              className="text-muted-foreground hover:text-navy-500 transition-colors"
              title="Refresh AI provider status"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", aiCostsLoading && "animate-spin")} />
            </button>
          </div>
        </div>

        {aiCostsLoading && !aiCosts ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-teal-500 animate-spin" />
            <span className="text-xs text-muted-foreground ml-2">Checking AI providers...</span>
          </div>
        ) : aiCosts ? (
          <div className="space-y-5">
            {/* Warnings Banner */}
            {aiCosts.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                {aiCosts.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-700">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Spend Summary (if OpenRouter has data) */}
            {(aiCosts.totalDailySpend > 0 || aiCosts.totalWeeklySpend > 0 || aiCosts.totalMonthlySpend > 0) && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Today", value: aiCosts.totalDailySpend },
                  { label: "This Week", value: aiCosts.totalWeeklySpend },
                  { label: "This Month", value: aiCosts.totalMonthlySpend },
                ].map((s) => (
                  <div key={s.label} className="bg-slate-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-navy-500">
                      ${s.value.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Provider Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {aiCosts.providers.map((p) => {
                const statusColor =
                  p.status === "active" ? "border-emerald-200 bg-emerald-50/30" :
                  p.status === "error" ? "border-amber-200 bg-amber-50/30" :
                  p.status === "limit_exceeded" ? "border-red-200 bg-red-50/30" :
                  "border-slate-200 bg-slate-50/50";

                const statusDot =
                  p.status === "active" ? "bg-emerald-500" :
                  p.status === "error" ? "bg-amber-500" :
                  p.status === "limit_exceeded" ? "bg-red-500" :
                  "bg-slate-400";

                const statusLabel =
                  p.status === "active" ? "Active" :
                  p.status === "error" ? "Error" :
                  p.status === "limit_exceeded" ? "Limit Exceeded" :
                  "No Key";

                return (
                  <div key={p.provider} className={cn("rounded-lg border p-3.5 transition-all", statusColor)}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-navy-500">{p.provider}</span>
                      <div className="flex items-center gap-1.5">
                        <div className={cn("w-2 h-2 rounded-full", statusDot)} />
                        <span className={cn(
                          "text-[10px] font-medium",
                          p.status === "active" ? "text-emerald-600" :
                          p.status === "error" ? "text-amber-600" :
                          p.status === "limit_exceeded" ? "text-red-600" :
                          "text-slate-500"
                        )}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>

                    {/* Error message */}
                    {p.error && (
                      <p className="text-[10px] text-red-600 mb-1.5">{p.error}</p>
                    )}

                    {/* OpenRouter usage bar */}
                    {p.provider === "OpenRouter" && p.usage != null && p.limit != null && p.limit > 0 && (
                      <div className="mb-2">
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-muted-foreground">
                            ${p.usage} / ${p.limit}
                          </span>
                          <span className="font-medium text-navy-500">{p.percentUsed}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all duration-500",
                              (p.percentUsed ?? 0) > 90 ? "bg-red-500" :
                              (p.percentUsed ?? 0) > 70 ? "bg-amber-500" :
                              "bg-teal-500"
                            )}
                            style={{ width: `${Math.min(100, p.percentUsed ?? 0)}%` }}
                          />
                        </div>
                        {p.remaining != null && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            ${p.remaining} remaining
                          </p>
                        )}
                      </div>
                    )}

                    {/* OpenRouter spend breakdown */}
                    {p.provider === "OpenRouter" && (p.usageDaily != null || p.usageWeekly != null) && (
                      <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                        {p.usageDaily != null && <span>${p.usageDaily}/day</span>}
                        {p.usageWeekly != null && <span>${p.usageWeekly}/wk</span>}
                        {p.usageMonthly != null && <span>${p.usageMonthly}/mo</span>}
                      </div>
                    )}

                    {/* Models list */}
                    {p.models && p.models.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.models.map((m) => (
                          <span
                            key={m}
                            className="text-[9px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Last checked */}
            <p className="text-[10px] text-muted-foreground text-right">
              Last checked: {format(new Date(aiCosts.fetchedAt), "HH:mm:ss")}
            </p>
          </div>
        ) : (
          <div className="text-center py-6">
            <DollarSign className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Set API keys in env vars to monitor provider health</p>
          </div>
        )}
      </div>

      {/* Prometheus Charts */}
      {charts && (charts.cpu?.length || charts.memory?.length) && (
        <div>
          <h2 className="text-sm font-semibold text-navy-500 mb-3 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-teal-600" />
            Live Metrics (Last 2 Hours)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {charts.cpu && charts.cpu.length > 0 && (
              <PrometheusChart data={charts.cpu} title="CPU Usage" color="#14b8a6" unit="%" domain={[0, 100]} />
            )}
            {charts.memory && charts.memory.length > 0 && (
              <PrometheusChart data={charts.memory} title="Memory Usage" color="#3b82f6" unit="%" domain={[0, 100]} />
            )}
            {charts.disk_io && charts.disk_io.length > 0 && (
              <PrometheusChart data={charts.disk_io} title="Disk I/O" color="#f59e0b" unit=" B/s" />
            )}
            {charts.network && charts.network.length > 0 && (
              <PrometheusChart data={charts.network} title="Network Traffic" color="#8b5cf6" unit=" B/s" />
            )}
          </div>
        </div>
      )}

      {/* Container Grid (Collapsible) */}
      {hasData && (
        <div>
          <button
            onClick={() => setContainersExpanded(!containersExpanded)}
            className="w-full flex items-center justify-between mb-3 group"
          >
            <h2 className="text-sm font-semibold text-navy-500 flex items-center gap-2">
              <Server className="w-4 h-4 text-teal-600" />
              Containers ({runningContainers}/{totalContainers} running)
              {stoppedContainers > 0 && (
                <span className="text-[10px] font-medium text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">
                  {stoppedContainers} stopped
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {!containersExpanded && (
                <div className="flex gap-0.5">
                  {sortedContainers.slice(0, 20).map((c) => (
                    <div
                      key={c.name}
                      className={cn("w-2 h-2 rounded-full",
                        c.status === "running" ? "bg-emerald-400" :
                        c.status === "restarting" ? "bg-amber-400" :
                        "bg-red-400"
                      )}
                      title={`${c.name}: ${c.status}`}
                    />
                  ))}
                  {sortedContainers.length > 20 && (
                    <span className="text-[9px] text-muted-foreground ml-1">+{sortedContainers.length - 20}</span>
                  )}
                </div>
              )}
              {containersExpanded
                ? <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-navy-500 transition-colors" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-navy-500 transition-colors" />
              }
            </div>
          </button>
          {containersExpanded && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
              {sortedContainers.map((c) => (
                <ContainerCard key={c.name} container={c} />
              ))}
            </div>
          )}
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
