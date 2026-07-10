/**
 * Delivery visibility strip (Program Blueprint T10). See "Delivery
 * visibility" in docs/superpowers/specs/2026-07-10-program-blueprint-design.md:
 *
 *   "a per-group delivery strip under each slot ... ✓ delivered as
 *   planned / ✎ adapted / ○ not yet run / – cancelled, derived from
 *   session status + the adapted computation. Read-only, group-level,
 *   framed as curriculum coverage."
 *
 * GET returns, per sequence-entry ("slot") in the season's linked
 * sequence, one status per coached group (team): "delivered" | "adapted"
 * | "scheduled" | "cancelled" | "none".
 *
 * --- Slot -> session mapping assumption (read before changing this) ---
 * Sessions carry no direct "which slot" pointer of their own — only
 * `sequenceAttachmentId` (which distribution RUN generated them) and
 * `scheduledDate`. What ties a session to a specific sequence entry is
 * purely how they were built: `buildDraftSessionPlans`
 * (sequence-instantiation.ts) maps entries sorted by `position` 1:1 onto
 * `generatePracticeDates`'s dates in ascending order — entry index i ->
 * dates[i]. So for a given team, ordering ALL of its sessions that carry
 * a sequenceAttachmentId belonging to this (sequence, season) pair by
 * `scheduledDate` ascending reproduces that same index: the i-th session
 * chronologically is the session for entry index i. This holds across
 * multiple distribution runs (initial + later re-distributions that add
 * teams or extend the arc) because re-distribution only ever fills in
 * MISSING (team, template, date) triples — it never reorders or
 * backfills earlier ones — so a team's sessions stay in the same
 * entry-aligned chronological order however many runs contributed them.
 * If a re-distribution ever used a different recurrence (weekday/time)
 * than the original run, this per-team chronological order could in
 * theory drift from strict entry-position order; that edge case is
 * accepted here per the task's own instruction to document the
 * assumption rather than build a second lineage column for it.
 *
 * Groups with no coach are excluded (mirrors attach.ts / attach-preview.ts
 * — "coached" is the unit distribution acts on). `hasDistributed` is
 * false only when this season's linked sequence has never actually been
 * distributed (zero attachment runs with any resulting session) — the
 * workspace uses it to show an honest "Distribute to see delivery" empty
 * state instead of an all-"none" strip.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import {
  seasons,
  programs,
  curriculumSequenceEntries,
  practiceTemplates,
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

type DeliveryStatus = "delivered" | "adapted" | "scheduled" | "cancelled" | "none";

interface DeliveryGroup {
  teamId: string;
  groupLabel: string;
  status: DeliveryStatus;
  sessionId: string | null;
}

interface DeliverySlot {
  entryId: string;
  order: number;
  templateTitle: string;
  groups: DeliveryGroup[];
  deliveredCount: number;
  totalGroups: number;
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
      return new Response(
        JSON.stringify({ noun, slots: [], hasDistributed: false }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const sequenceId = row.curriculumSequenceId;

    const entryRows = await db
      .select({
        id: curriculumSequenceEntries.id,
        position: curriculumSequenceEntries.position,
        templateId: curriculumSequenceEntries.templateId,
        templateTitle: practiceTemplates.name,
        structure: practiceTemplates.structure,
      })
      .from(curriculumSequenceEntries)
      .innerJoin(
        practiceTemplates,
        eq(curriculumSequenceEntries.templateId, practiceTemplates.id),
      )
      .where(eq(curriculumSequenceEntries.sequenceId, sequenceId))
      .orderBy(asc(curriculumSequenceEntries.position));

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

    if (entryRows.length === 0 || teamsWithCoach.length === 0 || attachmentIds.length === 0) {
      const slots: DeliverySlot[] = entryRows.map((entry) => ({
        entryId: entry.id,
        order: entry.position,
        templateTitle: entry.templateTitle,
        groups: teamsWithCoach.map((t) => ({
          teamId: t.id,
          groupLabel: t.name,
          status: "none" as DeliveryStatus,
          sessionId: null,
        })),
        deliveredCount: 0,
        totalGroups: teamsWithCoach.length,
      }));
      return new Response(
        JSON.stringify({ noun, slots, hasDistributed: false }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Every prescribed session for these teams from any distribution run
    // of THIS sequence+season — split per team below, ordered so each
    // team's array index lines up with entry position (see module
    // docstring).
    const sessionRows = await db
      .select({
        id: sessionPlans.id,
        teamId: sessionPlans.teamId,
        status: sessionPlans.status,
        scheduledDate: sessionPlans.scheduledDate,
        segments: sessionPlans.segments,
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

    const sessionsByTeam = new Map<string, typeof sessionRows>();
    for (const s of sessionRows) {
      if (!sessionsByTeam.has(s.teamId)) sessionsByTeam.set(s.teamId, []);
      sessionsByTeam.get(s.teamId)!.push(s);
    }

    let hasDistributed = false;

    const slots: DeliverySlot[] = entryRows.map((entry, entryIndex) => {
      const groups: DeliveryGroup[] = teamsWithCoach.map((team) => {
        const teamSessions = sessionsByTeam.get(team.id) ?? [];
        const session = teamSessions[entryIndex];
        if (!session) {
          return {
            teamId: team.id,
            groupLabel: team.name,
            status: "none" as DeliveryStatus,
            sessionId: null,
          };
        }
        hasDistributed = true;
        let status: DeliveryStatus;
        if (session.status === "cancelled") {
          status = "cancelled";
        } else if (session.status === "completed") {
          status = isAdapted(session.segments, entry.structure) ? "adapted" : "delivered";
        } else {
          // planned / in_progress (and defensively, draft) — hasn't run yet.
          status = "scheduled";
        }
        return { teamId: team.id, groupLabel: team.name, status, sessionId: session.id };
      });
      const deliveredCount = groups.filter(
        (g) => g.status === "delivered" || g.status === "adapted",
      ).length;
      return {
        entryId: entry.id,
        order: entry.position,
        templateTitle: entry.templateTitle,
        groups,
        deliveredCount,
        totalGroups: groups.length,
      };
    });

    return new Response(
      JSON.stringify({ noun, slots, hasDistributed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error loading blueprint delivery:", error);
    return new Response(JSON.stringify({ error: "Failed to load delivery" }), {
      status: 500,
    });
  }
};
