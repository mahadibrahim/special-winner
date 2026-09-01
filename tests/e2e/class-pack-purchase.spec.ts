/**
 * Class-purchase-ladder E2E — Task 12 (dashboard credits + summary API +
 * E2E + ship checks, the final task of the class-purchase-ladder plan).
 *
 * Four independent scenarios, against the "Test Class Pack" pack-product
 * fixture (seed-e2e-tests.ts Stage 23, added by this task) and — for
 * scenarios 1 and 3, which each need to book a real session — their OWN
 * dedicated `class_slot_templates` row (`createTestClassTemplate`) rather
 * than the shared "Test Class Slot" fixture. Two collisions were found and
 * fixed live building this file, both only reproducible under
 * `fullyParallel` workers (never in serial `tests/api`, and never visible
 * running this file alone — only when it runs alongside another classes
 * spec, e.g. youth-classes-signup.spec.ts, exactly how post-merge test-full
 * actually runs):
 *
 *   a. A SHARED template collides on SESSION IDENTITY: MakeUpModal's session
 *      picker lists EVERY upcoming session for a clicked slot NAME, so
 *      scenario 1 could click a card that was actually scenario 3's session
 *      — and lose the race against scenario 3's own (much faster) `afterAll`
 *      deleting it, landing "Session not found". Fixed by giving each
 *      scenario its own uniquely-named template.
 *   b. `resolveClassTestFixtures()` ITSELF calls `sweepOrphanedTestSessions`
 *      internally (see that helper's doc comment) — every `beforeAll` in
 *      every classes suite indirectly cancels any SCHEDULED session with
 *      zero CONFIRMED bookings on a `TEST_TEMPLATE_NAME_PREFIXES`-matching
 *      template OR on `SHARED_CLASS_SLOT_TEMPLATE_NAME` itself. Running
 *      alongside youth-classes-signup.spec.ts, THIS file's own `beforeAll`
 *      calls were caught sweeping THAT spec's freshly-seeded "Test Class
 *      Slot" session out from under it (zero confirmed bookings yet — it
 *      hadn't gotten to book it) — a bidirectional version of #1, one file
 *      breaking a completely different, otherwise-untouched spec. Fixed by
 *      calling `resolveDefaultOrgForHttpTests()` directly (org/venue only,
 *      no parent/tier fixture lookups needed here) instead of
 *      `resolveClassTestFixtures()`, so this file never triggers that sweep
 *      at all — combined with #1's unique-per-scenario template names
 *      (outside the swept prefix list too), neither this file nor any
 *      sibling spec can touch the other's sessions.
 *
 *  1. Dashboard credits — a child with a pack credit grant (seeded directly
 *     via drizzle; no test can drive the Stripe Checkout webhook that
 *     normally writes this row, same convention as class-pack-purchase.test.ts's
 *     itWithStripe-gated checkout-URL-only coverage) shows a credits line
 *     on /dashboard/family, books a session through the make-up modal
 *     (which spends the credit transparently — see book-child.ts's
 *     membership-then-credit fallthrough), and the balance decrements on
 *     reload.
 *  2. The /youth/classes pricing band renders the pack rung, and a
 *     signed-out click on its CTA lands on /signin?redirect=....
 *  3. MANDATORY REGRESSION (carried from Task 11's review — throwaway
 *     coverage there was deleted; this is the permanent home): a
 *     no-membership, no-credit child clicking the drop-in door
 *     (`[data-dropin-slot]`) must see the guardian waiver panel BEFORE any
 *     `POST /api/dropin/bookings` fires. Asserted via a network-request
 *     listener attached before the click, never via route interception that
 *     would need to fake a response.
 *  4. `?block=success` with NO `slot=` param (a truncated/shared block-purchase
 *     success URL) lands choose-slot.astro on the soft-success panel, never
 *     the enroll-capable picker — see choose-slot.tsx's BLOCK MODE doc
 *     comment for why a missing slot must never fall through to the grid.
 *  5. `?pack=success&child=…` (the pack Checkout return URL — see
 *     src/pages/api/classes/packs/purchase.ts's `success_url`) shows the
 *     payment-received banner on /dashboard/family and strips its own params
 *     so a refresh can't re-trigger the settle ladder. The child is seeded
 *     WITH credits, so the ladder's very first probe resolves and the banner
 *     lands on its settled copy without any real waiting.
 *
 * These run post-merge only (test-full — see CLAUDE.md's Playwright
 * conventions section), against the SHARED staging DB, so every scenario:
 *   - signs in as a brand-new throwaway user (`createTestUserWithPassword`,
 *     same helper `tests/api/classes/schedule.test.ts`'s summary suite
 *     uses), never the shared parent@test.aspiresports.com account — that
 *     account has accumulated 400+ family_members rows across the test
 *     suite's history, past `/api/classes/summary`'s documented MAX_CHILDREN
 *     = 20 cap, so a freshly-created child there is not guaranteed to appear
 *     in the response every scenario here depends on (the credits line, and
 *     choose-slot.tsx's own `summaryBody.children.find(...)` lookup);
 *   - creates its own uniquely-named child fixture under that throwaway
 *     user;
 *   - never asserts on absolute counts, only its own outcome;
 *   - retires what it created in `afterAll` (booking cancelled via the real
 *     API — found by child, not by session — credit grant deleted, session
 *     row this run inserted deleted).
 */
