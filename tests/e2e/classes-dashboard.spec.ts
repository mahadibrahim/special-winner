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
import { classEnrollments } from "@/lib/db/schema/classes";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { createTestDropInSession, resolveDefaultOrgForHttpTests } from "../utils/dropin-helpers";
import {
  createTestChild,
  createTestChildMembership,
  cleanupTestMembershipTiers,
  createTestClassTemplate,
  createTestCreditGrant,
  cleanupTestClassFixtures,
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

/**
 * Task 4 of the classes-dashboard-launch plan (closes #608).
 *
 * `POST /api/classes/book` returns 409 `technical_not_included` when a
 * member's monthly allotment can't book a technical session (the tier owes
 * the technical supplement and the child holds no active technical
 * enrollment — src/lib/classes/technical-premium.ts). `MakeUpModal` used to
 * dump that raw error code into the generic `ErrorBanner`, leaving the
 * parent with no path forward. It must instead show an info-tone upsell
 * panel quoting the tier's real `technicalMonthlyCents` (Task 1 of this plan
 * widened `GET /api/classes/summary` to return it per child) and link to the
 * choose-slot flow, which already owns the `acknowledgeTechnicalPremium` PUT.
 *
 * Fixture: a throwaway parent + child (same shorthand as the suites above)
 * on a DB-minted membership tier with a LIMITED (non-unlimited) class
 * benefit and `technicalMonthlyCents: 900` — both conditions
 * `requiresTechnicalPremium` needs to fire — and a materialized
 * `drop_in_sessions` row pinned to a fresh `isTechnical: true`
 * `class_slot_templates` row (mirrors `tests/api/classes-technical-
 * enrollment.test.ts`'s booking-gate fixture). The child has NO active
 * technical enrollment, so the allotment gate refuses the booking.
 */
test.describe("Family dashboard — technical make-up 409 routes to upsell", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let venueId: string;
  let tierId: string;
  let templateId: string;
  let membershipId: string;
  let parentEmail: string;
  let parentPassword: string;
  let parentUserId: string;
  let childId: string;
  let technicalSessionId: string;

  const suffix = Date.now();
  const childFirstName = `DashboardTechUpsellE2E-${suffix}`;
  const templateName = `Enroll-DashboardTechUpsell-${suffix}`;

  test.beforeAll(async () => {
    ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());
    const db = getDb();

    const [tier] = await db
      .insert(membershipTiers)
      .values({
        organizationId,
        name: `Makeup Tier 1 - e2e-dashboard-tech-${suffix}`,
        monthlyPriceCents: 4900,
        benefits: { classes_per_month: 4 },
        technicalMonthlyCents: 900,
        isActive: true,
      })
      .returning();
    tierId = tier.id;

    templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: templateName,
      capacity: 10,
      isTechnical: true,
    });

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
      idSuffix: `e2e-dashboard-tech-${suffix}`,
    });

    // A materialized technical session, pinned to the template above — same
    // shorthand as classes-technical-enrollment.test.ts's `createClassSession`
    // (no need to wait on the real cron materialization for a booking-gate
    // scenario).
    const { sessionId } = await createTestDropInSession({
      organizationId,
      venueId,
      kind: "class",
      capacity: 10,
      startsAt: new Date(Date.now() + 3 * 86_400_000),
    });
    technicalSessionId = sessionId;
    await db
      .update(dropInSessions)
      .set({ classSlotTemplateId: templateId })
      .where(eq(dropInSessions.id, technicalSessionId));
  });

  test.afterAll(async () => {
    const db = getDb();
    if (technicalSessionId) {
      await db.delete(dropInBookings).where(eq(dropInBookings.sessionId, technicalSessionId));
      await db
        .update(dropInSessions)
        .set({ status: "cancelled" })
        .where(eq(dropInSessions.id, technicalSessionId));
    }
    if (membershipId) {
      await db.delete(memberships).where(eq(memberships.id, membershipId));
    }
    if (templateId) await cleanupTestClassFixtures([templateId]);
    if (tierId) await cleanupTestMembershipTiers([tierId]);
  });

  test("technical_not_included 409 shows the supplement upsell, not an ErrorBanner", async ({
    page,
  }) => {
    await signIn(page, parentEmail, parentPassword);
    await page.goto("/dashboard/family");
    await waitForHydration(page);

    const card = page
      .locator("div.flex.items-start.gap-3.rounded-xl.border.border-border.border-l-4.p-3")
      .filter({ hasText: childFirstName });
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.getByRole("button", { name: "Book a make-up" }).click();

    const modal = page.getByRole("dialog");
    await expect(modal.getByText(templateName)).toBeVisible({ timeout: 15_000 });
    await modal.getByRole("button", { name: new RegExp(templateName) }).click();

    const upsell = modal.getByTestId("technical-upsell");
    await expect(upsell).toBeVisible({ timeout: 15_000 });
    await expect(upsell).toContainText("$9");
    await expect(modal.getByRole("alert")).toHaveCount(0);
    await expect(
      upsell.getByRole("link", { name: /add|technical|supplement/i }),
    ).toBeVisible();

    await modal.getByRole("button", { name: "Not now" }).click();
    await expect(modal).toBeHidden();
  });
});

