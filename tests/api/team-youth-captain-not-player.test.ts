/**
 * Youth captain is a manager, not a player (winter-team-fixes, task 4).
 *
 * Two independent gates, both keyed on `isYouthTeamSeason`:
 *  - `finalize-team-deposit.ts` must never call `ensureCaptainRegistration`
 *    for a youth season — neither on the fresh-create path nor the
 *    idempotent re-entry path (a redelivered webhook / browser retry).
 *  - `create-registration.ts`'s captain-deposit-credit branch
 *    (`resolveTeamPricing`) must never apply on a youth season — a captain
 *    who does reach a "self" registration on their own youth team's link
 *    (structurally near-unreachable today, since children have no
 *    `selfUserId`, but the credit backs real money and must fail safe) pays
 *    the full share; the deposit is a refundable hold, not a credit.
 *
 * Adult behavior (both gates) is asserted unchanged in the same file, right
 * next to the youth assertions, so a future regression on either side shows
 * up here.
 */
import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { users, familyMembers, registrations, seasons, ageGroups, teamRegistrations } from "@/lib/db/schema";
import { finalizeTeamDeposit } from "@/lib/registrations/finalize-team-deposit";
import { createRegistration } from "@/lib/registrations/create-registration";
import { handleTeamDepositSucceeded } from "@/lib/stripe/handle-team-deposit-succeeded";
import { seedTeamPaymentContext } from "../utils/team-payment-context";

async function makeYouthSeason(seasonId: string) {
  await getDb().update(seasons).set({ minAge: 8 }).where(eq(seasons.id, seasonId));
}

/**
 * The production youth shape (fix round 1, minor c): real seasons have NO
 * `seasons.minAge` override — they're age-group-led by construction (see
 * team-season-kind.ts's doc block). `makeYouthSeason` above (direct
 * `seasons.minAge`) exercises `isYouthTeamSeason`'s FIRST resolution branch;
 * this exercises the SECOND — resolving through the `leftJoin(ageGroups)`
 * every call site (finalize-team-deposit.ts, handle-team-deposit-succeeded.ts,
 * invite.ts, create-registration.ts's isYouthSeasonForTeamPricing) actually
 * runs in production.
 */
async function makeYouthSeasonViaAgeGroup(organizationId: string, seasonId: string) {
  const db = getDb();
  const [ageGroup] = await db
    .insert(ageGroups)
    .values({ organizationId, name: "U10", minAge: 6, maxAge: 10 })
    .returning();
  await db
    .update(seasons)
    .set({ ageGroupId: ageGroup.id, minAge: null })
    .where(eq(seasons.id, seasonId));
}

async function registrationsFor(seasonId: string, registeredByUserId: string) {
  return getDb()
    .select()
    .from(registrations)
    .where(
      and(
        eq(registrations.seasonId, seasonId),
        eq(registrations.registeredByUserId, registeredByUserId),
      ),
    );
}

function fakeDepositPi(opts: {
  organizationId: string;
  seasonId: string;
  captainUserId: string;
  captainEmail: string;
  teamName: string;
  id: string;
}): Stripe.PaymentIntent {
  return {
    id: opts.id,
    payment_method: "pm_test",
    customer: "cus_test",
    metadata: {
      organizationId: opts.organizationId,
      seasonId: opts.seasonId,
      captainUserId: opts.captainUserId,
      captainEmail: opts.captainEmail,
      captainName: "Cap Tain",
      teamName: opts.teamName,
      teamFeeCents: "97500",
      backstopConsent: "true",
      brand: "aspire",
    },
  } as unknown as Stripe.PaymentIntent;
}

