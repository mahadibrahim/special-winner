import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { users, userRoles, roles, organizations, locations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

describe("Admin Media Staff API", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => resetCookies());

  it("GET /api/admin/media/staff returns media_staff users with profile data", async () => {
    const res = await apiFetch("/api/admin/media/staff", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.staff)).toBe(true);
    const seeded = json.staff.find(
      (s: any) => s.email === "media_staff@test.aspiresports.com"
    );
    expect(seeded).toBeDefined();
    expect(seeded.active).toBe(true);
  });

  it("POST /api/admin/media/staff/invite creates a pending invite", async () => {
    const email = `invite-${Date.now()}@test.aspiresports.com`;
    const res = await apiFetch("/api/admin/media/staff/invite", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ email, firstName: "Inv", lastName: "Itee" }),
    });
    const json = await expectJson(res, 201);
    expect(json.invite.email).toBe(email);
  });

  it("POST invite rejects non-admin (401/403)", async () => {
    const res = await apiFetch("/api/admin/media/staff/invite", {
      method: "POST",
      body: JSON.stringify({ email: "x@x.com" }),
    });
    expect(res.status).toBe(401);
  });

  it("GET includes pre-onboarding staff (role exists, no profile row) with null profile fields", async () => {
    const db = getDb();
    const email = `no-profile-${Date.now()}@test.aspiresports.com`;

    // Resolve test org and its first location (needed for location-scoped role)
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, "aspire-sports"))
      .limit(1);
    if (!org) throw new Error("Test org not found — run seed first");

    const [mediaStaffRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, "media_staff"))
      .limit(1);
    if (!mediaStaffRole) throw new Error("media_staff role not found — run seed first");

    // Insert a bare user shell (no password, no profile)
    const [newUser] = await db
      .insert(users)
      .values({ email, firstName: "Pre", lastName: "Onboard" })
      .returning();

    // Assign media_staff role scoped to the org (mirrors the invite flow)
    await db.insert(userRoles).values({
      userId: newUser.id,
      roleId: mediaStaffRole.id,
      scopeType: "organization",
      scopeId: org.id,
    });

    // No mediaStaffProfiles row is inserted — this is the pre-onboarding edge case.

    try {
      const res = await apiFetch("/api/admin/media/staff", {
        method: "GET",
        cookie: adminCookie,
      });
      const json = await expectJson(res, 200);
      expect(Array.isArray(json.staff)).toBe(true);

      const found = json.staff.find((s: any) => s.email === email);
      expect(found).toBeDefined();
      // Profile fields must be null — the left join returned no profile row
      expect(found.active).toBeNull();
      expect(found.onboardedAt).toBeNull();
      expect(found.serviceLocationIds).toBeNull();
    } finally {
      // Clean up — delete role assignment and user shell
      await db.delete(userRoles).where(
        and(eq(userRoles.userId, newUser.id), eq(userRoles.roleId, mediaStaffRole.id))
      );
      await db.delete(users).where(eq(users.id, newUser.id));
    }
  });
});
