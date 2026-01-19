import { test, expect } from "@playwright/test";
import { TEST_USERS, signIn, signOut, expectToast } from "./utils/test-helpers";

test.describe("Authentication Flow", () => {
  test.describe("Sign In", () => {
    test("shows signin page with email and password fields", async ({ page }) => {
      await page.goto("/signin");

      await expect(page).toHaveTitle(/Sign In/);
      await expect(page.locator('input[type="email"]').first()).toBeVisible();
      await expect(page.locator('input[type="password"]').first()).toBeVisible();
      await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    });

    test("shows error for invalid credentials", async ({ page }) => {
      await page.goto("/signin");

      await page.locator('input[type="email"]').first().fill("invalid@test.com");
      await page.locator('input[type="password"]').first().fill("wrongpassword");
      await page.getByRole("button", { name: /sign in/i }).click();

      // Should show error message
      await expect(page.locator("text=Invalid email or password")).toBeVisible({
        timeout: 5000,
      });
    });

    test("successfully signs in admin user", async ({ page }) => {
      await signIn(page, TEST_USERS.admin.email, TEST_USERS.admin.password);

      // Admin should be redirected to admin dashboard
      await expect(page).toHaveURL(/\/admin/);
      await expect(page.locator("text=Dashboard")).toBeVisible();
    });

    test("successfully signs in parent user", async ({ page }) => {
      await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);

      // Parent should be redirected to dashboard
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test("successfully signs in coach user", async ({ page }) => {
      await signIn(page, TEST_USERS.coach.email, TEST_USERS.coach.password);

      // Coach should be redirected to coach or dashboard
      await expect(page.url()).toMatch(/\/(coach|dashboard)/);
    });

    test("redirects authenticated user away from signin page", async ({ page }) => {
      // First sign in
      await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);

      // Try to go back to signin
      await page.goto("/signin");

      // Should be redirected to dashboard
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });

  test.describe("Sign Up", () => {
    test("shows signup page with required fields", async ({ page }) => {
      await page.goto("/signup");

      await expect(page).toHaveTitle(/Create Account|Sign Up/);
      await expect(page.locator('input[type="email"]').first()).toBeVisible();
      await expect(page.locator('input[type="password"]').first()).toBeVisible();
    });

    test("validates email format", async ({ page }) => {
      await page.goto("/signup");

      // Fill invalid email
      await page.locator('input[type="email"]').first().fill("notanemail");
      await page.locator('input[type="password"]').first().fill("ValidPass123!");

      // Try to submit
      await page.getByRole("button", { name: /sign up|create|register/i }).click();

      // Should show validation error (browser native or custom)
      // The form shouldn't submit with invalid email
      await expect(page).toHaveURL(/\/signup/);
    });

    test("validates password requirements", async ({ page }) => {
      await page.goto("/signup");

      await page.locator('input[type="email"]').first().fill("valid@test.com");
      await page.locator('input[type="password"]').first().fill("weak");

      await page.getByRole("button", { name: /sign up|create|register/i }).click();

      // Should stay on signup page or show error
      await expect(page).toHaveURL(/\/signup/);
    });
  });

  test.describe("Forgot Password", () => {
    test("shows forgot password page with email field", async ({ page }) => {
      await page.goto("/forgot-password");

      await expect(page).toHaveTitle(/Forgot Password|Reset/i);
      await expect(page.locator('input[type="email"]').first()).toBeVisible();
      await expect(
        page.getByRole("button", { name: /reset|send|submit/i })
      ).toBeVisible();
    });

    test("accepts email and shows confirmation", async ({ page }) => {
      await page.goto("/forgot-password");

      await page
        .locator('input[type="email"]')
        .first()
        .fill(TEST_USERS.parent.email);
      await page.getByRole("button", { name: /reset|send|submit/i }).click();

      // Should show success message or redirect
      await expect(
        page.locator("text=/check your email|reset link|sent/i")
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("Sign Out", () => {
    test("successfully signs out user", async ({ page }) => {
      // First sign in
      await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);
      await expect(page).toHaveURL(/\/dashboard/);

      // Find and click sign out
      // Try different common patterns
      const userMenuButton = page.locator(
        '[data-testid="user-menu"], button:has-text("Account"), button:has-text("' +
          TEST_USERS.parent.firstName +
          '")'
      );

      if (await userMenuButton.first().isVisible()) {
        await userMenuButton.first().click();
        await page.getByRole("menuitem", { name: /sign out|log out/i }).click();
      } else {
        // Try direct sign out link/button
        const signOutElement = page.locator(
          'a:has-text("Sign Out"), button:has-text("Sign Out"), a:has-text("Log Out"), button:has-text("Log Out")'
        );
        await signOutElement.first().click();
      }

      // Should redirect to home or signin
      await page.waitForURL((url) =>
        url.pathname === "/" || url.pathname.includes("/signin")
      );
    });
  });

  test.describe("Session Persistence", () => {
    test("maintains session across page navigations", async ({ page }) => {
      await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);

      // Navigate to different pages
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard/);

      await page.goto("/dashboard/settings");
      await expect(page).toHaveURL(/\/dashboard\/settings/);

      // Should still be signed in
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });
});
