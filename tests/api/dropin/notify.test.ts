/**
 * POST /api/dropin/notify — the public pickup-alert opt-in (guest or signed-in).
 *
 * The doctrine this suite protects — identical to the kiosk spectator waiver's,
 * minus the waiver:
 *   1. This surface captures INTENT, never grants CONSENT. Every consent row it
 *      writes is `pending`; only a verified act (the SMS OTP / the email
 *      double-opt-in click) promotes one to `opted_in`.
 *   2. SMS opt-in also files a pickup_alert_subscriptions row (the dispatcher
 *      texts them once the number is verified). Email-only opt-in files NO
 *      subscription — the dispatcher is SMS-only.
 *   3. A verified OTP promotes the pending intent; a STOPped number is never
 *      resurrected, even by a perfectly valid OTP.
 *
 * OTP retrieval mirrors tests/api/kiosk/spectator.test.ts exactly: the OTP is
 * read out of the MESSAGING_MOCK=1 inbox via /api/test/messaging-mock (keyed on
 * the E.164 recipient), then entered at /api/auth/phone-verify/check.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { emailOptIns } from "@/lib/db/schema/email-opt-ins";
import { pickupAlertSubscriptions } from "@/lib/db/schema/hosts";
import { users } from "@/lib/db/schema/users";
import { normalizeUsPhone } from "@/lib/sms/send";
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";
import { CONSENT_COPY } from "@/lib/consents/marketing-channels";
import { PICKUP_NOTIFY_SOURCE } from "@/lib/consents/marketing";
import { apiFetch, getAuthCookie } from "../setup/test-helpers";
import { resolveDefaultOrgForHttpTests } from "../../utils/dropin-helpers";
import { createTestUserWithPassword } from "../../utils/host-helpers";

const SUFFIX = `${Date.now()}`.slice(-7);

// Distinct 10-digit numbers per scenario (normalizeUsPhone accepts any 10
// digits). A unique per-run suffix keeps the shared CI database from colliding.
const SMS_PHONE = `614${SUFFIX}`;
const SMS_PHONE_E164 = normalizeUsPhone(SMS_PHONE)!;
const PROMO_PHONE = `615${SUFFIX}`;
const PROMO_PHONE_E164 = normalizeUsPhone(PROMO_PHONE)!;
const DUP_PHONE = `616${SUFFIX}`;
const DUP_PHONE_E164 = normalizeUsPhone(DUP_PHONE)!;
const STOP_PHONE = `617${SUFFIX}`;
const STOP_PHONE_E164 = normalizeUsPhone(STOP_PHONE)!;
const BACKFILL_PHONE = `618${SUFFIX}`;
const BACKFILL_PHONE_E164 = normalizeUsPhone(BACKFILL_PHONE)!;

const EMAIL_ONLY = `notify-emailonly-${SUFFIX}@example.invalid`;
const SMS_EMAIL = `notify-sms-${SUFFIX}@example.invalid`;
const PROMO_EMAIL = `notify-promo-${SUFFIX}@example.invalid`;
const DUP_EMAIL = `notify-dup-${SUFFIX}@example.invalid`;
const STOP_EMAIL = `notify-stop-${SUFFIX}@example.invalid`;
const BACKFILL_EMAIL = `notify-backfill-${SUFFIX}@example.invalid`;

let organizationId = "";
let venueId = "";
let signedInEmail = "";

/**
 * Read the OTP texted out of the MESSAGING_MOCK=1 inbox — the exact seam
 * tests/api/kiosk/spectator.test.ts uses. Keyed on the E.164 recipient, since
 * that is the form sendSms (and thus the mock) received.
 */
async function readOtpCode(phoneE164: string, since: string): Promise<string> {
  const res = await apiFetch(
    `/api/test/messaging-mock?to=${encodeURIComponent(phoneE164)}` +
      `&channel=sms&since=${encodeURIComponent(since)}`,
  );
  expect(res.status, "messaging mock endpoint (needs E2E_TEST_ENDPOINTS=yes)").toBe(200);
  const body = (await res.json()) as {
    enabled: boolean;
    messages: { body: string }[];
  };
  expect(body.enabled, "MESSAGING_MOCK must be on for this suite").toBe(true);
  const last = body.messages.at(-1);
  expect(last, `no OTP was texted to ${phoneE164}`).toBeTruthy();
  const code = last!.body.match(/\b(\d{6})\b/)?.[1];
  expect(code, `no 6-digit code in: ${last!.body}`).toBeTruthy();
  return code!;
}

