import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { membershipTiers, memberships } from "@/lib/db/schema/memberships";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
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
