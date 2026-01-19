import { Page, expect } from "@playwright/test";

/**
 * Test user credentials - must match seed-e2e-tests.ts
 */
export const TEST_USERS = {
  admin: {
    email: "admin@test.aspiresports.com",
    password: "TestAdmin123!",
    firstName: "Test",
    lastName: "Admin",
  },
  coach: {
    email: "coach@test.aspiresports.com",
    password: "TestCoach123!",
    firstName: "Test",
    lastName: "Coach",
  },
  parent: {
    email: "parent@test.aspiresports.com",
    password: "TestParent123!",
    firstName: "Test",
    lastName: "Parent",
  },
  newUser: {
    email: "newuser@test.aspiresports.com",
    password: "TestNew123!",
    firstName: "New",
    lastName: "User",
  },
};

/**
 * Sign in a user via the signin page
 */
export async function signIn(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto("/signin");

  // Fill in credentials
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);

  // Submit form
  await page.getByRole("button", { name: /sign in/i }).click();

  // Wait for navigation away from signin
  await page.waitForURL((url) => !url.pathname.includes("/signin"), {
    timeout: 10000,
  });
}

/**
 * Sign in as admin user
 */
export async function signInAsAdmin(page: Page): Promise<void> {
  await signIn(page, TEST_USERS.admin.email, TEST_USERS.admin.password);
  // Verify we landed on admin dashboard
  await expect(page).toHaveURL(/\/admin/);
}

/**
 * Sign in as coach user
 */
export async function signInAsCoach(page: Page): Promise<void> {
  await signIn(page, TEST_USERS.coach.email, TEST_USERS.coach.password);
  // Coaches may land on /coach or /dashboard
  await expect(page.url()).toMatch(/\/(coach|dashboard)/);
}

/**
 * Sign in as parent user
 */
export async function signInAsParent(page: Page): Promise<void> {
  await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);
  // Parents land on /dashboard
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * Sign out the current user
 */
export async function signOut(page: Page): Promise<void> {
  // Look for sign out button/link in nav or dropdown
  const signOutBtn = page.getByRole("button", { name: /sign out|log out/i });
  const signOutLink = page.getByRole("link", { name: /sign out|log out/i });

  if (await signOutBtn.isVisible()) {
    await signOutBtn.click();
  } else if (await signOutLink.isVisible()) {
    await signOutLink.click();
  } else {
    // May need to open a dropdown first
    const userMenu = page.locator('[data-testid="user-menu"]');
    if (await userMenu.isVisible()) {
      await userMenu.click();
      await page.getByRole("menuitem", { name: /sign out|log out/i }).click();
    }
  }

  // Wait for redirect to signin or home
  await page.waitForURL((url) =>
    url.pathname === "/" || url.pathname.includes("/signin")
  );
}

/**
 * Wait for toast notification with specific text
 */
export async function expectToast(
  page: Page,
  text: string | RegExp,
  type: "success" | "error" | "info" = "success"
): Promise<void> {
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: text });
  await expect(toast).toBeVisible({ timeout: 5000 });
}

/**
 * Fill a form field by label
 */
export async function fillField(
  page: Page,
  label: string | RegExp,
  value: string
): Promise<void> {
  const field = page.getByLabel(label);
  await field.fill(value);
}

/**
 * Select an option from a select/dropdown by label
 */
export async function selectOption(
  page: Page,
  label: string | RegExp,
  optionText: string
): Promise<void> {
  const select = page.getByLabel(label);
  await select.selectOption({ label: optionText });
}

/**
 * Click a button by text
 */
export async function clickButton(
  page: Page,
  text: string | RegExp
): Promise<void> {
  await page.getByRole("button", { name: text }).click();
}

/**
 * Navigate via sidebar link (admin/coach dashboards)
 */
export async function navigateSidebar(
  page: Page,
  linkText: string | RegExp
): Promise<void> {
  await page.getByRole("navigation").getByRole("link", { name: linkText }).click();
}

/**
 * Wait for page to finish loading (no pending requests)
 */
export async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
}

/**
 * Get table row count
 */
export async function getTableRowCount(page: Page): Promise<number> {
  const rows = page.locator("table tbody tr");
  return await rows.count();
}

/**
 * Check if element contains text (case insensitive)
 */
export async function expectTextContent(
  page: Page,
  selector: string,
  text: string | RegExp
): Promise<void> {
  const element = page.locator(selector);
  await expect(element).toContainText(text);
}
