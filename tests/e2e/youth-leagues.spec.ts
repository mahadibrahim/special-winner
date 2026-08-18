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

test.describe("youth soccer landing", () => {
  test("renders all 14 age groups as static HTML", async ({ page }) => {
    // JS disabled would be ideal; instead assert before hydration completes
    // that the bands are already in the DOM — they are server-rendered.
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    const bands = page.locator("[data-age-band]")
    await expect(bands).toHaveCount(14)
    await expect(bands.first()).toContainText("U6")
    await expect(bands.last()).toContainText("U19")
  })

  test("birthday lookup resolves a group", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await page.selectOption("#age-lookup-month", "3")
    await page.selectOption("#age-lookup-year", "2017")
    await expect(page.locator("#age-lookup-answer")).toContainText("U10")
  })

  test("a birthday in the same year but after August resolves one group younger", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await page.selectOption("#age-lookup-month", "9")
    await page.selectOption("#age-lookup-year", "2017")
    await expect(page.locator("#age-lookup-answer")).toContainText("U9")
  })

  // The hero "Now Registering" banner is the ONLY crawlable route from this
  // page into /youth/leagues/soccer/<term> (and, through it, every division
  // page + the completed-term archive). Staging has zero youth seasons, so the
  // no-current-term branch is the one this environment actually exercises —
  // these two assertions are written to be honest in both states rather than
  // asserting a banner that can't exist here.
  test("the current-term hero link is a real anchor, or absent entirely", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    const banner = page.locator('#main-content [data-testid="now-registering"]')
    const count = await banner.count()

    if (count === 0) {
      // No open/active youth term. The requirement is that NOTHING is rendered
      // — not an empty banner, not a placeholder, and above all not a link to
      // a term page that would redirect straight back here.
      await expect(page.locator('#main-content a[href^="/youth/leagues/soccer/"]')).toHaveCount(0)
      return
    }

    // A term exists: the link must be server-rendered HTML (asserted before
    // hydration, same technique as the age-ladder test above), point at a
    // non-empty term slug, and resolve to a page that does not bounce back to
    // the sport landing page.
    await expect(banner).toHaveCount(1)
    const href = await banner.first().getAttribute("href")
    expect(href).toMatch(/^\/youth\/leagues\/soccer\/[^/]+$/)
    const res = await page.request.get(href!, { maxRedirects: 0 })
    expect(res.status()).toBe(200)
  })

  test("shows no format claims", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    const body = await page.locator("main").innerText()
    expect(body).not.toMatch(/\d+v\d+/)
    expect(body).not.toMatch(/size [345] ball/i)
  })

  // The finder's "this age group has nothing open" branch is the whole-catalog
  // empty state (notify form) — no "Clear filters" control. A band that could
  // only ever be switched ON was therefore a dead end escapable only by
  // reloading, and with zero youth inventory that is every tap.
  test("re-clicking an active age band clears the filter", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await recordFinderFilterEvents(page)

    const u10 = page.locator('[data-age-band][data-group="U10"]')
    await u10.click()
    await expect(u10).toHaveAttribute("aria-pressed", "true")

    await u10.click()
    await expect(u10).toHaveAttribute("aria-pressed", "false")

    // The visual state is only half of it — the finder has to have been told.
    expect(await readFinderFilterEvents(page)).toEqual([
      { hasAgeGroup: true, ageGroup: "U10" },
      { hasAgeGroup: true, ageGroup: null },
    ])
  })

  test("switching bands moves the pressed state rather than stacking it", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)

    await page.locator('[data-age-band][data-group="U10"]').click()
    await page.locator('[data-age-band][data-group="U12"]').click()

    await expect(page.locator('[data-age-band][data-group="U12"]')).toHaveAttribute("aria-pressed", "true")
    await expect(page.locator('[data-age-band][data-group="U10"]')).toHaveAttribute("aria-pressed", "false")
    await expect(page.locator('[data-age-band][aria-pressed="true"]')).toHaveCount(1)
  })

  // The lookup used to highlight a band without dispatching, so the band
  // claimed aria-pressed="true" while the finder below was unfiltered — and
  // clicking that band to "turn it off" would have turned it on.
  test("the birthday lookup filters the finder, not just the band styling", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await recordFinderFilterEvents(page)

    await page.selectOption("#age-lookup-month", "3")
    await page.selectOption("#age-lookup-year", "2017")

    await expect(page.locator("#age-lookup-answer")).toContainText("U10")
    await expect(page.locator('[data-age-band][data-group="U10"]')).toHaveAttribute("aria-pressed", "true")
    expect(await readFinderFilterEvents(page)).toEqual([{ hasAgeGroup: true, ageGroup: "U10" }])
  })
})

test.describe("youth sport routes — one dynamic route serves every sport", () => {
  // /youth/leagues/[sport] replaced per-sport static copies. These pin the two
  // properties that matter: a registry sport renders the full page, and a
  // non-registry slug degrades to the picker instead of rendering an empty
  // page under invented branding. All independent of live inventory.
  test("futsal renders the same static ladder as soccer", async ({ page }) => {
    await page.goto("/youth/leagues/futsal", { waitUntil: "domcontentloaded" })
    const bands = page.locator("[data-age-band]")
    await expect(bands).toHaveCount(14)
    await expect(page.locator("h1")).toContainText("Youth futsal")
  })

  test("an unknown sport lands on the sport picker", async ({ page }) => {
    await page.goto("/youth/leagues/hockey", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/youth\/leagues\/?$/)
  })

  test("an unknown futsal term lands on the futsal page, not a 404", async ({ page }) => {
    // The exact gap that blocked merging: the futsal landing page's banner
    // pointed at a term route that did not exist.
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
