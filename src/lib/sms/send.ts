import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { getTwilioClient, getSmsFrom, isSmsConfigured, getSmsProvider } from "./client";
import { createZernioSmsClientFromEnv } from "./zernio-sms";
import { resolveSmsEnv } from "./resolve-env";
import { isMessagingMockEnabled, recordMockMessage } from "@/lib/messaging/mock";

/**
 * SMS sending helper with built-in opt-in enforcement.
 *
 * All outbound SMS must go through this helper. It:
 *  1. Checks that the active SMS provider (Twilio or Zernio; see getSmsProvider) is configured
 *  2. Verifies the target phone has `phone_opt_ins.status = 'opted_in'` for the given org
 *     (unless `bypassOptInCheck` is explicitly set for first-contact messages)
 *  3. Splits long messages at semantic boundaries if needed
 *  4. Returns the provider's message id (Twilio SID / Zernio id) for tracking and reconciliation
 */

export interface SendSmsInput {
  to: string;
  body: string;
  organizationId: string;
  /**
   * Relaxes ONLY the "no opt-in on file yet" gate (missing row / `pending`
   * status) — e.g. the initial opt-in welcome message, an OTP that itself
   * establishes opt-in, or a single user-requested transactional text. It
   * does NOT relax STOP suppression: a `phone_opt_ins.status = 'opted_out'`
   * row always blocks the send, bypass or not. TCPA/10DLC treat STOP as
   * absolute — there is no legal carve-out that lets any caller text a
   * number that has withdrawn consent, so this flag must never be read as
   * "skip the opt-in table entirely."
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
        | "provider_error"
        | "invalid_phone"
        | "channel_dormant";
      error?: string;
    };

const MAX_SMS_LENGTH = 1600; // Twilio will split long SMS automatically, but cap to protect against accidental massive sends

interface DispatchEnv {
  SMS_PROVIDER?: string;
  ZERNIO_API_KEY?: string;
  ZERNIO_SMS_FROM?: string;
}

/**
 * Route an already-gated, already-normalized message to the active SMS vendor
 * and return the provider's message id. Throws on transport failure — the
 * caller (sendSms) maps that to reason "provider_error".
 */
export async function dispatchToProvider(
  input: { to: string; text: string },
  env: DispatchEnv = resolveSmsEnv(),
  fetchImpl?: typeof fetch,
): Promise<{ messageId: string }> {
  if (getSmsProvider(env) === "zernio") {
    const client = createZernioSmsClientFromEnv(env, fetchImpl);
    const res = await client.send({ to: input.to, text: input.text });
    return { messageId: res.id };
  }

  const client = getTwilioClient();
  const sender = getSmsFrom();
  const message = await client.messages.create({ ...sender, to: input.to, body: input.text });
  return { messageId: message.sid };
}

/**
 * Map a provider transport error to a reason.
 *
 * "Dormant" is not "broken". While a 10DLC registration is under carrier review
 * a send returns `403 … still under carrier review` — the number is real, the
 * consent is real, the channel is simply not awake yet. Callers must keep the
 * consent and park the message, not discard it. See
 * docs/operations/zernio-sms-unpark-checklist.md.
 *
 * Classify on HTTP status FIRST, wording SECOND. `zernio-sms.ts` throws
 * `Zernio SMS <status> on /sms/messages: <detail>`, and `<detail>` falls back
 * to the literal string "(non-JSON error body)" whenever the carrier's error
 * response isn't valid JSON — so a real dormant 403 can arrive with no
 * "under carrier review" wording at all, and wording alone would misclassify
 * it as a generic provider_error and DISCARD THE CONSENT. The status code is
 * reliable even when the body isn't, so it must win. A missed dormant
 * classification destroys consent a customer genuinely gave; a missed
 * provider_error classification just means one retry — the failure modes are
 * not symmetric, so ties go to "dormant" whenever the signal is a 403.
 *
 * The wording matches are kept as a fallback for providers that don't embed
 * a parseable status in the message (e.g. non-Zernio callers of this helper).
 */
export function classifyProviderError(
  err: unknown,
): "channel_dormant" | "not_configured" | "provider_error" {
  const msg = err instanceof Error ? err.message : String(err);

  const statusMatch = /^Zernio SMS (\d+) on /.exec(msg);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    if (status === 403) return "channel_dormant";
    if (status === 404) return "not_configured";
  }

