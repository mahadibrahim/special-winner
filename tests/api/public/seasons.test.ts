import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch, expectJson } from "../setup/test-helpers";

const LIST_ENDPOINT = "/api/public/seasons";

describe("Public Seasons API", () => {
  // ---- GET /api/public/seasons ----

  describe("GET /api/public/seasons", () => {
    it("returns seasons array without auth (200)", async () => {
      const res = await apiFetch(LIST_ENDPOINT, { method: "GET" });

      const json = await expectJson(res, 200);
      expect(json.seasons).toBeDefined();
      expect(Array.isArray(json.seasons)).toBe(true);
    });

    it("filters by status=open — all returned seasons have status open", async () => {
      const res = await apiFetch(`${LIST_ENDPOINT}?status=open`, {
        method: "GET",
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.seasons)).toBe(true);

      for (const season of json.seasons) {
        expect(season.status).toBe("open");
      }
    });

    it("default listing only returns publicly-visible (open/active) seasons", async () => {
      const res = await apiFetch(LIST_ENDPOINT, { method: "GET" });

      const json = await expectJson(res, 200);
      for (const season of json.seasons) {
        expect(["open", "active"]).toContain(season.status);
      }
    });

    it("never leaks non-public seasons via the status param (?status=draft)", async () => {
      // The marketing catalog must never surface draft/closed seasons —
      // a draft carries unannounced future pricing/dates. A non-public
      // status value must fall back to the open/active allowlist, not echo
      // the requested status back as a filter.
      const res = await apiFetch(`${LIST_ENDPOINT}?status=draft`, {
        method: "GET",
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.seasons)).toBe(true);
      for (const season of json.seasons) {
        expect(season.status).not.toBe("draft");
        expect(["open", "active"]).toContain(season.status);
      }
    });

    it("returns season data with sport, location, and price fields", async () => {
      const res = await apiFetch(LIST_ENDPOINT, { method: "GET" });

      const json = await expectJson(res, 200);
      expect(json.seasons.length).toBeGreaterThan(0);

      const season = json.seasons[0];
      // Core fields
      expect(season.id).toBeDefined();
      expect(season.name).toBeDefined();
      expect(typeof season.price).toBe("number");

      // Nested sport object
      expect(season.sport).toBeDefined();
      expect(season.sport.id).toBeDefined();
      expect(season.sport.name).toBeDefined();

      // Nested location object
      expect(season.location).toBeDefined();
      expect(season.location.id).toBeDefined();
      expect(season.location.name).toBeDefined();
    });
  });

  // ---- GET /api/public/seasons/:id ----

  describe("GET /api/public/seasons/:id", () => {
    it("returns a single season by valid ID (200)", async () => {
      // First get a season from the list
      const listRes = await apiFetch(LIST_ENDPOINT, { method: "GET" });
      const listJson = await expectJson(listRes, 200);
      expect(listJson.seasons.length).toBeGreaterThan(0);

      const seasonId = listJson.seasons[0].id;

      // Fetch the individual season
      const res = await apiFetch(`${LIST_ENDPOINT}/${seasonId}`, {
        method: "GET",
      });

      const json = await expectJson(res, 200);
      expect(json.season).toBeDefined();
      expect(json.season.id).toBe(seasonId);
      expect(json.season.name).toBeDefined();
      expect(typeof json.season.price).toBe("number");
      expect(json.season.spotsLeft).toBeDefined();
      expect(json.season.sport).toBeDefined();
      expect(json.season.location).toBeDefined();
    });

    it("returns 404 for invalid UUID", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";

      const res = await apiFetch(`${LIST_ENDPOINT}/${fakeId}`, {
        method: "GET",
      });

      const json = await expectJson(res, 404);
      expect(json.error).toBeDefined();
    });
  });
});

describe("GET /api/public/seasons — tenant scoping", () => {
  let orgBSeasonId: string;
  let orgBSportSlug: string;

  beforeAll(async () => {
    const fixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
    expect(fixtureRes.status).toBe(200);
    const fixture = await fixtureRes.json();
    expect(fixture.seasonId).toBeTruthy();
    expect(fixture.sportSlug).toBeTruthy();
    orgBSeasonId = fixture.seasonId;
    orgBSportSlug = fixture.sportSlug;
  });

  it("on the default (Org A) host, excludes Org B's season ids and sport slugs", async () => {
    const res = await apiFetch("/api/public/seasons");
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.seasons.map((s: any) => s.id);
    const sportSlugs = body.seasons.map((s: any) => s.sport?.slug);
    // Positive existence so we know the endpoint isn't trivially empty:
    // Org A is expected to have at least one open/active soccer season in the e2e seed.
    expect(sportSlugs).toContain("soccer");
    // No-leak assertions:
    expect(ids).not.toContain(orgBSeasonId);
    expect(sportSlugs).not.toContain(orgBSportSlug);
  });

  it("does not return mockSeasons when the DB filter yields zero rows", async () => {
    // Force zero matches via a non-existent sport filter
    const res = await apiFetch("/api/public/seasons?sport=this-sport-does-not-exist");
    expect(res.status).toBe(200);
    const body = await res.json();
    // mockSeasons used to surface a Powell U8 fixture row with id "1" — must not anymore.
    const ids = body.seasons.map((s: any) => s.id);
    expect(ids).not.toContain("1");
    const slugs = body.seasons.map((s: any) => s.location?.slug);
    expect(slugs).not.toContain("powell");
  });
});

describe("GET /api/public/seasons/[id] — tenant scoping", () => {
  let orgBSeasonId: string;
  let orgASeasonId: string;

  beforeAll(async () => {
    const fixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
    expect(fixtureRes.status).toBe(200);
    const fixture = await fixtureRes.json();
    expect(fixture.seasonId).toBeTruthy();
    orgBSeasonId = fixture.seasonId;

    // Find an Org A season id from the public seasons listing (which is now scoped to Org A by default).
    const listRes = await apiFetch("/api/public/seasons");
    const listBody = await listRes.json();
    expect(listBody.seasons.length).toBeGreaterThan(0);
    orgASeasonId = listBody.seasons[0].id;
  });

  it("returns 404 when requesting Org B's season id on the default (Org A) host", async () => {
    const res = await apiFetch(`/api/public/seasons/${orgBSeasonId}`);
    expect(res.status).toBe(404);
  });

  it("returns 200 when requesting an Org A season id on the default host", async () => {
    const res = await apiFetch(`/api/public/seasons/${orgASeasonId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.season.id).toBe(orgASeasonId);
  });
});
