import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

// Money-flow regression: complete a REAL test-mode card payment through the
// wizard's inline deferred form and assert the customer lands on the explicit
// confirmation step — never silently on the dashboard. This is the invariant
// the checkout redesigns kept threatening: "after Pay, the customer must SEE
// that it worked."
//
// Requires a Stripe-configured server (test-mode keys — the bws dev server).
// CI has no Stripe, so the spec self-skips when the payment iframe never
// mounts. Run locally with:
//   PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- payment-confirmation

const ADULT_OPEN_SEASON_SLUG = "e2e-adult-open-soccer-2026";
const TEAM_SEASON_SLUG = "e2e-adult-team-soccer-2026";

/** Fill Stripe's Payment Element with the standard 4242 test card. Expands
 *  the Card accordion row first if the fields render collapsed.
 *
 *  `billingCountry: true` — the element was mounted with setup_future_usage
 *  (card-saving flows, e.g. the team deposit), which adds a billing Country
 *  dropdown. Stripe pre-selects it from IP geolocation, which is flaky —
 *  when geo fails the form silently never completes and Pay stays disabled.
 *  Card-saving callers pass true so the country select is WAITED for and set
 *  deterministically, instead of best-effort-skipped. */
async function fillTestCard(
  frame: ReturnType<import("@playwright/test").Page["frameLocator"]>,
  opts: { billingCountry?: boolean } = {},
) {
  const cardNumber = frame.locator('input[name="number"]');
  if (!(await cardNumber.isVisible({ timeout: 3_000 }).catch(() => false))) {
    await frame.getByText("Card", { exact: true }).first().click();
  }
  await cardNumber.fill("4242424242424242");
  await frame.locator('input[name="expiry"]').fill("12 / 34");
  await frame.locator('input[name="cvc"]').fill("123");
  const country = frame.locator('select[name="country"]');
  if (opts.billingCountry) {
    await country.waitFor({ state: "visible", timeout: 15_000 });
    await country.selectOption("US");
  } else if (await country.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await country.selectOption("US");
  }
  // US cards ask for a postal code (appears once the country resolves).
  const zip = frame.locator('input[name="postalCode"]');
  const zipTimeout = opts.billingCountry ? 10_000 : 3_000;
  if (await zip.isVisible({ timeout: zipTimeout }).catch(() => false)) {
    await zip.fill("42424");
  }
}

