/**
 * Youth classes signup E2E — two independent flows through the same shared
 * "Test Class Slot" class-slot template fixture (seeded idempotently by
 * seed-e2e-tests.ts Stage 13c):
 *
 *  1. Trial-led: an authed parent books a free trial from the public
 *     /youth/classes page, adding a brand-new player through the trial
 *     modal's own "+ Add a player" form (exercising that path too), then
 *     signs the guardian waiver and confirms.
 *  2. Choose-slot standalone: an authed parent with a pre-seeded
 *     class-membership child lands on /dashboard/family/choose-slot,
 *     enrolls the child's standing weekly seat, books the first class, and
 *     signs the waiver when prompted.
 *  3. Signed-out guest trial (spec 2026-09-05): a genuinely signed-out
 *     visitor books a free trial entirely inline — guest form (parent +
 *     child + COPPA + Turnstile) → guardian waiver → success — never
 *     bouncing to /signin. Runs in its own fresh browser context (no
 *     signIn() call) so it can't inherit auth state from the other specs'
 *     `page` fixture. Cleanup is direct-via-drizzle rather than an API
 *     cancel call: the guest account this flow creates has no password to
 *     authenticate a cancel request with.
 *
 * IMPORTANT — what the seeded session actually guarantees: both specs
 * insert their own future `drop_in_sessions` row against the shared
 * template (the seed only creates the standing template, never a
 * materialized session — see that fixture's comment in
 * seed-e2e-tests.ts), but the booking UI (trial-booking.tsx,
 * choose-slot.tsx) always books the template's EARLIEST upcoming
 * `scheduled` session, not the one a spec just inserted. On shared staging
 * that's very often an older session left over from a previous run, not
 * this run's own row. So the seeded session guarantees only that AT LEAST
 * ONE bookable session exists for the template (covering the "no upcoming
 * session" empty state) — it does NOT guarantee isolation from other
 * runs' bookings, and cleanup below finds "the booking" by CHILD (whatever
 * session it actually landed on), never by the session this spec created.
 *
 * These run post-merge only (test-full — see CLAUDE.md's Playwright
 * conventions section), against the SHARED staging DB, so both specs:
 *   - call `sweepOrphanedTestSessions` before seeding, to cancel stale
 *     `scheduled` sessions on this template left behind by earlier runs
 *     (crashed/timed-out runs that never reached their own `afterAll`) —
 *     see that function's doc comment for exactly what it will and will
 *     not touch;
 *   - use uniquely-named fixtures and retire everything they create in
 *     `afterAll` (booking cancelled via the real API — found by child, not
 *     by session — enrollment ended, membership deactivated, the session
 *     row THIS RUN inserted deleted);
 *   - never assert on absolute counts (spots-left, booking totals) — only
 *     on this run's own outcome.
 *
 * Both flows can independently hit a `session_full` response on the final
 * booking attempt if the shared template's earliest upcoming session has
 * filled up from unrelated activity:
 *   - trial-booking.tsx surfaces an explicit "Book that class" offer for
 *     the next session instead of auto-booking — the trial spec below
 *     handles that one extra click.
 *   - choose-slot.tsx degrades directly to a soft "you're enrolled, we'll
 *     pick this up automatically" success instead, so no extra handling is
 *     needed there.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classSlotTemplates, classEnrollments } from "@/lib/db/schema/classes";
import { dropInSessions, dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { memberships } from "@/lib/db/schema/memberships";
import { users, userRoles } from "@/lib/db/schema/users";
import { consents } from "@/lib/db/schema/consents";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  sweepOrphanedTestSessions,
  SHARED_CLASS_SLOT_TEMPLATE_NAME,
} from "../utils/classes-helpers";
import { signIn, waitForHydration, TEST_USERS } from "../utils/test-helpers";

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

/** Resolves the seeded "Test Class Slot" class-slot template row (Stage 13c
 *  of seed-e2e-tests.ts) — the standing weekly slot both specs book
 *  against. Throws with an actionable message if it's missing rather than
 *  failing later on a null-id lookup. */
async function resolveTestClassSlotTemplate(organizationId: string): Promise<{
  id: string;
  capacity: number;
  sessionRateCents: number | null;
  memberRateCents: number | null;
}> {
  const db = getDb();
  const [row] = await db
    .select({
      id: classSlotTemplates.id,
      capacity: classSlotTemplates.capacity,
      sessionRateCents: classSlotTemplates.sessionRateCents,
      memberRateCents: classSlotTemplates.memberRateCents,
    })
    .from(classSlotTemplates)
    .where(
      and(
        eq(classSlotTemplates.organizationId, organizationId),
        eq(classSlotTemplates.name, SHARED_CLASS_SLOT_TEMPLATE_NAME),
      ),
    )
    .orderBy(asc(classSlotTemplates.createdAt))
    .limit(1);
  if (!row) {
    throw new Error(
      `"${SHARED_CLASS_SLOT_TEMPLATE_NAME}" template fixture is missing — run npm run db:seed:e2e before this spec`,
    );
  }
  return row;
}

