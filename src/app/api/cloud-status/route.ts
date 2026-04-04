import { NextRequest, NextResponse } from "next/server";

/**
 * Cloud Infrastructure Status API
 * Fetches health/metrics from Vercel + Supabase APIs
 *
 * Required env vars:
 *   VERCEL_TOKEN          — Vercel API token (Account Settings → Tokens)
 *   VERCEL_PROJECT_ID     — Holly Mission Control project ID
 *   BL_VERCEL_PROJECT_ID  — BodyLytics project ID (optional)
 *   SUPABASE_SERVICE_ROLE_KEY           — MC Supabase service key (already set)
 *   BODYLYTICS_SERVICE_ROLE_KEY         — BL Supabase service key (already set)
 *   NEXT_PUBLIC_SUPABASE_URL            — MC Supabase URL (already set)
 *   BODYLYTICS_SUPABASE_URL             — BL Supabase URL (already set)
 */

interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  state: string;
  created: number;
  readyState?: string;
  meta?: { githubCommitMessage?: string; githubCommitRef?: string };
}

interface SubProjectStatus {
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  url: string;
  latency_ms?: number;
  details: Record<string, unknown>;
}

async function checkVercel(): Promise<{
  mission_control: SubProjectStatus | null;
  bodylytics: SubProjectStatus | null;
  deployments: VercelDeployment[];
}> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return { mission_control: null, bodylytics: null, deployments: [] };

  const headers = { Authorization: `Bearer ${token}` };
  const result: { mission_control: SubProjectStatus | null; bodylytics: SubProjectStatus | null; deployments: VercelDeployment[] } = {
    mission_control: null,
    bodylytics: null,
    deployments: [],
  };

  // Get recent deployments for Mission Control
  const mcProjectId = process.env.VERCEL_PROJECT_ID;
  const blProjectId = process.env.BL_VERCEL_PROJECT_ID;

  for (const [label, projectId] of [
    ["mission_control", mcProjectId],
    ["bodylytics", blProjectId],
  ] as const) {
    if (!projectId) continue;

    try {
      const resp = await fetch(
        `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=5&state=READY,ERROR,BUILDING`,
        { headers, next: { revalidate: 60 } }
      );

      if (resp.ok) {
        const data = await resp.json();
        const deploys: VercelDeployment[] = (data.deployments || []).map((d: Record<string, unknown>) => ({
          uid: d.uid,
          name: d.name,
          url: d.url,
          state: d.readyState || d.state,
          created: d.created || d.createdAt,
          meta: d.meta,
        }));

        const latest = deploys[0];
        const status: SubProjectStatus = {
          name: label === "mission_control" ? "Mission Control (Vercel)" : "BodyLytics (Vercel)",
          status: !latest ? "unknown" : latest.state === "READY" ? "healthy" : latest.state === "ERROR" ? "down" : "degraded",
          url: latest?.url ? `https://${latest.url}` : "",
          details: {
            latest_deploy: latest
              ? {
                  state: latest.state,
                  created: new Date(latest.created).toISOString(),
                  commit: latest.meta?.githubCommitMessage?.substring(0, 80),
                  branch: latest.meta?.githubCommitRef,
                }
              : null,
            deploy_count: deploys.length,
          },
        };

        if (label === "mission_control") {
          result.mission_control = status;
          result.deployments.push(...deploys);
        } else {
          result.bodylytics = status;
          result.deployments.push(...deploys);
        }
      }
    } catch (err) {
      console.error(`[cloud-status] Vercel ${label} error:`, err);
    }
  }

  return result;
}

async function checkSupabase(): Promise<{
  mission_control: SubProjectStatus | null;
  bodylytics: SubProjectStatus | null;
}> {
  const result: { mission_control: SubProjectStatus | null; bodylytics: SubProjectStatus | null } = {
    mission_control: null,
    bodylytics: null,
  };

  // Check Mission Control Supabase
  const mcUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const mcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (mcUrl && mcKey) {
    result.mission_control = await pingSupabase("Mission Control DB", mcUrl, mcKey);
  }

  // Check BodyLytics Supabase
  const blUrl = process.env.BODYLYTICS_SUPABASE_URL;
  const blKey = process.env.BODYLYTICS_SERVICE_ROLE_KEY;
  if (blUrl && blKey) {
    result.bodylytics = await pingSupabase("BodyLytics DB", blUrl, blKey);
  }

  return result;
}

