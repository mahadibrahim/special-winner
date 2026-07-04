import { describe, it, expect, beforeAll } from "vitest";
import { getAuthCookie, apiFetch } from "./setup/test-helpers";
import { getDb } from "@/lib/db";
import { seasons, registrations, familyMembers, users } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

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

  // Clean slate on the shared CI DB: a leftover pending-unpaid registration
  // from a prior run would be "resumed" with its old amountDueCents instead
  // of exercising the fresh charge path. Only pending/unpaid rows are removed
  // (paid rows carry restrict-FK payments and shouldn't exist here anyway).
  const [adultUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ADULT_EMAIL))
    .limit(1);
  if (adultUser) {
    const selfPeople = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(eq(familyMembers.selfUserId, adultUser.id));
    if (selfPeople.length > 0) {
      await db
        .delete(registrations)
        .where(
          and(
            eq(registrations.seasonId, seasonId),
            inArray(
              registrations.familyMemberId,
              selfPeople.map((p) => p.id),
            ),
            eq(registrations.status, "pending"),
            eq(registrations.paymentStatus, "unpaid"),
          ),
        );
    }
  }
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
    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: adultCookie,
      body: JSON.stringify({
        seasonId,
        registerSelf: true,
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
