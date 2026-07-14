// Marketing consent (email / SMS / WhatsApp opt-ins). Deliberately NOT called
// recordConsent — `./record.ts` in this same directory already exports a
// recordConsent() for MEDIA/WAIVER consent. Two functions of the same name
// recording two legally distinct kinds of consent is exactly the ambiguity that
// gets the wrong one imported.

import { eq } from "drizzle-orm";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { users } from "@/lib/db/schema/users";
import type { Database } from "@/lib/db";
import type { ConsentChannel } from "./marketing-channels";

/**
 * A consent parked while its channel was dormant, then flushed months later, is
 * exactly what gets a sender flagged. Past this age we re-confirm rather than
 * message.
 */
export const CONSENT_STALE_AFTER_DAYS = 90;

export function isConsentStale(optedInAt: Date, now: Date = new Date()): boolean {
  const ageDays = (now.getTime() - optedInAt.getTime()) / 86_400_000;
  return ageDays > CONSENT_STALE_AFTER_DAYS;
}

/**
 * Record consent for ONE channel. Never call this for a channel the customer
 * did not explicitly tick — the caller passes exactly the channels whose boxes
 * were checked, and `textShown` is the literal sentence they saw.
 */
export async function recordMarketingConsent(opts: {
  db: Database;
  organizationId: string;
  userId: string;
  channel: ConsentChannel;
  phone?: string;
  email?: string;
  source: string;
  textShown: string;
}): Promise<void> {
  const now = new Date();

  if (opts.channel === "email") {
    // Email consent is NOT active until the double-opt-in link is clicked; the
    // confirmation endpoint sets emailVerified. Marketing selects on
    // emailVerified && !marketingOptedOutAt, so recording intent here cannot
    // put an unverified address on the list.
    await opts.db
      .update(users)
      .set({ marketingOptedOutAt: null, updatedAt: now })
      .where(eq(users.id, opts.userId));
    return;
  }

  if (!opts.phone) throw new Error(`recordMarketingConsent: ${opts.channel} requires a phone`);

  await opts.db
    .insert(phoneOptIns)
    .values({
      organizationId: opts.organizationId,
      userId: opts.userId,
      phone: opts.phone,
      channel: opts.channel,
      status: "opted_in",
      optedInAt: now,
      optInSource: opts.source,
      consentTextShown: opts.textShown,
    })
    .onConflictDoUpdate({
      target: [phoneOptIns.organizationId, phoneOptIns.phone, phoneOptIns.channel],
      set: {
        status: "opted_in",
        optedInAt: now,
        optedOutAt: null,
        optInSource: opts.source,
        consentTextShown: opts.textShown,
        updatedAt: now,
      },
    });
}
