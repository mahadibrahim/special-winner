/**
 * Token value generation + shape validation for self-service surfaces.
 * The DB row carries the token in a unique column; this module owns the
 * value format. DB-backed mint/verify/consume live in
 * `src/lib/check-in/tokens-db.ts` (Task 7).
 */
import { randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_RX = /^[A-Za-z0-9_-]{43}$/;

/** Cryptographically random base64url token, 32 bytes / 43 chars. */
export function generateTokenValue(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** True iff the input has the expected token character set and length. */
export function isTokenShape(value: string): boolean {
  return TOKEN_RX.test(value);
}
