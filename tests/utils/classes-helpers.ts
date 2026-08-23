import { and, asc, eq, inArray, or, like } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { membershipTiers, memberships } from "@/lib/db/schema/memberships";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { classSlotTemplates, classEnrollments } from "@/lib/db/schema/classes";
import { resolveDefaultOrgForHttpTests } from "./dropin-helpers";

export const CLASS_TEST_PARENT_EMAIL = "parent@test.aspiresports.com";
export const CLASS_TEST_PARENT_PASSWORD = "TestParent123!";

/** A generic guardian waiver payload — satisfies `POST /api/classes/book`'s
 *  `waiver: { signedBy, consentText }` shape when a child has no waiver on
 *  file yet. */
export const CLASS_TEST_WAIVER = {
  signedBy: "Parent Test",
  consentText: "I agree to the guardian waiver on behalf of my child.",
};

/**
 * Resolves the shared fixtures every `tests/api/classes/*` suite needs:
 * - the org/venue HTTP requests to `localhost` actually resolve to (same
 *   trick as `resolveDefaultOrgForHttpTests` in dropin-helpers.ts — classes
 *   endpoints are tenant-guarded the same way drop-in endpoints are);
 * - the seeded parent test user (`tests/api/setup/test-helpers.ts`'s
 *   `getAuthCookie` account);
 * - the "Test Class Tier 4" membership tier fixture (seed-e2e-tests.ts
 *   Stage 13b — `benefits: { classes_per_month: 4 }`), reused across
 *   book/enrollments/schedule suites for any scenario that just needs SOME
 *   active class-benefit tier. Capacity/exhaustion scenarios that need a
 *   tight, test-owned cap create their own tier directly instead (see
 *   cron-materialize.test.ts).
 *
 * Throws with an actionable message if a fixture is missing, rather than
 * letting every test in the suite fail later on a null-id insert.
 */
export async function resolveClassTestFixtures(): Promise<{
  organizationId: string;
  venueId: string;
  parentUserId: string;
  tierId: string;
}> {
  const db = getDb();
  const { organizationId, venueId } = await resolveDefaultOrgForHttpTests();

  const [parent] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, CLASS_TEST_PARENT_EMAIL))
    .limit(1);
  if (!parent) {
    throw new Error(
      `${CLASS_TEST_PARENT_EMAIL} is not seeded — run npm run db:seed:e2e before this suite`,
    );
  }

  const [tier] = await db
    .select({ id: membershipTiers.id })
    .from(membershipTiers)
    .where(
      and(
        eq(membershipTiers.organizationId, organizationId),
        eq(membershipTiers.name, "Test Class Tier 4"),
      ),
    )
    .orderBy(asc(membershipTiers.createdAt))
    .limit(1);
  if (!tier) {
    throw new Error(
      '"Test Class Tier 4" membership tier fixture is missing — run npm run db:seed:e2e before this suite',
    );
  }

  return { organizationId, venueId, parentUserId: parent.id, tierId: tier.id };
}

/** Inserts a fresh `family_members` row (dependent/COPPA path — the parent
 *  test account owns it) with a unique name. Direct insert rather than
 *  `resolvePerson()` is the established test-fixture convention (see
 *  tests/api/memberships-child-subscribe.test.ts) — dedupe only matters for
 *  real registration writes, not disposable per-test fixtures. */
export async function createTestChild(
  parentUserId: string,
  firstName: string,
  birthDate = "2016-01-01",
): Promise<string> {
  const db = getDb();
  const [child] = await db
    .insert(familyMembers)
    .values({ parentUserId, firstName, lastName: "Test", birthDate })
    .returning({ id: familyMembers.id });
  return child.id;
}

/**
 * Inserts an ACTIVE membership row for a child directly, bypassing Stripe
 * Checkout entirely — same shorthand tests/api/memberships-child-subscribe.test.ts
 * uses for its "AlreadyMemberChild" fixture. `idSuffix` must be unique per
 * call: `memberships.stripeSubscriptionId` carries a DB unique constraint.
 */
export async function createTestChildMembership(opts: {
  userId: string;
  familyMemberId: string;
  organizationId: string;
  tierId: string;
  idSuffix: string;
}): Promise<string> {
  const db = getDb();
  const [membership] = await db
    .insert(memberships)
    .values({
      userId: opts.userId,
      familyMemberId: opts.familyMemberId,
      organizationId: opts.organizationId,
      tierId: opts.tierId,
      status: "active",
      billingInterval: "month",
      stripeSubscriptionId: `sub_test_classes_${opts.idSuffix}`,
      stripeCustomerId: `cus_test_classes_${opts.idSuffix}`,
    })
    .returning();
  return membership.id;
}

