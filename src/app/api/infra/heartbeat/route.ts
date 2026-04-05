import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/infra/heartbeat
 *
 * Naboo-side script posts here on a cron with the current Ollama status.
 * Vercel can't reach the LAN Ollama directly, so this heartbeat is what
 * the AI Providers card reads via `checkOllamaViaInfraAgent()` in
 * /api/ai-costs.
 *
 * Auth: Bearer token via INGEST_API_KEY (same token used by the rest of
 * the Mission Control ingest surface).
 *
 * Body shape:
 * {
 *   "provider": "ollama",
 *   "status": "active" | "error",
 *   "models": ["qwen2.5:32b", ...],     // optional
 *   "error":  "message"                  // optional, when status = error
 * }
 *
 * Writes an agent_activity row with agent_id='infra',
 * activity_type='ollama_status' — the shape `checkOllamaViaInfraAgent`
 * already expects.
 */

interface HeartbeatBody {
  provider?: string;
  status?: "active" | "error";
  models?: string[];
  error?: string;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const apiKey = process.env.INGEST_API_KEY;
  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: HeartbeatBody;
  try {
    body = (await request.json()) as HeartbeatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.provider !== "ollama") {
    return NextResponse.json(
      { error: "Only provider='ollama' is supported" },
      { status: 400 }
    );
  }
  if (body.status !== "active" && body.status !== "error") {
    return NextResponse.json(
      { error: "status must be 'active' or 'error'" },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const checkedAt = new Date().toISOString();
  const modelCount = Array.isArray(body.models) ? body.models.length : 0;

  const { data, error } = await supabase
    .from("agent_activity")
    .insert({
      agent_id: "infra",
      activity_type: "ollama_status",
      title: `Ollama ${body.status === "active" ? "healthy" : "error"} — ${modelCount} models`,
      summary:
        body.status === "active"
          ? `${modelCount} local models available on Naboo`
          : body.error || "Ollama unreachable",
      metadata: {
        status: body.status,
        models: body.models ?? [],
        error: body.error ?? null,
        checked_at: checkedAt,
      },
      status: body.status,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id, checked_at: checkedAt });
}
