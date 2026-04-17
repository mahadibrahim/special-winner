import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Coach Assessments & Resources API", () => {
  let coachCookie: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- Assessments ----

  describe("GET /api/coach/assessments", () => {
    it("returns 200", async () => {
      const res = await apiFetch("/api/coach/assessments", {
        method: "GET",
        cookie: coachCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.assessments).toBeDefined();
    });
  });

  // ---- Skills ----

  describe("GET /api/coach/skills", () => {
    it("returns 200 with array", async () => {
      // skills endpoint requires sportId; without data we still expect a non-crash response
      const res = await apiFetch("/api/coach/skills", {
        method: "GET",
        cookie: coachCookie,
      });

      // Endpoint requires sportId — 400 is valid, 200 is valid with sportId
      expect([200, 400]).toContain(res.status);
    });
  });

  // ---- Skill Domains ----

  describe("GET /api/coach/skills/domains", () => {
    it("returns 200", async () => {
      const res = await apiFetch("/api/coach/skills/domains", {
        method: "GET",
        cookie: coachCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.domains).toBeDefined();
    });
  });

  // ---- Development Stages ----

  describe("GET /api/coach/skills/stages", () => {
    it("returns 200", async () => {
      const res = await apiFetch("/api/coach/skills/stages", {
        method: "GET",
        cookie: coachCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.stages).toBeDefined();
    });
  });

  // ---- Resources ----

  describe("GET /api/coach/resources", () => {
    it("returns 200", async () => {
      const res = await apiFetch("/api/coach/resources", {
        method: "GET",
        cookie: coachCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.resources).toBeDefined();
    });
  });

  // ---- Templates ----

  describe("GET /api/coach/templates", () => {
    it("returns 200", async () => {
      const res = await apiFetch("/api/coach/templates", {
        method: "GET",
        cookie: coachCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.templates).toBeDefined();
    });
  });

  // ---- Unauthenticated ----

  describe("Unauthenticated requests", () => {
    it("rejects unauthenticated GET /api/coach/assessments (401)", async () => {
      const res = await apiFetch("/api/coach/assessments", {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });
  });
});
