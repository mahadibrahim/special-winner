import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../utils/test-helpers";

/**
 * The builder end to end: a recurring winter pattern becomes a block whose
 * sessions are all held awaiting one deposit.
 *
 * The date range is a run-unique far-future winter rather than a fixed one.
 * Blocks committed by a previous run stay in the shared CI database, so a
 * hard-coded range would start conflicting with itself on the second run and
 * come back 409 instead of a clean 12-session block.
 */
const YEAR = 2043 + Math.floor(Math.random() * 40);

/** The 12 Tuesdays that follow the first Tuesday of January, as YYYY-MM-DD. */
function winterTuesdays(): string[] {
  const d = new Date(Date.UTC(YEAR, 0, 1));
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
  const out: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

const SEEDED_FIELD = "E2E Rental Field Complex";

test("admin builds a rental block and the renter is left owing one deposit", async ({
  page,
}) => {
  const tuesdays = winterTuesdays();

  await signIn(page, "admin@test.aspiresports.com", "TestAdmin123!");
  await page.goto("/admin/rentals/blocks/new", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // Pattern: Tuesdays 8-9pm across a far-future winter range. The location
  // select leads with a placeholder, and only the location that owns the
  // seeded rental venue lists a field to tick, so walk the real options.
  const locationSelect = page.getByLabel("Location");
  const locationValues = await locationSelect
    .locator("option")
    .evaluateAll((options) =>
      options
        .map((o) => (o as HTMLOptionElement).value)
        .filter((v) => v !== ""),
    );
  const fieldCheckbox = page.getByRole("checkbox", { name: SEEDED_FIELD });
  for (const value of locationValues) {
    await locationSelect.selectOption(value);
    if (await fieldCheckbox.isVisible()) break;
  }
  await expect(fieldCheckbox).toBeVisible();
  await fieldCheckbox.check();

  await page.getByLabel("Day").selectOption("2");
  await page.getByLabel("Start time").fill("20:00");
  await page.getByLabel("First date").fill(tuesdays[0]);
  await page.getByLabel("Last date").fill(tuesdays[tuesdays.length - 1]);
  await page.getByRole("button", { name: "Generate" }).click();

  await expect(page.getByText("12 of 12 selected")).toBeVisible();

  await page.getByLabel("Label").fill("E2E Winter Team Tuesdays");
  await page.getByLabel("Renter name").fill("E2E Winter Team");
  await page.getByLabel("Renter email").fill("e2e-block@test.aspiresports.com");
  await page.getByRole("button", { name: "Send deposit link" }).click();

  await expect(page).toHaveURL(/\/admin\/rentals\/blocks\/[0-9a-f-]{36}/);
  await waitForHydration(page);
  await expect(page.getByText(/awaiting deposit/i).first()).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(13); // header + 12 sessions
});
