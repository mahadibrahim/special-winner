import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  payments,
  registrations,
  familyMembers,
  seasons,
  programs,
  sports,
  teamRegistrations,
  memberships,
  membershipTiers,
} from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export const GET: APIRoute = async ({ locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    const userPayments = await db
      .select({
        payment: payments,
        registration: registrations,
        familyMember: familyMembers,
        season: seasons,
        program: programs,
        sport: sports,
        team: teamRegistrations,
        membership: memberships,
        membershipTier: membershipTiers,
      })
      .from(payments)
      // A payment is tied to a solo registration, a team registration
      // (captain deposit / backstop balance — #525), OR a class-membership
      // subscription invoice (paymentType "membership", no registration at
      // all — see src/lib/memberships/invoice-ledger.ts's handleInvoicePaid).
      // The season/program/sport chain only exists for the first two, so
      // EVERY join below is a LEFT join: an INNER join on seasons silently
      // dropped every membership payment row (F1 finding), because
      // COALESCE(registrations.seasonId, teamRegistrations.seasonId) is NULL
      // for a membership-only payment.
      .leftJoin(registrations, eq(payments.registrationId, registrations.id))
      .leftJoin(
        teamRegistrations,
        eq(payments.teamRegistrationId, teamRegistrations.id),
      )
      .leftJoin(memberships, eq(payments.membershipId, memberships.id))
      .leftJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      // familyMember resolves off whichever side actually has one: a solo
      // registration's familyMemberId, or (for membership rows, which carry
      // no registration) the membership's own familyMemberId.
      .leftJoin(
        familyMembers,
        sql`${familyMembers.id} = COALESCE(${registrations.familyMemberId}, ${memberships.familyMemberId})`,
      )
      .leftJoin(
        seasons,
        sql`${seasons.id} = COALESCE(${registrations.seasonId}, ${teamRegistrations.seasonId})`,
      )
      .leftJoin(programs, eq(seasons.programId, programs.id))
      .leftJoin(sports, eq(programs.sportId, sports.id))
      .where(eq(payments.userId, user.id))
      .orderBy(desc(payments.createdAt));

    const formatted = userPayments.map((p) => ({
      id: p.payment.id,
      amount: p.payment.amountCents / 100,
      amountCents: p.payment.amountCents,
      paymentType: p.payment.paymentType,
      status: p.payment.status,
      createdAt: p.payment.createdAt,
      stripePaymentIntentId: p.payment.stripePaymentIntentId,
      familyMember: p.familyMember
        ? {
            firstName: p.familyMember.firstName,
            lastName: p.familyMember.lastName,
          }
        : null,
      team: p.team ? { name: p.team.teamName } : null,
      // Null for class-membership subscription charges (invoice.paid rows —
      // no registration, so no season/program/sport chain). Consumers must
      // treat this as optional and fall back to `membership.tierName` below.
      season: p.season ? { name: p.season.name } : null,
      program: p.program ? { name: p.program.name } : null,
      sport: p.sport
        ? {
            name: p.sport.name,
            icon: p.sport.icon,
            color: p.sport.color,
          }
        : null,
      // Present for membership-subscription rows (paymentType "membership").
      // Still nullable even then: `payments.membershipId` is ON DELETE SET
      // NULL, so a since-deleted membership leaves this null on an
      // otherwise-untouched historical payment row.
      membership: p.membershipTier ? { tierName: p.membershipTier.name } : null,
    }));

    return new Response(JSON.stringify({ payments: formatted }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching payment history:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
