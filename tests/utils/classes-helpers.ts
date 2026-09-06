import { and, asc, eq, inArray, or, like } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { membershipTiers, memberships } from "@/lib/db/schema/memberships";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { classSlotTemplates, classEnrollments, classCreditGrants } from "@/lib/db/schema/classes";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { resolveDefaultOrgForHttpTests } from "./dropin-helpers";

/**
 * Name of the shared "Test Class Slot" class-slot template fixture (Stage
 * 13c of seed-e2e-tests.ts) — the one template guaranteed to exist and stay
 * `active`, so any classes E2E/API fixture that needs "a real template with
 * a real upcoming session" targets this name rather than each spinning up
 * its own. Exported so callers building session fixtures against it (e.g.
 * tests/e2e/youth-classes-signup.spec.ts) share one literal, not two that
 * could drift apart.
 */
export const SHARED_CLASS_SLOT_TEMPLATE_NAME = "Test Class Slot";

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

  // Every classes API suite's beforeAll calls this — the trivially-
  // reachable shared spot to wire in the orphaned-session sweep (see that
  // function's doc comment) without every individual test file needing its
  // own opt-in call. Cheap no-op once a prior call in the same run already
  // cleared the debris (tests/api's fileParallelism:false means these never
  // race each other).
  await sweepOrphanedTestSessions(organizationId);

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
 * Inserts a membership row for a child directly, bypassing Stripe Checkout
 * entirely — same shorthand tests/api/memberships-child-subscribe.test.ts
 * uses for its "AlreadyMemberChild" fixture. `idSuffix` must be unique per
 * call: `memberships.stripeSubscriptionId` carries a DB unique constraint.
 * `status` defaults to "active"; pass "past_due" etc. for status-gated
 * fixtures (e.g. the billing-portal E2E coverage).
 */
export async function createTestChildMembership(opts: {
  userId: string;
  familyMemberId: string;
  organizationId: string;
  tierId: string;
  idSuffix: string;
  status?: "active" | "paused" | "past_due" | "incomplete" | "cancelled";
}): Promise<string> {
  const db = getDb();
  const [membership] = await db
    .insert(memberships)
    .values({
      userId: opts.userId,
      familyMemberId: opts.familyMemberId,
      organizationId: opts.organizationId,
      tierId: opts.tierId,
      status: opts.status ?? "active",
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
  /** CLASS rates copied onto every materialized session by the cron — set
   *  them when a test asserts an exact paid/quoted price, so the assertion
   *  never depends on the org's (adult pickup) rate-card fallback. */
  sessionRateCents?: number;
  memberRateCents?: number;
  /** Per-session BLOCK rate — what the block catalog quotes when set
   *  (`blockRateCents ?? sessionRateCents`, see /api/public/class-blocks). */
  blockRateCents?: number;
  /** Age range for the age-gate scenarios; both null (the default) = no gate. */
  minAge?: number;
  maxAge?: number;
  /** Technical band flag (Task 1) — surfaces as `isTechnical` on the public
   *  schedule and drives the enrollment engine's supplement gate. */
  isTechnical?: boolean;
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
      sessionRateCents: opts.sessionRateCents ?? null,
      memberRateCents: opts.memberRateCents ?? null,
      blockRateCents: opts.blockRateCents ?? null,
      minAge: opts.minAge ?? null,
      maxAge: opts.maxAge ?? null,
      active: opts.active ?? true,
      isTechnical: opts.isTechnical ?? false,
    })
    .returning();
  return row.id;
}

/**
 * Direct insert into the `class_credit_grants` ledger — the purchase path
 * that normally writes these rows is the Stripe webhook, which no API/E2E
 * test can drive (see class-pack-purchase.test.ts / class-block-purchase.test.ts
 * for the itWithStripe-gated checkout-URL-only coverage of that webhook
 * path). Mirrors the private `createCreditGrant` helper in
 * classes-credit-booking.test.ts, promoted here so Task 12's summary-API
 * tests and the class-pack-purchase E2E spec can share one implementation
 * rather than drifting apart.
 */
