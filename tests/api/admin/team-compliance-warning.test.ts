/**
 * Soft compliance gate: assigning a coach to a team returns non-blocking
 * warnings for missing/expired REQUIRED credentials. The write always
 * succeeds — blocking is a later program decision.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { getAdminCookie, apiFetch, expectJson } from "../setup/test-helpers";

let adminCookie: string;
let orgAId: string;
let seasonId: string;
let coachUserId: string; // fresh user, zero credentials
let teamId: string;

beforeAll(async () => {
  adminCookie = await getAdminCookie();
  const db = getDb();

  const [orgA] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "aspire-sports"))
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  orgAId = orgA.id;

  const seasonsJson = await expectJson(
    await apiFetch("/api/admin/seasons?include_test=1", {
      cookie: adminCookie,
    }),
    200,
  );
  expect((seasonsJson.seasons as any[]).length).toBeGreaterThan(0);
  seasonId = seasonsJson.seasons[0].id;

  const [user] = await db
    .insert(users)
    .values({
      email: `team-warn-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      firstName: "Uncleared",
      lastName: "Coach",
      emailVerified: false,
    })
    .returning();
  coachUserId = user.id;
  await db.insert(userOrganizationAccess).values({
    userId: coachUserId,
    organizationId: orgAId,
    role: "staff",
    invitedAt: new Date(),
  });
});

describe("team coach assignment compliance warnings", () => {
  it("POST with an uncleared coach → 201 (non-blocking) + all four gaps", async () => {
    const json = await expectJson(
      await apiFetch("/api/admin/teams", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          seasonId,
          name: `Compliance Warn Team ${Date.now()}`,
          coachUserId,
        }),
      }),
      201,
    );
    teamId = json.team.id;
    expect(json.complianceWarnings).toHaveLength(1);
    expect(json.complianceWarnings[0].userId).toBe(coachUserId);
    expect(json.complianceWarnings[0].coachName).toBe("Uncleared Coach");
    expect(
      json.complianceWarnings[0].gaps.map((g: any) => g.credentialType),
    ).toEqual([
      "safesport",
      "background_check",
      "cpr_first_aid",
      "concussion_protocol",
    ]);
  });

  it("a valid credential shrinks the gap list on PUT", async () => {
    await expectJson(
      await apiFetch("/api/admin/coaches/credentials", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          userId: coachUserId,
          credentialType: "safesport",
          status: "valid",
          expiresAt: "2030-01-01",
        }),
      }),
      200,
    );

    const json = await expectJson(
      await apiFetch("/api/admin/teams", {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: teamId,
          seasonId,
          name: `Compliance Warn Team Updated ${Date.now()}`,
          coachUserId,
        }),
      }),
      200,
    );
    const gaps = json.complianceWarnings[0].gaps.map(
      (g: any) => g.credentialType,
    );
    expect(gaps).not.toContain("safesport");
    expect(gaps).toHaveLength(3);
  });

  it("no coach assigned → empty warnings array", async () => {
    const json = await expectJson(
      await apiFetch("/api/admin/teams", {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: teamId,
          seasonId,
          name: `Compliance Warn Team NoCoach ${Date.now()}`,
          coachUserId: null,
        }),
      }),
      200,
    );
    expect(json.complianceWarnings).toEqual([]);
  });

  it("cleanup: delete the test team", async () => {
    const res = await apiFetch(`/api/admin/teams?id=${teamId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
  });
});
