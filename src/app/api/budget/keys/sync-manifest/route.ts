import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import { KNOWN_AGENTS, MODEL_SPECS, type ModelSpec } from "@/lib/known-agents";

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
 *       {
 *         agent_id,
 *         model,              // primary OR id, back-compat
 *         primary_model,      // primary OR id
 *         fallback_models,    // preference-ordered OR ids, no primary, no ollama
 *         all_models,         // fully-expanded virtual-provider `models[]`
 *                             //   (primary + fallbacks, per-agent labeled)
 *         api_key,
 *         or_key_hash,
 *         monthly_limit_usd,
 *         disabled,
 *       }
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

/**
 * Shape of each entry inside a virtual provider's `models[]` in
 * openclaw.json. Same as ModelSpec but with a per-agent-labeled `name`
 * field instead of `display_name`, and the `id` stays as the bare OR id
 * (no provider prefix).
 */
interface VirtualProviderModelEntry {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}

function buildVirtualProviderModel(
  spec: ModelSpec,
  agentId: string
): VirtualProviderModelEntry {
  return {
    id: spec.id,
    name: `${spec.display_name} (per-agent ${agentId})`,
    reasoning: spec.reasoning,
    input: spec.input,
    cost: spec.cost,
    contextWindow: spec.contextWindow,
    maxTokens: spec.maxTokens,
  };
}

interface ManifestAgent {
  agent_id: string;
  model: string;
  primary_model: string;
  fallback_models: string[];
  all_models: VirtualProviderModelEntry[];
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

  // Pre-flight: every model id referenced by a syncable agent must have
  // a MODEL_SPECS entry. Fail loudly rather than silently shipping a
  // broken virtual provider to Naboo.
  for (const agent of syncableAgents) {
    const cascade = [agent.model, ...agent.fallback_models];
    for (const modelId of cascade) {
      if (!MODEL_SPECS[modelId]) {
        return NextResponse.json(
          {
            error: "missing_model_spec",
            agent_id: agent.id,
            model_id: modelId,
            detail: `MODEL_SPECS in known-agents.ts has no entry for ${modelId}`,
          },
          { status: 500 }
        );
      }
    }
  }

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
    const cascade = [known.model, ...known.fallback_models];
    const allModels = cascade.map((id) =>
      buildVirtualProviderModel(MODEL_SPECS[id], known.id)
    );

    const row = rowsByAgent.get(known.id);
    if (!row) {
      agents.push({
        agent_id: known.id,
        model: known.model,
        primary_model: known.model,
        fallback_models: known.fallback_models,
        all_models: allModels,
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
      primary_model: known.model,
      fallback_models: known.fallback_models,
      all_models: allModels,
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
