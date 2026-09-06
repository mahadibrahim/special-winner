/**
 * Task 9 of the 2026-09-06-camps-phase4 plan — the three e2e acceptance
 * specs for the camps phase:
 *
 *   1. Admin forms camp groups on the pod planner (auto-arrange → publish →
 *      persisted across reload).
 *   2. A materialized camp day-session shows on the venue command center and
 *      a camper can be checked in.
 *   3. A pod coach records a camp-day glow and the child's parent sees it on
 *      the family dashboard.
 *
 * Fixture: the "Test Summer Camp" season seeded by seed-e2e-tests.ts's
 * seedCampFixture (slug `e2e-test-summer-camp`, isTest, active, venue set,
 * 09:00–15:00, spans today−2 → today+5): two pods "Test Summer Camp Group
 * 1/2", confirmed camper registrations for Tommy Test (→ Group 1), Sarah
 * Test (→ Group 2), and Alex Test (deliberately unplaced).
 *
 * Season-id resolution is a direct DB lookup by the season's unique slug —
 * NOT via the admin seasons list UI/API: `GET /api/admin/seasons` hides
 * isTest rows unless `?include_test=1`, so navigating the list would never
 * find this fixture. Direct `page.goto` on the pods/venue routes works
 * regardless (they don't filter on isTest). Same direct-DB convention as
 * coach-classes.spec.ts's fixture resolution.
 *
 * Retry safety (CI runs with retries=2, and these specs only run in the
 * POST-merGE test-full job): every describe normalizes the server state it
 * asserts on in its own beforeAll, so a retry (or a second back-to-back run
 * without a reseed) starts from the same state as a fresh seed:
 *   - Spec 1 un-rosters Alex (the exact statement the seed's own
 *     defense-in-depth uses), so "sees the unplaced camper" holds even after
 *     a previous run published him into a group.
 *   - Spec 2 triggers the materialization cron (idempotent via the
 *     one-per-camp-day unique index) and nulls the target camper's
 *     checkedInAt, so the "Check in" click path always executes.
 *   - Spec 3 staffs the shared coach as pod coach (idempotent update; the
 *     seed's ensurePod never resets coachUserId) and writes a run-unique
 *     note text so the parent-side assertion is tied to THIS run's glow, not
 *     an ambient note from an earlier one.
 *
 * Shared-staging tolerance (the Task 8 category-pages lesson): every
 * assertion targets rows by OUR fixture names ("Test Summer Camp", "Alex
 * Test", …) and never asserts exact counts of board blocks / candidate rows.
 */
import { test, expect } from "@playwright/test";
import { and, asc, eq, gt, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, roles, userRoles } from "@/lib/db/schema/users";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations, organizations } from "@/lib/db/schema/organizations";
import { teams, venues, rosters } from "@/lib/db/schema/teams";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { coachNotes } from "@/lib/db/schema";
import { ensureVenueResources } from "@/lib/scheduling/blocks";
import { signIn, signInAsAdmin, waitForHydration, TEST_USERS } from "../utils/test-helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";
const CAMP_SEASON_SLUG = "e2e-test-summer-camp";
const CAMP_NAME = "Test Summer Camp";

interface CampFixture {
  seasonId: string;
  /** The venue the season currently points at (seed re-syncs it each run). */
  campVenueId: string;
  organizationId: string;
  timezone: string;
  parentUserId: string;
  children: Record<"tommy" | "sarah" | "alex", { familyMemberId: string; registrationId: string }>;
  pods: { teamId: string; name: string }[];
}

/**
 * Resolve the seeded camp fixture straight from the DB (see header — the
 * admin seasons list hides isTest rows, so id resolution must not go
 * through it). Throws with a run-the-seed hint on any missing piece.
 */
