import { test, expect, type BrowserContext } from "@playwright/test";
import { TEST_USERS, waitForHydration, waitForPageLoad } from "../utils/test-helpers";

/**
 * Program Blueprint — director composes/distributes, coach receives
 * (Program Blueprint T11). See "Testing" § e2e in
 * docs/superpowers/specs/2026-07-10-program-blueprint-design.md:
 *
 *   "director composes a 2-slot camp arc → warn appears on an off-stage
 *   template and is dismissed → distributes → coach sees the badged
 *   planned session on their practices list with the dashboard
 *   notification card."
 *
 * --- Fixture design (the critical decision this spec makes) ---
 * The obvious move is to reuse the seeded "E2E Test Team" / "E2E Test
 * Spring 2026" season the coach already owns (same fixture coach-glows.spec.ts
 * and coach-dashboard.spec.ts drive). That season turns out to be
 * unusable here: tests/api/admin/blueprint-attach.test.ts (and its sibling
 * suites) create fresh seasons/teams under the coach's own account on
 * every CI/local run and never delete them ("team deletion requires
 * super-admin access and isn't worth the extra fixture wiring for a
 * test-only row" — see that file), so the coach's session history has
 * accumulated hundreds of `planned` sessions dated 2026-11-07/11-14.
 * GET /api/coach/sessions orders `desc(scheduledDate) limit(50)`
 * (src/pages/api/coach/sessions/index.ts) and PracticesOverview fetches
 * with `limit=50` — so any session we distribute onto the shared season
 * (which runs Aug–Nov 2026) sorts BELOW that residue and never even
 * reaches the client, making the practices-list assertion flaky-to-never
 * depending on how much residue has piled up.
 *
 * Fix: build a dedicated season + team (owned by the coach, via the same
 * admin API calls the API-test suites already use) with a start date far
 * in the future (2027) — guaranteed to sort above all 2026 residue in the
 * `desc(scheduledDate)` fetch regardless of how much accumulates. This
 * mirrors the established convention in blueprint-attach.test.ts et al.
 * (season/team left behind, not deleted — regular org admin/team-delete
 * wiring isn't worth it for a test-only row) while making the coach-side
 * assertions deterministic instead of residue-dependent.
 *
 * The WARN-tier template reuses the exact fixture shape
 * tests/api/admin/blueprint-bootstrap.test.ts already proved: a template
 * whose `activitySuggestions` resolve to "Passing Combinations"
 * (appropriateStages: ["skill-building"] — src/lib/curriculum/content/soccer/activities.ts)
 * attached to a "fundamentals" (U8) season triggers a non-blocking stage-skew
 * WARN with no safety-flagged skill involved, so there's no BLOCK-tier risk
 * to route around.
 *
 * Serial + shared BrowserContext (same pattern as coach-glows.spec.ts):
 * fixture setup and cleanup run as admin; the coach-side test re-signs-in
 * on the same context.
 */

test.describe.configure({ mode: "serial" });

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const SEASON_NAME = `Blueprint E2E Season ${RUN_ID}`;
const SEASON_SLUG = `blueprint-e2e-season-${RUN_ID}`;
const TEAM_NAME = `Blueprint E2E Team ${RUN_ID}`;
const TEMPLATE_NAME = `Blueprint E2E Template ${RUN_ID}`;
const SEQUENCE_NAME = `Blueprint E2E Sequence ${RUN_ID}`;
// Far enough past all known residue (accumulated fixture sessions from
// other Program Blueprint API suites sit in 2026-11) that this always
// sorts first in the coach's desc(scheduledDate) session list.
const SEASON_START = "2027-06-07";
const SEASON_END = "2027-08-07";

