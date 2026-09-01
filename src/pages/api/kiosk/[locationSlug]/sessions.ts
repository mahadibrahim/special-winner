/**
 * GET /api/kiosk/[locationSlug]/sessions
 *
 * Returns today's (local facility day — see dayBoundsInTz) scheduled
 * drop-in sessions that HAVE NOT ENDED YET, across every space in this
 * facility, with computed available capacity (capacity minus confirmed
 * bookings). A finished session is not something a walk-in can pay to join.
 *
 * Class sessions (`kind='class'`) appear here too — the desk can walk a child
 * into one — but only when the session carries its own `sessionRateCents`.
 * An unpriced class has no honest price to offer at the kiosk; see the filter
 * below.
 */
import type { APIRoute } from "astro";
import { and, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { requireKioskLocation } from "@/lib/check-in/kiosk-auth";
import { reportClassRateNotConfigured } from "@/lib/classes/class-rate";
import { dayBoundsInTz } from "@/lib/time/day-bounds";

export const prerender = false;

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ params, locals }) => {
  const slug = params.locationSlug;
  if (!slug) return json({ error: "locationSlug required" }, 400);

  const k = await requireKioskLocation(slug, locals.organization?.id ?? null);
  if (!k.ok) return k.response;

  // "Today" means today *at the facility* — see dayBoundsInTz. Using UTC
  // bounds here dropped evening sessions after 8pm Eastern.
  const tz = k.location.timezone ?? "America/New_York";
  const { start: dayStart, end: dayEnd } = dayBoundsInTz(tz);

  const sessions = await getDb()
    .select({
      id: dropInSessions.id,
      organizationId: dropInSessions.organizationId,
      kind: dropInSessions.kind,
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
        // …and it hasn't finished. Without this, a walk-in standing at the
        // kiosk at 8pm could select — and be CHARGED for — this morning's
        // 9am session, which is over. "Today" bounds the day; this bounds
        // the clock.
        gt(dropInSessions.endsAt, new Date()),
      ),
    )
    .orderBy(dropInSessions.startsAt);

  // A CLASS session with no `sessionRateCents` of its own has no price the
  // kiosk may quote — the org `drop_in_rate_card` is the ADULT PICKUP price
  // list and must never stand in for a kids' class (see
  // src/lib/classes/class-rate.ts). /walkin/start 409s such a session, so
  // offering it here would only ever produce a dead end at the desk: drop it
  // from the list, and report the config error so a half-configured template
  // surfaces in ops rather than as a puzzled attendant. Pickup sessions are
  // untouched — an unpriced pickup legitimately falls back to that card.
  const bookable = sessions.filter((s) => {
    if (s.kind !== "class" || s.sessionRateCents !== null) return true;
    reportClassRateNotConfigured(
      { id: s.id, organizationId: s.organizationId },
      "session",
      { component: "api/kiosk/sessions" },
    );
    return false;
  });

  const ids = bookable.map((s) => s.id);
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
      sessions: bookable.map((s) => ({
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
