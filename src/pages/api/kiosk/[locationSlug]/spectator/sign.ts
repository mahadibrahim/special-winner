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
 * sent below but whose intent + evidence (email_opt_ins) are already filed if
 * the send fails. Never discard a consent because a pipe is blocked.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { spectatorWaivers } from "@/lib/db/schema/spectators";
import { requireKioskLocation } from "@/lib/check-in/kiosk-auth";
import {
  recordMarketingConsent,
  KIOSK_SPECTATOR_SOURCE,
  type ConsentTx,
} from "@/lib/consents/marketing";
import { resolveMarketingUser } from "@/lib/consents/resolve-marketing-user";
import {
  CONSENT_CHANNELS,
  CONSENT_COPY,
  type ConsentChannel,
} from "@/lib/consents/marketing-channels";
import { normalizeUsPhone } from "@/lib/sms/send";
import { createPhoneVerification } from "@/lib/auth/phone-otp";
import { mintToken } from "@/lib/check-in/tokens-db";
import { sendEmailConsentConfirmationEmail } from "@/lib/email/send";
import { originForBrand } from "@/lib/organization/soccerone-routing";
import { env } from "@/lib/env";
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

/**
 * THE RESPONSE CONTRACT — READ THIS BEFORE RENDERING ANYTHING FROM IT.
 *
 * NOTHING IN THIS RESPONSE MEANS THE CUSTOMER IS SUBSCRIBED. This endpoint
 * cannot subscribe anyone: it is unauthenticated, so every consent row it
 * writes is `pending`, and only a VERIFIED ACT (the phone OTP; the email
 * double-opt-in click) promotes one to `opted_in`. A UI that reads any field
 * here as "you're on the list" is telling the customer something untrue — and
 * `sendSms`'s opt-in gate will refuse the number anyway (`not_opted_in`).
 *
 * The two arrays say WHY a channel is not yet active — they are not a
 * subscribed/unsubscribed split:
 *
 *   awaitingCode — a confirmation is IN FLIGHT. For the phone channels we texted
 *     a code to the number; for email we sent the double-opt-in link to the
 *     address. Actionable right now: "Enter the code we just texted you" /
 *     "Click the link in your inbox." Taking that step promotes the channel.
 *
 *   pending — captured, but NO confirmation is possible right now: the channel is
 *     dormant (SMS under carrier review, WhatsApp with no WABA) or the
 *     confirmation send failed. Nothing for the customer to do: "We'll be in
 *     touch to confirm." The intent and its evidence are on file either way, so
 *     the confirmation can be re-sent — a blocked pipe never destroys a consent.
 *
 * Both mean NOT ACTIVE. They differ only in whether the customer has a next
 * step. `phoneVerificationId` is present iff `awaitingCode` is non-empty — it is
 * what the UI posts to /api/auth/phone-verify/check with the entered code.
 */
