/**
 * POST /api/kiosk/[locationSlug]/spectator/sign
 * GET  /api/kiosk/[locationSlug]/spectator/lookup
 *
 * The two rules this suite exists to protect:
 *   1. Signing a waiver makes you a SIGNATURE. Ticking a marketing opt-in makes
 *      you a USER. Declining every channel must still admit you (200) and must
 *      NOT create an account you never asked for.
 *   2. The consent record carries the literal sentence the customer saw — a
 *      carrier reviewer compares the live form against the stored evidence.
 *
 * Plus the kiosk privacy rule: the lookup is public and unattended, so it
 * matches phone digits only and never returns a surname.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { spectatorWaivers } from "@/lib/db/schema/spectators";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";
import { eq, and, inArray } from "drizzle-orm";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";
import { normalizeUsPhone } from "@/lib/sms/send";

const SUFFIX = `${Date.now()}`.slice(-7);
const PHONE = `555${SUFFIX}`;
const EMAIL = `spectator-${SUFFIX}@example.invalid`;
const OPT_EMAIL = `opt-${EMAIL}`;
// phone_opt_ins is keyed on the E.164 form — that is the form sendSms's opt-in
// gate looks the number up by, so a consent stored in any other shape is a
// consent that can never be honoured. The endpoint normalizes before writing.
const PHONE_E164 = normalizeUsPhone(PHONE)!;

// A number that previously replied STOP. A stranger at the kiosk must not be
// able to type it in and put it back on the list.
const STOP_PHONE = `556${SUFFIX}`;
const STOP_PHONE_E164 = normalizeUsPhone(STOP_PHONE)!;
const STOP_EMAIL = `stopped-${SUFFIX}@example.invalid`;

// An address that previously unsubscribed.
const OUT_PHONE = `557${SUFFIX}`;
const OUT_EMAIL = `unsubscribed-${SUFFIX}@example.invalid`;

// A fresh phone whose FIRST kiosk opt-in must land as `pending`.
const PENDING_PHONE = `558${SUFFIX}`;
const PENDING_PHONE_E164 = normalizeUsPhone(PENDING_PHONE)!;
const PENDING_EMAIL = `pending-${SUFFIX}@example.invalid`;

// Two different people whose numbers share a last-4 — the lookup must not
// confuse them when all ten digits are typed.
const LAST4 = SUFFIX.slice(-4);
const TWIN_A = `561${SUFFIX.slice(0, 3)}${LAST4}`;
const TWIN_B = `562${SUFFIX.slice(0, 3)}${LAST4}`;

// The promotion path: sign → OTP → the pending intent becomes real consent.
const OTP_PHONE = `563${SUFFIX}`;
const OTP_PHONE_E164 = normalizeUsPhone(OTP_PHONE)!;
const OTP_EMAIL = `otp-${SUFFIX}@example.invalid`;

// WhatsApp ticked ALONE. Nothing else in the system can ever promote a phone
// consent, so if the kiosk does not send an OTP for it, the row is dead forever.
const WA_PHONE = `564${SUFFIX}`;
const WA_PHONE_E164 = normalizeUsPhone(WA_PHONE)!;
const WA_EMAIL = `whatsapp-${SUFFIX}@example.invalid`;

// A number that opted in AT THE KIOSK once, then replied STOP. Same optInSource
// as the kiosk writes, so the promotion's source filter does NOT protect it —
// the `status = 'pending'` predicate is the only thing standing between a valid
// OTP and a resurrected STOP.
const STOPPED_KIOSK_PHONE = `565${SUFFIX}`;
const STOPPED_KIOSK_PHONE_E164 = normalizeUsPhone(STOPPED_KIOSK_PHONE)!;
const STOPPED_KIOSK_EMAIL = `stopped-kiosk-${SUFFIX}@example.invalid`;

let LOCATION_ID = "";
let ORG_ID = "";

/**
 * Read the OTP the kiosk texted out of the MESSAGING_MOCK=1 inbox. The mock
 * records the message the leaf sender would have sent, keyed on the recipient
 * exactly as `sendSms` received it — the E.164 form.
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

describe("kiosk spectator waiver", () => {
  beforeAll(async () => {
    const db = getDb();
    // The kiosk is facility-scoped: resolve the location that owns the seeded
    // E2E rental venue — same resolution the booking-search suite does.
    const [rentalVenue] = await db
      .select({ locationId: venues.locationId })
      .from(venues)
      .where(eq(venues.id, E2E_RENTAL_VENUE_ID))
      .limit(1);
    if (!rentalVenue) {
      throw new Error(
        "E2E rental venue not seeded — run `npm run db:seed:e2e` first.",
      );
    }
    LOCATION_ID = rentalVenue.locationId;
    const [loc] = await db
      .select({ organizationId: locations.organizationId })
      .from(locations)
      .where(eq(locations.id, LOCATION_ID))
      .limit(1);
    ORG_ID = loc.organizationId;
  });

  afterAll(async () => {
    const db = getDb();
    await db
      .delete(spectatorWaivers)
      .where(
        inArray(spectatorWaivers.phone, [
          PHONE,
          STOP_PHONE,
          OUT_PHONE,
          PENDING_PHONE,
          TWIN_A,
          TWIN_B,
          OTP_PHONE,
          WA_PHONE,
          STOPPED_KIOSK_PHONE,
        ]),
      );
    await db
      .delete(phoneOptIns)
      .where(
        inArray(phoneOptIns.phone, [
          PHONE_E164,
          STOP_PHONE_E164,
          PENDING_PHONE_E164,
          OTP_PHONE_E164,
          WA_PHONE_E164,
          STOPPED_KIOSK_PHONE_E164,
        ]),
      );
    await db
      .delete(users)
      .where(
        inArray(users.email, [
          EMAIL,
          OPT_EMAIL,
          STOP_EMAIL,
          OUT_EMAIL,
          PENDING_EMAIL,
          OTP_EMAIL,
          WA_EMAIL,
          STOPPED_KIOSK_EMAIL,
        ]),
      );
  });

  it("signing with NO opt-ins creates a signature but NOT a user", async () => {
    // The waiver is a condition of entry. Declining every channel must still
    // admit you — and must not silently create an account.
    const res = await apiFetch(`/api/kiosk/${LOCATION_ID}/spectator/sign`, {
      method: "POST",
      body: JSON.stringify({
        firstName: "Nocon",
        lastName: "Sent",
        phone: PHONE,
        email: EMAIL,
        signedName: "Nocon Sent",
        consents: [], // declined everything
      }),
    });
    expect(res.status).toBe(200);

    const db = getDb();
    const waivers = await db.select().from(spectatorWaivers).where(eq(spectatorWaivers.phone, PHONE));
    expect(waivers.length).toBe(1);
    expect(waivers[0].userId).toBeNull();

    const u = await db.select().from(users).where(eq(users.email, EMAIL));
    expect(u.length, "declining every opt-in must not create an account").toBe(0);
  });

  it("an SMS opt-in creates a user and an SMS-scoped consent carrying the exact text shown", async () => {
    const { CONSENT_COPY } = await import("@/lib/consents/marketing-channels");
    const res = await apiFetch(`/api/kiosk/${LOCATION_ID}/spectator/sign`, {
      method: "POST",
      body: JSON.stringify({
        firstName: "Opted",
        lastName: "In",
        phone: PHONE,
        email: OPT_EMAIL,
        signedName: "Opted In",
        consents: ["sms"],
      }),
    });
    expect(res.status).toBe(200);

    const db = getDb();
    const rows = await db
      .select()
      .from(phoneOptIns)
      .where(and(eq(phoneOptIns.phone, PHONE_E164), eq(phoneOptIns.channel, "sms")));
    expect(rows.length).toBe(1);
    expect(rows[0].consentTextShown).toBe(CONSENT_COPY.sms);
    expect(rows[0].userId).toBeTruthy();
  });

  it("a kiosk phone consent starts PENDING — the tick is intent, the OTP is consent", async () => {
    // The kiosk is unauthenticated: it cannot know the number typed into it
    // belongs to the person typing. So the row it writes must not authorise a
    // send. Only the OTP (proof they hold the phone) promotes it to opted_in.
    const res = await apiFetch(`/api/kiosk/${LOCATION_ID}/spectator/sign`, {
      method: "POST",
      body: JSON.stringify({
        firstName: "Pend",
        lastName: "Ing",
        phone: PENDING_PHONE,
        email: PENDING_EMAIL,
        signedName: "Pend Ing",
        consents: ["sms"],
      }),
    });
    expect(res.status).toBe(200);

    const db = getDb();
    const [row] = await db
      .select()
      .from(phoneOptIns)
      .where(
        and(
          eq(phoneOptIns.phone, PENDING_PHONE_E164),
          eq(phoneOptIns.channel, "sms"),
        ),
      );
    expect(row).toBeTruthy();
    expect(row.status).toBe("pending");
    expect(row.optedInAt).toBeNull();
    // The evidence is still written immediately — proving what was shown is
    // independent of proving it was them.
    expect(row.consentTextShown).toBeTruthy();
    expect(row.optInSource).toBe("kiosk_spectator");
  });

  it("a stranger at the kiosk CANNOT undo a STOP", async () => {
    // The compliance hole this suite exists for: phone_opt_ins is keyed on
    // (org, phone, channel), and the kiosk identifies nobody. If a tick here
    // upserted `opted_in`, anyone in the lobby could type a number that had
    // replied STOP and put it back on the list — TCPA/10DLC, from an iPad.
    const db = getDb();
    await db.insert(phoneOptIns).values({
      organizationId: ORG_ID,
      phone: STOP_PHONE_E164,
      channel: "sms",
      status: "opted_out",
      optedOutAt: new Date(),
      optInSource: "registration_form",
      stopKeywordTriggered: "STOP",
    });

    const res = await apiFetch(`/api/kiosk/${LOCATION_ID}/spectator/sign`, {
      method: "POST",
      body: JSON.stringify({
        firstName: "Strang",
        lastName: "Er",
        phone: STOP_PHONE,
        email: STOP_EMAIL,
        signedName: "Strang Er",
        consents: ["sms"],
      }),
    });
    // The signature still stands — consent is separable from entry.
    expect(res.status).toBe(200);

    const rows = await db
      .select()
      .from(phoneOptIns)
      .where(
        and(
          eq(phoneOptIns.phone, STOP_PHONE_E164),
          eq(phoneOptIns.channel, "sms"),
        ),
      );
    expect(rows.length).toBe(1);
    expect(
      rows[0].status,
      "an unauthenticated kiosk must never resurrect a STOPped number",
    ).not.toBe("opted_in");
    expect(rows[0].optedOutAt).not.toBeNull();
    // The audit must survive intact: a row that says "opted in" while carrying
    // "this number sent STOP" is the exact contradiction a carrier reviewer
    // reads as a violation.
    expect(rows[0].stopKeywordTriggered).toBe("STOP");
  });

  it("a stranger at the kiosk CANNOT resurrect an email unsubscribe", async () => {
    const db = getDb();
    const optedOutAt = new Date("2026-01-02T03:04:05Z");
    await db.insert(users).values({
      email: OUT_EMAIL,
      emailCanonical: OUT_EMAIL,
      firstName: "Unsub",
      lastName: "Scribed",
      passwordHash: null,
      marketingOptedOutAt: optedOutAt,
    });

    const res = await apiFetch(`/api/kiosk/${LOCATION_ID}/spectator/sign`, {
      method: "POST",
      body: JSON.stringify({
        firstName: "Unsub",
        lastName: "Scribed",
        phone: OUT_PHONE,
        email: OUT_EMAIL,
        signedName: "Unsub Scribed",
        consents: ["email"],
      }),
    });
    expect(res.status).toBe(200);

    const [after] = await db
      .select()
      .from(users)
      .where(eq(users.email, OUT_EMAIL));
    expect(
      after.marketingOptedOutAt,
      "only the double-opt-in click may clear an unsubscribe — not a typed address",
    ).not.toBeNull();
  });

  it("the OTP PROMOTES the pending intent — that is the whole point of the code", async () => {
    // The verified act. Everything upstream is intent; this is where consent
    // begins, and `optedInAt` is the timestamp a carrier reviewer is shown as
    // the moment it did.
    const since = new Date(Date.now() - 5_000).toISOString();
    const res = await apiFetch(`/api/kiosk/${LOCATION_ID}/spectator/sign`, {
      method: "POST",
      body: JSON.stringify({
        firstName: "Prom",
        lastName: "Oted",
        phone: OTP_PHONE,
        email: OTP_EMAIL,
        signedName: "Prom Oted",
        consents: ["sms"],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    // The honest contract: a confirmation is IN FLIGHT. Not "subscribed" —
    // sendSms would still refuse this number (not_opted_in) until the code lands.
    expect(body.awaitingCode).toEqual(["sms"]);
    expect(body.pending).toEqual([]);
    expect(body.phoneVerificationId).toBeTruthy();

    const db = getDb();
    const [before] = await db
      .select()
      .from(phoneOptIns)
      .where(
        and(eq(phoneOptIns.phone, OTP_PHONE_E164), eq(phoneOptIns.channel, "sms")),
      );
    expect(before.status).toBe("pending");
    expect(before.optedInAt).toBeNull();

    const code = await readOtpCode(OTP_PHONE_E164, since);
    await completeOtp(body.phoneVerificationId, code);

    const [after] = await db
      .select()
      .from(phoneOptIns)
      .where(
        and(eq(phoneOptIns.phone, OTP_PHONE_E164), eq(phoneOptIns.channel, "sms")),
      );
    expect(
      after.status,
      "a verified OTP must promote the pending intent it was sent to confirm",
    ).toBe("opted_in");
    expect(after.optedInAt).not.toBeNull();
    // Still the kiosk's consent — the promotion does not rewrite the evidence.
    expect(after.optInSource).toBe("kiosk_spectator");
    expect(after.consentTextShown).toBeTruthy();
  });

  it("a WhatsApp-ONLY opt-in is promotable — the OTP is sent for any phone channel", async () => {
    // The dead-consent bug: the OTP used to be sent only if `sms` was ticked.
    // Tick WhatsApp alone and you got a `pending` row that NOTHING in the system
    // could ever promote — promotePendingPhoneConsents is the only promoter and
    // it only runs off an OTP. A consent the customer really gave, which we could
    // never honour, forever. Proving the phone is what both phone channels need.
    const since = new Date(Date.now() - 5_000).toISOString();
    const res = await apiFetch(`/api/kiosk/${LOCATION_ID}/spectator/sign`, {
      method: "POST",
      body: JSON.stringify({
        firstName: "Whats",
        lastName: "App",
        phone: WA_PHONE,
        email: WA_EMAIL,
        signedName: "Whats App",
        consents: ["whatsapp"],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(
      body.phoneVerificationId,
      "a whatsapp-only tick must still text a code — nothing else can promote it",
    ).toBeTruthy();
    expect(body.awaitingCode).toEqual(["whatsapp"]);

    const code = await readOtpCode(WA_PHONE_E164, since);
    await completeOtp(body.phoneVerificationId, code);

    const db = getDb();
    const [after] = await db
      .select()
      .from(phoneOptIns)
      .where(
        and(
          eq(phoneOptIns.phone, WA_PHONE_E164),
          eq(phoneOptIns.channel, "whatsapp"),
        ),
      );
    expect(after.status).toBe("opted_in");
    expect(after.optedInAt).not.toBeNull();

    // And it promoted ONLY what was ticked: no sms row was conjured from a
    // whatsapp consent. (tests/api/consent/channel-isolation guards the send
    // side of the same rule.)
    const sms = await db
      .select()
      .from(phoneOptIns)
      .where(
        and(eq(phoneOptIns.phone, WA_PHONE_E164), eq(phoneOptIns.channel, "sms")),
      );
    expect(sms.length, "a whatsapp tick must not create an sms consent").toBe(0);
  });

  it("a STOPped number gets no OTP at all — the block moved from promotion to the send", async () => {
    // The invariant a carrier reviewer probes, one layer earlier than it used
    // to be. This number opted in at the kiosk once (optInSource =
    // kiosk_spectator — so the promotion's SOURCE filter does not save us
    // here) and later replied STOP. Someone signs at the kiosk with that
    // number.
    //
    // Since 5471c9bd, resolveConsentGate blocks `opted_out` unconditionally —
    // even for the OTP's own bypassOptInCheck send — so createPhoneVerification
    // never generates a code for this number. There is nothing left to
    // promote because there is nothing that was ever sent to confirm.
    // Holding the phone is still not the same as withdrawing a STOP.
    const db = getDb();
    const optedOutAt = new Date("2026-02-03T04:05:06Z");
    await db.insert(phoneOptIns).values({
      organizationId: ORG_ID,
      phone: STOPPED_KIOSK_PHONE_E164,
      channel: "sms",
      status: "opted_out",
      optedInAt: new Date("2026-01-01T00:00:00Z"),
      optedOutAt,
      optInSource: "kiosk_spectator",
      stopKeywordTriggered: "STOP",
    });

    const since = new Date(Date.now() - 5_000).toISOString();
    const res = await apiFetch(`/api/kiosk/${LOCATION_ID}/spectator/sign`, {
      method: "POST",
      body: JSON.stringify({
        firstName: "Stop",
        lastName: "Ped",
        phone: STOPPED_KIOSK_PHONE,
        email: STOPPED_KIOSK_EMAIL,
        signedName: "Stop Ped",
        consents: ["sms"],
      }),
    });
    // The signature stands — consent is separable from entry.
    expect(res.status).toBe(200);
    const body = await res.json();
    // No confirmation in flight — the send was blocked before a code
    // existed. The endpoint fails soft: 200, channel reported "pending".
    expect(body.phoneVerificationId, "no OTP means no verification id").toBeFalsy();
    expect(body.awaitingCode).toEqual([]);
    expect(body.pending).toEqual(["sms"]);

    // Prove the block happened at the send, not merely at a later promotion
    // step: nothing was ever texted to this number.
    const mockRes = await apiFetch(
      `/api/test/messaging-mock?to=${encodeURIComponent(STOPPED_KIOSK_PHONE_E164)}` +
        `&channel=sms&since=${encodeURIComponent(since)}`,
    );
    expect(mockRes.status).toBe(200);
    const mockBody = (await mockRes.json()) as { enabled: boolean; messages: unknown[] };
    expect(mockBody.enabled, "MESSAGING_MOCK must be on for this suite").toBe(true);
    expect(
      mockBody.messages,
      "STOP must block the OTP itself, not just its promotion",
    ).toEqual([]);

    const rows = await db
      .select()
      .from(phoneOptIns)
      .where(
        and(
          eq(phoneOptIns.phone, STOPPED_KIOSK_PHONE_E164),
          eq(phoneOptIns.channel, "sms"),
        ),
      );
    expect(rows.length).toBe(1);
    expect(
      rows[0].status,
      "no OTP was ever sent, so there is nothing that could have promoted it",
    ).toBe("opted_out");
    expect(rows[0].optedOutAt).not.toBeNull();
    // The audit survives intact: a row reading "opted in" while carrying "this
    // number sent STOP" is the contradiction a carrier reviewer calls a violation.
    expect(rows[0].stopKeywordTriggered).toBe("STOP");
  });

  it("the lookup matches the FULL typed number, not just its last four", async () => {
    // Two people in one org sharing a last-4 is near-certain at a few thousand
    // waivers. Truncating a 10-digit query to its last 4 greeted the wrong
    // person by name and admitted them under a stranger's signature.
    for (const [firstName, phone] of [
      ["Alpha", TWIN_A],
      ["Bravo", TWIN_B], // signed later — the "newest wins" tiebreak would pick this one
    ] as const) {
      const res = await apiFetch(`/api/kiosk/${LOCATION_ID}/spectator/sign`, {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName: "Twin",
          phone,
          signedName: `${firstName} Twin`,
          consents: [],
        }),
      });
      expect(res.status).toBe(200);
    }

    const res = await apiFetch(
      `/api/kiosk/${LOCATION_ID}/spectator/lookup?q=${TWIN_A}`,
    );
    const body = await res.json();
    expect(body.found).toBe(true);
    expect(body.firstName).toBe("Alpha");
  });

  it("lookup finds a valid waiver by phone and does not leak a full surname", async () => {
    const res = await apiFetch(`/api/kiosk/${LOCATION_ID}/spectator/lookup?q=${PHONE.slice(-4)}`);
    const body = await res.json();
    expect(body.found).toBe(true);
    // Same privacy rule as the booking search: the kiosk is public.
    expect(JSON.stringify(body)).not.toContain("Sent");
  });

  it("returns nothing for a sub-4-digit query and never matches on a name", async () => {
    const short = await apiFetch(`/api/kiosk/${LOCATION_ID}/spectator/lookup?q=${PHONE.slice(-3)}`);
    expect((await short.json()).found).toBe(false);

    const byName = await apiFetch(`/api/kiosk/${LOCATION_ID}/spectator/lookup?q=Nocon`);
    expect((await byName.json()).found).toBe(false);
  });
});
