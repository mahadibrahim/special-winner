import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAuthCookie, apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { organizations, locations } from "@/lib/db/schema/organizations";
import { hashPassword } from "@/lib/auth/password";
import { eq, inArray } from "drizzle-orm";

const suffix = Math.random().toString(36).slice(2, 10);
const PASSWORD = "TestLocAdmin123!";
const orgAAdminEmail = `loc-admin-a-${suffix}@test.example`;
const orgBAdminEmail = `loc-admin-b-${suffix}@test.example`;

/**
 * Location-scoped location_admin at the org admin gate.
 *
 * scope determines meaning: location_admin@organization = org admin (all
 * locations), location_admin@location = admin of that one location. The gate
 * (requireOrgAdminAccess) must accept a location-scoped admin whose location
 * belongs to the resolved org, and reject one whose location belongs to a
 * different org.
 */
describe("admin gate: location-scoped location_admin", () => {
  let orgAAdminCookie: string;
  let orgBAdminCookie: string;
  let createdUserIds: string[] = [];

  beforeAll(async () => {
    const db = getDb();
    const [orgA] = await db.select({ id: organizations.id }).from(organizations)
      .where(eq(organizations.slug, "aspire-sports")).limit(1);
    const [orgB] = await db.select({ id: organizations.id }).from(organizations)
      .where(eq(organizations.slug, "orgb")).limit(1);
    if (!orgA || !orgB) throw new Error("org fixtures missing — run npm run db:seed:e2e");

    const [orgALocation] = await db.select({ id: locations.id }).from(locations)
      .where(eq(locations.organizationId, orgA.id)).limit(1);
    const [orgBLocation] = await db.select({ id: locations.id }).from(locations)
      .where(eq(locations.organizationId, orgB.id)).limit(1);
    if (!orgALocation || !orgBLocation) throw new Error("location fixtures missing");

    const [locAdminRole] = await db.select({ id: roles.id }).from(roles)
      .where(eq(roles.name, "location_admin")).limit(1);
    if (!locAdminRole) throw new Error("location_admin role row missing");

    const passwordHash = await hashPassword(PASSWORD);

    const [uA] = await db.insert(users)
      .values({ email: orgAAdminEmail, passwordHash, firstName: "Loc", lastName: "AdminA", emailVerified: true })
      .returning();
    const [uB] = await db.insert(users)
      .values({ email: orgBAdminEmail, passwordHash, firstName: "Loc", lastName: "AdminB", emailVerified: true })
      .returning();
    createdUserIds = [uA.id, uB.id];

    await db.insert(userRoles).values([
      { userId: uA.id, roleId: locAdminRole.id, scopeType: "location", scopeId: orgALocation.id },
      { userId: uB.id, roleId: locAdminRole.id, scopeType: "location", scopeId: orgBLocation.id },
    ]);

    [orgAAdminCookie, orgBAdminCookie] = await Promise.all([
      getAuthCookie(orgAAdminEmail, PASSWORD),
      getAuthCookie(orgBAdminEmail, PASSWORD),
    ]);
  });

  afterAll(async () => {
    await getDb().delete(users).where(inArray(users.id, createdUserIds));
  });

  it("location-scoped admin of an in-org location passes the org gate", async () => {
    // localhost resolves to Org A; uA's location belongs to Org A.
    const res = await apiFetch("/api/admin/users?limit=1", { cookie: orgAAdminCookie });
    expect(res.status).toBe(200);
  });

  it("location-scoped admin of ANOTHER org's location is rejected (403)", async () => {
    // uB's only admin tie is an orgb location; on the Org A context this
    // must not grant admin access.
    const res = await apiFetch("/api/admin/users?limit=1", { cookie: orgBAdminCookie });
    expect(res.status).toBe(403);
  });

  // Org-level configuration is Organization Admin territory ("no access"
  // decision): a location-scoped admin must not read or mutate org-wide
  // config even though they pass the general org gate.
  it("location-scoped admin cannot reach org-level endpoints (403)", async () => {
    for (const path of [
      "/api/admin/sports",
      "/api/admin/locations",
      "/api/admin/organizations/settings",
      "/api/admin/stripe-connect/status",
    ]) {
      const res = await apiFetch(path, { cookie: orgAAdminCookie });
      expect(res.status, path).toBe(403);
    }
  });

  it("org-wide admin still reaches org-level endpoints", async () => {
    const superCookie = await getAuthCookie(
      "admin@test.aspiresports.com",
      "TestAdmin123!",
    );
    const res = await apiFetch("/api/admin/sports", { cookie: superCookie });
    expect(res.status).toBe(200);
  });
});

// ============================================================================
// Redundant role stacking guards on POST /api/admin/users
// ============================================================================

describe("role assignment: redundancy guards", () => {
  const stackSuffix = Math.random().toString(36).slice(2, 10);
  const orgAdminEmail = `stack-orgadmin-${stackSuffix}@test.example`;
  let superCookie: string;
  let superAdminUserId: string;
  let orgAdminUserId: string;
  let orgALocationId: string;

  beforeAll(async () => {
    const db = getDb();
    superCookie = await getAuthCookie("admin@test.aspiresports.com", "TestAdmin123!");

    const [superUser] = await db.select({ id: users.id }).from(users)
      .where(eq(users.email, "admin@test.aspiresports.com")).limit(1);
    superAdminUserId = superUser.id;

    const [orgA] = await db.select({ id: organizations.id }).from(organizations)
      .where(eq(organizations.slug, "aspire-sports")).limit(1);
    const [loc] = await db.select({ id: locations.id }).from(locations)
      .where(eq(locations.organizationId, orgA.id)).limit(1);
    orgALocationId = loc.id;

    const [locAdminRole] = await db.select({ id: roles.id }).from(roles)
      .where(eq(roles.name, "location_admin")).limit(1);

    // Fixture: an existing Organization Admin (location_admin@organization).
    const [u] = await db.insert(users)
      .values({ email: orgAdminEmail, passwordHash: "x", firstName: "Stack", lastName: "OrgAdmin" })
      .returning();
    orgAdminUserId = u.id;
    await db.insert(userRoles).values({
      userId: u.id, roleId: locAdminRole.id, scopeType: "organization", scopeId: orgA.id,
    });
  });

  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, orgAdminUserId));
  });

  /** If the assignment unexpectedly succeeded, remove the row so the shared
   *  staging DB stays clean, THEN fail the assertion. */
  async function expect409(body: Record<string, unknown>) {
    const res = await apiFetch("/api/admin/users", {
      method: "POST",
      cookie: superCookie,
      body: JSON.stringify(body),
    });
    if (res.status === 201) {
      const json = await res.json();
      if (json.userRole?.id) {
        await apiFetch(`/api/admin/users?userRoleId=${json.userRole.id}`, {
          method: "DELETE",
          cookie: superCookie,
        });
      }
    }
    expect(res.status).toBe(409);
  }

  it("assigning any role to a platform super admin → 409 (redundant)", async () => {
    await expect409({
      userId: superAdminUserId,
      roleName: "coach",
      scopeType: "organization",
    });
  });

  it("assigning location_admin@location to an existing org admin → 409 (org scope covers it)", async () => {
    await expect409({
      userId: orgAdminUserId,
      roleName: "location_admin",
      scopeType: "location",
      scopeId: orgALocationId,
    });
  });
});