async function completeOtp(verificationId: string, code: string) {
  const res = await apiFetch("/api/auth/phone-verify/check", {
    method: "POST",
    body: JSON.stringify({ verificationId, code }),
  });
  const body = await res.json();
  expect(res.status, `phone-verify/check said: ${JSON.stringify(body)}`).toBe(200);
  expect(body.success).toBe(true);
  return body;
}

async function userIdByEmail(email: string): Promise<string> {
  const db = getDb();
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  expect(u, `no user resolved for ${email}`).toBeTruthy();
  return u.id;
}

describe("pickup notify opt-in", () => {
  beforeAll(async () => {
    ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(phoneOptIns).where(
      inArray(phoneOptIns.phone, [
        SMS_PHONE_E164,
        PROMO_PHONE_E164,
        DUP_PHONE_E164,
        STOP_PHONE_E164,
        BACKFILL_PHONE_E164,
      ]),
    );
    const emails = [EMAIL_ONLY, SMS_EMAIL, PROMO_EMAIL, DUP_EMAIL, STOP_EMAIL, BACKFILL_EMAIL];
    if (signedInEmail) emails.push(signedInEmail);
    await db.delete(emailOptIns).where(inArray(emailOptIns.email, emails));
    // Deleting the users cascades their pickup_alert_subscriptions rows.
    await db.delete(users).where(inArray(users.email, emails));
  });

  it("guest email-only opt-in files a pending email consent and NO subscription", async () => {
    // Email-only: general updates, not capacity alerts. The dispatcher is
    // SMS-only, so this must create no subscription row.
    const res = await apiFetch("/api/dropin/notify", {
      method: "POST",
      body: JSON.stringify({ channels: ["email"], email: EMAIL_ONLY }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // Whether the confirmation send succeeded (awaitingCode) or not (pending),
    // the channel must be accounted for.
    expect([...body.awaitingCode, ...body.pending]).toContain("email");

    const db = getDb();
    const uid = await userIdByEmail(EMAIL_ONLY);

    const subs = await db
      .select({ id: pickupAlertSubscriptions.id })
      .from(pickupAlertSubscriptions)
      .where(eq(pickupAlertSubscriptions.userId, uid));
    expect(subs.length, "email-only opt-in must not create a subscription").toBe(0);

    const [opt] = await db
      .select()
      .from(emailOptIns)
      .where(
        and(
          eq(emailOptIns.organizationId, organizationId),
          eq(emailOptIns.email, EMAIL_ONLY.toLowerCase()),
        ),
      );
    expect(opt, "a pending email_opt_ins row must exist").toBeTruthy();
    expect(opt.status).toBe("pending");
    expect(opt.optedInAt).toBeNull();
    expect(opt.consentTextShown).toBe(CONSENT_COPY.email);
    expect(opt.optInSource).toBe(PICKUP_NOTIFY_SOURCE);
  });

  it("guest SMS opt-in files a pending SMS consent, a subscription, and returns a verification id", async () => {
    const res = await apiFetch("/api/dropin/notify", {
      method: "POST",
      body: JSON.stringify({
        channels: ["sms"],
        phone: SMS_PHONE,
        email: SMS_EMAIL, // guests always supply an email (the user key)
        venueId,
        sport: "Soccer",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // A confirmation is in flight — NOT "subscribed". The OTP is the verified act.
    expect(body.phoneVerificationId, "an OTP must be sent for a fresh SMS opt-in").toBeTruthy();
    expect(body.awaitingCode).toContain("sms");

    const db = getDb();
    const uid = await userIdByEmail(SMS_EMAIL);

    const [sub] = await db
      .select()
      .from(pickupAlertSubscriptions)
      .where(eq(pickupAlertSubscriptions.userId, uid));
    expect(sub, "an SMS opt-in must file a subscription").toBeTruthy();
    expect(sub.venueId).toBe(venueId);
    // sport is lowercased before storage.
    expect(sub.sport).toBe("soccer");
    expect(sub.active).toBe(true);

    const [opt] = await db
      .select()
      .from(phoneOptIns)
      .where(and(eq(phoneOptIns.phone, SMS_PHONE_E164), eq(phoneOptIns.channel, "sms")));
    expect(opt, "a pending phone_opt_ins row must exist").toBeTruthy();
    expect(opt.status).toBe("pending");
    expect(opt.optedInAt).toBeNull();
    expect(opt.consentTextShown).toBe(CONSENT_COPY.sms);
    expect(opt.optInSource).toBe(PICKUP_NOTIFY_SOURCE);
  });

  it("guest SMS opt-in then a valid OTP PROMOTES the pending consent to opted_in", async () => {
    // The deferred Task 4 promotion case: the OTP is the verified act. Before it,
    // the row is `pending` and sendSms would refuse the number (not_opted_in);
    // after it, consent begins and optedInAt is stamped.
    const since = new Date(Date.now() - 5_000).toISOString();
    const res = await apiFetch("/api/dropin/notify", {
      method: "POST",
      body: JSON.stringify({
        channels: ["sms"],
        phone: PROMO_PHONE,
        email: PROMO_EMAIL,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.phoneVerificationId).toBeTruthy();

    const db = getDb();
    const [before] = await db
      .select()
      .from(phoneOptIns)
      .where(and(eq(phoneOptIns.phone, PROMO_PHONE_E164), eq(phoneOptIns.channel, "sms")));
    expect(before.status).toBe("pending");
    expect(before.optedInAt).toBeNull();

    const code = await readOtpCode(PROMO_PHONE_E164, since);
    await completeOtp(body.phoneVerificationId, code);

    const [after] = await db
      .select()
      .from(phoneOptIns)
      .where(and(eq(phoneOptIns.phone, PROMO_PHONE_E164), eq(phoneOptIns.channel, "sms")));
    expect(
      after.status,
      "a verified OTP must promote the pending pickup_notify consent",
    ).toBe("opted_in");
    expect(after.optedInAt).not.toBeNull();
    // The promotion does not rewrite the evidence — it stays the notify surface's.
    expect(after.optInSource).toBe(PICKUP_NOTIFY_SOURCE);
    expect(after.consentTextShown).toBe(CONSENT_COPY.sms);
  });

  it("rejects an SMS channel with no phone (422) and an email channel with no email (422)", async () => {
    const noPhone = await apiFetch("/api/dropin/notify", {
      method: "POST",
      body: JSON.stringify({ channels: ["sms"], email: `x-${SUFFIX}@example.invalid` }),
    });
    expect(noPhone.status).toBe(422);

    const noEmail = await apiFetch("/api/dropin/notify", {
      method: "POST",
      body: JSON.stringify({ channels: ["email"] }),
    });
    expect(noEmail.status).toBe(422);
  });

  it("a guest with no Turnstile token still succeeds in dev/CI (fail-open) — the prod gate is enforced by verifyTurnstile", async () => {
    // verifyTurnstile fails OPEN when no TURNSTILE_SECRET_KEY is configured and
    // !isProd (see src/lib/auth/turnstile.ts), which is the dev/CI state. In
    // prod, the secret is set and a missing/invalid token yields 400. This suite
    // cannot assert that path without a prod env, so it documents the guard and
    // asserts the dev happy path — the endpoint DOES call verifyTurnstile for
    // guests (grep the source), and the two auth endpoints share the pattern.
    const res = await apiFetch("/api/dropin/notify", {
      method: "POST",
      body: JSON.stringify({
        channels: ["email"],
        email: `turnstile-${SUFFIX}@example.invalid`,
      }),
    });
    expect(res.status).toBe(200);
  });

  it("a signed-in user needs no Turnstile and opts in under their ACCOUNT email", async () => {
    const user = await createTestUserWithPassword();
    signedInEmail = user.email;
    const cookie = await getAuthCookie(user.email, user.password);

    // No turnstileToken, and no email in the body — the account email is the key.
    const res = await apiFetch("/api/dropin/notify", {
      method: "POST",
      cookie,
      body: JSON.stringify({ channels: ["email"] }),
    });
    expect(res.status).toBe(200);

    const db = getDb();
    const [opt] = await db
      .select()
      .from(emailOptIns)
      .where(
        and(
          eq(emailOptIns.organizationId, organizationId),
          eq(emailOptIns.email, user.email.toLowerCase()),
        ),
      );
    expect(opt, "the opt-in must be recorded on the account email").toBeTruthy();
    expect(opt.userId).toBe(user.userId);
    expect(opt.status).toBe("pending");
  });

  it("a duplicate submit (same user, venue, sport) reactivates one row, never two", async () => {
    const submit = () =>
      apiFetch("/api/dropin/notify", {
        method: "POST",
        body: JSON.stringify({
          channels: ["sms"],
          phone: DUP_PHONE,
          email: DUP_EMAIL,
          venueId,
          sport: "basketball",
        }),
      });

    expect((await submit()).status).toBe(200);
    expect((await submit()).status).toBe(200);

    const db = getDb();
    const uid = await userIdByEmail(DUP_EMAIL);
    const subs = await db
      .select({ id: pickupAlertSubscriptions.id, active: pickupAlertSubscriptions.active })
      .from(pickupAlertSubscriptions)
      .where(
        and(
          eq(pickupAlertSubscriptions.userId, uid),
          eq(pickupAlertSubscriptions.organizationId, organizationId),
          eq(pickupAlertSubscriptions.venueId, venueId),
          eq(pickupAlertSubscriptions.sport, "basketball"),
        ),
      );
    expect(subs.length, "a repeat submit must not duplicate the subscription").toBe(1);
    expect(subs[0].active).toBe(true);
  });

  it("a STOPped number is NOT resurrected, even by a valid OTP", async () => {
    // The compliance invariant. This number replied STOP with optInSource =
    // pickup_notify — so the promotion's SOURCE filter does NOT protect it; only
    // the `status = 'pending'` predicate in promotePendingPhoneConsents keeps a
    // valid OTP from resurrecting it. Holding the phone is not withdrawing a STOP.
    const db = getDb();
    await db.insert(phoneOptIns).values({
      organizationId,
      phone: STOP_PHONE_E164,
      channel: "sms",
      status: "opted_out",
      optedInAt: new Date("2026-01-01T00:00:00Z"),
      optedOutAt: new Date("2026-02-03T04:05:06Z"),
      optInSource: PICKUP_NOTIFY_SOURCE,
      stopKeywordTriggered: "STOP",
    });

    const since = new Date(Date.now() - 5_000).toISOString();
    const res = await apiFetch("/api/dropin/notify", {
      method: "POST",
      body: JSON.stringify({
        channels: ["sms"],
        phone: STOP_PHONE,
        email: STOP_EMAIL,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // An OTP is still sent (the number is unverified from this surface's view)...
    expect(body.phoneVerificationId).toBeTruthy();

    // ...and a valid code, entered correctly, still must not touch the STOP row.
    const code = await readOtpCode(STOP_PHONE_E164, since);
    await completeOtp(body.phoneVerificationId, code);

    const rows = await db
      .select()
      .from(phoneOptIns)
      .where(and(eq(phoneOptIns.phone, STOP_PHONE_E164), eq(phoneOptIns.channel, "sms")));
    expect(rows.length, "the pending upsert must not have added a second row").toBe(1);
    expect(
      rows[0].status,
      "a valid OTP must not resurrect a STOPped number — the way back is START",
    ).toBe("opted_out");
    expect(rows[0].optedOutAt).not.toBeNull();
    expect(rows[0].stopKeywordTriggered).toBe("STOP");
  });

  it("backfills users.phone when a MATCHed existing user has none on file", async () => {
    // Pre-create the users row directly with phone left NULL — e.g. this
    // person previously did an email-only opt-in, which never had a phone to
    // store. resolveMarketingUser MATCHes this row by emailCanonical instead
    // of creating a new one, so without the backfill the SMS opt-in would
    // confirm but the fill-alert dispatcher (which only reads users.phone)
    // could never deliver to them.
    const db = getDb();
    const emailCanonical = normalizeForUniqueness(BACKFILL_EMAIL);
    const [seeded] = await db
      .insert(users)
      .values({
        email: BACKFILL_EMAIL,
        emailCanonical,
        firstName: "Test",
        lastName: "Backfill",
        phone: null,
        passwordHash: null,
        emailVerified: false,
        phoneVerified: false,
      })
      .returning({ id: users.id });

    const res = await apiFetch("/api/dropin/notify", {
      method: "POST",
      body: JSON.stringify({
        channels: ["sms"],
        phone: BACKFILL_PHONE,
        email: BACKFILL_EMAIL,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const [after] = await db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(eq(users.id, seeded.id));
    expect(after, "resolveMarketingUser must have MATCHed the pre-seeded row").toBeTruthy();
    expect(after.phone, "users.phone must be backfilled to the opted-in E.164 number").toBe(
      BACKFILL_PHONE_E164,
    );
  });
});
