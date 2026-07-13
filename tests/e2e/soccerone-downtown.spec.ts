import { test, expect } from "@playwright/test"

// SoccerOne is resolved by host; soccerone.localhost is a valid dev host
// (mirrors tests/e2e/soccerone-home.spec.ts and soccerone-worthington.spec.ts).
// This page has no autoplaying hero <video> (typographic field-motif SVG
// hero — no Starr Ave footage yet), but "domcontentloaded" is still used
// throughout to match repo convention and avoid waiting on webfonts/CSS.
//
// Data dependence: CI seeds the SoccerOne org via .github/actions/setup, and
// the Downtown-specific fixtures (bare "downtown" location slug + adult
// program with "Adult Coed — Spring 2026" and a dayOfWeek-scheduled
// "Co-Ed 6v6 — Fall" Wednesday season) via db:seed:e2e stage 12a/12c-1b
// (src/lib/db/seeds/seed-e2e-tests.ts ~line 2749). Unconditional assertions
// below hold regardless of whether that seed has run (structure/copy is
// static, and the reviews module is populated independent of the DB); the
// register-CTA href assertion loops zero-safe over whatever CTAs are
// present, and the fall-list row-content assertion is presence-gated so a
// bare DB (no dayOfWeek-scheduled seasons) can't hard-fail it.
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321").replace("localhost", "soccerone.localhost")

test.describe("SoccerOne Downtown location page", () => {
  test("hero, sections, and removed copy render correctly", async ({ page }) => {
    await page.goto(`${BASE}/downtown`, { waitUntil: "domcontentloaded" })

    // H1 — rendered case is title case ("Downtown"); CSS text-transform
    // uppercases it visually but the DOM text content is not uppercase.
    await expect(page.locator("h1")).toContainText("Downtown")

    // Hero field-motif SVG — scoped to the hero section (typographic hero,
    // no video: no footage exists for Starr Ave yet).
    const hero = page.locator(".f-hero")
    await expect(hero.locator(".f-hero-motif")).toBeVisible()
    await expect(hero).toContainText("130")

    // What's Happening section + both toggle buttons (fixtures are seeded
    // on this environment, so the fall tab renders).
    await expect(page.getByRole("heading", { name: "What's Happening" })).toBeVisible()
    await expect(page.locator("#tabNow")).toBeVisible()
    await expect(page.locator("#tabFall")).toBeVisible()

    // Social proof — the Starr Ave Google listing is populated (4.7, 3
    // curated reviews), so this section is unconditional here.
    const proof = page.locator(".proof-section")
    await expect(proof).toBeVisible()
    await expect(proof).toContainText("4.7")

    // Finding Starr Ave — directional map SVG in the map panel.
    await expect(page.locator(".map-panel svg")).toBeVisible()

    // Corrected/removed copy — no stragglers from the old FieldTurf/
    // full-size claims, the fabricated "typical week" rhythm, the stale
    // Academy promo, or a corporate-league call-out (owner directive).
    const bodyText = await page.locator("body").innerText()
    const lowerBody = bodyText.toLowerCase()
    expect(lowerBody).not.toContain("fieldturf")
    expect(lowerBody).not.toContain("full-size")
    expect(lowerBody).not.toContain("typical week")
    expect(bodyText).not.toContain("Academy — Coming 2027")
    expect(lowerBody).not.toContain("corporate")
    expect(lowerBody).not.toContain("fifa")
  })

  // Isolated from the structure test above (mirrors soccerone-worthington.spec.ts
  // and soccerone-home.spec.ts) so a hydration hiccup on this one React
  // island can't mask the rest of the page's assertions. This page has no
  // useHydrationBeacon-calling client:load component (navigation={false},
  // footer={false} on BaseLayout — SoccerOneHeader/Footer are plain Astro,
  // and HomeSignupStrip itself doesn't call the beacon per its own source
  // comment), so waitForHydration(page) isn't applicable here the way it is
  // on the homepage spec; the strip is SSR-rendered with data-testid
  // regardless of client hydration outcome.
  test("signup strip (reused HomeSignupStrip island) is present", async ({ page }) => {
    await page.goto(`${BASE}/downtown`, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("signup-strip")).toBeVisible()
  })

  test("What's Happening toggle flips between summer cards and fall rhythm", async ({ page }) => {
    await page.goto(`${BASE}/downtown`, { waitUntil: "domcontentloaded" })

    const tabFall = page.locator("#tabFall")
    const present = (await tabFall.count()) > 0
    // The fall tab only renders when the fetched adult seasons carry a
    // dayOfWeek (hasFallSchedule in the frontmatter) — absent on a bare DB
    // that hasn't run the 12a/12c-1b seed stage.
    test.skip(!present, "Fall schedule tab not rendered (no dayOfWeek-scheduled seasons in this DB)")

    const summerGrid = page.locator(".now-grid")
    const fallList = page.locator(".week-list")

    // Summer state is the default.
    await expect(summerGrid).toBeVisible()
    await expect(fallList).not.toBeVisible()

    // Click-driven (this is a plain inline <script>, not a React island —
    // it attaches listeners on parse, so no waitForHydration is needed, but
    // the DOM must still be parsed before clicking).
    await tabFall.click()
    // The list container's visibility is unconditional once the tab is
    // present (both are gated by the same hasFallSchedule flag in the
    // frontmatter), so this assertion isn't presence-gated.
    await expect(fallList).toBeVisible()
    await expect(summerGrid).not.toBeVisible()
    await expect(tabFall).toHaveClass(/hap-tab--on/)

    // Row content ("Wednesday", from the seeded "Co-Ed 6v6 — Fall" season)
    // is presence-gated rather than hard-asserted, so a bare-CI run that
    // somehow renders the tab without that specific fixture doesn't fail
    // the test on content it never claimed to guarantee.
    const wednesdayRow = fallList.locator(".week-row", { hasText: "Wednesday" })
    if ((await wednesdayRow.count()) > 0) {
      await expect(wednesdayRow.first()).toBeVisible()
    }

    const tabNow = page.locator("#tabNow")
    await tabNow.click()
    await expect(summerGrid).toBeVisible()
    await expect(fallList).not.toBeVisible()
  })

  test("register CTAs only render with a real season behind them", async ({ page }) => {
    await page.goto(`${BASE}/downtown`, { waitUntil: "domcontentloaded" })
    const ctas = page.locator("[data-so-register-cta]")
    const count = await ctas.count()
    for (let i = 0; i < count; i++) {
      const href = await ctas.nth(i).getAttribute("href")
      expect(href).toMatch(/^\/register\/.+/)
    }
  })
})
