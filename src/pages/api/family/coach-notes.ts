/**
 * GET /api/family/coach-notes
 *
 * Parent-facing coach notes feed (Plan 2 Task 8,
 * docs/superpowers/specs/2026-07-09-glows-and-grows-design.md §5 "Parent
 * surface"). Returns `visibleToParent` coach_notes rows for every family
 * member the requesting user can access — primary guardian
 * (`familyMembers.parentUserId`), self-registered adult
 * (`familyMembers.selfUserId`), or a linked co-parent/guardian
 * (`family_member_parents`), per src/lib/auth/family-access.ts.
 *
 * The accessible-member set is built with one query (LEFT JOIN scoped to
 * this user's own family_member_parents link), not per-note calls to
 * canAccessFamilyMember — the note list can be dozens of rows and this
 * endpoint is on the family dashboard's hot path.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { coachNotes, familyMembers, sessionPlans, users } from "@/lib/db/schema";
import { familyMemberParents } from "@/lib/db/schema/family-member-parents";
import { eq, and, or, inArray, desc } from "drizzle-orm";
import { clampLimit } from "@/lib/http/clamp-limit";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ locals, url }) => {
  try {
    const user = locals.user;
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const db = getDb();
    const limit = clampLimit(url.searchParams.get("limit"), 30, 100);

    // Accessible family members: own dependents, self-registered row, or
    // linked via family_member_parents — join scoped to THIS user's link
    // row so a member never appears twice even if it has other co-parents.
    const accessibleMembers = await db
      .select({ id: familyMembers.id, firstName: familyMembers.firstName })
      .from(familyMembers)
      .leftJoin(
        familyMemberParents,
        and(
          eq(familyMemberParents.familyMemberId, familyMembers.id),
          eq(familyMemberParents.parentUserId, user.id),
        ),
      )
      .where(
        or(
          eq(familyMembers.parentUserId, user.id),
          eq(familyMembers.selfUserId, user.id),
          eq(familyMemberParents.parentUserId, user.id),
        ),
      );

    if (accessibleMembers.length === 0) {
      return json({ notes: [] }, 200);
    }

    const firstNameById = new Map(accessibleMembers.map((m) => [m.id, m.firstName]));
    const accessibleIds = accessibleMembers.map((m) => m.id);

    const rows = await db
      .select({
        id: coachNotes.id,
        familyMemberId: coachNotes.familyMemberId,
        category: coachNotes.category,
        title: coachNotes.title,
        content: coachNotes.content,
        createdAt: coachNotes.createdAt,
        coachFirstName: users.firstName,
        coachLastName: users.lastName,
        sessionId: sessionPlans.id,
        sessionTitle: sessionPlans.title,
        sessionScheduledDate: sessionPlans.scheduledDate,
      })
      .from(coachNotes)
      .innerJoin(users, eq(coachNotes.coachUserId, users.id))
      .leftJoin(sessionPlans, eq(coachNotes.sessionPlanId, sessionPlans.id))
      .where(
        and(
          inArray(coachNotes.familyMemberId, accessibleIds),
          eq(coachNotes.visibleToParent, true),
        ),
      )
      .orderBy(desc(coachNotes.createdAt))
      .limit(limit);

    const notes = rows.map((r) => ({
      id: r.id,
      familyMemberId: r.familyMemberId,
      playerFirstName: firstNameById.get(r.familyMemberId) ?? null,
      category: r.category,
      title: r.title,
      content: r.content,
      createdAt: r.createdAt,
      coachName: `${r.coachFirstName} ${r.coachLastName}`.trim(),
      session: r.sessionId
        ? { id: r.sessionId, title: r.sessionTitle, scheduledDate: r.sessionScheduledDate }
        : null,
    }));

    return json({ notes }, 200);
  } catch (error) {
    console.error("Error fetching family coach notes:", error);
    return json({ error: "Internal server error" }, 500);
  }
};