/**
 * Inserts a materialized `drop_in_sessions` row for the given template,
 * standing in for what the daily materialization cron
 * (src/lib/classes/materialize.ts) would otherwise produce — this spec
 * doesn't invoke the cron directly (that needs CRON_SECRET threaded into
 * the Playwright run, which the documented invocation doesn't do) and
 * doesn't rely on a prior cron run having already happened.
 *
 * `startsAt` is jittered 1-7 days out at random-millisecond precision to
 * avoid colliding with `drop_in_sessions_one_per_template_start`'s unique
 * index on (class_slot_template_id, starts_at) against whatever else may
 * already be materialized for this SHARED template on the staging DB.
 */
async function seedFutureClassSession(opts: {
  organizationId: string;
  venueId: string;
  templateId: string;
  capacity: number;
  sessionRateCents: number | null;
  memberRateCents: number | null;
}): Promise<string> {
  const db = getDb();
  await db
    .insert(dropInRateCard)
    .values({ organizationId: opts.organizationId })
    .onConflictDoNothing();

  const daysOut = 1 + Math.random() * 6;
  const startsAt = new Date(Date.now() + daysOut * 86_400_000);
  const endsAt = new Date(startsAt.getTime() + 55 * 60_000);

  const [row] = await db
    .insert(dropInSessions)
    .values({
      organizationId: opts.organizationId,
      venueId: opts.venueId,
      kind: "class",
      sportOrClassLabel: "Soccer",
      startsAt,
      endsAt,
      capacity: opts.capacity,
      sessionRateCents: opts.sessionRateCents,
      memberRateCents: opts.memberRateCents,
      classSlotTemplateId: opts.templateId,
      teamCount: 0,
      teamColors: [],
    })
    .returning({ id: dropInSessions.id });
  return row.id;
}

/** Deletes a session row this spec created — cascades to any
 *  `drop_in_bookings` row still attached (onDelete: cascade), so this is
 *  safe to call after (or instead of) an explicit booking cancel. */
async function deleteTestSession(sessionId: string): Promise<void> {
  const db = getDb();
  await db.delete(dropInSessions).where(eq(dropInSessions.id, sessionId));
}

/** The most recent still-active booking for a child, across any session —
 *  "find the booking by child" for afterAll cleanup, since the UI (not this
 *  spec) decides which materialized session actually gets booked. */
async function findActiveBookingIdForChild(familyMemberId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: dropInBookings.id })
    .from(dropInBookings)
    .where(
      and(
        eq(dropInBookings.familyMemberId, familyMemberId),
        inArray(dropInBookings.status, ["confirmed", "waitlisted", "pending_claim", "pending_payment"]),
      ),
    )
    .orderBy(desc(dropInBookings.createdAt))
    .limit(1);
  return row?.id ?? null;
}

/** Standalone auth for the `request` fixture (a separate cookie jar from
 *  any `page`'s browser context) — mirrors tests/api/setup/test-helpers.ts's
 *  getAuthCookie, adapted for Playwright's APIRequestContext. Used only in
 *  `afterAll` hooks, which don't have a `page` fixture to reuse. */
async function getAuthCookieViaRequest(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post("/api/auth/signin", { data: { email, password } });
  if (!res.ok()) {
    throw new Error(`Sign-in failed for ${email} (status ${res.status()})`);
  }
  const setCookie = res.headers()["set-cookie"];
  if (!setCookie) {
    throw new Error(`Sign-in for ${email} succeeded but no Set-Cookie header was returned`);
  }
  return setCookie;
}

// ---------------------------------------------------------------------------
// Spec 1 — trial-led happy path from the public /youth/classes page
// ---------------------------------------------------------------------------

