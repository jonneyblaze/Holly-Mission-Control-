import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encrypt } from "@/lib/crypto";
import {
  createKey,
  deleteKey as orDeleteKey,
} from "@/lib/openrouter-keys";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/budget/keys/:agent_id/rotate
 *
 * Provisions a brand-new OR key for the agent, swaps it into the DB
 * row, and deletes the old OR key. The response includes the new raw
 * `api_key` ONCE — captures must happen immediately (same contract as
 * the create endpoint).
 *
 * Failure modes:
 *   - OR create fails → nothing mutated, 502
 *   - DB update fails after OR create → new key leaked as orphan on OR,
 *     surfaced in `or_key_hash_orphan` so the operator can clean up
 *   - Old-key delete fails → we still succeed the rotation (new key is
 *     live) but flag `old_delete_error` so the operator can manually
 *     clear the stale key from OR's UI
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

export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agent_id: agentId } = await params;

  const supabase = adminSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("openrouter_keys")
    .select("agent_id, label, or_key_hash, monthly_limit_usd")
    .eq("agent_id", agentId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json(
      { error: `No key for agent_id=${agentId} — use POST /api/budget/keys first` },
      { status: 404 }
    );
  }

  const oldHash = existing.or_key_hash as string;

  // 1. Create the new key
  let created;
  try {
    created = await createKey({
      name: agentId,
      label: existing.label as string,
      limit: existing.monthly_limit_usd as number | null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OR provisioning failed" },
      { status: 502 }
    );
  }

  // 2. Encrypt + persist the swap
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

  const { error: updErr } = await supabase
    .from("openrouter_keys")
    .update({
      or_key_hash: created.data.hash,
      api_key_encrypted: encrypted,
      last_rotated_at: new Date().toISOString(),
    })
    .eq("agent_id", agentId);

  if (updErr) {
    return NextResponse.json(
      {
        error: `DB swap failed: ${updErr.message}`,
        or_key_hash_orphan: created.data.hash,
      },
      { status: 500 }
    );
  }

  // 3. Delete the old key on OR — non-fatal. If this fails the
  // rotation still succeeded from the user's perspective, we just
  // have a stale orphan to clean up manually.
  let oldDeleteError: string | null = null;
  try {
    await orDeleteKey(oldHash);
  } catch (err) {
    oldDeleteError = err instanceof Error ? err.message : "old-key delete failed";
  }

  return NextResponse.json({
    ok: true,
    agent_id: agentId,
    or_key_hash: created.data.hash,
    old_or_key_hash: oldHash,
    old_delete_error: oldDeleteError,
    api_key: created.key,
    warning: "api_key is returned only on rotation — store it now, it will never be returned again",
  });
}
