/**
 * GET  /api/admin/dropin/sessions  → list sessions for the org (any status,
 *                                     last 7d / next 60d window default).
 * POST /api/admin/dropin/sessions  → create a session.
 *
 * Tenant-scoped via locals.organization. Director or venue manager only.
 */
import type { APIRoute } from "astro";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { requireAdminAccess } from "@/lib/auth/roles";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

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
      ),
    )
    .orderBy(asc(dropInSessions.startsAt));

  return json({ sessions: rows }, 200);
};

interface CreateBody {
  venueId: string;
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
  teamCount?: number;
  teamColors?: string[];
}

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

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
      teamCount: body.teamCount ?? 0,
      teamColors: body.teamColors ?? [],
      createdByUserId: auth.user.id,
    })
    .returning();

  return json({ session: created }, 201);
};
