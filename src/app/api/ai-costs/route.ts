import { NextResponse } from "next/server";

/**
 * AI Cost Tracker API
 * Fetches usage/spend from OpenRouter + OpenAI + Anthropic
 *
 * Required env vars:
 *   OPENROUTER_API_KEY  — OpenRouter API key
 *   OPENAI_API_KEY      — OpenAI API key (optional, for health check)
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

async function checkOpenAI(): Promise<ProviderStatus> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { provider: "OpenAI", status: "no_key" };

  try {
    // Simple health check — list models to verify key is valid
    const res = await fetch("https://api.openai.com/v1/models?limit=1", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401) {
      return {
        provider: "OpenAI",
        status: "error",
        error: "Invalid API key (401)",
      };
    }

    if (res.status === 429) {
      return {
        provider: "OpenAI",
        status: "limit_exceeded",
        error: "Rate limited (429)",
      };
    }

    if (!res.ok) {
      return {
        provider: "OpenAI",
        status: "error",
        error: `HTTP ${res.status}`,
      };
    }

    return {
      provider: "OpenAI",
      status: "active",
      models: ["gpt-4.1-mini", "gpt-4.1", "o4-mini"],
    };
  } catch (err) {
    return {
      provider: "OpenAI",
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

async function checkOllama(): Promise<ProviderStatus> {
  const ollamaUrl = process.env.OLLAMA_URL || "http://10.0.1.100:11434";

  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return {
        provider: "Ollama (Local)",
        status: "error",
        error: `HTTP ${res.status}`,
      };
    }

    const json = await res.json();
    const models = (json.models || []).map((m: { name: string; size: number; details?: { parameter_size?: string } }) => {
      const sizeMb = Math.round(m.size / 1e6);
      const params = m.details?.parameter_size || "";
      return `${m.name}${params ? ` (${params})` : ``}${sizeMb > 0 ? ` ${(sizeMb / 1000).toFixed(1)}GB` : ``}`;
    });

    return {
      provider: "Ollama (Local)",
      status: "active",
      usage: 0,
      models: models.slice(0, 8),
    };
  } catch (err) {
    return {
      provider: "Ollama (Local)",
      status: "error",
      error: err instanceof Error ? err.message : "Unreachable",
    };
  }
}

export async function GET() {
  const [openrouter, openai, anthropic, ollama] = await Promise.all([
    checkOpenRouter(),
    checkOpenAI(),
    checkAnthropic(),
    checkOllama(),
  ]);

  const providers = [openrouter, openai, anthropic, ollama];

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

  const data: AICostData = {
    providers,
    totalDailySpend: openrouter.usageDaily ?? 0,
    totalWeeklySpend: openrouter.usageWeekly ?? 0,
    totalMonthlySpend: openrouter.usageMonthly ?? 0,
    warnings,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=60" },
  });
}
