import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getRentalVenuesByLocation } from "@/lib/soccerone/venues";

// Uses the seeded "soccerone" fixture org (an org with rental-enabled
// venues) purely as test data — in prod the brands share the Aspire org
// and callers pass `Astro.locals.organization.id`.
// skipIf: this suite needs a live DB (unusual for tests/unit) — without
// DATABASE_URL the beforeAll would throw and fail the whole run instead
// of skipping. CI always sets DATABASE_URL, so this only affects DB-less
// local runs.
describe.skipIf(!process.env.DATABASE_URL)("getRentalVenuesByLocation()", () => {
  let fixtureOrgId: string;
  let otherOrgId: string;

  beforeAll(async () => {
    const [org] = await getDb()
      .select()
      .from(organizations)
      .where(eq(organizations.slug, "soccerone"))
      .limit(1);
    if (!org) {
      throw new Error("SoccerOne fixture org missing — run scripts/seed-soccerone-org.ts + npm run db:seed:e2e");
    }
    fixtureOrgId = org.id;

    const [other] = await getDb()
      .select()
      .from(organizations)
      .where(eq(organizations.slug, "aspire-sports"))
      .limit(1);
    otherOrgId = other?.id ?? "00000000-0000-0000-0000-000000000000";
  });

  it("returns only the org's rental-enabled venues at the given location slug", async () => {
    // Bare "downtown" (not "soccerone-downtown") — the seed renames the
    // fixture location to the bare slug to match prod (see seed-e2e-tests.ts
    // stage 12a and rent.astro's locationSlug).
    const result = await getRentalVenuesByLocation(fixtureOrgId, "downtown");
    expect(result.length).toBeGreaterThan(0);
    for (const v of result) {
      expect(v.rentalEnabled).toBe(true);
    }
  });

  it("returns an empty array for a non-existent location slug", async () => {
    const result = await getRentalVenuesByLocation(fixtureOrgId, "never-existed");
    expect(result).toEqual([]);
  });

  it("does not return venues when the location slug belongs to a different org", async () => {
    // "downtown" exists under the fixture org, not under `otherOrgId`.
    const result = await getRentalVenuesByLocation(otherOrgId, "downtown");
    expect(result).toEqual([]);
  });
});
