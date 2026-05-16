import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../../utils/test-helpers";

// Phase 3 E2E for the super-admin home + Season Hub.

const SUPER_ADMIN = {
  email: "admin@test.aspiresports.com",
  password: "TestAdmin123!",
};

test.describe("super-admin home", () => {
  test("renders the Seasons module + Today across venues module", async ({ page }) => {
    await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
    await page.waitForURL(/\/admin$/, { timeout: 10_000 });
    await waitForHydration(page);

    // SeasonsGrid + TodayAcrossVenues always render their headings. Both
    // can be empty (no data) and still show the heading + empty-state.
    await expect(page.getByRole("heading", { name: /^seasons$/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /today across venues/i }),
    ).toBeVisible();
  });

  test("greets the signed-in user", async ({ page }) => {
    await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
    await page.waitForURL(/\/admin$/, { timeout: 10_000 });
    await waitForHydration(page);
    // Greeting line: "Good morning, …" / "Good afternoon, …" / "Good evening, …"
    await expect(page.getByText(/good (morning|afternoon|evening),/i)).toBeVisible();
  });
});

test.describe("Season Hub", () => {
  test("season detail renders 7 tabs + key-facts strip", async ({ page }) => {
    await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
    await page.goto("/admin/seasons");
    await waitForHydration(page);

    // Click the first season card if any exists; otherwise skip.
    const firstCard = page.locator("a[href^='/admin/seasons/']").first();
    if ((await firstCard.count()) === 0) {
      test.skip(true, "No seasons seeded — cannot exercise Season Hub");
    }
    await firstCard.click();
    await page.waitForURL(/\/admin\/seasons\/[^/]+/, { timeout: 10_000 });
    await waitForHydration(page);

    // All 7 tab buttons must be visible.
    for (const tab of [
      "Registrations",
      "Teams & rosters",
      "Schedule",
      "Pricing & codes",
      "Communications",
      "Refunds",
      "Settings",
    ]) {
      await expect(page.getByRole("tab", { name: new RegExp(tab, "i") })).toBeVisible();
    }

    // Key-facts strip: 5 labels.
    for (const label of ["Capacity", "Revenue", "Teams", "Games", "Waitlist"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test("switching tabs swaps the panel content", async ({ page }) => {
    await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);
    await page.goto("/admin/seasons");
    await waitForHydration(page);

    const firstCard = page.locator("a[href^='/admin/seasons/']").first();
    if ((await firstCard.count()) === 0) {
      test.skip(true, "No seasons seeded");
    }
    await firstCard.click();
    await waitForHydration(page);

    // Default tab is Registrations — verify aria-selected.
    const regsTab = page.getByRole("tab", { name: /registrations/i });
    await expect(regsTab).toHaveAttribute("aria-selected", "true");

    // Switch to Schedule
    const schedTab = page.getByRole("tab", { name: /schedule/i });
    await schedTab.click();
    await expect(schedTab).toHaveAttribute("aria-selected", "true");
    await expect(regsTab).toHaveAttribute("aria-selected", "false");
  });
});
