import { test, expect } from "@playwright/test";
import { waitForHydration } from "../../utils/test-helpers";

/**
 * Customer-journey "spine" smoke test.
 *
 * The full 14-step spine is defined in
 * docs/superpowers/specs/2026-05-16-admin-deep-dive-design.md §6:
 *
 *   1.  anon GET /                                                  ✅ covered here
 *   2.  anon GET /sports/soccer                                     ✅ covered here
 *   3.  anon GET /register/<season-id>                              ✅ covered here
 *   4.  anon fills child info → continue                            ⏭ deferred (see TODO)
 *   5.  anon signs waiver → continue                                ⏭ deferred (see TODO)
 *   6.  anon enters email; "I'm new" → /signup with CAPTCHA          ⏭ deferred (Turnstile)
 *   7.  verification email arrives                                  ⏭ deferred (Resend infra)
 *   8.  click magic link → /m/<token> → /dashboard                  ⏭ deferred (email infra)
 *   9.  resume /register/<id>?returning=1                           ⏭ deferred
 *   10. Stripe Checkout (test mode) → success                       ⏭ deferred (Stripe automation)
 *   11. GET /dashboard — registration confirmed                     ⏭ deferred
 *   12. admin POV: /admin/seasons/<id> Registrations tab            (covered by admin-overhaul/super-admin.spec.ts)
 *   13. admin POV: /admin/payments                                  (no e2e yet)
 *   14. admin POV: /admin/venue/day/<game-date>                     (covered by admin-overhaul/venue-day.spec.ts)
 *
 * This spec ships the public-facing front half (steps 1-3) as a real CI
 * guard. Steps 4-5 are inside the wizard but require a signed-in adult,
 * which is already covered by tests/e2e/registration-adult.spec.ts.
 * Steps 6-11 need Turnstile + email + Stripe automation — separate work.
 *
 * Adding the spec at the path the design doc calls out
 * (tests/e2e/customer-journey/season-signup.spec.ts) so future tests
 * land here and the missing-step TODOs stay visible.
 */

const ADULT_OPEN_SEASON_SLUG = "e2e-adult-open-soccer-2026";

test.describe("Customer-journey spine (public)", { tag: "@critical" }, () => {
  let seasonId: string | null = null;

  test.beforeAll(async ({ request }) => {
    // Find the adult open season seeded by db:seed:e2e. Same lookup as
    // registration-adult.spec.ts — falls back to the unfiltered list if
    // the open-filtered query doesn't surface it.
    const res = await request.get("/api/public/seasons?status=open");
    if (res.ok()) {
      const data = await res.json();
      const seasons: Array<{ id: string; slug: string }> = data.seasons ?? [];
      seasonId = seasons.find((s) => s.slug === ADULT_OPEN_SEASON_SLUG)?.id ?? null;
    }
    if (!seasonId) {
      const allRes = await request.get("/api/public/seasons");
      if (allRes.ok()) {
        const data = await allRes.json();
        const seasons: Array<{ id: string; slug: string }> = data.seasons ?? [];
        seasonId = seasons.find((s) => s.slug === ADULT_OPEN_SEASON_SLUG)?.id ?? null;
      }
    }
  });

  test("step 1: marketing home renders for anon", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Body should mount and the page should have a heading somewhere — we
    // don't pin to specific copy here since the marketing home is the
    // surface most likely to be re-skinned.
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("step 2: /sports/soccer SEO page renders for anon", async ({ page }) => {
    await page.goto("/sports/soccer", { waitUntil: "domcontentloaded" });
    // H1 should mention Soccer + Columbus per src/pages/sports/[slug].astro.
    await expect(
      page.getByRole("heading", { level: 1, name: /soccer.*columbus/i }),
    ).toBeVisible();
  });

  test("step 3: anon can open the registration wizard", async ({ page }) => {
    test.skip(
      !seasonId,
      `Adult open season not seeded (slug: ${ADULT_OPEN_SEASON_SLUG}) — run npm run db:seed:e2e`,
    );

    await page.goto(`/register/${seasonId}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // Wait for the wizard's initial loading spinner to clear (the wizard
    // fetches season + family data on mount).
    await page
      .waitForSelector("[class*='animate-spin']", {
        state: "detached",
        timeout: 15_000,
      })
      .catch(() => {
        /* spinner may never render if data hits cache */
      });

    // Step 1 of the wizard (Who) presents Myself / Add a child cards for
    // signed-in users, or a "sign in or continue as guest" surface for
    // anonymous visitors. Either way the page should be on /register/* and
    // not have crashed.
    await expect(page).toHaveURL(/\/register\//);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  // TODO: wire steps 4-11 once Turnstile + email + Stripe test-mode
  // automation are in place. Until then registration-adult.spec.ts covers
  // the wizard-step-2/3 surface for a signed-in user, and the admin POV
  // spec covers the post-pay admin views.
  test.skip("steps 4-11: wizard → signup → magic-link → Stripe → dashboard (deferred)", () => {});
});
