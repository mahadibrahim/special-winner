import { test, expect } from '@playwright/test';

test.describe('Protected Routes', () => {
  test('dashboard redirects to signin when not authenticated', async ({ page }) => {
    await page.goto('/dashboard');

    // Should redirect to signin
    await expect(page).toHaveURL(/\/signin/);
  });

  test('admin dashboard redirects to signin when not authenticated', async ({ page }) => {
    await page.goto('/admin');

    // Should redirect to signin
    await expect(page).toHaveURL(/\/signin/);
  });

  test('admin users page redirects to signin when not authenticated', async ({ page }) => {
    await page.goto('/admin/users');

    // Should redirect to signin
    await expect(page).toHaveURL(/\/signin/);
  });

  test('admin programs page redirects to signin when not authenticated', async ({ page }) => {
    await page.goto('/admin/programs');

    // Should redirect to signin
    await expect(page).toHaveURL(/\/signin/);
  });

  test('admin reports page redirects to signin when not authenticated', async ({ page }) => {
    await page.goto('/admin/reports');

    // Should redirect to signin
    await expect(page).toHaveURL(/\/signin/);
  });

  test('coach dashboard redirects to signin when not authenticated', async ({ page }) => {
    await page.goto('/coach');

    // Should redirect to signin
    await expect(page).toHaveURL(/\/signin/);
  });

  test('coach resources redirects to signin when not authenticated', async ({ page }) => {
    await page.goto('/coach/resources');

    // Should redirect to signin
    await expect(page).toHaveURL(/\/signin/);
  });

  test('dashboard settings redirects to signin when not authenticated', async ({ page }) => {
    await page.goto('/dashboard/settings');

    // Should redirect to signin
    await expect(page).toHaveURL(/\/signin/);
  });
});
