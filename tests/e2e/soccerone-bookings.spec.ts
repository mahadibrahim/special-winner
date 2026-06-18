import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

// Derive the SoccerOne base URL from the configured base URL — same pattern
// as brand-skin.spec.ts (the canonical example for driving a SoccerOne host).
// soccerone.localhost resolves to loopback in Chromium without DNS setup.
const SOCCERONE_BASE = (
  process.env.PLAYWRIGHT_BASE_URL || "http://localhost:4321"
).replace("localhost", "soccerone.localhost");

test("SoccerOne bookings page renders unified timeline heading", async ({
  page,
}) => {
  // Sign in against the SoccerOne host so the session cookie is scoped to
  // soccerone.localhost rather than localhost. We POST directly to the
  // password endpoint (preserved for E2E/admin; magic-link is the customer
  // UI path) using an absolute URL derived from SOCCERONE_BASE.
  const response = await page.request.post(
    `${SOCCERONE_BASE}/api/auth/signin`,
    {
      data: {
        email: "parent@test.aspiresports.com",
        password: "TestParent123!",
      },
    },
  );
  if (!response.ok()) {
    const body = await response.text().catch(() => "(no body)");
    throw new Error(
      `signIn(parent@test.aspiresports.com) failed: HTTP ${response.status()} — ${body}`,
    );
  }

  await page.goto(`${SOCCERONE_BASE}/dashboard/bookings`, {
    waitUntil: "domcontentloaded",
  });
  await waitForHydration(page);

  // Unified timeline header — replaces the old two-section layout.
  await expect(
    page.getByRole("heading", { name: "My Bookings" }),
  ).toBeVisible();

  // SoccerOne chrome is present: the html element carries data-brand="soccerone".
  await expect(page.locator("html")).toHaveAttribute("data-brand", "soccerone");
});
