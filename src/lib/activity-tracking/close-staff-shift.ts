/**
 * Bridge from a staff shift clock-out to the activity tracking engine.
 *
 * `activity_completions.game_id` is NOT NULL, so a venue's staff
 * check-in/out activity (act.staff_check_in_out) bootstraps one pending
 * row per game scheduled at that venue, not one row per shift. A single
 * clock-out therefore needs to close *every* one of that day's game rows
 * at the venue, not just one — otherwise a coach who worked three games
 * would leave two activity_completions rows stuck pending forever.
 *
 * Called fire-and-forget from POST /api/staff/shifts/clock-out (Task 9,
 * decision-dependent — not built in this foundation pass).
 */
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { games, venues } from "@/lib/db/schema/teams";
import { locations, organizations } from "@/lib/db/schema/organizations";
import { and, between, eq, inArray } from "drizzle-orm";
import { getCatalog } from "./catalog-cache";
import { tzDayBoundsUtc } from "./tz-day";

const STAFF_SHIFT_EVENT_TYPE = "evt.staff_shift_clocked_out";
const DEFAULT_TZ = "America/New_York";

/**
 * Close every open (pending/in_progress/overdue) act.staff_check_in_out
 * (or any other activity wired to evt.staff_shift_clocked_out)
 * activity_completions row for games scheduled "today" — in the venue's
 * organization timezone — at `venueId`.
 *
 * Returns the number of rows actually updated. Returns 0 (no throw) when
 * the venue doesn't exist, has no games scheduled today, or no catalog
 * activity uses the event — this is called fire-and-forget from the
 * clock-out endpoint and should never fail the HTTP response.
 */
export async function closeStaffShiftActivitiesForVenueToday(
  venueId: string,
  opts: { byUserId?: string; now?: Date } = {},
): Promise<number> {
  const db = getDb();
  const now = opts.now ?? new Date();

  const [venueRow] = await db
    .select({ orgTimezone: organizations.timezone })
    .from(venues)
    .innerJoin(locations, eq(venues.locationId, locations.id))
    .innerJoin(organizations, eq(locations.organizationId, organizations.id))
    .where(eq(venues.id, venueId))
    .limit(1);

  if (!venueRow) return 0;
  const tz = venueRow.orgTimezone ?? DEFAULT_TZ;

  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const { startUtc, endUtc } = tzDayBoundsUtc(date, tz);

  const gamesToday = await db
    .select({ id: games.id })
    .from(games)
    .where(
      and(
        eq(games.venueId, venueId),
        between(games.scheduledAt, startUtc, endUtc),
      ),
    );
  if (gamesToday.length === 0) return 0;
  const gameIds = gamesToday.map((g) => g.id);

  const catalog = await getCatalog();
  const activitiesUsingEvent = catalog.activities.filter((a) => {
    if (a.tracking_method !== "system_event") return false;
    const artifact = a.tracking_artifact as { event_type?: string };
    return artifact.event_type === STAFF_SHIFT_EVENT_TYPE;
  });
  if (activitiesUsingEvent.length === 0) return 0;
  const activityIds = activitiesUsingEvent.map((a) => a.id);

  const result = await db
    .update(activityCompletions)
    .set({
      status: "completed",
      completedAt: now,
      completedByUserId: opts.byUserId ?? null,
      updatedAt: now,
    })
    .where(
      and(
        inArray(activityCompletions.gameId, gameIds),
        inArray(activityCompletions.activityId, activityIds),
        inArray(activityCompletions.status, [
          "pending",
          "in_progress",
          "overdue",
        ]),
      ),
    )
    .returning({ id: activityCompletions.id });

  return result.length;
}
