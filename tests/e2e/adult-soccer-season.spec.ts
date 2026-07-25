import { test, expect } from "@playwright/test";

test("completed term renders as an archive instead of redirecting (URL permanence)", async ({ page }) => {
  const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";
  // Seed fixture: winter-2026-archive is fully completed. Before the archive
  // fix this URL 302'd to /adult/leagues/soccer — killing an indexed page the
  // day its season wrapped.
  await page.goto(`${BASE}/adult/leagues/soccer/winter-2026-archive`, { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/adult/leagues/soccer/winter-2026-archive");
  // Archive anatomy: Complete chip, no register CTAs, tabs open on Standings.
  await expect(page.getByText("Complete", { exact: true })).toBeVisible();
  await expect(page.getByTestId("hero-register")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Standings" })).toHaveAttribute("aria-selected", "true");
});
import { waitForHydration } from "../utils/test-helpers";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";

test("adult soccer season page: filter divisions and reach register @critical", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues/soccer/fall-2026`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // tabs + finder present
  await expect(page.getByRole("heading", { name: /Find your level/i })).toBeVisible();
  const rows = page.getByTestId("division-rows");
  await expect(rows).toBeVisible();

  // filter by Men's narrows the list
  const before = await page.getByTestId("result-count").innerText();
  // exact: true — otherwise the substring match also hits the "Women's" chip
  // ("women's" contains "men's"), tripping a strict-mode violation.
  await page.getByRole("button", { name: "Men's", exact: true }).click();
  const after = await page.getByTestId("result-count").innerText();
  expect(Number(after)).toBeLessThanOrEqual(Number(before));

  // a register link in the finder rows points to the wizard (scope to the
  // rows so we don't match the hero CTA, which is a same-page scroll link,
  // not a /register/ wizard link). Rows offer one action per signup mode —
  // "Register team →" and/or "Join solo →" — either proves the wizard link.
  const reg = rows.getByRole("link", { name: /Register team|Join solo/i }).first();
  await expect(reg).toHaveAttribute("href", /\/register\//);
});

test("landing page points to the current term @critical", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues/soccer`, { waitUntil: "domcontentloaded" });
  // The landing page is server-rendered (the banner is a plain <a>), and its
  // only island (LevelLadder) does not emit a hydration beacon — so we wait on
  // the banner directly rather than on hydration.
  const banner = page.getByTestId("now-registering");
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute("href", /\/adult\/leagues\/soccer\/fall-2026/);
});
