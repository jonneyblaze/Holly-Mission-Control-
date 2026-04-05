/**
 * Thin wrapper around OpenRouter's provisioning API.
 *
 * All calls require a provisioning key (`is_management_key` scope) — we
 * read it from `OPENROUTER_PROVISIONING_KEY`, the same env already used
 * by `/api/budget/activity`.
 *
 * OR's provisioning endpoints live under `/api/v1/keys`:
 *   POST   /api/v1/keys           — create a new key (returns the secret ONCE)
 *   GET    /api/v1/keys           — list keys (metadata only, no secrets)
 *   GET    /api/v1/keys/{hash}    — get one key's metadata + live usage
 *   PATCH  /api/v1/keys/{hash}    — update limit/disabled/name
 *   DELETE /api/v1/keys/{hash}    — delete a key
 *
 * The `hash` is OR's stable identifier for a key — we persist it in
 * the openrouter_keys table so we can PATCH/DELETE/usage later without
 * ever needing to store the secret in plaintext.
 */

const BASE = "https://openrouter.ai/api/v1/keys";
const TIMEOUT_MS = 10_000;

/** Full shape OR returns on create — the ONLY time the secret value is visible. */
export interface CreatedOpenRouterKey {
  key: string; // sk-or-v1-...
  data: OpenRouterKeyMetadata;
}

/** Everything else — list, get, update — returns metadata without the secret. */
export interface OpenRouterKeyMetadata {
  hash: string;
  name: string;
  label?: string | null;
  limit: number | null;
  disabled: boolean;
  usage: number; // running total in USD
  created_at: string;
  updated_at?: string | null;
}

function authHeaders(key: string): HeadersInit {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function getProvisioningKey(): string {
  const key = process.env.OPENROUTER_PROVISIONING_KEY;
  if (!key) {
    throw new Error("OPENROUTER_PROVISIONING_KEY not configured");
  }
  return key;
}

async function orFetch(
  path: string,
  init: RequestInit & { method: string }
): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(getProvisioningKey()), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    throw new Error(
      `OpenRouter ${init.method} /keys${path} failed: HTTP ${res.status}${
        detail ? ` — ${detail.slice(0, 200)}` : ""
      }`
    );
  }
  return res.json();
}

/**
 * Create a new key. `name` is what shows up in OR's UI and in listKey
 * responses — we use the agent_id as the name so the two sides map
 * cleanly. `limit` is the monthly USD cap (OR enforces it hard).
 */
export async function createKey(input: {
  name: string;
  label?: string;
  limit?: number | null;
}): Promise<CreatedOpenRouterKey> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.label !== undefined) body.label = input.label;
  if (input.limit !== undefined && input.limit !== null) body.limit = input.limit;

  const json = (await orFetch("", {
    method: "POST",
    body: JSON.stringify(body),
  })) as CreatedOpenRouterKey;

  if (!json.key || !json.data?.hash) {
    throw new Error("OpenRouter create-key response missing key or hash");
  }
  return json;
}

/** Fetch one key's metadata + live `usage` total. */
export async function getKey(hash: string): Promise<OpenRouterKeyMetadata> {
  const json = (await orFetch(`/${encodeURIComponent(hash)}`, {
    method: "GET",
  })) as { data?: OpenRouterKeyMetadata };
  if (!json.data) {
    throw new Error("OpenRouter get-key response missing data");
  }
  return json.data;
}

/** Update limit / disabled / name on an existing key. */
export async function updateKey(
  hash: string,
  patch: { name?: string; limit?: number | null; disabled?: boolean }
): Promise<OpenRouterKeyMetadata> {
  const json = (await orFetch(`/${encodeURIComponent(hash)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  })) as { data?: OpenRouterKeyMetadata };
  if (!json.data) {
    throw new Error("OpenRouter update-key response missing data");
  }
  return json.data;
}

/** Delete a key on OR's side. Idempotent at the API level. */
export async function deleteKey(hash: string): Promise<void> {
  await orFetch(`/${encodeURIComponent(hash)}`, { method: "DELETE" });
}
