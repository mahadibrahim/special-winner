import crypto from "crypto";

/**
 * SHA-256 hex digest of a single-use token. Store the digest, never the
 * plaintext — a DB read (backup leak, injection, studio screenshot) must
 * not yield usable links. The plaintext exists only in the email we send;
 * lookups hash the presented token and compare digests. Same scheme as
 * magic links (src/lib/auth/magic-link.ts).
 */
export function hashToken(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}
