import crypto from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { phoneVerifications } from "@/lib/db/schema/phone-verifications";
import { sendSms, normalizeUsPhone } from "@/lib/sms/send";

/**
 * Phone OTP module.
 *
 * Generates a 6-digit one-time code, sends it via SMS, and validates it on
 * entry. Codes expire in 10 minutes and allow up to 5 attempts before being
 * marked consumed (so brute force isn't feasible).
 *
 * Used by:
 *  - Registration Path 1 (inline OTP on the registration wizard)
 *  - Phone change / recovery flows
 *  - Any future flow that needs to prove phone ownership
 */

const CODE_LENGTH = 6;
const DEFAULT_TTL_SECONDS = 10 * 60; // 10 minutes
const DEFAULT_MAX_ATTEMPTS = 5;

export interface CreatePhoneVerificationInput {
  phone: string;
  organizationId: string;
  purpose: "registration" | "phone_change" | "recovery";
  purposeContext?: Record<string, unknown>;
}

export type CreatePhoneVerificationResult =
  | {
      ok: true;
      verificationId: string;
      expiresAt: Date;
    }
  | {
      ok: false;
      reason: "invalid_phone" | "sms_failed" | "rate_limited";
      error?: string;
    };

export type VerifyPhoneCodeResult =
  | { ok: true; phone: string }
  | {
      ok: false;
      reason:
        | "not_found"
        | "expired"
        | "already_consumed"
        | "too_many_attempts"
        | "wrong_code";
      attemptsRemaining?: number;
    };

/**
 * Create a phone verification and send the OTP code via SMS.
 * The plaintext code is only sent to the phone — never returned from this function.
 */
export async function createPhoneVerification(
  input: CreatePhoneVerificationInput,
): Promise<CreatePhoneVerificationResult> {
  const normalized = normalizeUsPhone(input.phone);
  if (!normalized) {
    return { ok: false, reason: "invalid_phone" };
  }

  // Generate a 6-digit numeric code
  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + DEFAULT_TTL_SECONDS * 1000);

  const [row] = await getDb()
    .insert(phoneVerifications)
    .values({
      phone: normalized,
      codeHash,
      purpose: input.purpose,
      purposeContext: input.purposeContext ?? null,
      expiresAt,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
    })
    .returning({
      id: phoneVerifications.id,
      expiresAt: phoneVerifications.expiresAt,
    });

  // Send the OTP SMS — bypass opt-in check because the OTP flow is how we
  // establish opt-in in the first place.
  const sendResult = await sendSms({
    to: normalized,
    organizationId: input.organizationId,
    body: `Your Aspire Sports verification code is ${code}. It expires in 10 minutes. Don't share this code.`,
    bypassOptInCheck: true,
  });

  if (!sendResult.ok) {
    return {
      ok: false,
      reason: "sms_failed",
      error: sendResult.reason,
    };
  }

  return {
    ok: true,
    verificationId: row.id,
    expiresAt: row.expiresAt,
  };
}

/**
 * Verify a code against a verification record. Increments the attempt counter
 * on wrong codes and refuses further attempts after maxAttempts.
 */
export async function verifyPhoneCode(
  verificationId: string,
  code: string,
): Promise<VerifyPhoneCodeResult> {
  if (!code || !/^\d+$/.test(code)) {
    return { ok: false, reason: "wrong_code" };
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(phoneVerifications)
    .where(eq(phoneVerifications.id, verificationId))
    .limit(1);

  if (rows.length === 0) {
    return { ok: false, reason: "not_found" };
  }

  const record = rows[0];

  if (record.consumedAt !== null) {
    return { ok: false, reason: "already_consumed" };
  }
  if (record.expiresAt < new Date()) {
    return { ok: false, reason: "expired" };
  }
  if (record.attempts >= record.maxAttempts) {
    return { ok: false, reason: "too_many_attempts" };
  }

  const codeHash = hashCode(code);
  const matches = timingSafeEqualHex(codeHash, record.codeHash);

  if (!matches) {
    // Increment attempts; if we exceed the limit, effectively lock the record
    const updated = await db
      .update(phoneVerifications)
      .set({
        attempts: record.attempts + 1,
      })
      .where(eq(phoneVerifications.id, verificationId))
      .returning({ attempts: phoneVerifications.attempts });
    const remaining = Math.max(
      0,
      record.maxAttempts - (updated[0]?.attempts ?? record.attempts + 1),
    );
    return { ok: false, reason: "wrong_code", attemptsRemaining: remaining };
  }

  // Atomic consumption
  const consumed = await db
    .update(phoneVerifications)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(phoneVerifications.id, verificationId),
        isNull(phoneVerifications.consumedAt),
      ),
    )
    .returning({ id: phoneVerifications.id });

  if (consumed.length === 0) {
    return { ok: false, reason: "already_consumed" };
  }

  return { ok: true, phone: record.phone };
}

/**
 * Cleanup helper — purges expired verifications. Intended to be called from a cron.
 */
export async function purgeExpiredVerifications(): Promise<number> {
  const result = await getDb()
    .delete(phoneVerifications)
    .where(sql`${phoneVerifications.expiresAt} < now()`);
  return (result as { rowCount?: number }).rowCount ?? 0;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function generateCode(): string {
  // 6-digit zero-padded numeric code
  const n = crypto.randomInt(0, 10 ** CODE_LENGTH);
  return n.toString().padStart(CODE_LENGTH, "0");
}

function hashCode(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
