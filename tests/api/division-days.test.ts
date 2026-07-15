/**
 * Batch division-day assignment endpoint.
 *
 * PATCH /api/admin/programs/[id]/division-days sets seasons.dayOfWeek for a
 * program's divisions in one transaction. Auth + program-lookup pattern mirrors
 * admin-season-metadata.test.ts (seeded Org A admin, program discovered via
 * GET /api/admin/programs).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getAuthCookie, apiFetch, expectJson } from "./setup/test-helpers";

const RANDOM_UUID = "00000000-0000-4000-8000-000000000000";

let adminCookie: string;
let programId: string;
let seasonId: string;

beforeAll(async () => {
  adminCookie = await getAuthCookie("admin@test.aspiresports.com", "TestAdmin123!");

  const programsRes = await apiFetch("/api/admin/programs", {
    method: "GET",
    cookie: adminCookie,
  });
  const programs = (await programsRes.json()).programs as any[];
  expect(programs.length).toBeGreaterThan(0);
  programId = programs[0].id;

  // Create a division (season) in that program with no day set.
  const createRes = await apiFetch("/api/admin/seasons", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      programId,
      name: "Day Planner Test Division",
      slug: `day-planner-test-${Date.now()}`,
      startDate: "2026-09-01",
      endDate: "2026-12-15",
      priceCents: 10000,
      status: "draft",
    }),
  });
  const created = await expectJson(createRes, 201);
  seasonId = created.season.id;
});

describe("PATCH /api/admin/programs/[id]/division-days", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await apiFetch(`/api/admin/programs/${programId}/division-days`, {
      method: "PATCH",
      body: JSON.stringify({ assignments: [] }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for a program the admin's org does not own", async () => {
    const res = await apiFetch(`/api/admin/programs/${RANDOM_UUID}/division-days`, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ assignments: [{ seasonId, dayOfWeek: "mon" }] }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects a seasonId that does not belong to the program (400)", async () => {
    const res = await apiFetch(`/api/admin/programs/${programId}/division-days`, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ assignments: [{ seasonId: RANDOM_UUID, dayOfWeek: "mon" }] }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid dayOfWeek (400)", async () => {
    const res = await apiFetch(`/api/admin/programs/${programId}/division-days`, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ assignments: [{ seasonId, dayOfWeek: "funday" }] }),
    });
    expect(res.status).toBe(400);
  });

  it("writes the day for valid assignments and persists it", async () => {
    const res = await apiFetch(`/api/admin/programs/${programId}/division-days`, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ assignments: [{ seasonId, dayOfWeek: "thu" }] }),
    });
    const json = await expectJson(res, 200);
    expect(json.updated).toBe(1);

    // Read back via the admin seasons listing (include_test to catch fixtures).
    const listRes = await apiFetch("/api/admin/seasons?include_test=1", {
      method: "GET",
      cookie: adminCookie,
    });
    const seasons = (await listRes.json()).seasons as any[];
    const mine = seasons.find((s) => s.id === seasonId);
    expect(mine?.dayOfWeek).toBe("thu");
  });

  it("accepts null to clear a day", async () => {
    const res = await apiFetch(`/api/admin/programs/${programId}/division-days`, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ assignments: [{ seasonId, dayOfWeek: null }] }),
    });
    const json = await expectJson(res, 200);
    expect(json.updated).toBe(1);
  });
});
