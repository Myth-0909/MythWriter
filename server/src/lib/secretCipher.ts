import crypto from "node:crypto";
import { DEFAULT_JWT_SECRET } from "./runtimeConfig";

/**
 * Symmetric encryption for secrets at rest (AI provider API keys).
 *
 * Stored format: `enc:v1:<iv>:<tag>:<ciphertext>` (all base64url).
 * Values without the `enc:v1:` prefix are treated as legacy plaintext and
 * returned as-is on decrypt, so existing rows keep working and are migrated
 * transparently on the next write.
 */

const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const KEY_SALT = "znwriter-secret-cipher-v1";

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const source = process.env.SECRET_ENCRYPTION_KEY?.trim()
    || process.env.JWT_SECRET?.trim()
    || DEFAULT_JWT_SECRET;
  cachedKey = crypto.scryptSync(source, KEY_SALT, 32);
  return cachedKey;
}

/** For tests: clears the derived-key cache so env changes take effect. */
export function resetSecretCipherKeyCache(): void {
  cachedKey = null;
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptSecret(plain: string | null | undefined): string {
  const text = typeof plain === "string" ? plain : "";
  if (!text) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX.slice(0, -1),
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return "";
  if (!isEncryptedSecret(stored)) return stored; // legacy plaintext
  const parts = stored.split(":");
  // ["enc", "v1", iv, tag, ciphertext]
  if (parts.length !== 5) return "";
  try {
    const iv = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    const ciphertext = Buffer.from(parts[4], "base64url");
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    // Key rotation or tampering — fail closed so callers treat it as "no key".
    return "";
  }
}
