/**
 * GET/POST /api/coach/class-sessions/[id]/glows
 *
 * Task 6 of the 2026-09-05-coach-classes-phase01 plan: the class-session
 * equivalent of `POST /api/coach/sessions/[id]/glows` (read that file's
 * header first — this mirrors its contract). GET returns the bootstrap
 * payload the capture UI needs (roster + chip sets + already-written
 * notes); POST is a whole-batch write, fully validated before any row is
 * written, all rows for the batch inserted in one transaction.
 *
 * Differs from the team version in exactly three ways:
 *   1. Roster source: confirmed `dropInBookings` of this `drop_in_sessions`
 *      row with a non-null `familyMemberId` (joined to `familyMembers` for
 *      names), not a team's active `rosters`.
 *   2. Auth: an active `coaching_assignments` row — `class_session` on THIS
 *      session, or `class_template` on the session's
 *      `classSlotTemplateId` — for the caller. This is a WRITE-equivalent
 *      gate for BOTH GET and POST (same as the team version's GET/POST
 *      sharing `verifyCoachAccess`): the broader org-read gate
 *      (`isOrgCoachingStaff`, used by Task 5's roster endpoint) does NOT
 *      apply here.
 *   3. Note anchor: writes set `teamId: null`, `activityKind:
 *      "class_session"`, `activityId: <sessionId>` instead of `teamId`.
 *
 * Camps Phase 4 (Task 6 of the 2026-09-06-camps-phase4 plan) widened this
 * endpoint to camp day-sessions (`kind='camp'`): auth additionally accepts
 * a lead/assistant pod coach of the session's camp season (see
 * `verifyClassSessionAccess`), and camp notes anchor on
 * `activityKind: "camp_session"` instead of `"class_session"` (same
 * varchar column — no migration; parent surfaces read notes by
 * `familyMemberId` and are anchor-agnostic).
 *
 * Chip source is unchanged (`reinforcement.ts` via `getSessionChips`), but
 * class sessions have no curriculum-linked segments/activities the way a
 * team's `sessionPlans` row does (`resolveSessionChipSkillSlugs` is
 * sessionPlans-specific), so `skillSlugs` is always `[]` here — chips
 * resolve to the universal glow set with no skill-specific grows. That's
 * an accurate reflection of what a class session actually carries, not a
 * special case: a team session with no linked curriculum content resolves
 * the exact same way.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { coachNotes } from "@/lib/db/schema";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { coachingAssignments } from "@/lib/db/schema/coaching";
import { teams } from "@/lib/db/schema/teams";
import { eq, and, or, asc, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { requireCoachPortalAccess } from "@/lib/auth";
import { getSessionChips, UNIVERSAL_GLOWS } from "@/lib/curriculum/reinforcement";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

interface ClassSessionAccess {
  id: string;
  classSlotTemplateId: string | null;
  status: "scheduled" | "cancelled" | "completed";
  startsAt: Date;
  /** Which anchor this session's coach_notes rows carry:
   *  kind='class' → "class_session", kind='camp' → "camp_session". */
  noteActivityKind: "class_session" | "camp_session";
}

// Resolves the session (tenant-scoped) and checks the assignment-based
// write gate described in the header comment. Returns null on any failure
// (not found, wrong org, or no reaching assignment) — callers respond 403
// (or 404 if they want to distinguish; this endpoint follows the team
// version's convention of a flat 403 for any access failure).
//
// Camps Phase 4 (Task 6): camp day-sessions (`kind='camp'`) are accepted
// too. For those, access is EITHER the same active `class_session`
// assignment on this session (the materializer-staffed path) OR being a
// lead/assistant pod coach of the camp season — a `teams` row under
// `session.campSeasonId` with the caller as coach. Defense-in-depth per the
// plan's Global Constraints: the pod-coach probe is keyed to
// `session.campSeasonId` taken from THIS session row, whose
// `dropInSessions.organizationId` was already verified against the
// caller's resolved org above — so a cross-org season id can never grant
// access here. The `class_template` fallback stays class-only.
async function verifyClassSessionAccess(
  userId: string,
  organizationId: string,
  sessionId: string,
): Promise<ClassSessionAccess | null> {
  const db = getDb();

  const [session] = await db
    .select({
      id: dropInSessions.id,
      organizationId: dropInSessions.organizationId,
      classSlotTemplateId: dropInSessions.classSlotTemplateId,
      status: dropInSessions.status,
      startsAt: dropInSessions.startsAt,
      kind: dropInSessions.kind,
      campSeasonId: dropInSessions.campSeasonId,
    })
    .from(dropInSessions)
    .where(eq(dropInSessions.id, sessionId));

  if (
    !session ||
    session.organizationId !== organizationId ||
    (session.kind !== "class" && session.kind !== "camp")
  ) {
    return null;
  }

  const [sessionAssignment] = await db
    .select({ id: coachingAssignments.id })
    .from(coachingAssignments)
    .where(
      and(
        eq(coachingAssignments.organizationId, organizationId),
        eq(coachingAssignments.coachUserId, userId),
        eq(coachingAssignments.kind, "class_session"),
        eq(coachingAssignments.targetId, sessionId),
        eq(coachingAssignments.active, true),
      ),
    )
    .limit(1);

  let assigned = !!sessionAssignment;

  if (!assigned && session.kind === "camp" && session.campSeasonId) {
    const [podTeam] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(
        and(
          eq(teams.seasonId, session.campSeasonId),
          or(eq(teams.coachUserId, userId), eq(teams.assistantCoachUserId, userId)),
        ),
      )
      .orderBy(asc(teams.createdAt))
      .limit(1);
    assigned = !!podTeam;
  }

  if (!assigned && session.kind === "class" && session.classSlotTemplateId) {
    const [templateAssignment] = await db
      .select({ id: coachingAssignments.id })
      .from(coachingAssignments)
      .where(
        and(
          eq(coachingAssignments.organizationId, organizationId),
          eq(coachingAssignments.coachUserId, userId),
          eq(coachingAssignments.kind, "class_template"),
          eq(coachingAssignments.targetId, session.classSlotTemplateId),
          eq(coachingAssignments.active, true),
        ),
      )
      .limit(1);
    assigned = !!templateAssignment;
  }

  if (!assigned) return null;

  return {
    id: session.id,
    classSlotTemplateId: session.classSlotTemplateId,
    status: session.status,
    startsAt: session.startsAt,
    noteActivityKind: session.kind === "camp" ? "camp_session" : "class_session",
  };
}