/**
 * Task 5 of the classes-dashboard-launch plan (issue #601, F6 item).
 *
 * The tail of a block: the credit grant backing a child's enrollment has
 * `remaining: 0` (every purchased session is already spent) but one of
 * those spends is a still-upcoming CONFIRMED session — the family hasn't
 * actually attended their last class yet. `GET /api/classes/summary`'s
 * `credits` array is filtered to spendable balances only (`remaining > 0`),
 * so it comes back `[]`; with no membership and no trial use either, the
 * qualifying predicate used to drop this child entirely — no card, no
 * End-enrollment control, no explicit way to give up the seat before the
 * block quietly lapses.
 *
 * Fixture: a throwaway parent + child, an INACTIVE (pin-only) class-slot
 * template, a `source: "block"` credit grant with `sessionsGranted: 1`
 * pinned to that template, a `class_enrollments` row pointing at the grant
 * (mirrors classes-credit-booking.test.ts's `CreditFloatOnEnd` fixture,
 * `classes-credit-booking.test.ts:330-361`), and ONE future
 * `drop_in_sessions` row with a `confirmed` `pack_credit` booking that spends
 * the grant's only session — `getCreditBalances` counts it against
 * `sessionsGranted`, so the grant reads `remaining: 0` even though the
 * session itself hasn't happened yet.
 */
test.describe("Family dashboard — tail-of-block End-enrollment control", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let venueId: string;
  let templateId: string;
  let grantId: string;
  let tailSessionId: string;
  let parentEmail: string;
  let parentPassword: string;
  let parentUserId: string;
  let childId: string;
  let enrollmentId: string;

  const suffix = Date.now();
  const childFirstName = `DashboardTailBlockE2E-${suffix}`;
  const templateName = `Credit-DashboardTailBlock-${suffix}`;

  test.beforeAll(async () => {
    ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());
    const db = getDb();

    const throwawayUser = await createTestUserWithPassword();
    parentEmail = throwawayUser.email;
    parentPassword = throwawayUser.password;
    parentUserId = throwawayUser.userId;

    childId = await createTestChild(parentUserId, childFirstName);

    templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: templateName,
      capacity: 10,
      active: false, // pin target only, never materialized by the class cron
    });

    grantId = await createTestCreditGrant({
      organizationId,
      familyMemberId: childId,
      sessionsGranted: 1,
      idSuffix: `e2e-dashboard-tail-${suffix}`,
      source: "block",
      slotTemplateId: templateId,
    });

    const [enrollment] = await db
      .insert(classEnrollments)
      .values({ slotTemplateId: templateId, familyMemberId: childId, creditGrantId: grantId })
      .returning({ id: classEnrollments.id });
    enrollmentId = enrollment.id;

    const ctx = await createTestDropInSession({
      organizationId,
      venueId,
      kind: "class",
      capacity: 10,
      startsAt: new Date(Date.now() + 3 * 86_400_000),
    });
    tailSessionId = ctx.sessionId;

    await db.insert(dropInBookings).values({
      sessionId: tailSessionId,
      userId: parentUserId,
      familyMemberId: childId,
      status: "confirmed",
      source: "online_booking",
      paymentMethod: "pack_credit",
      creditGrantId: grantId,
      amountPaidCents: 0,
    });
  });

  test.afterAll(async () => {
    const db = getDb();
    if (tailSessionId) {
      await db.delete(dropInBookings).where(eq(dropInBookings.sessionId, tailSessionId));
      await db
        .update(dropInSessions)
        .set({ status: "cancelled" })
        .where(eq(dropInSessions.id, tailSessionId));
    }
    if (templateId) await cleanupTestClassFixtures([templateId], enrollmentId ? [enrollmentId] : []);
  });

  test("child at the tail of a block still renders a card with the End-enrollment control", async ({
    page,
  }) => {
    await signIn(page, parentEmail, parentPassword);
    await page.goto("/dashboard/family");
    await waitForHydration(page);

    const card = page
      .locator("div.flex.items-start.gap-3.rounded-xl.border.border-border.border-l-4.p-3")
      .filter({ hasText: childFirstName });
    await expect(card).toBeVisible({ timeout: 15_000 });

    await expect(card.getByTestId("end-enrollment")).toBeVisible();
  });
});

