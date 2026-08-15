/**
 * Self-seed helper for team-registration payment visibility tests (#525).
 *
 * Seeds, under the org that localhost admin requests resolve to (oldest
 * active headquarters org — see resolveDefaultOrganization in
 * src/lib/organization/domain-resolver.ts), the full team-payment row graph:
 *
 *   sport → location → program → season
 *   captain user (+ real password so tests can sign in as them)
 *   captain familyMember + registration ($0/$0 — deposit-covered)
 *   team_registrations (teamFee $1,050, deposit $200)
 *   payments: deposit $200 / backstop balance $637.50 / refund $50
 *             (all registration_id NULL + team_registration_id set)
 *   team_registration_members (captain link)
 *   team_invitees (one paid $212.50 share → collected = $412.50)
 *
 * Everything is suffixed so parallel/repeat runs never collide.
 */
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import {
  organizations,
  users,
  sports,
  locations,
  programs,
  seasons,
  familyMembers,
  registrations,
  payments,
  teamRegistrations,
  teamRegistrationMembers,
  teamInvitees,
} from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { assertTestDatabase } from "./assert-test-database";

export const TEAM_FEE_CENTS = 105000; // $1,050 — early-bird-locked team total
export const DEPOSIT_CENTS = 20000; // $200
export const BALANCE_CENTS = 63750; // $637.50 backstop remainder
export const REFUND_CENTS = 5000; // $50
export const PAID_SHARE_CENTS = 21250; // $212.50 — one paid roster share
/**
 * Money-based collected (the team-money model): settled team-level payments
 * (deposit + backstop balance − refunds) plus linked member registrations'
 * amountPaidCents ($0 in this fixture — the solo registration is NOT linked
 * to the team). The paid invitee share is bookkeeping, not settled money,
 * so it no longer counts.
 */
export const COLLECTED_CENTS = DEPOSIT_CENTS + BALANCE_CENTS - REFUND_CENTS;

export const CAPTAIN_PASSWORD = "TeamCap123!";

export interface TeamPaymentContext {
  suffix: string;
  organizationId: string;
  captainUserId: string;
  captainEmail: string;
  captainLastName: string;
  seasonId: string;
  seasonName: string;
  programName: string;
  teamRegistrationId: string;
  teamName: string;
  captainRegistrationId: string;
  depositPaymentId: string;
  depositPaymentIntentId: string;
  balancePaymentId: string;
  refundPaymentId: string;
  /** A plain solo registration + payment in the same org, for contrast. */
  soloRegistrationId: string;
  soloPaymentId: string;
}

