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

    const userPayments = await getDb()
      .select({
        payment: payments,
        registration: registrations,
        familyMember: familyMembers,
        season: seasons,
        program: programs,
        sport: sports,
        team: teamRegistrations,
      })
      .from(payments)
      // A payment is tied to a solo registration OR a team registration
      // (captain deposit / backstop balance — #525). Both resolve a season
      // via COALESCE; the inner seasons join keeps orphaned rows out.
      .leftJoin(registrations, eq(payments.registrationId, registrations.id))
      .leftJoin(
        teamRegistrations,
        eq(payments.teamRegistrationId, teamRegistrations.id),
      )
      .leftJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(
        seasons,
        sql`${seasons.id} = COALESCE(${registrations.seasonId}, ${teamRegistrations.seasonId})`,
      )
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
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
      season: {
        name: p.season.name,
      },
      program: {
        name: p.program.name,
      },
      sport: {
        name: p.sport.name,
        icon: p.sport.icon,
        color: p.sport.color,
      },
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
