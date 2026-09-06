/**
 * Youth captain-credit display surfaces (winter-team-fixes, fix round 1).
 *
 * Task 4 un-suppressed a contradiction: `captainRegistered` (whether the
 * captain has a team_registration_members row) is now permanently false for
 * a youth team, since `ensureCaptainRegistration` is gated off entirely
 * (finalize-team-deposit.ts). Two display surfaces preview a captain-credit
 * that must never apply to a manager-captain:
 *
 *  - `buildTeamHubDetail` (team-hub.ts, backs the dashboard Team Hub) —
 *    `captainCredit` must be null for youth even when the deposit is paid
 *    and the captain has no player registration (exactly the state every
 *    youth team is now in), and `payment.isYouth` must be threaded through
 *    for the "Add teammates" split (TeamHub.tsx).
 *  - GET /api/public/team-registrations/[token] — `viewerCaptainCredit` must
 *    be null for the same reason (inert client-side today, but the payload
 *    itself must not lie).
 *
 * Adult behavior is asserted unchanged in both cases, right next to the
 * youth assertions.
 *
 * Uses a hand-built team_registrations row (NOT seedTeamPaymentContext's own
 * team, which links the captain via team_registration_members at seed time —
 * exactly the auto-registration this scenario must NOT have) with
 * depositPaymentId set (so teamDepositPaid() is true) and no member row.
 */
import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { users, seasons, ageGroups, teamRegistrations, payments } from "@/lib/db/schema";
import { buildTeamHubDetail } from "@/lib/registrations/team-hub";
import { apiFetch, getAuthCookie } from "./setup/test-helpers";
import { seedTeamPaymentContext, CAPTAIN_PASSWORD } from "../utils/team-payment-context";

async function makeYouthSeason(seasonId: string) {
  await getDb().update(seasons).set({ minAge: 8 }).where(eq(seasons.id, seasonId));
}

/** An UNREGISTERED-captain team (no team_registration_members row) with a
 *  verifiably paid deposit — the exact state every youth team is in after
 *  task 4 (captain auto-registration is gated off entirely), and the state
 *  an adult team was in before #468/#469 auto-registered the captain. */
async function makeUnregisteredCaptainTeam(opts: {
  organizationId: string;
  seasonId: string;
  captainUserId: string;
  captainEmail: string;
}) {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);
  const [team] = await db
    .insert(teamRegistrations)
    .values({
      organizationId: opts.organizationId,
      seasonId: opts.seasonId,
      captainUserId: opts.captainUserId,
      captainEmail: opts.captainEmail,
      captainName: "Unreg Captain",
      teamName: `Unreg FC ${suffix}`,
      inviteToken: randomBytes(24).toString("base64url"),
      status: "forming",
      teamFeeCents: 97500,
      depositCents: 20000,
      backstopStatus: "pending",
    })
    .returning();
  const [dep] = await db
    .insert(payments)
    .values({
      registrationId: null,
      teamRegistrationId: team.id,
      userId: opts.captainUserId,
      amountCents: 20000,
      paymentType: "deposit",
      status: "succeeded",
      stripePaymentIntentId: `pi_unreg_${suffix}`,
    })
    .returning();
  await db
    .update(teamRegistrations)
    .set({ depositPaymentId: dep.id })
    .where(eq(teamRegistrations.id, team.id));
  const [updated] = await db
    .select()
    .from(teamRegistrations)
    .where(eq(teamRegistrations.id, team.id));
  return updated;
}

