import { and, eq, lt, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";
import { games, gameOfficials, teams } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";

export type ReminderAction = "none" | "send_first" | "send_second";

const HOURS_2 = 2 * 60 * 60 * 1000;

/** ET UTC-offset in hours at instant d (e.g. -4 EDT, -5 EST), via IANA tz. */
function etOffsetHours(d: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")!.value; // "GMT-4" / "GMT-5"
  return parseInt(name.replace("GMT", ""), 10);
}

/** UTC instant for `hourEt`:00 Eastern on the ET calendar date (y, m, d), DST-correct. */
function etWallClockToUtc(y: number, m: number, d: number, hourEt: number): Date {
  // Guess the offset using the naive UTC instant for that wall-clock time; this
  // lands on (or very near) the real instant, so it already reflects the correct
  // side of any DST transition for typical morning hours.
  const guessOffset = etOffsetHours(new Date(Date.UTC(y, m, d, hourEt, 0, 0)));
  let utcMs = Date.UTC(y, m, d, hourEt, 0, 0) - guessOffset * 60 * 60 * 1000;
  // Refine once against the real instant in case the guess landed on the wrong
  // side of a DST transition.
  const refinedOffset = etOffsetHours(new Date(utcMs));
  if (refinedOffset !== guessOffset) {
    utcMs = Date.UTC(y, m, d, hourEt, 0, 0) - refinedOffset * 60 * 60 * 1000;
  }
  return new Date(utcMs);
}

/**
 * Next occurrence of `hourEt` o'clock Eastern, at or after `after`, expressed
 * as a UTC Date. The ET offset is derived at the `after` instant (and at the
 * resulting morning instant) via Intl, so it is DST-correct year-round.
 */
function nextMorningEt(after: Date, hourEt: number): Date {
  const offsetForAfter = etOffsetHours(after);
  const etWall = new Date(after.getTime() + offsetForAfter * 60 * 60 * 1000);
  const y = etWall.getUTCFullYear();
  const m = etWall.getUTCMonth();
  const d = etWall.getUTCDate();

  let utc = etWallClockToUtc(y, m, d, hourEt);
  if (utc.getTime() < after.getTime()) {
    const next = new Date(Date.UTC(y, m, d + 1));
    utc = etWallClockToUtc(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), hourEt);
  }
  return utc;
}

export function decideReminderAction(args: {
  now: Date; scheduledAt: Date; status: string; stage: number; morningHourEt?: number;
}): ReminderAction {
  const { now, scheduledAt, status, stage } = args;
  if (status === "completed") return "none";
  if (stage === 0) {
    return now.getTime() >= scheduledAt.getTime() + HOURS_2 ? "send_first" : "none";
  }
  if (stage === 1) {
    const firstSentAtOrAfter = new Date(scheduledAt.getTime() + HOURS_2);
    const morning = nextMorningEt(firstSentAtOrAfter, args.morningHourEt ?? 8);
    return now.getTime() >= morning.getTime() ? "send_second" : "none";
  }
  return "none"; // stage >= 2: stop
}

export interface CloseoutOwed {
  officialId: string;
  userId: string;
  phone: string | null;
  phoneVerified: boolean;
  organizationId: string;
  gameId: string;
  scheduledAt: Date;
  status: string;
  stage: number;
  homeTeamName: string | null;
  awayTeamName: string | null;
}

/** Assigned officials on past, not-completed games who still owe close-out. */
export async function findOfficialsOwingCloseout(now: Date): Promise<CloseoutOwed[]> {
  const db = getDb();
  const home = alias(teams, "home_team");
  const away = alias(teams, "away_team");
  return db
    .select({
      officialId: gameOfficials.id,
      userId: gameOfficials.userId,
      phone: users.phone,
      phoneVerified: users.phoneVerified,
      organizationId: locations.organizationId,
      gameId: games.id,
      scheduledAt: games.scheduledAt,
      status: games.status,
      stage: gameOfficials.closeoutRemindersSent,
      homeTeamName: home.name,
      awayTeamName: away.name,
    })
    .from(gameOfficials)
    .innerJoin(games, eq(games.id, gameOfficials.gameId))
    .innerJoin(seasons, eq(games.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .innerJoin(users, eq(users.id, gameOfficials.userId))
    .leftJoin(home, eq(home.id, games.homeTeamId))
    .leftJoin(away, eq(away.id, games.awayTeamId))
    .where(and(lt(games.scheduledAt, now), ne(games.status, "completed"), lt(gameOfficials.closeoutRemindersSent, 2)));
}