export async function createTestCreditGrant(opts: {
  organizationId: string;
  familyMemberId: string;
  sessionsGranted: number;
  idSuffix: string;
  source?: "pack" | "block" | "comp";
  packProductId?: string | null;
  blockId?: string | null;
  slotTemplateId?: string | null;
  expiresAt?: Date;
  /** Grants with source "comp" have no Checkout Session — default null for
   *  that source, `cs_test_credit_<idSuffix>` otherwise. Overridable for
   *  tests that need a specific (or explicit null) value. */
  stripeCheckoutSessionId?: string | null;
  grantedByUserId?: string | null;
}): Promise<string> {
  const db = getDb();
  const source = opts.source ?? "pack";
  const [grant] = await db
    .insert(classCreditGrants)
    .values({
      organizationId: opts.organizationId,
      familyMemberId: opts.familyMemberId,
      source,
      packProductId: opts.packProductId ?? null,
      blockId: opts.blockId ?? null,
      slotTemplateId: opts.slotTemplateId ?? null,
      sessionsGranted: opts.sessionsGranted,
      pricePaidCents: source === "comp" ? 0 : 9900,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 90 * 86_400_000),
      stripeCheckoutSessionId:
        opts.stripeCheckoutSessionId ??
        (source === "comp" ? null : `cs_test_credit_${opts.idSuffix}`),
      grantedByUserId: opts.grantedByUserId ?? null,
    })
    .returning({ id: classCreditGrants.id });
  return grant.id;
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
  "Admin-",
  "Credit-",
  "Catalog-",
  "Block-",
  "GuestTrial-",
  "Staffing-",
  "Portal-",
  "Assess-",
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
 * Identifies a DISPOSABLE, dynamically-generated test-fixture child:
 * `lastName === "Test"` (createTestChild's hardcoded value, above) AND a
 * digit somewhere in the first name — every dynamically-generated test
 * child across this codebase's classes/dropin suites follows the shape
 * `${prefix}-${Date.now()}[...]` (see createTestChild's callers throughout
 * tests/api/classes/*.test.ts and tests/e2e/youth-classes-signup.spec.ts),
 * always with a run-unique numeric timestamp embedded in the name.
 *
 * Deliberately does NOT match plain reused seed fixtures like "Tommy Test"
 * / "Sarah Test" (seed-e2e-tests.ts, live since 2026-05-20) even though
 * they also carry `lastName: "Test"` — those are long-lived and referenced
 * by unrelated suites (family/coach-notes, family/development-report,
 * coach/assessment-snapshots), so a booking under their name must never be
 * touched by an automated sweep. See `sweepOrphanedTestSessions`'s doc
 * comment for why this distinction is load-bearing there.
 */
function isDisposableTestChild(firstName: string, lastName: string): boolean {
  return lastName === "Test" && /\d/.test(firstName);
}

/**
 * Hygiene sweep for orphaned MATERIALIZED CLASS SESSIONS (`drop_in_sessions`
 * rows, not templates) left `scheduled` on:
 *   - any `class_slot_templates` row whose name matches a
 *     `TEST_TEMPLATE_NAME_PREFIXES` prefix (test-owned templates from the
 *     API suites — `sweepOrphanedTestTemplates` above deactivates the
 *     TEMPLATE but never touches its already-materialized sessions), and
 *   - the shared `SHARED_CLASS_SLOT_TEMPLATE_NAME` fixture ("Test Class
 *     Slot") that classes E2E specs book real sessions against.
 *
 * WHY THIS EXISTS: the booking UI (trial-booking.tsx, choose-slot.tsx)
 * always books the template's EARLIEST upcoming `scheduled` session, never
 * whichever session a spec just inserted — so a stale session from an
 * earlier run keeps absorbing every later run's bookings instead of ever
 * being superseded, and (without this sweep) accumulates cancelled-booking
 * debris forever. Found live while building the youth-classes-signup E2E
 * spec (Task 9 review): session `7abee084…` on "Test Class Slot" (created
 * 2026-08-23) had absorbed 13 cumulative bookings from unrelated runs by
 * the time this sweep was added.
 *
 * TWO SAFE ACTIONS, deliberately conservative:
 *   1. A scheduled session with ZERO `confirmed` bookings is cancelled
 *      outright (`status → 'cancelled'`) — no real seat is destroyed
 *      either way; this only stops it being picked as "the earliest
 *      session" by the booking UI on a future run.
 *   2. A scheduled session WITH confirmed bookings is left ENTIRELY alone
 *      unless EVERY one of those bookings' participant is an
 *      `isDisposableTestChild`. When they all match, those specific
 *      bookings are cancelled and — only if that leaves the session with
 *      zero confirmed bookings — the session itself is cancelled too. A
 *      session with even ONE non-matching confirmed booking (e.g. the
 *      long-lived seed fixtures above) is left completely untouched,
 *      booking and all: this sweep never cancels a booking it can't
 *      confidently attribute to a disposable test run.
 *
 * Safe to call unconditionally from a suite's `beforeAll` — same
 * `fileParallelism: false` / single-worker rationale as
 * `sweepOrphanedTestTemplates` above.
 */
export async function sweepOrphanedTestSessions(organizationId: string): Promise<void> {
  const db = getDb();

  const templates = await db
    .select({ id: classSlotTemplates.id })
    .from(classSlotTemplates)
    .where(
      and(
        eq(classSlotTemplates.organizationId, organizationId),
        or(
          eq(classSlotTemplates.name, SHARED_CLASS_SLOT_TEMPLATE_NAME),
          ...TEST_TEMPLATE_NAME_PREFIXES.map((prefix) => like(classSlotTemplates.name, `${prefix}%`)),
        ),
      ),
    );
  if (templates.length === 0) return;
  const templateIds = templates.map((t) => t.id);

  const sessions = await db
    .select({ id: dropInSessions.id })
    .from(dropInSessions)
    .where(
      and(
        inArray(dropInSessions.classSlotTemplateId, templateIds),
        eq(dropInSessions.status, "scheduled"),
        eq(dropInSessions.kind, "class"),
      ),
    );

  for (const session of sessions) {
    const confirmedBookings = await db
      .select({ id: dropInBookings.id, familyMemberId: dropInBookings.familyMemberId })
      .from(dropInBookings)
      .where(and(eq(dropInBookings.sessionId, session.id), eq(dropInBookings.status, "confirmed")));

    if (confirmedBookings.length === 0) {
      await db.update(dropInSessions).set({ status: "cancelled" }).where(eq(dropInSessions.id, session.id));
      continue;
    }

    const familyMemberIds = confirmedBookings
      .map((b) => b.familyMemberId)
      .filter((id): id is string => id !== null);
    const children = familyMemberIds.length
      ? await db
          .select({ id: familyMembers.id, firstName: familyMembers.firstName, lastName: familyMembers.lastName })
          .from(familyMembers)
          .where(inArray(familyMembers.id, familyMemberIds))
      : [];
    const childById = new Map(children.map((c) => [c.id, c]));

    const allDisposable = confirmedBookings.every((b) => {
      // No participant on file (shouldn't occur for kind='class', but be
      // safe) — never confidently attributable, so never touch.
      if (!b.familyMemberId) return false;
      const child = childById.get(b.familyMemberId);
      return child ? isDisposableTestChild(child.firstName, child.lastName) : false;
    });
    if (!allDisposable) continue; // conservative: leave session + bookings entirely alone

    await db
      .update(dropInBookings)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(
        inArray(
          dropInBookings.id,
          confirmedBookings.map((b) => b.id),
        ),
      );
    await db.update(dropInSessions).set({ status: "cancelled" }).where(eq(dropInSessions.id, session.id));
  }
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

/**
 * Name prefixes used by `cron-materialize.test.ts`'s per-suffix, per-run
 * `membership_tiers` rows ("Cron Tier 1 - <suffix>", "Cron Rates Tier 1 -
 * <suffix>" — the cap-1 tiers each test creates so an "exhausted" child only
 * needs a single prior booking). Mirrors `TEST_TEMPLATE_NAME_PREFIXES` above:
 * a single source of truth for both the creating file's naming convention
 * and `sweepOrphanedTestMembershipTiers`'s matching.
 *
 * These tiers previously had no teardown at all (unlike templates, which
 * always had `cleanupTestClassFixtures`), so they leaked one active row per
 * CI run straight onto `/api/public/membership-tiers` — every one of them
 * carries `classes_per_month: 1`, which is indistinguishable from a real
 * class-membership tier to any consumer filtering on that key (e.g.
 * `src/components/youth/class-tiers.tsx`'s public pricing card).
 */
export const TEST_MEMBERSHIP_TIER_NAME_PREFIXES = [
  "Cron Tier 1 - ",
  "Cron Rates Tier 1 - ",
  "Makeup Tier 1 - ",
] as const;

/**
 * One-time hygiene sweep for pre-existing orphaned test membership tiers:
 * sets `isActive: false` on every ACTIVE `membership_tiers` row in the org
 * whose name matches a `TEST_MEMBERSHIP_TIER_NAME_PREFIXES` prefix. Same
 * shape and rationale as `sweepOrphanedTestTemplates` — going forward,
 * `cleanupTestMembershipTiers` (called from each creating file's `afterAll`)
 * is the primary defense; this sweep cleans up the debris that accumulated
 * before that existed, plus any crashed/timed-out run that never reached
 * its `afterAll`. Safe to call unconditionally from `beforeAll`: `tests/api`
 * runs with `fileParallelism: false`, so this can't race a sibling file's
 * in-progress fixture creation.
 */
export async function sweepOrphanedTestMembershipTiers(organizationId: string): Promise<void> {
  const db = getDb();
  await db
    .update(membershipTiers)
    .set({ isActive: false })
    .where(
      and(
        eq(membershipTiers.organizationId, organizationId),
        eq(membershipTiers.isActive, true),
        or(
          ...TEST_MEMBERSHIP_TIER_NAME_PREFIXES.map((prefix) => like(membershipTiers.name, `${prefix}%`)),
        ),
      ),
    );
}

/**
 * Per-test-file teardown: deactivates every membership tier this file
 * created, so nothing it touched remains `active` (and therefore visible on
 * `/api/public/membership-tiers`) after the run. Call from `afterAll`.
 * Idempotent — safe to call with ids already `isActive: false`.
 */
export async function cleanupTestMembershipTiers(tierIds: string[]): Promise<void> {
  if (tierIds.length === 0) return;
  const db = getDb();
  await db.update(membershipTiers).set({ isActive: false }).where(inArray(membershipTiers.id, tierIds));
}
