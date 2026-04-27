import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { familyMembers, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * postgres-js wraps the raw PostgresError in a Drizzle "Failed query: ..."
 * error. The constraint name lives in `error.cause.message`, not the top-level
 * `error.message`. This helper walks the cause chain so our assertions match
 * the right place.
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

describe("family_members self/dependent constraint", () => {
  it("rejects rows with both parent_user_id and self_user_id set", async () => {
    const db = getDb();
    const [u] = await db
      .select()
      .from(users)
      .orderBy(users.createdAt)
      .limit(1);
    expect(u).toBeDefined();

    await expectConstraintViolation(
      db.insert(familyMembers).values({
        parentUserId: u.id,
        selfUserId: u.id,
        firstName: "Bad",
        lastName: "Row",
        birthDate: "1990-01-01",
      }),
      /family_members_self_xor_parent/,
    );
  });

  it("rejects rows with neither parent_user_id nor self_user_id set", async () => {
    const db = getDb();
    await expectConstraintViolation(
      db.insert(familyMembers).values({
        firstName: "Orphan",
        lastName: "Row",
        birthDate: "1990-01-01",
      } as any),
      /family_members_self_xor_parent/,
    );
  });

  it("accepts a self-only row", async () => {
    const db = getDb();
    const [u] = await db
      .select()
      .from(users)
      .orderBy(users.createdAt)
      .limit(1);
    expect(u).toBeDefined();

    // Pre-clean: delete any existing self-row for this user to avoid
    // UNIQUE constraint failures from leaked rows in prior test runs.
    await db.delete(familyMembers).where(eq(familyMembers.selfUserId, u.id));

    const [row] = await db
      .insert(familyMembers)
      .values({
        selfUserId: u.id,
        firstName: u.firstName ?? "Test",
        lastName: u.lastName ?? "Self",
        birthDate: "1990-01-01",
      })
      .returning();
    expect(row.selfUserId).toBe(u.id);
    expect(row.parentUserId).toBeNull();
    // cleanup
    await db.delete(familyMembers).where(eq(familyMembers.id, row.id));
  });
});