test.describe("Youth classes — trial-led signup from /youth/classes", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let venueId: string;
  let templateId: string;
  let sessionId: string;

  // Unique per run so this spec is self-sufficient on shared staging (see
  // the file header comment) — the child is created live through the
  // modal's own form, not seeded directly.
  const childFirstName = `TrialE2E-${Date.now()}`;
  const childLastName = "Signup";

  test.beforeAll(async () => {
    ({ organizationId, venueId } = await resolveClassTestFixtures());
    // resolveClassTestFixtures already sweeps orphaned sessions internally
    // (see that function's doc comment), but call it again explicitly here
    // — this beforeAll's whole point is guaranteeing a clean, bookable
    // session for THIS template exists before seeding one, and that must
    // hold even if resolveClassTestFixtures's internal call is ever
    // removed or scoped differently.
    await sweepOrphanedTestSessions(organizationId);
    const template = await resolveTestClassSlotTemplate(organizationId);
    templateId = template.id;
    sessionId = await seedFutureClassSession({
      organizationId,
      venueId,
      templateId,
      capacity: template.capacity,
      sessionRateCents: template.sessionRateCents,
      memberRateCents: template.memberRateCents,
    });
  });

  test.afterAll(async ({ request }) => {
    const db = getDb();
    const [child] = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.firstName, childFirstName),
          eq(familyMembers.lastName, childLastName),
        ),
      )
      .orderBy(desc(familyMembers.createdAt))
      .limit(1);

    if (child) {
      const bookingId = await findActiveBookingIdForChild(child.id);
      if (bookingId) {
        const cookie = await getAuthCookieViaRequest(
          request,
          TEST_USERS.parent.email,
          TEST_USERS.parent.password,
        );
        await request.post(`/api/classes/bookings/${bookingId}/cancel`, {
          headers: { Cookie: cookie },
        });
      }
    }

    if (sessionId) await deleteTestSession(sessionId);
  });

  test("parent books a free trial, adding a fresh child through the modal's own form", async ({ page }) => {
    await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);

    await page.goto("/youth/classes");
    await waitForHydration(page);

    // Pin by the exact seeded template id, resolved server-side above —
    // avoids any brittle DOM traversal to find "the card for Test Class
    // Slot" among however many schedule cards render.
    await page.locator(`button[data-trial-slot="${templateId}"]`).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Book a free trial — Test Class Slot")).toBeVisible({
      timeout: 15_000,
    });

    // "+ Add a player" — exercises AddDependentForm from inside the trial
    // modal, not just the picker.
    await dialog.getByRole("button", { name: "+ Add a player" }).click();
    await dialog.locator("#dependent-first").fill(childFirstName);
    await dialog.locator("#dependent-last").fill(childLastName);
    await dialog.locator("#dependent-birthdate").fill("2016-01-01");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Add & Select" }).click();

    // A brand-new child has no waiver on file — the first booking attempt
    // always comes back waiver_required (checked before capacity in
    // book-child.ts), so this phase is deterministic.
    await expect(dialog.getByText("One more step: sign the guardian waiver")).toBeVisible({
      timeout: 15_000,
    });
    await dialog.locator("#trial-waiver-accept").click();
    await dialog.locator("#trial-waiver-signer-name").fill("Trial E2E Parent");
    await dialog.getByRole("button", { name: "Sign waiver & book trial" }).click();

    // See the file header comment: the resubmitted (waivered) attempt can
    // still 409/session_full if the earliest upcoming session for this
    // shared template happens to be full — trial-booking.tsx surfaces an
    // explicit offer for the next one rather than auto-booking it.
    const successText = dialog.getByText("You're all set!");
    const fullOfferText = dialog.getByText("This week's class is full");
    await Promise.race([
      successText.waitFor({ state: "visible", timeout: 20_000 }),
      fullOfferText.waitFor({ state: "visible", timeout: 20_000 }),
    ]);
    if (await fullOfferText.isVisible().catch(() => false)) {
      await dialog.getByRole("button", { name: "Book that class" }).click();
      await successText.waitFor({ state: "visible", timeout: 20_000 });
    }

    await expect(successText).toBeVisible();
    await expect(dialog.getByText(`${childFirstName}'s free trial is booked.`)).toBeVisible();
    await expect(dialog.getByText("Test Class Slot", { exact: true })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Spec 2 — choose-slot standalone (enroll + first booking)
// ---------------------------------------------------------------------------

test.describe("Youth classes — choose-slot standalone enroll + first booking", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let venueId: string;
  let parentUserId: string;
  let tierId: string;
  let templateId: string;
  let sessionId: string;
  let childId: string;
  let membershipId: string;

  test.beforeAll(async () => {
    ({ organizationId, venueId, parentUserId, tierId } = await resolveClassTestFixtures());
    // See the identical comment in the trial-led describe block above.
    await sweepOrphanedTestSessions(organizationId);
    const template = await resolveTestClassSlotTemplate(organizationId);
    templateId = template.id;
    sessionId = await seedFutureClassSession({
      organizationId,
      venueId,
      templateId,
      capacity: template.capacity,
      sessionRateCents: template.sessionRateCents,
      memberRateCents: template.memberRateCents,
    });

    // Seeded directly via drizzle (bypassing Stripe entirely), same
    // shorthand tests/api/memberships-child-subscribe.test.ts uses for its
    // "already a member" fixture — this spec is about the post-checkout
    // slot-picker UI, not Checkout itself.
    const suffix = `${Date.now()}-chooseslot`;
    childId = await createTestChild(parentUserId, `ChooseSlotE2E-${suffix}`);
    membershipId = await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: suffix,
    });
  });

  test.afterAll(async ({ request }) => {
    const bookingId = await findActiveBookingIdForChild(childId);
    if (bookingId) {
      const cookie = await getAuthCookieViaRequest(
        request,
        TEST_USERS.parent.email,
        TEST_USERS.parent.password,
      );
      await request.post(`/api/classes/bookings/${bookingId}/cancel`, {
        headers: { Cookie: cookie },
      });
    }

    const db = getDb();
    await db
      .update(classEnrollments)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(classEnrollments.familyMemberId, childId));
    await db.update(memberships).set({ status: "cancelled" }).where(eq(memberships.id, membershipId));

    if (sessionId) await deleteTestSession(sessionId);
  });

  test("parent enrolls a membership child's standing seat and books the first class", async ({ page }) => {
    await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);

    await page.goto(`/dashboard/family/choose-slot?child=${childId}`);
    await waitForHydration(page);

    await page.getByRole("button", { name: /Test Class Slot/ }).click();

    // Technical band Task 8: a first-time membership-backed enrollment
    // (no standing seat yet, membership already active — exactly this
    // fixture) gates behind a jersey-size confirm panel before the POST
    // /api/classes/enrollments call — the $50 annual fee includes a jersey,
    // and the roster needs a size to order against. A slot SWITCH on an
    // existing enrollment skips this, but that's not this test's path.
    await expect(page.getByText("Jersey size (included with your membership)")).toBeVisible({
      timeout: 15_000,
    });
    await page.locator("#kit-size").click();
    await page.getByRole("option", { name: "Youth Medium" }).click();
    await page.getByRole("button", { name: "Confirm enrollment" }).click();

    // Fresh child, no waiver on file — the immediate (unwaivered) booking
    // attempt always comes back waiver_required.
    await expect(page.getByText("One more step: sign the guardian waiver")).toBeVisible({
      timeout: 20_000,
    });
    await page.locator("#waiver-accept").click();
    await page.locator("#waiver-signer-name").fill("Choose Slot E2E Parent");
    await page.getByRole("button", { name: "Sign waiver & confirm class" }).click();

    // Every resubmit outcome (booked, or any other failure code) converges
    // on the same success panel in choose-slot.tsx — see the file header
    // comment, no branching needed here unlike the trial spec above.
    await expect(page.getByText("You're all set!")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/is enrolled in Test Class Slot/)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Spec 3 — signed-out guest trial happy path from /youth/classes
// ---------------------------------------------------------------------------

test.describe("Youth classes — signed-out guest trial happy path", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let venueId: string;
  let templateId: string;
  let sessionId: string;

  // Unique per run on BOTH axes the guest-trial endpoint dedupes on: the
  // kid's name (createChildClassBooking's org-wide trial dedupe keys on
  // lower(firstName)+lower(lastName)+birthDate — see book-child.ts) and the
  // parent's email (upsertGuestUser's "account already exists" branch would
  // otherwise short-circuit a second run straight into `existing_account`
  // and skip the booking this spec exists to exercise). Without both, the
  // SECOND run of this spec against the shared staging DB fails.
  const runId = Date.now();
  const guestChildFirstName = `GuestTrialE2E-${runId}`;
  const guestChildLastName = "Signup";
  const guestEmail = `guest-trial-e2e-${runId}@e2e.aspiresports.test`;
  const guestParentFirstName = "Guest";
  const guestParentLastName = "TrialParent";

  test.beforeAll(async () => {
    ({ organizationId, venueId } = await resolveClassTestFixtures());
    // See the identical comment in the other describe blocks above.
    await sweepOrphanedTestSessions(organizationId);
    const template = await resolveTestClassSlotTemplate(organizationId);
    templateId = template.id;
    sessionId = await seedFutureClassSession({
      organizationId,
      venueId,
      templateId,
      capacity: template.capacity,
      sessionRateCents: template.sessionRateCents,
      memberRateCents: template.memberRateCents,
    });
  });

  test.afterAll(async () => {
    // No signIn() in this spec (it's signed out throughout) and the guest
    // account this flow creates has no password to authenticate an API
    // cancel with — clean up directly via drizzle instead. Find the booking
    // by CHILD, not by this spec's own seeded sessionId: like the trial-led
    // describe block above, the booking UI always books the template's
    // EARLIEST upcoming session, which on shared staging under parallel
    // workers can be a DIFFERENT session than the one this spec's
    // beforeAll inserted — deleting only our own sessionId would leave that
    // booking's row behind, blocking the user delete below on
    // drop_in_bookings' RESTRICT-on-user_id FK.
    const db = getDb();
    const [child] = await db
      .select({ id: familyMembers.id, parentUserId: familyMembers.parentUserId })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.firstName, guestChildFirstName),
          eq(familyMembers.lastName, guestChildLastName),
        ),
      )
      .orderBy(desc(familyMembers.createdAt))
      .limit(1);

    if (child) {
      const bookingId = await findActiveBookingIdForChild(child.id);
      if (bookingId) await db.delete(dropInBookings).where(eq(dropInBookings.id, bookingId));
      await db.delete(consents).where(eq(consents.familyMemberId, child.id));
      await db.delete(familyMembers).where(eq(familyMembers.id, child.id));
      if (child.parentUserId) {
        await db.delete(userRoles).where(eq(userRoles.userId, child.parentUserId));
        await db.delete(users).where(eq(users.id, child.parentUserId));
      }
    }

    if (sessionId) await deleteTestSession(sessionId);
  });

  test("guest parent books a free trial without an account", async ({ browser }) => {
    // Fresh, storage-state-free context: the other describe blocks in this
    // file sign in via signIn(page, ...) on their own `page` fixture, so a
    // brand-new context/page here guarantees this test starts genuinely
    // signed out rather than depending on test-isolation defaults.
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto("/youth/classes");
      await waitForHydration(page);

      // Pin by the exact seeded template id, resolved server-side above —
      // same pattern as the trial-led spec.
      await page.locator(`button[data-trial-slot="${templateId}"]`).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Book a free trial — Test Class Slot")).toBeVisible({
        timeout: 15_000,
      });

      await dialog.locator("#guest-parent-first").fill(guestParentFirstName);
      await dialog.locator("#guest-parent-last").fill(guestParentLastName);
      await dialog.locator("#guest-email").fill(guestEmail);
      await dialog.locator("#guest-child-first").fill(guestChildFirstName);
      await dialog.locator("#guest-child-last").fill(guestChildLastName);
      await dialog.locator("#guest-child-dob").fill("2016-01-01");
      await dialog.locator("#guest-coppa").click();

      // Turnstile's always-pass sandbox widget still takes a beat to
      // deliver its token — Continue stays disabled until
      // canContinueGuestForm sees a non-empty guestTurnstileToken (see
      // trial-booking.tsx), so wait for enabled rather than clicking
      // immediately.
      const continueButton = dialog.getByRole("button", { name: "Continue" });
      await expect(continueButton).toBeEnabled({ timeout: 20_000 });
      await continueButton.click();

      await expect(dialog.getByText("One more step: sign the guardian waiver")).toBeVisible({
        timeout: 15_000,
      });
      // Signature is prefilled from the parent's name by handleGuestContinue
      // — assert that instead of re-typing it.
      await expect(dialog.locator("#guest-waiver-signer-name")).toHaveValue(
        `${guestParentFirstName} ${guestParentLastName}`,
      );
      await dialog.locator("#guest-waiver-accept").click();

      const submitButton = dialog.getByRole("button", { name: "Sign waiver & book trial" });
      await expect(submitButton).toBeEnabled({ timeout: 20_000 });
      await submitButton.click();

      await expect(dialog.getByText("You're all set!")).toBeVisible({ timeout: 20_000 });
      await expect(
        dialog.getByText(`${guestChildFirstName}'s free trial is booked.`),
      ).toBeVisible();
      await expect(dialog.getByText("Test Class Slot", { exact: true })).toBeVisible();

      // Guests never get "Add another player" — only Close (see the
      // success panel's `!guestMode &&` guard in trial-booking.tsx). The
      // dialog's own built-in [X] close control also has an accessible name
      // of "Close" (shadcn's DialogContent), so this is `.first()` (the
      // explicit success-panel button, which renders before that control in
      // DOM order) rather than an unqualified match.
      await expect(dialog.getByRole("button", { name: "Add another player" })).toHaveCount(0);
      await expect(dialog.getByRole("button", { name: "Close" }).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