describe("finalizeTeamDeposit — captain auto-registration gate", () => {
  it("creates the team but registers NO captain registration on a youth season", async () => {
    const ctx = await seedTeamPaymentContext();
    await makeYouthSeason(ctx.seasonId);

    const suffix = Math.random().toString(36).slice(2, 10);
    const email = `youth-cap-${suffix}@test.example`;
    const [captain] = await getDb()
      .insert(users)
      .values({ email, passwordHash: await hashPassword("Cap123456!"), firstName: "Youth", lastName: "Captain" })
      .returning();

    const fakePi = fakeDepositPi({
      organizationId: ctx.organizationId,
      seasonId: ctx.seasonId,
      captainUserId: captain.id,
      captainEmail: email,
      teamName: `Youth FC ${suffix}`,
      id: `pi_youthcap_${suffix}`,
    });

    const result = await finalizeTeamDeposit(fakePi);
    expect(result.created).toBe(true);
    expect(await registrationsFor(ctx.seasonId, captain.id)).toHaveLength(0);

    // Idempotent re-entry (redelivered webhook / browser retry after the
    // other caller already won) must ALSO skip captain registration.
    const again = await finalizeTeamDeposit(fakePi);
    expect(again.created).toBe(false);
    expect(await registrationsFor(ctx.seasonId, captain.id)).toHaveLength(0);
  });

  it("still auto-registers the captain on an adult season (unchanged)", async () => {
    const ctx = await seedTeamPaymentContext(); // adult by default — no minAge/ageGroup set

    const suffix = Math.random().toString(36).slice(2, 10);
    const email = `adult-cap-${suffix}@test.example`;
    const [captain] = await getDb()
      .insert(users)
      .values({ email, passwordHash: await hashPassword("Cap123456!"), firstName: "Adult", lastName: "Captain" })
      .returning();

    const fakePi = fakeDepositPi({
      organizationId: ctx.organizationId,
      seasonId: ctx.seasonId,
      captainUserId: captain.id,
      captainEmail: email,
      teamName: `Adult FC ${suffix}`,
      id: `pi_adultcap_${suffix}`,
    });

    const result = await finalizeTeamDeposit(fakePi);
    expect(result.created).toBe(true);
    expect(await registrationsFor(ctx.seasonId, captain.id)).toHaveLength(1);

    // Re-entry stays idempotent (still exactly one registration, not two).
    const again = await finalizeTeamDeposit(fakePi);
    expect(again.created).toBe(false);
    expect(await registrationsFor(ctx.seasonId, captain.id)).toHaveLength(1);
  });

  it("also skips captain registration when youth resolves via a real age group (no seasons.minAge)", async () => {
    const ctx = await seedTeamPaymentContext();
    await makeYouthSeasonViaAgeGroup(ctx.organizationId, ctx.seasonId);

    const suffix = Math.random().toString(36).slice(2, 10);
    const email = `youth-ag-cap-${suffix}@test.example`;
    const [captain] = await getDb()
      .insert(users)
      .values({ email, passwordHash: await hashPassword("Cap123456!"), firstName: "YouthAG", lastName: "Captain" })
      .returning();

    const fakePi = fakeDepositPi({
      organizationId: ctx.organizationId,
      seasonId: ctx.seasonId,
      captainUserId: captain.id,
      captainEmail: email,
      teamName: `Youth AG FC ${suffix}`,
      id: `pi_youthagcap_${suffix}`,
    });

    const result = await finalizeTeamDeposit(fakePi);
    expect(result.created).toBe(true);
    expect(await registrationsFor(ctx.seasonId, captain.id)).toHaveLength(0);
  });
});

describe("handleTeamDepositSucceeded — receipt-email youth flag via a real age group", () => {
  it("resolves isYouth through the leftJoin(ageGroups) path without throwing", async () => {
    // A bare, hand-built team_registrations row (NOT seedTeamPaymentContext's
    // fixture, whose depositPaymentId is already set — this handler's dedupe
    // gate short-circuits before ever reaching the season/ageGroup lookup on
    // that row) with depositPaymentId null, so this call is the one that
    // actually reaches the leftJoin(ageGroups) query.
    const ctx = await seedTeamPaymentContext();
    await makeYouthSeasonViaAgeGroup(ctx.organizationId, ctx.seasonId);
    const db = getDb();

    const suffix = Math.random().toString(36).slice(2, 10);
    const email = `youth-ag-eager-${suffix}@test.example`;
    const [captain] = await db
      .insert(users)
      .values({ email, passwordHash: await hashPassword("Cap123456!"), firstName: "Eager", lastName: "Captain" })
      .returning();

    const [team] = await db
      .insert(teamRegistrations)
      .values({
        organizationId: ctx.organizationId,
        seasonId: ctx.seasonId,
        captainUserId: captain.id,
        captainEmail: email,
        captainName: "Eager Captain",
        teamName: `Eager Youth FC ${suffix}`,
        inviteToken: randomBytes(24).toString("base64url"),
        status: "forming",
        teamFeeCents: 97500,
        depositCents: 20000,
        backstopStatus: "none",
      })
      .returning();

    const fakePi = {
      id: `pi_eager_youth_${suffix}`,
      payment_method: "pm_test",
      customer: "cus_test",
      metadata: { team_registration_id: team.id },
    } as unknown as Stripe.PaymentIntent;

    const handled = await handleTeamDepositSucceeded(fakePi);
    expect(handled.status).toBe("processed");

    const [updated] = await db
      .select()
      .from(teamRegistrations)
      .where(eq(teamRegistrations.id, team.id));
    // The ledger insert + depositPaymentId backfill (and therefore the
    // season/ageGroup lookup feeding the receipt email) actually ran.
    expect(updated.depositPaymentId).not.toBeNull();
  });
});

