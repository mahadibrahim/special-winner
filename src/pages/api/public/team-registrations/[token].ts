import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import {
  teamRegistrations,
  teamRegistrationMembers,
  teamInvitees,
  seasons,
  programs,
  sports,
  locations,
  registrations,
  familyMembers,
} from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

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

    // Members and invitees are independent reads, both scoped by
    // t.team.id — fetch concurrently.
    const [members, invitees] = await Promise.all([
      // Pull confirmed members + their registration status (no PII beyond first name + last initial).
      db
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
        .where(eq(teamRegistrationMembers.teamRegistrationId, t.team.id)),
      // Invitees: captain-assigned shares + their pay status. Surfaced so the
      // captain status view (and the API test) can see who was invited, for how
      // much, and whether they've paid.
      db
        .select({
          email: teamInvitees.email,
          assignedShareCents: teamInvitees.assignedShareCents,
          status: teamInvitees.status,
          invitedAt: teamInvitees.invitedAt,
          paidAt: teamInvitees.paidAt,
        })
        .from(teamInvitees)
        .where(eq(teamInvitees.teamRegistrationId, t.team.id))
        .orderBy(asc(teamInvitees.invitedAt)),
    ]);

    // Live payment summary for the captain tracker: deposit + sum of paid
    // teammate shares, against the full team fee. Computed server-side so the
    // client never has to trust/replay status logic.
    const depositCents = t.team.depositCents ?? 0;
    const collectedCents =
      depositCents +
      invitees.reduce(
        (sum, i) =>
          i.status === "paid" ? sum + (i.assignedShareCents ?? 0) : sum,
        0,
      );

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
          inviteeCount: invitees.length,
          invitees: invitees.map((i) => ({
            email: i.email,
            assignedShareCents: i.assignedShareCents,
            status: i.status,
            paidAt: i.paidAt,
          })),
        },
        payment: {
          teamFeeCents: t.team.teamFeeCents ?? null,
          depositCents,
          collectedCents,
          invitees: invitees.map((i) => ({
            email: i.email,
            assignedShareCents: i.assignedShareCents,
            status: i.status,
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
