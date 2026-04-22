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

    it("clones teams from a source season (201)", async () => {
      // Arrange: create a source season and 3 teams in it
      const sourceSlug = testSlug("season-clone-src");
      const sourceRes = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Clone Source Season",
          slug: sourceSlug,
          startDate: "2025-09-01",
          endDate: "2025-12-15",
          priceCents: 10000,
          scaffold: { type: "bulk", count: 3 },
        }),
      });
      const sourceJson = await expectJson(sourceRes, 201);
      const sourceTeamNames = sourceJson.teams.map((t: any) => t.name).sort();

      // Act: clone into a new season
      const cloneSlug = testSlug("season-clone-dst");
      const cloneRes = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Clone Target Season",
          slug: cloneSlug,
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          priceCents: 12000, // intentionally different — pricing comes from form, not clone
          scaffold: { type: "clone", sourceSeasonId: sourceJson.season.id },
        }),
      });

      const cloneJson = await expectJson(cloneRes, 201);
      expect(cloneJson.teams).toHaveLength(3);
      expect(cloneJson.teams.map((t: any) => t.name).sort()).toEqual(sourceTeamNames);
      expect(cloneJson.season.priceCents).toBe(12000);
      expect(cloneJson.season.status).toBe("draft");

      // Cleanup
      await apiFetch(`${ENDPOINT}?id=${cloneJson.season.id}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
      await apiFetch(`${ENDPOINT}?id=${sourceJson.season.id}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    });

    it("rejects clone from a different program (400)", async () => {
      // Find a second program if available; skip otherwise
      const progsRes = await apiFetch("/api/admin/programs", {
        method: "GET",
        cookie: adminCookie,
      });
      const progsJson = await expectJson(progsRes, 200);
      const otherProgram = progsJson.programs.find((p: any) => p.id !== programId);
      if (!otherProgram) {
        console.warn("Skipping cross-program clone test: only one program seeded");
        return;
      }

      // Create a source season under the other program
      const sourceRes = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId: otherProgram.id,
          name: "Other Program Source",
          slug: testSlug("other-prog-src"),
          startDate: "2025-09-01",
          endDate: "2025-12-15",
          priceCents: 10000,
          scaffold: { type: "bulk", count: 2 },
        }),
      });
      const sourceJson = await expectJson(sourceRes, 201);

      // Try to clone into our program — should 400
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId, // different from sourceJson.season's program
          name: "Cross Program Clone",
          slug: testSlug("cross-prog-clone"),
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          priceCents: 10000,
          scaffold: { type: "clone", sourceSeasonId: sourceJson.season.id },
        }),
      });

      expect(res.status).toBe(400);

      // Cleanup
      await apiFetch(`${ENDPOINT}?id=${sourceJson.season.id}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    });
  });

  // ---- Venue validation ----

  describe("POST - Venue validation", () => {
    it("rejects venue belonging to a different location than the program (400)", async () => {
      // Arrange: find a venue NOT in the program's location
      // First find the program's location
      const progsRes = await apiFetch("/api/admin/programs", {
        method: "GET",
        cookie: adminCookie,
      });
      const progsJson = await expectJson(progsRes, 200);
      const program = progsJson.programs.find((p: any) => p.id === programId);
      expect(program).toBeDefined();
      const programLocationId = program.location.id;

      // Find a venue at a different location, or skip if none exists
      const venuesRes = await apiFetch("/api/admin/venues", {
        method: "GET",
        cookie: adminCookie,
      });
      const venuesJson = await expectJson(venuesRes, 200);
      const otherVenue = venuesJson.venues?.find(
        (v: any) => v.locationId !== programLocationId
      );
      if (!otherVenue) {
        console.warn("Skipping cross-location venue test: only one location seeded");
        return;
      }

      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Bad Venue Season",
          slug: testSlug("bad-venue"),
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          priceCents: 10000,
          venueId: otherVenue.id,
          scaffold: { type: "empty" },
        }),
      });

      expect(res.status).toBe(400);

      // Verify no season row was created (rollback)
      const listRes = await apiFetch(ENDPOINT, { method: "GET", cookie: adminCookie });
      const listJson = await expectJson(listRes, 200);
      const found = listJson.seasons.find((s: any) => s.name === "Bad Venue Season");
      expect(found).toBeUndefined();
    });

    it("accepts venue belonging to the program's location (201)", async () => {
      const progsRes = await apiFetch("/api/admin/programs", {
        method: "GET",
        cookie: adminCookie,
      });
      const progsJson = await expectJson(progsRes, 200);
      const program = progsJson.programs.find((p: any) => p.id === programId);
      const programLocationId = program.location.id;

      const venuesRes = await apiFetch("/api/admin/venues", {
        method: "GET",
        cookie: adminCookie,
      });
      const venuesJson = await expectJson(venuesRes, 200);
      const matchingVenue = venuesJson.venues?.find(
        (v: any) => v.locationId === programLocationId
      );
      if (!matchingVenue) {
        console.warn("Skipping matching-location venue test: no venue seeded for program's location");
        return;
      }

      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Good Venue Season",
          slug: testSlug("good-venue"),
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          priceCents: 10000,
          venueId: matchingVenue.id,
          scaffold: { type: "empty" },
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.season.venueId).toBe(matchingVenue.id);

      // Cleanup
      await apiFetch(`${ENDPOINT}?id=${json.season.id}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
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
