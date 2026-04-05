import { NextResponse } from "next/server";

/**
 * AI Cost Tracker API
 * Fetches usage/spend from OpenRouter + Anthropic, plus Ollama status via
 * the infra agent heartbeat (Naboo can't be reached directly from Vercel).
 *
 * Required env vars:
 *   OPENROUTER_API_KEY  — OpenRouter API key
 *   ANTHROPIC_API_KEY   — Anthropic API key (optional, for health check)
 */

interface ProviderStatus {
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
  providers: ProviderStatus[];
  totalDailySpend: number;
  totalWeeklySpend: number;
  totalMonthlySpend: number;
  warnings: string[];
  fetchedAt: string;
}

async function checkOpenRouter(): Promise<ProviderStatus> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { provider: "OpenRouter", status: "no_key" };

  try {
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return {
        provider: "OpenRouter",
        status: "error",
        error: `HTTP ${res.status}`,
      };
    }

    const json = await res.json();
    const d = json.data;

    const limit = d.limit ?? 0;
    const remaining = d.limit_remaining ?? 0;
    const usage = d.usage ?? 0;
    const percentUsed = limit > 0 ? ((usage / limit) * 100) : 0;

    const status: ProviderStatus["status"] =
      remaining <= 0 && limit > 0
        ? "limit_exceeded"
        : remaining < limit * 0.1 && limit > 0
          ? "error" // treat < 10% remaining as warning
          : "active";

    return {
      provider: "OpenRouter",
      status,
      usage: Math.round(usage * 100) / 100,
      limit: limit > 0 ? limit : undefined,
      remaining: limit > 0 ? Math.round(remaining * 100) / 100 : undefined,
      usageDaily: Math.round((d.usage_daily ?? 0) * 100) / 100,
      usageWeekly: Math.round((d.usage_weekly ?? 0) * 100) / 100,
      usageMonthly: Math.round((d.usage_monthly ?? 0) * 100) / 100,
      percentUsed: Math.round(percentUsed),
      models: ["gemini-2.5-flash", "gemini-2.5-pro", "deepseek-v3"],
    };
  } catch (err) {
    return {
      provider: "OpenRouter",
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function checkAnthropic(): Promise<ProviderStatus> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { provider: "Anthropic", status: "no_key" };

  try {
    // Simple health check — hit messages endpoint with minimal request
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "." }],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401) {
      return {
        provider: "Anthropic",
        status: "error",
        error: "Invalid API key (401)",
      };
    }

    if (res.status === 429) {
      return {
        provider: "Anthropic",
        status: "limit_exceeded",
        error: "Rate limited (429)",
      };
    }

    // 200 or even 400 (bad request) means the key is valid
    if (res.ok || res.status === 400) {
      return {
        provider: "Anthropic",
        status: "active",
        models: ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4"],
      };
    }

    return {
      provider: "Anthropic",
      status: "error",
      error: `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      provider: "Anthropic",
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function checkOllamaViaInfraAgent(): Promise<ProviderStatus | null> {
  // Fallback: read Ollama status from infra agent's latest snapshot in Mission Control DB
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/agent_activity?agent_id=eq.infra&activity_type=eq.ollama_status&order=created_at.desc&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) return null;

    const rows = await res.json();
    if (!rows || rows.length === 0) return null;

    const meta = rows[0].metadata;
    if (!meta) return null;

    // Check if the snapshot is recent (within 15 minutes)
    const checkedAt = meta.checked_at ? new Date(meta.checked_at) : new Date(rows[0].created_at);
    const ageMinutes = (Date.now() - checkedAt.getTime()) / 60_000;

    return {
      provider: "Ollama (Local)",
      status: meta.status === "active" ? "active" : "error",
      error: meta.error || (ageMinutes > 15 ? `Last seen ${Math.round(ageMinutes)}m ago` : undefined),
      usage: 0,
      models: Array.isArray(meta.models) ? meta.models.slice(0, 8) : undefined,
    };
  } catch {
    return null;
  }
}

async function checkOllama(): Promise<ProviderStatus> {
  // Ollama lives on Naboo (10.0.1.100) which is unreachable from Vercel,
  // so we read the latest heartbeat posted by the Naboo cron script to
  // /api/infra/heartbeat. `checkOllamaViaInfraAgent()` pulls that row from
  // `agent_activity` and returns a provider snapshot.
  const fromAgent = await checkOllamaViaInfraAgent();
  if (fromAgent) return fromAgent;

  return {
    provider: "Ollama (Local)",
    status: "error",
    error: "Waiting for infra agent heartbeat",
  };
}

export async function GET() {
  const [openrouter, anthropic, ollama] = await Promise.all([
    checkOpenRouter(),
    checkAnthropic(),
    checkOllama(),
  ]);

  const providers = [openrouter, anthropic, ollama];

  // Build warnings
  const warnings: string[] = [];
  for (const p of providers) {
    if (p.status === "error") {
      warnings.push(`${p.provider}: ${p.error || "unhealthy"}`);
    }
    if (p.status === "limit_exceeded") {
      warnings.push(`${p.provider}: spending limit exceeded — agents will fail!`);
    }
    if (p.status === "no_key") {
      warnings.push(`${p.provider}: no API key configured`);
    }
    if (p.provider === "OpenRouter" && p.percentUsed && p.percentUsed >= 80) {
      warnings.push(
        `OpenRouter: ${p.percentUsed}% of \$${p.limit} limit used — \$${p.remaining} remaining`
      );
    }
  }

  // Sum spend across ALL providers that report costs
  const totalDaily = providers.reduce((sum, p) => sum + (p.usageDaily ?? 0), 0);
  const totalWeekly = providers.reduce((sum, p) => sum + (p.usageWeekly ?? 0), 0);
  const totalMonthly = providers.reduce((sum, p) => sum + (p.usageMonthly ?? 0), 0);

  const data: AICostData = {
    providers,
    totalDailySpend: Math.round(totalDaily * 100) / 100,
    totalWeeklySpend: Math.round(totalWeekly * 100) / 100,
    totalMonthlySpend: Math.round(totalMonthly * 100) / 100,
    warnings,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=60" },
  });
}