async function resolveCampFixture(): Promise<CampFixture> {
  const db = getDb();

  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, CAMP_SEASON_SLUG))
    .orderBy(asc(seasons.createdAt))
    .limit(1);
  if (!season || !season.venueId) {
    throw new Error(
      `camps.spec: camp season "${CAMP_SEASON_SLUG}" (with venue) is not seeded — run npm run db:seed:e2e`,
    );
  }

  const [ctx] = await db
    .select({
      organizationId: locations.organizationId,
      timezone: organizations.timezone,
    })
    .from(programs)
    .innerJoin(locations, eq(locations.id, programs.locationId))
    .innerJoin(organizations, eq(organizations.id, locations.organizationId))
    .where(eq(programs.id, season.programId))
    .orderBy(asc(programs.createdAt))
    .limit(1);
  if (!ctx) throw new Error("camps.spec: camp program/org chain missing — run npm run db:seed:e2e");

  const [parent] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, TEST_USERS.parent.email))
    .orderBy(asc(users.createdAt))
    .limit(1);
  if (!parent) {
    throw new Error(`camps.spec: ${TEST_USERS.parent.email} is not seeded — run npm run db:seed:e2e`);
  }

  async function child(firstName: string) {
    const [fm] = await getDb()
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(and(eq(familyMembers.parentUserId, parent.id), eq(familyMembers.firstName, firstName)))
      .orderBy(asc(familyMembers.createdAt))
      .limit(1);
    if (!fm) throw new Error(`camps.spec: child "${firstName}" missing — run npm run db:seed:e2e`);
    const [reg] = await getDb()
      .select({ id: registrations.id })
      .from(registrations)
      .where(and(eq(registrations.seasonId, season.id), eq(registrations.familyMemberId, fm.id)))
      .orderBy(asc(registrations.createdAt))
      .limit(1);
    if (!reg) {
      throw new Error(`camps.spec: camp registration for "${firstName}" missing — run npm run db:seed:e2e`);
    }
    return { familyMemberId: fm.id, registrationId: reg.id };
  }

  const pods = await db
    .select({ teamId: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.seasonId, season.id))
    .orderBy(asc(teams.name));
  if (pods.length < 2) {
    throw new Error("camps.spec: seeded camp groups missing — run npm run db:seed:e2e");
  }

  return {
    seasonId: season.id,
    campVenueId: season.venueId,
    organizationId: ctx.organizationId,
    timezone: ctx.timezone ?? "America/New_York",
    parentUserId: parent.id,
    children: {
      tommy: await child("Tommy"),
      sarah: await child("Sarah"),
      alex: await child("Alex"),
    },
    pods,
  };
}

/**
 * Trigger the (idempotent) materialization cron so the camp season's
 * Mon–Fri day-sessions + auto-bookings exist. Uses the same CRON_SECRET the
 * dev server was started with — locally `camps-cron` (the plan's :4333
 * server), in CI `ci-cron-test-secret` (ci.yml top-level env, shared by the
 * webServer and the test process).
 */
async function triggerCampMaterialization(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/cron/materialize-class-sessions`, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  });
  if (!res.ok) {
    throw new Error(
      `camps.spec: materialization cron returned ${res.status} — is CRON_SECRET set to the dev server's value? (${await res.text()})`,
    );
  }
}

/** First still-relevant camp day-session (endsAt in the future), soonest
 *  first — "today's" session on a weekday run, Monday's on a weekend run
 *  (camps materialize Mon–Fri only, so a literal "today" doesn't exist on
 *  Sat/Sun). */
async function firstUpcomingCampSession(seasonId: string) {
  const [session] = await getDb()
    .select()
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.campSeasonId, seasonId),
        eq(dropInSessions.status, "scheduled"),
        gt(dropInSessions.endsAt, new Date()),
      ),
    )
    .orderBy(asc(dropInSessions.startsAt))
    .limit(1);
  if (!session) {
    throw new Error("camps.spec: no upcoming camp day-session — did the materialization cron run?");
  }
  return session;
}

/** The board's ?date= param is the location's civil date, not the UTC date. */
function civilDate(instant: Date, timezone: string): string {
  return instant.toLocaleDateString("en-CA", { timeZone: timezone });
}

