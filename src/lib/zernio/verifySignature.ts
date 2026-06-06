import crypto from "node:crypto";

/**
 * Verify a Zernio webhook signature.
 *
 * Zernio sends `X-Zernio-Signature: <lowercase hex HMAC-SHA256 digest>` where
 * the HMAC is computed over the **raw request body bytes** keyed with the
 * webhook signing secret (`ZERNIO_WEBHOOK_SECRET`). See
 * `marketing/playbooks/zernio-rest-reference.md` (ops repo) for the source.
 *
 * Verify the signature BEFORE parsing/trusting the payload. Comparison is
 * constant-time to avoid leaking the expected digest via timing.
 *
 * @param rawBody   the exact raw request body string (do not re-serialize JSON)
 * @param signature the `X-Zernio-Signature` header value (may be null/missing)
 * @param secret    the shared webhook signing secret
 * @returns true only if the signature matches; false on any mismatch, missing
 *          input, or malformed signature (never throws)
 */
export function verifyZernioSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const sigBuf = Buffer.from(signature, "utf8");
  const expBuf = Buffer.from(expected, "utf8");

  // timingSafeEqual throws on length mismatch — guard first.
  if (sigBuf.length !== expBuf.length) return false;

  return crypto.timingSafeEqual(sigBuf, expBuf);
}
