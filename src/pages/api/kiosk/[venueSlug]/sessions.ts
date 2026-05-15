/**
 * GET /api/kiosk/[venueSlug]/sessions
 *
 * Returns today's scheduled drop-in sessions at this venue with computed
 * available capacity (capacity minus confirmed bookings).
 */
import type { APIRoute } from "astro";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { requireKioskVenue } from "@/lib/check-in/kiosk-auth";

export const prerender = false;

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ params }) => {
  const slug = params.venueSlug;
  if (!slug) return json({ error: "venueSlug required" }, 400);

  const k = await requireKioskVenue(slug);
  if (!k.ok) return k.response;

  const now = new Date();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);

  const sessions = await getDb()
    .select({
      id: dropInSessions.id,
      startsAt: dropInSessions.startsAt,
      endsAt: dropInSessions.endsAt,
      title: dropInSessions.sportOrClassLabel,
      format: dropInSessions.formatLabel,
      capacity: dropInSessions.capacity,
      sessionRateCents: dropInSessions.sessionRateCents,
    })
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.venueId, k.venue.id),
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
      })),
    },
    200,
  );
};
