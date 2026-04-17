import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/announcements";

describe("Admin Announcements CRUD API", () => {
  let adminCookie: string;
  let createdAnnouncementId: string;
  const announcementTitle = `Test Announcement ${Date.now()}`;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- POST (Create) ----

  describe("POST - Create announcement", () => {
    it("creates an announcement with valid data (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          title: announcementTitle,
          content: "This is a test announcement for integration tests.",
          target: "all",
          status: "draft",
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.announcement).toBeDefined();
      expect(json.announcement.title).toBe(announcementTitle);
      expect(json.announcement.content).toBe(
        "This is a test announcement for integration tests."
      );
      expect(json.announcement.target).toBe("all");
      expect(json.announcement.status).toBe("draft");
      expect(json.announcement.id).toBeDefined();

      createdAnnouncementId = json.announcement.id;
    });

    it("rejects missing title (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          content: "Missing title",
        }),
      });

      const json = await expectJson(res, 400);
      expect(json.error).toBe("Validation failed");
      expect(json.details).toBeDefined();
    });
  });

  // ---- GET (List) ----

  describe("GET - List announcements", () => {
    it("returns array of announcements including the test one (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.announcements)).toBe(true);

      const found = json.announcements.find(
        (a: any) => a.id === createdAnnouncementId
      );
      expect(found).toBeDefined();
      expect(found.title).toBe(announcementTitle);
    });
  });

  // ---- DELETE ----

  describe("DELETE - Delete announcement", () => {
    it("deletes the test announcement (200)", async () => {
      const res = await apiFetch(
        `${ENDPOINT}?id=${createdAnnouncementId}`,
        {
          method: "DELETE",
          cookie: adminCookie,
        }
      );

      const json = await expectJson(res, 200);
      expect(json.success).toBe(true);
    });

    it("returns 404 for already-deleted announcement", async () => {
      const res = await apiFetch(
        `${ENDPOINT}?id=${createdAnnouncementId}`,
        {
          method: "DELETE",
          cookie: adminCookie,
        }
      );

      const json = await expectJson(res, 404);
      expect(json.error).toBe("Announcement not found");
    });
  });

  // ---- Unauthenticated ----

  describe("Unauthenticated requests", () => {
    it("rejects unauthenticated POST (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          title: "Unauth Announcement",
          content: "Should fail",
        }),
      });

      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated GET (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });
  });
});
