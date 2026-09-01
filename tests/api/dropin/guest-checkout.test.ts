import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { consents } from "@/lib/db/schema/consents";
import { WAIVER_VALID_DAYS } from "@/lib/consents/liability";
import { apiFetch, getAuthCookie } from "../setup/test-helpers";
import {
  createTestDropInSession,
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

const ENDPOINT = "/api/dropin/guest-checkout";

// HTTP requests to localhost resolve the DEFAULT org via the domain
// resolver; a session created under a fresh fixture org trips the
// endpoint's multi-tenant guard (403). Free-path fixtures must live
// under the default org.
let defaultOrg: { organizationId: string; venueId: string };

beforeAll(async () => {
  defaultOrg = await resolveDefaultOrgForHttpTests();
});

const freeSessionInDefaultOrg = () =>
  createTestDropInSession({
    organizationId: defaultOrg.organizationId,
    venueId: defaultOrg.venueId,
    sessionRateCents: 0,
    memberRateCents: 0,
  });

const guestBody = (sessionId: string, email: string) => ({
  sessionId,
  firstName: "Guest",
  lastName: "Booker",
  email,
  waiverAccepted: true,
  waiverName: "Guest Booker",
});

describe("POST /api/dropin/guest-checkout", () => {
  it("400s on invalid body", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ sessionId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("409s for signed-in users (they have the authed flow)", async () => {
    let cookie: string;
    try {
      cookie = await getAuthCookie(
        "parent@test.aspiresports.com",
        "TestParent123!",
      );
    } catch {
      return; // fixture not present in this environment — skip
    }
    const ctx = await createTestDropInSession({});
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify(guestBody(ctx.sessionId, "anyone@example.com")),
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(409);
  });

  it("books a free session for a brand-new email, creating a passwordless user", async () => {
    const ctx = await freeSessionInDefaultOrg();
    const email = `guest-dropin-${Date.now()}@example.com`;

    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify(guestBody(ctx.sessionId, email)),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paymentRequired).toBe(false);
    expect(json.wasNewUser).toBe(true);
    expect(json.bookingId).toBeTruthy();

    // New guest users get a session cookie so the dashboard works.
    expect(res.headers.get("set-cookie") ?? "").toContain("auth_session");

    const db = getDb();
    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    expect(userRow).toBeTruthy();
    expect(userRow.passwordHash).toBeNull();

    const [booking] = await db
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, json.bookingId));
    expect(booking.userId).toBe(userRow.id);
    expect(booking.status).toBe("confirmed");
    expect(booking.waiverSignedBy).toBe("Guest Booker");
  });

  it("books WITHOUT waiver fields — unsigned row, waiver deferred to post-payment", async () => {
    const ctx = await freeSessionInDefaultOrg();
    const email = `guest-dropin-nowaiver-${Date.now()}@example.com`;

    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        sessionId: ctx.sessionId,
        firstName: "Guest",
        lastName: "Booker",
        email,
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paymentRequired).toBe(false);
    expect(json.bookingId).toBeTruthy();

    const db = getDb();
    const [booking] = await db
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, json.bookingId));
    expect(booking.waiverSigned).toBe(false);
    expect(booking.waiverSignedAt).toBeNull();
    expect(booking.waiverSignedBy).toBeNull();
  });

  it("400s waiverAccepted:true without a typed name (malformed signature)", async () => {
    const ctx = await freeSessionInDefaultOrg();
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        sessionId: ctx.sessionId,
        firstName: "Guest",
        lastName: "Booker",
        email: `guest-dropin-badwaiver-${Date.now()}@example.com`,
        waiverAccepted: true,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("409s when the same email already holds an active booking for the session", async () => {
    const ctx = await freeSessionInDefaultOrg();
    const email = `guest-dropin-dupe-${Date.now()}@example.com`;

    const first = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify(guestBody(ctx.sessionId, email)),
    });
    expect(first.status).toBe(200);

    const second = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify(guestBody(ctx.sessionId, email)),
    });
    expect(second.status).toBe(409);
  });

  it("attaches the booking to an existing account WITHOUT setting a session cookie", async () => {
    const ctx = await freeSessionInDefaultOrg();
    // parent@test fixture user exists; book as guest with their email.
    const email = "parent@test.aspiresports.com";
    const db = getDb();
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (!existing) return; // fixture not present — skip

    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify(guestBody(ctx.sessionId, email)),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.wasNewUser).toBe(false);
    // Account-takeover prevention: no session for pre-existing accounts.
    expect(res.headers.get("set-cookie") ?? "").not.toContain("auth_session");

    const [booking] = await db
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, json.bookingId));
    expect(booking.userId).toBe(existing.id);
  });

  it("a gmail dot-variant attaches to the SAME account — no duplicate user (#458)", async () => {
    // The drop-in path used to create users with its own bare insert that
    // never computed emailCanonical, so john.doe@gmail.com and
    // johndoe@gmail.com minted two accounts — the exact gap #449 closed for
    // the solo/team paths via the shared upsertGuestUser (which this path
    // now uses too).
    const uniq = Date.now();
    const original = `dedupe.dropin.${uniq}@gmail.com`;
    const variant = `dedupedropin${uniq}@gmail.com`; // dots removed — same canonical

    const first = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify(guestBody((await freeSessionInDefaultOrg()).sessionId, original)),
    });
    expect(first.status).toBe(200);
    expect((await first.json()).wasNewUser).toBe(true);

    // A DIFFERENT session (the duplicate-booking guard keys on session+user).
    const second = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify(guestBody((await freeSessionInDefaultOrg()).sessionId, variant)),
    });
    expect(second.status).toBe(200);
    const secondJson = await second.json();
    expect(secondJson.wasNewUser, "the dot-variant must collide, not mint a user").toBe(false);
    // Existing-account semantics apply: no session cookie for the variant.
    expect(second.headers.get("set-cookie") ?? "").not.toContain("auth_session");

    const db = getDb();
    const rows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, original));
    expect(rows, "exactly one account holds the canonical email").toHaveLength(1);
    const variantRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, variant));
    expect(variantRows, "the variant spelling must not exist as its own user").toHaveLength(0);
  });

  // F5 review FINDING 2 (controller ruling). The free path's born-covered
  // on-file stamp (task 5, spec L) is deliberately EXCLUDED from guest
  // checkout: `upsertGuestUser` above matches an EXISTING account purely by
  // typed email — unverified (`emailVerified: false`), no session, no OTP.
  // Anyone who knows (or guesses) a covered adult's email could otherwise
  // book under that identity with the liability-signature ask silently
  // suppressed on their behalf. This proves the exclusion: a genuinely
  // covered self person's own email, booked as a guest with no waiver
  // fields, must still come out UNSIGNED — same as an uncovered guest.
  it("EXCLUDES the born-covered on-file stamp — a covered self person's own email still books UNSIGNED as a guest", async () => {
    const db = getDb();
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `guest-dropin-covered-${stamp}@t.example`.toLowerCase();

    const [user] = await db
      .insert(users)
      .values({ email, firstName: "Covered", lastName: "GuestMatch" })
      .returning();
    const [fm] = await db
      .insert(familyMembers)
      .values({ selfUserId: user.id, firstName: "Covered", lastName: "GuestMatch" })
      .returning();
    const signedAt = new Date(Date.now() - 30 * DAY_MS);
    await db.insert(consents).values({
      familyMemberId: fm.id,
      organizationId: defaultOrg.organizationId,
      type: "liability",
      status: "granted",
      signedByUserId: user.id,
      signedByName: "Covered GuestMatch",
      signedAt,
      expiresAt: new Date(signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS),
    });

    const ctx = await freeSessionInDefaultOrg();
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        sessionId: ctx.sessionId,
        firstName: "Covered",
        lastName: "GuestMatch",
        // Matches the EXISTING (genuinely covered) account by email alone —
        // exactly the unverified-match path the finding is about.
        email,
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paymentRequired).toBe(false);

    const [booking] = await db
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, json.bookingId));
    expect(booking.userId).toBe(user.id);
    expect(
      booking.waiverSigned,
      "guest checkout must never inherit the born-covered stamp, even for a genuinely covered person",
    ).toBe(false);
    expect(booking.waiverSignedAt).toBeNull();
    expect(booking.waiverSignedBy).toBeNull();

    await db.delete(consents).where(eq(consents.familyMemberId, fm.id));
    await db.delete(dropInBookings).where(eq(dropInBookings.userId, user.id));
    // ON DELETE CASCADE on family_members.self_user_id sweeps `fm` for free.
    await db.delete(users).where(eq(users.id, user.id));
  });
});
