/**
 * Task 4 of the 2026-09-05-coach-classes-phase01 plan: admin staffing UI for
 * a class-slot template (`src/components/admin/classes/template-staffing.tsx`,
 * mounted on `src/pages/admin/classes/[id].astro`).
 *
 * Pins down the two write paths Task 3's endpoints expose to an admin:
 *   - `PUT /api/admin/classes/templates/:id/coaches` — the template's default
 *     lead/assistant set, persisted across a reload.
 *   - `PUT /api/admin/classes/sessions/:id/coaches` — a per-session override
 *     that does NOT touch the template's own default (per
 *     templates/[id]/coaches.ts's header comment: a plain template PUT
 *     without `applyToMaterialized` leaves already-materialized sessions
 *     alone).
 *
 * Fixture: a fresh `class_slot_templates` row (`Staffing-` prefix — swept by
 * `sweepOrphanedTestTemplates`/`cleanupTestClassFixtures`, same convention as
 * `tests/api/coaching/staffing.test.ts`) plus two future `drop_in_sessions`
 * rows inserted directly with `classSlotTemplateId` set — no cron/materializer
 * involved, mirroring `tests/api/coaching/staffing.test.ts`'s own fixture
 * shape. Two seeded org-scoped `coach`-role users
 * (coach@test.aspiresports.com, training+coach@test.aspiresports.com — same
 * fixtures staffing.test.ts resolves dynamically) stand in for "the lead" and
 * "the override", so a template-level vs. session-level change is visibly
 * distinguishable by name in the UI rather than by id alone.
 */
import { test, expect } from "@playwright/test";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, roles, userRoles } from "@/lib/db/schema/users";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { coachingAssignments } from "@/lib/db/schema/coaching";
import { coachNotes } from "@/lib/db/schema";
import { classEnrollments, classCreditGrants } from "@/lib/db/schema/classes";
import { familyMembers } from "@/lib/db/schema/registrations";
import { skills } from "@/lib/db/schema/curriculum";
import { sports } from "@/lib/db/schema/sports";
import { assessmentSnapshots, playerAssessments, playerSkillSummary } from "@/lib/db/schema/assessments";
import { resolveDefaultOrgForHttpTests } from "../utils/dropin-helpers";
import {
  createTestClassTemplate,
  cleanupTestClassFixtures,
  sweepOrphanedTestTemplates,
  createTestChild,
  createTestCreditGrant,
} from "../utils/classes-helpers";
import { createTestUserWithPassword } from "../utils/host-helpers";
import { signIn, waitForHydration, TEST_USERS } from "../utils/test-helpers";

