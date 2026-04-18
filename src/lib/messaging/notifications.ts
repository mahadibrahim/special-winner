import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { games, teams, rosters, venues } from "@/lib/db/schema/teams";
import {
  registrations,
  familyMembers,
} from "@/lib/db/schema/registrations";
import { sendToParent } from "./gateway";
import { programs, seasons } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { composeBroadcast } from "./broadcast";

/**
 * Outbound notification helpers.
 *
 * These are the "real world" triggers that fire when admins do ordinary
 * operational work: editing a game time, cancelling an event, etc. They
 * find every parent whose kid is affected and dispatch messages through
 * the outbound gateway.
 *
 * Design principles:
 *  - Fire-and-forget from the caller's perspective (admin responses are not
 *    blocked on delivery). The caller awaits the notification trigger, but
 *    the trigger awaits individual sends in a bounded loop with error
 *    isolation so one bad send doesn't cascade.
 *  - Idempotent where possible — if the same event is re-notified, we send
 *    again rather than deduping (admins may legitimately need to re-notify).
 *  - Tenant-scoped — every notification walks through the same
 *    organizationId resolution chain so cross-org data never leaks.
 */

interface GameContext {
  gameId: string;
  organizationId: string;
  scheduledAt: Date;
  venueName: string | null;
  fieldNumber: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  seasonName: string;
  programName: string;
}

async function loadGameContext(gameId: string): Promise<GameContext | null> {
  const db = getDb();
  const [row] = await db
    .select({
      gameId: games.id,
      scheduledAt: games.scheduledAt,
      fieldNumber: games.fieldNumber,
      venueName: venues.name,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      seasonName: seasons.name,
      programName: programs.name,
      organizationId: locations.organizationId,
    })
    .from(games)
    .innerJoin(seasons, eq(seasons.id, games.seasonId))
    .innerJoin(programs, eq(programs.id, seasons.programId))
    .innerJoin(locations, eq(locations.id, programs.locationId))
    .leftJoin(venues, eq(venues.id, games.venueId))
    .where(eq(games.id, gameId))
    .limit(1);

  if (!row) return null;

  // Team names require a separate lookup (inner joins on both home and away
  // would exclude games missing either side)
  const teamIds = [row.homeTeamId, row.awayTeamId].filter(
    (t): t is string => Boolean(t),
  );

  let homeTeamName: string | null = null;
  let awayTeamName: string | null = null;

  if (teamIds.length > 0) {
    const teamRows = await db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(inArray(teams.id, teamIds));
    const teamMap = new Map(teamRows.map((t) => [t.id, t.name]));
    homeTeamName = row.homeTeamId ? (teamMap.get(row.homeTeamId) ?? null) : null;
    awayTeamName = row.awayTeamId ? (teamMap.get(row.awayTeamId) ?? null) : null;
  }

  return {
    gameId: row.gameId,
    organizationId: row.organizationId,
    scheduledAt: row.scheduledAt,
    venueName: row.venueName,
    fieldNumber: row.fieldNumber,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    homeTeamName,
    awayTeamName,
    seasonName: row.seasonName,
    programName: row.programName,
  };
}

interface AffectedParent {
  parentUserId: string;
  kidFirstName: string;
  teamId: string;
  teamName: string | null;
}