// ─────────────────────────────────────────────────────────────────────────────
// Spec 1 — Admin forms camp groups: sees the unplaced camper, auto-arranges,
// publishes, and the placement survives a reload.
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Camp group planner — auto-arrange and publish", () => {
  test.setTimeout(120_000);

  let fixture: CampFixture;

  test.beforeAll(async () => {
    fixture = await resolveCampFixture();

    // Normalize: this spec MUTATES seed state (publish places Alex), and CI
    // retries / back-to-back runs must still see the fixture's documented
    // first-run shape. Un-roster Alex server-side — the exact statement the
    // seed's own defense-in-depth block runs — so "sees the unplaced camper"
    // below is a real assertion on every run, not just the first.
    await getDb()
      .delete(rosters)
      .where(eq(rosters.registrationId, fixture.children.alex.registrationId));
  });

  test("admin sees the unplaced camper, auto-arranges, publishes, and the arrangement persists", async ({
    page,
  }) => {
    await signInAsAdmin(page);

    await page.goto(`/admin/seasons/${fixture.seasonId}/pods`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(page.getByTestId("pod-planner")).toBeVisible({ timeout: 15_000 });

    // Candidate rows load client-side; the fixture's three campers must all
    // list (ambient-tolerant: filter by OUR names, never assert row counts).
    const alexRow = page.getByTestId("camper-row").filter({ hasText: "Alex Test" });
    await expect(alexRow).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("camper-row").filter({ hasText: "Tommy Test" })).toBeVisible();
    await expect(page.getByTestId("camper-row").filter({ hasText: "Sarah Test" })).toBeVisible();

    // Alex is the seeded UNPLACED camper — his group select starts empty
    // (guaranteed by the beforeAll normalization above).
    await expect(alexRow.locator("select")).toHaveValue("");

    // Strategy could have been published as anything by a prior run (the
    // planner re-loads the season's saved strategy) — pin it to "age" so
    // Auto-arrange is enabled and deterministic.
    await page.getByTestId("strategy-picker").selectOption("age");
    await page.getByTestId("auto-arrange").click();

    // Draft state: every camper — Alex included — now has a group (2 pods x
    // max 12 comfortably fit the fixture's 3 campers).
    await expect(alexRow.locator("select")).not.toHaveValue("");

    await page.getByTestId("publish-pods").click();
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: "Camp groups published." }),
    ).toBeVisible({ timeout: 15_000 });

    // Reload — the point is that the publish persisted server-side (the
    // planner re-seeds its draft from PUBLISHED membership on load), not
    // just that local React state flipped.
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const alexRowAfter = page.getByTestId("camper-row").filter({ hasText: "Alex Test" });
    await expect(alexRowAfter).toBeVisible({ timeout: 30_000 });
    await expect(alexRowAfter.locator("select")).not.toHaveValue("");

    // And he shows inside a camp-group column's member list.
    await expect(
      page.getByTestId("pod-column").filter({ hasText: "Alex Test" }),
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Spec 2 — The materialized camp day shows as a block on the venue command
// center, its detail panel names the campers, and check-in works.
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Venue command center — camp block + camper check-in", () => {
  test.setTimeout(120_000);

  let fixture: CampFixture;
  let boardDate: string;
  let boardLocationId: string;

  test.beforeAll(async () => {
    fixture = await resolveCampFixture();
    const db = getDb();

    // The board can only column-place sessions whose location has
    // venue_resources rows ("Field N") — on a resource-less venue the camp
    // block maps to spaceId "unknown" and never renders on the day grid.
    // The seed does this too (Task 9 fix), but re-assert here so a retry
    // without a reseed can't regress it. Idempotent.
    await ensureVenueResources(fixture.campVenueId);

    // Materialize the camp's day-sessions + auto-book the campers (idempotent
    // — the one-per-camp-day unique index and the any-status booking check
    // make re-runs no-ops).
    await triggerCampMaterialization();

    // Normalize staging drift: day-sessions materialized by an EARLIER run
    // froze whatever venue the season carried then, and a re-seed can
    // re-point the season at a different venue while the one-per-camp-day
    // unique index keeps the old rows. Re-align them with the season's
    // current venue so board location, resources, and roster all agree.
    await db
      .update(dropInSessions)
      .set({ venueId: fixture.campVenueId })
      .where(
        and(
          eq(dropInSessions.campSeasonId, fixture.seasonId),
          ne(dropInSessions.venueId, fixture.campVenueId),
        ),
      );

    const session = await firstUpcomingCampSession(fixture.seasonId);
    boardDate = civilDate(session.startsAt, fixture.timezone);

    const [sessionVenue] = await db
      .select({ locationId: venues.locationId })
      .from(venues)
      .where(eq(venues.id, session.venueId))
      .limit(1);
    if (!sessionVenue) {
      throw new Error("camps.spec: camp day-session venue row missing — staging data drift?");
    }
    boardLocationId = sessionVenue.locationId;

    // The auto-booking sweep must have seated Sarah on this day — fail loudly
    // here rather than deep inside the UI flow if it didn't.
    const [booking] = await db
      .select({ id: dropInBookings.id })
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, session.id),
          eq(dropInBookings.familyMemberId, fixture.children.sarah.familyMemberId),
        ),
      )
      .orderBy(asc(dropInBookings.createdAt))
      .limit(1);
    if (!booking) {
      throw new Error("camps.spec: Sarah was not auto-booked onto the camp day — cron sweep failed?");
    }

    // Normalize: a prior run (or retry) already checked Sarah in, and
    // check-in is idempotent server-side — null the stamp so the "Check in"
    // button click path actually executes on every run.
    await db
      .update(dropInBookings)
      .set({ checkedInAt: null })
      .where(eq(dropInBookings.id, booking.id));
  });

  test("admin opens the camp block and checks a camper in", async ({ page }) => {
    await signInAsAdmin(page);

    // ?locationId pins the board to the camp venue's location (admin@test is
    // super_admin, which is what the override is scoped to); ?date targets
    // the first upcoming camp day — "today" on weekday runs, Monday on
    // weekend runs (camps are Mon–Fri only).
    await page.goto(`/admin/venue?date=${boardDate}&locationId=${boardLocationId}`, {
      waitUntil: "domcontentloaded",
    });
    await waitForHydration(page);

    // The camp block renders on the board (staging's /api/admin/venue/today
    // aggregation is slow — same generous budget as venue-command-center.spec).
    const campBlock = page
      .locator("[data-activity-block]")
      .filter({ hasText: CAMP_NAME })
      .first();
    await expect(campBlock).toBeVisible({ timeout: 60_000 });

    // Center it first so AdminLayout's sticky header can't intercept the
    // click (same workaround as venue-command-center.spec.ts).
    await campBlock.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await campBlock.click();

    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByRole("heading", { name: CAMP_NAME })).toBeVisible();
    // The kind label proves the camp branch (not drop-in/class) rendered.
    await expect(panel.getByText(/Camp ·/)).toBeVisible();

    // Roster names the CHILD (commit c4905d6c fixed the parent-name bug this
    // fixture exposed), and her row is check-in-able.
    const sarahRow = panel.getByTestId("roster-row").filter({ hasText: "Sarah Test" });
    await expect(sarahRow).toBeVisible({ timeout: 15_000 });

    await sarahRow.getByRole("button", { name: "Check in" }).click();

    // Checked-in state: the row flips to "✓ Here" + the chip.
    await expect(sarahRow.getByText("✓ Here")).toBeVisible({ timeout: 15_000 });
    await expect(sarahRow.getByText("checked in ✓")).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Spec 3 — A pod coach records a camp-day glow; the child's parent sees it on
// the family dashboard. Mirrors the class-glows acceptance describe in
// coach-classes.spec.ts, with the camp staffing model in front of it.
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Coach records a camp-day glow; parent sees it on the family dashboard", () => {
  test.setTimeout(120_000);

  let fixture: CampFixture;
  // Run-unique note text: Tommy is a SHARED seeded child, so ambient
  // "Great effort today" notes from earlier runs already exist on the
  // parent dashboard — only a unique string proves THIS run's glow made
  // the trip (coach-classes.spec.ts sidesteps this with a throwaway child;
  // here the fixture children are fixed by the seed).
  const noteText = `Camp glow e2e ${Date.now()}`;

  test.beforeAll(async () => {
    fixture = await resolveCampFixture();
    const db = getDb();

    // Resolve the seeded org coach (same lookup shape as coach-classes.spec).
    const [coach] = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(users.email, TEST_USERS.coach.email),
          eq(roles.name, "coach"),
          eq(userRoles.scopeType, "organization"),
          eq(userRoles.scopeId, fixture.organizationId),
        ),
      )
      .orderBy(asc(userRoles.createdAt))
      .limit(1);
    if (!coach) {
      throw new Error(
        `camps.spec: ${TEST_USERS.coach.email} is not a seeded org coach — run npm run db:seed:e2e`,
      );
    }

    // Staff the coach as LEAD POD COACH of Group 1. The seed deliberately
    // leaves pods unstaffed, and of the two staffing models Task 6 supports
    // (day-session `class_session` assignment / pod coach), the pod-coach
    // path is the one only THIS phase introduced — getCoachGroups path B and
    // the glows endpoint's pod branch both key on teams.coachUserId under
    // campSeasonId. Idempotent: the seed's ensurePod never resets
    // coachUserId, so re-runs and retries see the same state.
    await db
      .update(teams)
      .set({ coachUserId: coach.id })
      .where(eq(teams.id, fixture.pods[0].teamId));

    // Day-sessions + camper auto-bookings must exist (idempotent cron).
    await triggerCampMaterialization();

    // The coach UI lists sessions with startsAt >= now (an in-progress camp
    // day intentionally drops off) — a future weekday always exists inside
    // the seeded today−2 → today+5 span, but fail loudly if not.
    const [upcoming] = await db
      .select({ id: dropInSessions.id })
      .from(dropInSessions)
      .where(
        and(
          eq(dropInSessions.campSeasonId, fixture.seasonId),
          eq(dropInSessions.status, "scheduled"),
          gt(dropInSessions.startsAt, new Date(Date.now() + 60_000)),
        ),
      )
      .orderBy(asc(dropInSessions.startsAt))
      .limit(1);
    if (!upcoming) {
      throw new Error("camps.spec: no future camp day-session for the coach UI — cron failed?");
    }
  });

  test.afterAll(async () => {
    // Remove this run's (and any prior run's) camp-session glow notes for the
    // shared child so the parent dashboard doesn't accumulate test residue.
    if (fixture) {
      await getDb()
        .delete(coachNotes)
        .where(
          and(
            eq(coachNotes.familyMemberId, fixture.children.tommy.familyMemberId),
            eq(coachNotes.activityKind, "camp_session"),
          ),
        );
    }
  });

  test("pod coach gives a camper a glow from Camp days; the parent sees it", async ({ page }) => {
    await signIn(page, TEST_USERS.coach.email, TEST_USERS.coach.password);

    await page.goto("/coach/classes", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // The Camp days section lists the coach's upcoming camp day-sessions —
    // filter by OUR camp's label (ambient-tolerant), take the soonest.
    const campCard = page.getByTestId("camp-day-card").filter({ hasText: CAMP_NAME }).first();
    await expect(campCard).toBeVisible({ timeout: 15_000 });

    await campCard.getByTestId("camp-glows-open").click();

    // Glows modal roster = the day's confirmed bookings (Tommy, Sarah, Alex
    // were all auto-booked from their confirmed registrations).
    const tommyRow = page.getByTestId("class-glows-child-row").filter({ hasText: "Tommy Test" });
    await expect(tommyRow).toBeVisible({ timeout: 15_000 });

    await tommyRow.getByRole("button", { name: "Great effort today", exact: true }).click();
    await tommyRow.getByPlaceholder("Add a note for the family (optional)").fill(noteText);

    await page.getByTestId("class-glows-save").click();
    await expect(page.getByText("Shared with parents.")).toBeVisible({ timeout: 15_000 });

    // Same browser, new session: the parent account the seed owns Tommy
    // under. The glow rides coach_notes anchored activityKind='camp_session'
    // — the parent surface filters purely by familyMemberId+visibleToParent
    // and is anchor-agnostic, which is exactly what this proves.
    await signIn(page, TEST_USERS.parent.email, TEST_USERS.parent.password);
    await page.goto("/dashboard/family", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // CoachNotes renders client:visible — its IntersectionObserver-gated
    // hydration (and note fetch) only fires once the section actually enters
    // the viewport. The shared parent@ dashboard is heavy with ambient
    // staging content that keeps loading in and shifting layout, so a single
    // scrollIntoViewIfNeeded can land and then be pushed back out before the
    // observer fires — re-scroll until the note is visible.
    await expect(async () => {
      await page.getByRole("heading", { name: "Coach Notes" }).scrollIntoViewIfNeeded();
      await expect(page.getByText(noteText).first()).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
  });
});
