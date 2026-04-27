import { describe, it, expect, beforeAll } from "vitest";
import { getAuthCookie, apiFetch } from "./setup/test-helpers";
import { getDb } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ADULT_OPEN_SEASON_SLUG } from "@/lib/db/seeds/seed-e2e-tests";

let adultSeasonId: string;
let adultCookie: string;

beforeAll(async () => {
  const db = getDb();
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.slug, ADULT_OPEN_SEASON_SLUG))
    .limit(1);

  if (!season) {
    throw new Error(
      `Adult open soccer season not found (slug: ${ADULT_OPEN_SEASON_SLUG}) — re-run npm run db:seed:e2e`,
    );
  }
  adultSeasonId = season.id;

  // Cache the cookie once to avoid rate-limiting (each getAuthCookie call
  // counts as a sign-in attempt against the in-memory rate limiter).
  adultCookie = await getAuthCookie(
    "adult-self@test.aspiresports.com",
    "TestParent123!",
  );
});

describe("POST /api/registrations — self registration", () => {
  it("registers an adult user for an adult-eligible season without a family member id", async () => {
    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: adultCookie,
      body: JSON.stringify({
        seasonId: adultSeasonId,
        registerSelf: true,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Adult Self",
      }),
    });

    // 201 on first registration, 200 on resume — both are success
    expect([200, 201]).toContain(res.status);
    const body = await res.json();
    expect(body.registration).toBeTruthy();
    expect(body.registration.familyMemberId).toBeTruthy();
  });

  it("rejects body that supplies both familyMemberId and registerSelf", async () => {
    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: adultCookie,
      body: JSON.stringify({
        seasonId: "00000000-0000-0000-0000-000000000000",
        familyMemberId: "00000000-0000-0000-0000-000000000000",
        registerSelf: true,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "X",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects body that supplies neither familyMemberId nor registerSelf", async () => {
    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: adultCookie,
      body: JSON.stringify({
        seasonId: "00000000-0000-0000-0000-000000000000",
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "X",
      }),
    });

    expect(res.status).toBe(400);
  });
});
