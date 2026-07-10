/**
 * Guardian-resolution access to development data (Plan 2 Task 2).
 *
 * Three endpoints previously checked ONLY `familyMembers.parentUserId ===
 * user.id`, which locked out:
 *   - additional guardians linked via `family_member_parents`
 *   - adult self-registered players (`familyMembers.selfUserId`)
 *
 * This spec exercises the primary-parent regression case, the "unrelated
 * parent is denied" case, and the "linked co-parent is granted access"
 * case (the fixture link is created directly via the DB in beforeAll since
 * the e2e seed has no family_member_parents fixtures).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { familyMemberParents } from "@/lib/db/schema/family-member-parents";
import {
  getAuthCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Guardian access to development data", () => {
  let parentCookie: string;
  let familyonlyCookie: string;
  let familyMemberId: string;
  let familyonlyUserId: string;

  beforeAll(async () => {
    parentCookie = await getAuthCookie(
      "parent@test.aspiresports.com",
      "TestParent123!"
    );
    familyonlyCookie = await getAuthCookie(
      "familyonly@test.aspiresports.com",
      "TestFamily123!"
    );

    const db = getDb();
    const [familyonlyUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "familyonly@test.aspiresports.com"));
    expect(familyonlyUser).toBeDefined();
    familyonlyUserId = familyonlyUser.id;

    // Create a dependent under parent@ to exercise the three endpoints against.
    const createRes = await apiFetch("/api/family-members", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({
        firstName: "GuardianAccessTest",
        lastName: "Child",
        birthDate: "2017-05-01",
        gender: "male",
        parentalConsent: true,
      }),
    });
    const createJson = await expectJson(createRes, 201);
    familyMemberId = createJson.familyMember.id;
  });

  afterAll(async () => {
    // Clean up the fixture family member (cascades family_member_parents).
    await apiFetch(`/api/family-members/${familyMemberId}`, {
      method: "DELETE",
      cookie: parentCookie,
    });
    resetCookies();
  });

  describe("primary parent (regression guard)", () => {
    it("GET development report — 200", async () => {
      const res = await apiFetch(
        `/api/development/reports/${familyMemberId}`,
        { method: "GET", cookie: parentCookie }
      );
      const json = await expectJson(res, 200);
      expect(json.familyMember.id).toBe(familyMemberId);
    });

    it("GET achievements — 200", async () => {
      const res = await apiFetch(
        `/api/development/achievements/${familyMemberId}`,
        { method: "GET", cookie: parentCookie }
      );
      await expectJson(res, 200);
    });

    it("GET family member detail — 200", async () => {
      const res = await apiFetch(`/api/family-members/${familyMemberId}`, {
        method: "GET",
        cookie: parentCookie,
      });
      const json = await expectJson(res, 200);
      expect(json.familyMember.id).toBe(familyMemberId);
    });
  });

  describe("unrelated parent (no link) — denied", () => {
    it("GET development report — 403", async () => {
      const res = await apiFetch(
        `/api/development/reports/${familyMemberId}`,
        { method: "GET", cookie: familyonlyCookie }
      );
      await expectJson(res, 403);
    });

    it("GET achievements — 403", async () => {
      const res = await apiFetch(
        `/api/development/achievements/${familyMemberId}`,
        { method: "GET", cookie: familyonlyCookie }
      );
      await expectJson(res, 403);
    });

    it("GET family member detail — 404", async () => {
      const res = await apiFetch(`/api/family-members/${familyMemberId}`, {
        method: "GET",
        cookie: familyonlyCookie,
      });
      await expectJson(res, 404);
    });
  });

  describe("linked co-parent — allowed", () => {
    beforeAll(async () => {
      const db = getDb();
      await db.insert(familyMemberParents).values({
        familyMemberId,
        parentUserId: familyonlyUserId,
        relationship: "guardian",
      });
    });

    afterAll(async () => {
      const db = getDb();
      await db
        .delete(familyMemberParents)
        .where(
          and(
            eq(familyMemberParents.familyMemberId, familyMemberId),
            eq(familyMemberParents.parentUserId, familyonlyUserId)
          )
        );
    });

    it("GET development report — 200", async () => {
      const res = await apiFetch(
        `/api/development/reports/${familyMemberId}`,
        { method: "GET", cookie: familyonlyCookie }
      );
      const json = await expectJson(res, 200);
      expect(json.familyMember.id).toBe(familyMemberId);
    });

    it("GET achievements — 200", async () => {
      const res = await apiFetch(
        `/api/development/achievements/${familyMemberId}`,
        { method: "GET", cookie: familyonlyCookie }
      );
      await expectJson(res, 200);
    });

    it("GET family member detail — 200", async () => {
      const res = await apiFetch(`/api/family-members/${familyMemberId}`, {
        method: "GET",
        cookie: familyonlyCookie,
      });
      const json = await expectJson(res, 200);
      expect(json.familyMember.id).toBe(familyMemberId);
    });
  });
});
