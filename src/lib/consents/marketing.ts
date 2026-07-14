// Marketing consent (email / SMS / WhatsApp opt-ins). Deliberately NOT called
// recordConsent — `./record.ts` in this same directory already exports a
// recordConsent() for MEDIA/WAIVER consent. Two functions of the same name
// recording two legally distinct kinds of consent is exactly the ambiguity that
// gets the wrong one imported.

import { and, eq } from "drizzle-orm";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { users } from "@/lib/db/schema/users";
import type { Database } from "@/lib/db";
import type { ConsentChannel } from "./marketing-channels";

/**
 * The lobby kiosk's spectator waiver — the one UNAUTHENTICATED opt-in surface.
 * Shared by the surface that writes the pending rows (kiosk spectator/sign) and
 * the one that promotes them (auth/phone-verify/check); they must agree on the
 * string or the promotion silently matches nothing.
 */
export const KIOSK_SPECTATOR_SOURCE = "kiosk_spectator";

/** A transaction handle — callers wrap user+consent writes so they land as one. */
export type ConsentTx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | ConsentTx;

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
 *
 * `status` is the trust level of the SURFACE that captured the tick:
 *
 *   "opted_in" (default) — an AUTHENTICATED surface. The person is signed in,
 *     so the account whose consent we are changing is provably theirs.
 *
 *   "pending" — an UNAUTHENTICATED surface (the lobby kiosk: a mounted,
 *     unattended iPad anyone can walk up to). Typing a stranger's email or
 *     phone there is trivial, so a tick on that surface is an INTENT, not a
 *     consent. It may never grant a permission the stranger did not have:
 *       - it does not clear a previous unsubscribe (users.marketingOptedOutAt),
 *       - it does not flip an existing `opted_out` phone row (a number that
 *         replied STOP stays STOPped), and it never touches the
 *         stopKeywordTriggered audit,
 *       - it does not downgrade an existing verified `opted_in` row either.
 *     Only a verified act promotes it: the phone OTP for sms/whatsapp (see
 *     /api/auth/phone-verify/check), the double-opt-in click for email.
 *
 * Evidence (source, consentTextShown, timestamps) is written immediately in
 * both cases — proving what was shown is independent of whether it was them.
 */
export async function recordMarketingConsent(opts: {
  db: Db;
  organizationId: string;
  userId: string;
  channel: ConsentChannel;
  phone?: string;
  email?: string;
  source: string;
  textShown: string;
  status?: "pending" | "opted_in";
}): Promise<void> {
  const now = new Date();
  const status = opts.status ?? "opted_in";

  if (opts.channel === "email") {
    // Email consent is NOT active until the double-opt-in link is clicked; the
    // confirmation endpoint sets emailVerified. Marketing selects on
    // emailVerified && !marketingOptedOutAt, so recording intent here cannot
    // put an unverified address on the list.
    //
    // A `pending` (unauthenticated) tick writes NOTHING to users: clearing
    // marketingOptedOutAt would let anyone at the kiosk resurrect a stranger's
    // unsubscribe by typing their address. The opt-out is only cleared when the
    // double-opt-in link in that address's inbox is clicked — which is proof
    // the address is theirs. A brand-new user has marketingOptedOutAt NULL
    // already, so the no-op costs a genuine opt-in nothing.
    if (status === "pending") return;

    await opts.db
      .update(users)
      .set({ marketingOptedOutAt: null, updatedAt: now })
      .where(eq(users.id, opts.userId));
    return;
  }

  if (!opts.phone) throw new Error(`recordMarketingConsent: ${opts.channel} requires a phone`);

  if (status === "pending") {
    await opts.db
      .insert(phoneOptIns)
      .values({
        organizationId: opts.organizationId,
        userId: opts.userId,
        phone: opts.phone,
        channel: opts.channel,
        status: "pending",
        // Not opted in — optedInAt is set by the OTP promotion, and it is that
        // timestamp a carrier reviewer is shown as the moment consent began.
        optedInAt: null,
        optInSource: opts.source,
        consentTextShown: opts.textShown,
      })
      .onConflictDoUpdate({
        target: [phoneOptIns.organizationId, phoneOptIns.phone, phoneOptIns.channel],
        // Refresh the evidence on an intent that is ALREADY pending, and
        // nothing else. `setWhere` is what keeps an unauthenticated tick from
        // touching the two rows that matter: an `opted_out` row (they replied
        // STOP — a stranger at a kiosk must not undo that, and optedOutAt /
        // stopKeywordTriggered stay exactly as they were) and an `opted_in` row
        // (already verified — a stray kiosk tick must not demote it).
        set: {
          optInSource: opts.source,
          consentTextShown: opts.textShown,
          updatedAt: now,
        },
        setWhere: eq(phoneOptIns.status, "pending"),
      });
    return;
  }

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

/**
 * Promote the pending phone consents an UNAUTHENTICATED surface captured, once
 * the OTP sent to that number has been entered — the verified act that turns
 * intent into consent. Deliberately narrow:
 *
 *   - only rows whose optInSource is the surface named in `source` (a kiosk OTP
 *     must not disturb consents another flow owns),
 *   - only rows still `pending` — an `opted_out` row is NOT resurrected here.
 *     Proving you hold the number is not the same as withdrawing a STOP; that
 *     reply is a carrier-level signal and the way back is START, not a kiosk.
 *
 * Both channels for the number are promoted: what the OTP settles is that the
 * person holding this phone is the one who ticked the boxes, and each channel's
 * own consentTextShown already records which box that was.
 */
export async function promotePendingPhoneConsents(opts: {
  db: Db;
  organizationId: string;
  phone: string;
  source: string;
}): Promise<number> {
  const now = new Date();
  const rows = await opts.db
    .update(phoneOptIns)
    .set({ status: "opted_in", optedInAt: now, updatedAt: now })
    .where(
      and(
        eq(phoneOptIns.organizationId, opts.organizationId),
        eq(phoneOptIns.phone, opts.phone),
        eq(phoneOptIns.optInSource, opts.source),
        // LOAD-BEARING. Without this a valid OTP resurrects a number that
        // replied STOP (tests/api/kiosk/spectator.test.ts proves it: remove this
        // line and "a VALID OTP must NOT promote a row the kiosk was never
        // allowed to touch" fails). The source filter does NOT cover it — a
        // STOPped row can carry optInSource = kiosk_spectator from the opt-in it
        // originally made.
        eq(phoneOptIns.status, "pending"),
      ),
    )
    .returning({ id: phoneOptIns.id });
  return rows.length;
}