async function findAffectedParents(
  teamIds: string[],
): Promise<AffectedParent[]> {
  if (teamIds.length === 0) return [];
  const db = getDb();

  const rows = await db
    .selectDistinct({
      parentUserId: familyMembers.parentUserId,
      kidFirstName: familyMembers.firstName,
      teamId: rosters.teamId,
      teamName: teams.name,
    })
    .from(rosters)
    .innerJoin(teams, eq(teams.id, rosters.teamId))
    .innerJoin(registrations, eq(registrations.id, rosters.registrationId))
    .innerJoin(familyMembers, eq(familyMembers.id, registrations.familyMemberId))
    .where(
      and(
        inArray(rosters.teamId, teamIds),
        eq(rosters.status, "active"),
      ),
    );

  // Dedupe on parent+team (rare, but a parent with twins on the same team
  // should only get one notification per game)
  const seen = new Set<string>();
  const result: AffectedParent[] = [];
  for (const r of rows) {
    const key = `${r.parentUserId}:${r.teamId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(r);
  }
  return result;
}

function formatGameDateTime(scheduledAt: Date): string {
  return scheduledAt.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLocation(ctx: GameContext): string {
  if (!ctx.venueName) return "TBD";
  if (ctx.fieldNumber) return `${ctx.venueName} (field ${ctx.fieldNumber})`;
  return ctx.venueName;
}

/**
 * Notify all affected parents that a game's schedule has changed.
 * Call AFTER the database update so the loaded context reflects the new state.
 *
 * Routes through composeBroadcast (Telegram group + SMS/email fan-out) and
 * logs to broadcastLog + conversationMessages for auditability.
 */
export async function notifyScheduleChange(
  gameId: string,
  previousScheduledAt: Date,
): Promise<{ contacted: number; skipped: number }> {
  const ctx = await loadGameContext(gameId);
  if (!ctx) {
    console.warn(`notifyScheduleChange: game ${gameId} not found`);
    return { contacted: 0, skipped: 0 };
  }

  const teamIds = [ctx.homeTeamId, ctx.awayTeamId].filter(
    (t): t is string => Boolean(t),
  );

  if (teamIds.length === 0) {
    return { contacted: 0, skipped: 0 };
  }

  const newTime = formatGameDateTime(ctx.scheduledAt);
  const oldTime = formatGameDateTime(previousScheduledAt);
  const eventName = `${ctx.programName} game`;

  const hoursUntilEvent = Math.max(
    0,
    (ctx.scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60),
  );

  try {
    const result = await composeBroadcast({
      organizationId: ctx.organizationId,
      initiatorType: "system",
      initiatorId: null,
      targetType: "team_group",
      teamIds,
      messageType: "event_change",
      body: `Heads up — ${eventName} has moved from ${oldTime} to ${newTime}.`,
      hoursUntilEvent,
    });

    const contacted = result.telegramGroupPosts + result.smsSent + result.emailSent;
    const skipped = result.errors.length;
    return { contacted, skipped };
  } catch (err) {
    console.error(`notifyScheduleChange broadcast failed for game ${gameId}:`, err);
    return { contacted: 0, skipped: teamIds.length };
  }
}

/**
 * Notify all affected parents that a game has been cancelled or deleted.
 * For cancellations, call AFTER the database status update. For deletions,
 * call BEFORE the delete so the game context is still loadable.
 *
 * Routes through composeBroadcast (Telegram group + SMS/email fan-out) and
 * logs to broadcastLog + conversationMessages for auditability.
 */
export async function notifyEventCancellation(
  gameId: string,
  reason: "cancelled" | "postponed" | "deleted" = "cancelled",
): Promise<{ contacted: number; skipped: number }> {
  const ctx = await loadGameContext(gameId);
  if (!ctx) {
    console.warn(`notifyEventCancellation: game ${gameId} not found`);
    return { contacted: 0, skipped: 0 };
  }

  const teamIds = [ctx.homeTeamId, ctx.awayTeamId].filter(
    (t): t is string => Boolean(t),
  );

  if (teamIds.length === 0) {
    return { contacted: 0, skipped: 0 };
  }

  const eventName = `${ctx.programName} game`;
  const hoursUntilEvent = Math.max(
    0,
    (ctx.scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60),
  );

  const reasonLabel: string | null =
    reason === "postponed" ? "postponed" : reason === "deleted" ? "deleted" : null;
  const body = `${eventName} has been cancelled${reasonLabel ? ` (${reasonLabel})` : ""}. Rescheduling details to follow.`;

  try {
    const result = await composeBroadcast({
      organizationId: ctx.organizationId,
      initiatorType: "system",
      initiatorId: null,
      targetType: "team_group",
      teamIds,
      messageType: "event_cancellation",
      body,
      hoursUntilEvent,
    });

    const contacted = result.telegramGroupPosts + result.smsSent + result.emailSent;
    const skipped = result.errors.length;
    return { contacted, skipped };
  } catch (err) {
    console.error(`notifyEventCancellation broadcast failed for game ${gameId}:`, err);
    return { contacted: 0, skipped: teamIds.length };
  }
}

/**
 * Send day-before reminders for tomorrow's practices and games.
 * Intended to be called from a cron task (daily, ~24 hours before the event).
 *
 * Returns { contacted, skipped, eventCount } so the cron runner can log
 * meaningful telemetry.
 */
export async function sendDayBeforeReminders(): Promise<{
  contacted: number;
  skipped: number;
  eventCount: number;
}> {
  const db = getDb();

  // Find all games scheduled in the next 16–36 hours. The window is padded
  // so a cron that runs slightly early/late still catches every event.
  const now = new Date();
  const windowStart = new Date(now.getTime() + 16 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000);

  const tomorrowGames = await db
    .select({
      gameId: games.id,
      scheduledAt: games.scheduledAt,
      fieldNumber: games.fieldNumber,
      venueName: venues.name,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      status: games.status,
      organizationId: locations.organizationId,
    })
    .from(games)
    .innerJoin(seasons, eq(seasons.id, games.seasonId))
    .innerJoin(programs, eq(programs.id, seasons.programId))
    .innerJoin(locations, eq(locations.id, programs.locationId))
    .leftJoin(venues, eq(venues.id, games.venueId))
    .where(
      and(
        eq(games.status, "scheduled"),
        // gte/lte — using raw range via and() with manual comparisons
        or(
          and(
            // gte windowStart
            eq(games.status, "scheduled"),
          ),
        ),
      ),
    );

  // Filter in JS (avoid gnarly Drizzle conditional range syntax)
  const filtered = tomorrowGames.filter(
    (g) =>
      g.scheduledAt &&
      g.scheduledAt >= windowStart &&
      g.scheduledAt <= windowEnd &&
      g.status === "scheduled",
  );

  let contacted = 0;
  let skipped = 0;

  for (const game of filtered) {
    const teamIds = [game.homeTeamId, game.awayTeamId].filter(
      (t): t is string => Boolean(t),
    );
    const parents = await findAffectedParents(teamIds);

    const when = formatGameDateTime(game.scheduledAt);
    const venue = game.venueName
      ? game.fieldNumber
        ? `${game.venueName} (field ${game.fieldNumber})`
        : game.venueName
      : "TBD";

    for (const parent of parents) {
      const body = `Reminder: ${parent.kidFirstName} has ${parent.teamName ?? "a team event"} tomorrow at ${when}. Location: ${venue}. See you there! — Aspire`;
      try {
        const result = await sendToParent({
          parentUserId: parent.parentUserId,
          organizationId: game.organizationId,
          body,
          senderType: "system",
        });
        if (result.ok) contacted++;
        else skipped++;
      } catch (err) {
        skipped++;
        console.error(
          `Day-before reminder failed for parent ${parent.parentUserId}:`,
          err,
        );
      }
    }
  }

  return { contacted, skipped, eventCount: filtered.length };
}
