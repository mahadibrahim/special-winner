// tests/e2e/pickup-hero-tile.spec.ts
import { test, expect } from "@playwright/test"
import { waitForHydration } from "../utils/test-helpers"

test("@critical pickup soccer tile scroll-filters the finder", async ({ page }) => {
  await page.goto("/adult/pickup", { waitUntil: "domcontentloaded" })
  await waitForHydration(page)

  // The live Soccer tile is a button (no href) that filters the finder.
  const soccerTile = page.locator('[data-sport-tile][data-sport="soccer"][data-state="live"]')
  await expect(soccerTile).toBeVisible()
  await soccerTile.click()

  // Finder section scrolls into view.
  const finder = page.locator("#sessions")
  await expect(finder).toBeInViewport()
})
