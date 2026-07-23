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
    it("creates a registration or reports already registered (200/201/400/409)", async () => {
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

      // 201 = created, 400 = validation issue, 409 = already registered
      // (a live, non-cancelled/refunded row already exists for this member+season)
      expect([200, 201, 400, 409]).toContain(res.status);

      const json = await res.json();

      if (res.status === 201) {
        expect(json.registration).toBeDefined();
        expect(json.registration.id).toBeDefined();
      } else if (res.status === 400) {
        // Validation error
        expect(json.error).toBeDefined();
      } else if (res.status === 409) {
        // Already registered — structured error, human-readable message
        // stays in `error`, machine code is the sibling `code` field.
        expect(json.code).toBe("already_registered");
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

    it("returns resumed=true and same id on duplicate pending POST (200)", async () => {
      if (!seasonId || !familyMemberId) {
        console.warn(
          "Skipping: no open season or family member available",
          { seasonId, familyMemberId }
        );
        return;
      }

      const body = JSON.stringify({
        seasonId,
        familyMemberId,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Test Parent",
      });

      // First POST — may be 201 (new) or 200 with resumed=true if a pending
      // registration already exists from a previous test run.
      const first = await apiFetch("/api/registrations", {
        method: "POST",
        cookie: parentCookie,
        body,
      });

      // If first call came back 409 (already confirmed/waitlisted), we cannot
      // exercise the resume path — skip gracefully.
      if (first.status === 409) {
        const json = await first.json();
        console.warn("Skipping resume test: registration already confirmed/waitlisted:", json.error);
        return;
      }

      const firstJson = await first.json();
      expect([200, 201]).toContain(first.status);
      const firstId = firstJson.registration?.id;
      expect(firstId).toBeDefined();

      // If the first call already returned resumed=true, the state is already
      // "pending+unpaid" — the second call must also return resumed=true.
      // If the first call created a new registration (201), the second call
      // must return 200 with resumed=true.

      const second = await apiFetch("/api/registrations", {
        method: "POST",
        cookie: parentCookie,
        body,
      });

      expect(second.status).toBe(200);
      const secondJson = await second.json();
      expect(secondJson.resumed).toBe(true);
      expect(secondJson.registration?.id).toBe(firstId);
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
