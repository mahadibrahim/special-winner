/**
 * Family dashboard class card — Task 2 of the classes-dashboard-launch plan.
 *
 * `MembershipChildCard` used to show a single "next class" line and could
 * only cancel THAT session (`handleCancel` read `child.nextSession` alone).
 * Task 1 widened `GET /api/classes/summary` to return every child's
 * `upcomingSessions` (soonest-first, up to 10) plus a top-level
 * `cancelWindowHours`; this spec pins the UI that actually lists them and
 * lets a parent cancel any ONE of several upcoming sessions, with a real
 * AlertDialog (never `window.confirm`) quoting the org's real cancel window.
 *
 * Fixture: a throwaway parent + child (never the shared
 * parent@test.aspiresports.com account — see class-pack-purchase.spec.ts's
 * header comment for why: that account has 400+ family_members rows, past
 * /api/classes/summary's MAX_CHILDREN cap), an active DB-minted membership
 * (no Stripe — same shorthand every classes E2E spec uses), and TWO future
 * `drop_in_sessions` rows each with a `confirmed` `drop_in_bookings` row —
 * the exact shape `tests/api/classes/summary.test.ts`'s `bookFutureSession`
 * helper mints, duplicated here rather than imported across the
 * tests/api / tests/e2e boundary (established repo convention — see this
 * file's sibling specs' "small pure functions duplicated per repo
 * convention" notes).
 */
import { test, expect } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { membershipTiers, memberships } from "@/lib/db/schema/memberships";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { createTestDropInSession, resolveDefaultOrgForHttpTests } from "../utils/dropin-helpers";
import {
  createTestChild,
  createTestChildMembership,
  cleanupTestMembershipTiers,
} from "../utils/classes-helpers";
import { createTestUserWithPassword } from "../utils/host-helpers";
import { signIn, waitForHydration } from "../utils/test-helpers";

/** Same shape as summary.test.ts's `bookFutureSession`: a `kind='class'`,
 *  `scheduled` drop_in_sessions row plus a `confirmed` booking for the
 *  child — no Stripe/cron involved. Returns both ids so the caller can pick
 *  a specific bookingId to cancel and clean up the session afterward. */
async function bookFutureSession(opts: {
  organizationId: string;
  venueId: string;
  userId: string;
  familyMemberId: string;
  startsAt: Date;
}): Promise<{ sessionId: string; bookingId: string }> {
  const db = getDb();
  const ctx = await createTestDropInSession({
    organizationId: opts.organizationId,
    venueId: opts.venueId,
    kind: "class",
    capacity: 10,
    startsAt: opts.startsAt,
  });
  const [booking] = await db
    .insert(dropInBookings)
    .values({
      sessionId: ctx.sessionId,
      userId: opts.userId,
      familyMemberId: opts.familyMemberId,
      status: "confirmed",
      source: "online_booking",
      paymentMethod: "member_allotment",
      amountPaidCents: 0,
    })
    .returning({ id: dropInBookings.id });
  return { sessionId: ctx.sessionId, bookingId: booking.id };
}

