import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // In CI, retry twice. The E2E suite runs against the Astro/Vite dev server,
  // whose Node http.Server closes idle keep-alive sockets after ~5s; Playwright's
  // persistent APIRequestContext can then reuse a half-closed socket and read an
  // ECONNRESET. This is a transient per-request infra race (no server crash), so
  // a retry passes — `retries: 0` (a leftover debug setting) turned every race
  // into a hard job failure. Locally, keep 0 for fast fail-fast feedback.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,  // Allow parallelism in CI
  reporter: [
    ['html'],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4321',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Test timeout. Generous because Railway-backed CI runs share a single
  // DB instance: under parallel-worker load (auth + admin + media tests
  // hitting Stripe + Drizzle simultaneously) signin alone has been seen
  // taking 35s, so a 30s overall test budget triggers spurious flakes.
  timeout: 120 * 1000,
  expect: {
    timeout: 10 * 1000,  // 10s for assertions
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment to test on more browsers:
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
    // Mobile viewports:
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
