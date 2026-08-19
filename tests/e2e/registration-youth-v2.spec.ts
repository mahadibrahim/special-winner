import { test, expect } from "@playwright/test";
import { waitForHydration, signIn, TEST_USERS } from "../utils/test-helpers";

// Youth solo registration adopted the v2 step list (Player → Payment →
// Confirm), but NOT the adult-self behaviors. This spec guards the single
// most dangerous of those: the aggressive resume card.
//
// Adult-locked seasons are self-only, so an unfinished payment for the season
// is unambiguously what the returning visitor came back for — the wizard
// short-circuits straight to "Finish your payment". Youth must not do that. A
// parent whose payment for child A stalled, returning to register child B,
// would be hijacked: the Player step never renders and they get pushed to pay
// for the wrong kid. Youth therefore keeps the narrow trigger — the resume
// card appears only on the ?payment=cancelled bounce-back from Stripe.

const YOUTH_SEASON_SLUG = "e2e-test-spring-2026";
const RESUME_CARD = /Finish your payment/i;
const PLAYER_STEP = /who are you registering/i;

test.describe("Youth v2 wizard (authed parent)", () => {
  test.setTimeout(120_000);

  test("a pending youth payment does NOT hijack the wizard, but ?payment=cancelled still resumes it", async ({
    page,
  }) => {
    await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);

    // Resolve the seeded youth season by slug — never "the first open season"
    // (shared-staging capacity drift silently flips that to an adult season).
    const seasonsRes = await page.request.get("/api/public/seasons?status=open");
    expect(seasonsRes.ok()).toBe(true);
    const seasons = (await seasonsRes.json()).seasons ?? [];
    const season = seasons.find((s: { slug?: string }) => s.slug === YOUTH_SEASON_SLUG);
    expect(
      season,
      `expected seeded youth season ${YOUTH_SEASON_SLUG} — re-seed e2e data`,
    ).toBeTruthy();

    // Mint a fresh dependent (unique per run, so the already-registered 409
    // guard never fires) and leave a pending+unpaid registration for it —
    // exactly the state a stalled Stripe payment leaves behind.
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fmRes = await page.request.post("/api/family-members", {
      data: {
        firstName: "Resume",
        lastName: `Guard${stamp}`,
        birthDate: "2018-06-01",
        parentalConsent: true,
      },
    });
    expect(fmRes.status()).toBe(201);
    const familyMemberId = (await fmRes.json()).familyMember.id;

    const regRes = await page.request.post("/api/registrations", {
      data: {
        seasonId: season.id,
        familyMemberId,
        registrationType: "full",
        waiverSigned: false,
      },
    });
    expect(regRes.status()).toBe(201);
    const registration = (await regRes.json()).registration;
    test.skip(
      registration.status !== "pending",
      `season is at capacity in this env (row came back ${registration.status})`,
    );

    // ── Normal return: the Player step renders, the resume card does not. ──
    await page.goto(`/register/${season.id}?mode=individual`, {
      waitUntil: "domcontentloaded",
    });
    await waitForHydration(page);
    await expect(page.getByText(PLAYER_STEP)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(RESUME_CARD)).toHaveCount(0);

    // ── Bounce-back from a cancelled Stripe session: the card DOES show. ──
    await page.goto(`/register/${season.id}?mode=individual&payment=cancelled`, {
      waitUntil: "domcontentloaded",
    });
    await waitForHydration(page);
    await expect(page.getByText(RESUME_CARD)).toBeVisible({ timeout: 15_000 });
  });

  test("the authed youth wizard has no Agreements step", async ({ page }) => {
    await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);

    const seasonsRes = await page.request.get("/api/public/seasons?status=open");
    const seasons = (await seasonsRes.json()).seasons ?? [];
    const season = seasons.find((s: { slug?: string }) => s.slug === YOUTH_SEASON_SLUG);
    test.skip(!season, `seeded youth season ${YOUTH_SEASON_SLUG} missing`);

    await page.goto(`/register/${season.id}?mode=individual`, {
      waitUntil: "domcontentloaded",
    });
    await waitForHydration(page);

    // The progress header is derived from the live step list — 3 dots, and
    // "Agreements" is not one of them.
    await expect(page.getByText(PLAYER_STEP)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Agreements")).toHaveCount(0);
  });
});
