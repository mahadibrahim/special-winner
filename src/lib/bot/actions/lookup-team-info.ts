import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { rosters, teams } from "@/lib/db/schema/teams";
import { users } from "@/lib/db/schema/users";
import type { BotActionDefinition, BotActionResult } from "./types";

/**
 * lookup_team_info — returns the coach and team info for a specific kid.
 * Read-only. Use when the parent asks "who's Maya's coach" or "what team
 * is she on". Returns coach name (not contact info — that's private).
 *
 * Params: { kidId: string } — required, must belong to the requesting parent.
 */
export const lookupTeamInfo: BotActionDefinition = {
  name: "lookup_team_info",
  description:
    "Returns team info (coach name, team name, division) for a specific kid. Read-only. Use when parent asks 'who's Maya's coach' or 'what team is she on'.",
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

    // Scope check + name lookup in one query
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

    // Join all the way through to find the kid's active team + coach
    const teamRows = await db
      .select({
        teamName: teams.name,
        division: teams.division,
        coachFirstName: users.firstName,
        coachLastName: users.lastName,
      })
      .from(rosters)
      .innerJoin(registrations, eq(registrations.id, rosters.registrationId))
      .innerJoin(teams, eq(teams.id, rosters.teamId))
      .leftJoin(users, eq(users.id, teams.coachUserId))
      .where(
        and(
          eq(registrations.familyMemberId, kidId),
          eq(rosters.status, "active"),
        ),
      );

    if (teamRows.length === 0) {
      return {
        ok: true,
        responseBody: `${kid.firstName} isn't on any active team rosters right now.`,
      };
    }

    // If the kid is on multiple teams, list them all briefly
    const lines = teamRows.map((t) => {
      const coach = [t.coachFirstName, t.coachLastName]
        .filter(Boolean)
        .join(" ")
        .trim() || "TBD";
      const division = t.division ? ` (${t.division})` : "";
      return `${t.teamName}${division} — Coach ${coach}`;
    });

    const responseBody =
      teamRows.length === 1
        ? `${kid.firstName} is on ${lines[0]}.`
        : `${kid.firstName} is on ${teamRows.length} teams:\n${lines.join("\n")}`;

    return {
      ok: true,
      responseBody,
      details: { kidId, teamCount: teamRows.length },
    };
  },
};
