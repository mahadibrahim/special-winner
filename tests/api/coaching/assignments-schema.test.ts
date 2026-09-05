/**
 * Schema smoke test for Task 1 of the 2026-09-05-coach-classes-phase01 plan:
 * the `coaching_assignments` table and the `coach_notes` dual-anchor
 * migration (team_id nullable + activityKind/activityId + the
 * `coach_notes_anchor_check` CHECK). Not an HTTP test — inserts directly
 * against the live DB, same as tests/api/schema-self-person.test.ts and
 * tests/api/admin/suspensions-schema.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, asc, and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { teams, coachNotes } from "@/lib/db/schema/teams";
import { coachingAssignments } from "@/lib/db/schema/coaching";
import { resolveDefaultOrgForHttpTests } from "../../utils/dropin-helpers";
import { createTestChild } from "../../utils/classes-helpers";

/**
 * postgres-js wraps the raw PostgresError in a Drizzle "Failed query: ..."
 * error. The constraint name lives in `error.cause.message`, not the
 * top-level `error.message`. Mirrors the identically-named helper in
 * tests/api/schema-self-person.test.ts and
 * tests/api/media/schema-do-not-publish.test.ts.
 */
function containsInChain(err: unknown, pattern: RegExp): boolean {
  let current: unknown = err;
  while (current instanceof Error) {
    if (pattern.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

async function expectConstraintViolation(
  promise: Promise<unknown>,
  constraint: RegExp,
): Promise<void> {
  let threw = false;
  try {
    await promise;
  } catch (err) {
    threw = true;
    expect(
      containsInChain(err, constraint),
      `Expected error chain to match ${constraint} but got:\n  message: ${err instanceof Error ? err.message : String(err)}\n  cause: ${err instanceof Error && err.cause instanceof Error ? err.cause.message : "(none)"}`,
    ).toBe(true);
  }
  if (!threw) {
    throw new Error(`Expected insert to throw, but it succeeded`);
  }
}

describe("coaching_assignments + coach_notes dual-anchor schema", () => {
  let organizationId: string;
  let coachUserId: string;
  let teamId: string;
  let familyMemberId: string;

  const createdNoteIds: string[] = [];
  const createdAssignmentIds: string[] = [];

  beforeAll(async () => {
    const db = getDb();
    ({ organizationId } = await resolveDefaultOrgForHttpTests());

    // Seeded coach (tests/api/setup/test-helpers.ts's getCoachCookie
    // account) — multi-tenant hazard: explicit orderBy per CLAUDE.md.
    const [coach] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "coach@test.aspiresports.com"))
      .orderBy(asc(users.createdAt))
      .limit(1);
    if (!coach) {
      throw new Error(
        "assignments-schema test: seeded coach@test.aspiresports.com not found — run npm run db:seed:e2e first",
      );
    }
    coachUserId = coach.id;

    const [team] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.name, "E2E Test Team"))
      .orderBy(asc(teams.createdAt))
      .limit(1);
    if (!team) {
      throw new Error(
        "assignments-schema test: seeded 'E2E Test Team' not found — run npm run db:seed:e2e first",
      );
    }
    teamId = team.id;

    // Any parent-owned family_members row works as coach_notes' NOT NULL
    // familyMemberId anchor — these tests don't touch parent visibility.
    const [parent] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "parent@test.aspiresports.com"))
      .orderBy(asc(users.createdAt))
      .limit(1);
    if (!parent) {
      throw new Error(
        "assignments-schema test: seeded parent@test.aspiresports.com not found — run npm run db:seed:e2e first",
      );
    }
    familyMemberId = await createTestChild(parent.id, `AssignSchema-${Date.now()}`);
  });

  afterAll(async () => {
    const db = getDb();
    if (createdNoteIds.length > 0) {
      await db.delete(coachNotes).where(inArray(coachNotes.id, createdNoteIds));
    }
    if (createdAssignmentIds.length > 0) {
      await db.delete(coachingAssignments).where(inArray(coachingAssignments.id, createdAssignmentIds));
    }
    await db.delete(familyMembers).where(eq(familyMembers.id, familyMemberId));
  });

  describe("coach_notes_anchor_check", () => {
    it("rejects a row with BOTH the team anchor and the activity anchor set", async () => {
      const db = getDb();
      await expectConstraintViolation(
        db.insert(coachNotes).values({
          familyMemberId,
          teamId,
          coachUserId,
          title: "Bad dual-anchor note",
          content: "Both anchors set — should be rejected.",
          activityKind: "class_session",
          activityId: crypto.randomUUID(),
        }),
        /coach_notes_anchor_check/,
      );
    });

    it("rejects a row with NEITHER anchor set", async () => {
      const db = getDb();
      await expectConstraintViolation(
        db.insert(coachNotes).values({
          familyMemberId,
          coachUserId,
          title: "Bad orphan note",
          content: "Neither anchor set — should be rejected.",
          // `as any`: the schema's TS types don't require an anchor at
          // compile time (both teamId and activityKind/activityId are
          // nullable columns) — we're testing the DB CHECK enforces
          // "exactly one" at runtime.
        } as any),
        /coach_notes_anchor_check/,
      );
    });

    it("accepts a team-anchored row (activity columns null)", async () => {
      const db = getDb();
      const [row] = await db
        .insert(coachNotes)
        .values({
          familyMemberId,
          teamId,
          coachUserId,
          title: "Team-anchored note",
          content: "Anchored to a team.",
        })
        .returning();
      createdNoteIds.push(row.id);
      expect(row.teamId).toBe(teamId);
      expect(row.activityKind).toBeNull();
      expect(row.activityId).toBeNull();
    });

    it("accepts an activity-anchored row (team_id null)", async () => {
      const db = getDb();
      const [row] = await db
        .insert(coachNotes)
        .values({
          familyMemberId,
          coachUserId,
          title: "Activity-anchored note",
          content: "Anchored to a class session, not a team.",
          activityKind: "class_session",
          activityId: crypto.randomUUID(),
        })
        .returning();
      createdNoteIds.push(row.id);
      expect(row.teamId).toBeNull();
      expect(row.activityKind).toBe("class_session");
      expect(row.activityId).not.toBeNull();
    });
  });

  describe("coaching_assignments_coach_kind_target uniqueness", () => {
    it("accepts the first (coach, kind, target) assignment, then rejects an exact duplicate", async () => {
      const db = getDb();
      const targetId = crypto.randomUUID();

      const [row] = await db
        .insert(coachingAssignments)
        .values({
          organizationId,
          coachUserId,
          kind: "class_template",
          targetId,
        })
        .returning();
      createdAssignmentIds.push(row.id);
      expect(row.role).toBe("lead");
      expect(row.active).toBe(true);

      await expectConstraintViolation(
        db.insert(coachingAssignments).values({
          organizationId,
          coachUserId,
          kind: "class_template",
          targetId,
        }),
        /coaching_assignments_coach_kind_target/,
      );
    });

    it("allows the same coach + target under a DIFFERENT kind (unique key includes kind)", async () => {
      const db = getDb();
      // Deliberately reuse a targetId already used by the "class_template"
      // assignment above — the unique constraint is (coach, kind, target),
      // so a different kind on the same target must not collide.
      const targetId = crypto.randomUUID();

      const [templateRow] = await db
        .insert(coachingAssignments)
        .values({ organizationId, coachUserId, kind: "team", targetId })
        .returning();
      createdAssignmentIds.push(templateRow.id);

      const [sessionRow] = await db
        .insert(coachingAssignments)
        .values({ organizationId, coachUserId, kind: "class_session", targetId })
        .returning();
      createdAssignmentIds.push(sessionRow.id);

      expect(templateRow.targetId).toBe(sessionRow.targetId);
      expect(templateRow.kind).not.toBe(sessionRow.kind);
    });
  });
});
