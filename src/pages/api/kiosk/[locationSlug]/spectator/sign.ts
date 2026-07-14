/**
 * POST /api/kiosk/[locationSlug]/spectator/sign
 *
 * Someone walking into the building to WATCH signs the spectator waiver here.
 * No booking, no session, no capacity, no payment — just a signature, plus (if
 * and only if they tick a box) marketing consent.
 *
 * THE IDENTITY RULE — the whole point of this endpoint:
 *
 *   Signing a waiver makes you a SIGNATURE.
 *   Ticking a marketing opt-in makes you a USER.
 *
 * `consents: []` writes the spectator_waivers row with `user_id` NULL and
 * creates NO users record. Someone who signs and walks in must never come back
 * later to find we made them an account they never asked for.
 *
 * THE VERIFICATION RULE — this endpoint is unauthenticated and the iPad is
 * mounted in a public lobby, so it cannot know that the email/phone typed into
 * it belongs to the person typing. It may therefore capture INTENT, never grant
 * CONSENT: every consent row it writes is `pending`, it never clears an existing
 * unsubscribe, and it never revives a number that replied STOP. Only a verified
 * act promotes an intent — the SMS OTP for phone channels, the double-opt-in
 * click for email.
 *
 * THE SEPARABILITY RULE. The waiver is a condition of entry; consent is not.
 * Declining every channel still returns 200 and still admits them. Consent
 * obtained as a condition of something else is not consent — so this endpoint
 * must never fail a signature because the boxes were left unticked.
 *
 * A DORMANT CHANNEL DOES NOT DESTROY CONSENT. The consent is recorded BEFORE we
 * try to deliver anything. If the SMS channel is asleep (10DLC registration
 * still under carrier review → sendSms reason "channel_dormant"), the opt-in
 * stands and the channel comes back in `pending` so the UI can be honest
 * ("we'll text you to confirm"). Same for WhatsApp, which cannot deliver at all
 * yet (no WABA/templates), and for email, whose double-opt-in confirmation is
 * sent by a separate task. Never discard a consent because a pipe is blocked.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { spectatorWaivers } from "@/lib/db/schema/spectators";
import { users } from "@/lib/db/schema/users";
import { requireKioskLocation } from "@/lib/check-in/kiosk-auth";
import {
  recordMarketingConsent,
  KIOSK_SPECTATOR_SOURCE,
  type ConsentTx,
} from "@/lib/consents/marketing";
import {
  CONSENT_CHANNELS,
  CONSENT_COPY,
  type ConsentChannel,
} from "@/lib/consents/marketing-channels";
import { normalizeUsPhone } from "@/lib/sms/send";
import { createPhoneVerification } from "@/lib/auth/phone-otp";
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";
import { spectatorWaiverText } from "@/lib/waivers/spectator-waiver-text";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

export const prerender = false;

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });

const signSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(7).max(20),
    email: z.string().trim().toLowerCase().email().max(255).optional(),
    signedName: z.string().trim().min(1).max(200),
    // A sibling brought along to watch is signed for by the guardian — the
    // child is named on the document, the adult signs it.
    isMinor: z.boolean().optional().default(false),
    guardianName: z.string().trim().min(1).max(200).optional(),
    consents: z.array(z.enum(CONSENT_CHANNELS)).default([]),
  })
  .refine((v) => !v.isMinor || !!v.guardianName, {
    message: "guardianName is required when the spectator is a minor",
    path: ["guardianName"],
  })
  // A users row needs an email (users.email is NOT NULL), and every consent
  // channel needs a user to hang off. No email → no account → the ticked boxes
  // could not be recorded, and silently dropping consent is worse than saying so.
  .refine((v) => v.consents.length === 0 || !!v.email, {
    message: "email is required to opt in to marketing",
    path: ["email"],
  });

/** The kiosk's own opt-in surface — recorded on every consent row it writes. */
const CONSENT_SOURCE = KIOSK_SPECTATOR_SOURCE;

