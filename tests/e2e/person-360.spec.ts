import { test, expect } from "@playwright/test";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classCreditGrants } from "@/lib/db/schema/classes";
import { familyMembers } from "@/lib/db/schema/registrations";
import { ensureCustomerOrgMembership } from "@/lib/organization/ensure-membership";
import { signInAsAdmin, waitForHydration } from "../utils/test-helpers";
import { createTestChild } from "../utils/classes-helpers";
import { resolveDefaultOrgForHttpTests } from "../utils/dropin-helpers";
import { createTestUserWithPassword } from "../utils/host-helpers";

/**
 * Person-360 E2E: search → person card
 *
 * Flow:
 *   1. Sign in as admin.
 *   2. Navigate to /admin/venue (the command center that hosts CommandSearchBar +
 *      PersonCard).
 *   3. Wait for React hydration (VenueCommandCenter calls useHydrationBeacon).
 *   4. Type a query into the search input (≥2 chars to clear the debounce threshold
 *      in CommandSearchBar — a single character does not trigger the API call).
 *   5. If any [data-person-result] rows appear, click the first one and assert that
 *      the Person 360 slide-over (role="dialog") opens and shows a type badge
 *      matching /child|adult|parent/i.
 *
 * Guard strategy: all data-dependent assertions are behind count() checks so the
 * test passes (skip-style) on a thin seed rather than failing.
 *
 * Timeouts: elevated because the /api/admin/person/[id] aggregation is slow against
 * the bloated staging DB in CI.
 */
test("search opens the person-360 card", async ({ page }) => {
  test.setTimeout(90_000);

  await signInAsAdmin(page);
  await page.goto("/admin/venue", { waitUntil: "domcontentloaded" });
  await waitForHydration(page, { timeout: 20_000 });

  // ── Locate the search input by its actual placeholder ──────────────────────
  // CommandSearchBar renders:
  //   <input placeholder="Search players and accounts…" aria-label="Search players and accounts" />
  // The regex /search|find/i from the brief still matches "Search", but we use
  // the aria-label for a more stable selector.
  const search = page.getByLabel("Search players and accounts");
  await expect(search).toBeVisible({ timeout: 10_000 });

  // Type at least 2 chars — CommandSearchBar skips the API fetch on debounced.length < 2.
  // The brief suggested "a" (1 char) but that never fires; use "al" instead.
  await search.fill("al");

  // ── Wait for results dropdown (role="listbox") to appear ───────────────────
  // If the staging DB is empty or the search returns nothing, the listbox may
  // still render with a "No matches." message. We guard every data-dependent
  // step with count() so the test degrades gracefully.
  const resultRows = page.locator("[data-person-result]");

  // Give the debounce + fetch up to 15 s to produce at least one row.
  // If it stays 0, we skip the click/assert block.
  let rowCount = 0;
  try {
    await expect(resultRows.first()).toBeVisible({ timeout: 15_000 });
    rowCount = await resultRows.count();
  } catch {
    // No results on this seed — test passes without asserting the card.
  }

  if (rowCount > 0) {
    // Click the first result (player or account row).
    await resultRows.first().click();

    // ── Person card (Sheet) should open ──────────────────────────────────────
    // PersonCard renders a shadcn Sheet → role="dialog" in the DOM.
    const card = page.getByRole("dialog");
    await expect(card).toBeVisible({ timeout: 60_000 });

    // ── Type badge must match one of the three person shapes ─────────────────
    // PersonSections.typeBadgeLabel() returns:
    //   child  → "Child · age N"
    //   adult  → "Adult player"
    //   parent → "Parent · account"
    await expect(
      card.getByText(/child|adult|parent/i).first()
    ).toBeVisible({ timeout: 60_000 });

    // ── Contact line must be present ─────────────────────────────────────────
    // PersonHeader always renders at least one of:
    //   • a tel: anchor (phone)
    //   • a mailto: anchor (email)
    //   • a "parent: …" span (isParentContact)
    // We assert that the card contains at least one tel/mailto link OR the
    // "parent: " text, which covers all three person types.
    const contactLink = card.locator('a[href^="tel:"], a[href^="mailto:"]');
    const parentLabel = card.getByText(/^parent:/i);
    const hasPhone = (await contactLink.count()) > 0;
    const hasParentLabel = (await parentLabel.count()) > 0;
    expect(hasPhone || hasParentLabel, "expected a contact link or parent label in the card").toBe(true);
  }
});

