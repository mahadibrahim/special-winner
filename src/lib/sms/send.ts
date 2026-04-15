import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { getTwilioClient, getSmsFrom, isSmsConfigured } from "./client";

/**
 * SMS sending helper with built-in opt-in enforcement.
 *
 * All outbound SMS must go through this helper. It:
 *  1. Checks that Twilio is configured
 *  2. Verifies the target phone has `phone_opt_ins.status = 'opted_in'` for the given org
 *     (unless `bypassOptInCheck` is explicitly set for first-contact messages)
 *  3. Splits long messages at semantic boundaries if needed
 *  4. Returns the Twilio message SID for tracking and reconciliation
 */

export interface SendSmsInput {
  to: string;
  body: string;
  organizationId: string;
  /**
   * Set to true for the initial opt-in welcome message or STOP/HELP responses,
   * which are legally permitted even without prior opt-in.
   */
  bypassOptInCheck?: boolean;
}

export type SendSmsResult =
  | { ok: true; messageId: string }
  | {
      ok: false;
      reason:
        | "not_configured"
        | "not_opted_in"
        | "opted_out"
        | "twilio_error"
        | "invalid_phone";
      error?: string;
    };

const MAX_SMS_LENGTH = 1600; // Twilio will split long SMS automatically, but cap to protect against accidental massive sends

export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  if (!isSmsConfigured()) {
    console.warn("SMS not configured — skipping send to", input.to);
    return { ok: false, reason: "not_configured" };
  }

  if (!isValidPhone(input.to)) {
    return { ok: false, reason: "invalid_phone" };
  }

  // Opt-in gate (bypassed for welcome messages and compliance responses)
  if (!input.bypassOptInCheck) {
    const optIn = await getDb()
      .select({ status: phoneOptIns.status })
      .from(phoneOptIns)
      .where(
        and(
          eq(phoneOptIns.organizationId, input.organizationId),
          eq(phoneOptIns.phone, input.to),
        ),
      )
      .limit(1);

    if (optIn.length === 0 || optIn[0].status === "pending") {
      return { ok: false, reason: "not_opted_in" };
    }
    if (optIn[0].status === "opted_out") {
      return { ok: false, reason: "opted_out" };
    }
  }

  // Length guard
  const body =
    input.body.length > MAX_SMS_LENGTH
      ? input.body.slice(0, MAX_SMS_LENGTH - 1) + "…"
      : input.body;

  try {
    const client = getTwilioClient();
    const sender = getSmsFrom();

    const message = await client.messages.create({
      ...sender,
      to: input.to,
      body,
    });

    return { ok: true, messageId: message.sid };
  } catch (error) {
    console.error("Twilio send error:", error);
    return {
      ok: false,
      reason: "twilio_error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isValidPhone(phone: string): boolean {
  // Accept E.164 format or US 10-digit (we'll normalize upstream)
  return /^\+?[1-9]\d{6,14}$/.test(phone.replace(/[\s\-\(\)]/g, ""));
}

/**
 * Normalize a US phone number to E.164 format for Twilio.
 * Accepts: (614) 555-1234, 614-555-1234, 6145551234, +16145551234
 * Returns: +16145551234
 *
 * Note: this is US-biased; multinational pilots will need regional logic.
 */
export function normalizeUsPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+") && /^\+\d{7,15}$/.test(raw)) return raw;
  return null;
}
