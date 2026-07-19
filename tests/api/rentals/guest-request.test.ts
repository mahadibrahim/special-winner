import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const RUN = Date.UTC(2045, 0, 1) + Math.floor(Math.random() * 3_650) * 86_400_000;
const slot = (h: number) => ({
  startsAt: new Date(RUN + h * 3_600_000).toISOString(),
  endsAt: new Date(RUN + (h + 1) * 3_600_000).toISOString(),
});
const body = (o = {}) => ({
  venueId: E2E_RENTAL_VENUE_ID,
  fieldNumber: 5,
  ...slot(10),
  partySize: 6,
  waiverAccepted: true,
  waiverName: "Guest Gal",
  ...o,
});
function post(b: unknown) {
  return fetch(`${BASE}/api/rentals/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });
}

describe("guest rental request", () => {
  it("422 when guest omits email", async () => {
    const res = await post(body({ renterName: "No Email" }));
    expect(res.status).toBe(422);
  });

  it("200 + renterUserId null + email stored", async () => {
    const email = `guest_${Date.now()}@test.aspiresports.com`;
    const res = await post(
      body({ fieldNumber: 6, renterName: "Guest Gal", renterEmail: email }),
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.requested).toBe(true);
    const [row] = await getDb()
      .select({
        renterUserId: fieldRentals.renterUserId,
        renterEmail: fieldRentals.renterEmail,
      })
      .from(fieldRentals)
      .where(eq(fieldRentals.id, j.rentalId))
      .limit(1);
    expect(row.renterUserId).toBeNull();
    expect(row.renterEmail).toBe(email);
  });
});
