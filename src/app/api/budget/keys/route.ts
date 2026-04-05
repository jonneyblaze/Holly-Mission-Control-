import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encrypt } from "@/lib/crypto";
import { createKey, getKey as orGetKey } from "@/lib/openrouter-keys";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET  /api/budget/keys  — list every stored key + live OR usage.
 * POST /api/budget/keys  — provision a new OR key for an agent and store it.
 *
 * Auth: Bearer `INGEST_API_KEY` (same token the cron uses), or
 * Vercel Cron secret, or localhost in dev. Matches the pattern in
 * `/api/budget/sync`.
 *
 * POST returns the raw `api_key` field ONCE — subsequent GETs never
 * include it. Callers MUST capture it on the first response.
 */

function isAuthed(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = request.headers.get("x-vercel-cron-secret");
  const apiKey = process.env.INGEST_API_KEY;
  const vercelCronSecret = process.env.CRON_SECRET;
  return (
    (!!apiKey && authHeader === `Bearer ${apiKey}`) ||
    (!!vercelCronSecret && cronSecret === vercelCronSecret) ||
    (!!vercelCronSecret && authHeader === `Bearer ${vercelCronSecret}`) ||
    request.headers.get("host")?.includes("localhost") === true
  );
}

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = adminSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: rows, error } = await supabase
    .from("openrouter_keys")
    .select(
      "id, agent_id, label, or_key_hash, monthly_limit_usd, disabled, last_rotated_at, created_at, updated_at"
    )
    .order("agent_id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fan out to OR to attach live usage per key. Any individual failure
  // degrades to `usage_error` on that row — we never fail the whole list.
  const enriched = await Promise.all(
    (rows ?? []).map(async (r) => {
      try {
        const meta = await orGetKey(r.or_key_hash);
        return {
          ...r,
          usage_usd: meta.usage,
          or_disabled: meta.disabled,
          or_limit: meta.limit,
          usage_error: null as string | null,
        };
      } catch (err) {
        return {
          ...r,
          usage_usd: null,
          or_disabled: null,
          or_limit: null,
          usage_error: err instanceof Error ? err.message : "OR lookup failed",
        };
      }
    })
  );

  return NextResponse.json({ ok: true, keys: enriched });
}

interface CreateBody {
  agent_id?: string;
  label?: string;
  monthly_limit_usd?: number | null;
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const agentId = body.agent_id?.trim();
  const label = body.label?.trim() || agentId;
  const limit =
    body.monthly_limit_usd === undefined || body.monthly_limit_usd === null
      ? null
      : Number(body.monthly_limit_usd);

  if (!agentId) {
    return NextResponse.json({ error: "agent_id is required" }, { status: 400 });
  }
  if (limit !== null && (Number.isNaN(limit) || limit < 0)) {
    return NextResponse.json(
      { error: "monthly_limit_usd must be a non-negative number or null" },
      { status: 400 }
    );
  }

  const supabase = adminSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Refuse to overwrite an existing row — rotation has its own endpoint.
  const { data: existing } = await supabase
    .from("openrouter_keys")
    .select("agent_id")
    .eq("agent_id", agentId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: `Key already exists for agent_id=${agentId} — use /rotate instead` },
      { status: 409 }
    );
  }

  // Provision at OR first — if this fails, no DB row is written.
  let created;
  try {
    created = await createKey({ name: agentId, label, limit });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OR provisioning failed" },
      { status: 502 }
    );
  }

  // Encrypt + persist. If the DB insert fails AFTER the OR key was
  // created we leak an orphan key on OR's side — surface that clearly
  // so the operator can clean it up manually.
  let encrypted: string;
  try {
    encrypted = encrypt(created.key);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Encryption failed: ${err instanceof Error ? err.message : "unknown"}`,
        or_key_hash_orphan: created.data.hash,
      },
      { status: 500 }
    );
  }

  const { error: insertErr } = await supabase.from("openrouter_keys").insert({
    agent_id: agentId,
    label,
    or_key_hash: created.data.hash,
    api_key_encrypted: encrypted,
    monthly_limit_usd: limit,
    disabled: false,
  });

  if (insertErr) {
    return NextResponse.json(
      {
        error: `DB insert failed: ${insertErr.message}`,
        or_key_hash_orphan: created.data.hash,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    agent_id: agentId,
    label,
    or_key_hash: created.data.hash,
    monthly_limit_usd: limit,
    api_key: created.key, // shown ONCE — operator must capture now
    warning: "api_key is returned only on creation — store it now, it will never be returned again",
  });
}
