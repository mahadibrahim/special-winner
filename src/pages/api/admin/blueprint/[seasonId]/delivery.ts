/**
 * Delivery visibility strip (Program Blueprint T10; rewritten for the
 * T9/T10 review fix). See "Delivery visibility" in
 * docs/superpowers/specs/2026-07-10-program-blueprint-design.md:
 *
 *   "a per-group delivery strip under each slot ... ✓ delivered as
 *   planned / ✎ adapted / ○ not yet run / – cancelled, derived from
 *   session status + the adapted computation. Read-only, group-level,
 *   framed as curriculum coverage."
 *
 * GET returns, per chronological "row" of prescribed sessions, one status
 * per coached group (team) that has reached that row: "delivered" |
 * "adapted" | "scheduled" | "cancelled".
 *
 * --- Review fix (read before touching this file) ---
 * The original implementation had two correctness flaws, both from trusting
 * MUTABLE, LIVE state as if it were a stable historical record:
 *
 *  1. Adapted-detection compared a completed session's segments against the
 *     LIVE `practice_templates.structure` row — so editing a template after
 *     distribution retroactively flipped an already-delivered session to
 *     "adapted", even though nothing about that session itself changed.
 *     Fixed by snapshotting the template's structure into
 *     `session_plans.prescribedStructure` at generation time (migration
 *     0080, `buildDraftSessionPlans` in sequence-instantiation.ts) and
 *     comparing against THAT — see adapted.ts's module docstring.
 *
 *  2. The slot->session mapping zipped the CURRENT sequence-entry order
 *     (curriculum_sequence_entries, position 1..N) against each team's
 *     sessions sorted chronologically, index for index. That assumption
 *     silently broke the moment an admin reordered, replaced, or removed an
 *     arc entry AFTER distribution: entry position i no longer necessarily
 *     corresponded to the template session i was actually generated from,
 *     mislabeling which template a delivered session came from.
 *
 * The fix decouples delivery entirely from the CURRENT entries. Rows are
 * built purely from what was actually generated — session_plans rows
 * carrying a sequenceAttachmentId for this sequence+season — grouped by
 * each team's OWN chronological order ("this team's Nth prescribed
 * session"). That is exactly what was distributed and can never be
 * invalidated by a later arc edit, because it never reads the current
 * entries at all for its per-row status. `arcDrift` is a separate, honest
 * signal computed from the current entries: true when the CURRENT arc's
 * template sequence no longer matches what was actually distributed for any
 * team, so the workspace can tell the director "the plan changed since
 * distribution" without pretending the historical delivery record itself is
 * wrong — it isn't; it just may no longer line up 1:1 with today's arc.
 *
 * Rows only include teams that actually have a session at that chronological
 * position — there is no more "none" status fabricated for a slot that was
 * never generated for a given team (e.g. a team added after the last
 * distribution, or one that hasn't been (re-)distributed as far as others).
 * `totalGroups`/`deliveredCount` on a row reflect only the teams present in
 * THAT row, not the season's full coached-team roster — an honest count of
 * "how many teams have reached this point," not a fabricated denominator.
 *
 * Groups with no coach are excluded entirely (mirrors attach.ts /
 * attach-preview.ts — "coached" is the unit distribution acts on).
 * `hasDistributed` is false only when this season's linked sequence has
 * never actually produced a single prescribed session — the workspace uses
 * it to show an honest "Distribute to see delivery" empty state instead of
 * an empty strip.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import {
  seasons,
  programs,
  curriculumSequenceEntries,
  teams,
  sessionPlans,
} from "@/lib/db/schema";
import { sequenceAttachments } from "@/lib/db/schema/blueprint";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgSeason,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { groupNoun } from "@/lib/programs/group-noun";
import { isAdapted } from "@/lib/curriculum/adapted";

type DeliveryStatus = "delivered" | "adapted" | "scheduled" | "cancelled";

interface DeliveryGroup {
  teamId: string;
  groupLabel: string;
  status: DeliveryStatus;
  sessionId: string;
  sessionTitle: string;
}

interface DeliveryRow {
  /** 1-based, per-team chronological position — "this team's Nth
   * prescribed session." NOT a sequence-entry position; see module
   * docstring for why the two can legitimately diverge (arcDrift). */
  order: number;
  groups: DeliveryGroup[];
  deliveredCount: number;
  totalGroups: number;
}

