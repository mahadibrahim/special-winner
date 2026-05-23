import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { organizations, locations, venues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSoccerOneVenuesByLocation } from "@/lib/soccerone/venues";

describe("getSoccerOneVenuesByLocation()", () => {
  let soccerOneOrgId: string;

  beforeAll(async () => {
    const [org] = await getDb()
      .select()
      .from(organizations)
      .where(eq(organizations.slug, "soccerone"))
      .limit(1);
    if (!org) {
      throw new Error("SoccerOne org missing — run scripts/seed-soccerone-org.ts + npm run db:seed:e2e");
    }
    soccerOneOrgId = org.id;
  });

  it("returns only SoccerOne Downtown's rental-enabled venues when called with 'soccerone-downtown'", async () => {
    const result = await getSoccerOneVenuesByLocation("soccerone-downtown");
    expect(result.length).toBeGreaterThan(0);
    for (const v of result) {
      expect(v.rentalEnabled).toBe(true);
    }
  });

  it("returns an empty array for a non-existent location slug", async () => {
    const result = await getSoccerOneVenuesByLocation("never-existed");
    expect(result).toEqual([]);
  });

  it("does not return non-SoccerOne venues even if the location slug exists for another org", async () => {
    // Aspire's existing "powell" location is a non-SoccerOne location.
    const result = await getSoccerOneVenuesByLocation("powell");
    expect(result).toEqual([]);
  });
});
