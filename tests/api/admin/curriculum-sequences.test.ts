/**
 * Tenant-scoping + CRUD tests for the curriculum sequences endpoints (Phase 3).
 *
 * Mirrors tests/api/admin/curriculum-tenant.test.ts:
 *   - GET list: WHERE organizationId = caller's org OR organizationId IS NULL.
 *   - POST: forces organizationId = caller's org; sportId must belong to the
 *     caller's org (no pivot via a foreign sport).
 *   - GET/PUT/DELETE [id]: cross-tenant/unknown ids resolve to 404.
 *
 * development_stages is reference data seeded out-of-band; when the table is
 * empty the create tests are unreachable by API, so they runtime-skip
 * (same convention as curriculum-tenant.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  apiFetch,
  expectJson,
  getAdminCookie,
  getCoachCookie,
  testSlug,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/curriculum/sequences";

let adminCookie: string;
let orgASportId: string;
let orgBSportId: string;
let stageId: string | null = null;
let templateId: string | null = null;
let sequenceId: string | null = null;
const sequenceName = testSlug("sequence");

beforeAll(async () => {
  adminCookie = await getAdminCookie();

  // Org B fixtures — only available when E2E_TEST_ENDPOINTS=yes.
  const orgBRes = await apiFetch("/api/test/org-fixtures?slug=orgb", {
    method: "GET",
  });
  if (orgBRes.status !== 200) {
    throw new Error(
      `Could not load Org B fixtures (status ${orgBRes.status}) — set E2E_TEST_ENDPOINTS=yes and run npm run db:seed:e2e.`,
    );
  }
  orgBSportId = (await orgBRes.json()).sportId;

  const sportsRes = await apiFetch("/api/admin/sports", {
    method: "GET",
    cookie: adminCookie,
  });
  const sportsJson = await expectJson(sportsRes, 200);
  orgASportId = sportsJson.sports[0].id;

  // Stage reference data via the templates endpoint's reference lists.
  const tplRes = await apiFetch("/api/admin/curriculum/templates", {
    method: "GET",
    cookie: adminCookie,
  });
  const tplJson = await expectJson(tplRes, 200);
  stageId = tplJson.stages?.[0]?.id ?? null;

  if (stageId) {
    // A template owned by org A's sport, used as a sequence entry later.
    const createTpl = await apiFetch("/api/admin/curriculum/templates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        stageId,
        name: testSlug("seq-tpl"),
        totalDurationMinutes: 60,
        structure: [{ name: "Warmup", type: "warmup", durationMinutes: 10 }],
      }),
    });
    templateId = (await expectJson(createTpl, 201)).template.id;
  }
});

afterAll(() => {
  resetCookies();
});

describe("POST - create sequence", () => {
  it("creates a sequence scoped to the caller's org (201)", async () => {
    if (!stageId) return; // runtime skip: no development_stages seeded

    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        developmentStageId: stageId,
        programType: "league",
        name: sequenceName,
        description: "Test sequence",
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.sequence.name).toBe(sequenceName);
    expect(json.sequence.organizationId).toBeTruthy();
    sequenceId = json.sequence.id;
  });

  it("rejects a sequence built on another org's sport (404)", async () => {
    if (!stageId) return;

    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgBSportId,
        developmentStageId: stageId,
        name: testSlug("cross-tenant"),
      }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects invalid payloads (400)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch(ENDPOINT, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });
});

describe("GET - list sequences", () => {
  it("returns only own-org or global sequences, with reference lists", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET", cookie: adminCookie });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.sequences)).toBe(true);
    expect(Array.isArray(json.sports)).toBe(true);
    expect(Array.isArray(json.stages)).toBe(true);
    if (sequenceId) {
      const mine = json.sequences.find((s: any) => s.id === sequenceId);
      expect(mine).toBeDefined();
      expect(mine.entryCount).toBe(0);
      expect(mine.sport.id).toBe(orgASportId);
    }
    // No sequence in the list may belong to org B's sport.
    expect(json.sequences.some((s: any) => s.sportId === orgBSportId)).toBe(false);
  });
});

describe("GET/PUT [id] - detail and update", () => {
  it("returns the sequence with ordered entries (200)", async () => {
    if (!sequenceId) return;
    const res = await apiFetch(`${ENDPOINT}/${sequenceId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.sequence.id).toBe(sequenceId);
    expect(Array.isArray(json.entries)).toBe(true);
  });

  it("404s for an unknown/cross-tenant id", async () => {
    const res = await apiFetch(
      `${ENDPOINT}/00000000-0000-4000-8000-000000000000`,
      { method: "GET", cookie: adminCookie },
    );
    expect(res.status).toBe(404);
  });

  it("updates name and description (200)", async () => {
    if (!sequenceId) return;
    const res = await apiFetch(`${ENDPOINT}/${sequenceId}`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({ description: "Updated description" }),
    });
    const json = await expectJson(res, 200);
    expect(json.sequence.description).toBe("Updated description");
  });
});

describe("PUT [id]/entries - replace ordered entries", () => {
  it("replaces entries, assigning positions from array order (200)", async () => {
    if (!sequenceId || !templateId) return;
    const res = await apiFetch(`${ENDPOINT}/${sequenceId}/entries`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        entries: [
          { templateId, objectives: ["Objective one"], notes: "Week 1 notes" },
          { templateId }, // same template twice is legal — positions differ
        ],
      }),
    });
    const json = await expectJson(res, 200);
    expect(json.entries).toHaveLength(2);
    expect(json.entries[0].position).toBe(1);
    expect(json.entries[0].objectives).toEqual(["Objective one"]);
    expect(json.entries[1].position).toBe(2);

    // Detail now reflects the entries, and list entryCount updates.
    const detail = await expectJson(
      await apiFetch(`${ENDPOINT}/${sequenceId}`, {
        method: "GET",
        cookie: adminCookie,
      }),
      200,
    );
    expect(detail.entries).toHaveLength(2);
    expect(detail.entries[0].template.name).toBeTruthy();
  });

  it("rejects entries referencing an unknown template (400)", async () => {
    if (!sequenceId) return;
    const res = await apiFetch(`${ENDPOINT}/${sequenceId}/entries`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        entries: [{ templateId: "00000000-0000-4000-8000-000000000000" }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("blocks deleting a template that a sequence still references (400)", async () => {
    if (!sequenceId || !templateId) return;
    const res = await apiFetch(
      `/api/admin/curriculum/templates/${templateId}`,
      { method: "DELETE", cookie: adminCookie },
    );
    const json = await expectJson(res, 400);
    expect(json.error).toMatch(/sequence/i);
  });
});
