/**
 * Coach credentials API: tenant isolation + CRUD.
 *
 * Fixture users are created directly in the DB (org membership via
 * user_organization_access, coach role via user_roles) so the test does not
 * depend on the shape the e2e seed gives the shared coach@test account.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  coachCredentials,
  organizations,
  roles,
  userRoles,
  users,
} from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import {
  getAdminCookie,
  getAuthCookie,
  getParentCookie,
  apiFetch,
  expectJson,
} from "../setup/test-helpers";

let adminACookie: string;
let orgAId: string;
let orgBId: string;
let coachRoleId: string;
let orgACoachId: string; // fresh coach in org A, no credentials yet
let orgBCoachId: string; // fresh coach in org B, one credential row

async function createCoachUser(orgId: string, tag: string): Promise<string> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      email: `cred-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      firstName: `Cred${tag}`,
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
  await db.insert(coachCredentials).values({
    userId: orgBCoachId,
    organizationId: orgBId,
    credentialType: "safesport",
    status: "valid",
    expiresAt: new Date("2030-01-01T00:00:00Z"),
  });
});

describe("auth gates", () => {
  it("GET unauthenticated → 401", async () => {
    const res = await apiFetch("/api/admin/coaches/credentials");
    expect(res.status).toBe(401);
  });

  it("GET as parent → 403", async () => {
    const parentCookie = await getParentCookie();
    const res = await apiFetch("/api/admin/coaches/credentials", {
      cookie: parentCookie,
    });
    expect(res.status).toBe(403);
  });

  it("GET as Org B admin in Org A context → 403 (org-scoped admin gate)", async () => {
    const adminBCookie = await getAuthCookie(
      "admin-orgb@test.aspiresports.com",
      "TestAdmin123!",
    );
    const res = await apiFetch("/api/admin/coaches/credentials", {
      cookie: adminBCookie,
    });
    expect(res.status).toBe(403);
  });
});

describe("tenant isolation", () => {
  it("Org A admin list contains the Org A coach but never the Org B coach", async () => {
    const json = await expectJson(
      await apiFetch("/api/admin/coaches/credentials", {
        cookie: adminACookie,
      }),
      200,
    );
    const ids = (json.coaches as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toContain(orgACoachId);
    expect(ids).not.toContain(orgBCoachId);
  });

  it("Org A admin cannot upsert a credential for an Org B user → 404", async () => {
    const res = await apiFetch("/api/admin/coaches/credentials", {
      method: "POST",
      cookie: adminACookie,
      body: JSON.stringify({
        userId: orgBCoachId,
        credentialType: "safesport",
        status: "valid",
        expiresAt: "2030-01-01",
      }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Resource not found");
  });
});

describe("upsert + verify + list", () => {
  it("creates a pending credential", async () => {
    const json = await expectJson(
      await apiFetch("/api/admin/coaches/credentials", {
        method: "POST",
        cookie: adminACookie,
        body: JSON.stringify({
          userId: orgACoachId,
          credentialType: "safesport",
          status: "pending",
          notes: "Awaiting SafeSport completion email",
        }),
      }),
      200,
    );
    expect(json.credential.status).toBe("pending");
    expect(json.credential.verifiedByUserId).toBeNull();
    expect(json.credential.organizationId).toBe(orgAId);
  });

  it("upserts to valid (same row), stamping verifiedByUserId", async () => {
    const json = await expectJson(
      await apiFetch("/api/admin/coaches/credentials", {
        method: "POST",
        cookie: adminACookie,
        body: JSON.stringify({
          userId: orgACoachId,
          credentialType: "safesport",
          status: "valid",
          issuedAt: "2026-06-01",
          expiresAt: "2030-01-01",
        }),
      }),
      200,
    );
    expect(json.credential.status).toBe("valid");
    expect(json.credential.verifiedByUserId).toBeTruthy();

    // Still exactly one row for (user, org, type) — app-level upsert.
    const rows = await getDb()
      .select()
      .from(coachCredentials)
      .where(
        and(
          eq(coachCredentials.userId, orgACoachId),
          eq(coachCredentials.organizationId, orgAId),
          eq(coachCredentials.credentialType, "safesport"),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("expiring-within-60-days shows effectiveStatus expiring_soon and is not a gap", async () => {
    const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await expectJson(
      await apiFetch("/api/admin/coaches/credentials", {
        method: "POST",
        cookie: adminACookie,
        body: JSON.stringify({
          userId: orgACoachId,
          credentialType: "cpr_first_aid",
          status: "valid",
          expiresAt: soon,
        }),
      }),
      200,
    );

    const json = await expectJson(
      await apiFetch("/api/admin/coaches/credentials", {
        cookie: adminACookie,
      }),
      200,
    );
    const coach = (json.coaches as Array<any>).find(
      (c) => c.id === orgACoachId,
    );
    expect(coach).toBeTruthy();

    const cpr = coach.credentials.find(
      (c: any) => c.credentialType === "cpr_first_aid",
    );
    expect(cpr.effectiveStatus).toBe("expiring_soon");

    const gapTypes = coach.gaps.map((g: any) => g.credentialType);
    expect(gapTypes).not.toContain("safesport"); // valid
    expect(gapTypes).not.toContain("cpr_first_aid"); // expiring, still valid
    expect(gapTypes).toContain("background_check"); // never recorded
    expect(gapTypes).toContain("concussion_protocol");
    expect(json.requiredTypes).toEqual([
      "safesport",
      "background_check",
      "cpr_first_aid",
      "concussion_protocol",
    ]);
    expect(json.expiringSoonDays).toBe(60);
  });

  it("rejects a malformed date → 400", async () => {
    const res = await apiFetch("/api/admin/coaches/credentials", {
      method: "POST",
      cookie: adminACookie,
      body: JSON.stringify({
        userId: orgACoachId,
        credentialType: "safesport",
        status: "valid",
        expiresAt: "not-a-date",
      }),
    });
    expect(res.status).toBe(400);
  });
});
