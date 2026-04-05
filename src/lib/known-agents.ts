/**
 * Fleet registry — single source of truth for which agents exist, what
 * model each uses, what their fallback cascade is, and the UI hint.
 *
 * Imported by:
 *   - `KeysPanel.tsx` (table rows + labels)
 *   - `/api/budget/keys/sync-manifest` (Naboo-side config sync)
 *
 * When adding / removing / retiering an agent, edit here.
 * `model` MUST match an OR model ID (used as the primary for the agent's
 * virtual provider on Naboo). `fallback_models` are the rest of the
 * cascade, in preference order, EXCLUDING the primary and EXCLUDING the
 * universal `ollama/qwen2.5:32b` last-resort (which the sync script
 * appends automatically).
 *
 * `include_in_sync: false` skips the agent in the Naboo sync manifest —
 * use this for the local `private` agent that runs on Ollama and has
 * no OR key to provision.
 *
 * Every model id referenced here (primary + fallbacks) MUST have an
 * entry in `MODEL_SPECS` below so the sync manifest can expand each
 * virtual provider's `models[]` with the right pricing + context.
 */
export interface ModelSpec {
  id: string;
  display_name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  /**
   * Override the virtual provider's default `api` for this specific model.
   * Set to `"anthropic-messages"` on Anthropic entries so that OpenClaw's
   * `resolveCacheRetention` (pi-embedded-*.js) opens the cache gate — the
   * gate requires `modelApi === "anthropic-messages"` when the provider is
   * a custom/virtual one like `openrouter-<agent>`. Without this field the
   * `extraParams.cacheRetention` below is silently dropped.
   */
  api?: "anthropic-messages" | "openai-responses" | "openai-completions";
  /**
   * Anthropic prompt-caching retention. `"long"` = 1h TTL, 90% input
   * discount on cache hits. Only honored when `api: "anthropic-messages"`
   * is set (or provider is Anthropic-direct/Bedrock).
   */
  cacheRetention?: "none" | "short" | "long";
}

export const MODEL_SPECS: Record<string, ModelSpec> = {
  "anthropic/claude-sonnet-4.6": {
    id: "anthropic/claude-sonnet-4.6",
    display_name: "Claude Sonnet 4.6",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    contextWindow: 200000,
    maxTokens: 64000,
    api: "anthropic-messages",
    cacheRetention: "long",
  },
  "anthropic/claude-haiku-4.5": {
    id: "anthropic/claude-haiku-4.5",
    display_name: "Claude Haiku 4.5",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
    contextWindow: 200000,
    maxTokens: 64000,
    api: "anthropic-messages",
    cacheRetention: "long",
  },
  "google/gemini-2.5-pro": {
    id: "google/gemini-2.5-pro",
    display_name: "Gemini 2.5 Pro",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 1.25, output: 10, cacheRead: 0.3125, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 65536,
  },
  "google/gemini-2.5-flash": {
    id: "google/gemini-2.5-flash",
    display_name: "Gemini 2.5 Flash",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0.15, output: 0.6, cacheRead: 0.0375, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 65536,
  },
};

export interface KnownAgent {
  id: string;
  /** Primary OR model id (also the `.model` field in manifest for back-compat). */
  model: string;
  /** Short hint shown in the UI. */
  model_hint: string;
  /**
   * Preference-ordered OR model ids to use as fallbacks when the primary
   * isn't selected. Excludes the primary and the last-resort. Each entry
   * here gets expanded into the agent's per-agent virtual provider
   * `models[]` and is therefore billed against the agent's capped OR key.
   */
  fallback_models: string[];
  /**
   * Bare (unprefixed) last-resort model appended to `.model.fallbacks`
   * after the per-agent-prefixed entries. Typically `"ollama/qwen2.5:32b"`
   * for tiers where we want a free local retry before giving up. Set to
   * `null` for orchestrators — they should fail fast instead of retrying
   * into a runaway context (see post-mortem on Holly 2026-04-06 incident).
   */
  last_resort_model: string | null;
  include_in_sync: boolean;
}

// Cascade tiers — post-incident (2026-04-06) truncation:
//   orchestrator : Sonnet 4.6 only, fail fast (no fallbacks, no last-resort)
//   fast_reason  : Haiku 4.5 primary → ollama local last-resort
//   drafter      : Gemini Flash → Gemini Pro → Haiku 4.5 → ollama last-resort
//
// Rationale: the Holly runaway burned $6.58 in 20min because a 5-min
// subagent timeout kicked the cascade, and each fallback level carried
// forward a growing conversation — each level ~2x the tokens of the last.
// Cutting the cascade on orchestrators turns timeouts into visible failures
// instead of silent cost explosions.
const DRAFTER_FALLBACKS = [
  "google/gemini-2.5-pro",
  "anthropic/claude-haiku-4.5",
];

export const KNOWN_AGENTS: KnownAgent[] = [
  { id: "holly",         model: "anthropic/claude-sonnet-4.6", model_hint: "sonnet-4.6 · orchestrator",    fallback_models: [],                last_resort_model: null,                 include_in_sync: true },
  { id: "bl-qa",         model: "anthropic/claude-sonnet-4.6", model_hint: "sonnet-4.6 · reasoning",       fallback_models: [],                last_resort_model: null,                 include_in_sync: true },
  { id: "devops",        model: "anthropic/claude-sonnet-4.6", model_hint: "sonnet-4.6 · deploys",         fallback_models: [],                last_resort_model: null,                 include_in_sync: true },
  { id: "duracell-prep", model: "anthropic/claude-haiku-4.5",  model_hint: "haiku-4.5 · fast",             fallback_models: [],                last_resort_model: "ollama/qwen2.5:32b", include_in_sync: true },
  { id: "bl-support",    model: "anthropic/claude-haiku-4.5",  model_hint: "haiku-4.5 · fast",             fallback_models: [],                last_resort_model: "ollama/qwen2.5:32b", include_in_sync: true },
  { id: "bl-social",     model: "google/gemini-2.5-flash",     model_hint: "gemini-2.5-flash · drafter",   fallback_models: DRAFTER_FALLBACKS, last_resort_model: "ollama/qwen2.5:32b", include_in_sync: true },
  { id: "bl-community",  model: "google/gemini-2.5-flash",     model_hint: "gemini-2.5-flash · drafter",   fallback_models: DRAFTER_FALLBACKS, last_resort_model: "ollama/qwen2.5:32b", include_in_sync: true },
  { id: "bl-marketing",  model: "google/gemini-2.5-flash",     model_hint: "gemini-2.5-flash · drafter",   fallback_models: DRAFTER_FALLBACKS, last_resort_model: "ollama/qwen2.5:32b", include_in_sync: true },
  { id: "bl-content",    model: "google/gemini-2.5-flash",     model_hint: "gemini-2.5-flash · drafter",   fallback_models: DRAFTER_FALLBACKS, last_resort_model: "ollama/qwen2.5:32b", include_in_sync: true },
  { id: "infra",         model: "google/gemini-2.5-flash",     model_hint: "gemini-2.5-flash · monitoring",fallback_models: DRAFTER_FALLBACKS, last_resort_model: "ollama/qwen2.5:32b", include_in_sync: true },
  { id: "private",       model: "ollama/qwen2.5:32b",          model_hint: "qwen-local · offline",         fallback_models: [],                last_resort_model: null,                 include_in_sync: false },
];
