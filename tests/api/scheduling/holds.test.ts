import { describe, it, expect, beforeAll } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { venueResources } from "@/lib/db/schema/scheduling";
import { createRentalHold } from "@/lib/rentals/booking";
import { fieldRentalRateCard } from "@/lib/db/schema/field-rentals";
import {
  getAdminCookie,
  getParentCookie,
  apiFetch,
  resetCookies,
} from "../setup/test-helpers";
import { resolveDefaultOrgForHttpTests } from "../../utils/dropin-helpers";

const ENDPOINT = "/api/admin/venue-day/holds";

/**
 * Field-time ledger: external/maintenance hold entry + the property the
 * whole project exists for — once a hold is in the ledger, the rental
 * path refuses the slot.
 */
describe("venue-day holds", () => {
  let adminCookie: string;
  let resourceId: string;
  let venueId: string;
  let organizationId: string;

  // Each test uses its own far-future day to avoid cross-run overlap in
  // the shared CI database (the exclusion constraint is global!).
  const day = (offset: number) => {
    const d = new Date(Date.now() + (365 + offset) * 86_400_000);
    return d.toISOString().slice(0, 10);
  };

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    const ctx = await resolveDefaultOrgForHttpTests();
    venueId = ctx.venueId;
    organizationId = ctx.organizationId;

    // The migration seeds resources for venues that existed at migrate
    // time; the HTTP-test venue may be newer. Find-or-create its Field 1.
    const db = getDb();
    const [existing] = await db
      .select({ id: venueResources.id })
      .from(venueResources)
      .where(
        and(
          eq(venueResources.venueId, venueId),
          eq(venueResources.fieldNumber, 1),
          isNull(venueResources.parentResourceId),
        ),
      )
      .limit(1);
    if (existing) {
      resourceId = existing.id;
    } else {
      const [created] = await db
        .insert(venueResources)
        .values({ venueId, name: "Field 1", fieldNumber: 1 })
        .returning({ id: venueResources.id });
      resourceId = created.id;
    }
  });

  it("401s unauthenticated, 403s non-admin", async () => {
    const unauth = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(unauth.status).toBe(401);

    const parentCookie = await getParentCookie();
    const parent = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({
        resourceId,
        startsAt: `${day(0)}T18:00:00.000Z`,
        endsAt: `${day(0)}T19:00:00.000Z`,
        sourceType: "external",
        label: "x",
      }),
    });
    expect(parent.status).toBe(403);
    resetCookies();
    adminCookie = await getAdminCookie();
  });

  it("creates a hold, rejects an overlapping one with the blocking label, deletes", async () => {
    const d = day(1);
    const create = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        resourceId,
        startsAt: `${d}T18:00:00.000Z`,
        endsAt: `${d}T20:00:00.000Z`,
        sourceType: "external",
        label: "Good Rec — Smith party",
      }),
    });
    expect(create.status).toBe(201);
    const { hold } = await create.json();
    expect(hold.sourceType).toBe("external");

    // Overlap → 409 carrying the blocking label.
    const overlap = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        resourceId,
        startsAt: `${d}T19:00:00.000Z`,
        endsAt: `${d}T21:00:00.000Z`,
        sourceType: "external",
        label: "second booking",
      }),
    });
    expect(overlap.status).toBe(409);
    const conflictBody = await overlap.json();
    expect(conflictBody.error).toContain("Good Rec — Smith party");

    // Back-to-back is fine (half-open ranges).
    const adjacent = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        resourceId,
        startsAt: `${d}T20:00:00.000Z`,
        endsAt: `${d}T21:00:00.000Z`,
        sourceType: "maintenance",
        label: "Turf brushing",
      }),
    });
    expect(adjacent.status).toBe(201);
    const adjacentHold = (await adjacent.json()).hold;

    // Delete both.
    for (const id of [hold.id, adjacentHold.id]) {
      const del = await apiFetch(`${ENDPOINT}/${id}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
      expect(del.status).toBe(200);
    }
    const delAgain = await apiFetch(`${ENDPOINT}/${hold.id}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    expect(delAgain.status).toBe(404);
  });

  it("rental hold REFUSES a slot taken by an external hold (the point of the ledger)", async () => {
    const d = day(2);
    const create = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        resourceId,
        startsAt: `${d}T18:00:00.000Z`,
        endsAt: `${d}T20:00:00.000Z`,
        sourceType: "external",
        label: "Good Rec — league night",
      }),
    });
    expect(create.status).toBe(201);

    // Rate card row required by the rental path.
    await getDb()
      .insert(fieldRentalRateCard)
      .values({ organizationId })
      .onConflictDoNothing();

    const rental = await createRentalHold({
      organizationId,
      venueId,
      fieldNumber: 1,
      startsAt: new Date(`${d}T19:00:00.000Z`),
      endsAt: new Date(`${d}T20:00:00.000Z`),
      source: "online_booking",
      paymentMethod: "card_online",
      amountDueCents: 8000,
      renterUserId: null,
      renterName: "Ledger Test",
      renterEmail: null,
      renterPhone: null,
      partySize: 8,
      purpose: null,
      notes: null,
      createdByUserId: null,
      waiverSigned: true,
      waiverSignedBy: "Ledger Test",
    });
    expect(rental.ok).toBe(false);
    if (!rental.ok) {
      expect(rental.error).toContain("Good Rec — league night");
    }

    // And the slot right AFTER the hold books fine end-to-end.
    const after = await createRentalHold({
      organizationId,
      venueId,
      fieldNumber: 1,
      startsAt: new Date(`${d}T20:00:00.000Z`),
      endsAt: new Date(`${d}T21:00:00.000Z`),
      source: "online_booking",
      paymentMethod: "card_online",
      amountDueCents: 8000,
      renterUserId: null,
      renterName: "Ledger Test",
      renterEmail: null,
      renterPhone: null,
      partySize: 8,
      purpose: null,
      notes: null,
      createdByUserId: null,
      waiverSigned: true,
      waiverSignedBy: "Ledger Test",
    });
    expect(after.ok).toBe(true);
  });
});
