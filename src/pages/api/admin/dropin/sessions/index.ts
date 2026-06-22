/**
 * GET  /api/admin/dropin/sessions  → list sessions for the org (any status,
 *                                     last 7d / next 60d window default).
 * POST /api/admin/dropin/sessions  → create a session.
 *
 * Tenant-scoped via locals.organization. Director or venue manager only.
 */
import type { APIRoute } from "astro";
import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { venueResources } from "@/lib/db/schema/scheduling";
import { syncDropInSessionBlock } from "@/lib/scheduling/sync";
import { BlockConflictError } from "@/lib/scheduling/blocks";
import { venues } from "@/lib/db/schema/teams";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { getEffectiveLocationIds } from "@/lib/admin/active-venue";
import { venueLocationCondition } from "@/lib/admin/location-scope-filter";
import { callerCanActOnVenue } from "@/lib/admin/require-location-scope";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const url = context.url;
  const fromIso = url.searchParams.get("from");
  const toIso = url.searchParams.get("to");
  const now = new Date();
  const from = fromIso
    ? new Date(fromIso)
    : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const to = toIso
    ? new Date(toIso)
    : new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const locIds = await getEffectiveLocationIds({
    userId: context.locals.user!.id,
    userRoles: context.locals.userRoles ?? [],
    activeLocationId: context.locals.activeLocationId ?? null,
  });
  const scopeCond = venueLocationCondition(locIds);

  const db = getDb();
  const rows = await db
    .select({
      id: dropInSessions.id,
      kind: dropInSessions.kind,
      sportOrClassLabel: dropInSessions.sportOrClassLabel,
      formatLabel: dropInSessions.formatLabel,
      startsAt: dropInSessions.startsAt,
      endsAt: dropInSessions.endsAt,
      capacity: dropInSessions.capacity,
      status: dropInSessions.status,
      venueId: dropInSessions.venueId,
      venueName: venues.name,
      confirmedCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${dropInBookings}
        WHERE ${dropInBookings.sessionId} = ${dropInSessions.id}
          AND ${dropInBookings.status} = 'confirmed'
      )`,
      waitlistCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${dropInBookings}
        WHERE ${dropInBookings.sessionId} = ${dropInSessions.id}
          AND ${dropInBookings.status} IN ('waitlisted', 'pending_claim')
      )`,
    })
    .from(dropInSessions)
    .leftJoin(venues, eq(venues.id, dropInSessions.venueId))
    .where(
      and(
        eq(dropInSessions.organizationId, orgId),
        gte(dropInSessions.startsAt, from),
        lte(dropInSessions.startsAt, to),
        scopeCond,
      ),
    )
    .orderBy(asc(dropInSessions.startsAt));

  return json({ sessions: rows }, 200);
};

interface CreateBody {
  venueId: string;
  /** Which field the session occupies — feeds the field-time ledger. */
  bookableResourceId?: string;
  kind: "pickup" | "class";
  sportOrClassLabel: string;
  formatLabel?: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  capacityMale?: number | null;
  capacityFemale?: number | null;
  skillLevel?: "recreational" | "intermediate" | "advanced" | "all_levels";
  audience?: "adults" | "youth" | "all_ages";
  membersOnly?: boolean;
  sessionRateCents?: number | null;
  memberRateCents?: number | null;
  walkUpRateCents?: number | null;
  teamCount?: number;
  teamColors?: string[];
}

// POST is location-scoped: a venue manager can only create sessions at a venue
// in their assigned locations (super-admin is unscoped). Enforced after the
// venue tenant guard below via callerCanActOnVenue.
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  let body: CreateBody;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (
    !body.venueId ||
    !body.kind ||
    !body.sportOrClassLabel ||
    !body.startsAt ||
    !body.endsAt ||
    !Number.isInteger(body.capacity) ||
    body.capacity < 1
  ) {
    return json({ error: "Missing or invalid fields" }, 400);
  }

  const db = getDb();

  // Tenant guard for the venue.
  const [venue] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.id, body.venueId))
    .limit(1);
  if (!venue) return json({ error: "Venue not found" }, 404);
  if (!(await callerCanActOnVenue(context, body.venueId))) {
    return json({ error: "Venue not found" }, 404);
  }

  // Field attribution: the ledger tracks per field. Default to the
  // venue's Field 1 when omitted so existing admin clients keep working
  // until the field picker ships (chunk 3).
  let resourceId = body.bookableResourceId ?? null;
  if (resourceId) {
    const [res] = await db
      .select({ id: venueResources.id })
      .from(venueResources)
      .where(
        and(
          eq(venueResources.id, resourceId),
          eq(venueResources.venueId, body.venueId),
        ),
      )
      .limit(1);
    if (!res) return json({ error: "Field not found at this venue" }, 404);
  } else {
    const [res] = await db
      .select({ id: venueResources.id })
      .from(venueResources)
      .where(
        and(
          eq(venueResources.venueId, body.venueId),
          eq(venueResources.fieldNumber, 1),
          isNull(venueResources.parentResourceId),
        ),
      )
      .limit(1);
    resourceId = res?.id ?? null;
  }

  const [created] = await db
    .insert(dropInSessions)
    .values({
      organizationId: orgId,
      venueId: body.venueId,
      kind: body.kind,
      sportOrClassLabel: body.sportOrClassLabel,
      formatLabel: body.formatLabel ?? null,
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      capacity: body.capacity,
      capacityMale: body.capacityMale ?? null,
      capacityFemale: body.capacityFemale ?? null,
      skillLevel: body.skillLevel ?? "all_levels",
      audience: body.audience ?? "adults",
      membersOnly: body.membersOnly ?? false,
      sessionRateCents: body.sessionRateCents ?? null,
      memberRateCents: body.memberRateCents ?? null,
      walkUpRateCents: body.walkUpRateCents ?? null,
      teamCount: body.teamCount ?? 0,
      teamColors: body.teamColors ?? [],
      bookableResourceId: resourceId,
      createdByUserId: auth.user.id,
    })
    .returning();

  // Claim the slot in the field-time ledger. Conflict → 409 with the
  // blocking label; the session row stays so the admin can move it.
  try {
    await syncDropInSessionBlock(created.id);
  } catch (err) {
    if (err instanceof BlockConflictError) {
      return json({ session: created, warning: err.message }, 409);
    }
    throw err;
  }

  return json({ session: created }, 201);
};
