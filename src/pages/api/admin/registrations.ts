import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  registrations,
  familyMembers,
  seasons,
  programs,
  sports,
  users,
  teamRegistrations,
  teamRegistrationMembers,
  teamInvitees,
} from "@/lib/db/schema";
import { locations } from "@/lib/db/schema/organizations";
import { eq, and, desc, or, ilike, sql, inArray } from "drizzle-orm";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { teamCollectedCents } from "@/lib/registrations/captain-credit";

/**
 * Team financial context for registrations that belong to a team
 * registration. A team member's own row is $0/$0 when the captain's deposit
 * covers it, which reads as a free registration in admin (#525) — so the
 * list attaches the team's money state (fee, deposit, collected so far)
 * to every member row.
 */
async function teamBlocksByRegistrationId(
  registrationIds: string[],
): Promise<
  Map<
    string,
    {
      id: string;
      teamName: string;
      teamFeeCents: number | null;
      depositCents: number;
      collectedCents: number;
    }
  >
> {
  const result = new Map();
  if (registrationIds.length === 0) return result;

  const memberships = await getDb()
    .select({
      registrationId: teamRegistrationMembers.registrationId,
      team: teamRegistrations,
    })
    .from(teamRegistrationMembers)
    .innerJoin(
      teamRegistrations,
      eq(teamRegistrationMembers.teamRegistrationId, teamRegistrations.id),
    )
    .where(inArray(teamRegistrationMembers.registrationId, registrationIds));
  if (memberships.length === 0) return result;

  const teamIds = [...new Set(memberships.map((m) => m.team.id))];
  const invitees = await getDb()
    .select({
      teamRegistrationId: teamInvitees.teamRegistrationId,
      email: teamInvitees.email,
      assignedShareCents: teamInvitees.assignedShareCents,
      status: teamInvitees.status,
    })
    .from(teamInvitees)
    .where(inArray(teamInvitees.teamRegistrationId, teamIds));

  const inviteesByTeam = new Map<string, typeof invitees>();
  for (const inv of invitees) {
    const list = inviteesByTeam.get(inv.teamRegistrationId) ?? [];
    list.push(inv);
    inviteesByTeam.set(inv.teamRegistrationId, list);
  }

  for (const { registrationId, team } of memberships) {
    const depositCents = team.depositCents ?? 0;
    const captainEmailLower = team.captainEmail.toLowerCase();
    const collectedCents = teamCollectedCents({
      depositCents,
      invitees: (inviteesByTeam.get(team.id) ?? []).map((i) => ({
        assignedShareCents: i.assignedShareCents,
        status: i.status,
        isCaptain: i.email.toLowerCase() === captainEmailLower,
      })),
    });
    result.set(registrationId, {
      id: team.id,
      teamName: team.teamName,
      teamFeeCents: team.teamFeeCents ?? null,
      depositCents,
      collectedCents,
    });
  }
  return result;
}

// GET - List all registrations with filters
export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const db = getDb();

    const url = new URL(context.request.url);
    const status = url.searchParams.get("status");
    const paymentStatus = url.searchParams.get("paymentStatus");
    const seasonId = url.searchParams.get("seasonId");
    const search = url.searchParams.get("search");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Build conditions — always scope to caller's org via locations join
    const conditions = [eq(locations.organizationId, orgContext.organizationId)];

    if (status && status !== "all") {
      conditions.push(eq(registrations.status, status as any));
    }

    if (paymentStatus && paymentStatus !== "all") {
      conditions.push(eq(registrations.paymentStatus, paymentStatus as any));
    }

    if (seasonId) {
      conditions.push(eq(registrations.seasonId, seasonId));
    }

    // Search on player name or parent name/email — in the WHERE clause,
    // not post-fetch: filtering in JS after LIMIT both wasted the fetch
    // and silently dropped matches beyond the first page.
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(familyMembers.firstName, pattern),
          ilike(familyMembers.lastName, pattern),
          ilike(users.email, pattern),
          ilike(users.firstName, pattern),
          ilike(users.lastName, pattern),
        )!,
      );
    }

    // Registration listing and summary counts are independent of each
    // other — run in parallel.
    const [registrationData, summaryResult] = await Promise.all([
      getDb()
        .select({
          id: registrations.id,
          status: registrations.status,
          paymentStatus: registrations.paymentStatus,
          amountPaidCents: registrations.amountPaidCents,
          amountDueCents: registrations.amountDueCents,
          registrationType: registrations.registrationType,
          waiverSigned: registrations.waiverSigned,
          ageReviewNeeded: registrations.ageReviewNeeded,
          waitlistPosition: registrations.waitlistPosition,
          createdAt: registrations.createdAt,
          cancelledAt: registrations.cancelledAt,
          familyMember: {
            id: familyMembers.id,
            firstName: familyMembers.firstName,
            lastName: familyMembers.lastName,
          },
          season: {
            id: seasons.id,
            name: seasons.name,
          },
          program: {
            id: programs.id,
            name: programs.name,
          },
          sport: {
            id: sports.id,
            name: sports.name,
          },
          registeredBy: {
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
          },
        })
        .from(registrations)
        .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
        .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .innerJoin(sports, eq(programs.sportId, sports.id))
        .innerJoin(users, eq(registrations.registeredByUserId, users.id))
        .where(and(...conditions))
        .orderBy(desc(registrations.createdAt))
        .limit(limit)
        .offset(offset),

      // Summary counts — also org-scoped
      getDb()
        .select({
          total: sql<number>`COUNT(*)`,
          confirmed: sql<number>`COUNT(*) FILTER (WHERE ${registrations.status} = 'confirmed')`,
          pending: sql<number>`COUNT(*) FILTER (WHERE ${registrations.status} = 'pending')`,
          waitlisted: sql<number>`COUNT(*) FILTER (WHERE ${registrations.status} = 'waitlisted')`,
          cancelled: sql<number>`COUNT(*) FILTER (WHERE ${registrations.status} = 'cancelled')`,
          paid: sql<number>`COUNT(*) FILTER (WHERE ${registrations.paymentStatus} = 'paid')`,
          unpaid: sql<number>`COUNT(*) FILTER (WHERE ${registrations.paymentStatus} = 'unpaid')`,
          partial: sql<number>`COUNT(*) FILTER (WHERE ${registrations.paymentStatus} = 'deposit_paid')`,
        })
        .from(registrations)
        .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(eq(locations.organizationId, orgContext.organizationId)),
    ]);

    const teamBlocks = await teamBlocksByRegistrationId(
      registrationData.map((r) => r.id),
    );
    const registrationsWithTeam = registrationData.map((r) => ({
      ...r,
      team: teamBlocks.get(r.id) ?? null,
    }));

    return new Response(
      JSON.stringify({
        registrations: registrationsWithTeam,
        summary: summaryResult[0],
        pagination: {
          limit,
          offset,
          hasMore: registrationData.length === limit,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching registrations:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch registrations" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
