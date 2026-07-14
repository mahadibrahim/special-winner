/**
 * GET /api/kiosk/[locationSlug]/sessions
 *
 * Returns today's (local facility day — see dayBoundsInTz) scheduled
 * drop-in sessions across every space in this facility with computed
 * available capacity (capacity minus confirmed bookings).
 */
import type { APIRoute } from "astro";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { requireKioskLocation } from "@/lib/check-in/kiosk-auth";
import { dayBoundsInTz } from "@/lib/time/day-bounds";

export const prerender = false;

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ params }) => {
  const slug = params.locationSlug;
  if (!slug) return json({ error: "locationSlug required" }, 400);

  const k = await requireKioskLocation(slug);
  if (!k.ok) return k.response;

  // "Today" means today *at the facility* — see dayBoundsInTz. Using UTC
  // bounds here dropped evening sessions after 8pm Eastern.
  const tz = k.location.timezone ?? "America/New_York";
  const { start: dayStart, end: dayEnd } = dayBoundsInTz(tz);

  const sessions = await getDb()
    .select({
      id: dropInSessions.id,
      startsAt: dropInSessions.startsAt,
      endsAt: dropInSessions.endsAt,
      title: dropInSessions.sportOrClassLabel,
      format: dropInSessions.formatLabel,
      capacity: dropInSessions.capacity,
      sessionRateCents: dropInSessions.sessionRateCents,
      spaceName: venues.name,
    })
    .from(dropInSessions)
    .innerJoin(venues, eq(venues.id, dropInSessions.venueId))
    .where(
      and(
        eq(venues.locationId, k.location.id),
        eq(dropInSessions.status, "scheduled"),
        gte(dropInSessions.startsAt, dayStart),
        lt(dropInSessions.startsAt, dayEnd),
      ),
    )
    .orderBy(dropInSessions.startsAt);

  const ids = sessions.map((s) => s.id);
  const counts =
    ids.length > 0
      ? await getDb()
          .select({
            sessionId: dropInBookings.sessionId,
            n: sql<number>`count(*)::int`,
          })
          .from(dropInBookings)
          .where(
            and(
              inArray(dropInBookings.sessionId, ids),
              eq(dropInBookings.status, "confirmed"),
            ),
          )
          .groupBy(dropInBookings.sessionId)
      : [];

  const taken = (sessionId: string) =>
    counts.find((c) => c.sessionId === sessionId)?.n ?? 0;

  return json(
    {
      sessions: sessions.map((s) => ({
        id: s.id,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        title: s.title,
        format: s.format,
        capacity: s.capacity,
        booked: taken(s.id),
        available: Math.max(0, s.capacity - taken(s.id)),
        sessionRateCents: s.sessionRateCents,
        spaceName: s.spaceName,
      })),
    },
    200,
  );
};
