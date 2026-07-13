import type { APIRoute } from "astro";
import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { requireActiveHost } from "@/lib/auth/host";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * GET /api/host/games — the host dashboard feed.
 *   mine:      my hosted sessions from 4h ago onward (still-visible during play)
 *   claimable: unhosted upcoming pickup sessions, filtered to my preferred
 *              venue when the profile has one.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireActiveHost(context);
  if (!auth.authorized) return auth.response;

  const db = getDb();
  const confirmedCount = sql<number>`(
    SELECT COUNT(*)::int FROM ${dropInBookings}
    WHERE ${dropInBookings.sessionId} = ${dropInSessions.id}
      AND ${dropInBookings.status} IN ('confirmed', 'pending_payment', 'pending_claim')
  )`;
  const summary = {
    id: dropInSessions.id,
    sportOrClassLabel: dropInSessions.sportOrClassLabel,
    formatLabel: dropInSessions.formatLabel,
    startsAt: dropInSessions.startsAt,
    endsAt: dropInSessions.endsAt,
    capacity: dropInSessions.capacity,
    teamCount: dropInSessions.teamCount,
    teamColors: dropInSessions.teamColors,
    venueName: venues.name,
    confirmedCount,
  };

  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const mine = await db
    .select(summary)
    .from(dropInSessions)
    .leftJoin(venues, eq(venues.id, dropInSessions.venueId))
    .where(
      and(
        eq(dropInSessions.organizationId, auth.organizationId),
        eq(dropInSessions.hostUserId, auth.userId),
        eq(dropInSessions.status, "scheduled"),
        gte(dropInSessions.startsAt, fourHoursAgo),
      ),
    )
    .orderBy(asc(dropInSessions.startsAt));

  const claimableConds = [
    eq(dropInSessions.organizationId, auth.organizationId),
    eq(dropInSessions.kind, "pickup"),
    eq(dropInSessions.status, "scheduled"),
    isNull(dropInSessions.hostUserId),
    gte(dropInSessions.startsAt, new Date()),
  ];
  if (auth.profile.preferredVenueId) {
    claimableConds.push(eq(dropInSessions.venueId, auth.profile.preferredVenueId));
  }
  const claimable = await db
    .select(summary)
    .from(dropInSessions)
    .leftJoin(venues, eq(venues.id, dropInSessions.venueId))
    .where(and(...claimableConds))
    .orderBy(asc(dropInSessions.startsAt))
    .limit(25);

  return json({ mine, claimable }, 200);
};
