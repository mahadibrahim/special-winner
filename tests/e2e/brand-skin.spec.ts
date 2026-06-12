import { test, expect } from "@playwright/test";

// soccerone.localhost resolves to loopback in Chromium without DNS setup
// (see SOCCERONE_HOSTS in src/lib/organization/soccerone-routing.ts).
const SOCCERONE_BASE = (
  process.env.PLAYWRIGHT_BASE_URL || "http://localhost:4321"
).replace("localhost", "soccerone.localhost");

// No waitForHydration needed: these tests assert server-rendered chrome
// and computed CSS only — no clicks, no keyboard input.

test("SoccerOne host skins shared booking chrome", async ({ page }) => {
  await page.goto(`${SOCCERONE_BASE}/signin`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("html")).toHaveAttribute(
    "data-brand",
    "soccerone",
  );
  // SoccerOne header replaces the Aspire nav
  await expect(page.locator(".so-wordmark")).toBeVisible();
  await expect(page.locator("nav.bg-cream")).toHaveCount(0);
  // Palette override is live: body bg-cream resolves to --so-ink
  const bg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(bg).toBe("rgb(10, 10, 13)");
});

test("Aspire host renders unbranded-identical chrome (regression)", async ({
  page,
}) => {
  await page.goto("/signin", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-brand", "aspire");
  await expect(page.locator(".so-wordmark")).toHaveCount(0);
  const bg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  // --cream stays the warm off-white — assert it is NOT the SoccerOne ink
  expect(bg).not.toBe("rgb(10, 10, 13)");
});
