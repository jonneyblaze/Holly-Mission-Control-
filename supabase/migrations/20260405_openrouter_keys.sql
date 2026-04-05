-- Per-agent OpenRouter keys — the backing store for PR 3.
--
-- One row per agent (holly, bl-social, etc). Each row pairs a
-- human-visible label + OR's own key hash (used to identify the key
-- in OR's provisioning API) with the encrypted `sk-or-v1-...` value.
--
-- The api_key_encrypted column holds an AES-256-GCM ciphertext in the
-- format `iv_hex:tag_hex:ciphertext_hex`. The decryption key lives in
-- OPENROUTER_KEYS_ENCRYPTION_KEY (Vercel env, never in the repo).
-- Encryption gives us defence-in-depth: a DB dump alone cannot be
-- used to pull OR credit without also exfiltrating the Vercel env.
--
-- monthly_limit_usd is mirrored to OpenRouter on write via the
-- provisioning API — OR enforces the hard cap server-side, this
-- column is the local copy used for display + PATCH diffing.

CREATE TABLE IF NOT EXISTS openrouter_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL UNIQUE,              -- 'holly', 'bl-social', etc.
  label TEXT NOT NULL,                        -- human label for the dashboard
  or_key_hash TEXT NOT NULL UNIQUE,           -- OR's identifying hash (used for listKey/updateKey/deleteKey)
  api_key_encrypted TEXT NOT NULL,            -- iv:tag:ciphertext (hex), AES-256-GCM
  monthly_limit_usd NUMERIC(10, 2),           -- OR-enforced hard cap; NULL = no cap
  disabled BOOLEAN NOT NULL DEFAULT false,
  last_rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_openrouter_keys_agent_id ON openrouter_keys(agent_id);

-- Keep updated_at fresh automatically.
CREATE OR REPLACE FUNCTION touch_openrouter_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_openrouter_keys_updated_at ON openrouter_keys;
CREATE TRIGGER trg_openrouter_keys_updated_at
  BEFORE UPDATE ON openrouter_keys
  FOR EACH ROW
  EXECUTE FUNCTION touch_openrouter_keys_updated_at();

-- Service-role only. Matches the pattern used by agent_feedback and
-- infra_snapshots — no anon access, no RLS policies, writes and reads
-- go through the service-role client from server-side API routes.
ALTER TABLE openrouter_keys ENABLE ROW LEVEL SECURITY;
