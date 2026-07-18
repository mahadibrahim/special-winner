/**
 * Integration: createRentalRequest inserts a `requested` row and holds the
 * slot — a second request for the same field/time conflicts. Runs against
 * the CI DB directly (no HTTP), like confirmation-dispatch.test.ts.
 */
import { describe, it, expect } from "vitest";
import { createRentalRequest } from "@/lib/rentals/booking";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const orgId = E2E_ORG_ID;

// Distinct far-future day per run so concurrent CI runs never collide.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2036, 0, 1) + RUN_DAY_OFFSET * 86_400_000;
const FIELD = 7;

function slot(hour: number, hours: number) {
  const startsAt = new Date(RUN_BASE_UTC + hour * 3_600_000);
  const endsAt = new Date(startsAt.getTime() + hours * 3_600_000);
  return { startsAt, endsAt };
}

function input(over: Record<string, unknown> = {}) {
  return {
    organizationId: orgId,
    venueId: E2E_RENTAL_VENUE_ID,
    fieldNumber: FIELD,
    ...slot(10, 1),
    amountDueCents: 5000,
    requestHoldHours: 24,
    renterUserId: null,
    renterName: "Request Tester",
    renterEmail: "req@test.aspiresports.com",
    renterPhone: null,
    partySize: 4,
    purpose: "practice",
    notes: null,
    createdByUserId: null,
    waiverSigned: true,
    waiverSignedBy: "Request Tester",
    ...over,
  } as Parameters<typeof createRentalRequest>[0];
}

describe("createRentalRequest", () => {
  it("creates a requested row that holds the slot", async () => {
    const first = await createRentalRequest(input());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.rental.status).toBe("requested");
    expect(first.rental.requestExpiresAt).not.toBeNull();

    // Second request, same field + overlapping time → conflict.
    const second = await createRentalRequest(input({ ...slot(10, 1) }));
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.length).toBeGreaterThan(0);
  });
});