import { test, expect } from "@playwright/test";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classPackProducts, classCreditGrants } from "@/lib/db/schema/classes";
import { dropInSessions, dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import { consents } from "@/lib/db/schema/consents";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import { WAIVER_VALID_DAYS } from "@/lib/consents/liability";
import {
  createTestChild,
  createTestChildMembership,
  createTestCreditGrant,
  createTestClassTemplate,
  cleanupTestClassFixtures,
  cleanupTestMembershipTiers,
} from "../utils/classes-helpers";
import { resolveDefaultOrgForHttpTests } from "../utils/dropin-helpers";
import { signIn, waitForHydration } from "../utils/test-helpers";
import { createTestUserWithPassword } from "../utils/host-helpers";

// ---------------------------------------------------------------------------
// Shared fixture helpers — same shape as youth-classes-signup.spec.ts's
// (not exported from there, so duplicated here rather than reaching across
// spec files).
// ---------------------------------------------------------------------------

/** Resolves the "Test Class Pack" pack-product fixture (seed-e2e-tests.ts
 *  Stage 23, added by this task) — a real name for the dashboard's
 *  `label` field to render. */
async function resolveTestClassPack(organizationId: string): Promise<{ id: string; name: string }> {
  const db = getDb();
  const [row] = await db
    .select({ id: classPackProducts.id, name: classPackProducts.name })
    .from(classPackProducts)
    .where(and(eq(classPackProducts.organizationId, organizationId), eq(classPackProducts.name, "Test Class Pack")))
    .orderBy(desc(classPackProducts.createdAt))
    .limit(1);
  if (!row) {
    throw new Error('"Test Class Pack" pack-product fixture is missing — run npm run db:seed:e2e before this spec');
  }
  return row;
}

/** Materialized `drop_in_sessions` row for the given (per-scenario dedicated)
 *  template, jittered 1-7 days out at random-ms precision to dodge the
 *  unique index on (class_slot_template_id, starts_at) — harmless belt and
 *  suspenders now that each scenario owns its template outright. */
async function seedFutureClassSession(opts: {
  organizationId: string;
  venueId: string;
  templateId: string;
  capacity: number;
  sessionRateCents: number | null;
  memberRateCents: number | null;
}): Promise<string> {
  const db = getDb();
  await db.insert(dropInRateCard).values({ organizationId: opts.organizationId }).onConflictDoNothing();

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

async function deleteTestSession(sessionId: string): Promise<void> {
  const db = getDb();
  await db.delete(dropInSessions).where(eq(dropInSessions.id, sessionId));
}

/** Most recent still-active booking for a child, across any session — same
 *  "find the booking by child" pattern as youth-classes-signup.spec.ts,
 *  since the UI (not this spec) decides which materialized session actually
 *  gets booked. */
async function findActiveBookingIdForChild(familyMemberId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: dropInBookings.id })
    .from(dropInBookings)
    .where(
      and(
        eq(dropInBookings.familyMemberId, familyMemberId),
        eq(dropInBookings.status, "confirmed"),
      ),
    )
    .orderBy(desc(dropInBookings.createdAt))
    .limit(1);
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------
// Scenario 1 — dashboard credits line + book-with-credit
// ---------------------------------------------------------------------------

test.describe("Class credits — family dashboard", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let venueId: string;
  let templateId: string;
  let sessionId: string;
  let packId: string;
  let packName: string;
  let parentEmail: string;
  let parentPassword: string;
  let childId: string;
  let grantId: string;

  const suffix = Date.now();
  const childFirstName = `CreditsE2E-${suffix}`;

  const templateName = `PackPurchaseE2E-Dashboard-${suffix}`;

  test.beforeAll(async () => {
    ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());

    // Own dedicated template (never the shared "Test Class Slot" fixture —
    // see the file header comment for the collision this avoids).
    templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: templateName,
      capacity: 12,
    });
    sessionId = await seedFutureClassSession({
      organizationId,
      venueId,
      templateId,
      capacity: 12,
      sessionRateCents: null,
      memberRateCents: null,
    });

    const pack = await resolveTestClassPack(organizationId);
    packId = pack.id;
    packName = pack.name;

    const throwawayUser = await createTestUserWithPassword();
    parentEmail = throwawayUser.email;
    parentPassword = throwawayUser.password;

    childId = await createTestChild(throwawayUser.userId, childFirstName);
    grantId = await createTestCreditGrant({
      organizationId,
      familyMemberId: childId,
      sessionsGranted: 2,
      packProductId: packId,
      idSuffix: `e2e-${suffix}`,
    });
  });

  test.afterAll(async ({ request }) => {
    const bookingId = await findActiveBookingIdForChild(childId);
    if (bookingId) {
      const cookie = (
        await request.post("/api/auth/signin", {
          data: { email: parentEmail, password: parentPassword },
        })
      ).headers()["set-cookie"];
      if (cookie) {
        await request.post(`/api/classes/bookings/${bookingId}/cancel`, { headers: { Cookie: cookie } });
      }
    }
    const db = getDb();
    await db.delete(classCreditGrants).where(eq(classCreditGrants.id, grantId));
    if (sessionId) await deleteTestSession(sessionId);
    if (templateId) await cleanupTestClassFixtures([templateId]);
  });

  test("shows the credits line, books a session through it, and decrements on reload", async ({ page }) => {
    await signIn(page, parentEmail, parentPassword);

    await page.goto("/dashboard/family");
    await waitForHydration(page);

    const card = page.locator("div.flex.items-start.gap-3.rounded-xl.border.border-border.border-l-4.p-3").filter({ hasText: childFirstName });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText(new RegExp(`2 sessions left.*${packName}`))).toBeVisible();

    await card.getByRole("button", { name: "Book a session" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(new RegExp(`Book a session for ${childFirstName}`))).toBeVisible({
      timeout: 15_000,
    });

    // MakeUpModal's "picking" phase lists every eligible session as its own
    // clickable card (family-classes-card.tsx). templateName is unique to
    // THIS run (suffix-embedded), so this can only ever match the session
    // seeded above — never another scenario's.
    await dialog
      .locator("button.w-full.text-left.rounded-xl")
      .filter({ hasText: templateName })
      .click();

    // A fresh child has no waiver on file — the first booking attempt always
    // comes back waiver_required (checked before the credit is actually
    // spent), same deterministic ordering as the membership make-up flow.
    await expect(dialog.getByText("One more step: sign the guardian waiver")).toBeVisible({
      timeout: 20_000,
    });
    await dialog.locator("#makeup-waiver-accept").click();
    await dialog.locator("#makeup-waiver-signer-name").fill("Credits E2E Parent");

    // Registered BEFORE the click that triggers the booking (which fires
    // `onBooked()` → a background `/api/classes/summary` refetch — see
    // family-classes-card.tsx's `creditsLeftAfterSpend` doc comment) so it
    // can only catch THAT refetch, never the modal's own earlier
    // /api/public/class-schedule / /api/family-members load calls or the
    // family card's initial pre-booking summary fetch (both already
    // resolved long before this point).
    const summaryRefetch = page.waitForResponse(
      (res) => res.url().includes("/api/classes/summary") && res.request().method() === "GET",
    );
    await dialog.getByRole("button", { name: "Sign waiver & book class" }).click();

    await expect(dialog.getByText("You're all set!")).toBeVisible({ timeout: 20_000 });
    // Pins the credit-spend-specific success copy (review Finding 1): a
    // pack/block credit spend must read differently from a plain allotment
    // booking, not the generic "make-up class is booked" line. The child
    // started this test with 2 credits (see the grant seeded in beforeAll),
    // so after this one spend the count is 1 left.
    await expect(dialog.getByText(/1 credit used, 1 left\./)).toBeVisible();

    // Review Finding (regression): the success copy MUST come from a value
    // snapshotted at spend time, not recomputed at render time from the
    // live `child` prop — that prop updates in place (no unmount) once
    // this background refetch lands, and `child.credits` is by then
    // already server-decremented. Explicitly wait for the refetch to
    // finish, then re-assert the EXACT SAME text still shows — a
    // render-time recompute would double-subtract and flip this to
    // "0 left", silently disagreeing with the toast already shown.
    await summaryRefetch;
    await expect(dialog.getByText(/1 credit used, 1 left\./)).toBeVisible();

    // DialogContent renders its OWN unlabeled "Close" (the radix X in the
    // corner) alongside MakeUpModal's success-panel Close button — both
    // resolve to accessible name "Close", so scope to the first (the
    // success panel's own button, which appears earlier in DOM order).
    await dialog.getByRole("button", { name: "Close" }).first().click();

    await page.reload();
    await waitForHydration(page);
    const cardAfter = page.locator("div.flex.items-start.gap-3.rounded-xl.border.border-border.border-l-4.p-3").filter({ hasText: childFirstName });
    await expect(cardAfter.getByText(/1 session left/)).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// Scenario 9 — comp-credit dashboard line + book-with-credit (Task 9)
// ---------------------------------------------------------------------------

/**
 * The admin-issued goodwill-credit twin of Scenario 1 above — same shape
 * (seed a grant directly; only the admin comp-credit endpoint or a human
 * writes these, and `source: "comp"` never goes through the Stripe webhook
 * at all, so there's no itWithStripe gate to route around here), but
 * asserting the DEDICATED "Class credit" label (`summary.ts`'s
 * `GENERIC_CREDIT_LABEL.comp` — chosen specifically to not collide with the
 * pre-existing "Account credit" dollar-credit widget on this same dashboard,
 * per the F0 review carry-forward) rather than a pack product's name.
 */
test.describe("Class credits — comp grant (admin-issued)", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let venueId: string;
  let templateId: string;
  let sessionId: string;
  let parentEmail: string;
  let parentPassword: string;
  let childId: string;
  let grantId: string;

  const suffix = Date.now();
  const childFirstName = `CompCreditsE2E-${suffix}`;
  const templateName = `PackPurchaseE2E-CompCredits-${suffix}`;

  test.beforeAll(async () => {
    ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());

    templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: templateName,
      capacity: 12,
    });
    sessionId = await seedFutureClassSession({
      organizationId,
      venueId,
      templateId,
      capacity: 12,
      sessionRateCents: null,
      memberRateCents: null,
    });

    const throwawayUser = await createTestUserWithPassword();
    parentEmail = throwawayUser.email;
    parentPassword = throwawayUser.password;

    childId = await createTestChild(throwawayUser.userId, childFirstName);
    // source "comp", NULL checkout session id — the admin-grant shape,
    // never written by the Stripe webhook (createTestCreditGrant defaults
    // stripeCheckoutSessionId to null for this source; see its doc comment).
    grantId = await createTestCreditGrant({
      organizationId,
      familyMemberId: childId,
      sessionsGranted: 2,
      source: "comp",
      idSuffix: `comp-e2e-${suffix}`,
    });
  });

  test.afterAll(async ({ request }) => {
    const bookingId = await findActiveBookingIdForChild(childId);
    if (bookingId) {
      const cookie = (
        await request.post("/api/auth/signin", {
          data: { email: parentEmail, password: parentPassword },
        })
      ).headers()["set-cookie"];
      if (cookie) {
        await request.post(`/api/classes/bookings/${bookingId}/cancel`, { headers: { Cookie: cookie } });
      }
    }
    const db = getDb();
    await db.delete(classCreditGrants).where(eq(classCreditGrants.id, grantId));
    if (sessionId) await deleteTestSession(sessionId);
    if (templateId) await cleanupTestClassFixtures([templateId]);
  });

  test("shows the 'Class credit' line, books a session through it, and decrements on reload", async ({
    page,
  }) => {
    await signIn(page, parentEmail, parentPassword);

    await page.goto("/dashboard/family");
    await waitForHydration(page);

    const card = page.locator("div.flex.items-start.gap-3.rounded-xl.border.border-border.border-l-4.p-3").filter({ hasText: childFirstName });
    await expect(card).toBeVisible({ timeout: 15_000 });
    // Comp grants carry no product name — GENERIC_CREDIT_LABEL.comp is their
    // PERMANENT label, not a fallback, and it must read "Class credit" (not
    // "Account credit", which names an unrelated dollar-credit widget on
    // this same page).
    await expect(card.getByText(/2 sessions left.*Class credit/)).toBeVisible();

    await card.getByRole("button", { name: "Book a session" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(new RegExp(`Book a session for ${childFirstName}`))).toBeVisible({
      timeout: 15_000,
    });

    await dialog
      .locator("button.w-full.text-left.rounded-xl")
      .filter({ hasText: templateName })
      .click();

    await expect(dialog.getByText("One more step: sign the guardian waiver")).toBeVisible({
      timeout: 20_000,
    });
    await dialog.locator("#makeup-waiver-accept").click();
    await dialog.locator("#makeup-waiver-signer-name").fill("Comp Credit E2E Parent");

    const summaryRefetch = page.waitForResponse(
      (res) => res.url().includes("/api/classes/summary") && res.request().method() === "GET",
    );
    await dialog.getByRole("button", { name: "Sign waiver & book class" }).click();

    await expect(dialog.getByText("You're all set!")).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(/1 credit used, 1 left\./)).toBeVisible();

    await summaryRefetch;
    await expect(dialog.getByText(/1 credit used, 1 left\./)).toBeVisible();

    await dialog.getByRole("button", { name: "Close" }).first().click();

    await page.reload();
    await waitForHydration(page);
    const cardAfter = page.locator("div.flex.items-start.gap-3.rounded-xl.border.border-border.border-l-4.p-3").filter({ hasText: childFirstName });
    await expect(cardAfter.getByText(/1 session left/)).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — /youth/classes pack rung + signed-out redirect
// ---------------------------------------------------------------------------

test.describe("Class purchase ladder — pack rung", () => {
  test("renders the pack rung and bounces a signed-out click to /signin", async ({ page }) => {
    await page.goto("/youth/classes");
    await waitForHydration(page);

    const packCta = page.locator('[data-youth-cta="ladder-pack"]').first();
    // The pack rung only renders when the catalog has at least one active
    // pack product — "Test Class Pack" guarantees that on this seeded org.
    await expect(packCta).toBeVisible({ timeout: 15_000 });

    await packCta.click();
    await expect(page).toHaveURL(/\/signin\?redirect=/, { timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — MANDATORY REGRESSION: drop-in door guardian-waiver gate
// ---------------------------------------------------------------------------

test.describe("Drop-in door — guardian waiver gate (regression)", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let venueId: string;
  let templateId: string;
  let sessionId: string;
  let parentEmail: string;
  let parentPassword: string;
  let childId: string;

  const suffix = Date.now();
  const childFirstName = `DropinGateE2E-${suffix}`;
  const templateName = `PackPurchaseE2E-Dropin-${suffix}`;

  test.beforeAll(async () => {
    ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());

    // Own dedicated template (never the shared "Test Class Slot" fixture —
    // see the file header comment for the collision this avoids). The
    // drop-in door only renders when the slot has a configured
    // sessionRateCents AND a materialized session with a seat, so both are
    // set explicitly here.
    templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: templateName,
      capacity: 12,
      sessionRateCents: 2500,
      memberRateCents: 1500,
    });
    sessionId = await seedFutureClassSession({
      organizationId,
      venueId,
      templateId,
      capacity: 12,
      sessionRateCents: 2500,
      memberRateCents: 1500,
    });

    const throwawayUser = await createTestUserWithPassword();
    parentEmail = throwawayUser.email;
    parentPassword = throwawayUser.password;
    // No membership, no credits — createTestChild alone guarantees both are
    // absent for a brand-new family_members row.
    childId = await createTestChild(throwawayUser.userId, childFirstName);
  });

  test.afterAll(async () => {
    if (sessionId) await deleteTestSession(sessionId);
    if (templateId) await cleanupTestClassFixtures([templateId]);
  });

  test("shows the waiver panel before any POST /api/dropin/bookings, for a no-membership no-credit child", async ({
    page,
  }) => {
    await signIn(page, parentEmail, parentPassword);

    // Attach the listener BEFORE navigating to the page that can trigger the
    // booking — this is the whole point of the assertion, not just
    // bookkeeping around it.
    const dropinBookingPosts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/dropin/bookings")) {
        dropinBookingPosts.push(req.url());
      }
    });

    await page.goto("/youth/classes");
    await waitForHydration(page);

    // /youth/classes has TWO beacon islands (ClassPurchaseLadder and
    // ClassSchedule) — `waitForHydration` can resolve once EITHER has
    // mounted, so wait explicitly for the drop-in door's own concrete DOM
    // before interacting with it (see the class-schedule.tsx-owned button).
    const doorButton = page.locator(`button[data-dropin-slot="${templateId}"]`);
    await expect(doorButton).toBeVisible({ timeout: 20_000 });
    await doorButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(new RegExp(`^Book ${templateName}$`))).toBeVisible({
      timeout: 15_000,
    });

    await dialog.getByRole("button", { name: new RegExp(childFirstName) }).click();

    // The free-first attempt (`POST /api/classes/book { kind: "member" }`)
    // fires and 403s `no_membership` — book-child.ts returns that BEFORE its
    // waiver-on-file check for a child with nothing to spend, so the modal
    // must land on the waiver panel, not the paid checkout, on this very
    // first attempt.
    //
    // The modal's 403 branch now ALSO skips the panel for a child whose
    // annual waiver is still valid (`waiverOnFile` from the child-list
    // probe). This child was created seconds ago under a throwaway parent, so
    // the flag is false and the panel is still mandatory — which is exactly
    // what makes this the right fixture for the regression.
    await expect(dialog.getByText("One more step: sign the guardian waiver")).toBeVisible({
      timeout: 20_000,
    });

    // The core regression assertion: the guardian waiver panel is visible,
    // and in getting there, zero requests to the paid drop-in booking
    // endpoint were ever made.
    expect(dropinBookingPosts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — ?block=success without slot → soft success, never the picker
// ---------------------------------------------------------------------------

test.describe("Choose-slot — block success without a slot param", () => {
  let parentEmail: string;
  let parentPassword: string;
  let childId: string;

  const suffix = Date.now();
  const childFirstName = `BlockSoftSuccessE2E-${suffix}`;

  test.beforeAll(async () => {
    const throwawayUser = await createTestUserWithPassword();
    parentEmail = throwawayUser.email;
    parentPassword = throwawayUser.password;
    childId = await createTestChild(throwawayUser.userId, childFirstName);
  });

  test("lands on the soft-success panel, never the enroll picker", async ({ page }) => {
    await signIn(page, parentEmail, parentPassword);

    await page.goto(`/dashboard/family/choose-slot?child=${childId}&block=success`);
    await waitForHydration(page);

    await expect(page.getByText("You're all set!")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Your payment went through — your seat appears on your dashboard shortly."),
    ).toBeVisible();

    // Never the picker grid — every slot card in choose-slot.tsx's "picking"
    // phase renders its own "N spots left" chip (picker.tsx-independent
    // marker, so this holds regardless of which slot names happen to exist
    // on the org), so zero matches proves the grid never rendered.
    await expect(page.getByText(/spots? left/)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — ?pack=success acknowledgment banner + param cleanup
// ---------------------------------------------------------------------------

test.describe("Family dashboard — pack success acknowledgment", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let parentEmail: string;
  let parentPassword: string;
  let childId: string;
  let grantId: string;

  const suffix = Date.now();
  const childFirstName = `PackSuccessE2E-${suffix}`;

  test.beforeAll(async () => {
    ({ organizationId } = await resolveDefaultOrgForHttpTests());

    const pack = await resolveTestClassPack(organizationId);
    const throwawayUser = await createTestUserWithPassword();
    parentEmail = throwawayUser.email;
    parentPassword = throwawayUser.password;
    childId = await createTestChild(throwawayUser.userId, childFirstName);
    // Seeded WITH credits (standing in for the webhook having already
    // landed), so family-classes-card.tsx's settle ladder resolves on its
    // very first probe — this scenario asserts the acknowledgment surface,
    // not the backoff timing.
    grantId = await createTestCreditGrant({
      organizationId,
      familyMemberId: childId,
      sessionsGranted: 3,
      packProductId: pack.id,
      idSuffix: `packsuccess-e2e-${suffix}`,
    });
  });

  test.afterAll(async () => {
    const db = getDb();
    await db.delete(classCreditGrants).where(eq(classCreditGrants.id, grantId));
  });

  test("acknowledges the purchase and clears the params from the URL", async ({ page }) => {
    await signIn(page, parentEmail, parentPassword);

    await page.goto(`/dashboard/family?pack=success&child=${childId}`);
    await waitForHydration(page);

    // The banner must appear for a pack buyer regardless of what else the
    // dashboard renders — this is the whole finding it fixes (a buyer who
    // beats the webhook otherwise sees an unchanged dashboard).
    const banner = page.locator("[data-pack-success-banner]");
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText("Payment received");
    // Credits already exist for this child, so the ladder settles on its
    // first probe rather than exhausting into the "still processing" copy.
    await expect(banner).toHaveAttribute("data-pack-success-banner", "settled", {
      timeout: 20_000,
    });

    // history.replaceState ran, so a refresh can't re-trigger the ladder.
    await expect(page).toHaveURL(/\/dashboard\/family$/);
    await page.reload();
    await waitForHydration(page);
    await expect(page.locator("[data-pack-success-banner]")).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Shared annual-waiver fixture helper (scenarios 6-8)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Direct `consents` insert — the row shape a real liability signature
 * produces (`recordLiabilityWaiver` → `recordConsent`). `signedDaysAgo`
 * drives BOTH `signedAt` and the derived `expiresAt`, so one helper seeds a
 * live grant and a lapsed one with no second code path. The expiry is
 * computed from `WAIVER_VALID_DAYS` rather than a literal 365 so this fixture
 * tracks the write side if the window ever moves.
 */
async function seedLiabilityConsent(opts: {
  familyMemberId: string;
  organizationId: string;
  signedByUserId: string;
  signedDaysAgo: number;
}): Promise<void> {
  const signedAt = new Date(Date.now() - opts.signedDaysAgo * DAY_MS);
  await getDb()
    .insert(consents)
    .values({
      familyMemberId: opts.familyMemberId,
      organizationId: opts.organizationId,
      type: "liability",
      status: "granted",
      signedByUserId: opts.signedByUserId,
      signedByName: "Annual Waiver E2E Parent",
      signedAt,
      expiresAt: new Date(signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS),
    });
}

async function deleteConsentsFor(familyMemberIds: string[]): Promise<void> {
  const ids = familyMemberIds.filter(Boolean);
  if (ids.length === 0) return;
  await getDb().delete(consents).where(inArray(consents.familyMemberId, ids));
}

/**
 * Captures the paid-booking POST body and answers it with the endpoint's own
 * `paymentRequired: false` shape, so the modal lands on its success panel
 * instead of redirecting to Stripe.
 *
 * Why fulfill rather than let the real request through: a covered child's
 * booking is genuinely priced, so the real response carries a `checkoutUrl`
 * and the modal immediately does `window.location.href = …`. Aborting that
 * navigation at the route level leaves a BLANK document — against which
 * `expect(panel).toHaveCount(0)` passes vacuously, whatever the modal did.
 * Keeping the page alive is what makes "the waiver panel never rendered" a
 * real assertion.
 *
 * What is under test here is the REQUEST the client composed (its waiver
 * fields, or absence of them) and the panel it skipped — never Stripe's
 * response, which these scenarios don't exercise. The endpoint's own
 * server-side behaviour for a covered renter is pinned separately in
 * tests/api (paid-makeup.test.ts, waiver-sign.test.ts).
 *
 * It also removes the Stripe dependency: the assertions hold identically on
 * CI, which has no Stripe keys.
 */
function stubPaidBooking(page: import("@playwright/test").Page) {
  const bodies: (string | null)[] = [];

  void page.route("**/api/dropin/bookings", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.continue();
    bodies.push(req.postData());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ bookingId: "e2e-stubbed-booking", paymentRequired: false }),
    });
  });

  return {
    postCount: () => bodies.length,
    /** The single POST body, parsed. Throws (rather than returning `{}`) if
     *  no request was made, so a silent no-request can't read as "sent no
     *  waiver fields" and pass the contract assertions. */
    sentBody: (): Record<string, unknown> => {
      if (bodies.length !== 1) {
        throw new Error(
          `expected exactly 1 POST /api/dropin/bookings, saw ${bodies.length}`,
        );
      }
      return JSON.parse(bodies[0] ?? "{}") as Record<string, unknown>;
    },
  };
}

// ---------------------------------------------------------------------------
// Scenarios 6 + 7 — drop-in door, annual waiver: covered skips, lapsed asks
// ---------------------------------------------------------------------------

/**
 * The two halves of the annual-waiver skip on the DROP-IN DOOR
 * (class-dropin-modal.tsx's `payOrCollectWaiver`), sharing one template and
 * one session because neither half completes a booking:
 *
 *  6. A child carrying a FRESH `consents` liability row goes from the child
 *     picker straight to payment. Asserted two ways, both mandatory: the
 *     guardian waiver panel is never rendered, AND the
 *     `POST /api/dropin/bookings` body carries NO waiver fields — a covered
 *     family must not be made to type a signature the server would discard
 *     and overwrite with the on-file attribution.
 *
 *  7. REGRESSION (the whole point of a 365-day expiry): a child whose only
 *     signature is older than the window is treated as UNCOVERED and still
 *     gets the panel, with zero paid-booking requests. Scenario 3 above
 *     proves the never-signed case; this one proves the LAPSED case, which is
 *     the state the expiry rule actually exists to catch and the one a naive
 *     "have they ever signed?" implementation gets wrong.
 *
 * Stripe: the covered half's POST is a real request against a real paid class
 * rate, so it may create a test-mode Checkout Session and then try to
 * navigate to checkout.stripe.com. That navigation is aborted at the route
 * level — every assertion here is about the REQUEST the browser sent and the
 * panel it never showed, so they hold identically whether or not Stripe is
 * configured in the environment.
 */
test.describe("Drop-in door — annual liability waiver", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let venueId: string;
  let templateId: string;
  let sessionId: string;
  let parentEmail: string;
  let parentPassword: string;
  let parentUserId: string;
  let coveredChildId: string;
  let lapsedChildId: string;

  const suffix = Date.now();
  const coveredChildFirstName = `WaiverCoveredE2E-${suffix}`;
  const lapsedChildFirstName = `WaiverLapsedE2E-${suffix}`;
  const templateName = `PackPurchaseE2E-WaiverDoor-${suffix}`;

  test.beforeAll(async () => {
    ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());

    // Own dedicated template + session, both priced, so the drop-in door
    // renders and prices a no-membership child at the public class rate.
    templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: templateName,
      capacity: 12,
      sessionRateCents: 2500,
      memberRateCents: 1500,
    });
    sessionId = await seedFutureClassSession({
      organizationId,
      venueId,
      templateId,
      capacity: 12,
      sessionRateCents: 2500,
      memberRateCents: 1500,
    });

    const throwawayUser = await createTestUserWithPassword();
    parentEmail = throwawayUser.email;
    parentPassword = throwawayUser.password;
    parentUserId = throwawayUser.userId;

    coveredChildId = await createTestChild(parentUserId, coveredChildFirstName);
    lapsedChildId = await createTestChild(parentUserId, lapsedChildFirstName);

    // Signed a month ago — comfortably inside the window.
    await seedLiabilityConsent({
      familyMemberId: coveredChildId,
      organizationId,
      signedByUserId: parentUserId,
      signedDaysAgo: 30,
    });
    // Signed 35 days PAST the window — the lapsed veteran family.
    await seedLiabilityConsent({
      familyMemberId: lapsedChildId,
      organizationId,
      signedByUserId: parentUserId,
      signedDaysAgo: WAIVER_VALID_DAYS + 35,
    });
  });

  test.afterAll(async () => {
    // A leaked GRANTED consents row on the shared staging DB would silently
    // satisfy a later run's "no waiver on file" fixture.
    await deleteConsentsFor([coveredChildId, lapsedChildId]);
    if (sessionId) await deleteTestSession(sessionId);
    if (templateId) await cleanupTestClassFixtures([templateId]);
  });

  /** Opens the drop-in door modal and picks `childName`. Shared by both
   *  halves so the only difference between them is the fixture's coverage. */
  async function openDoorAndPick(
    page: import("@playwright/test").Page,
    childName: string,
  ) {
    await page.goto("/youth/classes");
    await waitForHydration(page);

    // /youth/classes has TWO beacon islands, so wait for the door's own
    // concrete DOM rather than trusting waitForHydration alone (see
    // scenario 3's identical note).
    const doorButton = page.locator(`button[data-dropin-slot="${templateId}"]`);
    await expect(doorButton).toBeVisible({ timeout: 20_000 });
    await doorButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(new RegExp(`^Book ${templateName}$`))).toBeVisible({
      timeout: 15_000,
    });
    await dialog.getByRole("button", { name: new RegExp(childName) }).click();
    return dialog;
  }

  test("covered child goes straight to payment — no waiver panel, no waiver fields on the wire", async ({
    page,
  }) => {
    const booking = stubPaidBooking(page);

    await signIn(page, parentEmail, parentPassword);
    const dialog = await openDoorAndPick(page, coveredChildFirstName);

    // The free-first attempt 403s `no_membership`; the modal's 403 branch
    // then consults `waiverOnFile` (from /api/family-members?includeWaiver=1)
    // and, for this child, goes straight to the paid door. The stub answers
    // that POST without a checkoutUrl, so the modal settles on its success
    // panel and the page stays alive for the assertions below.
    await expect(dialog.getByText("You're all set!")).toBeVisible({ timeout: 30_000 });

    const sent = booking.sentBody();
    // The contract: a covered family sends NO signature. The server re-checks
    // the same predicate and stamps "On file (annual waiver)" itself.
    expect(sent).not.toHaveProperty("waiverAccepted");
    expect(sent).not.toHaveProperty("waiverName");
    expect(sent.familyMemberId).toBe(coveredChildId);

    // Zero waiver-panel renders, asserted against a live document rather than
    // a blank post-navigation one.
    await expect(
      dialog.getByText("One more step: sign the guardian waiver"),
    ).toHaveCount(0);
    expect(booking.postCount()).toBe(1);
  });

  test("child whose signature has EXPIRED still gets the waiver panel", async ({ page }) => {
    const dropinBookingPosts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/dropin/bookings")) {
        dropinBookingPosts.push(req.url());
      }
    });

    await signIn(page, parentEmail, parentPassword);
    const dialog = await openDoorAndPick(page, lapsedChildFirstName);

    // A signature exists — it is simply too old. "Have they ever signed?"
    // would skip the panel here; "is their signature still valid?" must not.
    await expect(dialog.getByText("One more step: sign the guardian waiver")).toBeVisible({
      timeout: 20_000,
    });
    expect(dropinBookingPosts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 8 — family-card make-up modal: the 402 path is waiver-gated
// ---------------------------------------------------------------------------

/**
 * The 402 `allotment_exhausted` → "Pay for this class" path in
 * family-classes-card.tsx's MakeUpModal. It used to go straight to the paid
 * booking on the assumption that spending an allotment proved a signature
 * existed — an assumption a 365-day expiry inverts: a family enrolled 14
 * months ago has spent an allotment every month AND has a lapsed waiver.
 *
 * Fixture: an ACTIVE membership on a tier granting ZERO classes per month, so
 * the very first booking attempt returns 402 with a real `memberRateCents`
 * quote and no allotment has to be drained first (get-child-membership.ts
 * short-circuits `classAllotmentRemaining` to 0 for a tier with no class
 * benefit, and book-child.ts reads `remaining === 0` on an active membership
 * as `allotment_exhausted`).
 *
 * BOTH halves of `payOrCollectWaiver` are covered here, because a gate that
 * always asks is as wrong as one that never does:
 *   - the UNCOVERED child must land on the guardian waiver panel with ZERO
 *     requests to the paid booking endpoint;
 *   - the COVERED child must go straight to payment, with no panel and no
 *     waiver fields on the wire (the same two assertions scenario 6 makes for
 *     the drop-in door).
 *
 * The covered half matters disproportionately on THIS door. The endpoint now
 * has a server gate of its own (an uncovered child path with no signature
 * 422s `waiver_required` before Stripe), so a regression in the ASKING
 * direction is caught server-side — but nothing server-side can catch the
 * opposite regression, a client that asks a covered family every single time.
 * That is what the covered half below pins.
 */
test.describe("Make-up modal — paid 402 path is waiver-gated", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let venueId: string;
  let templateId: string;
  let sessionId: string;
  let tierId: string;
  let membershipId: string;
  let coveredMembershipId: string;
  let parentEmail: string;
  let parentPassword: string;
  let parentUserId: string;
  let childId: string;
  let coveredChildId: string;

  const suffix = Date.now();
  const childFirstName = `MakeupGateE2E-${suffix}`;
  const coveredChildFirstName = `MakeupCoveredE2E-${suffix}`;
  const templateName = `PackPurchaseE2E-MakeupGate-${suffix}`;

  test.beforeAll(async () => {
    ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());
    const db = getDb();

    templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: templateName,
      capacity: 12,
      sessionRateCents: 2500,
      memberRateCents: 1500,
    });
    // memberRateCents MUST be set: without it the 402 branch in
    // /api/classes/book returns 409 class_rate_not_configured instead of a
    // quote, and this scenario never reaches the confirm panel.
    sessionId = await seedFutureClassSession({
      organizationId,
      venueId,
      templateId,
      capacity: 12,
      sessionRateCents: 2500,
      memberRateCents: 1500,
    });

    // Reuses the existing "Makeup Tier 1 - " prefix so the shared orphan
    // sweep in classes-helpers already knows how to clean it up.
    const [tier] = await db
      .insert(membershipTiers)
      .values({
        organizationId,
        name: `Makeup Tier 1 - e2e-gate-${suffix}`,
        monthlyPriceCents: 5000,
        benefits: { classes_per_month: 0 },
        isActive: true,
      })
      .returning();
    tierId = tier.id;

    const throwawayUser = await createTestUserWithPassword();
    parentEmail = throwawayUser.email;
    parentPassword = throwawayUser.password;
    parentUserId = throwawayUser.userId;

    // Two children on the SAME zero-allotment tier under the SAME parent, so
    // the only variable between the two halves is waiver coverage.
    childId = await createTestChild(parentUserId, childFirstName);
    membershipId = await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `e2e-makeup-gate-${suffix}`,
    });

    coveredChildId = await createTestChild(parentUserId, coveredChildFirstName);
    coveredMembershipId = await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: coveredChildId,
      organizationId,
      tierId,
      // memberships.stripe_subscription_id carries a DB unique constraint —
      // the suffix must differ from the sibling above.
      idSuffix: `e2e-makeup-covered-${suffix}`,
    });
    await seedLiabilityConsent({
      familyMemberId: coveredChildId,
      organizationId,
      signedByUserId: parentUserId,
      signedDaysAgo: 30,
    });
  });

  test.afterAll(async () => {
    const db = getDb();
    // A leaked GRANTED consents row would silently satisfy a later run's "no
    // waiver on file" fixture on the shared staging DB.
    await deleteConsentsFor([coveredChildId]);
    const membershipIds = [membershipId, coveredMembershipId].filter(Boolean);
    if (membershipIds.length > 0) {
      await db.delete(memberships).where(inArray(memberships.id, membershipIds));
    }
    if (tierId) await cleanupTestMembershipTiers([tierId]);
    if (sessionId) await deleteTestSession(sessionId);
    if (templateId) await cleanupTestClassFixtures([templateId]);
  });

  /** Dashboard → the child's card → make-up modal → click this run's session,
   *  landing on the 402 price-confirm step. Shared by both halves so the only
   *  difference between them is the fixture's coverage. */
  async function openMakeUpAndConfirmPrice(
    page: import("@playwright/test").Page,
    childName: string,
  ) {
    await page.goto("/dashboard/family");
    await waitForHydration(page);

    const card = page
      .locator("div.flex.items-start.gap-3.rounded-xl.border.border-border.border-l-4.p-3")
      .filter({ hasText: childName });
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.getByRole("button", { name: "Book a make-up" }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText(new RegExp(`Book a make-up class for ${childName}`)),
    ).toBeVisible({ timeout: 20_000 });

    await dialog
      .locator("button.w-full.text-left.rounded-xl")
      .filter({ hasText: templateName })
      .click();

    // 402 allotment_exhausted → the price-confirm step, quoting the session's
    // real memberRateCents (never the adult pickup rate card).
    await expect(dialog.getByText("Book this class")).toBeVisible({
      timeout: 20_000,
    });
    // 1500 cents renders as "$15" — family-classes-card.tsx's `fmtDollars`
    // drops the fraction digits on a whole-dollar amount.
    await expect(dialog.getByText(/book it as a one-off for \$15/)).toBeVisible();

    return dialog;
  }

  test("confirming the paid make-up price collects the guardian waiver before any payment request", async ({
    page,
  }) => {
    const dropinBookingPosts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/dropin/bookings")) {
        dropinBookingPosts.push(req.url());
      }
    });

    await signIn(page, parentEmail, parentPassword);
    const dialog = await openMakeUpAndConfirmPrice(page, childFirstName);

    await dialog.getByRole("button", { name: "Pay for this class" }).click();

    // THE FIX: the price is confirmed, but the waiver decision still applies.
    // The panel must appear — with its pay-specific button label — and no
    // request to the paid booking endpoint may have been made.
    await expect(dialog.getByText("One more step: sign the guardian waiver")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      dialog.getByRole("button", { name: "Sign waiver & continue to payment" }),
    ).toBeVisible();
    expect(dropinBookingPosts).toHaveLength(0);
  });

  test("a COVERED child skips the panel and pays with no waiver fields on the wire", async ({
    page,
  }) => {
    // The other half of `payOrCollectWaiver`. Without this, a gate that
    // ALWAYS asks — the exact regression the fix could decay into — would
    // still pass the test above, and the covered family would be back to
    // re-signing on every single make-up.
    //
    const booking = stubPaidBooking(page);

    await signIn(page, parentEmail, parentPassword);
    const dialog = await openMakeUpAndConfirmPrice(page, coveredChildFirstName);

    await dialog.getByRole("button", { name: "Pay for this class" }).click();

    // The stub keeps the page put, so the modal lands on its own success
    // panel instead of leaving for Stripe — which is what makes the
    // panel-absence assertion below meaningful rather than a check against a
    // blank post-navigation document.
    await expect(dialog.getByText("You're all set!")).toBeVisible({ timeout: 20_000 });

    const sent = booking.sentBody();
    // The contract, mirroring scenario 6's drop-in door assertions: a covered
    // family sends NO signature, and the paid booking is tagged to the CHILD
    // (fulfillment records it against them, not the payer).
    expect(sent).not.toHaveProperty("waiverAccepted");
    expect(sent).not.toHaveProperty("waiverName");
    expect(sent.familyMemberId).toBe(coveredChildId);
    expect(sent.sessionId).toBe(sessionId);

    // Zero waiver-panel renders, asserted on a page that is still showing the
    // modal.
    await expect(
      dialog.getByText("One more step: sign the guardian waiver"),
    ).toHaveCount(0);
    expect(booking.postCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 10 — the SERVER 422 gate drives the panel, not just the client
// pre-check (Task 9)
// ---------------------------------------------------------------------------

/**
 * Scenario 8's covered half proves the CLIENT pre-check
 * (`child.hasWaiverOnFile === true` from the summary snapshot) sends a
 * covered family straight to payment with no signature. This scenario proves
 * the INDEPENDENT server-side gate in `POST /api/dropin/bookings` (see its
 * `422 waiver_required` block) is what actually stands behind that check when
 * the snapshot is wrong — not dead code the client never exercises.
 *
 * Fixture: seed the child with a LIVE liability signature, so the
 * `/api/classes/summary` snapshot the dashboard loads on `beforeAll` says
 * `hasWaiverOnFile: true` — `payOrCollectWaiver` takes the "covered" branch
 * and calls `payForClass()` with NO waiver fields, same as scenario 8's
 * covered half. Only after that snapshot is already in the client's hands
 * (dialog open, price confirmed) does the test delete the consent row
 * directly — invisible to the already-rendered page, exactly the staleness
 * `payForClass`'s own doc comment names ("a waiver that lapsed between the
 * dashboard load and this click"). The signature-less POST that follows is
 * let through to the REAL endpoint (not stubbed), so the 422 asserted below
 * is the server's own answer, not a fixture the test wrote for itself. Only
 * the SECOND request — the resubmit carrying the just-collected signature —
 * is stubbed, per this file's stubbed-POST pattern, so completion doesn't
 * depend on Stripe.
 */
test.describe("Make-up modal — server 422 gate drives the panel", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let venueId: string;
  let templateId: string;
  let sessionId: string;
  let tierId: string;
  let membershipId: string;
  let parentEmail: string;
  let parentPassword: string;
  let parentUserId: string;
  let childId: string;

  const suffix = Date.now();
  const childFirstName = `StaleWaiverGateE2E-${suffix}`;
  const templateName = `PackPurchaseE2E-StaleGate-${suffix}`;

  test.beforeAll(async () => {
    ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());
    const db = getDb();

    templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: templateName,
      capacity: 12,
      sessionRateCents: 2500,
      memberRateCents: 1500,
    });
    sessionId = await seedFutureClassSession({
      organizationId,
      venueId,
      templateId,
      capacity: 12,
      sessionRateCents: 2500,
      memberRateCents: 1500,
    });

    // Reuses the existing "Makeup Tier 1 - " prefix so the shared orphan
    // sweep in classes-helpers already knows how to clean it up.
    const [tier] = await db
      .insert(membershipTiers)
      .values({
        organizationId,
        name: `Makeup Tier 1 - e2e-stalegate-${suffix}`,
        monthlyPriceCents: 5000,
        benefits: { classes_per_month: 0 },
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
      idSuffix: `e2e-stalegate-${suffix}`,
    });
    // LIVE at dashboard-load time — this is what makes the client's own
    // pre-check take the "covered" branch.
    await seedLiabilityConsent({
      familyMemberId: childId,
      organizationId,
      signedByUserId: parentUserId,
      signedDaysAgo: 30,
    });
  });

  test.afterAll(async () => {
    const db = getDb();
    // Already deleted mid-test, but idempotent — a run that fails before
    // that point must not leak a GRANTED consents row on the shared DB.
    await deleteConsentsFor([childId]);
    if (membershipId) await db.delete(memberships).where(eq(memberships.id, membershipId));
    if (tierId) await cleanupTestMembershipTiers([tierId]);
    if (sessionId) await deleteTestSession(sessionId);
    if (templateId) await cleanupTestClassFixtures([templateId]);
  });

  test("a stale client snapshot still gets refused server-side, and signing completes the payment", async ({
    page,
  }) => {
    await signIn(page, parentEmail, parentPassword);

    await page.goto("/dashboard/family");
    await waitForHydration(page);

    const card = page
      .locator("div.flex.items-start.gap-3.rounded-xl.border.border-border.border-l-4.p-3")
      .filter({ hasText: childFirstName });
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.getByRole("button", { name: "Book a make-up" }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText(new RegExp(`Book a make-up class for ${childFirstName}`)),
    ).toBeVisible({ timeout: 20_000 });

    await dialog
      .locator("button.w-full.text-left.rounded-xl")
      .filter({ hasText: templateName })
      .click();

    // 402 allotment_exhausted → the price-confirm step. `child.hasWaiverOnFile`
    // in this snapshot is `true` (the consent seeded above is still live at
    // this point).
    await expect(dialog.getByText("Book this class")).toBeVisible({
      timeout: 20_000,
    });
    await expect(dialog.getByText(/book it as a one-off for \$15/)).toBeVisible();

    // The snapshot the dashboard loaded with is now stale — the consent that
    // made it true a moment ago is gone, invisible to the already-rendered
    // page. `payOrCollectWaiver` still reads `child.hasWaiverOnFile === true`
    // and will call `payForClass()` with NO signature.
    await deleteConsentsFor([childId]);

    // Only the SIGNED resubmit is stubbed — the first, signature-less
    // request goes to the real endpoint so its 422 is a real server answer,
    // not a fixture of this test.
    await page.route("**/api/dropin/bookings", async (route) => {
      const req = route.request();
      if (req.method() !== "POST") return route.continue();
      const body = JSON.parse(req.postData() ?? "{}") as Record<string, unknown>;
      if (body.waiverAccepted === true) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ bookingId: "e2e-stubbed-booking", paymentRequired: false }),
        });
        return;
      }
      return route.continue();
    });

    const firstAttempt = page.waitForResponse(
      (res) => res.url().includes("/api/dropin/bookings") && res.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Pay for this class" }).click();

    const res = await firstAttempt;
    expect(res.status()).toBe(422);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("waiver_required");

    // THE ASSERTION: the panel is driven by that 422, not by the client's
    // own (stale, true) pre-check — the pre-check would have sent no
    // signature at all, and did.
    await expect(dialog.getByText("One more step: sign the guardian waiver")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      dialog.getByRole("button", { name: "Sign waiver & continue to payment" }),
    ).toBeVisible();

    await dialog.locator("#makeup-waiver-accept").click();
    await dialog.locator("#makeup-waiver-signer-name").fill("Stale Waiver E2E Parent");
    await dialog.getByRole("button", { name: "Sign waiver & continue to payment" }).click();

    // Signing resubmits `payForClass(signedBy)`, which the route stub above
    // now answers — completing the flow entirely stub-side, no Stripe
    // dependency.
    await expect(dialog.getByText("You're all set!")).toBeVisible({ timeout: 20_000 });
  });
});

