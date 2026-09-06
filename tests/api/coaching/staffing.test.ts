/**
 * Task 3 of the 2026-09-05-coach-classes-phase01 plan: the two admin staffing
 * endpoints (`/api/admin/classes/templates/:id/coaches`,
 * `/api/admin/classes/sessions/:id/coaches`) and the materializer's
 * propagation of a template's active coach set onto every newly-materialized
 * session.
 *
 * Two seeded org-scoped `coach`-role users exist in the default test org
 * (coach@test.aspiresports.com, training+coach@test.aspiresports.com) — both
 * resolved dynamically here rather than hardcoded, so this suite doesn't
 * silently break if a future seed change adds/renames coach fixtures.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { roles, userRoles } from "@/lib/db/schema/users";
import { coachingAssignments } from "@/lib/db/schema/coaching";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { apiFetch, getAdminCookie, getCoachCookie } from "../setup/test-helpers";
import {
  resolveClassTestFixtures,
  createTestClassTemplate,
  sweepOrphanedTestTemplates,
  cleanupTestClassFixtures,
} from "../../utils/classes-helpers";

const CRON_SECRET = process.env.CRON_SECRET;

let organizationId: string;
let venueId: string;
let parentUserId: string; // non-coach, for the 422 case
let adminCookie: string;
let coachCookie: string;
let leadCoachId: string;
let assistantCoachId: string;

let orgBTemplateId: string;
let orgBSessionId: string;

const createdTemplateIds: string[] = [];

async function putTemplateCoaches(
  templateId: string,
  body: Record<string, unknown>,
  cookie = adminCookie,
) {
  return apiFetch(`/api/admin/classes/templates/${templateId}/coaches`, {
    method: "PUT",
    cookie,
    body: JSON.stringify(body),
  });
}

async function getTemplateCoaches(templateId: string, cookie = adminCookie) {
  return apiFetch(`/api/admin/classes/templates/${templateId}/coaches`, { cookie });
}

async function putSessionCoaches(
  sessionId: string,
  body: Record<string, unknown>,
  cookie = adminCookie,
) {
  return apiFetch(`/api/admin/classes/sessions/${sessionId}/coaches`, {
    method: "PUT",
    cookie,
    body: JSON.stringify(body),
  });
}

async function getSessionCoaches(sessionId: string, cookie = adminCookie) {
  return apiFetch(`/api/admin/classes/sessions/${sessionId}/coaches`, { cookie });
}

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId } = await resolveClassTestFixtures());
  adminCookie = await getAdminCookie();
  coachCookie = await getCoachCookie();
  await sweepOrphanedTestTemplates(organizationId);

  const db = getDb();
  const coachRows = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(
        eq(roles.name, "coach"),
        eq(userRoles.scopeType, "organization"),
        eq(userRoles.scopeId, organizationId),
      ),
    )
    .orderBy(asc(userRoles.createdAt));
  if (coachRows.length < 2) {
    throw new Error(
      `staffing.test: expected at least 2 org-scoped coach-role users in the default org, found ${coachRows.length} — run npm run db:seed:e2e first`,
    );
  }
  [leadCoachId, assistantCoachId] = coachRows.map((r) => r.userId);

  const orgBFixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
  if (orgBFixtureRes.status !== 200) {
    throw new Error(
      `Could not load Org B fixtures (status ${orgBFixtureRes.status}). ` +
        "Ensure E2E_TEST_ENDPOINTS=yes is set and the e2e seed has been run.",
    );
  }
  const orgBFixtures = await orgBFixtureRes.json();
  const orgBId: string = orgBFixtures.org.id;
  const orgBVenueId: string = orgBFixtures.venueId;

  orgBTemplateId = await createTestClassTemplate({
    organizationId: orgBId,
    venueId: orgBVenueId,
    name: `Staffing-OrgB-${Date.now()}`,
    capacity: 5,
  });
  createdTemplateIds.push(orgBTemplateId);

  const startsAt = new Date(Date.now() + 4 * 86_400_000);
  const endsAt = new Date(startsAt.getTime() + 55 * 60_000);
  const [orgBSession] = await db
    .insert(dropInSessions)
    .values({
      organizationId: orgBId,
      venueId: orgBVenueId,
      kind: "class",
      sportOrClassLabel: "Soccer",
      startsAt,
      endsAt,
      capacity: 10,
      classSlotTemplateId: orgBTemplateId,
    })
    .returning();
  orgBSessionId = orgBSession.id;
});

afterAll(async () => {
  const db = getDb();
  if (orgBSessionId) {
    await db.delete(dropInSessions).where(eq(dropInSessions.id, orgBSessionId));
  }
  await cleanupTestClassFixtures(createdTemplateIds);
  if (createdTemplateIds.length > 0) {
    await db
      .delete(coachingAssignments)
      .where(
        and(
          eq(coachingAssignments.kind, "class_template"),
          inArray(coachingAssignments.targetId, createdTemplateIds),
        ),
      );
  }
  const sessionRows = await db
    .select({ id: dropInSessions.id })
    .from(dropInSessions)
    .where(inArray(dropInSessions.classSlotTemplateId, createdTemplateIds));
  const sessionIds = sessionRows.map((r) => r.id);
  if (sessionIds.length > 0) {
    await db
      .delete(coachingAssignments)
      .where(
        and(eq(coachingAssignments.kind, "class_session"), inArray(coachingAssignments.targetId, sessionIds)),
      );
  }
});

describe("template + session staffing propagation", () => {
  let templateId: string;
  let materializedSessionId: string;

  it("PUT template coaches sets lead+assistant; GET reflects the set", async () => {
    templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Staffing-${Date.now()}`,
      capacity: 10,
    });
    createdTemplateIds.push(templateId);

    const putRes = await putTemplateCoaches(templateId, {
      lead: leadCoachId,
      assistants: [assistantCoachId],
    });
    expect(putRes.status).toBe(200);

    const getRes = await getTemplateCoaches(templateId);
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    const byId = new Map<string, { role: string }>(
      body.templateCoaches.map((c: { coachUserId: string; role: string }) => [c.coachUserId, c]),
    );
    expect(byId.get(leadCoachId)?.role).toBe("lead");
    expect(byId.get(assistantCoachId)?.role).toBe("assistant");
    expect(body.templateCoaches).toHaveLength(2);
  });

  it(
    "materializing sessions copies the template's active coach set onto each new session, idempotently",
    async (ctx) => {
      if (!CRON_SECRET) return ctx.skip();

      const res1 = await apiFetch("/api/cron/materialize-class-sessions", {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      expect(res1.status).toBe(200);

      const db = getDb();
      const sessions = await db
        .select({ id: dropInSessions.id })
        .from(dropInSessions)
        .where(
          and(eq(dropInSessions.classSlotTemplateId, templateId), eq(dropInSessions.status, "scheduled")),
        )
        .orderBy(asc(dropInSessions.startsAt));
      expect(sessions.length).toBeGreaterThanOrEqual(1);
      materializedSessionId = sessions[0].id;

      const sessionRes = await getSessionCoaches(materializedSessionId);
      expect(sessionRes.status).toBe(200);
      const sessionBody = await sessionRes.json();
      const sById = new Map<string, { role: string }>(
        sessionBody.coaches.map((c: { coachUserId: string; role: string }) => [c.coachUserId, c]),
      );
      expect(sById.get(leadCoachId)?.role).toBe("lead");
      expect(sById.get(assistantCoachId)?.role).toBe("assistant");
      expect(sessionBody.coaches).toHaveLength(2);

      // Idempotent re-run: no duplicate assignment rows, same set.
      const res2 = await apiFetch("/api/cron/materialize-class-sessions", {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      expect(res2.status).toBe(200);

      const sessionRes2 = await getSessionCoaches(materializedSessionId);
      const sessionBody2 = await sessionRes2.json();
      expect(sessionBody2.coaches).toHaveLength(2);
    },
  );

  it(
    "PUT template coaches with applyToMaterialized replaces the set on the existing future session",
    async (ctx) => {
      if (!CRON_SECRET) return ctx.skip();

      const putRes = await putTemplateCoaches(templateId, {
        lead: assistantCoachId,
        assistants: [],
        applyToMaterialized: true,
      });
      expect(putRes.status).toBe(200);
      const putBody = await putRes.json();
      expect(putBody.sessionsUpdated).toBeGreaterThanOrEqual(1);
      // F2 fix: the response now always carries sessionsFailed/sessionsAttempted
      // alongside sessionsUpdated, so a caller can tell "0 updated" apart from
      // "N attempted, N failed" instead of the two looking identical. No
      // failure is staged here (that would need setCoachesFor to throw on a
      // legitimately-owned session, which isn't cheaply reproducible), so this
      // just pins the response SHAPE and the all-succeeded invariant.
      expect(putBody.sessionsFailed).toBe(0);
      expect(putBody.sessionsAttempted).toBe(putBody.sessionsUpdated);

      const sessionRes = await getSessionCoaches(materializedSessionId);
      const sessionBody = await sessionRes.json();
      expect(sessionBody.coaches).toHaveLength(1);
      expect(sessionBody.coaches[0].coachUserId).toBe(assistantCoachId);
      expect(sessionBody.coaches[0].role).toBe("lead");
    },
  );

  it(
    "a per-session PUT override survives a later template-level PUT that omits applyToMaterialized",
    async (ctx) => {
      if (!CRON_SECRET) return ctx.skip();

      const overrideRes = await putSessionCoaches(materializedSessionId, {
        lead: leadCoachId,
        assistants: [],
      });
      expect(overrideRes.status).toBe(200);

      // Template-level change WITHOUT applyToMaterialized must not touch the
      // session's just-set override.
      const putRes = await putTemplateCoaches(templateId, {
        lead: assistantCoachId,
        assistants: [leadCoachId],
      });
      expect(putRes.status).toBe(200);

      const sessionRes = await getSessionCoaches(materializedSessionId);
      const sessionBody = await sessionRes.json();
      expect(sessionBody.coaches).toHaveLength(1);
      expect(sessionBody.coaches[0].coachUserId).toBe(leadCoachId);
      expect(sessionBody.coaches[0].role).toBe("lead");
    },
  );
});

describe("staffing endpoint guards", () => {
  it("GET/PUT template coaches 404 for a template belonging to another org", async () => {
    const getRes = await getTemplateCoaches(orgBTemplateId);
    expect(getRes.status).toBe(404);

    const putRes = await putTemplateCoaches(orgBTemplateId, { lead: leadCoachId, assistants: [] });
    expect(putRes.status).toBe(404);
  });

  it("GET/PUT session coaches 404 for a session belonging to another org", async () => {
    const getRes = await getSessionCoaches(orgBSessionId);
    expect(getRes.status).toBe(404);

    const putRes = await putSessionCoaches(orgBSessionId, { lead: leadCoachId, assistants: [] });
    expect(putRes.status).toBe(404);
  });

  it("PUT template coaches 403s for a non-admin (coach) caller", async () => {
    const templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Staffing-Guard403-${Date.now()}`,
      capacity: 5,
    });
    createdTemplateIds.push(templateId);

    const res = await putTemplateCoaches(
      templateId,
      { lead: leadCoachId, assistants: [] },
      coachCookie,
    );
    expect(res.status).toBe(403);
  });

  it("PUT template coaches 422s when `lead` is not an org coach", async () => {
    const templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Staffing-Guard422-${Date.now()}`,
      capacity: 5,
    });
    createdTemplateIds.push(templateId);

    const res = await putTemplateCoaches(templateId, { lead: parentUserId, assistants: [] });
    expect(res.status).toBe(422);
  });

  it("PUT session coaches 422s when an assistant is not an org coach", async () => {
    const templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Staffing-Guard422Session-${Date.now()}`,
      capacity: 5,
    });
    createdTemplateIds.push(templateId);

    const startsAt = new Date(Date.now() + 5 * 86_400_000);
    const endsAt = new Date(startsAt.getTime() + 55 * 60_000);
    const db = getDb();
    const [session] = await db
      .insert(dropInSessions)
      .values({
        organizationId,
        venueId,
        kind: "class",
        sportOrClassLabel: "Soccer",
        startsAt,
        endsAt,
        capacity: 10,
        classSlotTemplateId: templateId,
      })
      .returning();

    const res = await putSessionCoaches(session.id, { lead: leadCoachId, assistants: [parentUserId] });
    expect(res.status).toBe(422);
  });

  it("GET/PUT session coaches 404 for a pickup (non-class) session", async () => {
    // F3 fix: loadOwnedSession now requires kind = 'class' — a pickup
    // drop_in_sessions row has no class_slot_templates relationship for this
    // staffing model to hang off of, so it must 404 rather than accept a
    // class-shaped staffing write.
    const db = getDb();
    const startsAt = new Date(Date.now() + 6 * 86_400_000);
    const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
    const [pickupSession] = await db
      .insert(dropInSessions)
      .values({
        organizationId,
        venueId,
        kind: "pickup",
        sportOrClassLabel: `Staffing-Pickup-${Date.now()}`,
        startsAt,
        endsAt,
        capacity: 10,
      })
      .returning();

    try {
      const getRes = await getSessionCoaches(pickupSession.id);
      expect(getRes.status).toBe(404);

      const putRes = await putSessionCoaches(pickupSession.id, { lead: leadCoachId, assistants: [] });
      expect(putRes.status).toBe(404);
    } finally {
      await db.delete(dropInSessions).where(eq(dropInSessions.id, pickupSession.id));
    }
  });
});

describe("camp day-session staffing (camps Phase 4 final-review I-2)", () => {
  // The camp materializer copies pod-coach staffing onto each day-session
  // exactly once and deliberately never re-syncs (src/lib/camps/materialize.ts
  // module contract) — this endpoint is the designated per-day override /
  // remediation path when a pod's coaches change AFTER a week's sessions
  // materialized. Before the fix, loadOwnedSession gated kind='class' and
  // 404'd every camp day-session, leaving a removed coach's stale active
  // assignment with no deactivation path at all.
  let campSessionId: string;

  beforeAll(async () => {
    const db = getDb();
    const startsAt = new Date(Date.now() + 5 * 86_400_000);
    const endsAt = new Date(startsAt.getTime() + 6 * 3_600_000);
    const [campSession] = await db
      .insert(dropInSessions)
      .values({
        organizationId,
        venueId,
        kind: "camp",
        sportOrClassLabel: `Staffing-Camp-${Date.now()}`,
        startsAt,
        endsAt,
        capacity: 24,
        audience: "youth",
      })
      .returning();
    campSessionId = campSession.id;

    // Simulate the materializer's propagated staffing: lead + assistant
    // active class_session assignments on the day-session (materialize.ts
    // inserts exactly this shape when it copies a pod's coach set).
    await db.insert(coachingAssignments).values([
      {
        organizationId,
        coachUserId: leadCoachId,
        role: "lead",
        kind: "class_session",
        targetId: campSessionId,
        active: true,
      },
      {
        organizationId,
        coachUserId: assistantCoachId,
        role: "assistant",
        kind: "class_session",
        targetId: campSessionId,
        active: true,
      },
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    if (campSessionId) {
      await db
        .delete(coachingAssignments)
        .where(
          and(
            eq(coachingAssignments.kind, "class_session"),
            eq(coachingAssignments.targetId, campSessionId),
          ),
        );
      await db.delete(dropInSessions).where(eq(dropInSessions.id, campSessionId));
    }
  });

  it("GET returns the materializer-propagated staffing for a camp session", async () => {
    const res = await getSessionCoaches(campSessionId);
    expect(res.status).toBe(200);
    const body = await res.json();
    const byId = new Map<string, { role: string }>(
      body.coaches.map((c: { coachUserId: string; role: string }) => [c.coachUserId, c]),
    );
    expect(byId.get(leadCoachId)?.role).toBe("lead");
    expect(byId.get(assistantCoachId)?.role).toBe("assistant");
    expect(body.coaches).toHaveLength(2);
  });

  it("PUT replaces the set — an omitted propagated assignment is DEACTIVATED", async () => {
    // The remediation scenario itself: admin removes the original lead after
    // materialization; only the former assistant remains, promoted to lead.
    const putRes = await putSessionCoaches(campSessionId, {
      lead: assistantCoachId,
      assistants: [],
    });
    expect(putRes.status).toBe(200);
    const body = await putRes.json();
    expect(body.coaches).toHaveLength(1);
    expect(body.coaches[0].coachUserId).toBe(assistantCoachId);
    expect(body.coaches[0].role).toBe("lead");

    // The removed coach's propagated row must be deactivated (active=false,
    // never deleted — setCoachesFor preserves history), which is exactly what
    // severs their "Camp days" visibility and glows write access.
    const db = getDb();
    const [removed] = await db
      .select({ active: coachingAssignments.active })
      .from(coachingAssignments)
      .where(
        and(
          eq(coachingAssignments.coachUserId, leadCoachId),
          eq(coachingAssignments.kind, "class_session"),
          eq(coachingAssignments.targetId, campSessionId),
        ),
      )
      .orderBy(asc(coachingAssignments.createdAt))
      .limit(1);
    expect(removed).toBeDefined();
    expect(removed.active).toBe(false);
  });
});
