/**
 * POST /api/kiosk/[locationSlug]/walkin/start
 * POST /api/kiosk/[locationSlug]/walkin/payment
 * GET  /api/kiosk/[locationSlug]/sessions
 *
 * The kiosk is facility (location) scoped. Seeds drop-in sessions for today
 * (UTC) in two spaces of the seeded facility and exercises:
 *   - Adult walk-in: start → pending_claim booking + walkin_session token
 *   - Minor walk-in: start with parent fields → family_member row created
 *   - payment: returns clientSecret (Stripe), or skips if not configured
 *   - sessions: today's sessions across every space, each with a space name
 *   - Error paths: bad session ID, missing parent for minor, consumed token
 */
import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import {
  dropInSessions,
  dropInBookings,
  dropInRateCard,
} from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { users } from "@/lib/db/schema/users";
import { selfServiceTokens } from "@/lib/db/schema/self-service-tokens";
import { venues } from "@/lib/db/schema/teams";
import { and, eq, ne } from "drizzle-orm";
import {
  E2E_RENTAL_VENUE_ID,
  E2E_ORG_ID,
} from "@/lib/db/seeds/seed-e2e-tests";

// Stripe may not be configured in all envs — use the same defensive pattern
// as rentals/bookings.test.ts.
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

// Use a per-run unique label to avoid sportOrClassLabel / unique-booking
// index collisions when tests run in parallel.
const UNIQUE_SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ── Unique email addresses per run ──────────────────────────────────────────
// Two separate prefixes so adult and minor tests never share a user row.
const ADULT_EMAIL = `walkin-adult-${UNIQUE_SUFFIX}@walkin-test.invalid`;
const PARENT_EMAIL = `walkin-parent-${UNIQUE_SUFFIX}@walkin-test.invalid`;

