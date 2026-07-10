/**
 * Delivery visibility strip (Program Blueprint T10). See "Delivery
 * visibility" in docs/superpowers/specs/2026-07-10-program-blueprint-design.md
 * and the endpoint's own docstring
 * (src/pages/api/admin/blueprint/[seasonId]/delivery.ts) for the
 * slot->session mapping assumption this suite exercises.
 *
 * Distributes a 2-entry sequence to one coached team, then walks it
 * through: both slots "scheduled" right after distribution -> complete
 * the first session unchanged ("delivered") -> edit the second session's
 * segments then complete it ("adapted"). Also covers tenancy (parent
 * 403s, cross-org season 404s).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  apiFetch,
  expectJson,
  getAdminCookie,
  getCoachCookie,
  getParentCookie,
  testSlug,
  resetCookies,
} from "../setup/test-helpers";

const SEQUENCES_ENDPOINT = "/api/admin/curriculum/sequences";

describe("Blueprint delivery — GET /api/admin/blueprint/[seasonId]/delivery", () => {
  let adminCookie: string;
  let coachCookie: string;
  let orgASportId: string;
  let programId: string;

  let templateAId: string | null = null; // Week 1 — 20 min
  let templateBId: string | null = null; // Week 2 — 15 min
  let sequenceId: string | null = null;
  let developmentStageId: string | null = null;

  let seasonId: string;
  let teamId: string;

  const recurrence = {
    weekday: 6, // Saturday, no DST ambiguity
    startDate: "2026-11-07",
    timeOfDay: "09:00",
    count: 2,
  };

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    coachCookie = await getCoachCookie();

    const coachMe = await expectJson(
      await apiFetch("/api/auth/me", { method: "GET", cookie: coachCookie }),
      200,
    );
    const coachUserId = coachMe.user.id;

    const programsJson = await expectJson(
      await apiFetch("/api/admin/programs", { method: "GET", cookie: adminCookie }),
      200,
    );
    programId = programsJson.programs[0].id;
    orgASportId = programsJson.programs[0].sport.id;

    const tplListRes = await apiFetch("/api/admin/curriculum/templates", {
      method: "GET",
      cookie: adminCookie,
    });
    const tplListJson = await expectJson(tplListRes, 200);
    const developmentStage = (tplListJson.stages ?? []).find(
      (s: any) => s.slug === "development",
    );
    developmentStageId = developmentStage?.id ?? null;
    if (!developmentStageId) return; // runtime skip: no development_stages seeded

    const templateARes = await apiFetch("/api/admin/curriculum/templates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        stageId: developmentStageId,
        name: testSlug("delivery-template-a"),
        totalDurationMinutes: 20,
        structure: [{ name: "Warmup", type: "warmup", durationMinutes: 20 }],
      }),
    });
    templateAId = (await expectJson(templateARes, 201)).template.id;

    const templateBRes = await apiFetch("/api/admin/curriculum/templates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        stageId: developmentStageId,
        name: testSlug("delivery-template-b"),
        totalDurationMinutes: 15,
        structure: [{ name: "Scrimmage", type: "game", durationMinutes: 15 }],
      }),
    });
    templateBId = (await expectJson(templateBRes, 201)).template.id;

    const seqRes = await apiFetch(SEQUENCES_ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        developmentStageId,
        programType: "league",
        name: testSlug("delivery-sequence"),
      }),
    });
    sequenceId = (await expectJson(seqRes, 201)).sequence.id;

    await expectJson(
      await apiFetch(`${SEQUENCES_ENDPOINT}/${sequenceId}/entries`, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          entries: [{ templateId: templateAId }, { templateId: templateBId }],
        }),
      }),
      200,
    );

    const seasonJson = await expectJson(
      await apiFetch("/api/admin/seasons", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Delivery Visibility Season",
          slug: testSlug("delivery-season"),
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          priceCents: 15000,
          status: "draft",
          minAge: 12,
          maxAge: 14,
        }),
      }),
      201,
    );
    seasonId = seasonJson.season.id;

    // Fixture team's coach is the coach fixture user — same convention as
    // blueprint-attach.test.ts — so the coach cookie can complete/edit its
    // sessions below.
    const teamJson = await expectJson(
      await apiFetch("/api/admin/teams", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          seasonId,
          name: testSlug("delivery-team"),
          coachUserId,
        }),
      }),
      201,
    );
    teamId = teamJson.team.id;
  });

  afterAll(async () => {
    if (sequenceId) {
      await apiFetch(`${SEQUENCES_ENDPOINT}/${sequenceId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    }
    if (templateAId) {
      await apiFetch(`/api/admin/curriculum/templates/${templateAId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    }
    if (templateBId) {
      await apiFetch(`/api/admin/curriculum/templates/${templateBId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    }
    resetCookies();
  });

  it("returns an honest pre-distribution shape (no sequence linked at all)", async (ctx) => {
    if (!sequenceId) {
      ctx.skip();
      return;
    }
    // A fresh season with no linked sequence yet.
    const freshSeasonJson = await expectJson(
      await apiFetch("/api/admin/seasons", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Delivery No-Sequence Season",
          slug: testSlug("delivery-no-seq-season"),
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          priceCents: 15000,
          status: "draft",
          minAge: 12,
          maxAge: 14,
        }),
      }),
      201,
    );
    const json = await expectJson(
      await apiFetch(`/api/admin/blueprint/${freshSeasonJson.season.id}/delivery`, {
        method: "GET",
        cookie: adminCookie,
      }),
      200,
    );
    expect(json.slots).toEqual([]);
    expect(json.hasDistributed).toBe(false);
  });

  it("(a) both slots read 'scheduled' immediately after distribution", async (ctx) => {
    if (!sequenceId) {
      ctx.skip();
      return;
    }

    const attachRes = await apiFetch(`${SEQUENCES_ENDPOINT}/${sequenceId}/attach`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ seasonId, ...recurrence }),
    });
    const attachJson = await expectJson(attachRes, 200);
    const teamResult = attachJson.results.find((r: any) => r.teamId === teamId);
    expect(teamResult.created).toBe(2);

    const json = await expectJson(
      await apiFetch(`/api/admin/blueprint/${seasonId}/delivery`, {
        method: "GET",
        cookie: adminCookie,
      }),
      200,
    );
    expect(json.hasDistributed).toBe(true);
    expect(json.slots).toHaveLength(2);
    const [slot1, slot2] = [...json.slots].sort((a: any, b: any) => a.order - b.order);
    expect(slot1.groups).toHaveLength(1);
    expect(slot1.groups[0].teamId).toBe(teamId);
    expect(slot1.groups[0].status).toBe("scheduled");
    expect(slot2.groups[0].status).toBe("scheduled");
    expect(slot1.deliveredCount).toBe(0);
    expect(slot1.totalGroups).toBe(1);
  });

  it("(b) completing the first session unchanged reads 'delivered'", async (ctx) => {
    if (!sequenceId) {
      ctx.skip();
      return;
    }

    const sessionsJson = await expectJson(
      await apiFetch(`/api/coach/sessions?teamId=${teamId}`, {
        method: "GET",
        cookie: coachCookie,
      }),
      200,
    );
    const sorted = [...sessionsJson.sessions].sort(
      (a: any, b: any) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(),
    );
    expect(sorted).toHaveLength(2);
    const firstSessionId = sorted[0].id;

    await expectJson(
      await apiFetch(`/api/coach/sessions/${firstSessionId}`, {
        method: "PUT",
        cookie: coachCookie,
        body: JSON.stringify({ status: "completed" }),
      }),
      200,
    );

    const json = await expectJson(
      await apiFetch(`/api/admin/blueprint/${seasonId}/delivery`, {
        method: "GET",
        cookie: adminCookie,
      }),
      200,
    );
    const slot1 = json.slots.find((s: any) => s.order === 1);
    expect(slot1.groups[0].status).toBe("delivered");
    expect(slot1.deliveredCount).toBe(1);
  });

  it("(c) editing the second session's segments then completing it reads 'adapted'", async (ctx) => {
    if (!sequenceId) {
      ctx.skip();
      return;
    }

    const sessionsJson = await expectJson(
      await apiFetch(`/api/coach/sessions?teamId=${teamId}`, {
        method: "GET",
        cookie: coachCookie,
      }),
      200,
    );
    const sorted = [...sessionsJson.sessions].sort(
      (a: any, b: any) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(),
    );
    const secondSessionId = sorted[1].id;
    const secondSession = sorted[1];
    expect(secondSession.segments).toHaveLength(1);

    // Edit the segment's duration -- template's is 15, this diverges.
    await expectJson(
      await apiFetch(`/api/coach/sessions/${secondSessionId}`, {
        method: "PUT",
        cookie: coachCookie,
        body: JSON.stringify({
          segments: [
            {
              order: secondSession.segments[0].order,
              name: secondSession.segments[0].name,
              type: secondSession.segments[0].type,
              durationMinutes: 30,
            },
          ],
        }),
      }),
      200,
    );

    await expectJson(
      await apiFetch(`/api/coach/sessions/${secondSessionId}`, {
        method: "PUT",
        cookie: coachCookie,
        body: JSON.stringify({ status: "completed" }),
      }),
      200,
    );

    const json = await expectJson(
      await apiFetch(`/api/admin/blueprint/${seasonId}/delivery`, {
        method: "GET",
        cookie: adminCookie,
      }),
      200,
    );
    const slot2 = json.slots.find((s: any) => s.order === 2);
    expect(slot2.groups[0].status).toBe("adapted");
    // Adapted still counts toward "delivered to N of M" -- it ran, just
    // not exactly as planned.
    expect(slot2.deliveredCount).toBe(1);
  });

  it("(d) 403s a parent-role caller", async (ctx) => {
    if (!sequenceId) {
      ctx.skip();
      return;
    }
    const parentCookie = await getParentCookie();
    const res = await apiFetch(`/api/admin/blueprint/${seasonId}/delivery`, {
      method: "GET",
      cookie: parentCookie,
    });
    expect(res.status).toBe(403);
  });

  it("(e) 404s a cross-org season id", async (ctx) => {
    const orgBRes = await apiFetch("/api/test/org-fixtures?slug=orgb", { method: "GET" });
    if (orgBRes.status !== 200) {
      ctx.skip(); // E2E_TEST_ENDPOINTS not enabled on this dev server
      return;
    }
    const orgBJson = await orgBRes.json();
    if (!orgBJson.seasonId) {
      ctx.skip();
      return;
    }
    const res = await apiFetch(`/api/admin/blueprint/${orgBJson.seasonId}/delivery`, {
      method: "GET",
      cookie: adminCookie,
    });
    expect(res.status).toBe(404);
  });
});
