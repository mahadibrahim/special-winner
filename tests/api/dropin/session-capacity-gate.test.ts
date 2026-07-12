/**
 * GET /api/dropin/sessions/:id — public capacity gate.
 *
 * `confirmedCount` backs both the capacity meter (SessionDetail) and the
 * "is this session full" check BookButton uses to switch its CTA to
 * "Join waitlist". It must count every status that actually occupies a
 * seat — a `pending_payment` kiosk walk-in hold or a `pending_claim`
 * promoted waitlister both hold a real slot until the expiry sweep
 * releases it (see src/lib/dropin/promotion.ts) — not just `confirmed`.
 * Undercounting here would show a guest an open spot that's really held,
 * inviting them into a session that's already physically full.
 *
 * Fixture: a real kiosk pay-link hold created via
 * POST /api/kiosk/{locationId}/walkin/start (mirrors
 * tests/api/kiosk/walkin.test.ts) against a session in the DEFAULT org —
 * the public detail endpoint is multi-tenant-guarded against
 * `locals.organization`, and HTTP requests to localhost resolve that
 * default org (see resolveDefaultOrgForHttpTests's doc comment).
 */
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { venues } from "@/lib/db/schema/teams";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { apiFetch } from "../setup/test-helpers";
import { createConfirmedBookingFreePath } from "@/lib/dropin/booking";
import { processCancelRefund } from "@/lib/dropin/refund";
import {
  createTestDropInSession,
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";

describe("GET /api/dropin/sessions/:id — public capacity gate", () => {
  it("counts a pending_payment walk-in hold as occupying a spot", async () => {
    const defaultOrg = await resolveDefaultOrgForHttpTests();
    const ctx = await createTestDropInSession({
      organizationId: defaultOrg.organizationId,
      venueId: defaultOrg.venueId,
      capacity: 5,
      sportOrClassLabel: `capacity-gate-${Date.now()}`,
    });

    const [venueRow] = await getDb()
      .select({ locationId: venues.locationId })
      .from(venues)
      .where(eq(venues.id, ctx.venueId))
      .limit(1);
    expect(venueRow).toBeDefined();

    // Baseline: no bookings yet.
    const before = await apiFetch(`/api/dropin/sessions/${ctx.sessionId}`);
    expect(before.status).toBe(200);
    const beforeBody = await before.json();
    expect(beforeBody.confirmedCount).toBe(0);

    // Create a pay-link walk-in hold via the real kiosk flow — the same
    // way a front-desk walk-in hold is created in production.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const walkinRes = await apiFetch(
      `/api/kiosk/${venueRow!.locationId}/walkin/start`,
      {
        method: "POST",
        body: JSON.stringify({
          sessionId: ctx.sessionId,
          contact: {
            firstName: "Cap",
            lastName: `Gate${suffix.slice(-4)}`,
            email: `capacity-gate-${suffix}@walkin-test.invalid`,
            phone: "6145550188",
            dob: "1990-01-01",
          },
        }),
      },
    );
    expect(walkinRes.status, await walkinRes.text()).toBe(200);

    // The hold occupies a slot — the public session must show exactly one
    // less open spot than before.
    const after = await apiFetch(`/api/dropin/sessions/${ctx.sessionId}`);
    expect(after.status).toBe(200);
    const afterBody = await after.json();
    expect(afterBody.confirmedCount).toBe(beforeBody.confirmedCount + 1);
    expect(afterBody.session.capacity - afterBody.confirmedCount).toBe(
      afterBody.session.capacity - beforeBody.confirmedCount - 1,
    );
  });

  it("does not double-count a pending_claim row in both confirmedCount and waitlistCount", async () => {
    // A promoted waitlister (pending_claim) occupies a seat — it belongs in
    // confirmedCount (taken) — but it is no longer "waiting", so it must
    // NOT also appear in waitlistCount. Before the fix, waitlistCount
    // counted `status IN ('waitlisted', 'pending_claim')`, double-reporting
    // the same row as both taken and still-waiting.
    const defaultOrg = await resolveDefaultOrgForHttpTests();
    const ctx = await createTestDropInSession({
      organizationId: defaultOrg.organizationId,
      venueId: defaultOrg.venueId,
      capacity: 1,
      sessionRateCents: 0,
      memberRateCents: 0,
      sportOrClassLabel: `waitlist-dbl-count-${Date.now()}`,
    });

    const db = getDb();
    const [seatUser] = await db
      .insert(users)
      .values({
        email: `wl-dbl-seat-${Date.now()}-${Math.random()}@t.example`,
        firstName: "Seat",
        lastName: "User",
      })
      .returning();
    const seatBooking = await createConfirmedBookingFreePath({
      sessionId: ctx.sessionId,
      userId: seatUser.id,
      source: "online_booking",
    });
    expect(seatBooking.ok).toBe(true);

    const [waiter] = await db
      .insert(users)
      .values({
        email: `wl-dbl-waiter-${Date.now()}-${Math.random()}@t.example`,
        firstName: "Wait",
        lastName: "User",
      })
      .returning();
    await db.insert(dropInBookings).values({
      sessionId: ctx.sessionId,
      userId: waiter.id,
      status: "waitlisted",
      source: "online_booking",
      paymentMethod: "card_online",
      amountPaidCents: 0,
    });

    // Cancel the confirmed seat — promotes the waitlister to pending_claim.
    if (!seatBooking.ok) throw new Error("seat booking should be ok");
    const cancel = await processCancelRefund(seatBooking.bookingId, {});
    expect(cancel.ok).toBe(true);
    expect(cancel.promotedNextBookingId).toBeTruthy();

    const res = await apiFetch(`/api/dropin/sessions/${ctx.sessionId}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    // The promoted row is taken (counted in confirmedCount)...
    expect(body.confirmedCount).toBe(1);
    // ...and must NOT also show up as still-waiting.
    expect(body.waitlistCount).toBe(0);
  });
});