// Confirmed bookings of this session with a real child attached — the
// "who can this coach give a glow/grow to" set, shared by GET's roster
// list and POST's whole-batch membership check.
async function getClassSessionRoster(sessionId: string) {
  return getDb()
    .select({
      familyMemberId: dropInBookings.familyMemberId,
      firstName: familyMembers.firstName,
      lastName: familyMembers.lastName,
    })
    .from(dropInBookings)
    .innerJoin(familyMembers, eq(familyMembers.id, dropInBookings.familyMemberId))
    .where(
      and(
        eq(dropInBookings.sessionId, sessionId),
        eq(dropInBookings.status, "confirmed"),
        isNotNull(dropInBookings.familyMemberId),
      ),
    )
    .orderBy(asc(familyMembers.lastName), asc(familyMembers.firstName));
}

// GET - bootstrap payload for the class-session capture UI
export const GET: APIRoute = async (context) => {
  try {
    const { params } = context;
    const auth = await requireCoachPortalAccess(context);
    if (!auth.authorized) return auth.response;

    const { id } = params;
    if (!id) return json({ error: "Session ID required" }, 400);

    const access = await verifyClassSessionAccess(auth.user.id, auth.organizationId, id);
    if (!access) return json({ error: "Access denied" }, 403);

    const db = getDb();

    const rosterRows = await getClassSessionRoster(id);
    const roster = rosterRows.map((r) => ({
      familyMemberId: r.familyMemberId as string,
      firstName: r.firstName,
      lastName: r.lastName,
    }));

    // No curriculum linkage for class sessions — see header comment.
    const chips = getSessionChips({ skillSlugs: [] });

    const existingNotes = await db
      .select({
        id: coachNotes.id,
        familyMemberId: coachNotes.familyMemberId,
        category: coachNotes.category,
        title: coachNotes.title,
        content: coachNotes.content,
        createdAt: coachNotes.createdAt,
      })
      .from(coachNotes)
      .where(and(eq(coachNotes.activityKind, access.noteActivityKind), eq(coachNotes.activityId, id)))
      .orderBy(asc(coachNotes.createdAt));

    return json(
      {
        session: {
          id: access.id,
          startsAt: access.startsAt,
          status: access.status,
        },
        roster,
        chips,
        existingNotes,
      },
      200,
    );
  } catch (error) {
    console.error("Error fetching class session glows bootstrap:", error);
    return json({ error: "Internal server error" }, 500);
  }
};

const glowEntrySchema = z
  .object({
    familyMemberId: z.string().uuid(),
    glows: z.array(z.string()).max(3).default([]),
    grow: z.string().optional(),
    note: z.string().max(280).optional(),
  })
  .refine((e) => e.glows.length > 0 || !!e.grow, {
    message: "At least one glow or a grow is required",
    path: ["glows"],
  });

const batchSchema = z.object({
  entries: z.array(glowEntrySchema).min(1).max(40),
});

