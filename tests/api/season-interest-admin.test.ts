/**
 * Season-interest read path (#543).
 *
 * Interest submissions were write-only until this shipped: stored by
 * POST /api/public/season-interest, counted on /admin/seasons, readable by
 * nobody. These tests cover the full loop — an admin creates a forming
 * season, a visitor submits interest, and the admin reads it back through
 * the new list endpoint and CSV export.
 *
 * Auth pattern mirrors admin-season-metadata.test.ts (seeded Org A admin).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getAuthCookie, apiFetch, expectJson } from "./setup/test-helpers";

let adminCookie: string;
let programId: string;
let seasonId: string;

const uniq = Date.now();
const interestEmail = `interest-e2e-${uniq}@test.aspiresports.com`;

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

  // A forming season — the only status the public interest endpoint accepts.
  const createRes = await apiFetch("/api/admin/seasons", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      programId,
      name: `Interest Readback Season ${uniq}`,
      slug: `interest-readback-${uniq}`,
      startDate: "2027-01-10",
      endDate: "2027-03-15",
      priceCents: 10000,
      status: "forming",
      termSlug: `interest-term-${uniq}`,
      termLabel: "Interest Term",
    }),
  });
  const createJson = await expectJson(createRes, 201);
  seasonId = createJson.season.id;
});

describe("season interest: admin read path", () => {
  it("rejects unauthenticated reads", async () => {
    const res = await apiFetch("/api/admin/season-interest", { method: "GET" });
    expect(res.status).toBeGreaterThanOrEqual(401);
    expect(res.status).toBeLessThanOrEqual(403);

    const csvRes = await apiFetch("/api/admin/season-interest/export.csv", {
      method: "GET",
    });
    expect(csvRes.status).toBeGreaterThanOrEqual(401);
    expect(csvRes.status).toBeLessThanOrEqual(403);
  });

  it("a public submission is readable back through the list endpoint", async () => {
    const submitRes = await apiFetch("/api/public/season-interest", {
      method: "POST",
      body: JSON.stringify({
        seasonId,
        email: interestEmail,
        firstName: "Readback",
      }),
    });
    expect(submitRes.status).toBe(200);

    const listRes = await apiFetch(
      `/api/admin/season-interest?seasonId=${seasonId}`,
      { method: "GET", cookie: adminCookie },
    );
    const listJson = await expectJson(listRes, 200);
    expect(listJson.total).toBe(1);
    const record = listJson.interest[0];
    expect(record.email).toBe(interestEmail);
    expect(record.firstName).toBe("Readback");
    expect(record.seasonId).toBe(seasonId);
    expect(record.seasonStatus).toBe("forming");
    expect(record.termLabel).toBe("Interest Term");
    expect(record.programName).toBeTruthy();
  });

  it("repeat submission stays idempotent — one record, not two", async () => {
    const again = await apiFetch("/api/public/season-interest", {
      method: "POST",
      body: JSON.stringify({ seasonId, email: interestEmail }),
    });
    expect(again.status).toBe(200);

    const listRes = await apiFetch(
      `/api/admin/season-interest?seasonId=${seasonId}`,
      { method: "GET", cookie: adminCookie },
    );
    const listJson = await expectJson(listRes, 200);
    expect(listJson.total).toBe(1);
  });

  it("term filter scopes the list", async () => {
    const listRes = await apiFetch(
      `/api/admin/season-interest?term=interest-term-${uniq}`,
      { method: "GET", cookie: adminCookie },
    );
    const listJson = await expectJson(listRes, 200);
    expect(listJson.total).toBe(1);
    expect(listJson.interest[0].email).toBe(interestEmail);

    const missRes = await apiFetch(
      `/api/admin/season-interest?term=no-such-term-${uniq}`,
      { method: "GET", cookie: adminCookie },
    );
    const missJson = await expectJson(missRes, 200);
    expect(missJson.total).toBe(0);
  });

  it("CSV export carries the record with the documented header", async () => {
    const csvRes = await apiFetch(
      `/api/admin/season-interest/export.csv?seasonId=${seasonId}`,
      { method: "GET", cookie: adminCookie },
    );
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get("content-type")).toContain("text/csv");
    expect(csvRes.headers.get("content-disposition")).toContain("season-interest-");

    const body = await csvRes.text();
    const [header, ...dataLines] = body.trim().split("\n");
    expect(header).toBe(
      "email,first_name,season_name,term,season_status,program_name,submitted_at",
    );
    expect(dataLines).toHaveLength(1);
    expect(dataLines[0]).toContain(interestEmail);
    expect(dataLines[0]).toContain("Interest Term");
  });
});
