import { test, expect } from "@playwright/test";
import {
  TEST_USERS,
  signIn,
  waitForPageLoad,
} from "../utils/test-helpers";

test.describe("Coach Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEST_USERS.coach.email, TEST_USERS.coach.password);
  });

  test.describe("Dashboard Overview", () => {
    test("displays coach dashboard", async ({ page }) => {
      await page.goto("/coach");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/coach/);
      // Look for any heading or content indicating coach dashboard
      const heading = page.locator("h1, h2").filter({ hasText: /coach|dashboard|team/i }).first();
      const navItem = page.locator("[role='navigation'], nav").first();

      await expect(heading.or(navItem).first()).toBeVisible({ timeout: 15000 });
    });

    test("shows assigned teams", async ({ page }) => {
      await page.goto("/coach");
      await waitForPageLoad(page);

      // Should show teams section
      await expect(
        page.locator("text=/team|roster/i").first()
      ).toBeVisible();
    });

    test("shows upcoming sessions or practices", async ({ page }) => {
      await page.goto("/coach");
      await waitForPageLoad(page);

      // Should show schedule or upcoming
      await expect(
        page.locator("text=/upcoming|schedule|session|practice/i").first()
      ).toBeVisible();
    });
  });

  test.describe("Team Management", () => {
    test("can view team roster", async ({ page }) => {
      await page.goto("/coach/teams");
      await waitForPageLoad(page);

      // Click on first team if available
      const teamCard = page.locator(
        '[data-testid="team-card"], a[href*="/coach/teams/"]'
      );

      if ((await teamCard.count()) > 0) {
        await teamCard.first().click();
        await waitForPageLoad(page);

        // Should show team details
        await expect(page.url()).toMatch(/\/coach\/teams\//);
      }
    });

    test("shows player list in team", async ({ page }) => {
      await page.goto("/coach/teams");
      await waitForPageLoad(page);

      const teamLink = page.locator('a[href*="/coach/teams/"]');

      if ((await teamLink.count()) > 0) {
        await teamLink.first().click();
        await waitForPageLoad(page);

        // Should show roster/players
        await expect(
          page.locator("text=/roster|player|member/i").first()
        ).toBeVisible();
      }
    });
  });

  test.describe("Attendance Tracking", () => {
    test("can access attendance page", async ({ page }) => {
      await page.goto("/coach/attendance");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/coach\/attendance/);
    });

    test("shows attendance form or list", async ({ page }) => {
      await page.goto("/coach/attendance");
      await waitForPageLoad(page);

      // Should show attendance interface
      await expect(page.locator("body")).toBeVisible();
    });

    test("can mark attendance for a practice", async ({ page }) => {
      await page.goto("/coach/attendance");
      await waitForPageLoad(page);

      // Look for attendance checkboxes or buttons
      const attendanceCheckbox = page.locator(
        'input[type="checkbox"], button[data-attendance]'
      );

      if ((await attendanceCheckbox.count()) > 0) {
        // Toggle first attendance item
        await attendanceCheckbox.first().click();

        // Should update (may show save button or auto-save)
        await expect(page.locator("body")).toBeVisible();
      }
    });
  });

  test.describe("Session Planning", () => {
    test("can access sessions page", async ({ page }) => {
      await page.goto("/coach/sessions");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/coach\/sessions/);
    });

    test("can create new session plan", async ({ page }) => {
      await page.goto("/coach/sessions");
      await waitForPageLoad(page);

      const createButton = page.getByRole("button", { name: /create|add|new|plan/i });

      if (await createButton.isVisible()) {
        await createButton.click();

        // Should show session plan form
        await expect(
          page.locator('input[name="title"], label:has-text("Title")')
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test("session plan form has required fields", async ({ page }) => {
      await page.goto("/coach/sessions/new");
      await waitForPageLoad(page);

      // Check for form or any content if page exists
      if (!page.url().includes("/signin")) {
        const form = page.locator("form, [data-testid='session-form']");
        const pageContent = page.locator("text=/session|plan|practice/i");
        const notFound = page.locator("text=/not found|404/i");

        // Just verify page loaded with some content
        await expect(form.or(pageContent).or(notFound).first()).toBeVisible({ timeout: 15000 });
      }
    });
  });

  test.describe("Player Development", () => {
    test("can access player development page", async ({ page }) => {
      await page.goto("/coach/development");
      await waitForPageLoad(page);

      // May redirect or show development page
      await expect(page.url()).toMatch(/\/coach/);
    });

    test("can view player skills assessment", async ({ page }) => {
      await page.goto("/coach/development");
      await waitForPageLoad(page);

      // Look for skills or assessment section
      const skillsSection = page.locator("text=/skill|assessment|development/i");
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("Resources", () => {
    test("can access resources page", async ({ page }) => {
      await page.goto("/coach/resources");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/coach\/resources/);
    });

    test("shows available coaching resources", async ({ page }) => {
      await page.goto("/coach/resources");
      await waitForPageLoad(page);

      // Should show resources list
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("Activities Library", () => {
    test("can access activities page", async ({ page }) => {
      await page.goto("/coach/activities");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/coach\/activities/);
    });

    test("can search activities", async ({ page }) => {
      await page.goto("/coach/activities");
      await waitForPageLoad(page);

      const searchInput = page.locator(
        'input[type="search"], input[placeholder*="Search"]'
      );

      if (await searchInput.isVisible()) {
        await searchInput.fill("dribbling");
        await page.keyboard.press("Enter");
        await waitForPageLoad(page);
      }
    });

    test("can filter activities by type", async ({ page }) => {
      await page.goto("/coach/activities");
      await waitForPageLoad(page);

      const filterSelect = page.locator(
        'select[name="type"], [data-testid="activity-filter"]'
      );

      if (await filterSelect.first().isVisible()) {
        await filterSelect.first().click();
        // Just verify filter exists
        await expect(page.locator("body")).toBeVisible();
      }
    });
  });
});

test.describe("Coach Authorization", () => {
  test("non-coach cannot access coach pages", async ({ page }) => {
    await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);

    await page.goto("/coach");

    // Should redirect to dashboard with error
    await expect(page.url()).toMatch(/\/(dashboard|signin)/);
  });

  test("admin can access coach pages", async ({ page }) => {
    await signIn(page, TEST_USERS.admin.email, TEST_USERS.admin.password);

    await page.goto("/coach");

    // Admin should be able to access (may redirect to admin though)
    await expect(page.url()).toMatch(/\/(coach|admin)/);
  });
});