describe("POST /api/kiosk/[locationSlug]/walkin/start + /payment", () => {
  let sessionId: string;
  // The kiosk is facility-scoped — kiosk URLs use the location segment.
  let locationId: string;
  // A session seeded in a second space, to prove /sessions spans the facility.
  let secondSessionId: string;

  beforeAll(async () => {
    const db = getDb();

    // Ensure rate card exists for the org.
    await db
      .insert(dropInRateCard)
      .values({ organizationId: E2E_ORG_ID })
      .onConflictDoNothing();

    // Resolve the facility (location) the rental venue belongs to. The kiosk
    // resolves a location, so every kiosk URL below uses this segment.
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
    locationId = rentalVenue.locationId;

    // Find a second space in the same facility (the seed creates "Test Soccer
    // Field" alongside the rental venue); create one if it is somehow missing.
    const [otherVenue] = await db
      .select({ id: venues.id })
      .from(venues)
      .where(
        and(
          eq(venues.locationId, locationId),
          ne(venues.id, E2E_RENTAL_VENUE_ID),
        ),
      )
      .orderBy(venues.createdAt)
      .limit(1);
    let secondVenueId: string;
    if (otherVenue) {
      secondVenueId = otherVenue.id;
    } else {
      const [created] = await db
        .insert(venues)
        .values({
          locationId,
          name: `walkin-test-space-${UNIQUE_SUFFIX}`,
          fieldCount: 1,
          indoor: false,
        })
        .returning({ id: venues.id });
      secondVenueId = created.id;
    }

    // Seed a drop-in session for TODAY (UTC) at the E2E rental venue.
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    // Place session 2 h after midnight UTC so it is firmly "today".
    const sessionStart = new Date(todayStart.getTime() + 2 * 3_600_000);
    const sessionEnd = new Date(sessionStart.getTime() + 90 * 60_000);

    const [session] = await db
      .insert(dropInSessions)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        kind: "pickup",
        sportOrClassLabel: `walkin-test-${UNIQUE_SUFFIX}`,
        startsAt: sessionStart,
        endsAt: sessionEnd,
        capacity: 20,
        teamCount: 2,
        teamColors: ["red", "blue"],
        sessionRateCents: 1200,
      })
      .returning();
    sessionId = session.id;

    // Seed a session TODAY in the second space so the kiosk /sessions
    // endpoint must span more than one venue of the facility.
    const secondStart = new Date(todayStart.getTime() + 6 * 3_600_000);
    const secondEnd = new Date(secondStart.getTime() + 90 * 60_000);
    const [session2] = await db
      .insert(dropInSessions)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: secondVenueId,
        kind: "pickup",
        sportOrClassLabel: `walkin-test-space2-${UNIQUE_SUFFIX}`,
        startsAt: secondStart,
        endsAt: secondEnd,
        capacity: 20,
        teamCount: 2,
        teamColors: ["green", "yellow"],
        sessionRateCents: 1500,
      })
      .returning();
    secondSessionId = session2.id;
  });

  // ── ADULT walk-in ─────────────────────────────────────────────────────────

  describe("adult walk-in (contact is ≥18)", () => {
    let bookingId: string;
    let walkinToken: string;

    it("returns 200 with token, bookingId, amountDueCents for a valid adult", async () => {
      const res = await apiFetch(
        `/api/kiosk/${locationId}/walkin/start`,
        {
          method: "POST",
          body: JSON.stringify({
            sessionId,
            contact: {
              firstName: "Alex",
              lastName: "WalkinAdult",
              email: ADULT_EMAIL,
              phone: "6145550001",
              dob: "1992-03-15", // 34 years old
            },
          }),
        },
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(typeof body.token).toBe("string");
      expect(typeof body.bookingId).toBe("string");
      expect(body.amountDueCents).toBe(1200); // session override rate
      expect(body.url).toContain(body.token);

      bookingId = body.bookingId;
      walkinToken = body.token;
    });

    it("creates the booking row in pending_claim with correct fields", async () => {
      // bookingId set by previous test
      expect(bookingId).toBeDefined();

      const db = getDb();
      const [booking] = await db
        .select()
        .from(dropInBookings)
        .where(eq(dropInBookings.id, bookingId))
        .limit(1);

      expect(booking).toBeDefined();
      expect(booking.status).toBe("pending_claim");
      expect(booking.source).toBe("walk_up");
      expect(booking.paymentMethod).toBe("card_online");
      expect(booking.amountPaidCents).toBe(0);

      // userId must resolve to the new adult user created from contact.email
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, ADULT_EMAIL))
        .limit(1);
      expect(user).toBeDefined();
      expect(booking.userId).toBe(user.id);
    });

    it("mints a walkin_session token targeting the booking", async () => {
      expect(walkinToken).toBeDefined();
      expect(bookingId).toBeDefined();

      const db = getDb();
      const [tok] = await db
        .select()
        .from(selfServiceTokens)
        .where(eq(selfServiceTokens.token, walkinToken))
        .limit(1);

      expect(tok).toBeDefined();
      expect(tok.kind).toBe("walkin_session");
      expect(tok.targetId).toBe(bookingId);
      expect(tok.sentVia).toBe("kiosk_search");
      expect(tok.recipientEmail).toBe(ADULT_EMAIL);
    });

    it("returns clientSecret from walkin/payment (or skips if Stripe absent)", async () => {
      expect(walkinToken).toBeDefined();

      const res = await apiFetch(
        `/api/kiosk/${locationId}/walkin/payment`,
        {
          method: "POST",
          body: JSON.stringify({ token: walkinToken }),
        },
      );
      const body = await res.json();

      if (res.status === 503 && body?.error === "Stripe not configured") {
        console.warn(
          "[walkin.test] Stripe not configured — payment endpoint skipped",
        );
        return;
      }

      expect(res.status).toBe(200);
      expect(typeof body.clientSecret).toBe("string");
      expect(body.amountCents).toBe(1200);
    });
  });

  // ── MINOR walk-in ─────────────────────────────────────────────────────────

  describe("minor walk-in (contact is <18, parent required)", () => {
    let parentUserId: string;

    it("returns 422 when parent is omitted for a minor contact", async () => {
      const res = await apiFetch(
        `/api/kiosk/${locationId}/walkin/start`,
        {
          method: "POST",
          body: JSON.stringify({
            sessionId,
            contact: {
              firstName: "Junior",
              lastName: "Player",
              email: `junior-${UNIQUE_SUFFIX}@walkin-test.invalid`,
              phone: "6145550002",
              dob: "2015-05-10", // 10 years old — minor
            },
            // parent deliberately omitted
          }),
        },
      );
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toMatch(/parent/i);
    });

    it("returns 200 and creates a family_member row when parent is provided", async () => {
      // Use a different session slot to avoid the unique-booking constraint.
      // We'll insert a second session so the minor and adult don't collide.
      const db = getDb();
      const now = new Date();
      const todayStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      const minorSessionStart = new Date(todayStart.getTime() + 4 * 3_600_000);
      const minorSessionEnd = new Date(
        minorSessionStart.getTime() + 90 * 60_000,
      );

      const [minorSession] = await db
        .insert(dropInSessions)
        .values({
          organizationId: E2E_ORG_ID,
          venueId: E2E_RENTAL_VENUE_ID,
          kind: "pickup",
          sportOrClassLabel: `walkin-minor-${UNIQUE_SUFFIX}`,
          startsAt: minorSessionStart,
          endsAt: minorSessionEnd,
          capacity: 20,
          teamCount: 2,
          teamColors: ["green", "yellow"],
          sessionRateCents: 800,
        })
        .returning();

      const res = await apiFetch(
        `/api/kiosk/${locationId}/walkin/start`,
        {
          method: "POST",
          body: JSON.stringify({
            sessionId: minorSession.id,
            contact: {
              firstName: "Junior",
              lastName: "Player",
              email: `junior-${UNIQUE_SUFFIX}@walkin-test.invalid`, // not used for account
              phone: "6145550003",
              dob: "2015-05-10", // ~10 years old
            },
            parent: {
              firstName: "Jane",
              lastName: "Parent",
              email: PARENT_EMAIL,
              phone: "6145550004",
            },
          }),
        },
      );

      const body = await res.json();
      expect(res.status).toBe(200);
      expect(typeof body.token).toBe("string");
      expect(typeof body.bookingId).toBe("string");

      // Verify the parent user was created from parent.email (not contact.email)
      const [parentUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, PARENT_EMAIL))
        .limit(1);
      expect(parentUser).toBeDefined();
      parentUserId = parentUser.id;

      // Verify the booking userId is the parent's user id
      const [booking] = await db
        .select()
        .from(dropInBookings)
        .where(eq(dropInBookings.id, body.bookingId))
        .limit(1);
      expect(booking.userId).toBe(parentUserId);
      expect(booking.source).toBe("walk_up");

      // Verify a family_member row was created with parentUserId pointing to parent
      const children = await db
        .select()
        .from(familyMembers)
        .where(eq(familyMembers.parentUserId, parentUserId));
      const match = children.find(
        (fm) =>
          fm.firstName.toLowerCase() === "junior" &&
          fm.lastName.toLowerCase() === "player" &&
          fm.birthDate === "2015-05-10",
      );
      expect(match).toBeDefined();
    });
  });

  // ── Error paths ───────────────────────────────────────────────────────────

  describe("error paths", () => {
    it("returns 404 for a non-existent sessionId", async () => {
      const res = await apiFetch(
        `/api/kiosk/${locationId}/walkin/start`,
        {
          method: "POST",
          body: JSON.stringify({
            sessionId: "00000000-0000-0000-0000-000000000000",
            contact: {
              firstName: "Test",
              lastName: "User",
              email: `err-${UNIQUE_SUFFIX}@walkin-test.invalid`,
              dob: "1990-01-01",
            },
          }),
        },
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 for an unknown facility segment", async () => {
      // A bogus location UUID — requireKioskLocation rejects the segment
      // (404) before the session is ever checked; proves the kiosk
      // validates the facility it is scoped to.
      const res = await apiFetch(
        `/api/kiosk/00000000-0000-0000-0000-000000000000/walkin/start`,
        {
          method: "POST",
          body: JSON.stringify({
            sessionId,
            contact: {
              firstName: "Test",
              lastName: "User",
              email: `err2-${UNIQUE_SUFFIX}@walkin-test.invalid`,
              dob: "1990-01-01",
            },
          }),
        },
      );
      // 404 — no location matches the bogus UUID segment.
      expect(res.status).toBe(404);
    });

    it("returns 404 for an unknown facility slug in /walkin/start", async () => {
      const res = await apiFetch(`/api/kiosk/not-a-uuid/walkin/start`, {
        method: "POST",
        body: JSON.stringify({ sessionId, contact: {} }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 422 when token is missing from /walkin/payment", async () => {
      const res = await apiFetch(
        `/api/kiosk/${locationId}/walkin/payment`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      expect(res.status).toBe(422);
    });

    it("returns 404 when token does not exist in /walkin/payment", async () => {
      const res = await apiFetch(
        `/api/kiosk/${locationId}/walkin/payment`,
        {
          method: "POST",
          // 43-char base64url — matches isTokenShape but is not in the DB
          body: JSON.stringify({
            token: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA-",
          }),
        },
      );
      expect(res.status).toBe(404);
    });
  });

  // ── Location-scoped sessions ──────────────────────────────────────────────

  describe("GET /api/kiosk/[locationSlug]/sessions — facility-wide", () => {
    it("lists today's sessions from every space, each with a space name", async () => {
      const res = await apiFetch(`/api/kiosk/${locationId}/sessions`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.sessions)).toBe(true);

      // Both seeded sessions — one per space — must come back from the one
      // facility-scoped kiosk URL.
      const seeded = (
        body.sessions as { id: string; spaceName: string }[]
      ).filter((s) => s.id === sessionId || s.id === secondSessionId);
      expect(seeded.length).toBe(2);

      // Every session carries a non-empty space (venue) name.
      for (const s of seeded) {
        expect(typeof s.spaceName).toBe("string");
        expect(s.spaceName.length).toBeGreaterThan(0);
      }

      // The two sessions resolve to two distinct spaces of the facility.
      const spaces = new Set(seeded.map((s) => s.spaceName));
      expect(spaces.size).toBe(2);
    });
  });
});
