import { test, expect } from "@playwright/test"
import { waitForHydration } from "../utils/test-helpers"

/**
 * Record every `aspire:finder-filter` CustomEvent the page fires, flattened to
 * a JSON-safe shape. `hasAgeGroup` has to be captured in the browser: an
 * `ageGroup: undefined` own-key (how the ladder says "cleared") is
 * indistinguishable from an absent key once it crosses the CDP boundary, and
 * that distinction is the whole contract category-finder.tsx gates on.
 *
 * Deliberately independent of live inventory — the ladder's filter bus and its
 * aria-pressed state are observable with an empty catalog, which is what
 * staging has.
 */
async function recordFinderFilterEvents(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const sink: Array<{ hasAgeGroup: boolean; ageGroup: string | null }> = []
    ;(window as unknown as { __finderFilterEvents: typeof sink }).__finderFilterEvents = sink
    window.addEventListener("aspire:finder-filter", (e) => {
      const detail = (e as CustomEvent).detail ?? {}
      sink.push({ hasAgeGroup: "ageGroup" in detail, ageGroup: detail.ageGroup ?? null })
    })
  })
}

const readFinderFilterEvents = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __finderFilterEvents: Array<{ hasAgeGroup: boolean; ageGroup: string | null }> })
        .__finderFilterEvents,
  )

test.describe("youth soccer leagues — two-path page", () => {
  test("hero, jump bar, and both path tiles render server-side", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    await expect(
      page.getByRole("heading", { level: 1, name: /indoor youth soccer leagues/i }),
    ).toBeVisible()
    await expect(page.locator("[data-jump-link]")).toHaveCount(8)
    await expect(page.locator("#types")).toBeVisible()
    // Two toned type cards, competitive first.
    await expect(page.getByRole("heading", { name: /competitive — for club teams/i })).toBeVisible()
    await expect(page.getByRole("heading", { name: /developmental — for individual players/i })).toBeVisible()
  })

  test("deadline banner is a real anchor when present, absent entirely otherwise", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    const banner = page.locator('[data-testid="now-registering"]')
    if ((await banner.count()) === 0) {
      // No open seasons: nothing renders — no empty banner, no placeholder.
      return
    }
    await expect(banner).toHaveCount(1)
    // The banner CTA anchors into the on-page booking section. The testid
    // lives on the wrapper div, not the anchor — locate the CTA by its own
    // marker and assert ITS href, not the wrapper's.
    const cta = banner.locator("[data-hero-banner-cta]")
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute("href", "#open")
  })

  test("division table renders open seasons as bookable rows", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    // The hydration beacon fires on mount, before the table's own client-side
    // catalog fetch resolves — wait for either state to settle so the
    // rows.count() check below doesn't race an in-flight fetch and mistake
    // "still loading" for "empty catalog".
    await expect(page.locator("[data-division-row], [data-finder-empty]").first()).toBeVisible()
    const rows = page.locator("[data-division-row]")
    if ((await rows.count()) === 0) {
      // Empty catalog (staging): the notify empty state must show instead.
      await expect(page.locator("[data-finder-empty]")).toBeVisible()
      return
    }
    // Every row's CTA links straight into /register/<id>. A dual-mode division
    // renders TWO pills (team + solo), so pick one explicitly rather than
    // tripping Playwright's strict-mode check on a two-element locator.
    const ctas = rows.first().locator('a[href^="/register/"]')
    expect(await ctas.count()).toBeGreaterThan(0)
    const href = await ctas.first().getAttribute("href")
    // The id segment, before the ?mode= deep link the pills now carry.
    expect(href).toMatch(/^\/register\/[^/?]+/)
    expect(href).toMatch(/\?mode=(individual|team)$/)
  })

  test("compact birthday lookup filters the finder, not just styling", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await recordFinderFilterEvents(page)
    await page.selectOption("#age-lookup-month", "3")
    await page.selectOption("#age-lookup-year", "2017")
    await expect(page.locator("#age-lookup-answer")).toContainText("U10")
    expect(await readFinderFilterEvents(page)).toEqual([{ hasAgeGroup: true, ageGroup: "U10" }])
  })

  test("a birthday after August resolves one group younger", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await page.selectOption("#age-lookup-month", "9")
    await page.selectOption("#age-lookup-year", "2017")
    await expect(page.locator("#age-lookup-answer")).toContainText("U9")
  })

  test("shows no format claims", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    const body = await page.locator("main").innerText()
    expect(body).not.toMatch(/\d+v\d+/)
    expect(body).not.toMatch(/size [345] ball/i)
  })
})

