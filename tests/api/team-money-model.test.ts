/**
 * The team money model ("one price, every payment counts"):
 *
 *  1. teamMoneyReceivedCents — settled money toward a team's fee: team-level
 *     payments (deposit/backstop, refunds subtract) + linked member
 *     registrations' amountPaidCents. Casey's $120 counts.
 *  2. Backstop due = max(0, teamFee − received); legacy teams with no fee
 *     recorded fall back to the invitee-share sum.
 *  3. The backstop cron uses that math: a covered team closes out without a
 *     charge; a shortfall team with no saved card is marked failed.
 *  4. Auto-share on join: registering through the team link without a
 *     captain-assigned share creates the invitee row (email, amount due,
 *     registrationId) so roster views and reminders stay coherent.
 *  5. Captain-set join price: joinShareCents overrides the individual price
 *     for open-link joins; an explicit invitee share still wins; the captain
 *     can set it via PATCH /api/public/team-registrations/[token].
 */
import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import {
  users,
  familyMembers,
  registrations,
  payments,
  teamRegistrations,
  teamRegistrationMembers,
  teamInvitees,
} from "@/lib/db/schema";
import { teamMoneyReceivedCents } from "@/lib/registrations/team-funding";
import { teamBackstopDueCents } from "@/lib/payments/team-captain-charge";
import { createRegistration } from "@/lib/registrations/create-registration";
import { getAuthCookie, apiFetch } from "./setup/test-helpers";
import {
  seedTeamPaymentContext,
  type TeamPaymentContext,
  DEPOSIT_CENTS,
  BALANCE_CENTS,
  REFUND_CENTS,
  CAPTAIN_PASSWORD,
} from "../utils/team-payment-context";

const TEAM_LEVEL_CENTS = DEPOSIT_CENTS + BALANCE_CENTS - REFUND_CENTS;
const CRON_SECRET = "ci-cron-test-secret";

async function seedJoiner(ctx: TeamPaymentContext, tag: string) {
  const db = getDb();
  const email = `join-${tag}-${ctx.suffix}@test.example`;
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash: await hashPassword("Joiner123!"),
      firstName: "Jo",
      lastName: `Iner${tag}`,
    })
    .returning();
  // Adult self person: selfUserId XOR parentUserId (DB check constraint).
  const [member] = await db
    .insert(familyMembers)
    .values({
      selfUserId: user.id,
      firstName: "Jo",
      lastName: `Iner${tag}`,
      birthDate: "1996-05-05",
    })
    .returning();
  return { user, member, email };
}

describe("teamMoneyReceivedCents", () => {
  it("sums team-level payments (refunds subtract) plus linked member payments", async () => {
    const ctx = await seedTeamPaymentContext();
    const before = await teamMoneyReceivedCents(getDb(), ctx.teamRegistrationId);
    expect(before.teamLevelCents).toBe(TEAM_LEVEL_CENTS);
    expect(before.memberCents).toBe(0);
    expect(before.totalCents).toBe(TEAM_LEVEL_CENTS);

    // Link the paid solo registration to the team — its $120 now counts.
    await getDb().insert(teamRegistrationMembers).values({
      teamRegistrationId: ctx.teamRegistrationId,
      registrationId: ctx.soloRegistrationId,
      role: "member",
    });
    const after = await teamMoneyReceivedCents(getDb(), ctx.teamRegistrationId);
    expect(after.memberCents).toBe(12000);
    expect(after.totalCents).toBe(TEAM_LEVEL_CENTS + 12000);
  });
});

describe("teamBackstopDueCents", () => {
  it("charges the shortfall against the fee, floored at zero", () => {
    expect(
      teamBackstopDueCents({ teamFeeCents: 97500, receivedCents: 32000, invitees: [] }),
    ).toBe(65500);
    expect(
      teamBackstopDueCents({ teamFeeCents: 97500, receivedCents: 116000, invitees: [] }),
    ).toBe(0);
  });

  it("falls back to unpaid invitee shares when no fee is recorded (legacy)", () => {
    expect(
      teamBackstopDueCents({
        teamFeeCents: null,
        receivedCents: 999999,
        invitees: [
          { assignedShareCents: 5000, status: "pending" },
          { assignedShareCents: 4000, status: "paid" },
        ],
      }),
    ).toBe(5000);
  });
});

