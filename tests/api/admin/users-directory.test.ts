import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, expectJson } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { users, userRoles, familyMembers } from "@/lib/db/schema";
import { roles } from "@/lib/db/schema";
import { organizations, userOrganizationAccess } from "@/lib/db/schema/organizations";
import { eq, inArray } from "drizzle-orm";

const ENDPOINT = "/api/admin/users";
const suffix = Math.random().toString(36).slice(2, 10);
const inviteEmail = `invite-${suffix}@test.example`;

describe("Users directory: person types, filter, invite", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(async () => {
    // Remove the invited fixture user (cascades roles/access).
    const db = getDb();
    const created = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, inviteEmail));
    if (created.length > 0) {
      await db.delete(users).where(
        inArray(
          users.id,
          created.map((u) => u.id),
        ),
      );
    }
  });

  it("derives personType: parent only with dependents, player for self-rows", async () => {
    // The seeded parent test user has dependents; find them in the listing.
    const res = await apiFetch(`${ENDPOINT}?search=parent@test.aspiresports.com`, {
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.users.length).toBeGreaterThan(0);
    expect(json.users[0].personType).toBe("parent");
  });

  it("filter=parent returns only users with dependents", async () => {
    const res = await apiFetch(`${ENDPOINT}?filter=parent&limit=50`, {
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.users.length).toBeGreaterThan(0);
    // Verify against the DB: every returned user really has a dependent.
    const db = getDb();
    for (const u of json.users) {
      const deps = await db
        .select({ id: familyMembers.id })
        .from(familyMembers)
        .where(eq(familyMembers.parentUserId, u.id))
        .limit(1);
      expect(deps.length).toBe(1);
    }
  });

  it("filter by staff role returns only holders of that role", async () => {
    const res = await apiFetch(`${ENDPOINT}?filter=coach&limit=50`, {
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.users.length).toBeGreaterThan(0);
    for (const u of json.users) {
      expect(u.roles.some((r: { roleName: string }) => r.roleName === "coach")).toBe(
        true,
      );
    }
  });

  it("invite creates the user, grants org access + role, and they appear in the list", async () => {
    const res = await apiFetch(`${ENDPOINT}/invite`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        firstName: "Desk",
        lastName: "Hire",
        email: inviteEmail,
        roleName: "location_admin",
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.user.email).toBe(inviteEmail);

    const list = await apiFetch(`${ENDPOINT}?search=${inviteEmail}`, {
      cookie: adminCookie,
    });
    const listJson = await expectJson(list, 200);
    expect(listJson.users.length).toBe(1);
    expect(
      listJson.users[0].roles.some(
        (r: { roleName: string }) => r.roleName === "location_admin",
      ),
    ).toBe(true);
  });

  it("invite rejects duplicate emails with 409", async () => {
    const res = await apiFetch(`${ENDPOINT}/invite`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        firstName: "Desk",
        lastName: "Hire",
        email: inviteEmail,
      }),
    });
    expect(res.status).toBe(409);
  });

  it("invite rejects super_admin role grants", async () => {
    const res = await apiFetch(`${ENDPOINT}/invite`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        firstName: "Sneaky",
        lastName: "Escalation",
        email: `sneaky-${suffix}@test.example`,
        roleName: "super_admin",
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("signup no longer auto-grants the parent role", () => {
  const signupEmail = `no-parent-${suffix}@test.example`;

  afterAll(async () => {
    const db = getDb();
    await db.delete(users).where(eq(users.email, signupEmail));
  });

  it("a fresh signup has no parent role until a dependent exists", async () => {
    const res = await apiFetch("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email: signupEmail,
        password: "TestSignup123!",
        firstName: "Solo",
        lastName: "Adult",
      }),
    });
    expect([200, 201]).toContain(res.status);

    const db = getDb();
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, signupEmail));
    const grants = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(eq(userRoles.userId, u.id));
    expect(grants.length).toBe(0);
  });
});

describe("Users directory: tenant isolation for global-role holders", () => {
  const isoSuffix = Math.random().toString(36).slice(2, 10);
  const otherOrgParentEmail = `iso-otherorg-${isoSuffix}@test.example`;
  const sameOrgParentEmail = `iso-sameorg-${isoSuffix}@test.example`;
  let adminCookie: string;
  let otherOrgParentId: string;
  let sameOrgParentId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    const db = getDb();

    const [orgA] = await db.select({ id: organizations.id }).from(organizations)
      .where(eq(organizations.slug, "aspire-sports")).limit(1);
    const [orgB] = await db.select({ id: organizations.id }).from(organizations)
      .where(eq(organizations.slug, "orgb")).limit(1);
    const [parentRole] = await db.select({ id: roles.id }).from(roles)
      .where(eq(roles.name, "parent")).limit(1);
    if (!orgA || !orgB || !parentRole) {
      throw new Error("org/role fixtures missing — run npm run db:seed:e2e");
    }

    // Fixture 1: a parent whose only org tie is Org B, but who carries the
    // legacy GLOBAL-scoped parent role (the resolvePerson grant).
    const [u1] = await db.insert(users)
      .values({ email: otherOrgParentEmail, passwordHash: "x", firstName: "Iso", lastName: "OtherOrg" })
      .returning();
    otherOrgParentId = u1.id;
    await db.insert(userRoles).values({ userId: u1.id, roleId: parentRole.id, scopeType: "global" });
    await db.insert(userOrganizationAccess).values({
      userId: u1.id, organizationId: orgB.id, role: "parent", acceptedAt: new Date(),
    });

    // Fixture 2: same shape but the access row is in Org A.
    const [u2] = await db.insert(users)
      .values({ email: sameOrgParentEmail, passwordHash: "x", firstName: "Iso", lastName: "SameOrg" })
      .returning();
    sameOrgParentId = u2.id;
    await db.insert(userRoles).values({ userId: u2.id, roleId: parentRole.id, scopeType: "global" });
    await db.insert(userOrganizationAccess).values({
      userId: u2.id, organizationId: orgA.id, role: "parent", acceptedAt: new Date(),
    });
  });

  afterAll(async () => {
    // Deleting users cascades roles + access rows.
    await getDb().delete(users).where(inArray(users.id, [otherOrgParentId, sameOrgParentId]));
  });

  it("a global-parent-role holder from another org is NOT in this org's directory", async () => {
    const res = await apiFetch(`${ENDPOINT}?search=${encodeURIComponent(otherOrgParentEmail)}`, {
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.users.find((u: any) => u.email === otherOrgParentEmail)).toBeUndefined();
  });

  it("a global-parent-role holder WITH an org access row IS in the directory", async () => {
    const res = await apiFetch(`${ENDPOINT}?search=${encodeURIComponent(sameOrgParentEmail)}`, {
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.users.find((u: any) => u.email === sameOrgParentEmail)).toBeDefined();
  });

  it("super_admins (global scope, no access row) remain visible", async () => {
    const res = await apiFetch(`${ENDPOINT}?search=admin@test.aspiresports.com`, {
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.users.find((u: any) => u.email === "admin@test.aspiresports.com")).toBeDefined();
  });
});
