/**
 * Integration: PATCH /api/admin/rentals/:id approve/decline actions.
 * Seeds `requested` rows directly via getDb() and hits the endpoint over
 * HTTP with the admin cookie, mirroring request.test.ts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { getAdminCookie, apiFetch } from "../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

let cookie: string;

beforeAll(async () => {
  cookie = await getAdminCookie();
});

async function makeRequest(amountDueCents: number, field: number) {
  const [r] = await getDb()
    .insert(fieldRentals)
    .values({
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: field,
      startsAt: new Date(Date.UTC(2039, 0, 1, 12)),
      endsAt: new Date(Date.UTC(2039, 0, 1, 13)),
      status: "requested",
      source: "online_booking",
      paymentMethod: amountDueCents === 0 ? "comp" : "card_online",
      amountDueCents,
      renterName: "Approve Tester",
      requestExpiresAt: new Date(Date.now() + 24 * 3_600_000),
    })
    .returning();
  return r.id;
}

async function statusOf(id: string) {
  const [r] = await getDb()
    .select({ status: fieldRentals.status, paymentExpiresAt: fieldRentals.paymentExpiresAt })
    .from(fieldRentals)
    .where(eq(fieldRentals.id, id))
    .limit(1);
  return r;
}

describe("PATCH /api/admin/rentals/:id approve/decline", () => {
  it("approve (paid) → pending_payment with a pay window", async () => {
    const id = await makeRequest(5000, 21);
    const res = await apiFetch(`/api/admin/rentals/${id}`, {
      method: "PATCH",
      cookie,
      body: JSON.stringify({ approve: true }),
    });
    expect(res.status).toBe(200);
    const after = await statusOf(id);
    expect(after.status).toBe("pending_payment");
    expect(after.paymentExpiresAt).not.toBeNull();
  });

  it("approve ($0) → confirmed", async () => {
    const id = await makeRequest(0, 22);
    const res = await apiFetch(`/api/admin/rentals/${id}`, {
      method: "PATCH",
      cookie,
      body: JSON.stringify({ approve: true }),
    });
    expect(res.status).toBe(200);
    expect((await statusOf(id)).status).toBe("confirmed");
  });

  it("decline → cancelled", async () => {
    const id = await makeRequest(5000, 23);
    const res = await apiFetch(`/api/admin/rentals/${id}`, {
      method: "PATCH",
      cookie,
      body: JSON.stringify({ decline: true }),
    });
    expect(res.status).toBe(200);
    expect((await statusOf(id)).status).toBe("cancelled");
  });

  it("approve on a non-requested row → 422", async () => {
    const id = await makeRequest(5000, 24);
    await getDb().update(fieldRentals).set({ status: "confirmed" }).where(eq(fieldRentals.id, id));
    const res = await apiFetch(`/api/admin/rentals/${id}`, {
      method: "PATCH",
      cookie,
      body: JSON.stringify({ approve: true }),
    });
    expect(res.status).toBe(422);
  });
});
