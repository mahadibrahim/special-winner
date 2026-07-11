import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { organizations, userOrganizationAccess } from "@/lib/db/schema/organizations";
import { and, eq } from "drizzle-orm";
import { ensureCustomerOrgMembership } from "@/lib/organization/ensure-membership";

const suffix = Math.random().toString(36).slice(2, 10);
const email = `ensure-membership-${suffix}@test.example`;

describe("ensureCustomerOrgMembership", () => {
  let userId: string;
  let orgId: string;

  beforeAll(async () => {
    const db = getDb();
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "aspire-sports"))
      .limit(1);
    if (!org) throw new Error("aspire-sports org not seeded — run npm run db:seed:e2e");
    orgId = org.id;

    const [u] = await db
      .insert(users)
      .values({ email, passwordHash: "x", firstName: "Ensure", lastName: "Member" })
      .returning();
    userId = u.id;
  });

  afterAll(async () => {
    // Deleting the user cascades the uoa rows.
    await getDb().delete(users).where(eq(users.id, userId));
  });

  it("creates a parent-role access row, and is idempotent", async () => {
    const db = getDb();
    await ensureCustomerOrgMembership(db, userId, orgId);
    await ensureCustomerOrgMembership(db, userId, orgId); // second call: no dup

    const rows = await db
      .select()
      .from(userOrganizationAccess)
      .where(
        and(
          eq(userOrganizationAccess.userId, userId),
          eq(userOrganizationAccess.organizationId, orgId),
        ),
      );
    expect(rows.length).toBe(1);
    expect(rows[0].role).toBe("parent");
    expect(rows[0].acceptedAt).not.toBeNull();
  });
});
