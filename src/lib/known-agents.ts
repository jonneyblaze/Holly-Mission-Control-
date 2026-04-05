/**
 * Fleet registry — single source of truth for which agents exist, what
 * model each uses, and the UI hint. Imported by:
 *   - `KeysPanel.tsx` (table rows + labels)
 *   - `/api/budget/keys/sync-manifest` (Naboo-side config sync)
 *
 * When adding / removing / retiering an agent, edit here.
 * `model` MUST match an OR model ID (this becomes the `.model` field
 * in the virtual-provider entry OpenClaw uses on Naboo).
 * `include_in_sync: false` skips the agent in the Naboo sync manifest —
 * use this for the local `private` agent that runs on Ollama.
 */
export interface KnownAgent {
  id: string;
  model: string;
  model_hint: string;
  include_in_sync: boolean;
}

export const KNOWN_AGENTS: KnownAgent[] = [
  { id: "holly",         model: "anthropic/claude-sonnet-4.6", model_hint: "sonnet-4.6 · orchestrator",    include_in_sync: true },
  { id: "bl-qa",         model: "anthropic/claude-sonnet-4.6", model_hint: "sonnet-4.6 · reasoning",       include_in_sync: true },
  { id: "devops",        model: "anthropic/claude-sonnet-4.6", model_hint: "sonnet-4.6 · deploys",         include_in_sync: true },
  { id: "duracell-prep", model: "anthropic/claude-haiku-4.5",  model_hint: "haiku-4.5 · fast",             include_in_sync: true },
  { id: "bl-support",    model: "anthropic/claude-haiku-4.5",  model_hint: "haiku-4.5 · fast",             include_in_sync: true },
  { id: "bl-social",     model: "google/gemini-2.5-flash",     model_hint: "gemini-2.5-flash · drafter",   include_in_sync: true },
  { id: "bl-community",  model: "google/gemini-2.5-flash",     model_hint: "gemini-2.5-flash · drafter",   include_in_sync: true },
  { id: "bl-marketing",  model: "google/gemini-2.5-flash",     model_hint: "gemini-2.5-flash · drafter",   include_in_sync: true },
  { id: "bl-content",    model: "google/gemini-2.5-flash",     model_hint: "gemini-2.5-flash · drafter",   include_in_sync: true },
  { id: "infra",         model: "google/gemini-2.5-flash",     model_hint: "gemini-2.5-flash · monitoring",include_in_sync: true },
  { id: "private",       model: "ollama/qwen2.5:32b",          model_hint: "qwen-local · offline",         include_in_sync: false },
];
