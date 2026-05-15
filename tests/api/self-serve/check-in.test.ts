import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { mintToken } from "@/lib/check-in/tokens-db";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";
import { eq } from "drizzle-orm";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// Unique slot per run to avoid collisions.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

describe("POST /api/self-serve/[token]/check-in", () => {
  let rentalId: string;
  let tokenValue: string;

  beforeAll(async () => {
    const start = new Date(RUN_BASE_UTC + 14 * 3_600_000);
    const [rental] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 88,
        startsAt: start,
        endsAt: new Date(start.getTime() + 3_600_000),
        status: "confirmed",
        source: "admin_created",
        renterName: "Check-In Test Renter",
        renterEmail: "checkin-test@example.com",
        renterPhone: null,
        paymentMethod: "cash",
        amountDueCents: 6000,
        amountPaidCents: 6000,
        paymentStatus: "paid",
        waiverSigned: true,
      })
      .returning();
    rentalId = rental.id;

    const tok = await mintToken({
      kind: "field_rental",
      targetId: rentalId,
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      sentVia: "qr",
      recipientUserId: null,
      recipientEmail: "checkin-test@example.com",
      recipientPhone: null,
      createdByUserId: null,
    });
    tokenValue = tok.token;
  });

  it("returns 200 and stamps checkedInAt on the rental row", async () => {
    const res = await fetch(`${BASE}/api/self-serve/${tokenValue}/check-in`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("ok", true);
    expect(typeof body.checkedInAt).toBe("string");

    // Verify DB was actually updated.
    const [row] = await getDb()
      .select({ checkedInAt: fieldRentals.checkedInAt })
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId))
      .limit(1);

    expect(row.checkedInAt).not.toBeNull();
  });

  it("is idempotent — second POST returns 200 and checkedInAt is unchanged", async () => {
    // Fetch checkedInAt after first check-in.
    const [before] = await getDb()
      .select({ checkedInAt: fieldRentals.checkedInAt })
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId))
      .limit(1);
    const firstCheckedInAt = before.checkedInAt;
    expect(firstCheckedInAt).not.toBeNull();

    const res = await fetch(`${BASE}/api/self-serve/${tokenValue}/check-in`, {
      method: "POST",
    });
    expect(res.status).toBe(200);

    const [after] = await getDb()
      .select({ checkedInAt: fieldRentals.checkedInAt })
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId))
      .limit(1);

    // checkedInAt should not have changed on second call.
    expect(after.checkedInAt?.toISOString()).toBe(firstCheckedInAt?.toISOString());
  });

  it("returns 404 for a non-existent token", async () => {
    // Correctly shaped but not in the DB.
    const fake = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    const res = await fetch(`${BASE}/api/self-serve/${fake}/check-in`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
