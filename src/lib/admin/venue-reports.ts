import { sql, and, inArray, gte, lte, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";

export type VenueReport = {
  checkedIn: number;
  walkUps: number;
  noShows: number;
  booked: number;
  capacity: number;
  fillRate: number;
};

const ZERO: VenueReport = { checkedIn: 0, walkUps: 0, noShows: 0, booked: 0, capacity: 0, fillRate: 0 };

export async function getVenueReports(
  locationIds: string[],
  period: "today" | "week",
  now: Date,
): Promise<VenueReport> {
  if (locationIds.length === 0) return ZERO;
  const db = getDb();

  const start = new Date(now);
  const end = new Date(now);
  if (period === "today") {
    // Whole calendar day (UTC): include sessions later today, not just those
    // that have already started — otherwise capacity/booked undercount until
    // each session begins.
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);
  } else {
    // Rolling last 7 days up to the current moment.
    start.setUTCDate(start.getUTCDate() - 7);
  }

  // The session window predicate is shared by both aggregates.
  const sessionWindow = and(
    inArray(venues.locationId, locationIds),
    gte(dropInSessions.startsAt, start),
    lte(dropInSessions.startsAt, end),
  );

  // Booking-derived metrics: one booking row per attendee. Counting these over
  // the booking→session join is correct (each booking is distinct).
  const bookingMetrics = db
    .select({
      checkedIn: sql<number>`count(*) filter (where ${dropInBookings.checkedInAt} is not null)::int`,
      walkUps: sql<number>`count(*) filter (where ${dropInBookings.source} = 'walk_up')::int`,
      noShows: sql<number>`count(*) filter (where ${dropInBookings.status} = 'no_show')::int`,
      // NOTE: confirmed only — deliberately diverges from the venue day
      // board's booked count (lib/admin/venue-day-data.ts), which also
      // counts pending_claim holds ("how full is this slot right now").
      // This report answers "how many people actually booked".
      booked: sql<number>`count(*) filter (where ${dropInBookings.status} = 'confirmed')::int`,
    })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInBookings.sessionId, dropInSessions.id))
    .innerJoin(venues, eq(dropInSessions.venueId, venues.id))
    .where(sessionWindow);

  // Capacity is a property of SESSIONS, so it must be summed over sessions
  // directly — not over the booking-joined set (which would drop zero-booking
  // sessions and, with sum(distinct), collapse equal capacities).
  const capacityAgg = db
    .select({
      capacity: sql<number>`coalesce(sum(${dropInSessions.capacity}), 0)::int`,
    })
    .from(dropInSessions)
    .innerJoin(venues, eq(dropInSessions.venueId, venues.id))
    .where(sessionWindow);

  const [[metrics], [cap]] = await Promise.all([bookingMetrics, capacityAgg]);

  const booked = metrics?.booked ?? 0;
  const capacity = cap?.capacity ?? 0;
  return {
    checkedIn: metrics?.checkedIn ?? 0,
    walkUps: metrics?.walkUps ?? 0,
    noShows: metrics?.noShows ?? 0,
    booked,
    capacity,
    fillRate: capacity > 0 ? booked / capacity : 0,
  };
}