test.describe("Admin class template staffing panel", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let venueId: string;
  let templateId: string;
  let sessionIdEarly: string;
  let sessionIdLate: string;
  let leadCoachId: string;
  let overrideCoachId: string;
  let overrideCoachName: string;

  const suffix = Date.now();
  const templateName = `Staffing-E2E-${suffix}`;

  test.beforeAll(async () => {
    ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());
    await sweepOrphanedTestTemplates(organizationId);

    const db = getDb();

    async function resolveCoach(email: string): Promise<{ id: string; name: string }> {
      const [row] = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(
          and(
            eq(users.email, email),
            eq(roles.name, "coach"),
            eq(userRoles.scopeType, "organization"),
            eq(userRoles.scopeId, organizationId),
          ),
        )
        .orderBy(asc(userRoles.createdAt))
        .limit(1);
      if (!row) {
        throw new Error(`coach-classes.spec: ${email} is not a seeded org coach — run npm run db:seed:e2e`);
      }
      return { id: row.id, name: [row.firstName, row.lastName].filter(Boolean).join(" ") };
    }

    const lead = await resolveCoach("coach@test.aspiresports.com");
    leadCoachId = lead.id;

    const override = await resolveCoach("training+coach@test.aspiresports.com");
    overrideCoachId = override.id;
    overrideCoachName = override.name;

    templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: templateName,
      capacity: 10,
    });

    const startsAtEarly = new Date(Date.now() + 3 * 86_400_000);
    const startsAtLate = new Date(Date.now() + 5 * 86_400_000);
    const [early] = await db
      .insert(dropInSessions)
      .values({
        organizationId,
        venueId,
        kind: "class",
        sportOrClassLabel: "Soccer",
        startsAt: startsAtEarly,
        endsAt: new Date(startsAtEarly.getTime() + 55 * 60_000),
        capacity: 10,
        classSlotTemplateId: templateId,
      })
      .returning();
    sessionIdEarly = early.id;

    const [late] = await db
      .insert(dropInSessions)
      .values({
        organizationId,
        venueId,
        kind: "class",
        sportOrClassLabel: "Soccer",
        startsAt: startsAtLate,
        endsAt: new Date(startsAtLate.getTime() + 55 * 60_000),
        capacity: 10,
        classSlotTemplateId: templateId,
      })
      .returning();
    sessionIdLate = late.id;
  });

  test.afterAll(async () => {
    const db = getDb();
    const sessionIds = [sessionIdEarly, sessionIdLate].filter(Boolean);
    if (sessionIds.length > 0) {
      await db
        .delete(coachingAssignments)
        .where(and(eq(coachingAssignments.kind, "class_session"), inArray(coachingAssignments.targetId, sessionIds)));
      await db.delete(dropInSessions).where(inArray(dropInSessions.id, sessionIds));
    }
    if (templateId) {
      await db
        .delete(coachingAssignments)
        .where(and(eq(coachingAssignments.kind, "class_template"), eq(coachingAssignments.targetId, templateId)));
      await cleanupTestClassFixtures([templateId]);
    }
  });

  test("admin sets the template's default lead, it persists across reload, and a per-session override doesn't clobber the template default", async ({
    page,
  }) => {
    await signIn(page, TEST_USERS.admin.email, TEST_USERS.admin.password);

    await page.goto(`/admin/classes/${templateId}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const panel = page.getByTestId("staffing-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    const leadSelect = page.getByTestId("staffing-lead-select");
    await expect(leadSelect).toBeVisible();
    await leadSelect.selectOption(leadCoachId);

    await page.getByTestId("staffing-save").click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Staffing saved" })).toBeVisible({
      timeout: 10_000,
    });

    // Reload — the point of this assertion is that the PUT actually
    // persisted server-side, not just local React state.
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expect(page.getByTestId("staffing-lead-select")).toHaveValue(leadCoachId);

    // Two future materialized sessions inserted by the fixture — both must
    // list, ordered soonest-first, and each shows "Unassigned" until staffed
    // (they were inserted directly, bypassing the materializer's
    // copy-from-template step).
    const rows = page.getByTestId("session-staffing-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("Unassigned");

    // Override the first (earliest) session's lead without touching the
    // template's default — templates/[id]/coaches.ts's header comment: a
    // plain template PUT (no applyToMaterialized) never touches an
    // already-materialized session, and there's no reverse sync either.
    await rows.first().getByTestId("session-staffing-change").click();
    const sessionLeadSelect = rows.first().getByTestId("session-staffing-lead-select");
    await expect(sessionLeadSelect).toBeVisible();
    await sessionLeadSelect.selectOption(overrideCoachId);
    await rows.first().getByTestId("session-staffing-save").click();

    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Session staffing updated" })).toBeVisible({
      timeout: 10_000,
    });

    // The overridden row now names the override coach; the template's own
    // lead-select default is untouched (still the original lead).
    await expect(rows.first()).toContainText(overrideCoachName);
    await expect(rows.first()).not.toContainText("Unassigned");
    await expect(page.getByTestId("staffing-lead-select")).toHaveValue(leadCoachId);

    // The second (untouched) session is still unstaffed — the override only
    // ever targeted the one row.
    await expect(rows.nth(1)).toContainText("Unassigned");
  });
});

/**
 * Task 5 of the same plan: the coach-portal "My Classes" list
 * (`/coach/classes`) and its roster/session detail
 * (`/coach/classes/:templateId`) — the surfaces coaches actually use, as
 * opposed to the admin staffing panel above.
 */
test.describe("Coach portal — My Classes + roster", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let venueId: string;
  let assignedCoachId: string;
  let portalTemplateId: string;
  let portalSessionId: string;
  let childId: string;
  let grantId: string;
  let enrollmentId: string;
  // Minted fresh per run (beforeAll below) rather than resolving the shared
  // training+coach@test.aspiresports.com fixture — see that beforeAll's
  // comment for why.
  let unassignedCoachEmail: string;
  let unassignedCoachPassword: string;

  const portalSuffix = Date.now();
  const portalTemplateName = `Portal-E2E-${portalSuffix}`;
  const portalChildFirstName = `Portal-E2E-Child-${portalSuffix}`;

  test.beforeAll(async () => {
    ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());
    await sweepOrphanedTestTemplates(organizationId);

    const db = getDb();

    const [assignedCoach] = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(users.email, TEST_USERS.coach.email),
          eq(roles.name, "coach"),
          eq(userRoles.scopeType, "organization"),
          eq(userRoles.scopeId, organizationId),
        ),
      )
      .orderBy(asc(userRoles.createdAt))
      .limit(1);
    if (!assignedCoach) {
      throw new Error(
        `coach-classes.spec (portal): ${TEST_USERS.coach.email} is not a seeded org coach — run npm run db:seed:e2e`,
      );
    }
    assignedCoachId = assignedCoach.id;

    // The empty-state test below needs a coach-role user that genuinely has
    // ZERO class assignments. That used to be the shared
    // training+coach@test.aspiresports.com fixture, "cleaned" by a blanket
    // `coachingAssignments.active = false` update scoped only to that
    // coach's userId — not to any template/session this describe owns.
    // playwright.config.ts is fullyParallel, so this file's describes can
    // run in different workers concurrently, and the Admin describe above
    // resolves that SAME email as its per-session override target
    // (`overrideCoachId`) and assigns it mid-test via the UI. The two raced
    // in both directions: this blanket deactivation could fire after the
    // Admin describe's override write and silently undo it out from under
    // that test's "shows the override coach's name" assertion, while an
    // Admin-describe override landing after this beforeAll (but before this
    // file's empty-state test ran) would give the "unassigned" coach a real
    // active class_session assignment and break the `toHaveCount(0)`
    // assertion below.
    //
    // A dedicated, run-unique user sidesteps both directions: it starts with
    // zero assignments by construction and no other describe in this file
    // (or any sibling suite) ever references its id. Same throwaway-user
    // convention as `createTestUserWithPassword` elsewhere in this file
    // (e.g. the Glows describe's throwaway parent below); the coach role is
    // granted org-scoped exactly the way seed-e2e-tests.ts grants the shared
    // coach fixtures' roles.
    const throwawayCoach = await createTestUserWithPassword();
    unassignedCoachEmail = throwawayCoach.email;
    unassignedCoachPassword = throwawayCoach.password;

    const [coachRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "coach"))
      .limit(1);
    if (!coachRole) {
      throw new Error("coach-classes.spec (portal): 'coach' role is missing — run npm run db:seed:e2e");
    }
    await db.insert(userRoles).values({
      userId: throwawayCoach.userId,
      roleId: coachRole.id,
      scopeType: "organization",
      scopeId: organizationId,
    });

    const [parent] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, TEST_USERS.parent.email))
      .limit(1);
    if (!parent) {
      throw new Error(
        `coach-classes.spec (portal): ${TEST_USERS.parent.email} is not seeded — run npm run db:seed:e2e`,
      );
    }

    portalTemplateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: portalTemplateName,
      capacity: 10,
    });

    const [assignment] = await db
      .insert(coachingAssignments)
      .values({
        organizationId,
        coachUserId: assignedCoachId,
        kind: "class_template",
        targetId: portalTemplateId,
        role: "lead",
      })
      .returning();
    void assignment;

    childId = await createTestChild(parent.id, portalChildFirstName);

    grantId = await createTestCreditGrant({
      organizationId,
      familyMemberId: childId,
      sessionsGranted: 10,
      idSuffix: `portal-e2e-${portalSuffix}`,
    });

    const [enrollment] = await db
      .insert(classEnrollments)
      .values({
        slotTemplateId: portalTemplateId,
        familyMemberId: childId,
        creditGrantId: grantId,
        status: "active",
      })
      .returning();
    enrollmentId = enrollment.id;

    const startsAt = new Date(Date.now() + 4 * 86_400_000);
    const [session] = await db
      .insert(dropInSessions)
      .values({
        organizationId,
        venueId,
        kind: "class",
        sportOrClassLabel: "Soccer",
        startsAt,
        endsAt: new Date(startsAt.getTime() + 55 * 60_000),
        capacity: 10,
        classSlotTemplateId: portalTemplateId,
      })
      .returning();
    portalSessionId = session.id;
  });

  test.afterAll(async () => {
    const db = getDb();
    if (portalSessionId) {
      await db.delete(dropInSessions).where(eq(dropInSessions.id, portalSessionId));
    }
    if (portalTemplateId) {
      await db
        .delete(coachingAssignments)
        .where(
          and(eq(coachingAssignments.kind, "class_template"), eq(coachingAssignments.targetId, portalTemplateId)),
        );
    }
    if (enrollmentId) {
      await db.delete(classEnrollments).where(eq(classEnrollments.id, enrollmentId));
    }
    if (grantId) {
      await db.delete(classCreditGrants).where(eq(classCreditGrants.id, grantId));
    }
    if (childId) {
      await db.delete(familyMembers).where(eq(familyMembers.id, childId));
    }
    if (portalTemplateId) {
      await cleanupTestClassFixtures([portalTemplateId]);
    }
  });

  test("assigned coach sees the class on My Classes, opens it, and sees the enrolled child + upcoming session", async ({
    page,
  }) => {
    await signIn(page, TEST_USERS.coach.email, TEST_USERS.coach.password);

    await page.goto("/coach/classes", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const card = page.getByTestId("my-class-card").filter({ hasText: portalTemplateName });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();

    await expect(page).toHaveURL(new RegExp(`/coach/classes/${portalTemplateId}$`));
    await waitForHydration(page);

    const rosterRow = page.getByTestId("class-roster-row");
    await expect(rosterRow.filter({ hasText: portalChildFirstName })).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId("class-session-row")).toHaveCount(1);
  });

  test("a coach with no class assignments sees the empty state on My Classes", async ({ page }) => {
    await signIn(page, unassignedCoachEmail, unassignedCoachPassword);

    await page.goto("/coach/classes", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(page.getByTestId("my-class-card")).toHaveCount(0);
    await expect(page.getByText(/no classes assigned yet/i)).toBeVisible({ timeout: 15_000 });
  });
});

/**
 * Task 6 of the same plan: the payoff acceptance test for the whole
 * coach->classes phase. A coach with a `class_template` assignment opens a
 * class session's Glows & Grows panel (`class-glows.tsx`, mounted via
 * `class-roster.tsx`'s per-session "Glows & grows" button), gives the
 * fixture child a glow, and saves via `POST
 * /api/coach/class-sessions/:id/glows`. The write anchors the `coach_notes`
 * row on `activityKind: 'class_session'` + `activityId`, NOT `teamId`
 * (Task 1's dual-anchor migration) — this spec proves that anchor is
 * invisible to the read side: signing in as the child's parent and loading
 * `/dashboard/family`'s Coach Notes section (`coach-notes.tsx` +
 * `GET /api/family/coach-notes`) shows the exact same glow, with ZERO
 * changes to either of those parent-facing files in this branch's diff —
 * they already filter purely by `familyMemberId` + `visibleToParent`.
 *
 * Fixture: a throwaway parent + child (`createTestUserWithPassword` —
 * never the shared parent@test.aspiresports.com account, same rationale as
 * classes-dashboard.spec.ts) booked `confirmed` into a fresh class
 * session under a fresh template the seeded coach is assigned to lead.
 */
test.describe("Coach records a class-session glow; parent sees it on the family dashboard", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let venueId: string;
  let assignedCoachId: string;
  let templateId: string;
  let sessionId: string;
  let childId: string;
  let bookingId: string;
  let parentEmail: string;
  let parentPassword: string;
  let parentUserId: string;

  const suffix = Date.now();
  const templateName = `ClassGlowsE2E-${suffix}`;
  const childFirstName = `ClassGlowsE2E-Child-${suffix}`;

  test.beforeAll(async () => {
    ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());
    await sweepOrphanedTestTemplates(organizationId);

    const db = getDb();

    const [assignedCoach] = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(users.email, TEST_USERS.coach.email),
          eq(roles.name, "coach"),
          eq(userRoles.scopeType, "organization"),
          eq(userRoles.scopeId, organizationId),
        ),
      )
      .orderBy(asc(userRoles.createdAt))
      .limit(1);
    if (!assignedCoach) {
      throw new Error(
        `coach-classes.spec (glows): ${TEST_USERS.coach.email} is not a seeded org coach — run npm run db:seed:e2e`,
      );
    }
    assignedCoachId = assignedCoach.id;

    templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: templateName,
      capacity: 10,
    });

    await db.insert(coachingAssignments).values({
      organizationId,
      coachUserId: assignedCoachId,
      kind: "class_template",
      targetId: templateId,
      role: "lead",
    });

    const throwawayParent = await createTestUserWithPassword();
    parentEmail = throwawayParent.email;
    parentPassword = throwawayParent.password;
    parentUserId = throwawayParent.userId;

    childId = await createTestChild(parentUserId, childFirstName);

    const startsAt = new Date(Date.now() + 3 * 86_400_000);
    const [session] = await db
      .insert(dropInSessions)
      .values({
        organizationId,
        venueId,
        kind: "class",
        sportOrClassLabel: "Soccer",
        startsAt,
        endsAt: new Date(startsAt.getTime() + 55 * 60_000),
        capacity: 10,
        classSlotTemplateId: templateId,
      })
      .returning();
    sessionId = session.id;

    const [booking] = await db
      .insert(dropInBookings)
      .values({
        sessionId,
        userId: parentUserId,
        familyMemberId: childId,
        status: "confirmed",
        source: "online_booking",
        paymentMethod: "member_allotment",
      })
      .returning();
    bookingId = booking.id;
  });

  test.afterAll(async () => {
    const db = getDb();
    if (sessionId) {
      await db
        .delete(coachNotes)
        .where(and(eq(coachNotes.activityKind, "class_session"), eq(coachNotes.activityId, sessionId)));
    }
    if (bookingId) {
      await db.delete(dropInBookings).where(eq(dropInBookings.id, bookingId));
    }
    if (sessionId) {
      await db.delete(dropInSessions).where(eq(dropInSessions.id, sessionId));
    }
    if (templateId) {
      await db
        .delete(coachingAssignments)
        .where(and(eq(coachingAssignments.kind, "class_template"), eq(coachingAssignments.targetId, templateId)));
      await cleanupTestClassFixtures([templateId]);
    }
    // childId/parentUserId are throwaway-user residue, same convention as
    // classes-dashboard.spec.ts's other throwaway-parent fixtures — left in
    // place rather than deleted.
  });

  test("coach gives the class child a glow; the parent sees the same glow on their dashboard", async ({ page }) => {
    await signIn(page, TEST_USERS.coach.email, TEST_USERS.coach.password);

    await page.goto(`/coach/classes/${templateId}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const sessionRow = page.getByTestId("class-session-row").filter({ hasText: childFirstName });
    await expect(sessionRow).toBeVisible({ timeout: 15_000 });

    await sessionRow.getByTestId("class-glows-open").click();

    const childRow = page.getByTestId("class-glows-child-row").filter({ hasText: childFirstName });
    await expect(childRow).toBeVisible({ timeout: 10_000 });
    await childRow.getByRole("button", { name: "Great effort today", exact: true }).click();

    await page.getByTestId("class-glows-save").click();
    await expect(page.getByText("Shared with parents.")).toBeVisible({ timeout: 15_000 });

    // Same page, new session: sign in as the child's parent — an account
    // this branch's coach/admin diff never touches — and confirm the glow
    // shows up on the untouched parent surface.
    await signIn(page, parentEmail, parentPassword);
    await page.goto("/dashboard/family", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // CoachNotes renders client:visible — scroll it into view so its
    // IntersectionObserver-gated hydration (and note fetch) actually fires.
    const coachNotesHeading = page.getByRole("heading", { name: "Coach Notes" });
    await coachNotesHeading.scrollIntoViewIfNeeded();

    await expect(page.getByText("Great effort today").first()).toBeVisible({ timeout: 15_000 });
  });
});

