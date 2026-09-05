/**
 * Schema smoke test for Task S1 of the 2026-09-05-player-snapshots-phase3
 * plan: migration 0147's period-keyed `assessment_snapshots` — the natural
 * key moves from (family_member_id, season_id, domain_id) to
 * (family_member_id, period_key, domain_id), and `season_id` becomes
 * nullable. Not an HTTP test — inserts directly against the live DB, same
 * pattern as tests/api/coaching/assignments-schema.test.ts and
 * tests/api/schema-self-person.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, asc, and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { skillDomains, skills } from "@/lib/db/schema/curriculum";
import { assessmentSnapshots } from "@/lib/db/schema/assessments";
import { createTestChild } from "../../utils/classes-helpers";

/**
 * postgres-js wraps the raw PostgresError in a Drizzle "Failed query: ..."
 * error. The constraint name lives in `error.cause.message`, not the
 * top-level `error.message`. Mirrors the identically-named helper in
 * tests/api/coaching/assignments-schema.test.ts and
 * tests/api/schema-self-person.test.ts.
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

describe("assessment_snapshots period-key schema (migration 0147)", () => {
  let familyMemberId: string;
  let domainId: string;

  const createdSnapshotIds: string[] = [];

  beforeAll(async () => {
    const db = getDb();

    // Seeded parent (tests/api/setup/test-helpers.ts's getAuthCookie
    // account) — multi-tenant hazard: explicit orderBy per CLAUDE.md.
    const [parent] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "parent@test.aspiresports.com"))
      .orderBy(asc(users.createdAt))
      .limit(1);
    if (!parent) {
      throw new Error(
        "snapshot-schema test: seeded parent@test.aspiresports.com not found — run npm run db:seed:e2e first",
      );
    }
    familyMemberId = await createTestChild(parent.id, `SnapshotSchema-${Date.now()}`);

    // Any skill domain works — these tests don't touch domain-specific
    // behavior, just the (family_member_id, period_key, domain_id) key.
    // skill_domains is seeded by the curriculum content loader
    // (scripts/curriculum-load.ts), not by db:seed:e2e.
    const [domain] = await db
      .select({ id: skillDomains.id })
      .from(skillDomains)
      .orderBy(asc(skillDomains.createdAt))
      .limit(1);
    if (!domain) {
      throw new Error(
        "snapshot-schema test: no skill_domains row found — run the curriculum loader " +
          "(scripts/curriculum-load.ts) against this database first",
      );
    }
    domainId = domain.id;
  });

  afterAll(async () => {
    const db = getDb();
    if (createdSnapshotIds.length > 0) {
      await db
        .delete(assessmentSnapshots)
        .where(inArray(assessmentSnapshots.id, createdSnapshotIds));
    }
    await db.delete(familyMembers).where(eq(familyMembers.id, familyMemberId));
  });

  it("accepts a row with season_id null (period_key carries the temporal bucket)", async () => {
    const db = getDb();
    const [row] = await db
      .insert(assessmentSnapshots)
      .values({
        familyMemberId,
        // no seasonId — this is the point of the migration: season_id is
        // nullable now, period_key is the required temporal key.
        periodKey: "2026-09",
        domainId,
        averageLevel: "3.00",
        assessmentCount: 1,
        skillsAssessed: 1,
      })
      .returning();
    createdSnapshotIds.push(row.id);

    expect(row.seasonId).toBeNull();
    expect(row.periodKey).toBe("2026-09");
  });

  it("rejects an exact duplicate (family_member_id, period_key, domain_id)", async () => {
    const db = getDb();
    const [row] = await db
      .insert(assessmentSnapshots)
      .values({
        familyMemberId,
        periodKey: "2026-10",
        domainId,
        averageLevel: "2.50",
        assessmentCount: 1,
        skillsAssessed: 1,
      })
      .returning();
    createdSnapshotIds.push(row.id);

    await expectConstraintViolation(
      db.insert(assessmentSnapshots).values({
        familyMemberId,
        periodKey: "2026-10",
        domainId,
        averageLevel: "4.00",
        assessmentCount: 1,
        skillsAssessed: 1,
      }),
      /assessment_snapshots_member_period_domain_uniq/,
    );
  });

  it("allows a legacy period key and a monthly period key to coexist for the same member+domain", async () => {
    const db = getDb();
    const legacySeasonId = crypto.randomUUID();

    const [legacyRow] = await db
      .insert(assessmentSnapshots)
      .values({
        familyMemberId,
        periodKey: `legacy:${legacySeasonId}`,
        domainId,
        averageLevel: "3.50",
        assessmentCount: 2,
        skillsAssessed: 2,
      })
      .returning();
    createdSnapshotIds.push(legacyRow.id);

    const [monthlyRow] = await db
      .insert(assessmentSnapshots)
      .values({
        familyMemberId,
        periodKey: "2026-11",
        domainId,
        averageLevel: "4.00",
        assessmentCount: 1,
        skillsAssessed: 1,
      })
      .returning();
    createdSnapshotIds.push(monthlyRow.id);

    // Both rows exist independently — the old (member, season, domain)
    // uniqueness would not have distinguished these (season_id is null on
    // both), but period_key does.
    expect(legacyRow.id).not.toBe(monthlyRow.id);
    expect(legacyRow.periodKey).toBe(`legacy:${legacySeasonId}`);
    expect(monthlyRow.periodKey).toBe("2026-11");
  });
});