test.describe("Family dashboard — upcoming class sessions", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let venueId: string;
  let tierId: string;
  let membershipId: string;
  let parentEmail: string;
  let parentPassword: string;
  let parentUserId: string;
  let childId: string;
  let sessionEarlyId: string;
  let sessionLateId: string;

  const suffix = Date.now();
  const childFirstName = `DashboardSessionsE2E-${suffix}`;

  test.beforeAll(async () => {
    ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());
    const db = getDb();

    const [tier] = await db
      .insert(membershipTiers)
      .values({
        organizationId,
        name: `Makeup Tier 1 - e2e-dashboard-${suffix}`,
        monthlyPriceCents: 4900,
        benefits: { classes_per_month: 4 },
        isActive: true,
      })
      .returning();
    tierId = tier.id;

    const throwawayUser = await createTestUserWithPassword();
    parentEmail = throwawayUser.email;
    parentPassword = throwawayUser.password;
    parentUserId = throwawayUser.userId;

    childId = await createTestChild(parentUserId, childFirstName);
    membershipId = await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `e2e-dashboard-${suffix}`,
    });

    // Booked out of chronological order (later one first) so a passing
    // "soonest-first" / correct-row-cancelled assertion can't be an
    // accident of insertion order.
    const late = await bookFutureSession({
      organizationId,
      venueId,
      userId: parentUserId,
      familyMemberId: childId,
      startsAt: new Date(Date.now() + 5 * 86_400_000),
    });
    sessionLateId = late.sessionId;
    const early = await bookFutureSession({
      organizationId,
      venueId,
      userId: parentUserId,
      familyMemberId: childId,
      startsAt: new Date(Date.now() + 2 * 86_400_000),
    });
    sessionEarlyId = early.sessionId;
  });

  test.afterAll(async () => {
    const db = getDb();
    const sessionIds = [sessionEarlyId, sessionLateId].filter(Boolean);
    if (sessionIds.length > 0) {
      await db.delete(dropInBookings).where(inArray(dropInBookings.sessionId, sessionIds));
      await db
        .update(dropInSessions)
        .set({ status: "cancelled" })
        .where(inArray(dropInSessions.id, sessionIds));
    }
    if (membershipId) {
      await db.delete(memberships).where(eq(memberships.id, membershipId));
    }
    if (tierId) await cleanupTestMembershipTiers([tierId]);
  });

  test("family card lists all upcoming sessions and cancels a specific one with a windowed confirm", async ({
    page,
  }) => {
    await signIn(page, parentEmail, parentPassword);
    await page.goto("/dashboard/family");
    await waitForHydration(page);

    const card = page
      .locator("div.flex.items-start.gap-3.rounded-xl.border.border-border.border-l-4.p-3")
      .filter({ hasText: childFirstName });
    await expect(card).toBeVisible({ timeout: 15_000 });

    const rows = card.getByTestId("upcoming-session-row");
    await expect(rows).toHaveCount(2);

    await rows.nth(1).getByTestId("cancel-session").click();
    // useConfirmDialog renders an AlertDialog with the REAL window number:
    await expect(page.getByRole("alertdialog")).toContainText(/\d+ hours/);
    await page.getByRole("button", { name: "Cancel this class" }).click();

    await expect(rows).toHaveCount(1);
  });
});

/**
 * Task 3 of the classes-dashboard-launch plan.
 *
 * `WaiverNudge` used to be gated on `credits.length > 0` (both card
 * variants) — a membership child with zero leftover pack/block credits and
 * no valid annual waiver on file got no warning on the dashboard at all,
 * only discovering the problem when a real booking attempt 422s
 * `waiver_required`. `MembershipChildCard` must show the nudge whenever the
 * child has no valid waiver AND either a membership or a home-slot
 * enrollment — independent of credits.
 *
 * Fixture: a throwaway parent + child with an active DB-minted membership
 * (same shorthand as the suite above) and NO `class_credit_grants` rows and
 * NO `consents` row — a freshly-created child simply has no waiver signature
 * on file, so `hasWaiverOnFile` (summary.ts's annual-validity predicate)
 * comes back false with no special staging needed (see
 * class-pack-purchase.spec.ts's annual-waiver suites for the lapsed-
 * signature variant, which this scenario doesn't need — absent is enough).
 */
test.describe("Family dashboard — waiver nudge for membership children", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let tierId: string;
  let membershipId: string;
  let parentEmail: string;
  let parentPassword: string;
  let parentUserId: string;
  let childId: string;

  const suffix = Date.now();
  const childFirstName = `DashboardWaiverE2E-${suffix}`;

  test.beforeAll(async () => {
    ({ organizationId } = await resolveDefaultOrgForHttpTests());
    const db = getDb();

    const [tier] = await db
      .insert(membershipTiers)
      .values({
        organizationId,
        name: `Makeup Tier 1 - e2e-dashboard-waiver-${suffix}`,
        monthlyPriceCents: 4900,
        benefits: { classes_per_month: 4 },
        isActive: true,
      })
      .returning();
    tierId = tier.id;

    const throwawayUser = await createTestUserWithPassword();
    parentEmail = throwawayUser.email;
    parentPassword = throwawayUser.password;
    parentUserId = throwawayUser.userId;

    childId = await createTestChild(parentUserId, childFirstName);
    membershipId = await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `e2e-dashboard-waiver-${suffix}`,
    });
  });

  test.afterAll(async () => {
    const db = getDb();
    if (membershipId) {
      await db.delete(memberships).where(eq(memberships.id, membershipId));
    }
    if (tierId) await cleanupTestMembershipTiers([tierId]);
  });

  test("membership child with no valid waiver and no credits still gets the waiver nudge", async ({
    page,
  }) => {
    await signIn(page, parentEmail, parentPassword);
    await page.goto("/dashboard/family");
    await waitForHydration(page);

    const card = page
      .locator("div.flex.items-start.gap-3.rounded-xl.border.border-border.border-l-4.p-3")
      .filter({ hasText: childFirstName });
    await expect(card).toBeVisible({ timeout: 15_000 });

    await expect(card.getByTestId("waiver-attention")).toBeVisible();
  });
});
