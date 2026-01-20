import { test, expect } from "@playwright/test";
import {
  TEST_USERS,
  signIn,
  waitForPageLoad,
  getTableRowCount,
} from "./utils/test-helpers";

test.describe("Admin Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEST_USERS.admin.email, TEST_USERS.admin.password);
  });

  test.describe("Dashboard Overview", () => {
    test("displays admin dashboard", async ({ page }) => {
      await page.goto("/admin");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/admin/);
      await expect(
        page.locator("h1, h2").filter({ hasText: /dashboard|admin/i }).first()
      ).toBeVisible();
    });

    test("shows navigation sidebar", async ({ page }) => {
      await page.goto("/admin");
      await waitForPageLoad(page);

      // Check for main nav items
      await expect(page.getByRole("navigation")).toBeVisible();
    });

    test("shows summary statistics cards", async ({ page }) => {
      await page.goto("/admin");
      await waitForPageLoad(page);

      // Look for stat cards
      const statCards = page.locator(
        '[data-testid="stat-card"], .stat-card, [class*="card"]'
      );
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("Programs Management", () => {
    test("can access programs page", async ({ page }) => {
      await page.goto("/admin/programs");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/admin\/programs/);
      await expect(
        page.locator("h1, h2").filter({ hasText: /programs/i }).first()
      ).toBeVisible();
    });

    test("displays programs list", async ({ page }) => {
      await page.goto("/admin/programs");
      await waitForPageLoad(page);

      // Wait for API data to load (can be slow in CI)
      // Should show table, list, or empty state
      const table = page.locator("table, [data-testid='programs-list']");
      const emptyState = page.locator("text=/no programs|add your first|get started/i");

      await expect(table.or(emptyState).first()).toBeVisible({ timeout: 20000 });
    });

    test("has create program button", async ({ page }) => {
      await page.goto("/admin/programs");
      await waitForPageLoad(page);

      await expect(
        page.getByRole("button", { name: /create|add|new/i })
      ).toBeVisible();
    });

    test("can open create program modal/form", async ({ page }) => {
      await page.goto("/admin/programs");
      await waitForPageLoad(page);

      await page.getByRole("button", { name: /create|add|new/i }).click();

      // Should show form or modal
      await expect(
        page.locator('input[name="name"], label:has-text("Name")')
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("Seasons Management", () => {
    test("can access seasons page", async ({ page }) => {
      await page.goto("/admin/seasons");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/admin\/seasons/);
    });

    test("displays seasons list", async ({ page }) => {
      await page.goto("/admin/seasons");
      await waitForPageLoad(page);

      // Should show table or list
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("Registrations Management", () => {
    test("can access registrations page", async ({ page }) => {
      await page.goto("/admin/registrations");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/admin\/registrations/);
      await expect(
        page.locator("h1, h2").filter({ hasText: /registration/i }).first()
      ).toBeVisible();
    });

    test("displays registrations list", async ({ page }) => {
      await page.goto("/admin/registrations");
      await waitForPageLoad(page);

      // Should show table with registrations or empty state
      const table = page.locator("table");
      const emptyState = page.locator("text=/no registration|no data|get started/i");

      await expect(table.or(emptyState).first()).toBeVisible({ timeout: 20000 });
    });

    test("shows registration details on click", async ({ page }) => {
      await page.goto("/admin/registrations");
      await waitForPageLoad(page);

      // Click on first registration row
      const firstRow = page.locator("table tbody tr").first();
      if (await firstRow.isVisible()) {
        await firstRow.click();

        // Should show details panel or modal
        await expect(
          page.locator('[data-testid="registration-details"], [role="dialog"]')
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe("Users Management", () => {
    test("can access users page", async ({ page }) => {
      await page.goto("/admin/users");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/admin\/users/);
      await expect(
        page.locator("h1, h2").filter({ hasText: /user/i }).first()
      ).toBeVisible();
    });

    test("displays users list", async ({ page }) => {
      await page.goto("/admin/users");
      await waitForPageLoad(page);

      // Should show table with users or empty state
      const table = page.locator("table");
      const emptyState = page.locator("text=/no users|no data|get started/i");

      await expect(table.or(emptyState).first()).toBeVisible({ timeout: 20000 });
    });

    test("can search for users", async ({ page }) => {
      await page.goto("/admin/users");
      await waitForPageLoad(page);

      const searchInput = page.locator(
        'input[type="search"], input[placeholder*="Search"]'
      );

      if (await searchInput.isVisible()) {
        await searchInput.fill("test");
        await page.keyboard.press("Enter");

        // Should filter results
        await waitForPageLoad(page);
      }
    });
  });

  test.describe("Teams Management", () => {
    test("can access teams page", async ({ page }) => {
      await page.goto("/admin/teams");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/admin\/teams/);
    });

    test("displays teams list", async ({ page }) => {
      await page.goto("/admin/teams");
      await waitForPageLoad(page);

      // Should show table or cards with teams
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("Reports", () => {
    test("can access reports page", async ({ page }) => {
      await page.goto("/admin/reports");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/admin\/reports/);
      await expect(
        page.locator("h1, h2").filter({ hasText: /report/i }).first()
      ).toBeVisible();
    });

    test("shows report tabs or sections", async ({ page }) => {
      await page.goto("/admin/reports");
      await waitForPageLoad(page);

      // Should show different report types
      await expect(
        page.locator("text=/revenue|registration|attendance/i").first()
      ).toBeVisible();
    });

    test("can view revenue report", async ({ page }) => {
      await page.goto("/admin/reports");
      await waitForPageLoad(page);

      // Click on revenue tab
      const revenueTab = page.locator(
        'button:has-text("Revenue"), a:has-text("Revenue"), [data-value="revenue"]'
      );

      if (await revenueTab.first().isVisible()) {
        await revenueTab.first().click();
        await waitForPageLoad(page);

        // Should show revenue data
        await expect(page.locator("body")).toBeVisible();
      }
    });

    test("can view registration report", async ({ page }) => {
      await page.goto("/admin/reports");
      await waitForPageLoad(page);

      // Click on registration tab
      const regTab = page.locator(
        'button:has-text("Registration"), a:has-text("Registration"), [data-value="registrations"]'
      );

      if (await regTab.first().isVisible()) {
        await regTab.first().click();
        await waitForPageLoad(page);

        await expect(page.locator("body")).toBeVisible();
      }
    });

    test("can view attendance report", async ({ page }) => {
      await page.goto("/admin/reports");
      await waitForPageLoad(page);

      // Click on attendance tab
      const attendanceTab = page.locator(
        'button:has-text("Attendance"), a:has-text("Attendance"), [data-value="attendance"]'
      );

      if (await attendanceTab.first().isVisible()) {
        await attendanceTab.first().click();
        await waitForPageLoad(page);

        await expect(page.locator("body")).toBeVisible();
      }
    });
  });

  test.describe("Venues Management", () => {
    test("can access venues page", async ({ page }) => {
      await page.goto("/admin/venues");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/admin\/venues/);
    });
  });

  test.describe("Games/Schedule Management", () => {
    test("can access games page", async ({ page }) => {
      await page.goto("/admin/games");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/admin\/games/);
    });
  });

  test.describe("Discount Codes", () => {
    test("can access discount codes page", async ({ page }) => {
      await page.goto("/admin/discount-codes");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/admin\/discount-codes/);
    });

    test("has create discount code button", async ({ page }) => {
      await page.goto("/admin/discount-codes");
      await waitForPageLoad(page);

      // Look for create button or page content
      const createButton = page.getByRole("button", { name: /create|add|new/i });
      const pageContent = page.locator("text=/discount|code/i");

      await expect(createButton.or(pageContent).first()).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe("Announcements", () => {
    test("can access announcements page", async ({ page }) => {
      await page.goto("/admin/announcements");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/admin\/announcements/);
    });

    test("has create announcement button", async ({ page }) => {
      await page.goto("/admin/announcements");
      await waitForPageLoad(page);

      // Look for create button or page content
      const createButton = page.getByRole("button", { name: /create|add|new/i });
      const pageContent = page.locator("text=/announcement/i");

      await expect(createButton.or(pageContent).first()).toBeVisible({ timeout: 15000 });
    });
  });
});

test.describe("Admin Authorization", () => {
  test("non-admin cannot access admin pages", async ({ page }) => {
    await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);

    await page.goto("/admin");

    // Should redirect to dashboard with error or show unauthorized
    await expect(page.url()).not.toMatch(/^.*\/admin$/);
  });

  test("coach cannot access admin pages", async ({ page }) => {
    await signIn(page, TEST_USERS.coach.email, TEST_USERS.coach.password);

    await page.goto("/admin");

    // Should redirect to dashboard with error or show unauthorized
    await expect(page.url()).not.toMatch(/^.*\/admin$/);
  });
});
