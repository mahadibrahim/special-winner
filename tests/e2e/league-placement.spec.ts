/**
 * Task P4 of the 2026-09-05-league-ops-phase2 plan: end-to-end coverage for
 * the roster placement planner (src/components/admin/placement/placement-planner.tsx),
 * its route (src/pages/admin/seasons/[id]/placement.astro), and the P3
 * endpoints it drives (GET .../placement, POST .../placements).
 *
 * Fixture: a fresh league season inside the seeded admin's org
 * (createAdminOrgGameContext — same recipe tests/api/leagues/placement.test.ts
 * uses), with 4 confirmed registrations seeded directly via DB insert (no
 * Stripe in CI — ci-api-tests-have-no-stripe precedent). Own throwaway
 * fixtures, not shared across describes.
 *
 * Flow: auto-draft splits the 4 confirmed regs 2/2 across the season's two
 * teams (draftPlacements is deterministic — see draft-placements.ts's
 * tie-break doc), move one player to the other team via its row select
 * (making it 3/1), publish, then reload the page to confirm the publish
 * persisted server-side (not just optimistic client state): the unplaced
 * list is empty and the two team-column counts read 3 and 1. Also spot-check
 * via the request API that the 4 placed registrations no longer show up as
 * "available" (GET /api/admin/rosters?teamId=... — that endpoint returns
 * confirmed-but-unrostered registrations for the team's season, so their
 * absence confirms the roster rows now exist).
 */
