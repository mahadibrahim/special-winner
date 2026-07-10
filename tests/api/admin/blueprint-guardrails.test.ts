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
import { skills, skillDomains } from "@/lib/db/schema";
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
});
