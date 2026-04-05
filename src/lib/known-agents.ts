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
  },
  "anthropic/claude-haiku-4.5": {
    id: "anthropic/claude-haiku-4.5",
    display_name: "Claude Haiku 4.5",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
    contextWindow: 200000,
    maxTokens: 64000,
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
   * isn't selected. Excludes the primary and the universal ollama
   * last-resort (the sync script appends `ollama/qwen2.5:32b` itself).
   */
  fallback_models: string[];
  include_in_sync: boolean;
}

// Cascade tiers (see docs/naboo PR for rationale):
//   orchestrator : Sonnet 4.6 → Haiku 4.5 → Gemini Pro → Gemini Flash
//   fast_reason  : Haiku 4.5  → Sonnet 4.6 → Gemini Flash → Gemini Pro
//   drafter      : Gemini Flash → Gemini Pro → Haiku 4.5
//   monitoring   : Gemini Flash → Gemini Pro → Haiku 4.5
const ORCHESTRATOR_FALLBACKS = [
  "anthropic/claude-haiku-4.5",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
];
const FAST_REASON_FALLBACKS = [
  "anthropic/claude-sonnet-4.6",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
];
const DRAFTER_FALLBACKS = [
  "google/gemini-2.5-pro",
  "anthropic/claude-haiku-4.5",
];

export const KNOWN_AGENTS: KnownAgent[] = [
  { id: "holly",         model: "anthropic/claude-sonnet-4.6", model_hint: "sonnet-4.6 · orchestrator",    fallback_models: ORCHESTRATOR_FALLBACKS, include_in_sync: true },
  { id: "bl-qa",         model: "anthropic/claude-sonnet-4.6", model_hint: "sonnet-4.6 · reasoning",       fallback_models: ORCHESTRATOR_FALLBACKS, include_in_sync: true },
  { id: "devops",        model: "anthropic/claude-sonnet-4.6", model_hint: "sonnet-4.6 · deploys",         fallback_models: ORCHESTRATOR_FALLBACKS, include_in_sync: true },
  { id: "duracell-prep", model: "anthropic/claude-haiku-4.5",  model_hint: "haiku-4.5 · fast",             fallback_models: FAST_REASON_FALLBACKS,  include_in_sync: true },
  { id: "bl-support",    model: "anthropic/claude-haiku-4.5",  model_hint: "haiku-4.5 · fast",             fallback_models: FAST_REASON_FALLBACKS,  include_in_sync: true },
  { id: "bl-social",     model: "google/gemini-2.5-flash",     model_hint: "gemini-2.5-flash · drafter",   fallback_models: DRAFTER_FALLBACKS,      include_in_sync: true },
  { id: "bl-community",  model: "google/gemini-2.5-flash",     model_hint: "gemini-2.5-flash · drafter",   fallback_models: DRAFTER_FALLBACKS,      include_in_sync: true },
  { id: "bl-marketing",  model: "google/gemini-2.5-flash",     model_hint: "gemini-2.5-flash · drafter",   fallback_models: DRAFTER_FALLBACKS,      include_in_sync: true },
  { id: "bl-content",    model: "google/gemini-2.5-flash",     model_hint: "gemini-2.5-flash · drafter",   fallback_models: DRAFTER_FALLBACKS,      include_in_sync: true },
  { id: "infra",         model: "google/gemini-2.5-flash",     model_hint: "gemini-2.5-flash · monitoring",fallback_models: DRAFTER_FALLBACKS,      include_in_sync: true },
  { id: "private",       model: "ollama/qwen2.5:32b",          model_hint: "qwen-local · offline",         fallback_models: [],                     include_in_sync: false },
];
