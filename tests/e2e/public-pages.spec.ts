import { test, expect } from '@playwright/test';

test.describe('Public Pages', () => {
  test('homepage loads correctly', async ({ page }) => {
    await page.goto('/');

    // Check page title
    await expect(page).toHaveTitle(/Aspire Sports/);

    // Check hero section has heading
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Check navigation is present
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('programs page loads correctly', async ({ page }) => {
    await page.goto('/programs');

    await expect(page).toHaveTitle(/Programs/);

    // Check page body is rendered
    await expect(page.locator('body')).toBeVisible();
  });

  test('forgot password page redirects to /signin', async ({ page }) => {
    // /forgot-password → /email-link-signin → /signin (both 301).
    // /signin IS the magic-link form after the password-removal migration.
    await page.goto('/forgot-password');

    await expect(page).toHaveURL(/\/signin$/);
    await expect(page).toHaveTitle(/Sign In/);
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
  });

  test('signin page loads correctly (magic-link only)', async ({ page }) => {
    await page.goto('/signin');

    await expect(page).toHaveTitle(/Sign In/);

    // Check the email field exists (use first() to avoid matching footer
    // newsletter). Magic-link UI has no password field.
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test('signup page loads correctly', async ({ page }) => {
    await page.goto('/signup');

    await expect(page).toHaveTitle(/Create Account|Sign Up/);

    // Check page body is rendered
    await expect(page.locator('body')).toBeVisible();
  });

  test('footer is present on homepage', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('footer')).toBeVisible();
  });

  test('homepage has programs section', async ({ page }) => {
    await page.goto('/');

    // Check programs section exists (via anchor or section)
    const programsSection = page.locator('#programs');
    await expect(programsSection).toBeVisible();
  });
});
