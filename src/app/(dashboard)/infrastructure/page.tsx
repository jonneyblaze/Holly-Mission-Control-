"use client";

import { cn } from "@/lib/utils";
import { useMCTable } from "@/lib/hooks/use-mission-control";
import {
  Server,
  HardDrive,
  Cpu,
  CircuitBoard,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ---------- Types ----------
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
  disk_usage: { total?: string; used?: string; percent?: number } | null;
  memory_usage: { total?: string; used?: string; percent?: number } | null;
  alerts: InfraAlert[];
  edge_functions: InfraEdgeFunction[];
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

// ---------- Helpers ----------
const statusColor: Record<string, string> = {
  running: "bg-emerald-500",
  healthy: "bg-emerald-500",
  restarting: "bg-amber-500",
  unhealthy: "bg-amber-500",
  stopped: "bg-red-500",
  exited: "bg-red-500",
};

function parseMetrics(content: string | null): {
  containers?: { total: number; healthy: number; unhealthy: string[] };
  memory?: { used: string; total: string; percent: number };
  disk?: { percent: number };
  ssl?: string;
} {
  if (!content) return {};

  const result: ReturnType<typeof parseMetrics> = {};

  // Parse container counts
  const containerMatch = content.match(/(\d+)\s*(?:of\s*)?(\d+)\s*containers?\s*(?:running|active|total)/i)
    || content.match(/(\d+)\s*containers?\s*(?:running|total)/i);
  const unhealthyMatch = content.match(/(\d+)\s*(?:of\s*\d+\s*)?containers?\s*unhealthy/i)
    || content.match(/unhealthy.*?(\d+)/i);

  if (containerMatch) {
    const total = parseInt(containerMatch[2] || containerMatch[1]);
    const unhealthyCount = unhealthyMatch ? parseInt(unhealthyMatch[1]) : 0;
    const healthy = total - unhealthyCount;

    // Extract unhealthy container names
    const unhealthyNames: string[] = [];
    const unhealthySection = content.match(/unhealthy.*?(?:containers?|services?).*?\n([\s\S]*?)(?=\n##|\n\n[A-Z]|$)/i);
    if (unhealthySection) {
      const lines = unhealthySection[1].split('\n');
      for (const line of lines) {
        const nameMatch = line.match(/[-*]\s*\*?\*?([A-Za-z0-9_-]+)\*?\*?\s*[-–:]/);
        if (nameMatch) unhealthyNames.push(nameMatch[1]);
      }
    }

    result.containers = { total, healthy, unhealthy: unhealthyNames };
  }

  // Parse memory
  const memMatch = content.match(/Memory.*?(\d+(?:\.\d+)?)\s*GB.*?(\d+(?:\.\d+)?)\s*GB.*?(\d+)%/i)
    || content.match(/(\d+(?:\.\d+)?)\s*GB?\s*\/\s*(\d+(?:\.\d+)?)\s*GB?\s*.*?(\d+)%/i);
  if (memMatch) {
    result.memory = { used: `${memMatch[1]}GB`, total: `${memMatch[2]}GB`, percent: parseInt(memMatch[3]) };
  }

  // Parse disk
  const diskMatch = content.match(/Disk.*?(\d+)%/i);
  if (diskMatch) {
    result.disk = { percent: parseInt(diskMatch[1]) };
  }

  // Parse SSL
  const sslMatch = content.match(/SSL.*?valid.*?(\d+)\s*days/i) || content.match(/(\d+)\s*days?\s*remaining/i);
  if (sslMatch) {
    result.ssl = `${sslMatch[1]} days remaining`;
  }

  return result;
}

// ---------- Component ----------
export default function InfrastructurePage() {
  // Structured snapshots (if any agent posts with proper metadata)
  const { data: snapshots, loading: snapshotsLoading } = useMCTable<InfraSnapshot>("infra_snapshots", {
    realtime: true,
    orderBy: "snapshot_at",
    orderAsc: false,
    limit: 1,
  });

  // Agent activity from infra agent (always available)
  const { data: infraActivity, loading: activityLoading } = useMCTable<AgentActivity>("agent_activity", {
    realtime: true,
    orderBy: "created_at",
    orderAsc: false,
    limit: 10,
    filter: { agent_id: "infra" },
  });

  const latest = snapshots.length > 0 ? snapshots[0] : null;
  const hasStructuredData = latest && latest.containers && latest.containers.length > 0;

  // Parse metrics from latest infra activity post
  const latestInfraReport = infraActivity.length > 0 ? infraActivity[0] : null;
  const parsedMetrics = parseMetrics(latestInfraReport?.full_content || latestInfraReport?.summary || null);

  // Use structured data if available, otherwise use parsed metrics
  const containerTotal = hasStructuredData
    ? latest!.containers.length
    : parsedMetrics.containers?.total ?? 0;
  const containerHealthy = hasStructuredData
    ? latest!.containers.filter((c) => c.status === "running").length
    : parsedMetrics.containers?.healthy ?? 0;

  const diskUsage = hasStructuredData
    ? (latest!.disk_usage?.percent ?? 0)
    : (parsedMetrics.disk?.percent ?? 0);
  const memoryUsage = hasStructuredData
    ? (latest!.memory_usage?.percent ?? 0)
    : (parsedMetrics.memory?.percent ?? 0);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">Infrastructure</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Naboo (10.0.1.100) &middot; {containerHealthy}/{containerTotal} containers healthy
            {latestInfraReport && (
              <span className="ml-2">
                &middot; Updated {formatDistanceToNow(new Date(latestInfraReport.created_at), { addSuffix: true })}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          {diskUsage > 0 && (
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border">
              <HardDrive className={cn("w-4 h-4", diskUsage > 80 ? "text-red-500" : "text-navy-400")} />
              <span className={cn("font-medium", diskUsage > 80 ? "text-red-600" : "text-navy-500")}>{diskUsage}%</span>
              <span className="text-muted-foreground">Disk</span>
            </div>
          )}
          {memoryUsage > 0 && (
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border">
              <CircuitBoard className="w-4 h-4 text-navy-400" />
              <span className="text-navy-500 font-medium">{memoryUsage}%</span>
              <span className="text-muted-foreground">Memory</span>
            </div>
          )}
          {parsedMetrics.ssl && (
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-navy-500 font-medium text-xs">SSL: {parsedMetrics.ssl}</span>
            </div>
          )}
        </div>
      </div>

      {/* Structured Container Grid (when we have structured snapshot data) */}
      {hasStructuredData && (
        <div>
          <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">Containers</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {latest!.containers.map((c) => (
              <div
                key={c.name}
                className="bg-white rounded-xl border border-border p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-navy-400" />
                    <span className="text-sm font-semibold text-navy-500">{c.name}</span>
                  </div>
                  <div className={cn("w-2.5 h-2.5 rounded-full", statusColor[c.status] || "bg-slate-400")} />
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
      )}

      {/* Unhealthy containers from parsed report */}
      {!hasStructuredData && parsedMetrics.containers && parsedMetrics.containers.unhealthy.length > 0 && (
        <div>
          <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 inline mr-2" />
            Unhealthy Containers ({parsedMetrics.containers.unhealthy.length})
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {parsedMetrics.containers.unhealthy.map((name) => (
              <div key={name} className="bg-white rounded-xl border border-amber-200 p-3 flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-sm font-medium text-navy-500">{name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Infrastructure Reports Feed */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-montserrat font-semibold text-navy-500">Health Reports</h2>
        </div>
        {infraActivity.length > 0 ? (
          <div className="bg-white rounded-xl border border-border divide-y divide-border">
            {infraActivity.map((report) => {
              const isAlert = report.activity_type === "alert" ||
                report.title.toLowerCase().includes("critical") ||
                report.title.toLowerCase().includes("issue");
              const isOk = report.title.toLowerCase().includes("all clear") ||
                report.title.toLowerCase().includes("healthy") ||
                report.title.toLowerCase().includes("optimal");

              return (
                <div key={report.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                      isAlert ? "bg-red-50" : isOk ? "bg-emerald-50" : "bg-teal-50"
                    )}>
                      {isAlert ? (
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      ) : isOk ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Server className="w-4 h-4 text-teal-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={cn(
                          "text-sm font-semibold",
                          isAlert ? "text-red-700" : "text-navy-500"
                        )}>
                          {report.title}
                        </h3>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-medium",
                          isAlert ? "bg-red-100 text-red-700"
                            : report.activity_type === "infra_snapshot" ? "bg-teal-100 text-teal-700"
                            : "bg-gray-100 text-gray-600"
                        )}>
                          {report.activity_type}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{report.summary}</p>
                      {report.full_content && (
                        <details className="mt-2">
                          <summary className="text-xs text-teal-600 cursor-pointer hover:text-teal-700 font-medium">
                            View full report
                          </summary>
                          <pre className="mt-2 text-xs text-navy-400 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 max-h-80 overflow-y-auto">
                            {report.full_content}
                          </pre>
                        </details>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border p-8 text-center">
            <Server className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No infrastructure reports yet. The infra agent will POST health checks here.
            </p>
          </div>
        )}
      </div>

      {/* Structured Alerts (from snapshot) */}
      {hasStructuredData && latest!.alerts && latest!.alerts.length > 0 && (
        <div>
          <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">Alert History</h2>
          <div className="bg-white rounded-xl border border-border divide-y">
            {latest!.alerts.map((alert) => (
              <div key={alert.id} className="flex items-center gap-4 p-4">
                {alert.resolved ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                ) : (
                  <AlertTriangle className={cn("w-4 h-4 flex-shrink-0",
                    alert.severity === "critical" ? "text-red-500"
                      : alert.severity === "warning" ? "text-amber-500"
                      : "text-blue-500"
                  )} />
                )}
                <p className={cn("text-sm flex-1",
                  alert.resolved ? "text-muted-foreground line-through" : "text-navy-500 font-medium"
                )}>
                  {alert.message}
                </p>
                <span className="text-xs text-muted-foreground">{alert.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edge Functions (from snapshot) */}
      {hasStructuredData && latest!.edge_functions && latest!.edge_functions.length > 0 && (
        <div>
          <h2 className="text-lg font-montserrat font-semibold text-navy-500 mb-3">Edge Functions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {latest!.edge_functions.map((fn) => (
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
      )}
    </div>
  );
}
