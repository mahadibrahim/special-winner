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

  const end = now;
  const start = new Date(now);
  if (period === "today") {
    start.setUTCHours(0, 0, 0, 0);
  } else {
    start.setUTCDate(start.getUTCDate() - 7);
  }

  const [row] = await db
    .select({
      checkedIn: sql<number>`count(*) filter (where ${dropInBookings.checkedInAt} is not null)::int`,
      walkUps: sql<number>`count(*) filter (where ${dropInBookings.source} = 'walk_up')::int`,
      noShows: sql<number>`count(*) filter (where ${dropInBookings.status} = 'no_show')::int`,
      booked: sql<number>`count(*) filter (where ${dropInBookings.status} = 'confirmed')::int`,
      capacity: sql<number>`coalesce(sum(distinct ${dropInSessions.capacity}), 0)::int`,
    })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInBookings.sessionId, dropInSessions.id))
    .innerJoin(venues, eq(dropInSessions.venueId, venues.id))
    .where(
      and(
        inArray(venues.locationId, locationIds),
        gte(dropInSessions.startsAt, start),
        lte(dropInSessions.startsAt, end),
      ),
    );

  const booked = row?.booked ?? 0;
  const capacity = row?.capacity ?? 0;
  return {
    checkedIn: row?.checkedIn ?? 0,
    walkUps: row?.walkUps ?? 0,
    noShows: row?.noShows ?? 0,
    booked,
    capacity,
    fillRate: capacity > 0 ? booked / capacity : 0,
  };
}