export const POST: APIRoute = async ({ params, request, clientAddress, locals }) => {
  const slug = params.locationSlug ?? "";

  // Public, unauthenticated, and it can create users + consent rows. Throttle
  // per IP+location as defence in depth (same shape as walkin/start).
  const ip = clientAddress || "unknown";
  const limit = rateLimit(`kiosk-spectator-sign:${slug}:${ip}`, 20, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);

  const locationResult = await requireKioskLocation(
    slug,
    locals.organization?.id ?? null,
  );
  if (!locationResult.ok) return locationResult.response;
  const { location } = locationResult;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = signSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 422);
  }
  const input = parsed.data;

  // Store the phone as digits only. The waiver is looked up by the last 4
  // digits at the kiosk, so "(614) 555-1234" and "6145551234" must be the same
  // row's worth of information.
  const phoneDigits = input.phone.replace(/\D/g, "");
  if (phoneDigits.length < 7) return json({ error: "A valid phone is required" }, 422);
  // phone_opt_ins is keyed on E.164 — that is the form sendSms's opt-in gate
  // looks a number up by. A consent filed in any other shape is a consent that
  // can never be honoured, so refuse the opt-in rather than record a dead one.
  const phoneE164 = normalizeUsPhone(input.phone);
  if (input.consents.some((c) => c !== "email") && !phoneE164) {
    return json({ error: "A valid US phone is required to opt in to texts" }, 422);
  }

  const db = getDb();
  const now = new Date();

  // 1 — The signature. Always written, consent or no consent.
  // Valid to the end of the calendar year: waivers are re-signed each season.
  const validUntil = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
  const [waiver] = await db
    .insert(spectatorWaivers)
    .values({
      organizationId: location.organizationId,
      locationId: location.id,
      userId: null,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: phoneDigits,
      email: input.email ?? null,
      isMinor: input.isMinor,
      guardianName: input.guardianName ?? null,
      signedName: input.signedName,
      // What they actually saw. A document revised in August must not
      // retroactively change what someone agreed to in July.
      waiverTextShown: spectatorWaiverText(locals.brandId),
      signedAt: now,
      validUntil,
    })
    .returning({ id: spectatorWaivers.id });

  // 2 — A ticked box, and ONLY a ticked box, makes a user.
  const pending: ConsentChannel[] = [];
  if (input.consents.length === 0) {
    return json({ ok: true, waiverId: waiver.id, pending }, 200);
  }

  const email = input.email!; // guaranteed by the schema refine above

  // 2+3 — user and consent rows, ATOMIC, and never fatal to the signature.
  //
  // The waiver is written first and on its own (above): it must survive
  // whatever happens next — it is the condition of entry, and a customer whose
  // signature is on file must never be told signing failed. But the user row
  // and the consent rows are one fact ("this person opted into these
  // channels"), so they go in a transaction: a half-written consent — a user
  // conjured with no consent attached, or a waiver pointing at a user whose
  // consent rows never landed — is worse than none. If the transaction throws,
  // we still return 200 with every requested channel reported `pending`: the
  // signature stands, the customer is admitted, and nothing was half-granted.
  // (Chosen over "catch and continue": those rows are cheap to re-capture, and
  // an inconsistent consent record is the thing a carrier reviewer reads.)
  try {
    await db.transaction(async (tx) => {
      const resolvedId = await resolveMarketingUser(tx, {
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: phoneE164 ?? phoneDigits,
      });

      await tx
        .update(spectatorWaivers)
        .set({ userId: resolvedId })
        .where(eq(spectatorWaivers.id, waiver.id));

      // One consent record per ticked channel, each carrying the literal
      // sentence that channel's checkbox showed. Recorded BEFORE any send is
      // attempted: delivery is not what makes the consent real.
      //
      // STATUS "pending", NOT "opted_in". THE RULE THIS ENDPOINT LIVES BY:
      // an unauthenticated, unattended surface may capture INTENT; only a
      // VERIFIED ACT may grant CONSENT. This kiosk is a mounted iPad in a
      // public lobby and it identifies people purely by the email they type —
      // no proof of ownership. If a tick here wrote `opted_in`, a stranger
      // could type your address and undo your unsubscribe, or type your number
      // and re-subscribe a phone that had replied STOP. So the tick records
      // intent plus evidence, and nothing more: the SMS OTP below promotes the
      // phone channels (see promotePendingPhoneConsents), the double-opt-in
      // click promotes email. That is also what makes the OTP mean something —
      // it used to be sent AFTER the row was already written `opted_in`, so
      // entering the code changed no state at all.
      for (const channel of input.consents) {
        await recordMarketingConsent({
          db: tx,
          organizationId: location.organizationId,
          userId: resolvedId,
          channel,
          phone: phoneE164 ?? undefined,
          email,
          source: CONSENT_SOURCE,
          textShown: CONSENT_COPY[channel],
          status: "pending",
        });
      }
    });
  } catch (err) {
    console.error("[spectator/sign] consent capture failed:", err);
    return json(
      { ok: true, waiverId: waiver.id, pending: [...input.consents] },
      200,
    );
  }

  // 4 — SMS: prove the number. This is the act that promotes the pending
  // sms/whatsapp intents to real consent. A dormant channel is not a failure —
  // the intent and its evidence are already filed; park the confirmation and
  // tell the truth in the UI.
  let phoneVerificationId: string | undefined;
  if (input.consents.includes("sms") && phoneE164) {
    const otp = await createPhoneVerification({
      phone: phoneE164,
      organizationId: location.organizationId,
      purpose: "registration",
      // The verification row carries no org column, and the promotion is
      // org-scoped — so the org travels with the OTP's context.
      purposeContext: {
        spectatorWaiverId: waiver.id,
        source: CONSENT_SOURCE,
        organizationId: location.organizationId,
      },
    });
    if (otp.ok) {
      phoneVerificationId = otp.verificationId;
    } else {
      // Includes reason "sms_failed" carrying error "channel_dormant" (10DLC
      // registration still under carrier review). Whatever the cause, the
      // opt-in stands and the channel is honestly reported as pending.
      pending.push("sms");
    }
  }

  // 5 — WhatsApp cannot deliver at all yet (no WABA / no approved templates).
  // The consent is real and recorded; the confirmation is parked. Never attempt
  // a send here.
  if (input.consents.includes("whatsapp")) pending.push("whatsapp");

  // 6 — Email is a double opt-in: the address is not on the list until the
  // confirmation link is clicked (recordMarketingConsent leaves emailVerified
  // alone). The confirmation send is a separate task; until it lands — and
  // after it lands, until they click — email is honestly pending.
  if (input.consents.includes("email")) pending.push("email");

  return json({ ok: true, waiverId: waiver.id, pending, phoneVerificationId }, 200);
};