export async function seedTeamPaymentContext(): Promise<TeamPaymentContext> {
  assertTestDatabase();
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

  // Same resolution as the admin endpoints hit from localhost.
  const [org] = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.organizationType, "headquarters"),
        eq(organizations.status, "active"),
      ),
    )
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  if (!org) throw new Error("No headquarters org in test DB — run db:seed:e2e");

  const [sport] = await db
    .insert(sports)
    .values({ name: `Sport ${suffix}`, slug: `sport-${suffix}`, organizationId: org.id })
    .returning();
  const [location] = await db
    .insert(locations)
    .values({ name: `Loc ${suffix}`, slug: `loc-${suffix}`, organizationId: org.id })
    .returning();
  const [program] = await db
    .insert(programs)
    .values({
      name: `Prog ${suffix}`,
      slug: `prog-${suffix}`,
      sportId: sport.id,
      locationId: location.id,
      programType: "league",
    })
    .returning();
  const [season] = await db
    .insert(seasons)
    .values({
      name: `Season ${suffix}`,
      slug: `season-${suffix}`,
      programId: program.id,
      startDate: "2026-09-01",
      endDate: "2026-12-01",
      priceCents: 12000,
      status: "open",
    })
    .returning();

  const captainEmail = `cap-${suffix}@test.aspiresports.com`;
  const captainLastName = `Capt${suffix}`;
  const [captain] = await db
    .insert(users)
    .values({
      email: captainEmail,
      passwordHash: await hashPassword(CAPTAIN_PASSWORD),
      firstName: "Team",
      lastName: captainLastName,
    })
    .returning();

  // Real captains get an org-access row via ensureOrgMembership during the
  // registration flow; the admin person profile's tenant gate requires it.
  await db.insert(userOrganizationAccess).values({
    userId: captain.id,
    organizationId: org.id,
    role: "parent",
    acceptedAt: new Date(),
  });

  const [captainMember] = await db
    .insert(familyMembers)
    .values({
      parentUserId: captain.id,
      firstName: "Team",
      lastName: captainLastName,
      birthDate: "1995-01-01",
    })
    .returning();

  // Deposit-covered captain registration — the $0/$0 row from issue #525.
  const [captainRegistration] = await db
    .insert(registrations)
    .values({
      seasonId: season.id,
      familyMemberId: captainMember.id,
      registeredByUserId: captain.id,
      status: "confirmed",
      paymentStatus: "paid",
      amountPaidCents: 0,
      amountDueCents: 0,
      registrationType: "full",
      waiverSigned: true,
    })
    .returning();

  const depositPaymentIntentId = `pi_dep_${suffix}`;
  const [team] = await db
    .insert(teamRegistrations)
    .values({
      organizationId: org.id,
      seasonId: season.id,
      captainUserId: captain.id,
      captainEmail,
      captainName: `Team ${captainLastName}`,
      teamName: `Deposit FC ${suffix}`,
      inviteToken: `tok-${suffix}`,
      status: "forming",
      teamFeeCents: TEAM_FEE_CENTS,
      depositCents: DEPOSIT_CENTS,
      depositPaymentIntentId,
      backstopStatus: "none",
    })
    .returning();

  const [depositPayment] = await db
    .insert(payments)
    .values({
      registrationId: null,
      teamRegistrationId: team.id,
      userId: captain.id,
      amountCents: DEPOSIT_CENTS,
      paymentType: "deposit",
      status: "succeeded",
      stripePaymentIntentId: depositPaymentIntentId,
    })
    .returning();
  const [balancePayment] = await db
    .insert(payments)
    .values({
      registrationId: null,
      teamRegistrationId: team.id,
      userId: captain.id,
      amountCents: BALANCE_CENTS,
      paymentType: "balance",
      status: "succeeded",
      stripePaymentIntentId: `pi_bal_${suffix}`,
    })
    .returning();
  const [refundPayment] = await db
    .insert(payments)
    .values({
      registrationId: null,
      teamRegistrationId: team.id,
      userId: captain.id,
      amountCents: REFUND_CENTS,
      paymentType: "refund",
      status: "succeeded",
      stripePaymentIntentId: `pi_ref_${suffix}`,
    })
    .returning();

  await db
    .update(teamRegistrations)
    .set({ depositPaymentId: depositPayment.id })
    .where(eq(teamRegistrations.id, team.id));

  await db.insert(teamRegistrationMembers).values({
    teamRegistrationId: team.id,
    registrationId: captainRegistration.id,
    role: "captain",
  });

  await db.insert(teamInvitees).values({
    teamRegistrationId: team.id,
    email: `mate-${suffix}@test.example`,
    assignedShareCents: PAID_SHARE_CENTS,
    status: "paid",
    paidAt: new Date(),
  });

  // Solo contrast registration in the same org/season.
  const [soloMember] = await db
    .insert(familyMembers)
    .values({
      parentUserId: captain.id,
      firstName: "Solo",
      lastName: captainLastName,
      birthDate: "1996-01-01",
    })
    .returning();
  const [soloRegistration] = await db
    .insert(registrations)
    .values({
      seasonId: season.id,
      familyMemberId: soloMember.id,
      registeredByUserId: captain.id,
      status: "confirmed",
      paymentStatus: "paid",
      amountPaidCents: 12000,
      amountDueCents: 12000,
      registrationType: "full",
      waiverSigned: true,
    })
    .returning();
  const [soloPayment] = await db
    .insert(payments)
    .values({
      registrationId: soloRegistration.id,
      userId: captain.id,
      amountCents: 12000,
      paymentType: "full",
      status: "succeeded",
      stripePaymentIntentId: `pi_solo_${suffix}`,
    })
    .returning();

  return {
    suffix,
    organizationId: org.id,
    captainUserId: captain.id,
    captainEmail,
    captainLastName,
    seasonId: season.id,
    seasonName: season.name,
    programName: program.name,
    teamRegistrationId: team.id,
    teamName: team.teamName,
    captainRegistrationId: captainRegistration.id,
    depositPaymentId: depositPayment.id,
    depositPaymentIntentId,
    balancePaymentId: balancePayment.id,
    refundPaymentId: refundPayment.id,
    soloRegistrationId: soloRegistration.id,
    soloPaymentId: soloPayment.id,
  };
}
