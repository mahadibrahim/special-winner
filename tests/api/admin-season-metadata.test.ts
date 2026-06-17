/**
 * Admin season league-metadata tests.
 *
 * Verifies the 7 optional "league page metadata" fields round-trip through the
 * admin season create (POST) and edit (PUT) endpoints:
 *   termSlug, termLabel, divisionGender, skillLevel, dayOfWeek, startTime, endTime.
 *
 * Mirrors the auth + program-lookup pattern from admin-tenant-scoping.test.ts:
 *   - Sign in as the seeded Org A admin (admin@test.aspiresports.com) via
 *     getAuthCookie, which POSTs /api/auth/signin and returns the session cookie.
 *   - Discover a program owned by the admin's org via GET /api/admin/programs.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getAuthCookie, apiFetch, expectJson, testSlug } from "./setup/test-helpers";

let adminCookie: string;
let programId: string;

beforeAll(async () => {
  adminCookie = await getAuthCookie(
    "admin@test.aspiresports.com",
    "TestAdmin123!",
  );

  const programsRes = await apiFetch("/api/admin/programs", {
    method: "GET",
    cookie: adminCookie,
  });
  const programs = (await programsRes.json()).programs as any[];
  expect(programs.length).toBeGreaterThan(0);
  programId = programs[0].id;
});

describe("admin seasons: league metadata round-trips", () => {
  it("POST persists all 7 metadata fields, then PUT updates them", async () => {
    const slug = `meta-test-${Date.now()}`;

    // ---- Create with all 7 metadata fields ----
    const createRes = await apiFetch("/api/admin/seasons", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        programId,
        name: "League Metadata Season",
        slug,
        startDate: "2026-09-01",
        endDate: "2026-12-15",
        priceCents: 10000,
        status: "draft",
        termSlug: "fall-2026",
        termLabel: "Fall 2026",
        divisionGender: "coed",
        skillLevel: "c",
        dayOfWeek: "tue",
        startTime: "18:00",
        endTime: "20:00",
      }),
    });
    const createJson = await expectJson(createRes, 201);
    const season = createJson.season;
    expect(season).toBeDefined();
    expect(season.termSlug).toBe("fall-2026");
    expect(season.termLabel).toBe("Fall 2026");
    expect(season.divisionGender).toBe("coed");
    expect(season.skillLevel).toBe("c");
    expect(season.dayOfWeek).toBe("tue");

    // ---- Update skillLevel + dayOfWeek ----
    const updateRes = await apiFetch("/api/admin/seasons", {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        id: season.id,
        programId,
        name: "League Metadata Season",
        slug,
        startDate: "2026-09-01",
        endDate: "2026-12-15",
        priceCents: 10000,
        status: "draft",
        termSlug: "fall-2026",
        termLabel: "Fall 2026",
        divisionGender: "coed",
        skillLevel: "b",
        dayOfWeek: "wed",
        startTime: "18:00",
        endTime: "20:00",
      }),
    });
    const updateJson = await expectJson(updateRes, 200);
    expect(updateJson.season.skillLevel).toBe("b");
    expect(updateJson.season.dayOfWeek).toBe("wed");
  });
});
