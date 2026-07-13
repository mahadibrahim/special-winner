import { getDb } from "@/lib/db";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import type { PHONE_OPT_IN_SOURCE } from "@/lib/db/schema/phone-verifications";
import { normalizeUsPhone } from "./send";

/**
 * Consent-aware upsert for phone_opt_ins — the single write path for opt-in
 * state collected from customer-facing forms (the SmsConsentCheckbox surfaces).
 *
 * Semantics, per 10DLC/TCPA review requirements:
 *  - consented=true  → the customer affirmatively checked the (unchecked-by-
 *    default) consent box: upsert to `opted_in`, clearing any prior opt-out.
 *    A fresh affirmative web-form opt-in is valid new consent even after STOP.
 *  - consented=false → the customer provided a phone but did NOT check the
 *    box: create a `pending` row if none exists (so the one permitted
 *    welcome-message → reply-YES flow can still run), but NEVER downgrade an
 *    existing `opted_in` — leaving the box unchecked on a later form is not
 *    an opt-out.
 *
 * Race-safe via the (organization_id, phone) unique index. Rows are keyed on
 * the E.164 form to match the sendSms() opt-in gate.
 */
export interface RecordPhoneOptInInput {
  db?: ReturnType<typeof getDb>;
  organizationId: string;
  userId?: string | null;
  /** Any user-entered format; normalized to E.164 here. */
  phone: string;
  consented: boolean;
  source: (typeof PHONE_OPT_IN_SOURCE)[number];
}

export async function recordPhoneOptIn(
  input: RecordPhoneOptInInput,
): Promise<{ recorded: boolean; phone?: string }> {
  const normalized = normalizeUsPhone(input.phone);
  if (!normalized) return { recorded: false };

  const db = input.db ?? getDb();
  const now = new Date();

  if (input.consented) {
    await db
      .insert(phoneOptIns)
      .values({
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        phone: normalized,
        status: "opted_in",
        optedInAt: now,
        optInSource: input.source,
      })
      .onConflictDoUpdate({
        target: [phoneOptIns.organizationId, phoneOptIns.phone],
        set: {
          status: "opted_in",
          optedInAt: now,
          optedOutAt: null,
          stopKeywordTriggered: null,
          optInSource: input.source,
          updatedAt: now,
          ...(input.userId ? { userId: input.userId } : {}),
        },
      });
  } else {
    await db
      .insert(phoneOptIns)
      .values({
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        phone: normalized,
        status: "pending",
        optInSource: input.source,
      })
      .onConflictDoNothing({
        target: [phoneOptIns.organizationId, phoneOptIns.phone],
      });
  }

  return { recorded: true, phone: normalized };
}
