import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import {
  teamRegistrations,
  teamRegistrationMembers,
  seasons,
  programs,
  sports,
  locations,
  registrations,
  familyMembers,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Resolve a team by its invite token. Used by the team landing page so
 * joining players see what they're signing up for, and by the captain
 * status view to see who has joined.
 */
export const GET: APIRoute = async ({ params, locals }) => {
  const token = params.token;
  if (!token) {
    return new Response(
      JSON.stringify({ error: "Missing token" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!db) {
    return new Response(
      JSON.stringify({ error: "Database unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const teamRow = await db
      .select({
        team: teamRegistrations,
        season: seasons,
        program: programs,
        sport: sports,
        location: locations,
      })
      .from(teamRegistrations)
      .innerJoin(seasons, eq(teamRegistrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(eq(teamRegistrations.inviteToken, token))
      .limit(1);

    if (teamRow.length === 0) {
      return new Response(
        JSON.stringify({ error: "Team not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const t = teamRow[0]!;

    // Cross-tenant guard: 404 (not 403) — hides existence of cross-tenant rows.
    // Consistent with the seasons/[id] precedent (Task 6).
    const organization = locals.organization;
    if (!organization || t.team.organizationId !== organization.id) {
      return new Response(
        JSON.stringify({ error: "Not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Pull confirmed members + their registration status (no PII beyond first name + last initial).
    const members = await db
      .select({
        memberId: teamRegistrationMembers.id,
        role: teamRegistrationMembers.role,
        joinedAt: teamRegistrationMembers.joinedAt,
        registrationStatus: registrations.status,
        paymentStatus: registrations.paymentStatus,
        firstName: familyMembers.firstName,
        lastName: familyMembers.lastName,
      })
      .from(teamRegistrationMembers)
      .innerJoin(
        registrations,
        eq(teamRegistrationMembers.registrationId, registrations.id),
      )
      .innerJoin(
        familyMembers,
        eq(registrations.familyMemberId, familyMembers.id),
      )
      .where(eq(teamRegistrationMembers.teamRegistrationId, t.team.id));

    return new Response(
      JSON.stringify({
        team: {
          id: t.team.id,
          teamName: t.team.teamName,
          captainName: t.team.captainName,
          status: t.team.status,
          createdAt: t.team.createdAt,
          memberCount: members.length,
          members: members.map((m) => ({
            firstName: m.firstName,
            lastInitial: m.lastName ? m.lastName[0] : null,
            role: m.role,
            registrationStatus: m.registrationStatus,
            paymentStatus: m.paymentStatus,
          })),
        },
        season: {
          id: t.season.id,
          name: t.season.name,
          slug: t.season.slug,
          startDate: t.season.startDate,
          endDate: t.season.endDate,
          price: t.season.priceCents / 100,
          maxParticipants: t.season.maxParticipants,
        },
        program: {
          id: t.program.id,
          name: t.program.name,
        },
        sport: {
          id: t.sport.id,
          name: t.sport.name,
          slug: t.sport.slug,
        },
        location: {
          id: t.location.id,
          name: t.location.name,
          slug: t.location.slug,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[team-registrations/[token]] fetch failed", err);
    return new Response(
      JSON.stringify({ error: "Could not load team" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
