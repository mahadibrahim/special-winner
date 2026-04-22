import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  testSlug,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/seasons";

describe("Admin Seasons CRUD API", () => {
  let adminCookie: string;
  let createdSeasonId: string;
  let programId: string;
  const slug = testSlug("season");

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    // Fetch an existing program to use as the parent for seasons
    const res = await apiFetch("/api/admin/programs", {
      method: "GET",
      cookie: adminCookie,
    });

    const json = await expectJson(res, 200);
    expect(Array.isArray(json.programs)).toBe(true);
    expect(json.programs.length).toBeGreaterThan(0);
    programId = json.programs[0].id;
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- POST (Create) ----

  describe("POST - Create season", () => {
    it("creates a season with draft status (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Test Season",
          slug,
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          priceCents: 15000,
          depositCents: 5000,
          allowDeposit: true,
          maxParticipants: 40,
          status: "draft",
          scheduleNotes: "Saturdays 9am-12pm",
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.season).toBeDefined();
      expect(json.season.name).toBe("Test Season");
      expect(json.season.slug).toBe(slug);
      expect(json.season.startDate).toBe("2026-09-01");
      expect(json.season.endDate).toBe("2026-12-15");
      expect(json.season.priceCents).toBe(15000);
      expect(json.season.depositCents).toBe(5000);
      expect(json.season.allowDeposit).toBe(true);
      expect(json.season.maxParticipants).toBe(40);
      expect(json.season.status).toBe("draft");
      expect(json.season.scheduleNotes).toBe("Saturdays 9am-12pm");
      expect(json.season.id).toBeDefined();

      createdSeasonId = json.season.id;
    });
  });

  // ---- GET (List) ----

  describe("GET - List seasons", () => {
    it("returns array of seasons including the test one (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.seasons)).toBe(true);

      const found = json.seasons.find(
        (s: any) => s.id === createdSeasonId
      );
      expect(found).toBeDefined();
      expect(found.name).toBe("Test Season");
      expect(found.slug).toBe(slug);
      // Verify joined data is present
      expect(found.program).toBeDefined();
      expect(found.sport).toBeDefined();
      expect(found.location).toBeDefined();
    });
  });

  // ---- PUT (Update) ----

  describe("PUT - Update season", () => {
    it("updates season status to open and price (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: createdSeasonId,
          programId,
          name: "Test Season",
          slug,
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          priceCents: 17500,
          depositCents: 5000,
          allowDeposit: true,
          maxParticipants: 40,
          status: "open",
          scheduleNotes: "Saturdays 9am-12pm",
        }),
      });

      const json = await expectJson(res, 200);
      expect(json.season).toBeDefined();
      expect(json.season.status).toBe("open");
      expect(json.season.priceCents).toBe(17500);
      expect(json.season.id).toBe(createdSeasonId);
    });
  });

  // ---- DELETE ----

  describe("DELETE - Delete season", () => {
    it("deletes the test season (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}?id=${createdSeasonId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.success).toBe(true);
    });
  });

  // ---- Scaffold modes ----

  describe("POST - Scaffold modes", () => {
    it("creates a season with scaffold.type=empty and zero teams (201)", async () => {
      const slug = testSlug("season-empty");
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Empty Scaffold Season",
          slug,
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          priceCents: 10000,
          scaffold: { type: "empty" },
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.season).toBeDefined();
      expect(json.teams).toEqual([]);

      // Cleanup
      await apiFetch(`${ENDPOINT}?id=${json.season.id}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    });

    it("creates 4 teams with scaffold.type=bulk count=4 (201)", async () => {
      const slug = testSlug("season-bulk");

      // Look up the program name and (optional) age group for naming assertions
      const progRes = await apiFetch("/api/admin/programs", {
        method: "GET",
        cookie: adminCookie,
      });
      const progJson = await expectJson(progRes, 200);
      const program = progJson.programs.find((p: any) => p.id === programId);
      expect(program).toBeDefined();

      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Bulk Scaffold Season",
          slug,
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          priceCents: 10000,
          scaffold: { type: "bulk", count: 4 },
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.teams).toHaveLength(4);
      // Names match "{Program} Team {N}" when no ageGroup, else "{Program} {AgeGroup} Team {N}"
      json.teams.forEach((t: any, i: number) => {
        expect(t.name).toMatch(new RegExp(`Team ${i + 1}$`));
        expect(t.seasonId).toBe(json.season.id);
      });

      // Cleanup
      await apiFetch(`${ENDPOINT}?id=${json.season.id}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    });

    it("rejects scaffold.type=bulk with count > 50 (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Too Many",
          slug: testSlug("season-toomany"),
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          priceCents: 10000,
          scaffold: { type: "bulk", count: 51 },
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ---- Auth ----

  describe("Unauthenticated requests", () => {
    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        // no cookie
      });

      expect(res.status).toBe(401);
    });
  });
});
