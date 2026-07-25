import { test, expect } from "@playwright/test"
import { waitForHydration } from "../utils/test-helpers"

// SoccerOne is resolved by host; soccerone.localhost is a valid dev host
// (see tests/unit/organization/soccerone-routing.test.ts).
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321").replace("localhost", "soccerone.localhost")

test("leagues finder filters by location without a page reload", async ({ page }) => {
  await page.goto(`${BASE}/leagues`, { waitUntil: "domcontentloaded" })
  await waitForHydration(page)

  // Round 2 anatomy: the finder lives in the "This Season" tab pane; the
  // default landing tab is Overview. Element click (not keyboard) per the
  // hydration conventions.
  await page.getByRole("tab", { name: /this season/i }).click()

  const finder = page.locator("#leagues-finder")
  await expect(finder).toBeVisible()

  // Sentinel: filtering must NOT reload the page.
  await page.evaluate(() => ((window as any).__noReload = true))

  const downtownChip = finder.getByRole("button", { name: /downtown/i })
  const hasDowntown = (await downtownChip.count()) > 0
  test.skip(!hasDowntown, "no Downtown SoccerOne season in seed — run scripts/seed-soccerone-org.ts first")
  await downtownChip.click()
  await expect(page.locator(".so-finder-count strong")).toBeVisible()
  expect(await page.evaluate(() => (window as any).__noReload)).toBe(true)
})

test("?location= deep link lands on the This Season tab with the finder pre-filtered", async ({ page }) => {
  await page.goto(`${BASE}/leagues?location=worthington`, { waitUntil: "domcontentloaded" })
  await waitForHydration(page)

  // Server decides the initial tab: a venue deep link goes straight to the
  // finder — no extra click between "I was on the Worthington page" and
  // "show me Worthington leagues".
  await expect(page.getByRole("tab", { name: /this season/i })).toHaveAttribute("aria-selected", "true")
  await expect(page.locator("#leagues-finder")).toBeVisible()
})

test("upcoming-term seasons appear as term cards in Upcoming, never in the This Season finder", async ({ page }) => {
  // Regression: after the prod draft flip, 51 forming winter/spring seasons
  // leaked into the This Season finder as "Notify me" cards, drowning the 13
  // registerable fall divisions. The seed's "Winter (Fixture)" forming term
  // reproduces that data shape.
  await page.goto(`${BASE}/leagues`, { waitUntil: "domcontentloaded" })
  await waitForHydration(page)

  await page.getByRole("tab", { name: /this season/i }).click()
  const finder = page.locator("#leagues-finder")
  await expect(finder).toBeVisible()
  await expect(finder.getByText("Co-Ed — Winter")).toHaveCount(0)

  await page.getByRole("tab", { name: /upcoming/i }).click()
  await expect(page.locator('[data-lg-pane="upcoming"]').getByText("Winter (Fixture)")).toBeVisible()
})

test("tab panes are server-rendered even when hidden (crawlability)", async ({ page }) => {
  await page.goto(`${BASE}/leagues`, { waitUntil: "domcontentloaded" })

  // No interaction, no hydration wait — this asserts on the served HTML.
  // The why-play copy (Overview) and upcoming capture must exist in the DOM
  // regardless of which tab is active; hidden panes are hidden, not absent.
  await expect(page.locator('[data-lg-pane="overview"]')).toHaveCount(1)
  await expect(page.locator('[data-lg-pane="upcoming"]')).toHaveCount(1)
  await expect(page.locator('[data-lg-pane="past"]')).toHaveCount(1)
})
