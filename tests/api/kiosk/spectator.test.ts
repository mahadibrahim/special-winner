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
import { eq, and } from "drizzle-orm";
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
let LOCATION_ID = "";

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
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(spectatorWaivers).where(eq(spectatorWaivers.phone, PHONE));
    await db.delete(phoneOptIns).where(eq(phoneOptIns.phone, PHONE_E164));
    await db.delete(users).where(eq(users.email, EMAIL));
    await db.delete(users).where(eq(users.email, OPT_EMAIL));
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
