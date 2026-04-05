/**
 * AES-256-GCM encryption helpers for secrets-at-rest.
 *
 * Used by the openrouter_keys table to wrap the raw `sk-or-v1-...`
 * values before they hit Supabase. A DB dump alone is useless without
 * also exfiltrating `OPENROUTER_KEYS_ENCRYPTION_KEY` from the Vercel
 * environment — that's the whole point of encrypting.
 *
 * Format: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`. IV is 12 bytes
 * (GCM standard), regenerated per call; authTag is 16 bytes.
 *
 * The key is read from `OPENROUTER_KEYS_ENCRYPTION_KEY`, expected as a
 * base64-encoded 32-byte value. Generate with:
 *   openssl rand -base64 32
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_ENV = "OPENROUTER_KEYS_ENCRYPTION_KEY";

function getKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(`${KEY_ENV} is not set — cannot encrypt/decrypt secrets`);
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `${KEY_ENV} must decode to 32 bytes (got ${key.length}). ` +
        `Generate one with: openssl rand -base64 32`
    );
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decrypt(payload: string): string {
  const key = getKey();
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format — expected iv:tag:ciphertext");
  }
  const [ivHex, tagHex, ctHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ct = Buffer.from(ctHex, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}
