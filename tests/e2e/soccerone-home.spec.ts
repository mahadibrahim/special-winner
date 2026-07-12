import { test, expect } from "@playwright/test"
import { waitForHydration } from "../utils/test-helpers"

// SoccerOne is resolved by host; soccerone.localhost is a valid dev host
// (mirrors tests/e2e/soccerone-pickup-band.spec.ts). Live sections are
// data-dependent: the seeded staging DB may or may not have open SoccerOne
// seasons or pickup sessions today, so live blocks are asserted
// conditionally — structure is asserted unconditionally.
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321").replace("localhost", "soccerone.localhost")

test.describe("SoccerOne homepage", () => {
  test("hero, futsal band, and play grid render; removed sections are gone", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" })

    await expect(page.locator("h1")).toContainText("YOUR GAME")

    // Futsal launch band
    await expect(page.locator("#futsal")).toBeVisible()
    await expect(page.locator("#futsal")).toContainText("Futsal lands")

    // Five play cards, no numbering
    await expect(page.locator(".play-card")).toHaveCount(5)
    await expect(page.locator(".pc-num")).toHaveCount(0)
    await expect(page.locator(".section-num")).toHaveCount(0)

    // Removed sections
    await expect(page.getByText("BY THE NUMBERS")).toHaveCount(0)
    await expect(page.getByText("Two Facilities")).toHaveCount(0)

    // Location line replaces facility cards
    await expect(page.locator(".location-line")).toContainText("WORTHINGTON")
    await expect(page.locator(".location-line")).toContainText("DOWNTOWN")
  })

  test("register CTAs only render with a real season behind them", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" })
    const ctas = page.locator("[data-so-register-cta]")
    const count = await ctas.count()
    for (let i = 0; i < count; i++) {
      const href = await ctas.nth(i).getAttribute("href")
      expect(href).toMatch(/^\/register\/.+/)
    }
  })

  test("signup strip hydrates and accepts input", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" })
    // HomeTonightStrip (client:load, always mounted on this page) calls
    // useHydrationBeacon() regardless of whether it renders live content,
    // so the shared beacon wait works here even though the strip we're
    // interacting with (HomeSignupStrip) doesn't set the beacon itself.
    await waitForHydration(page)

    const strip = page.getByTestId("signup-strip")
    await expect(strip).toBeVisible()
    const emailInput = strip.getByLabel("Email address")
    await emailInput.fill("e2e-home-strip@test.aspiresports.com")
    await expect(emailInput).toBeEditable()
    // Do not submit — this spec runs post-merge against shared staging;
    // submission is covered by the newsletter API tests.
  })
})
