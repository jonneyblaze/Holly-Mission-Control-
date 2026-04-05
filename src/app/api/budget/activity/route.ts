import { NextResponse } from "next/server";
import { fetchOpenRouterActivityRange } from "@/lib/budget";

// Hits OpenRouter live on every request — must be dynamic.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/budget/activity?days=7
 *
 * Org-level OpenRouter activity for the dashboard panel. Uses the
 * provisioning key (`OPENROUTER_PROVISIONING_KEY`) to hit
 * `/api/v1/activity`, which returns per-model × per-provider × per-day
 * rows. We roll up to: daily totals (for the sparkline) and model
 * totals (for the table).
 *
 * OR's endpoint only serves *completed* UTC days, so today is never
 * included — the window is `now - days` through yesterday.
 */
export async function GET(request: Request) {
  const provisioningKey = process.env.OPENROUTER_PROVISIONING_KEY;
  if (!provisioningKey) {
    return NextResponse.json(
      { error: "OPENROUTER_PROVISIONING_KEY not configured" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const daysRaw = url.searchParams.get("days");
  const days = daysRaw ? Math.min(30, Math.max(1, Number(daysRaw) || 7)) : 7;

  try {
    const rollup = await fetchOpenRouterActivityRange(provisioningKey, days);
    return NextResponse.json({
      ok: true,
      days,
      ...rollup,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Activity fetch failed",
      },
      { status: 502 }
    );
  }
}
