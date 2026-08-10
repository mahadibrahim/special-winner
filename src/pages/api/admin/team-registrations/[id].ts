import type { APIRoute } from "astro";
import { asc, desc, eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  teamRegistrations,
  teamRegistrationMembers,
  teamInvitees,
  registrations,
  familyMembers,
  payments,
  users,
  seasons,
  programs,
  sports,
  locations,
} from "@/lib/db/schema";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { teamCollectedCents } from "@/lib/registrations/captain-credit";

/**
 * GET /api/admin/team-registrations/[id] — admin drill-down for one team
 * registration (#532): the internal destination for a team-level payment
 * row. Read-only: team header, money state, team-level payment rows,
 * invitees with share status, and member registrations.
 *
 * Tenant scoped directly on teamRegistrations.organizationId (unlike the
 * per-registration endpoints, no join chain is needed) — 404 for another
 * org's team, indistinguishable from not-found.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Team registration ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const [row] = await getDb()
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
      .where(
        and(
          eq(teamRegistrations.id, id),
          eq(teamRegistrations.organizationId, orgContext.organizationId),
        ),
      )
      .limit(1);

    if (!row) {
      return new Response(JSON.stringify({ error: "Team registration not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const team = row.team;

    const [paymentRows, inviteeRows, memberRows] = await Promise.all([
      getDb()
        .select({
          id: payments.id,
          amountCents: payments.amountCents,
          paymentType: payments.paymentType,
          status: payments.status,
          stripePaymentIntentId: payments.stripePaymentIntentId,
          createdAt: payments.createdAt,
          payer: {
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
          },
        })
        .from(payments)
        .innerJoin(users, eq(payments.userId, users.id))
        .where(eq(payments.teamRegistrationId, id))
        .orderBy(desc(payments.createdAt)),
      getDb()
        .select({
          id: teamInvitees.id,
          email: teamInvitees.email,
          assignedShareCents: teamInvitees.assignedShareCents,
          status: teamInvitees.status,
          invitedAt: teamInvitees.invitedAt,
          paidAt: teamInvitees.paidAt,
        })
        .from(teamInvitees)
        .where(eq(teamInvitees.teamRegistrationId, id))
        .orderBy(asc(teamInvitees.invitedAt)),
      getDb()
        .select({
          registrationId: teamRegistrationMembers.registrationId,
          role: teamRegistrationMembers.role,
          joinedAt: teamRegistrationMembers.joinedAt,
          registrationStatus: registrations.status,
          paymentStatus: registrations.paymentStatus,
          waiverSigned: registrations.waiverSigned,
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
        .where(eq(teamRegistrationMembers.teamRegistrationId, id))
        .orderBy(asc(teamRegistrationMembers.joinedAt)),
    ]);

    const depositCents = team.depositCents ?? 0;
    const captainEmailLower = team.captainEmail.toLowerCase();
    const collectedCents = teamCollectedCents({
      depositCents,
      invitees: inviteeRows.map((i) => ({
        assignedShareCents: i.assignedShareCents,
        status: i.status,
        isCaptain: i.email.toLowerCase() === captainEmailLower,
      })),
    });

    return new Response(
      JSON.stringify({
        team: {
          id: team.id,
          teamName: team.teamName,
          status: team.status,
          captainName: team.captainName,
          captainEmail: team.captainEmail,
          backstopStatus: team.backstopStatus,
          paymentDeadline: team.paymentDeadline,
          createdAt: team.createdAt,
        },
        season: { id: row.season.id, name: row.season.name },
        program: { id: row.program.id, name: row.program.name },
        sport: { id: row.sport.id, name: row.sport.name },
        location: { id: row.location.id, name: row.location.name },
        money: {
          teamFeeCents: team.teamFeeCents ?? null,
          depositCents,
          discountCents: team.discountCents ?? null,
          collectedCents,
        },
        payments: paymentRows,
        invitees: inviteeRows,
        members: memberRows,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error fetching team registration detail:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
