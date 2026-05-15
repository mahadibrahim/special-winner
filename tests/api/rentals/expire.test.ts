import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

// A distinct calendar DAY per test run, far in the future. A random component
// is added so parallel CI jobs starting at the same millisecond still get
// distinct days and avoid slot collisions.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

function slot(hourOfDay: number, durationHours: number) {
  const startsAt = new Date(RUN_BASE_UTC + hourOfDay * 3_600_000);
  const endsAt = new Date(startsAt.getTime() + durationHours * 3_600_000);
  return { startsAt, endsAt };
}

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

describe("POST /api/cron/expire-pending-rentals", () => {
  it("happy path: expires a pending_payment rental whose paymentExpiresAt is in the past", async () => {
    // Insert a pending_payment row with paymentExpiresAt 1 minute ago
    const [inserted] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 30,
        ...slot(8, 1),
        status: "pending_payment",
        source: "online_booking",
        renterName: "Expire Test",
        paymentMethod: "card_online",
        amountDueCents: 8000,
        paymentExpiresAt: new Date(Date.now() - 60_000),
      })
      .returning();

    expect(inserted).toBeDefined();
    const rentalId = inserted!.id;

    // POST the cron route with the correct secret
    const res = await fetch(`${BASE_URL}/api/cron/expire-pending-rentals`, {
      method: "POST",
      headers: {
        "x-cron-secret": CRON_SECRET,
        Origin: BASE_URL,
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.expired).toBeGreaterThanOrEqual(1);

    // Re-fetch the row and assert it was cancelled
    const [row] = await getDb()
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId));

    expect(row).toBeDefined();
    expect(row!.status).toBe("cancelled");
    expect(row!.cancelledAt).not.toBeNull();
    expect(row!.cancellationReason).toBe("user_request");
  });

  it("returns 401 when x-cron-secret header is missing", async () => {
    const res = await fetch(`${BASE_URL}/api/cron/expire-pending-rentals`, {
      method: "POST",
      headers: {
        Origin: BASE_URL,
      },
    });

    expect(res.status).toBe(401);
  });

  it("returns 401 when x-cron-secret header is wrong", async () => {
    const res = await fetch(`${BASE_URL}/api/cron/expire-pending-rentals`, {
      method: "POST",
      headers: {
        "x-cron-secret": "nope",
        Origin: BASE_URL,
      },
    });

    expect(res.status).toBe(401);
  });
});
