import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/venues";

describe("Admin Venues CRUD API", () => {
  let adminCookie: string;
  let locationId: string;
  let createdVenueId: string;
  const venueName = `Test Venue ${Date.now()}`;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    // Fetch locations to get a real locationId
    const res = await apiFetch("/api/admin/locations", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.locations)).toBe(true);
    expect(json.locations.length).toBeGreaterThan(0);
    locationId = json.locations[0].id;
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- POST (Create) ----

  describe("POST - Create venue", () => {
    it("creates a venue with valid data (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          locationId,
          name: venueName,
          fieldCount: 2,
          notes: "Integration test venue",
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.venue).toBeDefined();
      expect(json.venue.name).toBe(venueName);
      expect(json.venue.locationId).toBe(locationId);
      expect(json.venue.fieldCount).toBe(2);
      expect(json.venue.notes).toBe("Integration test venue");
      expect(json.venue.id).toBeDefined();

      createdVenueId = json.venue.id;
    });

    it("rejects missing name (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          locationId,
        }),
      });

      const json = await expectJson(res, 400);
      expect(json.error).toBe("Validation failed");
      expect(json.details).toBeDefined();
    });

    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          locationId,
          name: "Unauth Venue",
        }),
      });

      expect(res.status).toBe(401);
    });
  });

  // ---- GET (List) ----

  describe("GET - List venues", () => {
    it("returns array of venues including the test one (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.venues)).toBe(true);

      const found = json.venues.find(
        (v: any) => v.id === createdVenueId
      );
      expect(found).toBeDefined();
      expect(found.name).toBe(venueName);
    });

    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });
  });

  // ---- PUT (Update) ----

  describe("PUT - Update venue", () => {
    it("updates venue fieldCount (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: createdVenueId,
          locationId,
          name: venueName,
          fieldCount: 4,
        }),
      });

      const json = await expectJson(res, 200);
      expect(json.venue).toBeDefined();
      expect(json.venue.fieldCount).toBe(4);
      expect(json.venue.id).toBe(createdVenueId);
    });

    it("returns 400 when id is missing", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          locationId,
          name: "No ID Venue",
          fieldCount: 1,
        }),
      });

      const json = await expectJson(res, 400);
      expect(json.error).toBe("Venue ID is required");
    });

    it("returns 404 for nonexistent ID", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: fakeId,
          locationId,
          name: "Ghost Venue",
          fieldCount: 1,
        }),
      });

      const json = await expectJson(res, 404);
      expect(json.error).toBe("Venue not found");
    });
  });

  // ---- DELETE ----

  describe("DELETE - Delete venue", () => {
    it("deletes the test venue (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}?id=${createdVenueId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.success).toBe(true);
    });

    it("returns 404 for already-deleted venue", async () => {
      const res = await apiFetch(`${ENDPOINT}?id=${createdVenueId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 404);
      expect(json.error).toBe("Venue not found");
    });
  });
});
