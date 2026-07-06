import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { requireCoachAccess } from "@/lib/auth";
import { STATUS_RANK } from "@/lib/curriculum/assessment-cadence";
import { getTeamCadence } from "@/lib/curriculum/assessment-cadence-query";

export const prerender = false;

// GET - Players due/overdue/never-assessed on the coach's teams, for the
// dashboard nudge. Visibility only — nothing here blocks any coach action.
export const GET: APIRoute = async (context) => {
  const auth = await requireCoachAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const cadence = await getTeamCadence(getDb(), auth.teamIds, new Date());

    const duePlayerIds = new Set<string>();
    const teams = cadence
      .map((team) => ({
        teamId: team.teamId,
        teamName: team.teamName,
        players: team.players
          .filter((p) => p.worstStatus !== "fresh")
          .sort((a, b) => STATUS_RANK[b.worstStatus] - STATUS_RANK[a.worstStatus])
          .map((p) => {
            duePlayerIds.add(p.familyMemberId);
            return {
              familyMemberId: p.familyMemberId,
              firstName: p.firstName,
              lastName: p.lastName,
              worstStatus: p.worstStatus,
              hasAnyAssessment: p.hasAnyAssessment,
              dueDomains: p.domains.filter((d) => d.status !== "fresh"),
            };
          }),
      }))
      .filter((team) => team.players.length > 0);

    return new Response(
      JSON.stringify({ totalPlayersDue: duePlayerIds.size, teams }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error computing assessments due:", error);
    return new Response(
      JSON.stringify({ error: "Failed to compute assessments due" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
