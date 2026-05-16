import { describe, it, expect } from "vitest";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";
import { getDb } from "@/lib/db";
import { users, roles, userRoles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("getLocationIdsForUser", () => {
  it("returns empty array when user has no location_admin rows", async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ email: `t-${Date.now()}-noloc@test.aspiresports.com` })
      .returning();

    const ids = await getLocationIdsForUser(user.id);
    expect(ids).toEqual([]);
  });

  it("returns location IDs from location-scoped role rows", async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ email: `t-${Date.now()}-loc@test.aspiresports.com` })
      .returning();
    const [role] = await db.select().from(roles).where(eq(roles.name, "location_admin"));
    if (!role) throw new Error("seed location_admin role first");

    await db.insert(userRoles).values([
      { userId: user.id, roleId: role.id, scopeType: "location", scopeId: "11111111-1111-1111-1111-111111111111" },
      { userId: user.id, roleId: role.id, scopeType: "location", scopeId: "22222222-2222-2222-2222-222222222222" },
    ]);

    const ids = await getLocationIdsForUser(user.id);
    expect(ids.sort()).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
  });

  it("ignores rows with non-location scope", async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ email: `t-${Date.now()}-mix@test.aspiresports.com` })
      .returning();
    const [locRole] = await db.select().from(roles).where(eq(roles.name, "location_admin"));
    const [superRole] = await db.select().from(roles).where(eq(roles.name, "super_admin"));

    await db.insert(userRoles).values([
      { userId: user.id, roleId: superRole.id, scopeType: "global", scopeId: null },
      { userId: user.id, roleId: locRole.id, scopeType: "location", scopeId: "33333333-3333-3333-3333-333333333333" },
    ]);

    const ids = await getLocationIdsForUser(user.id);
    expect(ids).toEqual(["33333333-3333-3333-3333-333333333333"]);
  });
});