function emptyResponse(noun: string) {
  return new Response(
    JSON.stringify({ noun, rows: [] as DeliveryRow[], hasDistributed: false, arcDrift: false }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const { seasonId } = context.params;
    if (!seasonId) {
      return new Response(JSON.stringify({ error: "Season ID required" }), {
        status: 400,
      });
    }

    const seasonCheck = await requireSameOrgSeason(auth.organizationId, seasonId);
    if (!seasonCheck.ok) return ownershipDeniedResponse();

    const db = getDb();

    // PK lookup — no orderBy needed on limit(1).
    const [row] = await db
      .select({
        curriculumSequenceId: seasons.curriculumSequenceId,
        programType: programs.programType,
      })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .where(eq(seasons.id, seasonId))
      .limit(1);

    if (!row) return ownershipDeniedResponse();

    const noun = groupNoun(row.programType);

    if (!row.curriculumSequenceId) {
      return emptyResponse(noun);
    }

    const sequenceId = row.curriculumSequenceId;

    const seasonTeams = await db
      .select({ id: teams.id, name: teams.name, coachUserId: teams.coachUserId })
      .from(teams)
      .where(eq(teams.seasonId, seasonId))
      .orderBy(asc(teams.createdAt));
    const teamsWithCoach = seasonTeams.filter((t) => t.coachUserId !== null);

    // Every attachment (distribution run) that has ever pushed THIS
    // sequence onto THIS season — may be more than one over time.
    const attachmentRows = await db
      .select({ id: sequenceAttachments.id })
      .from(sequenceAttachments)
      .where(
        and(
          eq(sequenceAttachments.sequenceId, sequenceId),
          eq(sequenceAttachments.seasonId, seasonId),
        ),
      );
    const attachmentIds = attachmentRows.map((a) => a.id);

    if (teamsWithCoach.length === 0 || attachmentIds.length === 0) {
      return emptyResponse(noun);
    }

    // Every prescribed session for these teams from any distribution run of
    // THIS sequence+season, sorted chronologically per team (below).
    // templateId + prescribedStructure travel with each row so both the
    // adapted computation and the arcDrift check use each session's OWN
    // generation-time record — never a live join back to practice_templates.
    const sessionRows = await db
      .select({
        id: sessionPlans.id,
        teamId: sessionPlans.teamId,
        templateId: sessionPlans.templateId,
        title: sessionPlans.title,
        status: sessionPlans.status,
        scheduledDate: sessionPlans.scheduledDate,
        segments: sessionPlans.segments,
        prescribedStructure: sessionPlans.prescribedStructure,
      })
      .from(sessionPlans)
      .where(
        and(
          inArray(
            sessionPlans.teamId,
            teamsWithCoach.map((t) => t.id),
          ),
          inArray(sessionPlans.sequenceAttachmentId, attachmentIds),
        ),
      )
      .orderBy(asc(sessionPlans.scheduledDate));

    if (sessionRows.length === 0) {
      return emptyResponse(noun);
    }

    const sessionsByTeam = new Map<string, typeof sessionRows>();
    for (const s of sessionRows) {
      if (!sessionsByTeam.has(s.teamId)) sessionsByTeam.set(s.teamId, []);
      sessionsByTeam.get(s.teamId)!.push(s);
    }

    const maxOrder = Math.max(
      ...teamsWithCoach.map((t) => (sessionsByTeam.get(t.id) ?? []).length),
    );

    const rows: DeliveryRow[] = [];
    for (let i = 0; i < maxOrder; i++) {
      const groups: DeliveryGroup[] = [];
      for (const team of teamsWithCoach) {
        const teamSessions = sessionsByTeam.get(team.id) ?? [];
        const session = teamSessions[i];
        // No "none" status here by design (review fix): a team that hasn't
        // been distributed this far yet simply has no entry in this row,
        // rather than a fabricated placeholder status.
        if (!session) continue;

        let status: DeliveryStatus;
        if (session.status === "cancelled") {
          status = "cancelled";
        } else if (session.status === "completed") {
          // A null snapshot (sessions generated before migration 0080, or
          // by any path that doesn't come from a template) can't be
          // honestly compared — benefit of the doubt, not a sixth status:
          // it ran, and there's no historical record saying it diverged, so
          // it counts as delivered rather than punishing pre-migration
          // sessions with a permanent "unknown" badge. See migration 0080.
          status =
            session.prescribedStructure &&
            isAdapted(session.segments, session.prescribedStructure)
              ? "adapted"
              : "delivered";
        } else {
          // planned / in_progress (and defensively, draft) — hasn't run yet.
          status = "scheduled";
        }
        groups.push({
          teamId: team.id,
          groupLabel: team.name,
          status,
          sessionId: session.id,
          sessionTitle: session.title,
        });
      }
      if (groups.length === 0) continue;
      const deliveredCount = groups.filter(
        (g) => g.status === "delivered" || g.status === "adapted",
      ).length;
      rows.push({ order: i + 1, groups, deliveredCount, totalGroups: groups.length });
    }

    // arcDrift: does the CURRENT arc's template sequence still match what
    // was actually distributed? Compare each team's chronological
    // templateId sequence against the current sequence entries' templateId
    // sequence, position for position. Any mismatch means an admin
    // reordered/replaced/removed an arc entry after distribution — the rows
    // above are still historically accurate (they reflect what actually
    // happened), but they no longer line up with the CURRENT arc's slot
    // order, so the workspace should say so rather than implying "arc slot 3
    // == row 3 here."
    const entryRows = await db
      .select({ templateId: curriculumSequenceEntries.templateId })
      .from(curriculumSequenceEntries)
      .where(eq(curriculumSequenceEntries.sequenceId, sequenceId))
      .orderBy(asc(curriculumSequenceEntries.position));
    const currentTemplateSequence = entryRows.map((e) => e.templateId);

    let arcDrift = false;
    outer: for (const team of teamsWithCoach) {
      const teamSessions = sessionsByTeam.get(team.id) ?? [];
      for (let i = 0; i < teamSessions.length; i++) {
        if (teamSessions[i].templateId !== currentTemplateSequence[i]) {
          arcDrift = true;
          break outer;
        }
      }
    }

    return new Response(
      JSON.stringify({ noun, rows, hasDistributed: true, arcDrift }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error loading blueprint delivery:", error);
    return new Response(JSON.stringify({ error: "Failed to load delivery" }), {
      status: 500,
    });
  }
};
