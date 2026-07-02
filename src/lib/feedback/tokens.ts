import crypto from "node:crypto";

/**
 * Feedback link tokens follow the magic_links pattern: 32 bytes of entropy,
 * base64url plaintext delivered exactly once, SHA-256 hex hash persisted.
 * NEVER log the plaintext.
 */
export function generateFeedbackToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashFeedbackToken(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

export function buildFeedbackUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/feedback/${token}`;
}
