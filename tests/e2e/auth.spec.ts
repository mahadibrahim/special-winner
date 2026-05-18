import { test, expect } from "@playwright/test";
import { TEST_USERS, signIn } from "../utils/test-helpers";

// The customer-facing auth UI is magic-link only — no password fields.
// E2E tests authenticate via the password endpoint (still alive for back-
// compat); the UI assertions here cover the magic-link flow.

test.describe("Authentication Flow", { tag: "@critical" }, () => {
  test.describe("Sign In", () => {
    test("shows signin page with email field + magic-link CTA", async ({ page }) => {
      await page.goto("/signin");

      await expect(page).toHaveTitle(/Sign In/);
      await expect(page.locator('input[type="email"]').first()).toBeVisible();
      // No password field anywhere on the magic-link sign-in form.
      await expect(page.locator('input[type="password"]')).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /email me a sign-in link/i }),
      ).toBeVisible();
    });

    test("magic-link form shows confirmation after submit", async ({ page }) => {
      await page.goto("/signin", { waitUntil: "domcontentloaded" });

      await page.locator('input[type="email"]').first().fill(TEST_USERS.parent.email);
      await page
        .getByRole("button", { name: /email me a sign-in link/i })
        .click();

      // Server uses anti-enumeration messaging — same "check your email"
      // copy for known + unknown addresses.
      await expect(page.locator("text=/check your email/i")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("successfully signs in admin user (API helper)", async ({ page }) => {
      await signIn(page, TEST_USERS.admin.email, TEST_USERS.admin.password);

      // Helper lands on /dashboard; admins navigate to /admin themselves.
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/admin/);
      await expect(
        page.getByText(/good (morning|afternoon|evening),/i),
      ).toBeVisible();
    });

    test("successfully signs in parent user (API helper)", async ({ page }) => {
      await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test("successfully signs in coach user (API helper)", async ({ page }) => {
      await signIn(page, TEST_USERS.coach.email, TEST_USERS.coach.password);
      // Helper lands at /dashboard. Coach can navigate to /coach.
      await page.goto("/coach");
      await expect(page.url()).toMatch(/\/(coach|dashboard)/);
    });

    test("redirects authenticated user away from signin page", async ({ page }) => {
      await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);

      await page.goto("/signin");
      // Middleware should bounce authenticated users away from /signin.
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });

  test.describe("Sign Up", () => {
    test("shows signup page with required fields (no password)", async ({ page }) => {
      await page.goto("/signup");

      await expect(page).toHaveTitle(/Create Account|Sign Up/);
      await expect(page.locator('input[name="firstName"]')).toBeVisible();
      await expect(page.locator('input[name="lastName"]')).toBeVisible();
      await expect(page.locator('input[type="email"]').first()).toBeVisible();
      // Magic-link signup must not have password fields.
      await expect(page.locator('input[type="password"]')).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /create account/i }),
      ).toBeVisible();
    });

    test("validates email format", async ({ page }) => {
      await page.goto("/signup");

      await page.locator('input[name="firstName"]').fill("Test");
      await page.locator('input[name="lastName"]').fill("User");
      await page.locator('input[type="email"]').first().fill("notanemail");

      await page.getByRole("button", { name: /create account/i }).click();

      // Stay on signup — invalid email is caught by either native form
      // validation or by the server-side Zod check.
      await expect(page).toHaveURL(/\/signup/);
    });
  });

  test.describe("Magic-link sender", () => {
    test("/forgot-password redirects through to /signin", async ({ page }) => {
      await page.goto("/forgot-password");
      // /forgot-password → /email-link-signin → /signin (both 301).
      await expect(page).toHaveURL(/\/signin$/);
      await expect(page.locator('input[type="email"]').first()).toBeVisible();
    });

    test("accepts email and shows confirmation", async ({ page }) => {
      await page.goto("/signin");
      await page
        .locator('input[type="email"]')
        .first()
        .fill(TEST_USERS.parent.email);
      await page
        .getByRole("button", { name: /email me a sign-in link/i })
        .click();

      await expect(page.locator("text=/check your email/i")).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test.describe("Sign Out", () => {
    test("successfully signs out user", async ({ page }) => {
      await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);
      await expect(page).toHaveURL(/\/dashboard/);

      // Sign-out is reliably reachable via the signout API endpoint;
      // the UI affordances vary by viewport and aren't what this test
      // is checking.
      await page.goto("/api/auth/signout");

      // Lands on a public page — typically / or /signin.
      await page.waitForURL(
        (url) => url.pathname === "/" || url.pathname.includes("/signin"),
        { timeout: 10_000 },
      );
    });
  });

  test.describe("Session Persistence", () => {
    test("maintains session across page navigations", async ({ page }) => {
      await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);

      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard/);

      await page.goto("/dashboard/settings");
      await expect(page).toHaveURL(/\/dashboard\/settings/);

      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });
});
