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

  const UNASSIGNED_COACH_EMAIL = "training+coach@test.aspiresports.com";
  const UNASSIGNED_COACH_PASSWORD = "TestCoach123!";

  let organizationId: string;
  let venueId: string;
  let assignedCoachId: string;
  let portalTemplateId: string;
  let portalSessionId: string;
  let childId: string;
  let grantId: string;
  let enrollmentId: string;

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

    const [unassignedCoach] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, UNASSIGNED_COACH_EMAIL))
      .limit(1);
    if (!unassignedCoach) {
      throw new Error(`coach-classes.spec (portal): ${UNASSIGNED_COACH_EMAIL} is not seeded — run npm run db:seed:e2e`);
    }
    // Hygiene: the empty-state assertion needs this coach to genuinely have
    // zero active class assignments — clear any debris a prior/failed run
    // (this file or a sibling API suite) may have left active.
    await db
      .update(coachingAssignments)
      .set({ active: false })
      .where(
        and(
          eq(coachingAssignments.coachUserId, unassignedCoach.id),
          inArray(coachingAssignments.kind, ["class_template", "class_session"]),
        ),
      );

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
    await signIn(page, UNASSIGNED_COACH_EMAIL, UNASSIGNED_COACH_PASSWORD);

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