/**
 * Resolve-or-create the PASSWORDLESS user behind a marketing opt-in.
 *
 * No password hash, no session, no org role: this person opted into marketing,
 * they did not sign up for an account. (Deliberately no ensureCustomerOrgMembership
 * call — that grants a `parent` role, and a spectator who wants our texts is not
 * a customer with children in a program. Both consent surfaces are already
 * org-scoped in their own right.)
 */
async function resolveMarketingUser(
  db: ConsentTx,
  person: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
  },
): Promise<string> {
  // NOTE — matching an existing account on the canonical email is a MATCH, not
  // an authentication: anyone at the kiosk can type anyone's address. That is
  // precisely why the consent rows this endpoint writes are `pending` and why
  // it never clears an existing opt-out. Resolving the user is how we hang the
  // intent somewhere; it grants nothing on its own.
  const emailCanonical = normalizeForUniqueness(person.email);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.emailCanonical, emailCanonical))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(users)
    .values({
      email: person.email,
      emailCanonical,
      firstName: person.firstName,
      lastName: person.lastName,
      phone: person.phone,
      // Passwordless. Email is unverified until the double-opt-in link is
      // clicked; the phone is unverified until the OTP is entered.
      passwordHash: null,
      emailVerified: false,
      phoneVerified: false,
    })
    // Two kiosks, one family, same email, same second: let the unique index
    // arbitrate rather than racing.
    .onConflictDoNothing({ target: users.emailCanonical })
    .returning({ id: users.id });
  if (created) return created.id;

  const [raced] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.emailCanonical, emailCanonical))
    .limit(1);
  if (!raced) throw new Error("Failed to resolve the spectator's user record");
  return raced.id;
}
