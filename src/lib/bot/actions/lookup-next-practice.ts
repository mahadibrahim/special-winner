import { and, eq, gte, inArray, asc, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { rosters, games, teams, venues } from "@/lib/db/schema/teams";
import type { BotActionDefinition, BotActionResult } from "./types";

/**
 * lookup_next_practice — returns the next upcoming event for a specific kid.
 * Read-only. Narrower than lookup_schedule — answers "when does Maya play next?".
 *
 * Params: { kidId: string } — required, must belong to the requesting parent.
 */
export const lookupNextPractice: BotActionDefinition = {
  name: "lookup_next_practice",
  description:
    "Returns the single next upcoming event (practice or game) for a specific kid. Read-only. Use when the parent asks 'when does Maya play next' or 'when's her next practice' and you can identify which kid they mean.",
  readOnly: true,
  reversible: false,
  requiresConfirmation: false,

  async handler(params, context): Promise<BotActionResult> {
    const kidId = typeof params.kidId === "string" ? params.kidId : null;
    if (!kidId) {
      return {
        ok: false,
        responseBody:
          "I need to know which kid you're asking about. Can you tell me their name?",
        errorReason: "missing kidId",
      };
    }

    const db = getDb();

    // Scope check — kid must belong to this parent
    const [kid] = await db
      .select({ firstName: familyMembers.firstName })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.id, kidId),
          eq(familyMembers.parentUserId, context.parentUserId),
        ),
      )
      .limit(1);

    if (!kid) {
      return {
        ok: false,
        responseBody:
          "I don't see that kid linked to your account. Let me pass this to an admin.",
        errorReason: "scope check failed",
        suggestEscalation: true,
      };
    }

    // Find the teams this kid is active on
    const teamRows = await db
      .select({ teamId: rosters.teamId })
      .from(rosters)
      .innerJoin(registrations, eq(registrations.id, rosters.registrationId))
      .where(eq(registrations.familyMemberId, kidId));

    if (teamRows.length === 0) {
      return {
        ok: true,
        responseBody: `${kid.firstName} isn't on any active team rosters right now.`,
      };
    }

    const teamIds = [...new Set(teamRows.map((t) => t.teamId))];
    const now = new Date();

    // Find the single next game for any of those teams
    const [nextGame] = await db
      .select({
        scheduledAt: games.scheduledAt,
        homeTeamName: teams.name,
        venueName: venues.name,
        fieldNumber: games.fieldNumber,
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
          eq(games.status, "scheduled"),
        ),
      )
      .orderBy(asc(games.scheduledAt))
      .limit(1);

    if (!nextGame) {
      return {
        ok: true,
        responseBody: `Nothing scheduled on ${kid.firstName}'s calendar right now.`,
      };
    }

    const when = nextGame.scheduledAt.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const venue = nextGame.venueName
      ? nextGame.fieldNumber
        ? `${nextGame.venueName} (field ${nextGame.fieldNumber})`
        : nextGame.venueName
      : "TBD";

    return {
      ok: true,
      responseBody: `${kid.firstName}'s next event: ${when} at ${venue}.`,
      details: { kidId, scheduledAt: nextGame.scheduledAt.toISOString() },
    };
  },
};
