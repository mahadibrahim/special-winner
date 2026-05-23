import crypto from "node:crypto";

/**
 * Stateless unsubscribe tokens: an HMAC-SHA256 of the user id. No DB token
 * table — the link stays valid indefinitely, which is what an unsubscribe
 * link must do. The signing secret must be stable across deploys.
 */
function sign(userId: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(userId).digest("base64url");
}

/** Build `<userId>.<hmac>`. */
export function signUnsubscribeToken(userId: string, secret: string): string {
  return `${userId}.${sign(userId, secret)}`;
}

/** Return the user id if the token is authentic, else null. */
export function verifyUnsubscribeToken(
  token: string,
  secret: string,
): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = sign(userId, secret);
  // timingSafeEqual throws on a length mismatch — guard it so a malformed
  // token returns null cleanly instead of throwing.
  if (provided.length !== expected.length) return null;
  if (
    !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    return null;
  }
  return userId;
}

/** Read the signing secret from env; throws in prod if unset. */
export function getUnsubscribeSecret(): string {
  const s =
    import.meta.env.MARKETING_UNSUBSCRIBE_SECRET ??
    process.env.MARKETING_UNSUBSCRIBE_SECRET;
  if (!s) {
    if (import.meta.env.PROD) {
      throw new Error("MARKETING_UNSUBSCRIBE_SECRET is not configured");
    }
    return "dev-insecure-unsubscribe-secret";
  }
  return s;
}
