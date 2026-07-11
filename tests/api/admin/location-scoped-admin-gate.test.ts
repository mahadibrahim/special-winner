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
});