/**
 * Task 5 of the 2026-09-05-player-snapshots-phase3 plan — THE Phase 3
 * acceptance test: a class-context coach assesses an enrolled child from the
 * class roster (`class-roster.tsx`'s per-child "Assess" action, reusing
 * `player-assessment-form.tsx` via its new `classSport` prop — Task 5's
 * parameterization, no team/season involved), and the write shows up on the
 * child's OWN parent-facing development page
 * (`/dashboard/children/:id/development`, `development-report.tsx`),
 * completing the loop: class activity -> player_assessments ->
 * assessment_snapshots -> the parent-visible record.
 *
 * The domain radar (`DomainRadar`) only renders once >= 3 axes have data
 * (`domain-radar.tsx`'s MIN_AXES_WITH_DATA gate) — assessing 3 skills across
 * 3 domains through the UI just to trigger the SVG would test the radar's
 * existing threshold behavior (already covered by
 * tests/e2e/development-radar.spec.ts), not the new class-context write
 * path. The pragmatic assertion here is the single assessment's own skill
 * name and level surfacing in the report's "Recent Coach Assessments"
 * timeline, which renders unconditionally as soon as there's at least one
 * assessment — proof the class-context write reached the same read path a
 * team assessment would, without needing the 3-domain radar minimum.
 *
 * Fixture mirrors the "Coach records a class-session glow" describe above:
 * a fresh `Assess-`-prefixed template (swept by `sweepOrphanedTestTemplates`
 * per `TEST_TEMPLATE_NAME_PREFIXES`) the seeded coach leads, plus a
 * throwaway parent + child enrolled (not booked into any session — the
 * assessment flow reads the ENROLLED-children list, not session bookings).
 * The skill picker's sport comes from the roster endpoint's best-effort
 * `sportLabel` -> `sports.name` match (Task 5) — the template's default
 * "Soccer" label matches the org's seeded "Soccer" sport row, and
 * `seedCurriculumRadarFixture` (seed-e2e-tests.ts) guarantees an "E2E
 * Technical Skill" exists for that sport, so the test doesn't need to seed
 * its own skill.
 */