test.describe("Program Blueprint", () => {
  let ctx: BrowserContext;
  let programId: string;
  let sportId: string;
  let fundamentalsStageId: string;
  let coachUserId: string;
  let seasonId: string;
  let teamId: string;
  let templateId: string;
  let sequenceId: string | null = null;

  test.beforeAll(async ({ browser, baseURL }) => {
    ctx = await browser.newContext();

    const adminSignin = await ctx.request.post(`${baseURL}/api/auth/signin`, {
      data: { email: TEST_USERS.admin.email, password: TEST_USERS.admin.password },
    });
    expect(adminSignin.ok()).toBeTruthy();

    // The seeded soccer program the coach's fixture teams already live
    // under (src/lib/db/seeds/seed-e2e-tests.ts) — reused for its sport,
    // not its season (see the fixture-design comment above).
    const programsRes = await ctx.request.get(`${baseURL}/api/admin/programs`);
    expect(programsRes.ok()).toBeTruthy();
    const { programs } = (await programsRes.json()) as {
      programs: { id: string; slug: string; sport: { id: string } }[];
    };
    const program = programs.find((p) => p.slug === "e2e-test-soccer");
    if (!program) {
      throw new Error(
        "e2e fixture missing: program slug 'e2e-test-soccer' not found — seed data changed?",
      );
    }
    programId = program.id;
    sportId = program.sport.id;

    const templatesRes = await ctx.request.get(
      `${baseURL}/api/admin/curriculum/templates?sportId=${sportId}&limit=1`,
    );
    expect(templatesRes.ok()).toBeTruthy();
    const { stages } = (await templatesRes.json()) as {
      stages: { id: string; slug: string }[];
    };
    const fundamentals = stages.find((s) => s.slug === "fundamentals");
    if (!fundamentals) {
      throw new Error("e2e fixture missing: 'fundamentals' development stage not seeded");
    }
    fundamentalsStageId = fundamentals.id;

    const usersRes = await ctx.request.get(
      `${baseURL}/api/admin/users?search=${encodeURIComponent(TEST_USERS.coach.email)}`,
    );
    expect(usersRes.ok()).toBeTruthy();
    const { users } = (await usersRes.json()) as { users: { id: string; email: string }[] };
    const coachUser = users.find((u) => u.email === TEST_USERS.coach.email);
    if (!coachUser) {
      throw new Error(`e2e fixture missing: user ${TEST_USERS.coach.email} not found`);
    }
    coachUserId = coachUser.id;

    // Dedicated season (U8 / fundamentals band, matching the seeded coach
    // fixture's own age group) far in the future — see fixture-design
    // comment for why 2027, not the shared 2026 season.
    const seasonRes = await ctx.request.post(`${baseURL}/api/admin/seasons`, {
      data: {
        programId,
        name: SEASON_NAME,
        slug: SEASON_SLUG,
        startDate: SEASON_START,
        endDate: SEASON_END,
        priceCents: 15000,
        status: "draft",
        minAge: 6,
        maxAge: 8,
      },
    });
    expect(seasonRes.ok()).toBeTruthy();
    seasonId = (await seasonRes.json()).season.id;

    // Coach-owned team so distribution lands squarely on a group the
    // coach actually coaches (the fixture requirement the design doc
    // flags as critical).
    const teamRes = await ctx.request.post(`${baseURL}/api/admin/teams`, {
      data: { seasonId, name: TEAM_NAME, coachUserId },
    });
    expect(teamRes.ok()).toBeTruthy();
    teamId = (await teamRes.json()).team.id;

    // WARN-tier (never BLOCK) template: "Passing Combinations" is tagged
    // appropriateStages: ["skill-building"] with no safety-flagged skill
    // (src/lib/curriculum/content/soccer/activities.ts) — attached to this
    // fundamentals-band season it triggers a pure stage-skew warning, the
    // exact fixture shape tests/api/admin/blueprint-bootstrap.test.ts uses.
    const templateRes = await ctx.request.post(
      `${baseURL}/api/admin/curriculum/templates`,
      {
        data: {
          sportId,
          stageId: fundamentalsStageId,
          name: TEMPLATE_NAME,
          totalDurationMinutes: 45,
          structure: [
            {
              name: "Combination play",
              type: "technical",
              durationMinutes: 20,
              activitySuggestions: ["Passing Combinations"],
            },
          ],
        },
      },
    );
    expect(templateRes.ok()).toBeTruthy();
    templateId = (await templateRes.json()).template.id;
  });

  test.afterAll(async ({ baseURL }) => {
    // Coach identity to delete the sessions this run distributed onto its
    // own dedicated team (fresh team — every session on it is ours).
    const coachSignin = await ctx.request.post(`${baseURL}/api/auth/signin`, {
      data: { email: TEST_USERS.coach.email, password: TEST_USERS.coach.password },
    });
    if (coachSignin.ok() && teamId) {
      const sessionsRes = await ctx.request.get(
        `${baseURL}/api/coach/sessions?teamId=${teamId}`,
      );
      if (sessionsRes.ok()) {
        const { sessions } = (await sessionsRes.json()) as { sessions: { id: string }[] };
        for (const s of sessions) {
          await ctx.request.delete(`${baseURL}/api/coach/sessions/${s.id}`);
        }
      }
    }

    const adminSignin = await ctx.request.post(`${baseURL}/api/auth/signin`, {
      data: { email: TEST_USERS.admin.email, password: TEST_USERS.admin.password },
    });
    if (adminSignin.ok()) {
      // Sequence delete cascades sequence_attachments + blueprint_warning_dismissals
      // (both ON DELETE CASCADE — src/lib/db/schema/blueprint.ts), so no
      // separate attachment/dismissal cleanup is needed.
      if (sequenceId) {
        await ctx.request.delete(
          `${baseURL}/api/admin/curriculum/sequences/${sequenceId}`,
        );
      }
      if (templateId) {
        await ctx.request.delete(
          `${baseURL}/api/admin/curriculum/templates/${templateId}`,
        );
      }
    }
    // Season/team are intentionally left in place — same convention as
    // tests/api/admin/blueprint-attach.test.ts (team deletion needs
    // super-admin wiring not worth adding for a test-only row).

    await ctx.close();
  });

  test("director composes, acknowledges a warning, and distributes", async ({ baseURL }) => {
    const page = await ctx.newPage();

    const signin = await page.request.post(`${baseURL}/api/auth/signin`, {
      data: { email: TEST_USERS.admin.email, password: TEST_USERS.admin.password },
    });
    expect(signin.ok()).toBeTruthy();

    await page.goto(`/admin/programs/${programId}/seasons/${seasonId}/blueprint`, {
      waitUntil: "domcontentloaded",
    });
    await waitForHydration(page, { timeout: 30000 });

    await expect(page.getByTestId("blueprint-workspace")).toBeVisible();

    // Fresh season — no sequence linked yet, so the picker always shows.
    const nameInput = page.getByPlaceholder("New sequence name");
    if (await nameInput.isVisible()) {
      await nameInput.fill(SEQUENCE_NAME);
      const createSeqResponse = page.waitForResponse(
        (r) =>
          r.url().includes("/api/admin/curriculum/sequences") &&
          r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Create new sequence" }).click();
      const seqRes = await createSeqResponse;
      const seqBody = await seqRes.json();
      sequenceId = seqBody.sequence.id;
    }

    // Arc composer only renders once a sequence is linked.
    await expect(page.getByPlaceholder("Search templates…")).toBeVisible({
      timeout: 30000,
    });

    // Add our WARN-fixture template from the rail — search narrows to the
    // one unique card so the click can't land on a seeded default template.
    await page.getByPlaceholder("Search templates…").fill(TEMPLATE_NAME);
    const templateCard = page
      .getByTestId("blueprint-template-card")
      .filter({ hasText: TEMPLATE_NAME });
    await expect(templateCard).toHaveCount(1, { timeout: 15000 });
    await templateCard.click();

    // WARN badge appears once the slot lands (server-evaluated against the
    // season's real fundamentals band) — expand + acknowledge it.
    const acknowledgeButton = page.getByRole("button", { name: "Acknowledge" });
    await expect(acknowledgeButton).toBeVisible({ timeout: 15000 });
    await acknowledgeButton.click();
    await expect(page.getByText("Stage-fit warning acknowledged")).toBeVisible({
      timeout: 10000,
    });

    // Distribute: settings (defaults from the season's own dates) -> preview -> confirm.
    await page.getByTestId("distribute-button").click();
    await expect(page.getByTestId("distribute-preview")).toBeVisible();
    await page.getByTestId("distribute-preview").click();

    await expect(page.getByTestId("distribute-summary")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("distribute-summary")).toContainText("session");

    const confirmButton = page.getByTestId("distribute-confirm");
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    // Results view: real session(s) created, no per-group error rows.
    await expect(page.getByTestId("distribute-done")).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/session.*created across 1 team/)).toBeVisible();
    await expect(page.getByText(/error/i)).toHaveCount(0);

    await page.getByTestId("distribute-done").click();
    await page.close();
  });

  test("coach sees the prescribed session and notification", async ({ baseURL }) => {
    const page = await ctx.newPage();

    const signin = await page.request.post(`${baseURL}/api/auth/signin`, {
      data: { email: TEST_USERS.coach.email, password: TEST_USERS.coach.password },
    });
    expect(signin.ok()).toBeTruthy();

    // Dashboard notification card (Task 5's "coach notification" —
    // src/components/coach/program-plan-card.tsx). No hydration beacon on
    // this page (CoachDashboardOverview doesn't call useHydrationBeacon —
    // see tests/e2e/coach-dashboard.spec.ts, which only ever uses
    // waitForPageLoad here), so poll on the testid with a generous timeout
    // instead.
    await page.goto("/coach", { waitUntil: "domcontentloaded" });
    await waitForPageLoad(page);
    await expect(page.getByTestId("program-plan-nudge")).toBeVisible({ timeout: 20000 });

    // Practices list badge (Task 9 — src/components/coach/prescribed-badge.tsx).
    // Filter the search box to our unique template name so the assertion
    // never depends on this session's position in a residue-heavy,
    // limit=50/desc(scheduledDate)-sorted list (see the fixture-design
    // comment above the describe block).
    await page.goto("/coach/practices", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await page.getByPlaceholder("Search sessions...").fill(TEMPLATE_NAME);

    const badge = page.getByTestId("prescribed-badge").first();
    await expect(badge).toBeVisible({ timeout: 15000 });
    await expect(badge).toContainText("Program plan · from");

    await page.close();
  });
});
