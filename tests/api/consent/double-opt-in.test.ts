/**
 * Email double opt-in — the email half of the consent doctrine:
 *
 *   An unauthenticated, unattended surface may capture INTENT.
 *   Only a VERIFIED ACT may grant CONSENT.
 *
 * Phone gets there via the OTP. Email gets there via the confirmation link
 * delivered to the mailbox itself — clicking it is the proof that the address
 * typed at a public kiosk really belongs to the person who typed it.
 *
 * What this suite pins down:
 *   1. Ticking the box does NOT verify the address. Marketing selects on
 *      users.emailVerified, so an unverified address is structurally incapable
 *      of entering the list.
 *   2. The CLICK promotes: emailVerified, the email_opt_ins row (pending →
 *      opted_in) and only then the clearing of a previous unsubscribe.
 *   3. THE GUARD: a confirmation click must not resurrect an `opted_out` row it
 *      never captured. Proving you hold the mailbox is not the same as
 *      withdrawing an unsubscribe.
 *   4. Evidence exists at CAPTURE time — the source and the literal sentence
 *      shown are on file before any send, so a blocked pipe cannot make a real
 *      consent disappear without a trace.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { emailOptIns } from "@/lib/db/schema/email-opt-ins";
import { spectatorWaivers } from "@/lib/db/schema/spectators";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";
import { CONSENT_COPY } from "@/lib/consents/marketing-channels";
import { KIOSK_SPECTATOR_SOURCE } from "@/lib/consents/marketing";
import { eq, and, inArray } from "drizzle-orm";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

const SUFFIX = `${Date.now()}`.slice(-7);

// Ticked email, never clicked.
const INTENT_EMAIL = `dbl-intent-${SUFFIX}@example.invalid`;
const INTENT_PHONE = `571${SUFFIX}`;

// Ticked email, then clicked — the happy path.
const CLICK_EMAIL = `dbl-click-${SUFFIX}@example.invalid`;
const CLICK_PHONE = `572${SUFFIX}`;

// An address that unsubscribed AT THE KIOSK once (same optInSource the kiosk
// writes, so the promotion's SOURCE filter does not protect it) and later opted
// out. The `status = 'pending'` predicate is the only thing between a valid
// confirmation click and a resurrected unsubscribe.
const OUT_EMAIL = `dbl-out-${SUFFIX}@example.invalid`;
const OUT_PHONE = `573${SUFFIX}`;

const ALL_EMAILS = [INTENT_EMAIL, CLICK_EMAIL, OUT_EMAIL];
const ALL_PHONES = [INTENT_PHONE, CLICK_PHONE, OUT_PHONE];

let LOCATION_ID = "";
let ORG_ID = "";

async function signWithEmailConsent(email: string, phone: string) {
  const res = await apiFetch(`/api/kiosk/${LOCATION_ID}/spectator/sign`, {
    method: "POST",
    body: JSON.stringify({
      firstName: "Double",
      lastName: "Optin",
      phone,
      email,
      signedName: "Double Optin",
      consents: ["email"],
    }),
  });
  const body = await res.json();
  expect(res.status, `sign said: ${JSON.stringify(body)}`).toBe(200);
  return body as {
    ok: true;
    waiverId: string;
    awaitingCode: string[];
    pending: string[];
  };
}

/**
 * Read the confirmation link out of the MESSAGING_MOCK=1 inbox rather than a
 * real mailbox. The mock records the email the leaf sender would have sent,
 * keyed on the recipient exactly as `sendEmail` received it.
 */
async function readConfirmToken(email: string, since: string): Promise<string> {
  const res = await apiFetch(
    `/api/test/messaging-mock?to=${encodeURIComponent(email)}` +
      `&channel=email&since=${encodeURIComponent(since)}`,
  );
  expect(res.status, "messaging mock endpoint (needs E2E_TEST_ENDPOINTS=yes)").toBe(200);
  const body = (await res.json()) as {
    enabled: boolean;
    messages: { body: string; subject: string | null }[];
  };
  expect(body.enabled, "MESSAGING_MOCK must be on for this suite").toBe(true);
  const last = body.messages.at(-1);
  expect(last, `no confirmation email was sent to ${email}`).toBeTruthy();
  const token = last!.body.match(/\/api\/consent\/confirm\/([A-Za-z0-9_-]{43})/)?.[1];
  expect(token, `no confirmation link in: ${last!.body.slice(0, 400)}`).toBeTruthy();
  return token!;
}

