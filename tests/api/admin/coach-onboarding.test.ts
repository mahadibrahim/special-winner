/**
 * Admin onboarding-summary API: tenant isolation + the shadow-session
 * admin-confirm action.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, roles, userRoles, users } from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import {
  getAdminCookie,
  getAuthCookie,
  getParentCookie,
  apiFetch,
  expectJson,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/coaches/onboarding";

let adminACookie: string;
let orgAId: string;
let orgBId: string;
let coachRoleId: string;
let orgACoachId: string;
let orgBCoachId: string;

async function createCoachUser(orgId: string, tag: string): Promise<string> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      email: `onboarding-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      firstName: `Onboard${tag}`,
      lastName: "Coach",
      emailVerified: false,
    })
    .returning();
  await db.insert(userOrganizationAccess).values({
    userId: user.id,
    organizationId: orgId,
    role: "staff",
    invitedAt: new Date(),
  });
  await db.insert(userRoles).values({
    userId: user.id,
    roleId: coachRoleId,
    scopeType: "organization",
    scopeId: orgId,
  });
  return user.id;
}

describe("Admin coach onboarding API", () => {
  beforeAll(async () => {
    adminACookie = await getAdminCookie();
    const db = getDb();

    const [orgA] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "aspire-sports"))
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    const [orgB] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "orgb"))
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    expect(orgA).toBeTruthy();
    expect(orgB).toBeTruthy();
    orgAId = orgA.id;
    orgBId = orgB.id;

    const [coachRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "coach"))
      .orderBy(asc(roles.id))
      .limit(1);
    coachRoleId = coachRole.id;

    orgACoachId = await createCoachUser(orgAId, "a");
    orgBCoachId = await createCoachUser(orgBId, "b");
  });

  describe("auth gates", () => {
    it("GET unauthenticated → 401", async () => {
      const res = await apiFetch(ENDPOINT);
      expect(res.status).toBe(401);
    });

    it("GET as parent → 403", async () => {
      const parentCookie = await getParentCookie();
      const res = await apiFetch(ENDPOINT, { cookie: parentCookie });
      expect(res.status).toBe(403);
    });

    it("GET as Org B admin in Org A context → 403", async () => {
      const adminBCookie = await getAuthCookie(
        "admin-orgb@test.aspiresports.com",
        "TestAdmin123!",
      );
      const res = await apiFetch(ENDPOINT, { cookie: adminBCookie });
      expect(res.status).toBe(403);
    });
  });

  describe("tenant isolation", () => {
    it("Org A admin's coach list contains the Org A coach but never the Org B coach", async () => {
      const json = await expectJson(
        await apiFetch(ENDPOINT, { cookie: adminACookie }),
        200,
      );
      const ids = (json.coaches as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain(orgACoachId);
      expect(ids).not.toContain(orgBCoachId);
    });

    it("Org A admin cannot confirm shadow session for an Org B coach → 404", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminACookie,
        body: JSON.stringify({
          userId: orgBCoachId,
          taskKey: "shadow_session_confirmed",
        }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("shadow-session confirm", () => {
    it("a freshly listed Org A coach starts with shadow_session_confirmed incomplete", async () => {
      const json = await expectJson(
        await apiFetch(ENDPOINT, { cookie: adminACookie }),
        200,
      );
      const coach = json.coaches.find((c: any) => c.id === orgACoachId);
      expect(coach).toBeTruthy();
      const shadow = coach.tasks.find(
        (t: any) => t.key === "shadow_session_confirmed",
      );
      expect(shadow.completed).toBe(false);
      expect(coach.complete).toBe(false);
    });

    it("confirming marks it complete and is idempotent on a second call", async () => {
      const first = await expectJson(
        await apiFetch(ENDPOINT, {
          method: "POST",
          cookie: adminACookie,
          body: JSON.stringify({
            userId: orgACoachId,
            taskKey: "shadow_session_confirmed",
          }),
        }),
        200,
      );
      expect(first.confirmed).toBe(true);

      const second = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminACookie,
        body: JSON.stringify({
          userId: orgACoachId,
          taskKey: "shadow_session_confirmed",
        }),
      });
      expect(second.status).toBe(200);

      const listing = await expectJson(
        await apiFetch(ENDPOINT, { cookie: adminACookie }),
        200,
      );
      const coach = listing.coaches.find((c: any) => c.id === orgACoachId);
      const shadow = coach.tasks.find(
        (t: any) => t.key === "shadow_session_confirmed",
      );
      expect(shadow.completed).toBe(true);
    });

    it("rejects a non-admin_confirm taskKey → 400", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminACookie,
        body: JSON.stringify({
          userId: orgACoachId,
          taskKey: "philosophy_read",
        }),
      });
      expect(res.status).toBe(400);
    });
  });
});
