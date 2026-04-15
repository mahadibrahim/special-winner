import { and, eq, gte, inArray, asc, or, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { rosters, games, teams, venues } from "@/lib/db/schema/teams";
import type { BotActionDefinition, BotActionResult } from "./types";

/**
 * lookup_schedule — returns the upcoming events for all of a parent's kids.
 * Read-only. Always safe to execute.
 *
 * Data flow:
 *   parent → family_members (via parentUserId) → registrations (familyMemberId)
 *          → rosters (registrationId) → teamId
 *          → games (homeTeamId OR awayTeamId)
 *
 * Phase 1 uses the existing `family_members.parent_user_id` FK as the source
 * of truth for kid ownership. Once spouses are backfilled into the new
 * `family_member_parents` join table, this query should UNION that path as well.
 */
export const lookupSchedule: BotActionDefinition = {
  name: "lookup_schedule",
  description:
    "Returns the upcoming schedule for the parent's kids. Read-only. Use for 'when is practice', 'what's this week', 'when's the next game'.",
  readOnly: true,
  reversible: false,
  requiresConfirmation: false,

  async handler(params, context): Promise<BotActionResult> {
    const daysAhead =
      typeof params.daysAhead === "number" ? params.daysAhead : 7;

    const db = getDb();

    // Find kids belonging to this parent (via direct FK)
    const parentKids = await db
      .select({
        kidId: familyMembers.id,
        firstName: familyMembers.firstName,
      })
      .from(familyMembers)
      .where(eq(familyMembers.parentUserId, context.parentUserId));

    if (parentKids.length === 0) {
      return {
        ok: true,
        responseBody:
          "You don't have any kids registered yet. Reach out to an admin if you think that's wrong.",
      };
    }

    const kidIds = parentKids.map((k) => k.kidId);

    // Find active teams those kids are on via registrations → rosters
    const teamRows = await db
      .select({
        teamId: rosters.teamId,
      })
      .from(rosters)
      .innerJoin(registrations, eq(registrations.id, rosters.registrationId))
      .where(inArray(registrations.familyMemberId, kidIds));

    if (teamRows.length === 0) {
      return {
        ok: true,
        responseBody: `${parentKids
          .map((k) => k.firstName)
          .join(", ")} ${parentKids.length === 1 ? "isn't" : "aren't"} on any active team rosters right now. Ask an admin if that seems wrong.`,
      };
    }

    const teamIds = [...new Set(teamRows.map((t) => t.teamId))];

    // Find upcoming games where any of the parent's teams is home OR away
    const now = new Date();
    const cutoff = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

    const upcomingGames = await db
      .select({
        id: games.id,
        scheduledAt: games.scheduledAt,
        homeTeamId: games.homeTeamId,
        awayTeamId: games.awayTeamId,
        homeTeamName: teams.name,
        venueName: venues.name,
      })
      .from(games)
      .leftJoin(teams, eq(teams.id, games.homeTeamId))
      .leftJoin(venues, eq(venues.id, games.venueId))
      .where(
        and(
          or(
            inArray(games.homeTeamId, teamIds),
            inArray(games.awayTeamId, teamIds),
          ),
          gte(games.scheduledAt, now),
          lte(games.scheduledAt, cutoff),
        ),
      )
      .orderBy(asc(games.scheduledAt))
      .limit(10);

    if (upcomingGames.length === 0) {
      return {
        ok: true,
        responseBody: `Nothing scheduled in the next ${daysAhead} days for ${parentKids
          .map((k) => k.firstName)
          .join(", ")}. Enjoy the break!`,
      };
    }

    // Build a concise summary
    const lines = upcomingGames.map((g) => {
      const when = g.scheduledAt
        ? new Date(g.scheduledAt).toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "TBD";
      const teamLabel = g.homeTeamName ? `${g.homeTeamName}` : "Your team";
      const venueLabel = g.venueName ? ` at ${g.venueName}` : "";
      return `${teamLabel} — ${when}${venueLabel}`;
    });

    const header =
      parentKids.length === 1
        ? `${parentKids[0].firstName}'s next ${upcomingGames.length === 1 ? "event" : "events"}:`
        : `Upcoming events:`;

    return {
      ok: true,
      responseBody: [header, ...lines].join("\n"),
      details: { eventCount: upcomingGames.length, daysAhead },
    };
  },
};