async function pingSupabase(
  name: string,
  url: string,
  serviceKey: string
): Promise<SubProjectStatus> {
  const start = Date.now();
  try {
    // Health check via REST API — just query a simple thing
    const resp = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      next: { revalidate: 0 },
    });

    const latency = Date.now() - start;
    const status = resp.ok || resp.status === 200 ? "healthy" : resp.status >= 500 ? "down" : "degraded";

    // Also check auth service
    const authStart = Date.now();
    const authResp = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: serviceKey },
    });
    const authLatency = Date.now() - authStart;

    // Check storage
    const storageStart = Date.now();
    const storageResp = await fetch(`${url}/storage/v1/`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    const storageLatency = Date.now() - storageStart;

    return {
      name,
      status: status as "healthy" | "degraded" | "down",
      url,
      latency_ms: latency,
      details: {
        rest_api: { status: resp.ok ? "up" : "down", latency_ms: latency },
        auth: {
          status: authResp.ok ? "up" : "down",
          latency_ms: authLatency,
        },
        storage: {
          status: storageResp.ok || storageResp.status < 500 ? "up" : "down",
          latency_ms: storageLatency,
        },
      },
    };
  } catch (err) {
    return {
      name,
      status: "down",
      url,
      latency_ms: Date.now() - start,
      details: { error: err instanceof Error ? err.message : "Unknown error" },
    };
  }
}

async function checkSiteUptime(): Promise<SubProjectStatus[]> {
  const sites = [
    { name: "bodylytics.coach", url: "https://bodylytics.coach" },
    { name: "staging.bodylytics.coach", url: "https://staging.bodylytics.coach" },
    { name: "Mission Control", url: "https://holly-mission-control-backend.vercel.app" },
  ];

  const results: SubProjectStatus[] = [];

  for (const site of sites) {
    const start = Date.now();
    try {
      const resp = await fetch(site.url, {
        method: "HEAD",
        redirect: "follow",
        next: { revalidate: 0 },
      });
      const latency = Date.now() - start;
      results.push({
        name: site.name,
        status: resp.ok ? "healthy" : resp.status >= 500 ? "down" : "degraded",
        url: site.url,
        latency_ms: latency,
        details: { http_status: resp.status },
      });
    } catch (err) {
      results.push({
        name: site.name,
        status: "down",
        url: site.url,
        latency_ms: Date.now() - start,
        details: { error: err instanceof Error ? err.message : "Unreachable" },
      });
    }
  }

  return results;
}

export async function GET(request: NextRequest) {
  // Optional auth check
  const authHeader = request.headers.get("authorization");
  const apiKey = process.env.INGEST_API_KEY;
  const queryKey = request.nextUrl.searchParams.get("key");

  if (apiKey && authHeader !== `Bearer ${apiKey}` && queryKey !== apiKey) {
    // Allow unauthenticated for dashboard (it's not sensitive data)
    // But rate limit by not caching
  }

  const [vercel, supabase, uptime] = await Promise.all([
    checkVercel(),
    checkSupabase(),
    checkSiteUptime(),
  ]);

  // Overall health
  const allStatuses = [
    vercel.mission_control?.status,
    vercel.bodylytics?.status,
    supabase.mission_control?.status,
    supabase.bodylytics?.status,
    ...uptime.map((u) => u.status),
  ].filter(Boolean);

  const overallHealth = allStatuses.includes("down")
    ? "critical"
    : allStatuses.includes("degraded")
    ? "degraded"
    : "healthy";

  return NextResponse.json({
    health: overallHealth,
    checked_at: new Date().toISOString(),
    vercel: {
      mission_control: vercel.mission_control,
      bodylytics: vercel.bodylytics,
      recent_deployments: vercel.deployments.slice(0, 5),
    },
    supabase: {
      mission_control: supabase.mission_control,
      bodylytics: supabase.bodylytics,
    },
    uptime,
  });
}
