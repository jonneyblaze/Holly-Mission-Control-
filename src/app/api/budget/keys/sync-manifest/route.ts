import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import { KNOWN_AGENTS } from "@/lib/known-agents";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/budget/keys/sync-manifest
 *
 * Bearer-authed (INGEST_API_KEY). Called by the Naboo cron poller
 * every few minutes. Returns the full desired state of the per-agent
 * OR keys — decrypted — so the poller can rebuild `openclaw.json`
 * with the correct virtual-provider entries and exit early if the
 * file already matches.
 *
 * Response shape:
 *   {
 *     version: ISO timestamp (drives the cron's "last synced" log),
 *     base_url: "https://openrouter.ai/api/v1",
 *     agents: [
 *       { agent_id, model, api_key, or_key_hash, monthly_limit_usd, disabled }
 *     ]
 *   }
 *
 * Only agents with `include_in_sync: true` in KNOWN_AGENTS appear
 * here (excludes the local `private` / Ollama agent). Agents that
 * have no row in the `openrouter_keys` table yet are returned with
 * `api_key: null` — the cron will leave their `.model` alone and
 * fall back to the shared provider until you provision a key.
 */

function isAuthed(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const apiKey = process.env.INGEST_API_KEY;
  return !!apiKey && authHeader === `Bearer ${apiKey}`;
}

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

interface ManifestAgent {
  agent_id: string;
  model: string;
  api_key: string | null;
  or_key_hash: string | null;
  monthly_limit_usd: number | null;
  disabled: boolean;
}

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = adminSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const syncableAgents = KNOWN_AGENTS.filter((a) => a.include_in_sync);
  const syncableIds = syncableAgents.map((a) => a.id);

  const { data: rows, error } = await supabase
    .from("openrouter_keys")
    .select("agent_id, api_key_encrypted, or_key_hash, monthly_limit_usd, disabled")
    .in("agent_id", syncableIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rowsByAgent = new Map(
    (rows ?? []).map((r) => [r.agent_id as string, r])
  );

  const agents: ManifestAgent[] = [];
  for (const known of syncableAgents) {
    const row = rowsByAgent.get(known.id);
    if (!row) {
      agents.push({
        agent_id: known.id,
        model: known.model,
        api_key: null,
        or_key_hash: null,
        monthly_limit_usd: null,
        disabled: false,
      });
      continue;
    }
    let apiKey: string | null = null;
    try {
      apiKey = decrypt(row.api_key_encrypted as string);
    } catch (e) {
      return NextResponse.json(
        {
          error: "decrypt_failed",
          agent_id: known.id,
          detail: e instanceof Error ? e.message : String(e),
        },
        { status: 500 }
      );
    }
    agents.push({
      agent_id: known.id,
      model: known.model,
      api_key: apiKey,
      or_key_hash: row.or_key_hash as string,
      monthly_limit_usd: row.monthly_limit_usd as number | null,
      disabled: row.disabled as boolean,
    });
  }

  return NextResponse.json(
    {
      version: new Date().toISOString(),
      base_url: "https://openrouter.ai/api/v1",
      agents,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
