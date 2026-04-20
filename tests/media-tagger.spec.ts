import { test, expect } from "@playwright/test";

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
    expect(
      withGame,
      "no 'uploaded' shoot session with a game found — seed didn't land in the admin's org"
    ).toBeTruthy();
    const sessionId = withGame.session_id;

    const claimRes = await adminCtx.request.post(
      `/api/admin/media/tag-queue/${sessionId}/claim`
    );
    expect(claimRes.ok()).toBeTruthy();

    const page = await adminCtx.newPage();
    await page.goto(`/media/tag/${sessionId}`);

    await expect(page.locator('[data-testid="asset-viewer"]')).toBeVisible();
    await expect(page.locator('[data-testid="roster-sidebar"]')).toBeVisible();

    const firstEntry = page.locator('[data-testid^="roster-entry-"]').first();
    await expect(firstEntry).toBeVisible();
    const jerseyLabel = await firstEntry.locator("span").first().innerText();
    const jersey = jerseyLabel.trim();
    if (/^\d+$/.test(jersey)) {
      for (const ch of jersey) await page.keyboard.press(ch);
      await page.keyboard.press("Enter");
    }

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("h");

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("t");

    const secondEntry = page.locator('[data-testid^="roster-entry-"]').nth(1);
    if (await secondEntry.isVisible()) {
      await secondEntry.click();
    }

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
