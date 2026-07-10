import { test, expect, type Page } from "@playwright/test";
import {
  TEST_USERS,
  signIn,
  waitForPageLoad,
  waitForHydration,
} from "../utils/test-helpers";

test.describe("Coach Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEST_USERS.coach.email, TEST_USERS.coach.password);
  });

  test.describe("Dashboard Overview", () => {
    test("displays coach dashboard", async ({ page }) => {
      await page.goto("/coach");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/coach/);
      // Look for any heading or content indicating coach dashboard
      const heading = page.locator("h1, h2").filter({ hasText: /coach|dashboard|team/i }).first();
      const navItem = page.locator("[role='navigation'], nav").first();

      await expect(heading.or(navItem).first()).toBeVisible({ timeout: 15000 });
    });

    test("shows assigned teams", async ({ page }) => {
      await page.goto("/coach");
      await waitForPageLoad(page);

      // Should show teams section
      await expect(
        page.locator("text=/team|roster/i").first()
      ).toBeVisible();
    });

    test("shows upcoming sessions or practices", async ({ page }) => {
      await page.goto("/coach");
      await waitForPageLoad(page);

      // Should show schedule or upcoming
      await expect(
        page.locator("text=/upcoming|schedule|session|practice/i").first()
      ).toBeVisible();
    });
  });

  test.describe("Team Management", () => {
    // CoachTeams (src/components/coach/coach-teams.tsx) renders each team's
    // roster link as /coach/roster/[teamId] — there is no /coach/teams/[id]
    // page. These tests previously clicked a[href*="/coach/teams/"], which
    // matched nothing, so both assertions silently no-op'd on every run.
    // The seeded coach always has a team, so the links are asserted
    // unconditionally rather than count-guarded.
    test("can view team roster", async ({ page }) => {
      await page.goto("/coach/teams");
      await waitForPageLoad(page);

      const rosterLink = page.locator('a[href^="/coach/roster/"]');
      await expect(rosterLink.first()).toBeVisible({ timeout: 15000 });
      await rosterLink.first().click();
      await waitForPageLoad(page);

      // Should land on the team's roster page
      expect(page.url()).toMatch(/\/coach\/roster\//);
    });

    test("shows player list in team", async ({ page }) => {
      await page.goto("/coach/teams");
      await waitForPageLoad(page);

      const rosterLink = page.locator('a[href^="/coach/roster/"]');
      await expect(rosterLink.first()).toBeVisible({ timeout: 15000 });
      await rosterLink.first().click();
      await waitForPageLoad(page);

      // Should show roster/players. RosterTable fetches its data client-side
      // after mount (spinner until then); under a fully-parallel local run
      // all workers share one dev server + the remote staging DB, so the
      // fetch can take well over 10s — hence the generous timeout.
      await expect(
        page.locator("text=/roster|player|member/i").first()
      ).toBeVisible({ timeout: 30000 });
    });
  });

  test.describe("Assessment Nudge", () => {
    test("nudge deep links target the assess page when present", async ({ page }) => {
      await page.goto("/coach");
      await waitForPageLoad(page);

      // The nudge only renders when the seeded coach has due/overdue/never
      // players — assert conditionally, like the roster tests above.
      const nudge = page.locator('[data-testid="assessment-nudge"]');
      if ((await nudge.count()) > 0) {
        const link = nudge.locator('a[href*="/coach/assess/"]').first();
        await expect(link).toBeVisible();
        const href = await link.getAttribute("href");
        expect(href).toMatch(/\/coach\/assess\/[0-9a-f-]+\?teamId=[0-9a-f-]+/);
      }
    });
  });

  test.describe("Attendance Tracking", () => {
    // The real attendance UI lives at /coach/attendance/[teamId] — there is no
    // bare /coach/attendance index (navigating there 404s). Coaches reach it
    // from My Teams, where CoachTeams renders a native <a> "Attendance" link per
    // team. The seeded coach heads "E2E Test Team" (exact — a distinct
    // "E2E Test Team 2" also exists, with no roster) which has one rostered
    // player, Tommy Test (#7).
    const TEAM_NAME = "E2E Test Team";

    /**
     * Navigate from My Teams to the seeded team's attendance page.
     * The team-card links are native anchors (server-rendered, actionable
     * before hydration); the attendance page's status controls are React-driven,
     * so we wait for its hydration beacon before interacting.
     */
    async function openTeamAttendance(page: Page) {
      await page.goto("/coach/teams");
      await waitForPageLoad(page);

      // Exact-text filter so we don't match the sibling "E2E Test Team 2" card.
      const teamCard = page
        .locator("div.grid > div")
        .filter({ has: page.getByText(TEAM_NAME, { exact: true }) });
      await expect(teamCard).toHaveCount(1, { timeout: 15000 });

      await teamCard.getByRole("link", { name: /attendance/i }).click();
      await expect(page).toHaveURL(/\/coach\/attendance\/[0-9a-f-]{36}/i);
      await waitForHydration(page);
      // Hydration only means the component mounted — the roster arrives via an
      // async /api/coach/attendance fetch, and the first hit after server boot
      // pays route-compile + cold-query cost. Wait for the marking row so every
      // test starts from a fully-rendered table.
      await expect(markingRow(page)).toBeVisible({ timeout: 30000 });
    }

    // The page renders two tables that both list Tommy: the mark-attendance
    // table (with status buttons) and a history/stats table. Scope to the
    // marking row structurally — it is the one that contains the status buttons.
    function markingRow(page: Page) {
      return page.getByRole("row").filter({ has: page.getByRole("button", { name: "Present" }) });
    }

    test("navigates from My Teams to a team's attendance page", async ({ page }) => {
      await openTeamAttendance(page);

      // The tracker rendered its real roster — not a 404 or empty state.
      await expect(markingRow(page).getByText("Tommy Test")).toBeVisible();
    });

    test("shows the roster with per-player status controls", async ({ page }) => {
      await openTeamAttendance(page);

      const playerRow = markingRow(page);
      await expect(playerRow).toBeVisible({ timeout: 15000 });

      // Four status controls per player, each labeled by its title attribute.
      for (const status of ["Present", "Absent", "Late", "Excused"]) {
        await expect(playerRow.getByRole("button", { name: status })).toBeVisible();
      }
    });

    test("can set a player's attendance status", async ({ page }) => {
      await openTeamAttendance(page);

      const playerRow = markingRow(page);
      await expect(playerRow).toBeVisible({ timeout: 15000 });
      const absentButton = playerRow.getByRole("button", { name: "Absent" });

      // Selecting a status updates local state only — the DB write happens on
      // Save, which we deliberately never click, keeping this test read-only.
      await absentButton.click();
      await expect(absentButton).toHaveClass(/bg-destructive\/10/);
    });
  });

  test.describe("Practice Planning", () => {
    // The practice tools live at /coach/practices (list) and
    // /coach/practices/new (planner). The old spec navigated to
    // /coach/sessions[/new] — routes that have never existed — and asserted
    // only that <body> was visible, so it passed against a 404.
    test("practices overview shows session stats and a New Session link", async ({ page }) => {
      await page.goto("/coach/practices");
      await waitForPageLoad(page);
      await waitForHydration(page);

      // PracticesOverview stat cards render after its client-side fetch;
      // generous timeout for shared-dev-server cold starts (see the
      // Attendance block's comment above).
      await expect(page.getByText("Today's Sessions")).toBeVisible({ timeout: 30000 });
      await expect(page.locator('a[href="/coach/practices/new"]').first()).toBeVisible();
    });

    test("practice planner form has the required title field", async ({ page }) => {
      await page.goto("/coach/practices/new");
      await waitForPageLoad(page);

      await expect(page.getByText("Session Title *")).toBeVisible({ timeout: 30000 });
    });
  });

  test.describe("Player Development", () => {
    // The old spec navigated to /coach/development, which has never existed.
    // Player development lives at /coach/assessments.
    test("assessments overview lists players with stats", async ({ page }) => {
      await page.goto("/coach/assessments");
      await waitForPageLoad(page);

      // CoachAssessmentsOverview renders after a client-side fetch (no
      // hydration beacon on this island — wait on real content instead).
      await expect(page.getByText("Total Players")).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole("heading", { name: "Players" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Recent Assessments" })).toBeVisible();
    });
  });

  test.describe("Resources", () => {
    test("shows the curriculum library with sport guides and minibooks", async ({ page }) => {
      await page.goto("/coach/resources");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/coach\/resources/);
      // Server-rendered curriculum sections — real content, not just <body>.
      await expect(page.getByRole("heading", { name: "Sport Guides" })).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole("heading", { name: "Skill Minibooks" })).toBeVisible();
    });
  });
});

test.describe("Coach Authorization", () => {
  test("non-coach cannot access coach pages", async ({ page }) => {
    await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);

    await page.goto("/coach");

    // Should redirect to dashboard with error
    await expect(page.url()).toMatch(/\/(dashboard|signin)/);
  });

  test("admin can access coach pages", async ({ page }) => {
    await signIn(page, TEST_USERS.admin.email, TEST_USERS.admin.password);

    await page.goto("/coach");

    // Admin should be able to access (may redirect to admin though)
    await expect(page.url()).toMatch(/\/(coach|admin)/);
  });
});