  if (/under carrier review/i.test(msg)) return "channel_dormant";
  if (/no sms-enabled number matches/i.test(msg)) return "not_configured";
  return "provider_error";
}

export type ConsentGateResult =
  | { allowed: true }
  | { allowed: false; reason: "not_opted_in" | "opted_out" };

/**
 * Pure decision function for the opt-in gate. Pulled out of sendSms so the
 * four-state matrix (status x bypass) is unit-testable without a DB.
 *
 * `status` is undefined when no phone_opt_ins row exists for (org, phone,
 * "sms") at all — treated the same as "pending" (blocked unless bypassed).
 *
 * STOP suppression is checked FIRST and unconditionally: an "opted_out"
 * status returns blocked regardless of `bypassOptInCheck`. That ordering is
 * the whole point of this function — see the bypassOptInCheck doc comment
 * on SendSmsInput.
 */
export function resolveConsentGate(
  status: string | undefined,
  bypassOptInCheck: boolean,
): ConsentGateResult {
  if (status === "opted_out") {
    return { allowed: false, reason: "opted_out" };
  }
  if (bypassOptInCheck) {
    return { allowed: true };
  }
  if (status === undefined || status === "pending") {
    return { allowed: false, reason: "not_opted_in" };
  }
  // status === "opted_in"
  return { allowed: true };
}

export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  if (!isSmsConfigured()) {
    console.warn("SMS not configured — skipping send to", input.to);
    return { ok: false, reason: "not_configured" };
  }

  if (!isValidPhone(input.to)) {
    return { ok: false, reason: "invalid_phone" };
  }

  // Opt-in gate. The lookup always runs — bypassOptInCheck only relaxes the
  // "missing/pending" branch inside resolveConsentGate, never the STOP
  // ("opted_out") branch. See the SendSmsInput.bypassOptInCheck doc comment.
  const optIn = await getDb()
    .select({ status: phoneOptIns.status })
    .from(phoneOptIns)
    .where(
      and(
        eq(phoneOptIns.organizationId, input.organizationId),
        eq(phoneOptIns.phone, input.to),
        // Without this, optIn[0] can be the WhatsApp row and WhatsApp consent
        // would decide whether we may send an SMS. SMS (TCPA/10DLC) and
        // WhatsApp (Meta policy) are legally distinct consents.
        eq(phoneOptIns.channel, "sms"),
      ),
    )
    // Deterministic pick on the shared CI/staging DB (multi-tenant hazard).
    .orderBy(asc(phoneOptIns.createdAt))
    .limit(1);

  const gate = resolveConsentGate(optIn[0]?.status, !!input.bypassOptInCheck);
  if (!gate.allowed) {
    return { ok: false, reason: gate.reason };
  }

  // Length guard
  const body =
    input.body.length > MAX_SMS_LENGTH
      ? input.body.slice(0, MAX_SMS_LENGTH - 1) + "…"
      : input.body;

  // Test mode: record instead of dispatching to the real provider. Every
  // check above (configured, valid phone, opt-in) still ran for real —
  // only the network call is swapped out. See src/lib/messaging/mock.ts.
  if (isMessagingMockEnabled()) {
    const mock = recordMockMessage({
      channel: "sms",
      to: input.to,
      subject: null,
      body,
      organizationId: input.organizationId,
    });
    return { ok: true, messageId: mock.id };
  }

  try {
    const { messageId } = await dispatchToProvider({ to: input.to, text: body });
    return { ok: true, messageId };
  } catch (error) {
    console.error("SMS send error:", error);
    return {
      ok: false,
      reason: classifyProviderError(error),
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