test.describe("Coach assesses a class child from the roster; parent sees it on the development page", () => {
  test.setTimeout(120_000);

  let organizationId: string;
  let venueId: string;
  let assignedCoachId: string;
  let templateId: string;
  let childId: string;
  let grantId: string;
  let enrollmentId: string;
  let parentEmail: string;
  let parentPassword: string;
  let parentUserId: string;

  const suffix = Date.now();
  const templateName = `Assess-E2E-${suffix}`;
  const childFirstName = `AssessE2E-Child-${suffix}`;
  const SKILL_NAME = "E2E Technical Skill";

  test.beforeAll(async () => {
    ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());
    await sweepOrphanedTestTemplates(organizationId);

    const db = getDb();

    const [assignedCoach] = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(users.email, TEST_USERS.coach.email),
          eq(roles.name, "coach"),
          eq(userRoles.scopeType, "organization"),
          eq(userRoles.scopeId, organizationId),
        ),
      )
      .orderBy(asc(userRoles.createdAt))
      .limit(1);
    if (!assignedCoach) {
      throw new Error(
        `coach-classes.spec (assess): ${TEST_USERS.coach.email} is not a seeded org coach — run npm run db:seed:e2e`,
      );
    }
    assignedCoachId = assignedCoach.id;

    // Confirm the seeded curriculum fixture this test depends on exists,
    // rather than letting a missing-skill failure surface confusingly deep
    // inside the UI flow below.
    const [skillRow] = await db
      .select({ id: skills.id })
      .from(skills)
      .innerJoin(sports, eq(skills.sportId, sports.id))
      .where(and(eq(sports.organizationId, organizationId), eq(sports.slug, "soccer"), eq(skills.name, SKILL_NAME)))
      .orderBy(asc(skills.createdAt))
      .limit(1);
    if (!skillRow) {
      throw new Error(
        `coach-classes.spec (assess): "${SKILL_NAME}" curriculum fixture is missing — run npm run db:seed:e2e`,
      );
    }

    templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: templateName,
      capacity: 10,
    });

    await db.insert(coachingAssignments).values({
      organizationId,
      coachUserId: assignedCoachId,
      kind: "class_template",
      targetId: templateId,
      role: "lead",
    });

    const throwawayParent = await createTestUserWithPassword();
    parentEmail = throwawayParent.email;
    parentPassword = throwawayParent.password;
    parentUserId = throwawayParent.userId;

    // Age matters here: PlayerAssessmentForm auto-selects a development
    // stage filter from playerAge as soon as the skill list loads (see its
    // `useEffect` keyed on `playerAge`/`stages`). The seeded "E2E ..."
    // skills (seedCurriculumRadarFixture) all sit in the "fundamentals"
    // stage (ages 6-8) — createTestChild's own default birthDate computes
    // to an age outside that range, which auto-selects a DIFFERENT stage
    // and filters the seeded skill out of the picker ("No skills found").
    // Age 7 keeps the auto-selected stage aligned with the fixture.
    childId = await createTestChild(parentUserId, childFirstName, "2019-01-01");

    grantId = await createTestCreditGrant({
      organizationId,
      familyMemberId: childId,
      sessionsGranted: 10,
      idSuffix: `assess-e2e-${suffix}`,
    });

    const [enrollment] = await db
      .insert(classEnrollments)
      .values({ slotTemplateId: templateId, familyMemberId: childId, creditGrantId: grantId, status: "active" })
      .returning();
    enrollmentId = enrollment.id;
  });

  test.afterAll(async () => {
    const db = getDb();
    if (childId) {
      await db.delete(assessmentSnapshots).where(eq(assessmentSnapshots.familyMemberId, childId));
      await db.delete(playerAssessments).where(eq(playerAssessments.familyMemberId, childId));
      await db.delete(playerSkillSummary).where(eq(playerSkillSummary.familyMemberId, childId));
    }
    if (templateId) {
      await db
        .delete(coachingAssignments)
        .where(and(eq(coachingAssignments.kind, "class_template"), eq(coachingAssignments.targetId, templateId)));
    }
    if (enrollmentId) {
      await db.delete(classEnrollments).where(eq(classEnrollments.id, enrollmentId));
    }
    if (grantId) {
      await db.delete(classCreditGrants).where(eq(classCreditGrants.id, grantId));
    }
    if (templateId) {
      await cleanupTestClassFixtures([templateId]);
    }
    // childId/parentUserId are throwaway-user residue, same convention as
    // the glows describe above — left in place rather than deleted.
  });

  test("coach assesses the class child; the parent sees the skill and level on the development page", async ({
    page,
  }) => {
    await signIn(page, TEST_USERS.coach.email, TEST_USERS.coach.password);

    await page.goto(`/coach/classes/${templateId}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const rosterRow = page.getByTestId("class-roster-row").filter({ hasText: childFirstName });
    await expect(rosterRow).toBeVisible({ timeout: 15_000 });

    await rosterRow.getByTestId("class-assess-open").click();

    // Skill picker loads asynchronously (parallel fetch of domains/stages/
    // skills, keyed off the roster endpoint's resolved `template.sport`).
    const searchInput = page.getByPlaceholder("Search skills...");
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await searchInput.fill(SKILL_NAME);

    await page.getByRole("button", { name: SKILL_NAME }).click();

    // Level grid: 1-5, each button rendering its number + a label (3 =
    // "Competent" default, 4 = "Proficient" — picking a non-default level
    // makes the parent-side assertion meaningfully tied to THIS submission
    // rather than incidentally matching a default value).
    await page.locator("button", { hasText: "Proficient" }).click();

    await page.getByTestId("class-assess-submit").click();
    await expect(page.getByText("Assessment saved!")).toBeVisible({ timeout: 15_000 });

    // Regression pin (review finding): the Save button must stay disabled
    // through the whole 2s confirmation window, not just while the POST is
    // in flight — the confirmation view holds `selectedSkill` for that
    // window (player-assessment-form.tsx), and pre-fix `isSubmitting` alone
    // reset before it did, leaving a fully-enabled button next to
    // "Assessment saved!" that would double-POST on a second click. `force:
    // true` bypasses Playwright's own actionability wait (which would
    // otherwise just block on the disabled attribute and never click) so
    // this actually exercises "what if the browser dispatched a click
    // anyway" — a native disabled <button> still swallows it, which is
    // exactly the behavior being pinned.
    await page.getByTestId("class-assess-submit").click({ force: true });
    await page.waitForTimeout(2_500); // let the confirmation window (and any errant second POST) fully elapse
    const postSubmitAssessments = await getDb()
      .select({ id: playerAssessments.id })
      .from(playerAssessments)
      .where(eq(playerAssessments.familyMemberId, childId));
    expect(postSubmitAssessments).toHaveLength(1);

    // Same page, new session: sign in as the child's parent — an account
    // this branch's coach/admin diff never touches — and confirm the
    // assessment shows up on the untouched parent-facing development page.
    await signIn(page, parentEmail, parentPassword);
    await page.goto("/dashboard/family", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await page.getByRole("link", { name: `View development for ${childFirstName}` }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/children/${childId}/development`));

    // "Recent Coach Assessments" renders the skill name as an <h4> — the
    // ALL-TIME "Development by Domain" grid also lists per-skill names
    // (same page) but at <h5>, so scoping by heading level disambiguates
    // the two without depending on either component's CSS classes.
    await expect(page.getByRole("heading", { name: SKILL_NAME, level: 4 })).toBeVisible({ timeout: 15_000 });
    // Exact match: the "Understanding Levels" reference panel elsewhere on
    // this same page also contains the substring "Proficient" (as
    // "Proficient - Strong skills"), which a non-exact match would collide
    // with. The assessment row's level label is the bare word alone.
    await expect(page.getByText("Proficient", { exact: true })).toBeVisible();
  });
});
