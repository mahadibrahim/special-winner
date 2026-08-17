import { test, expect } from "@playwright/test"
import { waitForHydration } from "../utils/test-helpers"

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

  test("shows no format claims", async ({ page }) => {
    await page.goto("/youth/leagues/soccer", { waitUntil: "domcontentloaded" })
    const body = await page.locator("main").innerText()
    expect(body).not.toMatch(/\d+v\d+/)
    expect(body).not.toMatch(/size [345] ball/i)
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
    await expect(page.locator("#youth-classes")).toBeVisible()
  })
})