// Anchor invariant every coach_notes insert in this handler must satisfy —
// validated with zod BEFORE the insert (carried finding from Task 1's
// review: never rely on the DB's coach_notes_anchor_check CHECK constraint
// to surface a bad anchor, since a constraint violation bubbles up as an
// unhandled 500 rather than a controlled 4xx). This route always
// constructs the class-session half of the anchor itself (never from
// request input), so this is a defense-in-depth invariant, not a
// pass-through of client data.
const noteAnchorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("team"), teamId: z.string().uuid() }),
  z.object({ kind: z.literal("activity"), activityKind: z.string().min(1), activityId: z.string().uuid() }),
]);

// POST - batch write, one transaction, whole-batch validation first
export const POST: APIRoute = async (context) => {
  try {
    const { params, request } = context;
    const auth = await requireCoachPortalAccess(context);
    if (!auth.authorized) return auth.response;

    const { id } = params;
    if (!id) return json({ error: "Session ID required" }, 400);

    const access = await verifyClassSessionAccess(auth.user.id, auth.organizationId, id);
    if (!access) return json({ error: "Access denied" }, 403);

    if (access.status === "cancelled") {
      return json({ error: "Glows can only be shared for scheduled or completed sessions" }, 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const validation = batchSchema.safeParse(body);
    if (!validation.success) {
      return json(
        {
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        },
        400,
      );
    }
    const { entries } = validation.data;

    // The anchor this whole POST writes is fixed by the route, not client
    // input — validate it once, up front, so a future refactor that
    // accidentally lets bad data reach it fails loudly here (400) instead
    // of at the DB's CHECK constraint (500).
    const anchorCheck = noteAnchorSchema.safeParse({
      kind: "activity",
      activityKind: access.noteActivityKind,
      activityId: id,
    });
    if (!anchorCheck.success) {
      return json({ error: "Invalid note anchor" }, 400);
    }

    const chips = getSessionChips({ skillSlugs: [] });
    const legalGlows = new Set(chips.glows);
    const legalGrows = new Set(chips.grows);
    const skillGlows = new Set(chips.glows.filter((g) => !UNIVERSAL_GLOWS.includes(g)));

    const rosterRows = await getClassSessionRoster(id);
    const rosterFamilyMemberIds = new Set(rosterRows.map((r) => r.familyMemberId));

    // Whole-batch validation BEFORE any write.
    const seenFamilyMemberIds = new Set<string>();
    for (const entry of entries) {
      if (seenFamilyMemberIds.has(entry.familyMemberId)) {
        return json({ error: "Duplicate familyMemberId in batch" }, 400);
      }
      seenFamilyMemberIds.add(entry.familyMemberId);

      if (!rosterFamilyMemberIds.has(entry.familyMemberId)) {
        return json(
          { error: "One or more familyMemberIds are not booked into this session" },
          422,
        );
      }
      for (const glow of entry.glows) {
        if (!legalGlows.has(glow)) {
          return json({ error: `Unknown glow chip: ${glow}` }, 400);
        }
      }
      if (entry.grow && !legalGrows.has(entry.grow)) {
        return json({ error: `Unknown grow chip: ${entry.grow}` }, 400);
      }
    }

    const created = await getDb().transaction(async (tx) => {
      const results: { familyMemberId: string; noteIds: string[] }[] = [];

      for (const entry of entries) {
        const noteIds: string[] = [];

        if (entry.glows.length > 0) {
          const hasSkillGlow = entry.glows.some((g) => skillGlows.has(g));
          const [glowRow] = await tx
            .insert(coachNotes)
            .values({
              familyMemberId: entry.familyMemberId,
              teamId: null,
              activityKind: access.noteActivityKind,
              activityId: id,
              coachUserId: auth.user.id,
              category: hasSkillGlow ? "achievement" : "encouragement",
              title: entry.glows[0],
              content: entry.glows.join(" · ") + (entry.note ? `\n${entry.note}` : ""),
              visibleToParent: true,
            })
            .returning({ id: coachNotes.id });
          noteIds.push(glowRow.id);
        }

        if (entry.grow) {
          const growNote = noteIds.length === 0 && entry.note ? `\n${entry.note}` : "";
          const [growRow] = await tx
            .insert(coachNotes)
            .values({
              familyMemberId: entry.familyMemberId,
              teamId: null,
              activityKind: access.noteActivityKind,
              activityId: id,
              coachUserId: auth.user.id,
              category: "focus",
              title: entry.grow,
              content: entry.grow + growNote,
              visibleToParent: true,
            })
            .returning({ id: coachNotes.id });
          noteIds.push(growRow.id);
        }

        results.push({ familyMemberId: entry.familyMemberId, noteIds });
      }

      return results;
    });

    // 200, not the team endpoint's 201 — Task 6's acceptance criteria pins
    // this route's batch-write success response to 200 explicitly.
    return json({ created }, 200);
  } catch (error) {
    console.error("Error writing class session glows batch:", error);
    return json({ error: "Internal server error" }, 500);
  }
};