describe("buildTeamHubDetail — captainCredit gate + payment.isYouth", () => {
  it("youth, unregistered captain, deposit paid: captainCredit is null, payment.isYouth is true", async () => {
    const ctx = await seedTeamPaymentContext();
    await makeYouthSeason(ctx.seasonId);

    const suffix = Math.random().toString(36).slice(2, 10);
    const [captain] = await getDb()
      .insert(users)
      .values({
        email: `youth-hub-cap-${suffix}@test.example`,
        passwordHash: await hashPassword("Cap123456!"),
        firstName: "Hub",
        lastName: "Captain",
      })
      .returning();
    const team = await makeUnregisteredCaptainTeam({
      organizationId: ctx.organizationId,
      seasonId: ctx.seasonId,
      captainUserId: captain.id,
      captainEmail: captain.email,
    });

    const detail = await buildTeamHubDetail(getDb(), team);
    expect(detail.payment.isYouth).toBe(true);
    expect(detail.captainCredit).toBeNull();
  });

  it("adult, unregistered captain, deposit paid: captainCredit IS populated, payment.isYouth is false (unchanged)", async () => {
    const ctx = await seedTeamPaymentContext(); // adult by default

    const suffix = Math.random().toString(36).slice(2, 10);
    const [captain] = await getDb()
      .insert(users)
      .values({
        email: `adult-hub-cap-${suffix}@test.example`,
        passwordHash: await hashPassword("Cap123456!"),
        firstName: "Hub",
        lastName: "Captain",
      })
      .returning();
    const team = await makeUnregisteredCaptainTeam({
      organizationId: ctx.organizationId,
      seasonId: ctx.seasonId,
      captainUserId: captain.id,
      captainEmail: captain.email,
    });

    const detail = await buildTeamHubDetail(getDb(), team);
    expect(detail.payment.isYouth).toBe(false);
    expect(detail.captainCredit).not.toBeNull();
    // Season price (12000) fully credited by the $200 deposit → 0 due.
    expect(detail.captainCredit?.dueCents).toBe(0);
  });
});

describe("GET /api/public/team-registrations/[token] — viewerCaptainCredit gate", () => {
  it("youth, unregistered captain viewing as themselves: viewerCaptainCredit is null", async () => {
    const ctx = await seedTeamPaymentContext();
    await makeYouthSeason(ctx.seasonId);

    const suffix = Math.random().toString(36).slice(2, 10);
    const email = `youth-token-cap-${suffix}@test.example`;
    const [captain] = await getDb()
      .insert(users)
      .values({ email, passwordHash: await hashPassword(CAPTAIN_PASSWORD), firstName: "Token", lastName: "Captain" })
      .returning();
    const team = await makeUnregisteredCaptainTeam({
      organizationId: ctx.organizationId,
      seasonId: ctx.seasonId,
      captainUserId: captain.id,
      captainEmail: email,
    });

    const cookie = await getAuthCookie(email, CAPTAIN_PASSWORD);
    const res = await apiFetch(`/api/public/team-registrations/${team.inviteToken}`, { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { viewerCaptainCredit: unknown };
    expect(body.viewerCaptainCredit).toBeNull();
  });

  it("adult, unregistered captain viewing as themselves: viewerCaptainCredit IS populated (unchanged)", async () => {
    const ctx = await seedTeamPaymentContext(); // adult by default

    const suffix = Math.random().toString(36).slice(2, 10);
    const email = `adult-token-cap-${suffix}@test.example`;
    const [captain] = await getDb()
      .insert(users)
      .values({ email, passwordHash: await hashPassword(CAPTAIN_PASSWORD), firstName: "Token", lastName: "Captain" })
      .returning();
    const team = await makeUnregisteredCaptainTeam({
      organizationId: ctx.organizationId,
      seasonId: ctx.seasonId,
      captainUserId: captain.id,
      captainEmail: email,
    });

    const cookie = await getAuthCookie(email, CAPTAIN_PASSWORD);
    const res = await apiFetch(`/api/public/team-registrations/${team.inviteToken}`, { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      viewerCaptainCredit: { dueCents: number } | null;
    };
    expect(body.viewerCaptainCredit).not.toBeNull();
    expect(body.viewerCaptainCredit?.dueCents).toBe(0);
  });
});
