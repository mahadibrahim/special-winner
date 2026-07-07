import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { mediaDoNotPublish, familyMembers, organizations, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Schema smoke test for `media_do_not_publish` (product-backlog build #3):
 * confirms the module imports/exports cleanly through the schema barrel and
 * that the partial-unique index `media_do_not_publish_one_active_per_org_fm`
 * — "at most one ACTIVE row per (org, family_member)" — is enforced by
 * Postgres, not just by application code.
 *
 * postgres-js wraps the raw PostgresError in a Drizzle "Failed query: ..."
 * error; the constraint name lives in `error.cause.message`. Mirrors the
 * helper in tests/api/schema-self-person.test.ts.
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

describe("media_do_not_publish schema", () => {
  it("enforces at most one active row per (organization, family_member)", async () => {
    const db = getDb();

    // Self-seed deterministic fixtures rather than relying on ambient
    // ordering across CI's shared DB — pick the oldest org/user (stable via
    // explicit orderBy) and insert a fresh family_member row scoped to this
    // test run.
    const [org] = await db
      .select()
      .from(organizations)
      .orderBy(organizations.createdAt)
      .limit(1);
    expect(org).toBeDefined();

    const [user] = await db
      .select()
      .from(users)
      .orderBy(users.createdAt)
      .limit(1);
    expect(user).toBeDefined();

    const [fm] = await db
      .insert(familyMembers)
      .values({
        parentUserId: user.id,
        firstName: "DoNotPublish",
        lastName: `SchemaTest-${Date.now()}`,
        birthDate: "2015-01-01",
      })
      .returning();
    expect(fm).toBeDefined();

    let firstRowId: string | undefined;
    try {
      const [first] = await db
        .insert(mediaDoNotPublish)
        .values({
          organizationId: org.id,
          familyMemberId: fm.id,
          setByUserId: user.id,
          active: true,
        })
        .returning();
      firstRowId = first.id;
      expect(first.active).toBe(true);

      await expectConstraintViolation(
        db.insert(mediaDoNotPublish).values({
          organizationId: org.id,
          familyMemberId: fm.id,
          setByUserId: user.id,
          active: true,
        }),
        /media_do_not_publish_one_active_per_org_fm/,
      );
    } finally {
      if (firstRowId) {
        await db.delete(mediaDoNotPublish).where(eq(mediaDoNotPublish.id, firstRowId));
      }
      await db.delete(familyMembers).where(eq(familyMembers.id, fm.id));
    }
  });

  it("allows a second row once the first is inactive (opt-out history is preserved, not blocked)", async () => {
    const db = getDb();

    const [org] = await db
      .select()
      .from(organizations)
      .orderBy(organizations.createdAt)
      .limit(1);
    const [user] = await db
      .select()
      .from(users)
      .orderBy(users.createdAt)
      .limit(1);

    const [fm] = await db
      .insert(familyMembers)
      .values({
        parentUserId: user.id,
        firstName: "DoNotPublish",
        lastName: `SchemaTest2-${Date.now()}`,
        birthDate: "2015-01-01",
      })
      .returning();

    let rowIds: string[] = [];
    try {
      const [inactiveRow] = await db
        .insert(mediaDoNotPublish)
        .values({
          organizationId: org.id,
          familyMemberId: fm.id,
          setByUserId: user.id,
          active: false,
          removedByUserId: user.id,
          removedAt: new Date(),
        })
        .returning();
      rowIds.push(inactiveRow.id);

      const [activeRow] = await db
        .insert(mediaDoNotPublish)
        .values({
          organizationId: org.id,
          familyMemberId: fm.id,
          setByUserId: user.id,
          active: true,
        })
        .returning();
      rowIds.push(activeRow.id);

      expect(activeRow.active).toBe(true);
    } finally {
      for (const id of rowIds) {
        await db.delete(mediaDoNotPublish).where(eq(mediaDoNotPublish.id, id));
      }
      await db.delete(familyMembers).where(eq(familyMembers.id, fm.id));
    }
  });
});
