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

    const page = await adminCtx.newPage();
    await page.goto("/admin/media/tag-queue");

    const firstRow = page.locator('[data-testid^="queue-row-"]').first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });
    const rowTestId = await firstRow.getAttribute("data-testid");
    expect(rowTestId).toBeTruthy();
    const sessionId = rowTestId!.replace("queue-row-", "");

    await firstRow.locator('[data-testid^="claim-button-"]').click();

    await page.waitForURL(/\/media\/tag\//, {
      timeout: 15_000,
      waitUntil: "domcontentloaded",
    });
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

    const rowForSession = page.locator(`[data-testid="queue-row-${sessionId}"]`);
    await expect(rowForSession).toHaveCount(0);
  });
});
