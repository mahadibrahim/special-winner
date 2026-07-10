/**
 * Warn-tier dismissal tests (Program Blueprint T7). See "Age guardrails
 * (two-tier)" in docs/superpowers/specs/2026-07-10-program-blueprint-design.md
 * and src/pages/api/admin/blueprint/dismissals.ts.
 *
 * Covers POST /api/admin/blueprint/dismissals:
 *   - 200 + bootstrap surfaces dismissed:true with who/when metadata.
 *   - Idempotent: a second POST for the same (sequenceId, templateId) is a
 *     200 no-op, not a duplicate row.
 *   - zod 400 on a malformed body.
 *   - Parent-role caller 403s.
 *   - Unknown/cross-tenant sequenceId 404s.
 *   - CRITICAL regression this redesign exists for: after a dismissal, the
 *     entries PUT (entries.ts) delete-reinserts ALL entries with fresh
 *     UUIDs on every save — the bootstrap's `dismissed` flag must survive
 *     that churn because it's keyed by (sequenceId, templateId), not the
 *     ephemeral sequence_entry_id.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { developmentStages } from "@/lib/db/schema";
import { blueprintWarningDismissals } from "@/lib/db/schema/blueprint";
import {
  apiFetch,
  expectJson,
  getAdminCookie,
  getParentCookie,
  testSlug,
  resetCookies,
} from "../setup/test-helpers";

const SEQUENCES_ENDPOINT = "/api/admin/curriculum/sequences";
const DISMISSALS_ENDPOINT = "/api/admin/blueprint/dismissals";
const UNKNOWN_UUID = "00000000-0000-4000-8000-000000000000";

describe("Blueprint warn-tier dismissals — POST /api/admin/blueprint/dismissals", () => {
  let adminCookie: string;
  let orgASportId: string;
  let programId: string;
  let stageId: string | null = null;

  let templateId: string | null = null;
  let sequenceId: string | null = null;
  let seasonId: string | null = null;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    const programsJson = await expectJson(
      await apiFetch("/api/admin/programs", { method: "GET", cookie: adminCookie }),
      200,
    );
    programId = programsJson.programs[0].id;
    orgASportId = programsJson.programs[0].sport.id;

    const [stageRow] = await getDb()
      .select({
        id: developmentStages.id,
        ageMin: developmentStages.ageMin,
        ageMax: developmentStages.ageMax,
      })
      .from(developmentStages)
      .orderBy(asc(developmentStages.sortOrder))
      .limit(1);
    if (!stageRow) return; // runtime skip: no development_stages seeded
    stageId = stageRow.id;

    const tplRes = await apiFetch("/api/admin/curriculum/templates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        stageId,
        name: testSlug("dismissals-tpl"),
        totalDurationMinutes: 45,
        structure: [{ name: "Warmup", type: "warmup", durationMinutes: 15 }],
      }),
    });
    templateId = (await expectJson(tplRes, 201)).template.id;

    const seqRes = await apiFetch(SEQUENCES_ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        developmentStageId: stageId,
        programType: "class",
        name: testSlug("dismissals-sequence"),
      }),
    });
    sequenceId = (await expectJson(seqRes, 201)).sequence.id;

    const entriesRes = await apiFetch(`${SEQUENCES_ENDPOINT}/${sequenceId}/entries`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({ entries: [{ templateId }] }),
    });
    expect(entriesRes.status).toBe(200);

    const seasonJson = await expectJson(
      await apiFetch("/api/admin/seasons", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Dismissals Test Season",
          slug: testSlug("dismissals-season"),
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          priceCents: 15000,
          status: "draft",
          minAge: stageRow.ageMin ?? 6,
          maxAge: stageRow.ageMax ?? 8,
        }),
      }),
      201,
    );
    seasonId = seasonJson.season.id;

    await expectJson(
      await apiFetch(`/api/admin/blueprint/${seasonId}`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ sequenceId }),
      }),
      200,
    );
  });

  afterAll(async () => {
    if (sequenceId) {
      await apiFetch(`${SEQUENCES_ENDPOINT}/${sequenceId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    }
    if (templateId) {
      await apiFetch(`/api/admin/curriculum/templates/${templateId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    }
    resetCookies();
  });

  it("400s a malformed body", async (ctx) => {
    if (!sequenceId || !templateId) {
      ctx.skip();
      return;
    }
    const res = await apiFetch(DISMISSALS_ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ sequenceId }), // templateId missing
    });
    expect(res.status).toBe(400);
  });

  it("403s a parent-role caller", async (ctx) => {
    if (!sequenceId || !templateId) {
      ctx.skip();
      return;
    }
    const parentCookie = await getParentCookie();
    const res = await apiFetch(DISMISSALS_ENDPOINT, {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({ sequenceId, templateId }),
    });
    expect(res.status).toBe(403);
  });

  it("404s an unknown/cross-tenant sequence id", async (ctx) => {
    if (!templateId) {
      ctx.skip();
      return;
    }
    const res = await apiFetch(DISMISSALS_ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ sequenceId: UNKNOWN_UUID, templateId }),
    });
    expect(res.status).toBe(404);
  });

  it("200s and records the dismissal, surfaced in bootstrap with who/when metadata", async (ctx) => {
    if (!sequenceId || !templateId || !seasonId) {
      ctx.skip();
      return;
    }
    const res = await apiFetch(DISMISSALS_ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ sequenceId, templateId }),
    });
    const json = await expectJson(res, 200);
    expect(json.dismissed).toBe(true);

    const bootstrapJson = await expectJson(
      await apiFetch(`/api/admin/blueprint/${seasonId}`, {
        method: "GET",
        cookie: adminCookie,
      }),
      200,
    );
    const slot = bootstrapJson.slots.find((s: any) => s.template.id === templateId);
    expect(slot).toBeDefined();
    expect(slot.guardrails.dismissed).toBe(true);
    expect(typeof slot.guardrails.dismissedBy).toBe("string");
    expect(slot.guardrails.dismissedBy.length).toBeGreaterThan(0);
    expect(typeof slot.guardrails.dismissedAt).toBe("string");
    expect(Number.isNaN(new Date(slot.guardrails.dismissedAt).getTime())).toBe(false);
  });

  it("is idempotent — a second POST for the same pair does not duplicate the row", async (ctx) => {
    if (!sequenceId || !templateId) {
      ctx.skip();
      return;
    }
    const res = await apiFetch(DISMISSALS_ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ sequenceId, templateId }),
    });
    const json = await expectJson(res, 200);
    expect(json.dismissed).toBe(true);

    const rows = await getDb()
      .select()
      .from(blueprintWarningDismissals)
      .where(
        and(
          eq(blueprintWarningDismissals.sequenceId, sequenceId),
          eq(blueprintWarningDismissals.templateId, templateId),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("CRITICAL: survives an arc mutation (entries PUT delete-reinserts with fresh UUIDs)", async (ctx) => {
    if (!sequenceId || !templateId || !seasonId) {
      ctx.skip();
      return;
    }

    // Grab the entry id BEFORE the mutation to confirm it actually changes
    // (proving this test exercises the delete-reinsert, not a no-op).
    const beforeJson = await expectJson(
      await apiFetch(`/api/admin/blueprint/${seasonId}`, {
        method: "GET",
        cookie: adminCookie,
      }),
      200,
    );
    const beforeEntryId = beforeJson.slots.find(
      (s: any) => s.template.id === templateId,
    )?.entryId;
    expect(beforeEntryId).toBeTruthy();

    // Re-PUT the same template twice (reorder/re-add) — entries.ts deletes
    // every row for this sequence and reinserts with brand-new UUIDs.
    const entriesRes = await apiFetch(`${SEQUENCES_ENDPOINT}/${sequenceId}/entries`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({ entries: [{ templateId }, { templateId }] }),
    });
    expect(entriesRes.status).toBe(200);

    const afterJson = await expectJson(
      await apiFetch(`/api/admin/blueprint/${seasonId}`, {
        method: "GET",
        cookie: adminCookie,
      }),
      200,
    );
    const afterSlots = afterJson.slots.filter((s: any) => s.template.id === templateId);
    expect(afterSlots.length).toBe(2);
    // Sanity: the entry id really did change (proves the fresh-UUID
    // reinsert happened, not that the PUT was a no-op).
    expect(afterSlots.every((s: any) => s.entryId !== beforeEntryId)).toBe(true);
    // The dismissal survives on BOTH the (regenerated) entries, because
    // it's keyed by (sequenceId, templateId), not sequence_entry_id.
    for (const slot of afterSlots) {
      expect(slot.guardrails.dismissed).toBe(true);
      expect(typeof slot.guardrails.dismissedBy).toBe("string");
    }
  });
});
