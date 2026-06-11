/**
 * Resource ownership helpers for multi-tenant authorization.
 *
 * Each helper verifies that a client-supplied resource id (e.g. a programId
 * posted in a request body) belongs to the caller's organization. This closes
 * the cross-tenant data leak where Org-A admin can read/write Org-B rows just
 * by posting their ids.
 *
 * Return contract (consistent across all helpers):
 *   - { ok: true, row }       — resource exists and belongs to orgId
 *   - { ok: false, status: 404 } — resource missing OR belongs to another org
 *
 * Callers should treat 404 as "not yours" (deliberately conflated with "not
 * found" to avoid leaking existence of cross-tenant rows). The `row` field
 * contains the joined row used for the lookup; helpers always include the
 * resource id so callers can use it without an extra query.
 */
import { getDb } from "@/lib/db";
import { eq, and, or, inArray } from "drizzle-orm";
import {
  programs,
  seasons,
  sports,
  registrations,
  teams,
  games,
  userRoles,
} from "@/lib/db/schema";
import { locations, userOrganizationAccess } from "@/lib/db/schema/organizations";
import { venues } from "@/lib/db/schema/teams";
import { conversations } from "@/lib/db/schema/conversations";
import { shootSessions } from "@/lib/db/schema/media";

export type OwnershipResult<T> =
  | { ok: true; row: T }
  | { ok: false; status: 404 };

const NOT_FOUND = { ok: false as const, status: 404 as const };

/**
 * programs.locationId -> locations.organizationId
 */
export async function requireSameOrgProgram(
  orgId: string,
  programId: string,
): Promise<OwnershipResult<{ id: string; locationId: string; organizationId: string }>> {
  const [row] = await getDb()
    .select({
      id: programs.id,
      locationId: programs.locationId,
      organizationId: locations.organizationId,
    })
    .from(programs)
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(and(eq(programs.id, programId), eq(locations.organizationId, orgId)))
    .limit(1);

  if (!row) return NOT_FOUND;
  return { ok: true, row };
}

/**
 * seasons -> programs -> locations.organizationId
 */
export async function requireSameOrgSeason(
  orgId: string,
  seasonId: string,
): Promise<OwnershipResult<{ id: string; programId: string; organizationId: string }>> {
  const [row] = await getDb()
    .select({
      id: seasons.id,
      programId: seasons.programId,
      organizationId: locations.organizationId,
    })
    .from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(and(eq(seasons.id, seasonId), eq(locations.organizationId, orgId)))
    .limit(1);

  if (!row) return NOT_FOUND;
  return { ok: true, row };
}

/**
 * games -> seasons -> programs -> locations.organizationId
 */
export async function requireSameOrgGame(
  orgId: string,
  gameId: string,
): Promise<OwnershipResult<{ id: string; seasonId: string; organizationId: string }>> {
  const [row] = await getDb()
    .select({
      id: games.id,
      seasonId: games.seasonId,
      organizationId: locations.organizationId,
    })
    .from(games)
    .innerJoin(seasons, eq(games.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(and(eq(games.id, gameId), eq(locations.organizationId, orgId)))
    .limit(1);

  if (!row) return NOT_FOUND;
  return { ok: true, row };
}

/**
 * venues.locationId -> locations.organizationId
 */
export async function requireSameOrgVenue(
  orgId: string,
  venueId: string,
): Promise<OwnershipResult<{ id: string; locationId: string; organizationId: string }>> {
  const [row] = await getDb()
    .select({
      id: venues.id,
      locationId: venues.locationId,
      organizationId: locations.organizationId,
    })
    .from(venues)
    .innerJoin(locations, eq(venues.locationId, locations.id))
    .where(and(eq(venues.id, venueId), eq(locations.organizationId, orgId)))
    .limit(1);

  if (!row) return NOT_FOUND;
  return { ok: true, row };
}

/**
 * sports.organizationId — direct
 */
export async function requireSameOrgSport(
  orgId: string,
  sportId: string,
): Promise<OwnershipResult<{ id: string; organizationId: string }>> {
  const [row] = await getDb()
    .select({ id: sports.id, organizationId: sports.organizationId })
    .from(sports)
    .where(and(eq(sports.id, sportId), eq(sports.organizationId, orgId)))
    .limit(1);

  if (!row) return NOT_FOUND;
  return { ok: true, row };
}

/**
 * locations.organizationId — direct
 */
export async function requireSameOrgLocation(
  orgId: string,
  locationId: string,
): Promise<OwnershipResult<{ id: string; organizationId: string }>> {
  const [row] = await getDb()
    .select({ id: locations.id, organizationId: locations.organizationId })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.organizationId, orgId)))
    .limit(1);

  if (!row) return NOT_FOUND;
  return { ok: true, row };
}

/**
 * teams -> seasons -> programs -> locations.organizationId
 */