describe("email double opt-in", () => {
  beforeAll(async () => {
    const db = getDb();
    const [rentalVenue] = await db
      .select({ locationId: venues.locationId })
      .from(venues)
      .where(eq(venues.id, E2E_RENTAL_VENUE_ID))
      .limit(1);
    if (!rentalVenue) {
      throw new Error("E2E rental venue not seeded — run `npm run db:seed:e2e` first.");
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
    await db.delete(spectatorWaivers).where(inArray(spectatorWaivers.phone, ALL_PHONES));
    await db.delete(emailOptIns).where(inArray(emailOptIns.email, ALL_EMAILS));
    await db.delete(users).where(inArray(users.email, ALL_EMAILS));
  });

  it("ticking the email box captures INTENT — it does not verify the address", async () => {
    // The whole garbage-data fix: ticking a box is intent, not proof. Anyone can
    // type anyone's address into a lobby iPad.
    const body = await signWithEmailConsent(INTENT_EMAIL, INTENT_PHONE);

    // A confirmation is IN FLIGHT — that is `awaitingCode`, not "subscribed",
    // and certainly not the dead-end `pending` bucket (nothing could promote it).
    expect(body.awaitingCode).toContain("email");
    expect(body.pending).not.toContain("email");

    const db = getDb();
    const [u] = await db.select().from(users).where(eq(users.email, INTENT_EMAIL));
    expect(u, "an email opt-in creates the user it hangs off").toBeTruthy();
    expect(u.emailVerified, "must NOT be verified before the click").toBe(false);

    const [row] = await db
      .select()
      .from(emailOptIns)
      .where(and(eq(emailOptIns.organizationId, ORG_ID), eq(emailOptIns.email, INTENT_EMAIL)));
    expect(row.status, "an unauthenticated tick is intent, never consent").toBe("pending");
    expect(row.optedInAt).toBeNull();
  });

  it("the evidence is on file at CAPTURE time, before any click", async () => {
    // A consent whose only trace is a confirmation email is a consent that a
    // blocked pipe can erase. The sentence they saw, the surface that showed it
    // and the moment it happened are recorded when the box is ticked.
    const db = getDb();
    const [row] = await db
      .select()
      .from(emailOptIns)
      .where(and(eq(emailOptIns.organizationId, ORG_ID), eq(emailOptIns.email, INTENT_EMAIL)));
    expect(row, "the tick in the previous test must have left a row").toBeTruthy();
    expect(row.consentTextShown).toBe(CONSENT_COPY.email);
    expect(row.optInSource).toBe(KIOSK_SPECTATOR_SOURCE);
    expect(row.createdAt).toBeTruthy();
    expect(row.userId).toBeTruthy();
  });

  it("the CLICK promotes — that is the verified act email consent turns on", async () => {
    const since = new Date(Date.now() - 5_000).toISOString();
    await signWithEmailConsent(CLICK_EMAIL, CLICK_PHONE);

    const db = getDb();
    const [before] = await db
      .select()
      .from(users)
      .where(eq(users.email, CLICK_EMAIL));
    expect(before.emailVerified).toBe(false);

    const token = await readConfirmToken(CLICK_EMAIL, since);
    const res = await apiFetch(`/api/consent/confirm/${token}`);
    expect(res.status).toBe(200);

    const [after] = await db.select().from(users).where(eq(users.email, CLICK_EMAIL));
    expect(after.emailVerified, "the click is proof the mailbox is theirs").toBe(true);
    expect(
      after.marketingOptedOutAt,
      "only a verified act may clear an unsubscribe — this is one",
    ).toBeNull();

    const [row] = await db
      .select()
      .from(emailOptIns)
      .where(and(eq(emailOptIns.organizationId, ORG_ID), eq(emailOptIns.email, CLICK_EMAIL)));
    expect(row.status).toBe("opted_in");
    expect(row.optedInAt).not.toBeNull();
    // The promotion does not rewrite the evidence — it is still the kiosk's
    // consent, carrying the sentence the kiosk showed.
    expect(row.optInSource).toBe(KIOSK_SPECTATOR_SOURCE);
    expect(row.consentTextShown).toBe(CONSENT_COPY.email);
  });

  it("a confirmation click must NOT resurrect an opt-out it never captured", async () => {
    // The invariant a compliance reviewer probes, and the email twin of
    // "a VALID OTP must NOT promote a row the kiosk was never allowed to touch"
    // in tests/api/kiosk/spectator.test.ts.
    //
    // This address opted in at the kiosk once (optInSource = kiosk_spectator, so
    // the promotion's SOURCE filter does NOT save us) and later unsubscribed.
    // Someone signs at the kiosk with it and a real confirmation link, delivered
    // to that very mailbox, is clicked. Holding the mailbox is not withdrawing
    // an unsubscribe: the `status = 'pending'` predicate is the only thing that
    // makes that true, and this test is what proves it is still there.
    const db = getDb();
    const optedOutAt = new Date("2026-02-03T04:05:06Z");
    const [u] = await db
      .insert(users)
      .values({
        email: OUT_EMAIL,
        emailCanonical: OUT_EMAIL,
        firstName: "Unsub",
        lastName: "Scribed",
        passwordHash: null,
        marketingOptedOutAt: optedOutAt,
      })
      .returning({ id: users.id });
    await db.insert(emailOptIns).values({
      organizationId: ORG_ID,
      userId: u.id,
      email: OUT_EMAIL,
      status: "opted_out",
      optedInAt: new Date("2026-01-01T00:00:00Z"),
      optedOutAt,
      optInSource: KIOSK_SPECTATOR_SOURCE,
      consentTextShown: CONSENT_COPY.email,
    });

    const since = new Date(Date.now() - 5_000).toISOString();
    // The signature stands — consent is separable from entry.
    await signWithEmailConsent(OUT_EMAIL, OUT_PHONE);

    const token = await readConfirmToken(OUT_EMAIL, since);
    const res = await apiFetch(`/api/consent/confirm/${token}`);
    expect(res.status).toBe(200);

    const rows = await db
      .select()
      .from(emailOptIns)
      .where(and(eq(emailOptIns.organizationId, ORG_ID), eq(emailOptIns.email, OUT_EMAIL)));
    expect(rows.length).toBe(1);
    expect(
      rows[0].status,
      "a confirmation click must not resurrect an unsubscribe the kiosk never captured",
    ).toBe("opted_out");
    expect(rows[0].optedOutAt).not.toBeNull();

    const [after] = await db.select().from(users).where(eq(users.email, OUT_EMAIL));
    expect(
      after.marketingOptedOutAt,
      "nothing was promoted, so nothing may clear the unsubscribe",
    ).not.toBeNull();
  });
});
