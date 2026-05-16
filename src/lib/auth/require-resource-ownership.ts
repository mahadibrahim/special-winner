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
import { eq, and } from "drizzle-orm";
import {
  programs,
  seasons,
  sports,
  registrations,
  teams,
} from "@/lib/db/schema";
import { locations } from "@/lib/db/schema/organizations";
import { venues } from "@/lib/db/schema/teams";
import { conversations } from "@/lib/db/schema/conversations";

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
