import { test, expect } from "@playwright/test";
import { signInAsAdmin, waitForHydration } from "../utils/test-helpers";

// The /api/admin/venue/today aggregation is heavy and slow against the
// accumulated staging DB used in CI (tens of seconds — same data-bloat caveat
// CLAUDE.md notes for tag-queue; it's fast on prod's co-located DB). Give the
// data-dependent assertions a realistic budget.
test("venue command center renders and opens an activity roster", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signInAsAdmin(page);
  await page.goto("/admin/venue", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // The page title is server-rendered, so it proves the command-center route
  // loaded (not a redirect/error) without waiting for the data fetch.
  await expect(page).toHaveTitle(/command center/i);

  // NeedsAttentionQueue renders the "Needs attention" h2 once data loads.
  // Target the heading specifically: the "Nothing needs attention right now"
  // empty-state text also matches /needs attention/i, so a plain getByText is
  // a strict-mode violation (2 matches).
  await expect(
    page.getByRole("heading", { name: /needs attention/i }),
  ).toBeVisible({ timeout: 60_000 });

  // ActivityBlock renders with data-activity-block on its root div.
  // Guard with count() so the test passes when the seeded venue has no sessions.
  const block = page.locator("[data-activity-block]").first();
  if ((await block.count()) > 0) {
    // Playwright's default scrollIntoViewIfNeeded aligns the element to the
    // nearest viewport edge, which can land it directly under AdminLayout's
    // sticky top-0 header — the header then intercepts the click. Center the
    // block in the viewport first so the sticky header can't steal the hit.
    await block.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await block.click();

    // ActivityDetailPanel renders as role="dialog".  The × close button
    // (aria-label="Close") is always present when the panel is open.
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(
      panel.getByRole("button", { name: /close/i }),
    ).toBeVisible();

    // If the session has open capacity, ActivityDetailPanel renders
    // "Open slot — add walk-in" rows (exact text from ActivityDetailPanel.tsx).
    // This assertion is conditional — it passes on sessions with no open slots.
    const openSlotRow = panel.getByText(/open slot.*add walk-in/i);
    if ((await openSlotRow.count()) > 0) {
      await expect(openSlotRow.first()).toBeVisible();
    }
  }
});

test("venue command center deep link opens the detail panel on load", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signInAsAdmin(page);

  // Discover a real, currently-seeded session id — don't hardcode a fixture
  // id that can drift out from under the test as seed data changes.
  const today = new Date().toISOString().slice(0, 10);
  const response = await page.request.get(
    `/api/admin/venue/today?date=${today}`,
  );
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { sessions?: { id: string }[] };
  const sessionId = payload.sessions?.[0]?.id;

  test.skip(!sessionId, "No seeded sessions today — nothing to deep-link to");

  await page.goto(`/admin/venue?date=${today}&session=${sessionId}`, {
    waitUntil: "domcontentloaded",
  });
  await waitForHydration(page);

  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await expect(
    panel.getByRole("button", { name: /close/i }),
  ).toBeVisible();
});
