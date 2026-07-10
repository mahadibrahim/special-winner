/**
 * Server-side BLOCK-tier age guardrail enforcement on the sequence-entry
 * write path (Program Blueprint T3). See "Age guardrails (two-tier)" in
 * docs/superpowers/specs/2026-07-10-program-blueprint-design.md.
 *
 * The season isn't known at entry-write time (sequences attach to seasons
 * later), so entries.ts evaluates BLOCK using the sequence's own stage as
 * a proxy age band. This suite pins a sequence to the "fundamentals" stage
 * (ages 6-8) and posts an entry whose template carries the safety-flagged
 * "heading-defensive" skill (US Soccer heading policy, minAge 11) — that
 * must 422 with the rule text and write nothing. A template with no
 * flagged skill must succeed normally.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { skills, skillDomains, seasons } from "@/lib/db/schema";
import { apiFetch, expectJson, getAdminCookie, testSlug, resetCookies } from "../setup/test-helpers";

const SEQUENCES_ENDPOINT = "/api/admin/curriculum/sequences";
const HEADING_SKILL_SLUG = "heading-defensive";

describe("Blueprint guardrails — BLOCK tier on sequence-entry write", () => {
  let adminCookie: string;
  let orgASportId: string;
  let fundamentalsStageId: string | null = null;
  let headingSkillId: string | null = null;
  let createdHeadingSkill = false;
  let blockedTemplateId: string | null = null;
  let cleanTemplateId: string | null = null;
  let unlinkedTemplateId: string | null = null;
  let sequenceId: string | null = null;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    const sportsRes = await apiFetch("/api/admin/sports", {
      method: "GET",
      cookie: adminCookie,
    });
    const sportsJson = await expectJson(sportsRes, 200);
    orgASportId = sportsJson.sports[0].id;

    // Stage reference data via the templates endpoint's reference lists
    // (same source tests/api/admin/curriculum-sequences.test.ts uses).
    const tplListRes = await apiFetch("/api/admin/curriculum/templates", {
      method: "GET",
      cookie: adminCookie,
    });
    const tplListJson = await expectJson(tplListRes, 200);
    const fundamentalsStage = (tplListJson.stages ?? []).find(
      (s: any) => s.slug === "fundamentals",
    );
    fundamentalsStageId = fundamentalsStage?.id ?? null;
    if (!fundamentalsStageId) return; // runtime skip: no development_stages seeded

    const db = getDb();

    // Reuse a real "heading-defensive" skill row if the curriculum content
    // is already loaded for this sport; otherwise build the minimal
    // fixture ourselves (same pattern as tests/api/coach/glows.test.ts's
    // "ball-control" grow fixture) so this test is self-sufficient on a
    // clean DB.
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
          stageId: fundamentalsStageId,
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
        stageId: fundamentalsStageId,
        name: testSlug("guardrail-blocked-tpl"),
        totalDurationMinutes: 45,
        structure: [{ name: "Heading practice", type: "technical", durationMinutes: 20 }],
        focusSkillIds: [headingSkillId],
      }),
    });
    blockedTemplateId = (await expectJson(blockedTplRes, 201)).template.id;

    // Clean template — no flagged skills.
    const cleanTplRes = await apiFetch("/api/admin/curriculum/templates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        stageId: fundamentalsStageId,
        name: testSlug("guardrail-clean-tpl"),
        totalDurationMinutes: 45,
        structure: [{ name: "Passing warmup", type: "technical", durationMinutes: 20 }],
      }),
    });
    cleanTemplateId = (await expectJson(cleanTplRes, 201)).template.id;

    // Sequence pinned to the fundamentals stage (ages 6-8) — below the
    // heading rule's minAge of 11.
    const seqRes = await apiFetch(SEQUENCES_ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        developmentStageId: fundamentalsStageId,
        programType: "class",
        name: testSlug("guardrail-sequence"),
      }),
    });
    sequenceId = (await expectJson(seqRes, 201)).sequence.id;
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
    if (cleanTemplateId) {
      await apiFetch(`/api/admin/curriculum/templates/${cleanTemplateId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    }
    if (unlinkedTemplateId) {
      await apiFetch(`/api/admin/curriculum/templates/${unlinkedTemplateId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    }
    if (createdHeadingSkill && headingSkillId) {
      await getDb().delete(skills).where(eq(skills.id, headingSkillId));
    }
    resetCookies();
  });

  it("blocks an entry whose template contains a safety-blocked skill for this sequence's stage (422 with rule text)", async () => {
    if (!sequenceId || !blockedTemplateId) return; // runtime skip

    const res = await apiFetch(`${SEQUENCES_ENDPOINT}/${sequenceId}/entries`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({ entries: [{ templateId: blockedTemplateId }] }),
    });
    const json = await expectJson(res, 422);
    expect(Array.isArray(json.blocks)).toBe(true);
    expect(json.blocks.length).toBeGreaterThan(0);
    const block = json.blocks[0];
    expect(block.rule).toBe("No heading in training for players 10 and under");
    expect(block.source).toContain("US Soccer");
    expect(block.reason.toLowerCase()).toContain("blocked");
  });

  it("does not write entries when a block fires", async () => {
    if (!sequenceId) return;

    const detail = await expectJson(
      await apiFetch(`${SEQUENCES_ENDPOINT}/${sequenceId}`, {
        method: "GET",
        cookie: adminCookie,
      }),
      200,
    );
    expect(detail.entries).toHaveLength(0);
  });

  it("allows a clean template with no safety-flagged skills through (2xx)", async () => {
    if (!sequenceId || !cleanTemplateId) return;

    const res = await apiFetch(`${SEQUENCES_ENDPOINT}/${sequenceId}/entries`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({ entries: [{ templateId: cleanTemplateId }] }),
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    const json = await res.json();
    expect(json.entries).toHaveLength(1);
  });

  // T2/T3 review finding #2: editing a template already used in a sequence
  // must re-run the BLOCK-tier guardrail against that sequence's stage --
  // not just at entry-write time. cleanTemplateId is now linked to
  // sequenceId (fundamentals, ages 6-8) by the previous test.
  it("blocks a template edit that adds a safety-blocked skill to a template already linked to a sequence (422, no write)", async () => {
    if (!cleanTemplateId || !headingSkillId) return; // runtime skip

    const res = await apiFetch(`/api/admin/curriculum/templates/${cleanTemplateId}`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({ focusSkillIds: [headingSkillId] }),
    });
    const json = await expectJson(res, 422);
    expect(Array.isArray(json.blocks)).toBe(true);
    expect(json.blocks.length).toBeGreaterThan(0);
    expect(json.blocks[0].rule).toBe("No heading in training for players 10 and under");

    // Verify no write happened.
    const getRes = await apiFetch(`/api/admin/curriculum/templates/${cleanTemplateId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    const getJson = await expectJson(getRes, 200);
    expect(getJson.template.focusSkillIds ?? []).not.toContain(headingSkillId);
  });

  it("allows the same edit on a template with no linked sequences (2xx)", async () => {
    if (!fundamentalsStageId || !headingSkillId) return; // runtime skip

    const createRes = await apiFetch("/api/admin/curriculum/templates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        stageId: fundamentalsStageId,
        name: testSlug("guardrail-unlinked-tpl"),
        totalDurationMinutes: 45,
        structure: [{ name: "Passing warmup", type: "technical", durationMinutes: 20 }],
      }),
    });
    unlinkedTemplateId = (await expectJson(createRes, 201)).template.id;

    const res = await apiFetch(`/api/admin/curriculum/templates/${unlinkedTemplateId}`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({ focusSkillIds: [headingSkillId] }),
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
  });
});

/**
 * I1 — season PUT band edits must not bypass the distribution safety
 * lattice. seasons.ts's PUT handler only ever validated the NEW payload in
 * isolation; it never re-ran the BLOCK-tier guardrail against a season
 * that already has a linked/distributed sequence. So narrowing a season's
 * age band (minAge/maxAge/ageGroupId) AFTER a heading-content sequence was
 * linked/distributed to it could silently make previously-safe content
 * unsafe — the attach endpoint's re-check never re-fires because nothing
 * calls it again on a season edit. This suite links (not full-distributes;
 * linking alone already satisfies "the season has a linked sequence") a
 * heading-flagged sequence to a safe (12-14) season, then exercises the
 * PUT re-check: narrowing to U8 must 422 with rule text and write nothing;
 * widening (still >= the rule's floor) must succeed normally.
 */
