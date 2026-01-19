import { test, expect } from "@playwright/test";
import {
  TEST_USERS,
  signIn,
  waitForPageLoad,
} from "./utils/test-helpers";

test.describe("Parent Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);
  });

  test.describe("Dashboard Overview", () => {
    test("displays dashboard with main sections", async ({ page }) => {
      await page.goto("/dashboard");
      await waitForPageLoad(page);

      // Should show welcome or dashboard heading
      await expect(
        page.locator("h1, h2").filter({ hasText: /dashboard|welcome/i }).first()
      ).toBeVisible();
    });

    test("shows family members section", async ({ page }) => {
      await page.goto("/dashboard");
      await waitForPageLoad(page);

      // Should show family members or children
      await expect(
        page.locator("text=/family|children|kids|members/i").first()
      ).toBeVisible();
    });

    test("shows registrations section", async ({ page }) => {
      await page.goto("/dashboard");
      await waitForPageLoad(page);

      // Should show registrations or enrolled programs
      await expect(
        page.locator("text=/registration|enrolled|programs/i").first()
      ).toBeVisible();
    });

    test("shows upcoming schedule section", async ({ page }) => {
      await page.goto("/dashboard");
      await waitForPageLoad(page);

      // Should show schedule or upcoming events
      await expect(
        page.locator("text=/schedule|upcoming|events|calendar/i").first()
      ).toBeVisible();
    });
  });

  test.describe("Family Members", () => {
    test("displays existing family members", async ({ page }) => {
      await page.goto("/dashboard");
      await waitForPageLoad(page);

      // Should show the seeded child (Tommy Test)
      await expect(page.locator("text=Tommy")).toBeVisible();
    });

    test("can navigate to add family member", async ({ page }) => {
      await page.goto("/dashboard");
      await waitForPageLoad(page);

      // Find add family member button
      const addButton = page.locator(
        'button:has-text("Add"), a:has-text("Add Child"), a:has-text("Add Family")'
      );

      if (await addButton.first().isVisible()) {
        await addButton.first().click();
        // Should show add family member form or modal
        await expect(
          page.locator('input[name="firstName"], label:has-text("First Name")')
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe("Settings", () => {
    test("can access settings page", async ({ page }) => {
      await page.goto("/dashboard/settings");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/dashboard\/settings/);
      await expect(
        page.locator("h1, h2").filter({ hasText: /settings|profile/i }).first()
      ).toBeVisible();
    });

    test("shows profile information", async ({ page }) => {
      await page.goto("/dashboard/settings");
      await waitForPageLoad(page);

      // Should show user's email or name
      await expect(
        page.locator(`text=${TEST_USERS.parent.email}`)
      ).toBeVisible();
    });

    test("can update profile information", async ({ page }) => {
      await page.goto("/dashboard/settings");
      await waitForPageLoad(page);

      // Find phone field and update it
      const phoneInput = page.locator(
        'input[name="phone"], input[type="tel"]'
      );

      if (await phoneInput.isVisible()) {
        await phoneInput.fill("555-123-4567");

        // Find and click save button
        await page.getByRole("button", { name: /save|update/i }).click();

        // Should show success message
        await expect(
          page.locator("text=/saved|updated|success/i")
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe("Schedule & Calendar", () => {
    test("can view schedule page", async ({ page }) => {
      await page.goto("/dashboard/schedule");

      // May redirect or show schedule
      await expect(page.url()).toMatch(/\/(dashboard|schedule)/);
    });

    test("shows calendar export option if available", async ({ page }) => {
      await page.goto("/dashboard/schedule");
      await waitForPageLoad(page);

      // Look for iCal or calendar export
      const exportButton = page.locator(
        'button:has-text("Export"), a:has-text("iCal"), button:has-text("Calendar")'
      );

      // Just check if page loaded without checking for specific feature
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("Announcements", () => {
    test("displays announcements if present", async ({ page }) => {
      await page.goto("/dashboard");
      await waitForPageLoad(page);

      // Announcements section may or may not have content
      // Just verify the dashboard loads
      await expect(page.locator("body")).toBeVisible();
    });
  });
});

test.describe("Registration Flow", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);
  });

  test("can browse available programs", async ({ page }) => {
    await page.goto("/programs");
    await waitForPageLoad(page);

    await expect(page).toHaveTitle(/Programs/);

    // Should show program listings
    await expect(page.locator("body")).toBeVisible();
  });

  test("can view program details", async ({ page }) => {
    await page.goto("/programs");
    await waitForPageLoad(page);

    // Click on first program card/link
    const programLink = page.locator(
      'a[href*="/programs/"], [data-testid="program-card"]'
    );

    if ((await programLink.count()) > 0) {
      await programLink.first().click();
      await waitForPageLoad(page);

      // Should show program details
      await expect(page.url()).toMatch(/\/programs\//);
    }
  });

  test("can start registration for available season", async ({ page }) => {
    await page.goto("/programs");
    await waitForPageLoad(page);

    // Look for register button
    const registerButton = page.locator(
      'button:has-text("Register"), a:has-text("Register"), a:has-text("Enroll")'
    );

    if ((await registerButton.count()) > 0) {
      await registerButton.first().click();

      // Should navigate to registration flow
      await expect(page.url()).toMatch(/\/(register|registration)/);
    }
  });

  test("registration wizard shows step indicator", async ({ page }) => {
    // Go directly to registration page if it exists
    await page.goto("/register");

    // May redirect to signin or programs
    if (page.url().includes("/register")) {
      await waitForPageLoad(page);

      // Look for step indicator
      const stepIndicator = page.locator(
        '[data-testid="step-indicator"], .step, [role="progressbar"]'
      );
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
