import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../utils/test-helpers";

// Full coach journey: setup -> field -> capture -> wrap-up -> completed.
// Director-side delivery status is covered by the existing
// tests/api/admin/blueprint-delivery suite (completion is the only input
// this feature adds to it), so this spec stays coach-scoped.
test("coach runs a session end to end", async ({ page }) => {
  await signIn(page, "coach@test.aspiresports.com", "TestCoach123!");

  // Create tonight's session through the API with the page's cookies.
  const players = await page.request.get("/api/coach/players");
  const teamId = (await players.json()).players[0].team.id;
  const created = await page.request.post("/api/coach/sessions", {
    data: {
      teamId,
      title: "E2E lifecycle session",
      scheduledDate: new Date().toISOString(),
      durationMinutes: 45,
      status: "planned",
      segments: [
        { order: 0, name: "Warmup", type: "warmup", durationMinutes: 10 },
        { order: 1, name: "Small games", type: "game", durationMinutes: 35 },
      ],
    },
  });
  const sessionId = (await created.json()).session.id;

  // Setup.
  await page.goto(`/coach/practices/${sessionId}/live`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  // The Astro dev toolbar overlays the bottom edge and intercepts clicks on
  // the fixed-bottom Start button (same workaround as referee-closeout.spec).
  await page.evaluate(() => document.querySelector("astro-dev-toolbar")?.remove());
  await expect(page.getByTestId("setup-segments")).toContainText("Warmup");
  await page.getByTestId("start-session").click();

  // Field mode: attendance sheet only shows when some player lacks a
  // status (see field-mode.tsx's showAttendance initializer). Field mode
  // mounts synchronously with the stage change, so once field-mode is on
  // screen the sheet's presence/absence is already decided — dismiss it if
  // it rendered, otherwise proceed directly.
  await expect(page.getByTestId("field-mode")).toBeVisible();
  if (await page.getByTestId("attendance-sheet").isVisible()) {
    await page.getByTestId("attendance-done").click();
  }
  await expect(page.getByTestId("current-segment")).toContainText("Warmup");
  await page.getByTestId("advance-segment").click();
  await expect(page.getByTestId("current-segment")).toContainText("Small games");

  // Quick capture on the first player.
  await page.locator('[data-testid^="player-chip-"]').first().click();
  await page.getByTestId("capture-glow").first().click();

  // End -> wrap-up.
  await page.getByTestId("end-session").click();
  await expect(page.getByTestId("wrapup-step-attendance")).toBeVisible();
  await page.getByTestId("wrapup-next").click();
  await expect(page.getByTestId("wrapup-step-glows")).toBeVisible();
  await page.locator('[data-testid^="capture-promote-"]').first().click();
  await page.getByTestId("wrapup-next").click();
  await page.getByTestId("finish-session").click();
  await expect(page.getByTestId("wrapup-done")).toBeVisible();

  // Reload lands in read-only done state.
  await page.goto(`/coach/practices/${sessionId}/live`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await expect(page.getByTestId("wrapup-done")).toBeVisible();
});