describe("cron charge-unpaid-team-shares — money-based", () => {
  it("closes out a fully-covered team without charging", async () => {
    const ctx = await seedTeamPaymentContext();
    await getDb()
      .update(teamRegistrations)
      .set({
        teamFeeCents: TEAM_LEVEL_CENTS, // exactly covered by money received
        backstopStatus: "pending",
        paymentDeadline: new Date(Date.now() - 60_000),
      })
      .where(eq(teamRegistrations.id, ctx.teamRegistrationId));

    const res = await apiFetch("/api/cron/charge-unpaid-team-shares", {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    expect(res.status).toBe(200);

    const [team] = await getDb()
      .select()
      .from(teamRegistrations)
      .where(eq(teamRegistrations.id, ctx.teamRegistrationId));
    expect(team.backstopStatus).toBe("charged");

    // No new balance row beyond the fixture's own.
    const balanceRows = await getDb()
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.teamRegistrationId, ctx.teamRegistrationId),
          eq(payments.paymentType, "balance"),
        ),
      );
    expect(balanceRows).toHaveLength(1);
  });

  it("marks a shortfall team with no saved card as failed (not silently closed)", async () => {
    const ctx = await seedTeamPaymentContext();
    await getDb()
      .update(teamRegistrations)
      .set({
        teamFeeCents: TEAM_LEVEL_CENTS + 50000, // $500 short
        backstopStatus: "pending",
        paymentDeadline: new Date(Date.now() - 60_000),
      })
      .where(eq(teamRegistrations.id, ctx.teamRegistrationId));

    const res = await apiFetch("/api/cron/charge-unpaid-team-shares", {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    expect(res.status).toBe(200);

    const [team] = await getDb()
      .select()
      .from(teamRegistrations)
      .where(eq(teamRegistrations.id, ctx.teamRegistrationId));
    // Pre-fix, the empty invitee list read as "$0 unpaid" and the team was
    // silently closed as charged. Money-based math must flag the shortfall.
    expect(team.backstopStatus).toBe("failed");
  });
});

describe("auto-share on join", () => {
  it("creates a pending invitee share for an open-link joiner", async () => {
    const ctx = await seedTeamPaymentContext();
    const joiner = await seedJoiner(ctx, "open");

    const result = await createRegistration({
      db: getDb(),
      user: { id: joiner.user.id, email: joiner.email, firstName: "Jo" },
      familyMember: {
        id: joiner.member.id,
        firstName: "Jo",
        lastName: joiner.member.lastName,
        selfUserId: joiner.user.id,
      },
      seasonId: ctx.seasonId,
      registrationType: "full",
      waiverSigned: true,
      waiverSignedBy: "Jo Iner",
      teamToken: `tok-${ctx.suffix}`,
    });
    expect(result.kind).toBe("created");
    if (result.kind !== "created") return;
    // No join price set → individual season price.
    expect(result.amountDueCents).toBe(12000);

    const [invitee] = await getDb()
      .select()
      .from(teamInvitees)
      .where(
        and(
          eq(teamInvitees.teamRegistrationId, ctx.teamRegistrationId),
          eq(teamInvitees.email, joiner.email.toLowerCase()),
        ),
      );
    expect(invitee, "auto-share invitee row missing").toBeTruthy();
    expect(invitee.assignedShareCents).toBe(12000);
    expect(invitee.status).toBe("pending");
    expect(invitee.registrationId).toBe(result.registration.id);
  });

  it("charges the captain-set join price when one is set", async () => {
    const ctx = await seedTeamPaymentContext();
    await getDb()
      .update(teamRegistrations)
      .set({ joinShareCents: 9000 })
      .where(eq(teamRegistrations.id, ctx.teamRegistrationId));
    const joiner = await seedJoiner(ctx, "priced");

    const result = await createRegistration({
      db: getDb(),
      user: { id: joiner.user.id, email: joiner.email, firstName: "Jo" },
      familyMember: {
        id: joiner.member.id,
        firstName: "Jo",
        lastName: joiner.member.lastName,
        selfUserId: joiner.user.id,
      },
      seasonId: ctx.seasonId,
      registrationType: "full",
      waiverSigned: true,
      waiverSignedBy: "Jo Iner",
      teamToken: `tok-${ctx.suffix}`,
    });
    expect(result.kind).toBe("created");
    if (result.kind !== "created") return;
    expect(result.amountDueCents).toBe(9000);

    const [invitee] = await getDb()
      .select()
      .from(teamInvitees)
      .where(
        and(
          eq(teamInvitees.teamRegistrationId, ctx.teamRegistrationId),
          eq(teamInvitees.email, joiner.email.toLowerCase()),
        ),
      );
    expect(invitee.assignedShareCents).toBe(9000);
  });

  it("still honors an explicit captain-assigned invitee share over the join price", async () => {
    const ctx = await seedTeamPaymentContext();
    await getDb()
      .update(teamRegistrations)
      .set({ joinShareCents: 9000 })
      .where(eq(teamRegistrations.id, ctx.teamRegistrationId));
    const joiner = await seedJoiner(ctx, "invited");
    await getDb().insert(teamInvitees).values({
      teamRegistrationId: ctx.teamRegistrationId,
      email: joiner.email.toLowerCase(),
      assignedShareCents: 8000,
      status: "pending",
    });

    const result = await createRegistration({
      db: getDb(),
      user: { id: joiner.user.id, email: joiner.email, firstName: "Jo" },
      familyMember: {
        id: joiner.member.id,
        firstName: "Jo",
        lastName: joiner.member.lastName,
        selfUserId: joiner.user.id,
      },
      seasonId: ctx.seasonId,
      registrationType: "full",
      waiverSigned: true,
      waiverSignedBy: "Jo Iner",
      teamToken: `tok-${ctx.suffix}`,
    });
    expect(result.kind).toBe("created");
    if (result.kind !== "created") return;
    expect(result.amountDueCents).toBe(8000);
  });
});

describe("PATCH /api/public/team-registrations/[token] — join price", () => {
  it("lets the captain set and clear the join price", async () => {
    const ctx = await seedTeamPaymentContext();
    const captainCookie = await getAuthCookie(ctx.captainEmail, CAPTAIN_PASSWORD);

    const set = await apiFetch(`/api/public/team-registrations/tok-${ctx.suffix}`, {
      method: "PATCH",
      cookie: captainCookie,
      body: JSON.stringify({ joinShareCents: 9500 }),
    });
    expect(set.status).toBe(200);
    let [team] = await getDb()
      .select()
      .from(teamRegistrations)
      .where(eq(teamRegistrations.id, ctx.teamRegistrationId));
    expect(team.joinShareCents).toBe(9500);

    const clear = await apiFetch(`/api/public/team-registrations/tok-${ctx.suffix}`, {
      method: "PATCH",
      cookie: captainCookie,
      body: JSON.stringify({ joinShareCents: null }),
    });
    expect(clear.status).toBe(200);
    [team] = await getDb()
      .select()
      .from(teamRegistrations)
      .where(eq(teamRegistrations.id, ctx.teamRegistrationId));
    expect(team.joinShareCents).toBeNull();
  });

  it("rejects non-captains and bad amounts", async () => {
    const ctx = await seedTeamPaymentContext();
    const stranger = await seedJoiner(ctx, "stranger");
    const strangerCookie = await getAuthCookie(stranger.email, "Joiner123!");

    const forbidden = await apiFetch(
      `/api/public/team-registrations/tok-${ctx.suffix}`,
      {
        method: "PATCH",
        cookie: strangerCookie,
        body: JSON.stringify({ joinShareCents: 9500 }),
      },
    );
    expect(forbidden.status).toBe(403);

    const captainCookie = await getAuthCookie(ctx.captainEmail, CAPTAIN_PASSWORD);
    const bad = await apiFetch(`/api/public/team-registrations/tok-${ctx.suffix}`, {
      method: "PATCH",
      cookie: captainCookie,
      body: JSON.stringify({ joinShareCents: -100 }),
    });
    expect(bad.status).toBe(400);
  });
});
