import { test, expect, type BrowserContext } from "@playwright/test";

/**
 * Site announcement ("Next up" card): admin sets a single-slot banner via
 * the org-settings API; it renders server-side in the home + hub heroes,
 * audience-filtered; clearing removes it. Serial — tests share one
 * org-level setting and MUST restore it (shared dev/CI DB).
 *
 * Cookie note: Playwright's per-fixture `request` does NOT share cookies
 * between beforeAll and test bodies. We use `browser.newContext()` instead —
 * the context's cookie jar persists across all calls made on it (same
 * pattern as tests/e2e/media-tagger.spec.ts and media-phase1.spec.ts).
 */

const SETTINGS_API = "/api/admin/organizations/settings";

test.describe.configure({ mode: "serial" });

test.describe("Site announcement", () => {
  let ctx: BrowserContext;
  let original: unknown = null;

  test.beforeAll(async ({ browser, baseURL }) => {
    ctx = await browser.newContext();

    // Sign in as admin — cookie stored on ctx for all subsequent calls.
    const loginRes = await ctx.request.post(`${baseURL}${"/api/auth/signin"}`, {
      data: { email: "admin@test.aspiresports.com", password: "TestAdmin123!" },
    });
    expect(loginRes.ok()).toBeTruthy();

    // Capture current siteAnnouncement so afterAll can restore it.
    const settingsRes = await ctx.request.get(`${baseURL}${SETTINGS_API}`);
    if (settingsRes.ok()) {
      original = (await settingsRes.json()).settings?.siteAnnouncement ?? null;
    }
  });

  test.afterAll(async ({ baseURL }) => {
    // Always restore — keep shared dev/CI DB clean.
    await ctx.request.patch(`${baseURL}${SETTINGS_API}`, {
      data: { settings: { siteAnnouncement: original } },
    });
    await ctx.close();
  });

  test("adult-targeted banner shows on home + /adult, not /youth; clear removes", async ({
    baseURL,
  }) => {
    const page = await ctx.newPage();

    // Set adult-targeted banner.
    const set = await ctx.request.patch(`${baseURL}${SETTINGS_API}`, {
      data: {
        settings: {
          siteAnnouncement: {
            title: "E2E Banner League",
            detail: "Closes soon",
            linkUrl: "/adult/leagues",
            linkLabel: "Claim a spot",
            audience: "adult",
          },
        },
      },
    });
    expect(set.ok()).toBeTruthy();

    // Home shows adult-audience banners (home shows every audience).
    await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("E2E Banner League")).toBeVisible();

    // /adult shows it.
    await page.goto(`${baseURL}/adult`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("E2E Banner League")).toBeVisible();
    await expect(
      page.locator('[data-landing-cta="next-up-card"]'),
    ).toHaveAttribute("href", "/adult/leagues");

    // /youth must NOT show it (adult-targeted, wrong surface).
    await page.goto(`${baseURL}/youth`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("E2E Banner League")).toHaveCount(0);

    // Clear banner.
    const clear = await ctx.request.patch(`${baseURL}${SETTINGS_API}`, {
      data: { settings: { siteAnnouncement: null } },
    });
    expect(clear.ok()).toBeTruthy();

    // Home no longer shows it.
    await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("E2E Banner League")).toHaveCount(0);

    await page.close();
  });
});
