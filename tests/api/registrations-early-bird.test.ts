import { describe, it, expect, beforeAll } from "vitest";
import { getAuthCookie, apiFetch } from "./setup/test-helpers";
import { getDb } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// Early-bird pricing enforcement (2026-07-04): the seeded spring season
// carries an always-live early-bird window (deadline now+2wk, $130 vs the
// $150 list price — see seed-e2e-tests.ts). The detail endpoint must report
// the effective price and createRegistration must charge it for the FULL
// price component. Deposits are never early-bird discounted.
const EARLY_BIRD_SEASON_SLUG = "e2e-test-spring-2026";
const ADULT_EMAIL = "adult-self@test.aspiresports.com";

let seasonId: string;
let listPriceCents: number;
let earlyBirdPriceCents: number;
let adultCookie: string;

beforeAll(async () => {
  const db = getDb();
  const [season] = await db
    .select({
      id: seasons.id,
      priceCents: seasons.priceCents,
      earlyBirdPriceCents: seasons.earlyBirdPriceCents,
      earlyBirdDeadline: seasons.earlyBirdDeadline,
    })
    .from(seasons)
    .where(eq(seasons.slug, EARLY_BIRD_SEASON_SLUG))
    .limit(1);
  if (!season) {
    throw new Error(
      `Early-bird season not found (slug: ${EARLY_BIRD_SEASON_SLUG}) — re-run npm run db:seed:e2e`,
    );
  }
  if (
    season.earlyBirdPriceCents == null ||
    !season.earlyBirdDeadline ||
    new Date(season.earlyBirdDeadline).getTime() <= Date.now()
  ) {
    throw new Error(
      `Season ${EARLY_BIRD_SEASON_SLUG} has no live early-bird window — re-run npm run db:seed:e2e`,
    );
  }
  seasonId = season.id;
  listPriceCents = season.priceCents;
  earlyBirdPriceCents = season.earlyBirdPriceCents;

  // Cache the cookie once to avoid rate-limiting.
  adultCookie = await getAuthCookie(ADULT_EMAIL, "TestParent123!");
});

describe("early-bird pricing — seeded spring season", () => {
  it("seed sanity: early-bird price undercuts the list price", () => {
    expect(earlyBirdPriceCents).toBeLessThan(listPriceCents);
  });

  it("season detail reports earlyBirdActive + effective price fields", async () => {
    const res = await fetch(`${BASE}/api/public/seasons/${seasonId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.season.earlyBirdActive).toBe(true);
    expect(body.season.effectivePriceCents).toBe(earlyBirdPriceCents);
    expect(body.season.effectivePrice).toBe(earlyBirdPriceCents / 100);
    // Existing fields keep the list price untouched.
    expect(body.season.priceCents).toBe(listPriceCents);
    expect(body.season.price).toBe(listPriceCents / 100);
  });

  it("POST /api/registrations charges the early-bird price for a full registration", async () => {
    // Register a fresh in-range dependent rather than the adult account's
    // own self-record: this season carries a U8 (6-8) age_group, and the
    // age-eligibility gate (Task 2, F1) now 422s an adult (birthDate
    // 1985-06-15) registering themselves for it. Early-bird pricing is a
    // season-level calculation that doesn't care who registers, so a
    // compatible-age dependent still exercises the thing this test is
    // actually about.
    const childRes = await apiFetch("/api/family-members", {
      method: "POST",
      cookie: adultCookie,
      body: JSON.stringify({
        firstName: `EarlyBirdKid${Date.now()}`,
        lastName: "Test",
        birthDate: "2019-01-01", // age ~7 — inside the U8 (6-8) age_group
        gender: "male",
        parentalConsent: true,
      }),
    });
    expect(childRes.status).toBe(201);
    const { familyMember } = await childRes.json();

    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: adultCookie,
      body: JSON.stringify({
        seasonId,
        familyMemberId: familyMember.id,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Adult Self",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.registration).toBeTruthy();
    expect(body.amountDueCents).toBe(earlyBirdPriceCents);
    expect(body.registration.amountDueCents).toBe(earlyBirdPriceCents);
  });
});
