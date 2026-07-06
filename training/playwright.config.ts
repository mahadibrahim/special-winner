import { defineConfig, devices } from "@playwright/test";

// Phase 2 walkthrough project — deliberately separate from the root
// playwright.config.ts (testDir: './tests/e2e'). `npm test` never
// discovers this directory, and this config is only ever invoked
// explicitly via `npm run training:videos`. No `webServer` block: unlike
// the CI-facing e2e config, walkthroughs run against a dev server the
// operator already has running (see training/README.md).
export default defineConfig({
  testDir: "./training/walkthroughs",
  testMatch: /.*\.walkthrough\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 180 * 1000,
  use: {
    baseURL: process.env.TRAINING_BASE_URL || "http://localhost:4321",
    viewport: { width: 1280, height: 720 },
    video: { mode: "on", size: { width: 1280, height: 720 } },
    screenshot: "on",
    trace: "off",
  },
  projects: [
    {
      name: "training",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
