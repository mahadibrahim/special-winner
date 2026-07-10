/**
 * Blueprint workspace bootstrap tests (Program Blueprint T6). See "The
 * Blueprint workspace" in
 * docs/superpowers/specs/2026-07-10-program-blueprint-design.md.
 *
 * Covers GET /api/admin/blueprint/[seasonId]:
 *   - 200 shape for an org season (program/season/band/noun/templates).
 *   - BLOCK tier surfaces on a slot whose template carries a safety-flagged
 *     skill, evaluated against the season's REAL age band (not the
 *     sequence's own stage proxy — see blueprint-attach.test.ts for why
 *     those two can diverge). Same fixture shape as blueprint-guardrails.test.ts:
 *     the sequence is pinned to the "development" stage (ages 11-12) so
 *     entries.ts's write-time proxy check lets the heading-flagged entry
 *     save, and the season itself is ages 6-8 (fundamentals) — below the
 *     heading rule's floor of 11 — so the bootstrap's real-band evaluation
 *     blocks it.
 *   - WARN tier surfaces on a slot whose `activitySuggestions` resolve to a
 *     real curriculum activity tagged for a different stage than the
 *     season's band ("Passing Combinations" is appropriateStages:
 *     ["skill-building"]; the season is "fundamentals").
 *   - POST /api/admin/blueprint/[seasonId] links a sequence to the season
 *     (the sequence-discovery mechanism this endpoint introduces).
 *   - Cross-org season 404s; parent-role 403s.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { skills, skillDomains } from "@/lib/db/schema";
import {
  apiFetch,
  expectJson,
  getAdminCookie,
  getParentCookie,
  testSlug,
  resetCookies,
} from "../setup/test-helpers";

const SEQUENCES_ENDPOINT = "/api/admin/curriculum/sequences";
const HEADING_SKILL_SLUG = "heading-defensive";
const WARN_ACTIVITY_NAME = "Passing Combinations";

describe("Blueprint bootstrap — GET/POST /api/admin/blueprint/[seasonId]", () => {
  let adminCookie: string;
  let orgASportId: string;
  let programId: string;
  let developmentStageId: string | null = null;
  let headingSkillId: string | null = null;
  let createdHeadingSkill = false;

  let blockedTemplateId: string | null = null;
  let warnTemplateId: string | null = null;
  let sequenceId: string | null = null;
  let seasonId: string | null = null;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    // Sport MUST come from the program itself, not just "the org's first
    // sport" — this endpoint's POST validates the linked sequence's sport
    // against the program's actual sport (the program used below is not
    // necessarily for the org's first-listed sport).
    const programsJson = await expectJson(
      await apiFetch("/api/admin/programs", { method: "GET", cookie: adminCookie }),
      200,
    );
    programId = programsJson.programs[0].id;
    orgASportId = programsJson.programs[0].sport.id;

    // "development" stage (ages 11-12) — old enough that entries.ts's
    // write-time proxy check (stage.ageMin < rule.minAge=11) does NOT
    // block the heading-skill template, same fixture shape as
    // blueprint-attach.test.ts. The bootstrap endpoint re-evaluates
    // against the REAL season band (set below to fundamentals, 6-8),
    // which is where the block is expected to actually surface.
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

    const db = getDb();
    const [existing] = await db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.slug, HEADING_SKILL_SLUG))
      .orderBy(asc(skills.id))
      .limit(1);
    if (existing) {
      headingSkillId = existing.id;
    } else {
      const [anyDomain] = await db
        .select({ id: skillDomains.id })
        .from(skillDomains)
        .orderBy(asc(skillDomains.id))
        .limit(1);
      expect(anyDomain, "expected at least one seeded skill_domains row").toBeTruthy();
      const [inserted] = await db
        .insert(skills)
        .values({
          sportId: orgASportId,
          domainId: anyDomain.id,
          stageId: developmentStageId,
          name: "Heading - Defensive",
          slug: HEADING_SKILL_SLUG,
          active: true,
        })
        .returning({ id: skills.id });
      headingSkillId = inserted.id;
      createdHeadingSkill = true;
    }

    // Template carrying the safety-flagged skill.
    const blockedTplRes = await apiFetch("/api/admin/curriculum/templates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        stageId: developmentStageId,
        name: testSlug("bootstrap-blocked-tpl"),
        totalDurationMinutes: 45,
        structure: [{ name: "Heading practice", type: "technical", durationMinutes: 20 }],
        focusSkillIds: [headingSkillId],
      }),
    });
    blockedTemplateId = (await expectJson(blockedTplRes, 201)).template.id;

    // Template whose activitySuggestions resolve to a real registry
    // activity tagged for a different stage than the season's band — no
    // safety-flagged skill involved, this is a pure stage-skew WARN.
    const warnTplRes = await apiFetch("/api/admin/curriculum/templates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        stageId: developmentStageId,
        name: testSlug("bootstrap-warn-tpl"),
        totalDurationMinutes: 45,
        structure: [
          {
            name: "Combination play",
            type: "technical",
            durationMinutes: 20,
            activitySuggestions: [WARN_ACTIVITY_NAME],
          },
        ],
      }),
    });
    warnTemplateId = (await expectJson(warnTplRes, 201)).template.id;

    // Sequence pinned to "development" (ages 11-12) — the write-time proxy
    // stage. Two entries: the blocked one, then the warn one.
    const seqRes = await apiFetch(SEQUENCES_ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        developmentStageId,
        programType: "class",
        name: testSlug("bootstrap-sequence"),
      }),
    });
    sequenceId = (await expectJson(seqRes, 201)).sequence.id;

    const entriesRes = await apiFetch(`${SEQUENCES_ENDPOINT}/${sequenceId}/entries`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        entries: [{ templateId: blockedTemplateId }, { templateId: warnTemplateId }],
      }),
    });
    // Sanity: entries.ts's stage-proxy check must NOT block this write.
    expect(entriesRes.status).toBeGreaterThanOrEqual(200);
    expect(entriesRes.status).toBeLessThan(300);

    // Season: ages 6-8 (fundamentals) — below the heading rule's floor of
    // 11 (triggers BLOCK) and a different stage than "skill-building"
    // (triggers WARN on the second entry).
    const seasonJson = await expectJson(
      await apiFetch("/api/admin/seasons", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Bootstrap Fundamentals Season",
          slug: testSlug("bootstrap-fundamentals-season"),
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          priceCents: 15000,
          status: "draft",
          minAge: 6,
          maxAge: 8,
        }),
      }),
      201,
    );
    seasonId = seasonJson.season.id;

    // Link the sequence to the season via the endpoint under test.
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
    if (blockedTemplateId) {
      await apiFetch(`/api/admin/curriculum/templates/${blockedTemplateId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    }
    if (warnTemplateId) {
      await apiFetch(`/api/admin/curriculum/templates/${warnTemplateId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    }
    if (createdHeadingSkill && headingSkillId) {
      await getDb().delete(skills).where(eq(skills.id, headingSkillId));
    }
    resetCookies();
  });

  it("200s with the full bootstrap shape for an org season", async (ctx) => {
    if (!seasonId) {
      ctx.skip();
      return;
    }
    const json = await expectJson(
      await apiFetch(`/api/admin/blueprint/${seasonId}`, {
        method: "GET",
        cookie: adminCookie,
      }),
      200,
    );

    expect(json.program).toBeDefined();
    expect(json.program.id).toBe(programId);
    expect(json.program.sportId).toBe(orgASportId);
    expect(typeof json.program.name).toBe("string");
    expect(typeof json.program.sportName).toBe("string");

    expect(json.season.id).toBe(seasonId);
    expect(json.season.band).toEqual({ minAge: 6, maxAge: 8, known: true });
    expect(json.season.stageLabels).toContain("Fundamentals");
    expect(json.season.stageSlugs).toContain("fundamentals");

    expect(typeof json.noun).toBe("string");
    expect(json.sequence).toBeDefined();
    expect(json.sequence.id).toBe(sequenceId);

    expect(Array.isArray(json.templates)).toBe(true);
    expect(json.templates.length).toBeGreaterThan(0);
    const templateIds = json.templates.map((t: any) => t.id);
    expect(templateIds).toContain(blockedTemplateId);
    expect(templateIds).toContain(warnTemplateId);
  });

  it("surfaces a BLOCK on the heading-flagged slot with the rule text, evaluated against the REAL season band", async (ctx) => {
    if (!seasonId) {
      ctx.skip();
      return;
    }
    const json = await expectJson(
      await apiFetch(`/api/admin/blueprint/${seasonId}`, {
        method: "GET",
        cookie: adminCookie,
      }),
      200,
    );

    expect(Array.isArray(json.slots)).toBe(true);
    const blockedSlot = json.slots.find((s: any) => s.template.id === blockedTemplateId);
    expect(blockedSlot).toBeDefined();
    expect(blockedSlot.guardrails.blocks.length).toBeGreaterThan(0);
    expect(blockedSlot.guardrails.blocks[0].rule).toBe(
      "No heading in training for players 10 and under",
    );
    expect(blockedSlot.guardrails.blocks[0].source).toContain("US Soccer");
    expect(blockedSlot.guardrails.dismissed).toBe(false);
  });

  it("surfaces a WARN (not a block) on the stage-skew slot, undismissed", async (ctx) => {
    if (!seasonId) {
      ctx.skip();
      return;
    }
    const json = await expectJson(
      await apiFetch(`/api/admin/blueprint/${seasonId}`, {
        method: "GET",
        cookie: adminCookie,
      }),
      200,
    );

    const warnSlot = json.slots.find((s: any) => s.template.id === warnTemplateId);
    expect(warnSlot).toBeDefined();
    expect(warnSlot.guardrails.blocks).toHaveLength(0);
    expect(warnSlot.guardrails.warns.length).toBeGreaterThan(0);
    expect(warnSlot.guardrails.warns[0].reason.toLowerCase()).toContain("written for");
    expect(warnSlot.guardrails.dismissed).toBe(false);
  });

  it("404s a cross-org season id", async (ctx) => {
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
    const res = await apiFetch(`/api/admin/blueprint/${orgBJson.seasonId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    expect(res.status).toBe(404);
  });

  it("403s a parent-role caller", async (ctx) => {
    if (!seasonId) {
      ctx.skip();
      return;
    }
    const parentCookie = await getParentCookie();
    const res = await apiFetch(`/api/admin/blueprint/${seasonId}`, {
      method: "GET",
      cookie: parentCookie,
    });
    expect(res.status).toBe(403);
  });
});
