/**
 * Bootstrap activity_completions rows for a freshly-scheduled game.
 *
 * Reads the game's tag context (venue toggles, program type/audience, sport
 * slug), filters the in-process catalog to the activities that apply, and
 * inserts one `pending` activity_completions row per matching activity.
 *
 * Idempotent: relies on the unique (game_id, activity_id) index — re-running
 * for the same game is a no-op via `onConflictDoNothing`.
 *
 * Field ownership note: `games`, `programs`, `seasons`, and `venues` do NOT
 * carry their own `organizationId` column. The organization is resolved via
 * `games → seasons → programs → locations → organizations`. The activity
 * completion row owns its org id explicitly so the dashboard can scope rows
 * without re-walking the join.
 */
import { getDb } from "@/lib/db";
import { games, venues } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { sports } from "@/lib/db/schema/sports";
import { locations, organizations } from "@/lib/db/schema/organizations";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { eq } from "drizzle-orm";
import { getCatalog } from "./catalog-cache";
import { deriveTagContext } from "./derive-tag-context";
import { filterActivitiesByContext } from "./filter";
import { computeExpectedAt } from "./dsl";

export async function bootstrapActivityCompletions(
  gameId: string,
): Promise<void> {
  const db = getDb();

  const [row] = await db
    .select({
      game: games,
      venue: venues,
      season: seasons,
      program: programs,
      sport: sports,
      org: organizations,
    })
    .from(games)
    .leftJoin(venues, eq(games.venueId, venues.id))
    .leftJoin(seasons, eq(games.seasonId, seasons.id))
    .leftJoin(programs, eq(seasons.programId, programs.id))
    .leftJoin(sports, eq(programs.sportId, sports.id))
    .leftJoin(locations, eq(programs.locationId, locations.id))
    .leftJoin(organizations, eq(locations.organizationId, organizations.id))
    .where(eq(games.id, gameId))
    .limit(1);

  if (
    !row?.game ||
    !row.venue ||
    !row.season ||
    !row.program ||
    !row.sport ||
    !row.org
  ) {
    throw new Error(
      `Game ${gameId} missing required relations for bootstrap (venue/season/program/sport/org)`,
    );
  }

  const tagContext = deriveTagContext({
    venue: {
      indoor: row.venue.indoor ?? false,
      owned: row.venue.owned,
      concessions: row.venue.concessions,
      parkingManaged: row.venue.parkingManaged,
    },
    program: {
      programType: row.program.programType,
      audienceType: row.program.audienceType,
      sport: { slug: row.sport.slug },
    },
  });

  const catalog = await getCatalog();
  const matching = filterActivitiesByContext(
    catalog.activities,
    tagContext,
  );
  const orgTz = row.org.timezone ?? "America/New_York";

  const inserts = matching.map((activity) => {
    const expectedAt = computeExpectedAt(
      activity.expected_completion,
      { scheduledAt: row.game.scheduledAt },
      orgTz,
      activity.phase,
    );
    return {
      organizationId: row.org!.id,
      gameId: row.game.id,
      activityId: activity.id,
      // computeExpectedAt returns null for `trigger+Nmin` DSL — those rows
      // are deferred (the runtime scheduler computes expected_at when the
      // trigger event fires). Until then we park them at kickoff so the
      // NOT NULL column has a value the cron tick won't act on (no
      // pre_reminder window before kickoff for trigger-based activities
      // since the trigger hasn't fired yet).
      expectedAt: expectedAt ?? row.game.scheduledAt,
      status: "pending" as const,
      currentResponsibleRole: activity.raci.accountable,
      responsibleHistory: [
        {
          role: activity.raci.accountable,
          assigned_at: new Date().toISOString(),
          reason: "bootstrap",
        },
      ],
    };
  });

  if (inserts.length > 0) {
    await db
      .insert(activityCompletions)
      .values(inserts)
      .onConflictDoNothing();
  }
}