describe("createRegistration — captain deposit-credit gate is adult-only", () => {
  it("a youth captain's own 'self' registration pays the full share, no deposit credit", async () => {
    const ctx = await seedTeamPaymentContext(); // deposit already paid on ctx.teamRegistrationId
    await makeYouthSeason(ctx.seasonId);
    const db = getDb();

    // A "self" family-member row for the captain — the shape the credit
    // branch keys on (`familyMember.selfUserId === user.id`). Distinct from
    // the fixture's own parentUserId-based captainMember, so this doesn't
    // collide with the registration seedTeamPaymentContext already created.
    const [selfMember] = await db
      .insert(familyMembers)
      .values({ selfUserId: ctx.captainUserId, firstName: "Team", lastName: ctx.captainLastName, birthDate: "1990-01-01" })
      .returning();

    const created = await createRegistration({
      db,
      user: { id: ctx.captainUserId, email: ctx.captainEmail, firstName: "Team" },
      familyMember: { id: selfMember.id, firstName: "Team", lastName: ctx.captainLastName, selfUserId: ctx.captainUserId },
      seasonId: ctx.seasonId,
      registrationType: "full",
      waiverSigned: true,
      waiverSignedBy: "Team Captain",
      teamToken: `tok-${ctx.suffix}`,
    });

    expect(created.kind).toBe("created");
    if (created.kind !== "created") return;
    // No credit applied: full season price (fixture's priceCents), NOT
    // reduced by the $200 deposit even though the deposit is verifiably paid.
    expect(created.amountDueCents).toBe(12000);
    expect(created.requiresPayment).toBe(true);
  });

  it("also pays the full share when youth resolves via a real age group (no seasons.minAge)", async () => {
    const ctx = await seedTeamPaymentContext();
    await makeYouthSeasonViaAgeGroup(ctx.organizationId, ctx.seasonId);
    const db = getDb();

    const [selfMember] = await db
      .insert(familyMembers)
      .values({ selfUserId: ctx.captainUserId, firstName: "Team", lastName: ctx.captainLastName, birthDate: "1990-01-01" })
      .returning();

    const created = await createRegistration({
      db,
      user: { id: ctx.captainUserId, email: ctx.captainEmail, firstName: "Team" },
      familyMember: { id: selfMember.id, firstName: "Team", lastName: ctx.captainLastName, selfUserId: ctx.captainUserId },
      seasonId: ctx.seasonId,
      registrationType: "full",
      waiverSigned: true,
      waiverSignedBy: "Team Captain",
      teamToken: `tok-${ctx.suffix}`,
    });

    expect(created.kind).toBe("created");
    if (created.kind !== "created") return;
    expect(created.amountDueCents).toBe(12000);
    expect(created.requiresPayment).toBe(true);
  });

  it("an adult captain's own 'self' registration IS credited by the paid deposit (unchanged)", async () => {
    const ctx = await seedTeamPaymentContext(); // adult by default, deposit already paid
    const db = getDb();

    const [selfMember] = await db
      .insert(familyMembers)
      .values({ selfUserId: ctx.captainUserId, firstName: "Team", lastName: ctx.captainLastName, birthDate: "1990-01-01" })
      .returning();

    const created = await createRegistration({
      db,
      user: { id: ctx.captainUserId, email: ctx.captainEmail, firstName: "Team" },
      familyMember: { id: selfMember.id, firstName: "Team", lastName: ctx.captainLastName, selfUserId: ctx.captainUserId },
      seasonId: ctx.seasonId,
      registrationType: "full",
      waiverSigned: true,
      waiverSignedBy: "Team Captain",
      teamToken: `tok-${ctx.suffix}`,
    });

    expect(created.kind).toBe("created");
    if (created.kind !== "created") return;
    // Season price (12000) fully credited by the $200 (20000-cent) deposit →
    // captainShareDueCents(12000, 20000) = 0, zero-due finalize.
    expect(created.amountDueCents).toBe(0);
    expect(created.requiresPayment).toBe(false);
  });
});