export async function requireSameOrgTeam(
  orgId: string,
  teamId: string,
): Promise<OwnershipResult<{ id: string; seasonId: string; organizationId: string }>> {
  const [row] = await getDb()
    .select({
      id: teams.id,
      seasonId: teams.seasonId,
      organizationId: locations.organizationId,
    })
    .from(teams)
    .innerJoin(seasons, eq(teams.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(and(eq(teams.id, teamId), eq(locations.organizationId, orgId)))
    .limit(1);

  if (!row) return NOT_FOUND;
  return { ok: true, row };
}

/**
 * registrations -> seasons -> programs -> locations.organizationId
 */
export async function requireSameOrgRegistration(
  orgId: string,
  registrationId: string,
): Promise<OwnershipResult<{ id: string; seasonId: string; organizationId: string }>> {
  const [row] = await getDb()
    .select({
      id: registrations.id,
      seasonId: registrations.seasonId,
      organizationId: locations.organizationId,
    })
    .from(registrations)
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(
      and(eq(registrations.id, registrationId), eq(locations.organizationId, orgId)),
    )
    .limit(1);

  if (!row) return NOT_FOUND;
  return { ok: true, row };
}

/**
 * conversations.organizationId — direct
 */
export async function requireSameOrgConversation(
  orgId: string,
  conversationId: string,
): Promise<OwnershipResult<{ id: string; organizationId: string; parentUserId: string }>> {
  const [row] = await getDb()
    .select({
      id: conversations.id,
      organizationId: conversations.organizationId,
      parentUserId: conversations.parentUserId,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.organizationId, orgId),
      ),
    )
    .limit(1);

  if (!row) return NOT_FOUND;
  return { ok: true, row };
}

/**
 * shootSessions.organizationId — direct
 */
export async function requireSameOrgShootSession(
  orgId: string,
  shootSessionId: string,
): Promise<OwnershipResult<typeof shootSessions.$inferSelect>> {
  const [row] = await getDb()
    .select()
    .from(shootSessions)
    .where(
      and(
        eq(shootSessions.id, shootSessionId),
        eq(shootSessions.organizationId, orgId),
      ),
    )
    .limit(1);

  if (!row) return NOT_FOUND;
  return { ok: true, row };
}

/**
 * Verify a target user is visible to the caller's org. Users are not
 * org-scoped at the schema level, so membership is reconstructed from
 * userRoles (org/location/program/team-scoped) plus userOrganizationAccess.
 * Matches the visibility model used by /api/admin/users.
 */
export async function requireUserInOrg(
  orgId: string,
  userId: string,
): Promise<OwnershipResult<{ userId: string }>> {
  const db = getDb();

  const [accessRow] = await db
    .select({ userId: userOrganizationAccess.userId })
    .from(userOrganizationAccess)
    .where(
      and(
        eq(userOrganizationAccess.userId, userId),
        eq(userOrganizationAccess.organizationId, orgId),
      ),
    )
    .limit(1);
  if (accessRow) return { ok: true, row: { userId } };

  const [orgRole] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.scopeType, "organization"),
        eq(userRoles.scopeId, orgId),
      ),
    )
    .limit(1);
  if (orgRole) return { ok: true, row: { userId } };

  const orgLocations = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.organizationId, orgId));
  const locationIds = orgLocations.map((l) => l.id);

  if (locationIds.length === 0) return NOT_FOUND;

  const orgPrograms = await db
    .select({ id: programs.id })
    .from(programs)
    .where(inArray(programs.locationId, locationIds));
  const programIds = orgPrograms.map((p) => p.id);

  const orgSeasons = programIds.length > 0
    ? await db
        .select({ id: seasons.id })
        .from(seasons)
        .where(inArray(seasons.programId, programIds))
    : [];
  const seasonIds = orgSeasons.map((s) => s.id);

  const orgTeams = seasonIds.length > 0
    ? await db
        .select({ id: teams.id })
        .from(teams)
        .where(inArray(teams.seasonId, seasonIds))
    : [];
  const teamIds = orgTeams.map((t) => t.id);

  const [scopedRole] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        or(
          and(eq(userRoles.scopeType, "location"), inArray(userRoles.scopeId, locationIds)),
          ...(programIds.length > 0
            ? [and(eq(userRoles.scopeType, "program"), inArray(userRoles.scopeId, programIds))]
            : []),
          ...(teamIds.length > 0
            ? [and(eq(userRoles.scopeType, "team"), inArray(userRoles.scopeId, teamIds))]
            : []),
        ),
      ),
    )
    .limit(1);
  if (scopedRole) return { ok: true, row: { userId } };

  return NOT_FOUND;
}

/**
 * Convenience: convert an ownership-failure result into a JSON 404 Response.
 */
export function ownershipDeniedResponse(): Response {
  return new Response(JSON.stringify({ error: "Resource not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Synchronous scope check for location_admin users. Pass the user's
 * allowed location IDs (from getLocationIdsForUser) plus the location
 * the resource lives at. Returns ok if the location is in the set.
 *
 * Use 404 (not 403) deliberately — conflates "not yours" with "not
 * found" to avoid leaking existence of cross-location rows.
 */
export type LocationOwnershipResult =
  | { ok: true; locationId: string }
  | { ok: false; status: 404 };

export function requireSameLocation(
  allowedLocationIds: string[],
  locationId: string,
): LocationOwnershipResult {
  if (allowedLocationIds.includes(locationId)) {
    return { ok: true, locationId };
  }
  return { ok: false, status: 404 };
}
