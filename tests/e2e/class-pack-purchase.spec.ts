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
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classPackProducts, classCreditGrants } from "@/lib/db/schema/classes";
import { dropInSessions, dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import {
  createTestChild,
  createTestCreditGrant,
  createTestClassTemplate,
  cleanupTestClassFixtures,
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