/**
 * Inserts a `class_slot_templates` row for test use. Every fixture-creating
 * `tests/api/classes/*.test.ts` file MUST name its templates with one of
 * `TEST_TEMPLATE_NAME_PREFIXES` (below) and pass every id this returns to
 * `cleanupTestClassFixtures` in its own `afterAll` — see that function's
 * doc comment for why: `materializeClassSessions` sweeps EVERY `active`
 * template on EVERY cron invocation, so an orphaned test template directly
 * slows down (and adds booking-failure noise to) the very cron this suite
 * tests, and the slowdown compounds with every CI run that doesn't clean
 * up after itself.
 */
export async function createTestClassTemplate(opts: {
  organizationId: string;
  venueId: string;
  name: string;
  capacity: number;
  active?: boolean;
  weekday?: number;
  startTime?: string;
}): Promise<string> {
  const db = getDb();
  // Materialization horizon is 8 days (HORIZON_DAYS in
  // src/lib/classes/materialize.ts), so every weekday 0-6 recurs at least
  // once inside it — "3 days from now" is picked purely for readability.
  const weekday = opts.weekday ?? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).getUTCDay();
  const [row] = await db
    .insert(classSlotTemplates)
    .values({
      organizationId: opts.organizationId,
      venueId: opts.venueId,
      name: opts.name,
      sportLabel: "Soccer",
      weekday,
      startTime: opts.startTime ?? "16:00:00",
      durationMins: 55,
      capacity: opts.capacity,
      active: opts.active ?? true,
    })
    .returning();
  return row.id;
}

/**
 * Name prefixes used by every `class_slot_templates` row `tests/api/classes/
 * *.test.ts` creates. Kept as a single source of truth for both
 * `createTestClassTemplate` callers' naming convention and
 * `sweepOrphanedTestTemplates`'s matching — a mismatch here would silently
 * defeat the sweep.
 */
export const TEST_TEMPLATE_NAME_PREFIXES = [
  "Enroll-",
  "Move-",
  "Delete-",
  "Schedule-Slot-",
  "Summary-Slot-",
  "Cron-Template-",
] as const;

/**
 * One-time hygiene sweep for pre-existing orphaned test templates: sets
 * `active: false` on every ACTIVE `class_slot_templates` row in the org
 * whose name matches a `TEST_TEMPLATE_NAME_PREFIXES` prefix. Every
 * fixture-creating test file's own `afterAll` (via `cleanupTestClassFixtures`)
 * is the primary defense against leaks going forward — this sweep exists
 * for (a) the debris that accumulated before that cleanup existed, and (b)
 * a crashed/timed-out run that never reached its `afterAll`.
 *
 * Safe to call unconditionally from every file's `beforeAll`: `tests/api`
 * runs with `fileParallelism: false` (vitest.config.ts), so test files in
 * this suite never run concurrently and this can't race a sibling file's
 * in-progress fixture creation.
 */
export async function sweepOrphanedTestTemplates(organizationId: string): Promise<void> {
  const db = getDb();
  await db
    .update(classSlotTemplates)
    .set({ active: false })
    .where(
      and(
        eq(classSlotTemplates.organizationId, organizationId),
        eq(classSlotTemplates.active, true),
        or(...TEST_TEMPLATE_NAME_PREFIXES.map((prefix) => like(classSlotTemplates.name, `${prefix}%`))),
      ),
    );
}

/**
 * Per-test-file teardown: deactivates every template this file created and
 * ends every enrollment it created (or drove through the API), so nothing
 * this run touched remains `active` for the next `materializeClassSessions`
 * sweep to pick up. Call from `afterAll`. Both arrays may safely contain
 * ids already in their terminal state (e.g. an enrollment a test already
 * `DELETE`d) — the updates are idempotent.
 */
export async function cleanupTestClassFixtures(
  templateIds: string[],
  enrollmentIds: string[] = [],
): Promise<void> {
  const db = getDb();
  if (enrollmentIds.length > 0) {
    await db
      .update(classEnrollments)
      .set({ status: "ended", endedAt: new Date() })
      .where(inArray(classEnrollments.id, enrollmentIds));
  }
  if (templateIds.length > 0) {
    await db
      .update(classSlotTemplates)
      .set({ active: false })
      .where(inArray(classSlotTemplates.id, templateIds));
  }
}