/**
 * Task 6 of the classes-dashboard-launch plan.
 *
 * A child with none of the four qualifying signals (no membership, no used
 * trial, no credits, no enrollment) rendered nothing at all on the family
 * dashboard, and neither `family.astro`'s Explore band nor `/dashboard/start`
 * linked to `/youth/classes` — the youth classes funnel had no discovery
 * entry point anywhere in the parent dashboard. `FamilyClassesCard` now
 * renders a single family-level `DiscoverCard` (`data-testid=
 * "discover-classes"`, links to `/youth/classes`) whenever at least one
 * child fails all four signals; `family.astro`'s Explore band grew a
 * matching "Weekly classes" card; `/dashboard/start` grew a third door.
 * All three are Aspire-only (`Astro.locals.brandId === "aspire"` /
 * `brandId !== "soccerone"` prop) since `/youth/classes` is Aspire's youth
 * funnel — the dev server under test resolves plain `localhost` to Aspire
 * (see soccerone-routing.ts's `SOCCERONE_HOSTS`), so these assertions run
 * against the gate being OPEN.
 *
 * Fixture: a throwaway parent + child with zero class touchpoints — no
 * membership, no credits, no enrollment, no trial booking. Nothing to mint;
 * `createTestChild` alone is enough to reach the "discoverable" branch.
 */
test.describe("Family dashboard — class discovery entry points", () => {
  test.setTimeout(60_000);

  let parentEmail: string;
  let parentPassword: string;
  let parentUserId: string;
  let childId: string;

  const suffix = Date.now();
  const childFirstName = `DashboardDiscoverE2E-${suffix}`;

  test.beforeAll(async () => {
    const throwawayUser = await createTestUserWithPassword();
    parentEmail = throwawayUser.email;
    parentPassword = throwawayUser.password;
    parentUserId = throwawayUser.userId;

    childId = await createTestChild(parentUserId, childFirstName);
  });

  test("family page shows one discover-classes card naming the child, linking to /youth/classes", async ({
    page,
  }) => {
    await signIn(page, parentEmail, parentPassword);
    await page.goto("/dashboard/family");
    await waitForHydration(page);

    const discoverLink = page.getByTestId("discover-classes");
    await expect(discoverLink).toBeVisible({ timeout: 15_000 });
    await expect(discoverLink).toHaveAttribute("href", "/youth/classes");
    await expect(discoverLink).toHaveCount(1);

    // Scope the name assertion to the discover card itself (same
    // DashboardCard shell/locator pattern the suites above use) —
    // `ChildrenOverview`, elsewhere on this same page, independently lists
    // every child by full name, so an unscoped page-wide text search is
    // ambiguous.
    const card = page
      .locator("div.flex.items-start.gap-3.rounded-xl.border.border-border.border-l-4.p-3")
      .filter({ has: discoverLink });
    await expect(card).toContainText(childFirstName);
  });

  test("family page Explore band links to /youth/classes", async ({ page }) => {
    await signIn(page, parentEmail, parentPassword);
    await page.goto("/dashboard/family");

    // Scoped to <main> — Navigation and Footer (siblings of <main> in
    // BaseLayout) already link to /youth/classes site-wide ("Classes" /
    // "Classes & clinics"), which would otherwise make an unscoped
    // `a[href="/youth/classes"]` locator ambiguous.
    await expect(
      page.locator('main a[href="/youth/classes"]').filter({ hasText: /weekly classes|discover classes/i }),
    ).toBeVisible();
  });

  test("/dashboard/start shows a door linking to /youth/classes", async ({ page }) => {
    await signIn(page, parentEmail, parentPassword);
    await page.goto("/dashboard/start", { waitUntil: "domcontentloaded" });

    // Scoped to <main> for the same reason as above.
    await expect(page.locator('main a[href="/youth/classes"]')).toBeVisible();
  });
});

/**
 * Task 6 (continued) — at most ONE discover card per family, regardless of
 * how many children fail the qualifying predicate.
 */
test.describe("Family dashboard — one discover card per family, not one per child", () => {
  test.setTimeout(60_000);

  let parentEmail: string;
  let parentPassword: string;
  let parentUserId: string;

  const suffix = Date.now();
  const firstChildName = `DashboardDiscoverMultiA-${suffix}`;
  const secondChildName = `DashboardDiscoverMultiB-${suffix}`;

  test.beforeAll(async () => {
    const throwawayUser = await createTestUserWithPassword();
    parentEmail = throwawayUser.email;
    parentPassword = throwawayUser.password;
    parentUserId = throwawayUser.userId;

    await createTestChild(parentUserId, firstChildName);
    await createTestChild(parentUserId, secondChildName);
  });

  test("two children with zero class touchpoints still render exactly one discover card, naming both", async ({
    page,
  }) => {
    await signIn(page, parentEmail, parentPassword);
    await page.goto("/dashboard/family");
    await waitForHydration(page);

    const discoverLink = page.getByTestId("discover-classes");
    await expect(discoverLink).toBeVisible({ timeout: 15_000 });
    await expect(discoverLink).toHaveCount(1);

    const card = page
      .locator("div.flex.items-start.gap-3.rounded-xl.border.border-border.border-l-4.p-3")
      .filter({ has: discoverLink });
    await expect(card).toContainText(firstChildName);
    await expect(card).toContainText(secondChildName);
  });
});
