import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { payments, registrations, familyMembers, seasons, programs, sports } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const GET: APIRoute = async ({ locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userPayments = await db
      .select({
        payment: payments,
        registration: registrations,
        familyMember: familyMembers,
        season: seasons,
        program: programs,
        sport: sports,
      })
      .from(payments)
      .innerJoin(registrations, eq(payments.registrationId, registrations.id))
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
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
      familyMember: {
        firstName: p.familyMember.firstName,
        lastName: p.familyMember.lastName,
      },
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
