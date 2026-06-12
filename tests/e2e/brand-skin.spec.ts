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
  // Tab title is chrome-level brand identity — BaseLayout swaps the suffix
  await expect(page).toHaveTitle(/SoccerOne/);
  await expect(page).not.toHaveTitle(/Aspire Sports/);
});

test("Aspire host renders unbranded-identical chrome (regression)", async ({
  page,
}) => {
  await page.goto("/signin", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-brand", "aspire");
  await expect(page.locator(".so-wordmark")).toHaveCount(0);
  await expect(page).toHaveTitle(/Aspire Sports/);
  const bg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  // --cream stays the warm off-white — assert it is NOT the SoccerOne ink
  expect(bg).not.toBe("rgb(10, 10, 13)");

  // Keyboard-focus ring must not be the SoccerOne lime (tokens.css ships
  // in every bundle via BaseLayout's chrome imports; its focus rule is
  // scoped to html[data-brand="soccerone"]).
  const focusOutline = await page.evaluate(() => {
    const link = document.querySelector<HTMLAnchorElement>("main a[href]");
    if (!link) return null;
    link.focus();
    return getComputedStyle(link).outlineColor;
  });
  expect(focusOutline).not.toBe("rgb(163, 230, 53)");
});
