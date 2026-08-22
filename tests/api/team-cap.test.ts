/**
 * Season team cap (#429).
 *
 * `seasons.maxParticipants` never limited team signups — an unlimited number
 * of teams could register for any season, including team-only seasons whose
 * filled-in player cap was completely inert. `seasons.maxTeams` closes that
 * at BOTH pre-payment doors:
 *
 *  - POST /api/public/team-registrations/prepare (deposit intent) — must 409
 *    BEFORE any Stripe call, so no deposit is ever taken for a slot that
 *    doesn't exist. (This also keeps the test Stripe-free: CI has no keys.)
 *  - POST /api/public/team-registrations (direct create) — transactional
 *    count + insert under the season row lock.
 *
 * Cancelled teams free their slot.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch, getAuthCookie, expectJson } from "./setup/test-helpers";
import { getDb } from "@/lib/db";
import { teamRegistrations } from "@/lib/db/schema";
import { E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";
import { eq } from "drizzle-orm";

const uniq = Date.now();
let adminCookie: string;
let seasonId: string;
let seededTeamId: string;

const teamBody = (suffix: string) => ({
  seasonId,
  teamName: `Cap Test FC ${suffix}-${uniq}`,
  captainName: "Cap Captain",
  captainEmail: `team-cap-${suffix}-${uniq}@test.aspiresports.com`,
  backstopConsent: true,
});

describe("season team cap (#429)", () => {
  beforeAll(async () => {
    adminCookie = await getAuthCookie(
      "admin@test.aspiresports.com",
      "TestAdmin123!",
    );

    const programsRes = await apiFetch("/api/admin/programs", {
      method: "GET",
      cookie: adminCookie,
    });
    const programs = (await programsRes.json()).programs as any[];
    expect(programs.length).toBeGreaterThan(0);

    // A team-mode season capped at ONE team, open for registration.
    const createRes = await apiFetch("/api/admin/seasons", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        programId: programs[0].id,
        name: `Team Cap Season ${uniq}`,
        slug: `team-cap-${uniq}`,
        startDate: "2027-02-01",
        endDate: "2027-04-15",
        registrationCloses: "2027-01-25T04:59:59.000Z",
        priceCents: 11000,
        teamPriceCents: 85000,
        signupModes: ["individual", "team"],
        maxTeams: 1,
        status: "open",
      }),
    });
    const createJson = await expectJson(createRes, 201);
    seasonId = createJson.season.id;
    expect(createJson.season.maxTeams ?? 1).toBe(1);

    // Fill the single slot directly — the cap counts non-cancelled rows.
    const [seeded] = await getDb()
      .insert(teamRegistrations)
      .values({
        // The seeded admin account lives in the E2E org, so the admin-created
        // season above belongs to it too.
        organizationId: E2E_ORG_ID,
        seasonId,
        captainEmail: `team-cap-seeded-${uniq}@test.aspiresports.com`,
        captainName: "Seeded Captain",
        teamName: `Seeded FC ${uniq}`,
        inviteToken: `cap-test-token-${uniq}`,
        status: "forming",
        teamFeeCents: 85000,
      })
      .returning({ id: teamRegistrations.id, organizationId: teamRegistrations.organizationId });
    seededTeamId = seeded.id;
  });

  afterAll(async () => {
    await getDb().delete(teamRegistrations).where(eq(teamRegistrations.seasonId, seasonId));
  });

  it("prepare 409s at the cap, before any deposit intent exists", async () => {
    const res = await apiFetch("/api/public/team-registrations/prepare", {
      method: "POST",
      body: JSON.stringify(teamBody("prepare")),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/team spots/i);
  });

  it("direct create 409s at the cap and inserts nothing", async () => {
    const res = await apiFetch("/api/public/team-registrations", {
      method: "POST",
      body: JSON.stringify(teamBody("direct")),
    });
    expect(res.status).toBe(409);

    const rows = await getDb()
      .select({ id: teamRegistrations.id })
      .from(teamRegistrations)
      .where(eq(teamRegistrations.seasonId, seasonId));
    expect(rows).toHaveLength(1); // still just the seeded team
  });

  it("a cancelled team frees the slot — the gate opens again", async () => {
    await getDb()
      .update(teamRegistrations)
      .set({ status: "cancelled" })
      .where(eq(teamRegistrations.id, seededTeamId));

    // The gate must PASS now. prepare proceeds toward Stripe after the gate,
    // and this environment may not have Stripe configured — so the assertion
    // is "anything but the cap 409" rather than a strict 200.
    const res = await apiFetch("/api/public/team-registrations/prepare", {
      method: "POST",
      body: JSON.stringify(teamBody("freed")),
    });
    expect(res.status).not.toBe(409);
  });
});
