import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import {
  deleteKey as orDeleteKey,
  getKey as orGetKey,
  updateKey as orUpdateKey,
} from "@/lib/openrouter-keys";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET    /api/budget/keys/:agent_id         — row + live usage (never includes secret unless ?reveal=1)
 * PATCH  /api/budget/keys/:agent_id         — update label / monthly_limit_usd / disabled
 * DELETE /api/budget/keys/:agent_id         — tear down the OR key and the DB row
 *
 * ?reveal=1 on GET will decrypt and return the raw `api_key`. Used
 * exclusively by the PR 4 Naboo plumbing workflow — pull the secret
 * once, write it into openclaw.json, re-lock. Same Bearer auth as the
 * rest; no public path ever emits this field.
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

type RouteContext = { params: Promise<{ agent_id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agent_id: agentId } = await params;
  const reveal = new URL(request.url).searchParams.get("reveal") === "1";

  const supabase = adminSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: row, error } = await supabase
    .from("openrouter_keys")
    .select("*")
    .eq("agent_id", agentId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Pull live usage — non-fatal on failure.
  let orMeta = null;
  let orError: string | null = null;
  try {
    orMeta = await orGetKey(row.or_key_hash);
  } catch (err) {
    orError = err instanceof Error ? err.message : "OR lookup failed";
  }

  // Strip the encrypted blob from the default response. It's an
  // implementation detail, not useful to clients.
  const { api_key_encrypted, ...safeRow } = row;

  let apiKey: string | undefined;
  if (reveal) {
    try {
      apiKey = decrypt(api_key_encrypted as string);
    } catch (err) {
      return NextResponse.json(
        {
          error: `Decryption failed: ${err instanceof Error ? err.message : "unknown"}`,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    key: safeRow,
    or: orMeta,
    or_error: orError,
    ...(reveal ? { api_key: apiKey } : {}),
  });
}

interface PatchBody {
  label?: string;
  monthly_limit_usd?: number | null;
  disabled?: boolean;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agent_id: agentId } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    body.label === undefined &&
    body.monthly_limit_usd === undefined &&
    body.disabled === undefined
  ) {
    return NextResponse.json(
      { error: "No fields to update (label, monthly_limit_usd, disabled)" },
      { status: 400 }
    );
  }

  const supabase = adminSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: row, error: fetchErr } = await supabase
    .from("openrouter_keys")
    .select("or_key_hash")
    .eq("agent_id", agentId)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Push limit/disabled to OR first — if OR rejects, we don't write a
  // local state that diverges from the server-side truth.
  const orPatch: { limit?: number | null; disabled?: boolean; name?: string } = {};
  if (body.monthly_limit_usd !== undefined) orPatch.limit = body.monthly_limit_usd;
  if (body.disabled !== undefined) orPatch.disabled = body.disabled;
  if (body.label !== undefined) orPatch.name = body.label;

  if (Object.keys(orPatch).length > 0) {
    try {
      await orUpdateKey(row.or_key_hash, orPatch);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "OR update failed" },
        { status: 502 }
      );
    }
  }

  const dbPatch: Record<string, unknown> = {};
  if (body.label !== undefined) dbPatch.label = body.label;
  if (body.monthly_limit_usd !== undefined)
    dbPatch.monthly_limit_usd = body.monthly_limit_usd;
  if (body.disabled !== undefined) dbPatch.disabled = body.disabled;

  const { error: updErr } = await supabase
    .from("openrouter_keys")
    .update(dbPatch)
    .eq("agent_id", agentId);

  if (updErr) {
    return NextResponse.json(
      {
        error: `OR updated but DB write failed: ${updErr.message} — state is now divergent`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, agent_id: agentId, patch: dbPatch });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agent_id: agentId } = await params;

  const supabase = adminSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: row, error: fetchErr } = await supabase
    .from("openrouter_keys")
    .select("or_key_hash")
    .eq("agent_id", agentId)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete at OR first. If OR already returned 404 (key vanished on
  // their side, e.g. manual deletion in the UI) we still want to clear
  // the orphaned DB row, so we tolerate that case.
  try {
    await orDeleteKey(row.or_key_hash);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OR delete failed";
    if (!/HTTP 404/.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  const { error: delErr } = await supabase
    .from("openrouter_keys")
    .delete()
    .eq("agent_id", agentId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, agent_id: agentId, deleted: true });
}
