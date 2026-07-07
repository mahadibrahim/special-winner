import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { games } from "@/lib/db/schema/teams";
import { and, eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { closeStaffShiftActivitiesForVenueToday } from "@/lib/activity-tracking/close-staff-shift";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";

const STAFF_SHIFT_ACTIVITY_ID = "act.staff_check_in_out";

async function staffShiftStatus(gameId: string): Promise<string | undefined> {
  const [row] = await getDb()
    .select({ status: activityCompletions.status })
    .from(activityCompletions)
    .where(
      and(
        eq(activityCompletions.gameId, gameId),
        eq(activityCompletions.activityId, STAFF_SHIFT_ACTIVITY_ID),
      ),
    );
  return row?.status;
}

describe("closeStaffShiftActivitiesForVenueToday", () => {
  it("closes every today-at-this-venue game's staff shift row, leaves other venue/day untouched", async () => {
    // 2026-06-10 is a Wednesday; all "today" games sit inside its
    // America/New_York calendar day (org tz set by the test fixture).
    const todayMorning = new Date("2026-06-10T14:00:00Z"); // 10am ET
    const todayAfternoon = new Date("2026-06-10T20:00:00Z"); // 4pm ET
    const todayEvening = new Date("2026-06-10T23:30:00Z"); // 7:30pm ET
    const yesterday = new Date("2026-06-09T18:00:00Z");

    const ctx = await createTestGameContext({ scheduledAt: todayMorning });

    const db = getDb();
    const [game2] = await db
      .insert(games)
      .values({
        seasonId: ctx.seasonId,
        homeTeamId: ctx.homeTeamId,
        awayTeamId: ctx.awayTeamId,
        venueId: ctx.venueId,
        scheduledAt: todayAfternoon,
        status: "scheduled",
      })
      .returning();
    const [game3] = await db
      .insert(games)
      .values({
        seasonId: ctx.seasonId,
        homeTeamId: ctx.homeTeamId,
        awayTeamId: ctx.awayTeamId,
        venueId: ctx.venueId,
        scheduledAt: todayEvening,
        status: "scheduled",
      })
      .returning();
    // Same venue, but scheduled the day before — must stay untouched.
    const [yesterdayGame] = await db
      .insert(games)
      .values({
        seasonId: ctx.seasonId,
        homeTeamId: ctx.homeTeamId,
        awayTeamId: ctx.awayTeamId,
        venueId: ctx.venueId,
        scheduledAt: yesterday,
        status: "scheduled",
      })
      .returning();

    // A wholly separate venue (own org/location) with a game scheduled at
    // the same instant as the "today" games — must stay untouched.
    const otherVenueCtx = await createTestGameContext({
      scheduledAt: todayMorning,
    });

    await bootstrapActivityCompletions(ctx.gameId);
    await bootstrapActivityCompletions(game2.id);
    await bootstrapActivityCompletions(game3.id);
    await bootstrapActivityCompletions(yesterdayGame.id);
    await bootstrapActivityCompletions(otherVenueCtx.gameId);

    // Sanity: all rows start out open before we close anything.
    for (const gameId of [ctx.gameId, game2.id, game3.id]) {
      const status = await staffShiftStatus(gameId);
      expect(["pending", "in_progress", "overdue"]).toContain(status);
    }

    const closedCount = await closeStaffShiftActivitiesForVenueToday(
      ctx.venueId,
      { now: new Date("2026-06-10T23:59:00Z") },
    );

    expect(closedCount).toBe(3);

    for (const gameId of [ctx.gameId, game2.id, game3.id]) {
      expect(await staffShiftStatus(gameId)).toBe("completed");
    }

    // Untouched: same venue, different day.
    expect(await staffShiftStatus(yesterdayGame.id)).not.toBe("completed");
    // Untouched: different venue, same day.
    expect(await staffShiftStatus(otherVenueCtx.gameId)).not.toBe("completed");
  });

  it("returns 0 for a venue with no games scheduled today", async () => {
    const ctx = await createTestGameContext({
      scheduledAt: new Date("2026-06-09T18:00:00Z"),
    });
    await bootstrapActivityCompletions(ctx.gameId);

    const closedCount = await closeStaffShiftActivitiesForVenueToday(
      ctx.venueId,
      { now: new Date("2026-06-10T12:00:00Z") },
    );
    expect(closedCount).toBe(0);
    expect(await staffShiftStatus(ctx.gameId)).not.toBe("completed");
  });

  it("returns 0 for an unknown venue id", async () => {
    const closedCount = await closeStaffShiftActivitiesForVenueToday(
      "00000000-0000-0000-0000-000000000000",
      { now: new Date() },
    );
    expect(closedCount).toBe(0);
  });
});