test.describe("Payment confirmation (test-mode card)", () => {
  test.setTimeout(180_000);

  let seasonId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.get("/api/public/seasons?status=open");
    expect(res.ok()).toBe(true);
    const data = await res.json();
    const seasons: Array<{ id: string; slug: string }> = data.seasons ?? [];
    let match = seasons.find((s) => s.slug === ADULT_OPEN_SEASON_SLUG);
    if (!match) {
      const allRes = await request.get("/api/public/seasons");
      const allData = await allRes.json();
      match = (allData.seasons ?? []).find(
        (s: { slug: string }) => s.slug === ADULT_OPEN_SEASON_SLUG,
      );
    }
    expect(
      match,
      `Adult open soccer season not found (slug: ${ADULT_OPEN_SEASON_SLUG}) — run npm run db:seed:e2e`,
    ).toBeTruthy();
    seasonId = match!.id;

    // Self-heal capacity: the shared DB accumulates confirmed registrations
    // and any branch's seed re-clamps maxParticipants — a full season makes
    // Pay silently waitlist instead of charging, which is exactly the path
    // this spec must NOT take. Best-effort: 404s when E2E_TEST_ENDPOINTS
    // isn't set; the paid-path assertion below surfaces that loudly.
    await request
      .post("/api/test/season-capacity", {
        data: { slug: ADULT_OPEN_SEASON_SLUG, maxParticipants: 100000 },
      })
      .catch(() => {});
  });

  test("guest pays with 4242 and lands on the confirmation step, not the dashboard", async ({
    page,
  }) => {
    await page.goto(`/register/${seasonId}?audience=adult`, {
      waitUntil: "domcontentloaded",
    });
    await waitForHydration(page);

    const joinSolo = page.getByText(/Join solo/i);
    if (await joinSolo.isVisible({ timeout: 8_000 }).catch(() => false))
      await joinSolo.click();

    // ── Step 1 (v2 minimal): name + email, one Continue. Labels have no
    // htmlFor — locate inputs via their label container (same pattern as
    // registration-adult-guest.spec.ts). ──
    const unique = `pay-conf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fieldInput = (label: string) =>
      page
        .locator("div.space-y-2")
        .filter({ has: page.locator("label", { hasText: label }) })
        .first()
        .locator("input");
    await fieldInput("First name *").fill("Pay");
    await fieldInput("Last name *").fill("Confirmation");
    await fieldInput("Email *").fill(`${unique}@test.example`);
    await page.getByRole("button", { name: /continue/i }).click();

    // ── Step 2: the deferred card form must mount INLINE, no picker click ──
    const stripeFrameEl = page.locator('iframe[name^="__privateStripeFrame"]').first();
    const mounted = await stripeFrameEl
      .waitFor({ state: "visible", timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!mounted, "Stripe not configured in this environment (no payment iframe)");

    // Card-only drift guard: the checkout posture is card + Apple/Google Pay
    // ONLY (Link/Klarna/ACH/BNPL are disabled on the Stripe account — live by
    // the Dashboard, the sandbox via the payment_method_configurations API).
    // If someone re-enables them on the account, this catches it before a
    // customer sees a "$5 back" bank rail again.
    const frame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();
    await expect(frame.getByText("Klarna", { exact: true })).toHaveCount(0);
    await expect(frame.getByText("Powered by Link")).toHaveCount(0);
    await expect(frame.getByText("Bank", { exact: true })).toHaveCount(0);

    await fillTestCard(frame);

    // ── Pay. Deferred flow: this click creates the registration + intent,
    // then confirms — allow a generous window for the round trips. ──
    await page.getByRole("button", { name: /^pay \$/i }).click();

    // ── The invariant: an explicit confirmation, still in the wizard. v2
    // (waiver deferred) shows "You're in — one step left before game 1";
    // v1 shows "Your spot is locked!". Either is a valid success surface. ──
    await expect(
      page.getByText(/You're in — one step left|Your spot is locked/i),
    ).toBeVisible({ timeout: 60_000 });
    expect(
      page.url(),
      "payment success must land on the confirmation step, not bounce to the dashboard",
    ).toContain(`/register/${seasonId}`);
  });

  test("captain pays the $200 deposit inline and lands on the roster invite step", async ({
    page,
    request,
  }) => {
    // Team season resolves independently of the solo fixture above.
    const res = await request.get("/api/public/seasons?status=open");
    const teamSeason = ((await res.json()).seasons ?? []).find(
      (s: { slug: string }) => s.slug === TEAM_SEASON_SLUG,
    );
    test.skip(!teamSeason, `team season fixture missing (${TEAM_SEASON_SLUG})`);

    await page.goto(`/register/${teamSeason.id}?mode=team`, {
      waitUntil: "domcontentloaded",
    });
    await waitForHydration(page);
    await expect(
      page.getByRole("heading", { name: /Reserve your team/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Details + deposit card form share one always-visible screen — the card
    // iframe must be mounted BEFORE any fields are touched (no reveal click).
    const stripeFrameEl = page.locator('iframe[name^="__privateStripeFrame"]').first();
    const mounted = await stripeFrameEl
      .waitFor({ state: "visible", timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!mounted, "Stripe not configured in this environment (no payment iframe)");

    // Fill the reserve details. Labels wrap their inputs (span + input inside
    // one <label>), so filter labels by text and take the inner control.
    const unique = `captain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const teamField = (label: string) =>
      page
        .locator("label")
        .filter({ hasText: label })
        .first()
        .locator("input, textarea")
        .first();
    await teamField("Your email").fill(`${unique}@test.example`);
    await teamField("Team name").fill(`E2E Inline Deposit ${unique.slice(-6)}`);
    await teamField("Your name").fill("Cap Tain");

    const frame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();
    await fillTestCard(frame, { billingCountry: true });

    // Pay $200 — the single commit action: prepare (PI, no account/team yet)
    // then confirm, then finalize (account + team + roster) on success.
    await page.getByRole("button", { name: /^pay \$200/i }).click();

    // Explicit outcome: the roster-invite step of the team HQ.
    await expect(page.getByText(/Invite your roster/i)).toBeVisible({
      timeout: 60_000,
    });
    expect(
      page.url(),
      "deposit success must land on the team invite step, not bounce elsewhere",
    ).toContain(`/register/${teamSeason.id}`);
  });
});
