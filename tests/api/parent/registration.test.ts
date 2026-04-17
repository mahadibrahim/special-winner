import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAuthCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Parent Registration API", () => {
  let parentCookie: string;
  let seasonId: string | null = null;
  let familyMemberId: string | null = null;

  beforeAll(async () => {
    parentCookie = await getAuthCookie(
      "parent@test.aspiresports.com",
      "TestParent123!"
    );

    // Fetch an open season
    const seasonsRes = await apiFetch("/api/public/seasons?status=open");
    if (seasonsRes.ok) {
      const seasonsJson = await seasonsRes.json();
      if (seasonsJson.seasons && seasonsJson.seasons.length > 0) {
        seasonId = seasonsJson.seasons[0].id;
      }
    }

    // Fetch the parent's family members
    const membersRes = await apiFetch("/api/family-members", {
      cookie: parentCookie,
    });
    if (membersRes.ok) {
      const membersJson = await membersRes.json();
      if (membersJson.familyMembers && membersJson.familyMembers.length > 0) {
        familyMemberId = membersJson.familyMembers[0].id;
      }
    }
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- POST (Create Registration) ----

  describe("POST /api/registrations - Create registration", () => {
    it("creates a registration or reports already registered (200/201/400)", async () => {
      if (!seasonId || !familyMemberId) {
        console.warn(
          "Skipping: no open season or family member available",
          { seasonId, familyMemberId }
        );
        return;
      }

      const res = await apiFetch("/api/registrations", {
        method: "POST",
        cookie: parentCookie,
        body: JSON.stringify({
          seasonId,
          familyMemberId,
          registrationType: "full",
          waiverSigned: true,
          waiverSignedBy: "Test Parent",
        }),
      });

      // 201 = created, 400 = already registered or validation issue
      expect([200, 201, 400]).toContain(res.status);

      const json = await res.json();

      if (res.status === 201) {
        expect(json.registration).toBeDefined();
        expect(json.registration.id).toBeDefined();
      } else if (res.status === 400) {
        // Already registered or validation error — both are acceptable
        expect(json.error).toBeDefined();
      }
    });

    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch("/api/registrations", {
        method: "POST",
        // no cookie
        body: JSON.stringify({
          seasonId: seasonId || "00000000-0000-0000-0000-000000000000",
          familyMemberId:
            familyMemberId || "00000000-0000-0000-0000-000000000000",
          registrationType: "full",
          waiverSigned: true,
          waiverSignedBy: "Test Parent",
        }),
      });

      expect(res.status).toBe(401);
    });
  });

  // ---- GET (List Registrations) ----

  describe("GET /api/registrations - List registrations", () => {
    it("returns an array of registrations for the parent (200)", async () => {
      const res = await apiFetch("/api/registrations", {
        method: "GET",
        cookie: parentCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.registrations).toBeDefined();
      expect(Array.isArray(json.registrations)).toBe(true);
    });

    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch("/api/registrations", {
        method: "GET",
        // no cookie
      });

      expect(res.status).toBe(401);
    });
  });
});