type SignResponse = {
  ok: true;
  waiverId: string;
  awaitingCode: ConsentChannel[];
  pending: ConsentChannel[];
  phoneVerificationId?: string;
};

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
  //
  // userId STAYS NULL — and stays null even when a ticked box resolves this
  // person to an existing account below. Same doctrine as the consent rows: the
  // kiosk matches an account on a TYPED, UNVERIFIED email, which is a match, not
  // an authentication. A consent row may carry that link while it is `pending`
  // because a pending row grants nothing. A waiver is a LEGAL DOCUMENT — stamping
  // it with an account id would make our records say a person signed something
  // they may never have seen, purely because a stranger in the lobby typed their
  // address. The name, phone and email on the row identify the signer; the
  // account link is only safe to add from an authenticated surface (a signed-in
  // user claiming their own waiver), which is not this one.
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
  const awaitingCode: ConsentChannel[] = [];
  if (input.consents.length === 0) {
    const body: SignResponse = {
      ok: true,
      waiverId: waiver.id,
      awaitingCode,
      pending,
    };
    return json(body, 200);
  }

  const email = input.email!; // guaranteed by the schema refine above

  // 2+3 — user and consent rows, ATOMIC, and never fatal to the signature.
  //
  // The waiver is written first and on its own (above): it must survive
  // whatever happens next — it is the condition of entry, and a customer whose
  // signature is on file must never be told signing failed. But the user row
  // and the consent rows are one fact ("this person opted into these
  // channels"), so they go in a transaction: a half-written consent — a user
  // conjured with no consent attached — is worse than none. If the transaction
  // throws, we still return 200 with every requested channel reported `pending`:
  // the signature stands, the customer is admitted, and nothing was half-granted.
  // (Chosen over "catch and continue": those rows are cheap to re-capture, and
  // an inconsistent consent record is the thing a carrier reviewer reads.)
  let marketingUserId: string | null = null;
  try {
    await db.transaction(async (tx) => {
      const resolvedId = await resolveMarketingUser(tx, {
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: phoneE164 ?? phoneDigits,
      });

      // NOTE — the waiver is NOT back-stamped with resolvedId. See the comment
      // on the insert above: a legal signature must not be attached to an
      // account whose ownership nobody proved.

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
      marketingUserId = resolvedId;
    });
  } catch (err) {
    console.error("[spectator/sign] consent capture failed:", err);
    const body: SignResponse = {
      ok: true,
      waiverId: waiver.id,
      awaitingCode: [],
      pending: [...input.consents],
    };
    return json(body, 200);
  }

  // 4 — The OTP: prove the number. This is the act that promotes the pending
  // PHONE intents (sms AND whatsapp) to real consent.
  //
  // SEND IT FOR ANY PHONE CHANNEL, NOT JUST SMS. What the OTP settles is that
  // the person who ticked the boxes holds this number — the one thing in doubt
  // for both phone channels — and promotePendingPhoneConsents (the ONLY promoter
  // there is) promotes every pending kiosk row for the number. So gating the
  // send on `sms` alone made a WhatsApp-only tick a permanently dead consent:
  // a `pending` row that nothing in the system could ever promote, for a customer
  // who did opt in. Each row keeps its own consentTextShown, so the per-channel
  // evidence stays distinct — one code, two independently-evidenced consents.
  //
  // (The text of the OTP itself is transactional, sent with bypassOptInCheck —
  // it is not marketing, and it is the only message we may send this number
  // until they enter it.)
  //
  // A dormant channel is not a failure — the intent and its evidence are already
  // filed; park the confirmation and tell the truth in the UI.
  const phoneChannels = input.consents.filter((c) => c !== "email");
  let phoneVerificationId: string | undefined;
  if (phoneChannels.length > 0 && phoneE164) {
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
      // In flight: the customer has a next step, and taking it promotes these.
      awaitingCode.push(...phoneChannels);
    } else {
      // Includes reason "sms_failed" carrying error "channel_dormant" (10DLC
      // registration still under carrier review). Whatever the cause, the
      // opt-in stands and the channels are honestly reported as pending — no
      // confirmation is possible, so there is nothing for the customer to do.
      pending.push(...phoneChannels);
    }
  } else if (phoneChannels.length > 0) {
    // Unreachable in practice (the schema refuses a phone opt-in without a
    // normalizable US number), but a phone channel with no E.164 to text is by
    // definition unconfirmable.
    pending.push(...phoneChannels);
  }

  // 5 — Email: the double opt-in. Send the confirmation link to the address
  // itself. That link is email's VERIFIED ACT — the exact counterpart of the OTP
  // above: only a click, from inside the mailbox, promotes the pending intent
  // (email_opt_ins pending -> opted_in) and sets users.emailVerified, which
  // nothing but /api/consent/confirm does. A future marketing sender MUST gate
  // on that verified state; nothing does today (see the contract note in
  // src/lib/consents/marketing.ts).
  //
  // The intent and its evidence are ALREADY on file (email_opt_ins, written in
  // the transaction above), so a failed send costs us the confirmation, never
  // the consent — it can be re-sent. The distinction the response draws:
  //   sent → awaitingCode ("check your inbox", a next step exists)
  //   not  → pending ("we'll be in touch", nothing they can do)
  if (input.consents.includes("email")) {
    let confirmationSent = false;
    if (marketingUserId) {
      try {
        const token = await mintToken({
          kind: "email_consent",
          // Polymorphic target: the user the consent hangs off. The address is
          // carried on the token itself (recipientEmail) and is what the
          // promotion is scoped by.
          targetId: marketingUserId,
          organizationId: location.organizationId,
          venueId: null,
          sentVia: "email",
          recipientUserId: marketingUserId,
          recipientEmail: email,
          recipientPhone: phoneE164 ?? phoneDigits,
          createdByUserId: null,
          // Long-lived on purpose: a confirmation the customer opens the next
          // evening must still work. It grants nothing but the promotion of an
          // intent they themselves ticked.
          ttlHours: 24 * 14,
        });
        const origin = originForBrand(locals.brandId) ?? env.PUBLIC_APP_URL;
        const result = await sendEmailConsentConfirmationEmail({
          userId: marketingUserId,
          recipientEmail: email,
          name: input.firstName,
          confirmUrl: `${origin}/api/consent/confirm/${token.token}`,
          consentTextShown: CONSENT_COPY.email,
          brand: locals.brandId,
        });
        confirmationSent = result.success;
      } catch (err) {
        // Never fatal: the consent is filed either way, and the signature is
        // long since written.
        console.error("[spectator/sign] consent confirmation send failed:", err);
      }
    }
    if (confirmationSent) awaitingCode.push("email");
    else pending.push("email");
  }

  const body: SignResponse = {
    ok: true,
    waiverId: waiver.id,
    awaitingCode,
    pending,
    phoneVerificationId,
  };
  return json(body, 200);
};
