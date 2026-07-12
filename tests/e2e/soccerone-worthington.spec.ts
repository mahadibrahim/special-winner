import { test, expect } from "@playwright/test"

// SoccerOne is resolved by host; soccerone.localhost is a valid dev host
// (mirrors tests/e2e/soccerone-home.spec.ts and soccerone-pickup-band.spec.ts).
// The page has a hero <video> background — waitUntil: "load" can hang on it,
// so this spec uses "domcontentloaded" throughout (repo convention, see
// soccerone-home.spec.ts).
//
// Data dependence: CI seeds the SoccerOne org via .github/actions/setup, and
// the Worthington-specific fixtures (location + adult program + three
// dayOfWeek-scheduled fall seasons: Sun Co-Ed 30+, Mon Men's C, Wed Women's
// Open) via db:seed:e2e stage 12c-2
// (src/lib/db/seeds/seed-e2e-tests.ts ~line 2854). Unconditional assertions
// below hold regardless of whether that seed has run (structure/copy is
// static); the fall-tab toggle and register-CTA assertions depend on it, so
// they're skipped/looped conditionally rather than hard-failing on a bare DB.
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321").replace("localhost", "soccerone.localhost")

test.describe("SoccerOne Worthington location page", () => {
  test("hero, sections, and removed copy render correctly", async ({ page }) => {
    await page.goto(`${BASE}/worthington`, { waitUntil: "domcontentloaded" })

    // H1 — rendered case is title case ("Worthington"); CSS text-transform
    // uppercases it visually but the DOM text content is not uppercase.
    await expect(page.locator("h1")).toContainText("Worthington")

    // Hero video — real venue footage, not a static image.
    const heroVideo = page.locator(".f-hero-video")
    await expect(heroVideo).toHaveAttribute("poster", /\/media\/soccerone\/worthington-hero-poster/)

    // Corrected/removed copy — no stragglers from the fabricated schedule or
    // stale field-count claims.
    const bodyText = await page.locator("body").innerText()
    expect(bodyText.toLowerCase()).not.toContain("fifa")
    expect(bodyText.toLowerCase()).not.toContain("typical week")
    expect(bodyText).not.toContain("Academy — Coming 2027")
    expect(bodyText.toLowerCase()).not.toContain("3 fields")

    // What's Happening section.
    await expect(page.getByRole("heading", { name: "What's Happening" })).toBeVisible()

    // The Building — real venue specs (110x60 field dimensions), shown in
    // both the spec card copy and the field-diagram SVG figure.
    const building = page.locator(".building")
    await expect(building).toContainText("110")
    await expect(building).toContainText("60")

    // Getting Here — directional map SVG in the map panel.
    await expect(page.locator(".map-panel svg")).toBeVisible()
  })

  // Isolated from the structure test above (mirrors soccerone-home.spec.ts's
  // separate signup-strip test) so a hydration hiccup on this one React
  // island can't mask the rest of the page's assertions. This page has no
  // useHydrationBeacon-calling client:load component (navigation={false},
  // footer={false} on BaseLayout — SoccerOneHeader/Footer are plain Astro,
  // and HomeSignupStrip itself doesn't call the beacon per its own source
  // comment), so waitForHydration(page) isn't applicable here the way it is
  // on the homepage spec; the strip is SSR-rendered with data-testid
  // regardless of client hydration outcome.
  test("signup strip (reused HomeSignupStrip island) is present", async ({ page }) => {
    await page.goto(`${BASE}/worthington`, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("signup-strip")).toBeVisible()
  })

  test("What's Happening toggle flips between summer cards and fall rhythm", async ({ page }) => {
    await page.goto(`${BASE}/worthington`, { waitUntil: "domcontentloaded" })

    const tabFall = page.locator("#tabFall")
    const present = (await tabFall.count()) > 0
    // The fall tab only renders when the fetched adult seasons carry a
    // dayOfWeek (hasFallSchedule in the frontmatter) — absent on a bare DB
    // that hasn't run the 12c-2 seed stage.
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
    await expect(fallList).toBeVisible()
    await expect(summerGrid).not.toBeVisible()
    // A Sunday row from the live-derived fall rhythm list (12c-2 seeds a
    // Sunday Co-Ed 30+ season).
    await expect(fallList).toContainText("Sunday")
    await expect(tabFall).toHaveClass(/hap-tab--on/)

    const tabNow = page.locator("#tabNow")
    await tabNow.click()
    await expect(summerGrid).toBeVisible()
    await expect(fallList).not.toBeVisible()
  })

  test("register CTAs only render with a real season behind them", async ({ page }) => {
    await page.goto(`${BASE}/worthington`, { waitUntil: "domcontentloaded" })
    const ctas = page.locator("[data-so-register-cta]")
    const count = await ctas.count()
    for (let i = 0; i < count; i++) {
      const href = await ctas.nth(i).getAttribute("href")
      expect(href).toMatch(/^\/register\/.+/)
    }
  })
})
