import { test, expect, type BrowserContext } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

/**
 * Glows & Grows — post-session capture-to-parent flow
 * (docs/superpowers/specs/2026-07-09-glows-and-grows-design.md).
 *
 * A coach picks praise/growth chips per rostered player right after a
 * session at /coach/practices/[id]/glows, then shares them; the parent
 * sees the same chip text on their family dashboard's Coach Notes section.
 *
 * Cookie note: Playwright's per-fixture `request` does NOT share cookies
 * with the test body's `page` — we use `browser.newContext()` instead, same
 * pattern as tests/e2e/site-announcement.spec.ts. Serial because the coach
 * setup (session creation) in beforeAll must run before either test, and
 * the second test re-signs-in as parent on the same shared context.
 *
 * Roster fixture: "E2E Test Team" (seed-e2e-tests.ts) is the coach's only
 * team with a non-empty roster and carries exactly one active rostered
 * player — Tommy Test, jersey #7 — whose parent IS the seeded parent
 * account (parent@test.aspiresports.com). So giving every rostered player
 * a glow (the loop below, defensive if the fixture ever grows) always
 * covers the seeded parent's child, satisfying the "give glows to ALL
 * players" fallback without needing a special case.
 */

// UNIVERSAL_GLOWS[0] in src/lib/curriculum/reinforcement.ts — a
// sport-agnostic chip always present regardless of session content, so
// this doesn't depend on which skills the created session focused on.
const GLOW_CHIP = "Great effort today";

test.describe.configure({ mode: "serial" });

test.describe("Glows & Grows", () => {
  let ctx: BrowserContext;
  let sessionId: string;

  test.beforeAll(async ({ browser, baseURL }) => {
    ctx = await browser.newContext();

    const signin = await ctx.request.post(`${baseURL}/api/auth/signin`, {
      data: { email: "coach@test.aspiresports.com", password: "TestCoach123!" },
    });
    expect(signin.ok()).toBeTruthy();

    const teamsRes = await ctx.request.get(`${baseURL}/api/coach/teams`);
    expect(teamsRes.ok()).toBeTruthy();
    const { teams } = (await teamsRes.json()) as {
      teams: { id: string; rosterCount: number }[];
    };
    const team = teams.find((t) => t.rosterCount > 0);
    if (!team) {
      throw new Error(
        "No coach team with a non-empty roster found — seed data missing or changed",
      );
    }

    const rosterRes = await ctx.request.get(
      `${baseURL}/api/coach/teams/${team.id}/roster`,
    );
    expect(rosterRes.ok()).toBeTruthy();
    const { roster } = (await rosterRes.json()) as { roster: unknown[] };
    if (roster.length === 0) {
      throw new Error(
        "Team reported rosterCount > 0 but roster endpoint returned no players",
      );
    }

    const sessionRes = await ctx.request.post(`${baseURL}/api/coach/sessions`, {
      data: {
        teamId: team.id,
        title: "Glows E2E Session",
        scheduledDate: new Date().toISOString(),
        durationMinutes: 30,
        status: "planned",
      },
    });
    expect(sessionRes.ok()).toBeTruthy();
    const { session } = (await sessionRes.json()) as { session: { id: string } };
    sessionId = session.id;
  });

  test.afterAll(async ({ baseURL }) => {
    // Session DELETE nulls coach_notes.sessionPlanId (onDelete: "set null" —
    // src/lib/db/schema/teams.ts) rather than removing the notes, and there
    // is no notes-delete API. The glow/grow coach_notes rows this spec
    // creates remain in the shared staging DB as residue; deleting the
    // session at least removes the session-plan-shaped fixture it owns.
    if (sessionId) {
      await ctx.request.delete(`${baseURL}/api/coach/sessions/${sessionId}`);
    }
    await ctx.close();
  });

  test("coach captures and shares glows", async ({ baseURL }) => {
    const page = await ctx.newPage();
    await page.goto(`${baseURL}/coach/practices/${sessionId}/glows`, {
      waitUntil: "domcontentloaded",
    });
    await waitForHydration(page);

    // First-player capture screen: progress indicator visible.
    await expect(page.getByText(/^1 of \d+$/)).toBeVisible();

    // Give every rostered player the universal glow chip, advancing via
    // Next/Review — no Skip needed since we want every player (and the
    // fixture's seeded parent's child) covered.
    let guard = 0;
    while (guard++ < 20) {
      await page
        .getByRole("button", { name: GLOW_CHIP, exact: true })
        .click();
      const nextButton = page.getByRole("button", { name: /^(Next|Review)$/ });
      const label = (await nextButton.textContent())?.trim();
      await nextButton.click();
      if (label === "Review") break;
    }
    expect(guard).toBeLessThan(20);

    // Review screen — summary + share action.
    await expect(page.getByText("Ready to share")).toBeVisible();
    await page.getByRole("button", { name: /^Share with parents/ }).click();

    // Success screen.
    await expect(
      page.getByText(/player(?:'s|s') famil(?:y|ies)/i),
    ).toBeVisible({ timeout: 15000 });

    await page.close();
  });

  test("parent sees the glow", async ({ baseURL }) => {
    const signin = await ctx.request.post(`${baseURL}/api/auth/signin`, {
      data: { email: "parent@test.aspiresports.com", password: "TestParent123!" },
    });
    expect(signin.ok()).toBeTruthy();

    const page = await ctx.newPage();
    await page.goto(`${baseURL}/dashboard/family`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // CoachNotes renders client:visible — scroll it into view so its
    // IntersectionObserver-gated hydration (and note fetch) actually fires.
    const coachNotesHeading = page.getByRole("heading", { name: "Coach Notes" });
    await coachNotesHeading.scrollIntoViewIfNeeded();

    // Residue from prior runs of this spec (session DELETE nulls
    // sessionPlanId but never removes the note rows — see afterAll) means
    // more than one matching note can be present; assert on the first.
    await expect(page.getByText(GLOW_CHIP).first()).toBeVisible({ timeout: 15000 });

    await page.close();
  });
});
