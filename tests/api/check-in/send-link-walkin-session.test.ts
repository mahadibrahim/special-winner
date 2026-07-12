/**
 * POST /api/admin/check-in/send-link — kind "walkin_session" (Task 7).
 *
 * Regression guard for the bug the walk-in remote payment plan's Task 7
 * found: WalkInFlow's post-create send and ActivityDetailPanel's "Resend
 * pay link" both used to POST kind "drop_in_booking" for a pending_payment
 * walk-in hold. That mints a DIFFERENT token kind than the one
 * walkin/start.ts already minted and the one /walkin/payment.ts requires
 * (it hard-rejects any token whose kind isn't "walkin_session") — so the
 * "resend" would deliver a link that shows the pay card but can never
 * actually complete a payment.
 *
 * send-link now accepts kind "walkin_session" and reuses mintToken's
 * live-token-reuse behavior (same (kind, targetId) → same live token), so
 * a resend for a still-pending hold returns the EXACT SAME URL
 * walkin/start.ts already returned — proving the fix and guarding against
 * a future regression back to the wrong kind.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const UNIQUE_SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

describe("POST /api/admin/check-in/send-link — walkin_session (pay link)", () => {
  let adminCookie: string;
  let locationId: string;
  let sessionId: string;
  let bookingId: string;
  let walkinStartUrl: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    const db = getDb();

    await db
      .insert(dropInRateCard)
      .values({ organizationId: E2E_ORG_ID })
      .onConflictDoNothing();

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

    const [session] = await db
      .insert(dropInSessions)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        kind: "pickup",
        sportOrClassLabel: `send-link-walkin-${UNIQUE_SUFFIX}`,
        startsAt: new Date(Date.now() + 7 * 86_400_000),
        endsAt: new Date(Date.now() + 7 * 86_400_000 + 90 * 60_000),
        capacity: 10,
        teamCount: 2,
        teamColors: ["red", "blue"],
        sessionRateCents: 1200,
        walkUpRateCents: 1900,
      })
      .returning();
    sessionId = session.id;

    const walkinRes = await apiFetch(`/api/kiosk/${locationId}/walkin/start`, {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        contact: {
          firstName: "SendLink",
          lastName: `Walkin${UNIQUE_SUFFIX.slice(-4)}`,
          email: `send-link-walkin-${UNIQUE_SUFFIX}@walkin-test.invalid`,
          phone: "6145550177",
          dob: "1990-01-01",
        },
      }),
    });
    const walkinBody = await walkinRes.json();
    expect(walkinRes.status, JSON.stringify(walkinBody)).toBe(200);
    bookingId = walkinBody.bookingId;
    walkinStartUrl = walkinBody.url;
    expect(bookingId).toBeTruthy();
    expect(walkinStartUrl).toMatch(/\/self-serve\//);
  });

  afterAll(async () => {
    // Best-effort fixture cleanup — cancel releases the hold, then hard
    // delete the session, mirroring venue-hold-visibility.test.ts.
    await apiFetch(`/api/admin/dropin/sessions/${sessionId}/cancel`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({}),
    }).catch(() => null);
    await apiFetch(`/api/admin/dropin/sessions/${sessionId}`, {
      method: "DELETE",
      cookie: adminCookie,
    }).catch(() => null);
  });

  it("reuses the SAME token walkin/start minted (live-token reuse) — proves the resend is a real pay link", async () => {
    const res = await apiFetch("/api/admin/check-in/send-link", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        kind: "walkin_session",
        targetId: bookingId,
        channel: "qr",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Same booking, same live (unconsumed, unexpired) token → mintToken's
    // reuse branch returns the identical URL, not a fresh drop_in_booking
    // token pointing at a waiver/photo-only flow.
    expect(body.url).toBe(walkinStartUrl);
  });

  // Same shape as venue-hold-visibility.test.ts's tenant-scoping test: the
  // ADMIN cookie stays Org A's (matching what localhost resolves to via the
  // domain resolver) and the ATTACK is targeting an id that belongs to Org
  // B — existence of the cross-tenant row must be hidden (404, not 403).
  // (Signing in as Org B's own admin against this localhost base URL would
  // instead 403 at the coarser "are you an admin of the resolved org"
  // check, before ever reaching resolveSigner's targetId scoping — that's
  // a different, already-covered code path, not this one.)
  it("Org A admin gets 404 for an Org B walk-in booking id (tenant scoping)", async () => {
    const orgBFixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb", {
      method: "GET",
    });
    if (orgBFixtureRes.status !== 200) {
      return; // fixture not present in this environment — skip
    }
    const orgBFixtures = await orgBFixtureRes.json();
    const orgBLocationId: string | null = orgBFixtures.locationId;
    if (!orgBLocationId) return; // fixture incomplete — skip

    const db = getDb();
    await db
      .insert(dropInRateCard)
      .values({ organizationId: orgBFixtures.org.id })
      .onConflictDoNothing();

    const orgBVenueId: string = orgBFixtures.venueId;
    const [orgBSession] = await db
      .insert(dropInSessions)
      .values({
        organizationId: orgBFixtures.org.id,
        venueId: orgBVenueId,
        kind: "pickup",
        sportOrClassLabel: `send-link-walkin-orgb-${UNIQUE_SUFFIX}`,
        startsAt: new Date(Date.now() + 7 * 86_400_000),
        endsAt: new Date(Date.now() + 7 * 86_400_000 + 90 * 60_000),
        capacity: 10,
        teamCount: 2,
        teamColors: ["red", "blue"],
        sessionRateCents: 1200,
      })
      .returning();

    const orgBWalkinRes = await apiFetch(
      `/api/kiosk/${orgBLocationId}/walkin/start`,
      {
        method: "POST",
        body: JSON.stringify({
          sessionId: orgBSession.id,
          contact: {
            firstName: "OrgB",
            lastName: `Walkin${UNIQUE_SUFFIX.slice(-4)}`,
            email: `send-link-walkin-orgb-${UNIQUE_SUFFIX}@walkin-test.invalid`,
            phone: "6145550166",
            dob: "1990-01-01",
          },
        }),
      },
    );
    const orgBWalkinBody = await orgBWalkinRes.json();
    try {
      if (orgBWalkinRes.status !== 200) {
        // Org B facility isn't kiosk-ready in this environment — skip
        // rather than fail on an unrelated fixture gap.
        return;
      }
      const orgBBookingId: string = orgBWalkinBody.bookingId;

      const res = await apiFetch("/api/admin/check-in/send-link", {
        method: "POST",
        cookie: adminCookie, // Org A's admin — resolved org context is Org A
        body: JSON.stringify({
          kind: "walkin_session",
          targetId: orgBBookingId,
          channel: "qr",
        }),
      });
      expect(res.status).toBe(404);
    } finally {
      // Direct DB cleanup — Org A's admin cookie can't reach Org B's
      // session/booking through the admin API (that's the whole point of
      // the assertion above), so clean up at the DB layer instead of via
      // an org-scoped endpoint.
      await db
        .delete(dropInBookings)
        .where(eq(dropInBookings.sessionId, orgBSession.id))
        .catch(() => null);
      await db
        .delete(dropInSessions)
        .where(eq(dropInSessions.id, orgBSession.id))
        .catch(() => null);
    }
  });
});
