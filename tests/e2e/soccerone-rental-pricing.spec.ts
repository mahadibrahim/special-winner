import { test, expect } from "@playwright/test"
import { waitForHydration } from "../utils/test-helpers"

// SoccerOne is resolved by host; soccerone.localhost is a valid dev host.
// The SoccerOne org isn't in the CI seed (provisioned by scripts/seed-soccerone-org.ts),
// so when availability isn't present we skip rather than fail.
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321").replace("localhost", "soccerone.localhost")

test("multi-hour rental total increases when duration is extended", async ({ page }) => {
  await page.goto(`${BASE}/rent`, { waitUntil: "domcontentloaded" })
  await waitForHydration(page)

  // Guard 1: FieldCalendar root must be present (page resolved to SoccerOne).
  const calendarRoot = page.locator(".field-calendar-root")
  const rootPresent = (await calendarRoot.count()) > 0
  test.skip(!rootPresent, "SoccerOne not resolved (org not in this seed)")

  // Guard 2: There must be at least one bookable slot on the rendered calendar.
  // Available slots have class calendar-row--available and role="button".
  const availableSlot = calendarRoot.locator(".calendar-row--available[role='button']").first()

  // Wait briefly for the availability fetch (the component fires it on mount).
  // If after a reasonable wait there's still no available slot, skip.
  let slotFound = false
  try {
    await availableSlot.waitFor({ timeout: 8000 })
    slotFound = true
  } catch {
    slotFound = false
  }
  test.skip(!slotFound, "no SoccerOne rental availability in this seed")

  // --- Slot IS available: proceed with the pricing assertion ---

  // Click the first available slot to open the booking panel.
  await availableSlot.click()

  // The booking panel should become visible.
  const panel = page.locator(".booking-panel--visible")
  await expect(panel).toBeVisible()

  // The live total must be shown.
  const totalAmount = panel.locator(".total-amount")
  await expect(totalAmount).toBeVisible()

  // Read the 1-hour total.
  const oneHourTotalText = await totalAmount.textContent()
  expect(oneHourTotalText).toMatch(/^\$\d+$/)
  const oneHourDollars = parseInt(oneHourTotalText!.replace("$", ""), 10)

  // The duration select must be present (aria-label="Duration").
  const durationSelect = panel.locator('select[aria-label="Duration"]')
  await expect(durationSelect).toBeVisible()

  // Check whether the 2-hour (120-min) option is available (it may not be if
  // the free block only spans 1 hour). If not, skip the assertion.
  const twoHourOption = durationSelect.locator('option[value="120"]')
  const twoHourAvailable = (await twoHourOption.count()) > 0
  test.skip(!twoHourAvailable, "only 1h free block available in seed — cannot test multi-hour total")

  // Select 2 hours and wait for the total to update.
  await durationSelect.selectOption("120")

  // Poll for the total to change (it's reactive state — should update synchronously,
  // but give the React re-render a moment).
  await expect(totalAmount).not.toHaveText(oneHourTotalText!)

  // Read the 2-hour total and assert it's strictly higher.
  const twoHourTotalText = await totalAmount.textContent()
  expect(twoHourTotalText).toMatch(/^\$\d+$/)
  const twoHourDollars = parseInt(twoHourTotalText!.replace("$", ""), 10)

  expect(twoHourDollars).toBeGreaterThan(oneHourDollars)
})