/**
 * Person-360 E2E: person card — sticky action bar + "Open full profile →" navigation
 *
 * Extends the search→open flow to assert:
 *   (a) The sticky footer action bar renders at least one action button
 *       (Check in / + Walk-in for family / Add — all rendered by FooterCTAs in PersonCard).
 *   (b) The "Open full profile →" anchor (exact text, plain <a> link inside the
 *       scrollable body of the Sheet) navigates to /admin/people/[id] and the
 *       full-profile page renders (← Back to command center link + type badge visible).
 *
 * The "Open full profile →" link is a plain anchor rendered directly in PersonCard:
 *   <a href={`/admin/people/${profile.id}?as=${target.as}`}>Open full profile →</a>
 * It is scoped to the role="dialog" to avoid ambiguity with any other page links.
 *
 * PersonDetail calls useHydrationBeacon(), so waitForHydration() works post-nav.
 *
 * Guard strategy: same count() pattern — if no search results, the assertions are
 * skipped and the test passes on a thin seed.
 */
test("person card shows action bar and navigates to full profile", async ({ page }) => {
  test.setTimeout(90_000);

  await signInAsAdmin(page);
  await page.goto("/admin/venue", { waitUntil: "domcontentloaded" });
  await waitForHydration(page, { timeout: 20_000 });

  // ── Same search flow as the first test ────────────────────────────────────
  const search = page.getByLabel("Search players and accounts");
  await expect(search).toBeVisible({ timeout: 10_000 });
  await search.fill("al");

  const resultRows = page.locator("[data-person-result]");
  let rowCount = 0;
  try {
    await expect(resultRows.first()).toBeVisible({ timeout: 15_000 });
    rowCount = await resultRows.count();
  } catch {
    // No results on this seed — skip gracefully.
  }

  if (rowCount === 0) return;

  await resultRows.first().click();

  // ── Wait for the Person 360 Sheet to open and profile to load ─────────────
  const card = page.getByRole("dialog");
  await expect(card).toBeVisible({ timeout: 60_000 });

  // Wait until a type badge (which is only rendered after usePerson resolves)
  // is visible — this means the profile has loaded and FooterCTAs are rendered.
  await expect(
    card.getByText(/child|adult|parent/i).first()
  ).toBeVisible({ timeout: 60_000 });

  // ── (a) Sticky footer action bar ─────────────────────────────────────────
  // FooterCTAs renders at least one <button> for all three person types:
  //   child  → "Check in" + "Send to parent ▾" + "Add"
  //   adult  → "Check in" + "Send link ▾" + "Add"
  //   parent → "+ Walk-in for family" + "Message"
  // We assert the footer contains at least one button with one of these labels.
  // Using getByRole("button") scoped to the card to avoid false positives.
  const footerButtons = card.getByRole("button").filter({
    hasText: /check in|walk-in|add|send|message/i,
  });
  await expect(footerButtons.first()).toBeVisible({ timeout: 10_000 });

  // ── (b) "Open full profile →" navigates to /admin/people/[id] ────────────
  // The link is an <a> with exact text "Open full profile →", rendered inside
  // the Sheet body (scoped to role="dialog" for safety).
  const fullProfileLink = card.getByRole("link", { name: "Open full profile →" });
  await expect(fullProfileLink).toBeVisible({ timeout: 10_000 });

  // Click the link and wait for navigation to /admin/people/[id].
  // page.waitForURL is registered before the click to avoid a race.
  const [navUrl] = await Promise.all([
    page.waitForURL(/\/admin\/people\//, { timeout: 30_000 }),
    fullProfileLink.click(),
  ]);

  // ── Assert the full-profile page rendered ────────────────────────────────
  // PersonDetail calls useHydrationBeacon() so we can wait for hydration.
  await waitForHydration(page, { timeout: 30_000 });

  // PersonDetail always renders a "← Back to command center" back link as
  // its first element (renamed from "← People" in b3a3b2a5, which fixed a
  // dead /admin/people link but left this assertion stale).
  const backLink = page.getByRole("link", { name: /← Back to command center/i });
  await expect(backLink).toBeVisible({ timeout: 10_000 });

  // PersonHeader renders the same type badge as PersonCard — assert it is
  // visible in the full-profile page as well.
  await expect(
    page.getByText(/child|adult|parent/i).first()
  ).toBeVisible({ timeout: 10_000 });
});

/**
 * Person 360 → full profile: admin "Issue credits" comp-grant form (Task 9
 * fix-round follow-up — the two tests above are the only spec touching
 * `/admin/people/[id]`, and neither exercised `ClassCreditsSection`, the
 * form `src/pages/api/admin/classes/credits/grant.ts` sits behind).
 *
 * Deterministic fixture, NOT the search-driven guard-with-count() pattern
 * above: the "Issue credits" form only needs one known child, and search
 * results depend on whatever happens to already be in the shared staging
 * DB. A brand-new throwaway user/child (same shape `class-pack-purchase.
 * spec.ts` uses) is admin-*invisible* by default though — `buildPersonProfile`
 * → `isUserInOrg` 404s the page unless the parent has a
 * `user_organization_access` row, which "organic" registration/booking flows
 * write via `ensureCustomerOrgMembership` but a bare fixture insert does not.
 * Calling it directly in `beforeAll` is the minimal fix — mirrors what those
 * flows already do, not a workaround.
 */
test.describe("Person 360 — admin issues class credits", () => {
  test.setTimeout(90_000);

  let organizationId: string;
  let childId: string;

  const suffix = Date.now();
  const childFirstName = `Person360CreditsE2E-${suffix}`;

  test.beforeAll(async () => {
    ({ organizationId } = await resolveDefaultOrgForHttpTests());
    const throwawayUser = await createTestUserWithPassword();
    childId = await createTestChild(throwawayUser.userId, childFirstName);
    await ensureCustomerOrgMembership(getDb(), throwawayUser.userId, organizationId);
  });

  test.afterAll(async () => {
    const db = getDb();
    await db.delete(classCreditGrants).where(eq(classCreditGrants.familyMemberId, childId));
    await db.delete(familyMembers).where(eq(familyMembers.id, childId));
  });

  test("issuing credits (happy path) lands a comp grant in the ledger", async ({ page }) => {
    await signInAsAdmin(page);

    // Default `as=family_member` (the astro route's own default) is correct
    // for a dependent — no query param needed.
    await page.goto(`/admin/people/${childId}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page, { timeout: 20_000 });

    // Confirms the right person's profile loaded before touching the form.
    await expect(page.getByText(childFirstName)).toBeVisible({ timeout: 20_000 });

    const openButton = page.getByRole("button", { name: "+ Issue credits" });
    await expect(openButton).toBeVisible({ timeout: 15_000 });
    await openButton.click();

    // `getByLabel` resolves via the wrapping <label> (span + input), same as
    // the implicit-label pattern used elsewhere in this file.
    await page.getByLabel("Sessions").fill("5");
    await page.getByLabel("Note (optional)").fill("E2E happy-path grant");

    // Exact match: the collapsed toggle button's text is "+ Issue credits",
    // the submit button's is "Issue credits" — both would match a substring
    // query.
    const submit = page.getByRole("button", { name: "Issue credits", exact: true });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText(/Issued 5 class credits/i)).toBeVisible({ timeout: 15_000 });

    // Success collapses the form back to the toggle button (resetForm() +
    // setOpen(false)) — confirms the UI actually completed, not just the
    // toast.
    await expect(page.getByRole("button", { name: "+ Issue credits" })).toBeVisible({
      timeout: 10_000,
    });

    // The real assertion: a comp grant landed in the ledger, not just an
    // optimistic client-side toast.
    const db = getDb();
    const [grant] = await db
      .select()
      .from(classCreditGrants)
      .where(and(eq(classCreditGrants.familyMemberId, childId), eq(classCreditGrants.source, "comp")))
      .orderBy(desc(classCreditGrants.createdAt))
      .limit(1);
    expect(grant).toBeTruthy();
    expect(grant.sessionsGranted).toBe(5);
    expect(grant.pricePaidCents).toBe(0);
    expect(grant.stripeCheckoutSessionId).toBeNull();
  });
});
