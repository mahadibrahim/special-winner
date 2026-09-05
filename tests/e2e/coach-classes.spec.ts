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
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { coachingAssignments } from "@/lib/db/schema/coaching";
import { resolveDefaultOrgForHttpTests } from "../utils/dropin-helpers";
import {
  createTestClassTemplate,
  cleanupTestClassFixtures,
  sweepOrphanedTestTemplates,
} from "../utils/classes-helpers";
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
