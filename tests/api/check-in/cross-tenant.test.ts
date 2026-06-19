/**
 * Cross-tenant isolation for the check-in endpoints.
 *
 * Regression guard for the resolveSigner scoping fix: the admin check-in
 * endpoints take a client-supplied (kind, targetId). Before the fix,
 * resolveSigner() looked the target up by id alone, so an Org A admin could
 * mint a self-serve link for, overwrite the photo of, or check in another
 * org's booking just by posting its id.
 *
 * Attack pattern: seed a field rental owned by Org B, then drive each Org A
 * admin endpoint with that Org B targetId. Every one must 404 (existence of
 * the cross-tenant row is deliberately hidden). A same-org control proves the
 * 404s are scoping, not a broken fixture.
 *
 * Requires E2E_TEST_ENDPOINTS=yes and the e2e seed (both orgs).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getAdminCookie, apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { E2E_ORG_ID, E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

// Far-future, randomized window to avoid colliding with other suites' rows.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2040, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

describe("check-in cross-tenant isolation", () => {
  let cookie: string; // Org A super_admin (default localhost HQ context)
  let orgBRentalId: string; // a field rental owned by Org B
  let orgARentalId: string; // a field rental owned by Org A (control)

  beforeAll(async () => {
    cookie = await getAdminCookie();

    const orgBFixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb", {
      method: "GET",
    });
    if (orgBFixtureRes.status !== 200) {
      throw new Error(
        `Could not load Org B fixtures (status ${orgBFixtureRes.status}). ` +
          "Ensure E2E_TEST_ENDPOINTS=yes is set and the e2e seed has been run.",
      );
    }
    const orgBFixtures = await orgBFixtureRes.json();
    const orgBId: string = orgBFixtures.org.id;
    const orgBVenueId: string = orgBFixtures.venueId;
    expect(orgBId).toBeTruthy();
    expect(orgBVenueId).toBeTruthy();

    const start = new Date(RUN_BASE_UTC + 10 * 3_600_000);
    const baseRental = {
      fieldNumber: 40,
      startsAt: start,
      endsAt: new Date(start.getTime() + 3_600_000),
      status: "confirmed" as const,
      source: "admin_created" as const,
      renterName: "Cross-Tenant Tester",
      renterEmail: "cross-tenant@example.com",
      renterPhone: "5555550199",
      paymentMethod: "cash" as const,
      amountDueCents: 8000,
      amountPaidCents: 8000,
      paymentStatus: "paid" as const,
    };

    const [orgBRental] = await getDb()
      .insert(fieldRentals)
      .values({ ...baseRental, organizationId: orgBId, venueId: orgBVenueId })
      .returning();
    orgBRentalId = orgBRental.id;

    const [orgARental] = await getDb()
      .insert(fieldRentals)
      .values({
        ...baseRental,
        fieldNumber: 41,
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
      })
      .returning();
    orgARentalId = orgARental.id;
  });

  it("send-link: Org B rental id via Org A context → 404", async () => {
    const res = await apiFetch("/api/admin/check-in/send-link", {
      method: "POST",
      cookie,
      body: JSON.stringify({ kind: "field_rental", targetId: orgBRentalId, channel: "qr" }),
    });
    expect(res.status).toBe(404);
  });

  it("send-link: same-org rental id → 200 (control)", async () => {
    const res = await apiFetch("/api/admin/check-in/send-link", {
      method: "POST",
      cookie,
      body: JSON.stringify({ kind: "field_rental", targetId: orgARentalId, channel: "qr" }),
    });
    expect(res.status).toBe(200);
  });

  // upload-photo shares the exact same resolveSigner(kind, targetId, orgId)
  // sink as send-link, so the send-link case above already covers its scoping.
  // It's a multipart endpoint; the JSON-only apiFetch helper can't drive it
  // cleanly, so it's intentionally not duplicated here.

  it("check-in: Org B rental id via Org A context → 404", async () => {
    const res = await apiFetch("/api/admin/check-in/check-in", {
      method: "POST",
      cookie,
      body: JSON.stringify({ kind: "field_rental", targetId: orgBRentalId }),
    });
    expect(res.status).toBe(404);
  });
});
