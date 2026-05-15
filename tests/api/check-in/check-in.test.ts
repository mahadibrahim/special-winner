import { describe, it, expect, beforeAll } from "vitest";
import { getAdminCookie, apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { eq } from "drizzle-orm";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

describe("POST /api/admin/check-in/check-in (field_rental)", () => {
  let cookie: string;
  let rentalId: string;

  beforeAll(async () => {
    cookie = await getAdminCookie();
    const start = new Date(RUN_BASE_UTC + 10 * 3_600_000);
    const [r] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 40,
        startsAt: start,
        endsAt: new Date(start.getTime() + 3_600_000),
        status: "confirmed",
        source: "admin_created",
        renterName: "Check-in Tester",
        paymentMethod: "cash",
        amountDueCents: 8000,
        amountPaidCents: 8000,
        paymentStatus: "paid",
      })
      .returning();
    rentalId = r.id;
  });

  it("stamps checkedInAt and checkedInByUserId, returns the row", async () => {
    const res = await apiFetch("/api/admin/check-in/check-in", {
      method: "POST",
      cookie,
      body: JSON.stringify({ kind: "field_rental", targetId: rentalId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rental.checkedInAt).not.toBeNull();
    expect(body.rental.checkedInByUserId).not.toBeNull();
    const [row] = await getDb().select().from(fieldRentals).where(eq(fieldRentals.id, rentalId));
    expect(row.checkedInAt).not.toBeNull();
  });

  it("is idempotent — re-firing keeps the original timestamp", async () => {
    const [before] = await getDb().select().from(fieldRentals).where(eq(fieldRentals.id, rentalId));
    const ts0 = before.checkedInAt;
    const res = await apiFetch("/api/admin/check-in/check-in", {
      method: "POST",
      cookie,
      body: JSON.stringify({ kind: "field_rental", targetId: rentalId }),
    });
    expect(res.status).toBe(200);
    const [after] = await getDb().select().from(fieldRentals).where(eq(fieldRentals.id, rentalId));
    expect(after.checkedInAt?.getTime()).toBe(ts0?.getTime());
  });

  it("returns 404 for a missing rental id", async () => {
    const res = await apiFetch("/api/admin/check-in/check-in", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        kind: "field_rental",
        targetId: "00000000-0000-0000-0000-000000000000",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 401/403 without admin cookie", async () => {
    const res = await apiFetch("/api/admin/check-in/check-in", {
      method: "POST",
      body: JSON.stringify({ kind: "field_rental", targetId: rentalId }),
    });
    expect([401, 403]).toContain(res.status);
  });
});
