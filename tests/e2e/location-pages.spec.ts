import { test, expect, type Page } from "@playwright/test";

// Venue pages are data-driven: resolve a real location slug from the index
// rather than hardcoding prod-only slugs (staging uses fixture locations).
async function firstLocationSlug(page: Page): Promise<string | null> {
  await page.goto("/locations", { waitUntil: "domcontentloaded" });
  const href = await page
    .locator('a[href^="/locations/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  return href ? href.replace("/locations/", "") : null;
}

test("locations index renders venue cards with CTAs", async ({ page }) => {
  await page.goto("/locations", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: /where we play/i }),
  ).toBeVisible();
  const venueLinks = page.locator('a[href^="/locations/"]');
  expect(await venueLinks.count()).toBeGreaterThan(0);
  // Stay-in-the-loop band (email capture) is a v2 requirement on both levels.
  await expect(page.getByTestId("stay-in-loop-form")).toBeVisible();
});

test("venue page renders venue-first sections with no template placeholders", async ({
  page,
}) => {
  const slug = await firstLocationSlug(page);
  test.skip(!slug, "no public locations in this env");
  const res = await page.goto(`/locations/${slug}`, {
    waitUntil: "domcontentloaded",
  });
  expect(res!.status()).toBe(200);
  // Hero renders the venue name
  await expect(page.locator("h1")).toContainText(/Aspire in/i);
  // What's-happening grid exists (cards depend on live data; grid always
  // renders in the DOM). Assert attachment rather than visibility: a venue
  // with no open seasons and no venue-facts offerings (common for fixture
  // locations seeded by other specs, e.g. "hold-visibility-loc-*") renders
  // the grid with zero children, which collapses to a 0x0 box and reads as
  // "hidden" to Playwright even though the section is present and correct.
  await expect(page.getByTestId("whats-happening")).toBeAttached();
  // No raw template placeholders, ever
  const body = await page.content();
  expect(body).not.toContain("{{");
  expect(body).not.toMatch(/TBD/);
  // No CTA points at /programs
  const programsLinks = await page
    .locator('#main-content a[href^="/programs"]')
    .count();
  expect(programsLinks).toBe(0);
  // v2 program-page role: no venue-operations content — rentals, hours,
  // parking all live on the venue website, not here.
  const rentalsLinks = await page
    .locator('#main-content a[href^="/rentals"]')
    .count();
  expect(rentalsLinks).toBe(0);
  expect(body).not.toMatch(/Book a field/i);
  expect(body).not.toMatch(/free parking/i);
  // Stay-in-the-loop band present on venue pages too.
  await expect(page.getByTestId("stay-in-loop-form")).toBeAttached();
});

test("venue page 404s unknown slugs (no redirect)", async ({ page }) => {
  const res = await page.goto("/locations/loc-does-not-exist", {
    waitUntil: "domcontentloaded",
  });
  const status = res!.status();
  if (status === 404) {
    expect(status).toBe(404);
  } else {
    // Known Astro dev-vs-prod difference: Astro.rewrite("/404") renders the
    // 404 page's content in dev mode but the response status can come back
    // 200 instead of 404 (prod/build correctly returns 404). Fall back to
    // asserting on the rendered content so the test still catches a real
    // regression (e.g. a redirect to /programs, which is what this guards
    // against).
    expect(status).toBe(200);
    await expect(page.locator("h1")).toContainText(/couldn't find that page/i);
  }
});
