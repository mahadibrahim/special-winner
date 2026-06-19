import { test, expect } from "@playwright/test"
import { waitForHydration } from "../utils/test-helpers"

// SoccerOne is resolved by host; soccerone.localhost is a valid dev host
// (see tests/unit/organization/soccerone-routing.test.ts).
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321").replace("localhost", "soccerone.localhost")

test("leagues finder filters by location without a page reload", async ({ page }) => {
  await page.goto(`${BASE}/leagues`, { waitUntil: "domcontentloaded" })
  await waitForHydration(page)

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
