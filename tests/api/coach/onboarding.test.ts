/**
 * Coach onboarding checklist API: the auth gap this feature closes (a
 * freshly hired coach with zero team assignments must still reach the
 * checklist), manual task completion, and auto-detected tasks.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  coachCredentials,
  organizations,
  roles,
  userRoles,
  users,
} from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { hashPassword } from "@/lib/auth/password";
import {
  getAuthCookie,
  getCoachCookie,
  getParentCookie,
  apiFetch,
  expectJson,
} from "../setup/test-helpers";

const ENDPOINT = "/api/coach/onboarding";
const FRESH_PASSWORD = "TestFreshCoach123!";

let orgAId: string;
let coachRoleId: string;
let freshCoachEmail: string;
let freshCoachCookie: string;

async function createFreshCoachUser(): Promise<string> {
  const db = getDb();
  const email = `fresh-coach-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await hashPassword(FRESH_PASSWORD);
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      firstName: "Fresh",
      lastName: "Coach",
      emailVerified: false,
    })
    .returning();
  await db.insert(userOrganizationAccess).values({
    userId: user.id,
    organizationId: orgAId,
    role: "staff",
    invitedAt: new Date(),
  });
  await db.insert(userRoles).values({
    userId: user.id,
    roleId: coachRoleId,
    scopeType: "organization",
    scopeId: orgAId,
  });
  return email;
}

describe("Coach onboarding API", () => {
  beforeAll(async () => {
    const db = getDb();
    const [orgA] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "aspire-sports"))
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    expect(orgA).toBeTruthy();
    orgAId = orgA.id;

    const [coachRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "coach"))
      .orderBy(asc(roles.id))
      .limit(1);
    coachRoleId = coachRole.id;

    freshCoachEmail = await createFreshCoachUser();
    freshCoachCookie = await getAuthCookie(freshCoachEmail, FRESH_PASSWORD);
  });

  describe("auth gates", () => {
    it("GET unauthenticated → 401", async () => {
      const res = await apiFetch(ENDPOINT);
      expect(res.status).toBe(401);
    });

    it("GET as a coach with the role but ZERO team assignments → 200 (the gap this feature closes)", async () => {
      const json = await expectJson(
        await apiFetch(ENDPOINT, { cookie: freshCoachCookie }),
        200,
      );
      expect(Array.isArray(json.tasks)).toBe(true);
      expect(json.tasks).toHaveLength(6);
      expect(json.complete).toBe(false);
    });

    it("GET as a parent (no coach role, no teams) → 403", async () => {
      const parentCookie = await getParentCookie();
      const res = await apiFetch(ENDPOINT, { cookie: parentCookie });
      expect(res.status).toBe(403);
    });
  });

  describe("manual task completion", () => {
    it("POST philosophy_read marks it complete with a completedAt", async () => {
      const json = await expectJson(
        await apiFetch(ENDPOINT, {
          method: "POST",
          cookie: freshCoachCookie,
          body: JSON.stringify({ taskKey: "philosophy_read" }),
        }),
        200,
      );
      const task = json.tasks.find((t: any) => t.key === "philosophy_read");
      expect(task.completed).toBe(true);
      expect(task.completedAt).toBeTruthy();
    });

    it("POST an auto-kind key (credentials_complete) → 400 (not coach-settable)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: freshCoachCookie,
        body: JSON.stringify({ taskKey: "credentials_complete" }),
      });
      expect(res.status).toBe(400);
    });

    it("POST an admin_confirm-kind key (shadow_session_confirmed) → 400 (not coach-settable)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: freshCoachCookie,
        body: JSON.stringify({ taskKey: "shadow_session_confirmed" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("auto-detected tasks", () => {
    it("credentials_complete flips true once all four required credentials are valid", async () => {
      const db = getDb();
      const farFuture = new Date("2035-01-01T00:00:00Z");
      const [freshCoach] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, freshCoachEmail))
        .orderBy(asc(users.createdAt))
        .limit(1);

      for (const credentialType of [
        "safesport",
        "background_check",
        "cpr_first_aid",
        "concussion_protocol",
      ] as const) {
        await db.insert(coachCredentials).values({
          userId: freshCoach.id,
          organizationId: orgAId,
          credentialType,
          status: "valid",
          expiresAt: farFuture,
        });
      }

      const json = await expectJson(
        await apiFetch(ENDPOINT, { cookie: freshCoachCookie }),
        200,
      );
      const task = json.tasks.find((t: any) => t.key === "credentials_complete");
      expect(task.completed).toBe(true);
      expect(task.completedAt).toBeTruthy(); // write-once persistence ran
    });

    it("first_practice_plan_created flips true once a session plan exists for one of the coach's teams", async () => {
      const coachCookie = await getCoachCookie();
      const teamsRes = await expectJson(
        await apiFetch("/api/coach/teams", { cookie: coachCookie }),
        200,
      );
      expect(teamsRes.teams.length).toBeGreaterThan(0);
      const teamId = teamsRes.teams[0].id;

      await apiFetch("/api/coach/sessions", {
        method: "POST",
        cookie: coachCookie,
        body: JSON.stringify({
          teamId,
          title: "Onboarding auto-flag test practice",
          scheduledDate: "2026-08-01T16:00:00.000Z",
          durationMinutes: 60,
        }),
      });

      const json = await expectJson(
        await apiFetch(ENDPOINT, { cookie: coachCookie }),
        200,
      );
      const task = json.tasks.find(
        (t: any) => t.key === "first_practice_plan_created",
      );
      expect(task.completed).toBe(true);
    });
  });
});
