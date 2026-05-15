import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getParentCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalRateCard } from "@/lib/db/schema/field-rentals";
import { eq } from "drizzle-orm";
import { E2E_ORG_ID, E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

// Per-run far-future base date — collision-free across concurrent test runs.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2037, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

describe("POST /api/dashboard/check-in", () => {
  let parentCookie: string;

  // IDs of rows we insert so we can clean up after
  const insertedRentalIds: string[] = [];

  beforeAll(async () => {
    parentCookie = await getParentCookie();

    // Ensure the org has a rate card (idempotent — seed may already have one)
    await getDb()
      .insert(fieldRentalRateCard)
      .values({ organizationId: E2E_ORG_ID })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    // Clean up inserted rows so they don't pollute other test runs
    if (insertedRentalIds.length > 0) {
      for (const id of insertedRentalIds) {
        await getDb().delete(fieldRentals).where(eq(fieldRentals.id, id));
      }
    }
    resetCookies();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await apiFetch("/api/dashboard/check-in", {
      method: "POST",
      body: JSON.stringify({ kind: "field_rental", targetId: "00000000-0000-4000-8000-000000000001" }),
    });
    expect(res.status).toBe(401);
  });

  it("stamps checkedInAt for a field_rental matched by renterEmail (200)", async () => {
    // startsAt = now → inside the default 60-minute window
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + 3_600_000);

    const [rental] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: Math.floor(Math.random() * 900) + 100, // avoid conflict
        startsAt,
        endsAt,
        status: "confirmed",
        source: "admin_created",
        renterName: "Dashboard Check-In Tester",
        renterEmail: "parent@test.aspiresports.com",
        paymentMethod: "cash",
        amountDueCents: 8000,
        amountPaidCents: 8000,
        paymentStatus: "paid",
      })
      .returning();
    insertedRentalIds.push(rental.id);

    const res = await apiFetch("/api/dashboard/check-in", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({ kind: "field_rental", targetId: rental.id }),
    });
    const body = await expectJson(res, 200);
    expect(body.ok).toBe(true);
    expect(body.checkedInAt).toBeTruthy();

    // Confirm DB was stamped
    const [row] = await getDb().select().from(fieldRentals).where(eq(fieldRentals.id, rental.id));
    expect(row.checkedInAt).not.toBeNull();
  });

  it("is idempotent — re-firing keeps the original timestamp", async () => {
    // Use one of the rows already stamped above (the first inserted one)
    const rentalId = insertedRentalIds[0];

    // Read the timestamp set by the previous test
    const [before] = await getDb().select().from(fieldRentals).where(eq(fieldRentals.id, rentalId));
    const ts0 = before.checkedInAt?.getTime();
    expect(ts0).toBeTruthy();

    const res = await apiFetch("/api/dashboard/check-in", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({ kind: "field_rental", targetId: rentalId }),
    });
    await expectJson(res, 200);

    const [after] = await getDb().select().from(fieldRentals).where(eq(fieldRentals.id, rentalId));
    expect(after.checkedInAt?.getTime()).toBe(ts0);
  });

  it("returns 404 for a rental belonging to a different renter", async () => {
    const startsAt = new Date(RUN_BASE_UTC + 10 * 3_600_000);
    const endsAt = new Date(startsAt.getTime() + 3_600_000);

    const [rental] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: Math.floor(Math.random() * 900) + 100,
        startsAt,
        endsAt,
        status: "confirmed",
        source: "admin_created",
        renterName: "Someone Else",
        renterEmail: "different@example.com",
        paymentMethod: "cash",
        amountDueCents: 8000,
        amountPaidCents: 8000,
        paymentStatus: "paid",
      })
      .returning();
    insertedRentalIds.push(rental.id);

    const res = await apiFetch("/api/dashboard/check-in", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({ kind: "field_rental", targetId: rental.id }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 422 when outside the check-in window (100 days out)", async () => {
    const startsAt = new Date(Date.now() + 100 * 86_400_000);
    const endsAt = new Date(startsAt.getTime() + 3_600_000);

    const [rental] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: Math.floor(Math.random() * 900) + 100,
        startsAt,
        endsAt,
        status: "confirmed",
        source: "admin_created",
        renterName: "Dashboard Check-In Tester",
        renterEmail: "parent@test.aspiresports.com",
        paymentMethod: "cash",
        amountDueCents: 8000,
        amountPaidCents: 8000,
        paymentStatus: "paid",
      })
      .returning();
    insertedRentalIds.push(rental.id);

    const res = await apiFetch("/api/dashboard/check-in", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({ kind: "field_rental", targetId: rental.id }),
    });
    const body = await expectJson(res, 422);
    expect(body.error).toMatch(/Check-in window/i);
  });
});