import { test, expect, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { programs, seasons } from "@/lib/db/schema/programs";
import { sports, ageGroups } from "@/lib/db/schema/sports";
import { teams, venues } from "@/lib/db/schema/teams";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import { users } from "@/lib/db/schema/users";
import { createAdminOrgGameContext } from "../utils/admin-org-game-context";
import { signIn, waitForHydration, expectToast, TEST_USERS } from "../utils/test-helpers";

test.describe("Admin roster placement planner", () => {
  test.setTimeout(120_000);

  let seasonId: string;
  let homeTeamId: string;
  let awayTeamId: string;
  let programId: string;
  let venueId: string;
  let sportId: string;
  let ageGroupId: string | null;

  const createdRegistrationIds: string[] = [];
  const createdFamilyMemberIds: string[] = [];
  const createdUserIds: string[] = [];

  async function seedConfirmedRegistration(index: number): Promise<string> {
    const db = getDb();
    const suffix = `${Date.now()}-${index}-${Math.floor(Math.random() * 1e6)}`;

    const [user] = await db
      .insert(users)
      .values({
        email: `league-placement-${suffix}@test.example`,
        passwordHash: "x",
        firstName: "Parent",
        lastName: `Placement${suffix}`,
      })
      .returning();
    createdUserIds.push(user.id);

    const [member] = await db
      .insert(familyMembers)
      .values({
        parentUserId: user.id,
        firstName: `Player${index}`,
        lastName: `Placement${suffix}`,
        birthDate: "2015-06-01",
      })
      .returning();
    createdFamilyMemberIds.push(member.id);

    const [reg] = await db
      .insert(registrations)
      .values({
        seasonId,
        familyMemberId: member.id,
        registeredByUserId: user.id,
        status: "confirmed",
        paymentStatus: "paid",
        amountPaidCents: 10000,
        amountDueCents: 10000,
        registrationType: "full",
        waiverSigned: true,
      })
      .returning();
    createdRegistrationIds.push(reg.id);

    return reg.id;
  }

  test.beforeAll(async () => {
    const ctx = await createAdminOrgGameContext({ programType: "league", audienceType: "parents" });
    seasonId = ctx.seasonId;
    homeTeamId = ctx.homeTeamId;
    awayTeamId = ctx.awayTeamId;
    programId = ctx.programId;
    venueId = ctx.venueId;

    const db = getDb();
    const [programRow] = await db
      .select({ sportId: programs.sportId })
      .from(programs)
      .where(eq(programs.id, programId));
    sportId = programRow.sportId;

    const [seasonRow] = await db
      .select({ ageGroupId: seasons.ageGroupId })
      .from(seasons)
      .where(eq(seasons.id, seasonId));
    ageGroupId = seasonRow?.ageGroupId ?? null;

    await Promise.all([
      seedConfirmedRegistration(1),
      seedConfirmedRegistration(2),
      seedConfirmedRegistration(3),
      seedConfirmedRegistration(4),
    ]);
  });

  test.afterAll(async () => {
    const db = getDb();
    // FK-safe order: registrations first (RESTRICT on familyMemberId /
    // registeredByUserId AND the target of seasons.id's own RESTRICT via
    // registrations.seasonId — a season can't be deleted while registrations
    // still reference it). Deleting a registration cascades away any roster
    // row it holds (rosters.registrationId is ON DELETE CASCADE), so no
    // separate roster cleanup is needed even though publish() writes rows.
    if (createdRegistrationIds.length > 0) {
      await db.delete(registrations).where(inArray(registrations.id, createdRegistrationIds));
    }
    if (createdFamilyMemberIds.length > 0) {
      await db.delete(familyMembers).where(inArray(familyMembers.id, createdFamilyMemberIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    // Season cascades away its teams/games/any remaining roster rows
    // (teams.seasonId and games.seasonId are ON DELETE CASCADE).
    if (seasonId) {
      await db.delete(seasons).where(eq(seasons.id, seasonId));
    }
    if (programId) {
      await db.delete(programs).where(eq(programs.id, programId));
    }
    // Sport is ON DELETE RESTRICT from programs, so it must go after the
    // program that references it.
    if (sportId) {
      await db.delete(sports).where(eq(sports.id, sportId));
    }
    if (ageGroupId) {
      await db.delete(ageGroups).where(eq(ageGroups.id, ageGroupId));
    }
    if (venueId) {
      await db.delete(venues).where(eq(venues.id, venueId));
    }
    // Explicit team cleanup as a belt-and-suspenders in case the season
    // delete above ever changes shape — harmless no-op once season cascade
    // has already removed them.
    await db.delete(teams).where(inArray(teams.id, [homeTeamId, awayTeamId]));
  });

  test("admin auto-drafts, adjusts, and publishes roster placements @critical", async ({
    page,
  }: {
    page: Page;
  }) => {
    await signIn(page, TEST_USERS.admin.email, TEST_USERS.admin.password);

    await page.goto(`/admin/seasons/${seasonId}/placement`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(page.getByTestId("placement-planner")).toBeVisible();

    await page.getByTestId("auto-draft").click();

    const rows = page.getByTestId("placement-row");
    await expect(rows).toHaveCount(4);

    // Read each row's drafted team assignment straight from its <select>.
    const rowCount = await rows.count();
    const teamOfRow: string[] = [];
    for (let i = 0; i < rowCount; i++) {
      teamOfRow.push(await rows.nth(i).locator("select").inputValue());
    }
    const countByTeam = new Map<string, number>();
    for (const t of teamOfRow) countByTeam.set(t, (countByTeam.get(t) ?? 0) + 1);
    expect(countByTeam.size).toBe(2);
    expect([...countByTeam.values()].sort()).toEqual([2, 2]);
    expect(new Set(countByTeam.keys())).toEqual(new Set([homeTeamId, awayTeamId]));

    // Move the first row onto the other team, making the split 3/1.
    const firstRowSelect = rows.nth(0).locator("select");
    const currentTeam = await firstRowSelect.inputValue();
    const targetTeam = currentTeam === homeTeamId ? awayTeamId : homeTeamId;
    await firstRowSelect.selectOption(targetTeam);

    const expectedCounts = new Map<string, number>([
      [targetTeam, 3],
      [currentTeam, 1],
    ]);

    await page.getByTestId("publish-placements").click();
    await expectToast(page, /published/i);

    // Reload — this confirms the publish persisted server-side rather than
    // just updating optimistic client state.
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(page.getByTestId("placement-row")).toHaveCount(0);

    const columns = page.getByTestId("team-column");
    await expect(columns).toHaveCount(2);
    const columnCount = await columns.count();
    for (let i = 0; i < columnCount; i++) {
      const column = columns.nth(i);
      const teamId = await column.getAttribute("data-team-id");
      const countText = (await column.getByTestId("team-count").textContent())?.trim();
      expect(countText).toBe(String(expectedCounts.get(teamId as string)));
    }

    // Request-API spot check: the 4 now-placed registrations no longer show
    // up as available (confirmed-but-unrostered) for this season, confirming
    // the roster rows exist server-side.
    const availableRes = await page.request.get(`/api/admin/rosters?teamId=${homeTeamId}`);
    expect(availableRes.ok()).toBe(true);
    const availableBody = await availableRes.json();
    const availableIds = new Set(
      (availableBody.availablePlayers ?? []).map((p: { id: string }) => p.id),
    );
    for (const regId of createdRegistrationIds) {
      expect(availableIds.has(regId)).toBe(false);
    }
  });
});

test.describe("Admin roster placement planner — scaffold from empty state", () => {
  test.setTimeout(120_000);

  /**
   * F2 fix (post-review): the planner's zero-team EmptyState used to
   * dead-end at "Back to season hub" with no way to create teams. This
   * scenario covers the new inline scaffold form end to end: a season with
   * NO pre-scaffolded teams (createAdminOrgGameContext always mints a
   * home/away pair as part of its game fixture, so those two are deleted
   * right after minting to get a genuine zero-team season) → scaffold form
   * visible → set count 2 → submit → team columns appear → auto-draft →
   * publish works. Own throwaway fixtures, not shared with the describe
   * above.
   */
  let seasonId: string;
  let programId: string;
  let venueId: string;
  let sportId: string;
  let ageGroupId: string | null;

  const createdRegistrationIds: string[] = [];
  const createdFamilyMemberIds: string[] = [];
  const createdUserIds: string[] = [];

  async function seedConfirmedRegistration(index: number): Promise<string> {
    const db = getDb();
    const suffix = `${Date.now()}-${index}-${Math.floor(Math.random() * 1e6)}`;

    const [user] = await db
      .insert(users)
      .values({
        email: `league-placement-scaffold-${suffix}@test.example`,
        passwordHash: "x",
        firstName: "Parent",
        lastName: `Scaffold${suffix}`,
      })
      .returning();
    createdUserIds.push(user.id);

    const [member] = await db
      .insert(familyMembers)
      .values({
        parentUserId: user.id,
        firstName: `Player${index}`,
        lastName: `Scaffold${suffix}`,
        birthDate: "2015-06-01",
      })
      .returning();
    createdFamilyMemberIds.push(member.id);

    const [reg] = await db
      .insert(registrations)
      .values({
        seasonId,
        familyMemberId: member.id,
        registeredByUserId: user.id,
        status: "confirmed",
        paymentStatus: "paid",
        amountPaidCents: 10000,
        amountDueCents: 10000,
        registrationType: "full",
        waiverSigned: true,
      })
      .returning();
    createdRegistrationIds.push(reg.id);

    return reg.id;
  }

  test.beforeAll(async () => {
    const ctx = await createAdminOrgGameContext({ programType: "league", audienceType: "parents" });
    seasonId = ctx.seasonId;
    programId = ctx.programId;
    venueId = ctx.venueId;

    const db = getDb();
    const [programRow] = await db
      .select({ sportId: programs.sportId })
      .from(programs)
      .where(eq(programs.id, programId));
    sportId = programRow.sportId;

    const [seasonRow] = await db
      .select({ ageGroupId: seasons.ageGroupId })
      .from(seasons)
      .where(eq(seasons.id, seasonId));
    ageGroupId = seasonRow?.ageGroupId ?? null;

    // Delete the home/away pair the context fixture always mints so the
    // season genuinely starts at zero teams — the scenario under test is
    // "no pre-scaffolded teams".
    await db.delete(teams).where(inArray(teams.id, [ctx.homeTeamId, ctx.awayTeamId]));

    await Promise.all([seedConfirmedRegistration(1), seedConfirmedRegistration(2)]);
  });

  test.afterAll(async () => {
    const db = getDb();
    if (createdRegistrationIds.length > 0) {
      await db.delete(registrations).where(inArray(registrations.id, createdRegistrationIds));
    }
    if (createdFamilyMemberIds.length > 0) {
      await db.delete(familyMembers).where(inArray(familyMembers.id, createdFamilyMemberIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    // Season cascades away any teams scaffolded during the test itself,
    // plus the game row (games.seasonId is ON DELETE CASCADE).
    if (seasonId) {
      await db.delete(seasons).where(eq(seasons.id, seasonId));
    }
    if (programId) {
      await db.delete(programs).where(eq(programs.id, programId));
    }
    if (sportId) {
      await db.delete(sports).where(eq(sports.id, sportId));
    }
    if (ageGroupId) {
      await db.delete(ageGroups).where(eq(ageGroups.id, ageGroupId));
    }
    if (venueId) {
      await db.delete(venues).where(eq(venues.id, venueId));
    }
  });

  test("admin scaffolds teams from the empty planner, then auto-drafts and publishes @critical", async ({
    page,
  }: {
    page: Page;
  }) => {
    await signIn(page, TEST_USERS.admin.email, TEST_USERS.admin.password);

    await page.goto(`/admin/seasons/${seasonId}/placement`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(page.getByTestId("placement-planner")).toBeVisible();

    // Zero-team empty state renders the scaffold form, not a dead-end link.
    await expect(page.getByTestId("scaffold-form")).toBeVisible();
    await expect(page.getByTestId("team-column")).toHaveCount(0);

    await page.getByTestId("scaffold-count").fill("2");
    await page.getByTestId("scaffold-submit").click();
    await expectToast(page, /teams created/i);

    // Planner refetches placement data on success — team columns now appear
    // and the scaffold form is gone.
    await expect(page.getByTestId("team-column")).toHaveCount(2);
    await expect(page.getByTestId("scaffold-form")).toHaveCount(0);

    await page.getByTestId("auto-draft").click();
    const rows = page.getByTestId("placement-row");
    await expect(rows).toHaveCount(2);

    await page.getByTestId("publish-placements").click();
    await expectToast(page, /published/i);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(page.getByTestId("placement-row")).toHaveCount(0);
    const columns = page.getByTestId("team-column");
    await expect(columns).toHaveCount(2);
    let totalPlaced = 0;
    const columnCount = await columns.count();
    for (let i = 0; i < columnCount; i++) {
      const countText = (await columns.nth(i).getByTestId("team-count").textContent())?.trim();
      // Text is "N" or "N / cap" (the scaffold form's default max roster size
      // is 12) — only the leading number matters here.
      totalPlaced += Number(countText?.match(/^\d+/)?.[0] ?? NaN);
    }
    expect(totalPlaced).toBe(2);
  });
});
