import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../utils/test-helpers";

const SESSION_TITLE = "E2E lifecycle session";

// Clean up the session this run created — plus any orphans an earlier failed
// run left behind (self-healing, mirrors program-blueprint.spec.ts's
// afterAll). Uses its own request context so it fires even when the test
// body failed; the coach sessions DELETE accepts completed sessions.
test.afterAll(async ({ playwright, baseURL }) => {
  const ctx = await playwright.request.newContext({ baseURL: baseURL ?? undefined });
  try {
    const signin = await ctx.post("/api/auth/signin", {
      data: { email: "coach@test.aspiresports.com", password: "TestCoach123!" },
    });
    if (!signin.ok()) return;
    const res = await ctx.get("/api/coach/sessions");
    if (!res.ok()) return;
    const { sessions } = (await res.json()) as {
      sessions: { id: string; title: string }[];
    };
    for (const s of sessions.filter((s) => s.title === SESSION_TITLE)) {
      await ctx.delete(`/api/coach/sessions/${s.id}`);
    }
  } finally {
    await ctx.dispose();
  }
});

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
      title: SESSION_TITLE,
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

  // Quick capture on the first player — and deterministically wait for its
  // flush to complete BEFORE ending the session. This pins the ordering that
  // broke on CI (fast server: capture leaves the queue pre-wrap-up, and
  // wrap-up must surface it from the merged payload instead). Local servers
  // were slow enough that the promote click always beat the flush, which
  // masked the bug.
  const flushDone = page.waitForResponse(
    (r) =>
      r.url().includes("/captures") &&
      r.request().method() === "POST" &&
      r.ok() &&
      // Attendance marks flush to the same endpoint — only a flush that
      // actually carries our capture counts.
      (r.request().postData() ?? "").includes('"kind":"glow"'),
  );
  await page.locator('[data-testid^="player-chip-"]').first().click();
  await page.getByTestId("capture-glow").first().click();
  await flushDone;

  // End -> wrap-up.
  await page.getByTestId("end-session").click();
  await expect(page.getByTestId("wrapup-step-attendance")).toBeVisible();
  await page.getByTestId("wrapup-next").click();
  await expect(page.getByTestId("wrapup-step-glows")).toBeVisible();
  await page.locator('[data-testid^="capture-promote-"]').first().click();
  await page.getByTestId("wrapup-next").click();
  await expect(page.getByTestId("wrapup-step-reflection")).toBeVisible();
  await page.getByTestId("finish-session").click();
  // Finish runs three sequential network calls (glows POST, capture flush,
  // completed PUT); under parallel-suite load the dev server has shown
  // 20-30s latencies, so give this step more than the 10s default.
  await expect(page.getByTestId("wrapup-done")).toBeVisible({ timeout: 60_000 });

  // Reload lands in read-only done state.
  await page.goto(`/coach/practices/${sessionId}/live`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await expect(page.getByTestId("wrapup-done")).toBeVisible();
});