describe("Blueprint guardrails — season PUT re-check on band-relevant edits (I1)", () => {
  let adminCookie: string;
  let orgASportId: string;
  let programId: string;
  let developmentStageId: string | null = null;
  let headingSkillId: string | null = null;
  let createdHeadingSkill = false;

  let blockedTemplateId: string | null = null;
  let sequenceId: string | null = null;
  let seasonId: string | null = null;
  let seasonSlug: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    const programsJson = await expectJson(
      await apiFetch("/api/admin/programs", { method: "GET", cookie: adminCookie }),
      200,
    );
    programId = programsJson.programs[0].id;
    orgASportId = programsJson.programs[0].sport.id;

    // "development" stage (ages 11-12) — old enough that entries.ts's
    // write-time proxy check lets the heading-skill entry save (same
    // fixture shape as blueprint-attach.test.ts). The season itself starts
    // at 12-14 (also safe) so the ONLY thing under test is the PUT
    // re-check firing when the season's own band is edited afterward.
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
      .where(eq(skills.slug, "heading-defensive"))
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
          slug: "heading-defensive",
          active: true,
        })
        .returning({ id: skills.id });
      headingSkillId = inserted.id;
      createdHeadingSkill = true;
    }

    const blockedTplRes = await apiFetch("/api/admin/curriculum/templates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        stageId: developmentStageId,
        name: testSlug("season-put-blocked-tpl"),
        totalDurationMinutes: 45,
        structure: [{ name: "Heading practice", type: "technical", durationMinutes: 20 }],
        focusSkillIds: [headingSkillId],
      }),
    });
    blockedTemplateId = (await expectJson(blockedTplRes, 201)).template.id;

    const seqRes = await apiFetch("/api/admin/curriculum/sequences", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        developmentStageId,
        programType: "league",
        name: testSlug("season-put-sequence"),
      }),
    });
    sequenceId = (await expectJson(seqRes, 201)).sequence.id;

    await expectJson(
      await apiFetch(`/api/admin/curriculum/sequences/${sequenceId}/entries`, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({ entries: [{ templateId: blockedTemplateId }] }),
      }),
      200,
    );

    // Season starts safe: 12-14, above the heading rule's floor of 11.
    seasonSlug = testSlug("season-put-band-season");
    const seasonJson = await expectJson(
      await apiFetch("/api/admin/seasons", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Season PUT Band Re-check Season",
          slug: seasonSlug,
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

    // Link the sequence to the season (the same "composing" pointer the
    // distribution engine reads/writes) WITHOUT running a full
    // distribution — linking alone already satisfies "the season has a
    // linked sequence" per the fix's trigger condition.
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
      await apiFetch(`/api/admin/curriculum/sequences/${sequenceId}`, {
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
    if (createdHeadingSkill && headingSkillId) {
      await getDb().delete(skills).where(eq(skills.id, headingSkillId));
    }
    resetCookies();
  });

  const putSeasonBody = (overrides: Record<string, unknown>) => ({
    id: seasonId,
    programId,
    name: "Season PUT Band Re-check Season",
    slug: seasonSlug,
    startDate: "2026-09-01",
    endDate: "2026-12-15",
    priceCents: 15000,
    status: "draft",
    ...overrides,
  });

  it("422s narrowing a linked season to U8 (below the heading rule's floor), writes nothing", async (ctx) => {
    if (!seasonId || !sequenceId) {
      ctx.skip();
      return;
    }
    const res = await apiFetch("/api/admin/seasons", {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify(putSeasonBody({ minAge: 6, maxAge: 8 })),
    });
    const json = await expectJson(res, 422);
    expect(Array.isArray(json.blocks)).toBe(true);
    expect(json.blocks.length).toBeGreaterThan(0);
    expect(json.blocks[0].rule).toBe("No heading in training for players 10 and under");

    // No write: the season's band on disk is unchanged.
    const [row] = await getDb()
      .select({ minAge: seasons.minAge, maxAge: seasons.maxAge })
      .from(seasons)
      .where(eq(seasons.id, seasonId));
    expect(row.minAge).toBe(12);
    expect(row.maxAge).toBe(14);
  });

  it("200s widening the band (still clears the heading rule's floor)", async (ctx) => {
    if (!seasonId || !sequenceId) {
      ctx.skip();
      return;
    }
    const res = await apiFetch("/api/admin/seasons", {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify(putSeasonBody({ minAge: 11, maxAge: 20 })),
    });
    const json = await expectJson(res, 200);
    expect(json.season.minAge).toBe(11);
    expect(json.season.maxAge).toBe(20);
  });

  it("200s a band-unchanged edit even though this season has blocked content linked", async (ctx) => {
    if (!seasonId || !sequenceId) {
      ctx.skip();
      return;
    }
    // Same band as the previous test left it (11-20) -- an edit that
    // doesn't touch minAge/maxAge/ageGroupId skips the re-check entirely
    // (bandFieldsChanged is false), so it succeeds regardless of what's
    // linked.
    const res = await apiFetch("/api/admin/seasons", {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify(
        putSeasonBody({ minAge: 11, maxAge: 20, name: "Season PUT Band Re-check Season (renamed)" }),
      ),
    });
    const json = await expectJson(res, 200);
    expect(json.season.name).toBe("Season PUT Band Re-check Season (renamed)");
  });
});