test.describe("youth league routing", () => {
  test("/youth/leagues 302s to the soccer page", async ({ page }) => {
    const res = await page.request.get("/youth/leagues", { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    expect(res.headers()["location"]).toMatch(/\/youth\/leagues\/soccer$/)
  })

  test("futsal renders the same two-path shape", async ({ page }) => {
    await page.goto("/youth/leagues/futsal", { waitUntil: "domcontentloaded" })
    await expect(page.locator("h1")).toContainText(/futsal/i)
    await expect(page.locator("#types")).toBeVisible()
  })

  test("an unknown sport lands on the soccer page", async ({ page }) => {
    await page.goto("/youth/leagues/hockey", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/youth\/leagues\/soccer\/?$/)
  })

  test("an unknown futsal term lands on the futsal page, not a 404", async ({ page }) => {
    await page.goto("/youth/leagues/futsal/no-such-term", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/youth\/leagues\/futsal\/?$/)
  })
})

test.describe("youth navigation", () => {
  test("exposes Leagues, Classes and Camps", async ({ page }) => {
    // No waitForHydration here: /youth is a static hub whose door cards are
    // plain server-rendered <a> links (see landing-pages.spec.ts's doc
    // comment) — nothing on this page mounts a client:load island that
    // calls useHydrationBeacon(), so html[data-hydrated="true"] never
    // appears and the wait would hang until timeout.
    await page.goto("/youth", { waitUntil: "domcontentloaded" })
    // Scope to #main-content: the header nav also renders an
    // `a[href="/youth/leagues"]` inside its Youth dropdown, but that link is
    // CSS-hidden until :hover, so an unscoped `.first()` can resolve to it
    // and report a false "hidden" failure (same pattern category-pages.spec
    // uses to disambiguate nav links from body links).
    for (const href of ["/youth/leagues", "/youth/classes", "/youth/camps"]) {
      await expect(page.locator(`#main-content a[href="${href}"]`).first()).toBeVisible()
    }
  })

  test("classes page loads its own finder", async ({ page }) => {
    await page.goto("/youth/classes", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    // classes v2's CategoryFinder sectionId is "open-classes" (the red
    // "Book it right here." band above it already owns id="open" for the
    // jump bar / hero CTA anchor — two elements can't share an id).
    await expect(page.locator("#open-classes")).toBeVisible()
  })
})

test.describe("youth classes v2", () => {
  // Band-system rebuild (docs/superpowers/specs/2026-08-18-youth-classes-v2-mockup.html):
  // hero, sticky jump bar, five step-detail bands, on-page booking, and a
  // link out to /youth/philosophy. No hydration wait needed — every element
  // asserted here is server-rendered.
  test("hero, jump bar, step band, booking section and philosophy link all render", async ({ page }) => {
    await page.goto("/youth/classes", { waitUntil: "domcontentloaded" })

    await expect(
      page.getByRole("heading", { level: 1, name: /first coach is the one that counts/i }),
    ).toBeVisible()

    // SectionJumpBar renders one [data-jump-link] pill per JUMP_ITEMS entry.
    await expect(page.locator("[data-jump-link]")).toHaveCount(7)

    // One FeatureBand per pathway step, id="step-<slug>" — Micros is first.
    await expect(page.locator("#step-micros")).toBeVisible()

    // On-page booking: the red "Book it right here." band (id="open", the
    // jump bar / hero CTA target) sits directly above the CategoryFinder
    // island (sectionId="open-classes" — ids can't collide with #open).
    await expect(page.locator("#open")).toBeVisible()
    await expect(page.locator("#open-classes")).toBeVisible()

    // Philosophy band links out to the full standalone page.
    await expect(page.locator('a[href="/youth/philosophy"]')).toBeVisible()
  })
})
