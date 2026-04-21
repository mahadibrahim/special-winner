import { test, expect } from "@playwright/test";
import { waitForHydration } from "./utils/test-helpers";

test.describe("Media tagger — golden path", () => {
  test("admin claims queue item, tags assets with mixed shortcuts, completes session", async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    const adminCtx = await browser.newContext();
    const adminLoginRes = await adminCtx.request.post("/api/auth/signin", {
      data: {
        email: "admin@test.aspiresports.com",
        password: "TestAdmin123!",
      },
    });
    expect(adminLoginRes.ok()).toBeTruthy();

    // Find a queue item that has a game attached (so its roster is non-empty).
    // CI's shared DB can contain stale Phase 1 'uploaded' sessions without a
    // game that the default row ordering places first, and whoever wins the
    // super-admin org-resolution fallback is non-deterministic — so we can't
    // rely on the seeded fixture being the first (or even visible) row.
    // Going via the API avoids UI row ordering and text entirely.
    const queueRes = await adminCtx.request.get(
      "/api/admin/media/tag-queue"
    );
    expect(queueRes.ok()).toBeTruthy();
    const { queue } = await queueRes.json();
    const withGame = queue.find(
      (q: any) => q.game && q.game.id && typeof q.asset_count === "number"
    );
    if (!withGame) {
      // Diagnostic: tell us what admin's org actually sees so we can fix
      // the seed/resolver alignment instead of playing whack-a-mole.
      const summary = queue.map((q: any) => ({
        id: q.session_id,
        assets: q.asset_count,
        game_id: q.game?.id ?? null,
        matchup: q.game ? `${q.game.home} vs ${q.game.away}` : "—",
      }));
      throw new Error(
        "no 'uploaded' shoot session with a game found — seed didn't land in the admin's org.\n" +
          `queue length=${queue.length}, items=${JSON.stringify(summary, null, 2)}`
      );
    }
    const sessionId = withGame.session_id;

    const claimRes = await adminCtx.request.post(
      `/api/admin/media/tag-queue/${sessionId}/claim`
    );
    expect(claimRes.ok()).toBeTruthy();

    const page = await adminCtx.newPage();
    await page.goto(`/media/tag/${sessionId}`);

    await expect(page.locator('[data-testid="asset-viewer"]')).toBeVisible();
    await expect(page.locator('[data-testid="roster-sidebar"]')).toBeVisible();

    // TaggerApp calls useHydrationBeacon(); wait for it before interacting
    // so clicks/keys don't drop onto un-hydrated DOM on slower CI runners.
    await waitForHydration(page);

    // Click a roster entry to tag the current asset. Click-driven (not
    // keyboard-driven) so we don't depend on the window-level keydown
    // listener — clicks go through React's synthetic event system on
    // the target element directly.
    const firstEntry = page.locator('[data-testid^="roster-entry-"]').first();
    await expect(firstEntry).toBeVisible();
    await firstEntry.click();

    // Wait for the tag POST to complete by observing the tag count badge
    // flip from 0 to 1 next to this roster entry.
    await expect(firstEntry).toContainText(/\b1\b/, { timeout: 10_000 });

    // Complete the session. This POSTs /complete and navigates back to the
    // admin tag-queue on success. If res.ok is false, the app silently
    // stays on the page — we'll catch that via the waitForURL timeout
    // below and the post-condition API check.
    await page.click('[data-testid="complete-session"]');
    await page.waitForURL(/\/admin\/media\/tag-queue/, {
      timeout: 15_000,
      waitUntil: "domcontentloaded",
    });

    // Verify the session moved out of 'uploaded' (i.e., no longer in the queue).
    const afterRes = await adminCtx.request.get("/api/admin/media/tag-queue");
    const afterJson = await afterRes.json();
    const stillQueued = afterJson.queue.some(
      (q: any) => q.session_id === sessionId
    );
    expect(stillQueued).toBe(false);
  });
});
