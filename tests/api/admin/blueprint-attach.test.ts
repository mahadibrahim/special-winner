/**
 * Distribution engine tests (Program Blueprint T4). See "Distribution" +
 * "Data" in docs/superpowers/specs/2026-07-10-program-blueprint-design.md.
 *
 * Attach is the LAST safety gate: a sequence can save entries that pass its
 * own stage-proxy check (entries.ts, evaluated at write time against the
 * sequence's OWN development stage) and still be unsafe once attached to a
 * real season with a younger effective age band. This suite pins the
 * "blocked" sequence to the "development" stage (ages 11-12) — old enough
 * that entries.ts's proxy check lets a heading-skill template through —
 * then attaches it to a real U8 season (minAge 6) to exercise the
 * distribution-time re-check.
 *
 * Covers: planned status + sequenceAttachmentId lineage on generated
 * sessions, one sequence_attachments row per productive POST (none when a
 * re-POST generates nothing new), attach-preview conflict/alreadyDistributed
 * accounting, and the safety block firing identically on both POST and
 * preview.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, asc, and, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { skills, skillDomains, sequenceAttachments, sessionPlans } from "@/lib/db/schema";
import { groupNoun } from "@/lib/programs/group-noun";
import {
  apiFetch,
  expectJson,
  getAdminCookie,
  getCoachCookie,
  testSlug,
  resetCookies,
} from "../setup/test-helpers";

const SEQUENCES_ENDPOINT = "/api/admin/curriculum/sequences";
const HEADING_SKILL_SLUG = "heading-defensive";

describe("Blueprint distribution engine — attach + attach-preview", () => {
  let adminCookie: string;
  let coachCookie: string;
  let adminUserId: string;
  let coachUserId: string;
  let orgASportId: string;
  let programId: string;
  let expectedNoun: string;
  let developmentStageId: string | null = null;
  let headingSkillId: string | null = null;
  let createdHeadingSkill = false;

  let cleanTemplateId: string | null = null;
  let blockedTemplateId: string | null = null;

  let safeSequenceId: string | null = null;
  let blockedSequenceId: string | null = null;

  let safeSeasonId: string;
  let safeTeamId: string;
  let unsafeSeasonId: string;
  let unsafeTeamId: string;

  // Saturdays, no DST ambiguity (both after the 2026-11-01 fall-back);
  // org timezone defaults to America/New_York (EST, UTC-5) here.
  const recurrence = {
    weekday: 6,
    startDate: "2026-11-07",
    timeOfDay: "09:00",
    count: 2,
  };
  const DATE_1 = "2026-11-07T14:00:00.000Z";
  const DATE_2 = "2026-11-14T14:00:00.000Z";

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    coachCookie = await getCoachCookie();

    const adminMe = await expectJson(
      await apiFetch("/api/auth/me", { method: "GET", cookie: adminCookie }),
      200,
    );
    adminUserId = adminMe.user.id;
    const coachMe = await expectJson(
      await apiFetch("/api/auth/me", { method: "GET", cookie: coachCookie }),
      200,
    );
    coachUserId = coachMe.user.id;

    const sportsRes = await apiFetch("/api/admin/sports", {
      method: "GET",
      cookie: adminCookie,
    });
    orgASportId = (await expectJson(sportsRes, 200)).sports[0].id;

    const programsJson = await expectJson(
      await apiFetch("/api/admin/programs", { method: "GET", cookie: adminCookie }),
      200,
    );
    programId = programsJson.programs[0].id;
    expectedNoun = groupNoun(programsJson.programs[0].programType);

    // "development" stage (ages 11-12) — old enough that entries.ts's
    // write-time proxy check (stage.ageMin < rule.minAge=11) does NOT fire
    // for a heading-skill template, so the blocked sequence's entry can
    // actually be saved. The real safety gate this suite exercises is
    // distribution-time, against the season's own band.
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

    // Clean template — no flagged skills, used by the "safe" sequence.
    const cleanTplRes = await apiFetch("/api/admin/curriculum/templates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        stageId: developmentStageId,
        name: testSlug("distribution-clean-tpl"),
        totalDurationMinutes: 45,
        structure: [{ name: "Passing warmup", type: "technical", durationMinutes: 20 }],
      }),
    });
    cleanTemplateId = (await expectJson(cleanTplRes, 201)).template.id;

    // Blocked template — carries the heading-defensive skill.
    const blockedTplRes = await apiFetch("/api/admin/curriculum/templates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        stageId: developmentStageId,
        name: testSlug("distribution-blocked-tpl"),
        totalDurationMinutes: 45,
        structure: [{ name: "Heading practice", type: "technical", durationMinutes: 20 }],
        focusSkillIds: [headingSkillId],
      }),
    });
    blockedTemplateId = (await expectJson(blockedTplRes, 201)).template.id;

    // Safe sequence: 2 entries, clean template, no safety flags.
    const safeSeqRes = await apiFetch(SEQUENCES_ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        developmentStageId,
        programType: "league",
        name: testSlug("distribution-safe-sequence"),
      }),
    });
    safeSequenceId = (await expectJson(safeSeqRes, 201)).sequence.id;
    await expectJson(
      await apiFetch(`${SEQUENCES_ENDPOINT}/${safeSequenceId}/entries`, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          entries: [{ templateId: cleanTemplateId }, { templateId: cleanTemplateId }],
        }),
      }),
      200,
    );

    // Blocked sequence: 1 entry, heading-flagged template. Entries.ts's
    // own proxy check (development stage, ageMin 11) lets this through.
    const blockedSeqRes = await apiFetch(SEQUENCES_ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        developmentStageId,
        programType: "clinic",
        name: testSlug("distribution-blocked-sequence"),
      }),
    });
    blockedSequenceId = (await expectJson(blockedSeqRes, 201)).sequence.id;
    const blockedEntriesRes = await apiFetch(
      `${SEQUENCES_ENDPOINT}/${blockedSequenceId}/entries`,
      {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({ entries: [{ templateId: blockedTemplateId }] }),
      },
    );
    // Sanity: entries.ts's stage-proxy check must NOT block this write --
    // if it does, the fixture itself is wrong (see the class doc comment).
    expect(blockedEntriesRes.status).toBeGreaterThanOrEqual(200);
    expect(blockedEntriesRes.status).toBeLessThan(300);

    // Safe season: ages 12-14 (>= the heading rule's minAge 11) — but this
    // season only ever hosts the clean-template sequence, so the band
    // doesn't actually matter for it; it's just a normal season.
    const safeSeasonJson = await expectJson(
      await apiFetch("/api/admin/seasons", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Distribution Safe Season",
          slug: testSlug("dist-safe-season"),
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
    safeSeasonId = safeSeasonJson.season.id;

    const safeTeamJson = await expectJson(
      await apiFetch("/api/admin/teams", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          seasonId: safeSeasonId,
          name: testSlug("dist-safe-team"),
          coachUserId,
        }),
      }),
      201,
    );
    safeTeamId = safeTeamJson.team.id;

    // Unsafe (U8) season: minAge 6 — below the heading rule's floor of 11.
    const unsafeSeasonJson = await expectJson(
      await apiFetch("/api/admin/seasons", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          programId,
          name: "Distribution U8 Season",
          slug: testSlug("dist-u8-season"),
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
    unsafeSeasonId = unsafeSeasonJson.season.id;

    const unsafeTeamJson = await expectJson(
      await apiFetch("/api/admin/teams", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          seasonId: unsafeSeasonId,
          name: testSlug("dist-u8-team"),
          coachUserId,
        }),
      }),
      201,
    );
    unsafeTeamId = unsafeTeamJson.team.id;
  });

  afterAll(async () => {
    if (safeSequenceId) {
      await apiFetch(`${SEQUENCES_ENDPOINT}/${safeSequenceId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    }
    if (blockedSequenceId) {
      await apiFetch(`${SEQUENCES_ENDPOINT}/${blockedSequenceId}`, {
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

  describe("POST attach — planned sessions, lineage, per-run attachment row", () => {
    it("(a) generates planned sessions carrying sequenceAttachmentId, and a matching attachment row", async () => {
      if (!safeSequenceId) return; // runtime skip: no development_stages seeded

      const res = await apiFetch(`${SEQUENCES_ENDPOINT}/${safeSequenceId}/attach`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ seasonId: safeSeasonId, ...recurrence }),
      });
      const json = await expectJson(res, 200);
      expect(json.attached).toBe(true);
      expect(json.truncatedBySeasonEnd).toBe(false);
      expect(json.attachmentId).toBeTruthy();

      const teamResult = json.results.find((r: any) => r.teamId === safeTeamId);
      expect(teamResult.created).toBe(2);
      expect(teamResult.error).toBeUndefined();

      // Sessions arrive "planned" (prescribed), not "draft", and carry the
      // attachment's id as lineage.
      const sessions = await expectJson(
        await apiFetch(`/api/coach/sessions?teamId=${safeTeamId}`, {
          method: "GET",
          cookie: coachCookie,
        }),
        200,
      );
      expect(sessions.sessions).toHaveLength(2);
      for (const s of sessions.sessions) {
        expect(s.status).toBe("planned");
      }

      // The attachment row itself exists, pinned to this sequence/season,
      // audited to the admin who ran it.
      const [attachmentRow] = await getDb()
        .select()
        .from(sequenceAttachments)
        .where(eq(sequenceAttachments.id, json.attachmentId));
      expect(attachmentRow).toBeTruthy();
      expect(attachmentRow.sequenceId).toBe(safeSequenceId);
      expect(attachmentRow.seasonId).toBe(safeSeasonId);
      expect(attachmentRow.distributedBy).toBe(adminUserId);

      // Every generated session_plans row for this team points back at it.
      const linkedSessions = await getDb()
        .select()
        .from(sessionPlans)
        .where(eq(sessionPlans.teamId, safeTeamId));
      expect(linkedSessions.length).toBeGreaterThanOrEqual(2);
      for (const row of linkedSessions) {
        expect(row.sequenceAttachmentId).toBe(json.attachmentId);
        expect(row.status).toBe("planned");
      }
    });

    it("(b) is idempotent: a re-POST creates nothing new and does not persist a second attachment row", async () => {
      if (!safeSequenceId) return;

      const res = await apiFetch(`${SEQUENCES_ENDPOINT}/${safeSequenceId}/attach`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ seasonId: safeSeasonId, ...recurrence }),
      });
      const json = await expectJson(res, 200);
      const teamResult = json.results.find((r: any) => r.teamId === safeTeamId);
      expect(teamResult.created).toBe(0);
      expect(teamResult.skippedExisting).toBe(2);
      // Nothing new was distributed by this run -- no attachment row kept.
      expect(json.attachmentId).toBeNull();

      const attachmentRows = await getDb()
        .select()
        .from(sequenceAttachments)
        .where(
          and(
            eq(sequenceAttachments.sequenceId, safeSequenceId),
            eq(sequenceAttachments.seasonId, safeSeasonId),
          ),
        );
      expect(attachmentRows).toHaveLength(1); // only the (a) run's row persists
    });
  });

  describe("GET attach-preview — conflicts + alreadyDistributed accounting", () => {
    it("(c) shows a conflict for an existing same-day session, then the correct alreadyDistributed count once distributed", async () => {
      if (!safeSequenceId) return;

      // Fresh season/team pair so this test's preview accounting isn't
      // entangled with the (a)/(b) attach state above.
      const previewSeasonJson = await expectJson(
        await apiFetch("/api/admin/seasons", {
          method: "POST",
          cookie: adminCookie,
          body: JSON.stringify({
            programId,
            name: "Distribution Preview Season",
            slug: testSlug("dist-preview-season"),
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
      const previewSeasonId = previewSeasonJson.season.id;
      const previewTeamJson = await expectJson(
        await apiFetch("/api/admin/teams", {
          method: "POST",
          cookie: adminCookie,
          body: JSON.stringify({
            seasonId: previewSeasonId,
            name: testSlug("dist-preview-team"),
            coachUserId,
          }),
        }),
        201,
      );
      const previewTeamId = previewTeamJson.team.id;

      // An unrelated, manually-created coach session on the first
      // candidate date -- a genuine scheduling conflict, not something
      // this sequence put there.
      await expectJson(
        await apiFetch("/api/coach/sessions", {
          method: "POST",
          cookie: coachCookie,
          body: JSON.stringify({
            teamId: previewTeamId,
            title: "Unrelated pre-existing session",
            scheduledDate: DATE_1,
            durationMinutes: 60,
          }),
        }),
        201,
      );

      const previewUrl =
        `${SEQUENCES_ENDPOINT}/${safeSequenceId}/attach-preview` +
        `?seasonId=${previewSeasonId}&weekday=${recurrence.weekday}` +
        `&startDate=${recurrence.startDate}&timeOfDay=${recurrence.timeOfDay}` +
        `&count=${recurrence.count}`;

      const preview1 = await expectJson(
        await apiFetch(previewUrl, { method: "GET", cookie: adminCookie }),
        200,
      );
      const group1 = preview1.groups.find((g: any) => g.teamId === previewTeamId);
      expect(group1).toBeDefined();
      expect(group1.noun).toBe(expectedNoun);
      expect(group1.dates).toEqual([DATE_1, DATE_2]);
      expect(group1.conflicts).toContain(DATE_1);
      expect(group1.alreadyDistributed).toBe(0);
      expect(preview1.safety.blocks).toHaveLength(0);

      // Now actually distribute -- the manual session's different
      // (non-existent) template means it doesn't dedupe against it, so
      // both entries generate fresh.
      const attachRes = await apiFetch(`${SEQUENCES_ENDPOINT}/${safeSequenceId}/attach`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ seasonId: previewSeasonId, ...recurrence }),
      });
      const attachJson = await expectJson(attachRes, 200);
      const previewTeamResult = attachJson.results.find(
        (r: any) => r.teamId === previewTeamId,
      );
      expect(previewTeamResult.created).toBe(2);

      const preview2 = await expectJson(
        await apiFetch(previewUrl, { method: "GET", cookie: adminCookie }),
        200,
      );
      const group2 = preview2.groups.find((g: any) => g.teamId === previewTeamId);
      expect(group2.alreadyDistributed).toBe(2);
      // Both distributed dates now have a session on them too.
      expect(group2.conflicts).toEqual(expect.arrayContaining([DATE_1, DATE_2]));

      expect(preview2.summary.groupCount).toBe(preview2.groups.length);
      expect(preview2.summary.sessionCount).toBe(
        preview2.groups.length * group2.dates.length,
      );

      // Seasons/teams are not deleted here (same convention as
      // curriculum-sequences.test.ts's attach/detach suite) -- team
      // deletion requires super-admin access and isn't worth the extra
      // fixture wiring for a test-only row.
    });
  });

  describe("Safety re-check at the last gate", () => {
    it("(d) blocks attaching a heading-content sequence to a U8 season (422, rule text, zero sessions, zero attachment rows)", async () => {
      if (!blockedSequenceId) return; // runtime skip

      const res = await apiFetch(`${SEQUENCES_ENDPOINT}/${blockedSequenceId}/attach`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ seasonId: unsafeSeasonId, ...recurrence }),
      });
      const json = await expectJson(res, 422);
      expect(Array.isArray(json.blocks)).toBe(true);
      expect(json.blocks.length).toBeGreaterThan(0);
      expect(json.blocks[0].rule).toBe("No heading in training for players 10 and under");
      expect(json.blocks[0].source).toContain("US Soccer");

      const sessions = await expectJson(
        await apiFetch(`/api/coach/sessions?teamId=${unsafeTeamId}`, {
          method: "GET",
          cookie: coachCookie,
        }),
        200,
      );
      expect(sessions.sessions).toHaveLength(0);

      const attachmentRows = await getDb()
        .select()
        .from(sequenceAttachments)
        .where(
          and(
            eq(sequenceAttachments.sequenceId, blockedSequenceId),
            eq(sequenceAttachments.seasonId, unsafeSeasonId),
          ),
        );
      expect(attachmentRows).toHaveLength(0);
    });

    it("(e) attach-preview surfaces the same block, read-only", async () => {
      if (!blockedSequenceId) return;

      const previewUrl =
        `${SEQUENCES_ENDPOINT}/${blockedSequenceId}/attach-preview` +
        `?seasonId=${unsafeSeasonId}&weekday=${recurrence.weekday}` +
        `&startDate=${recurrence.startDate}&timeOfDay=${recurrence.timeOfDay}` +
        `&count=${recurrence.count}`;

      const json = await expectJson(
        await apiFetch(previewUrl, { method: "GET", cookie: adminCookie }),
        200,
      );
      expect(json.safety.bandKnown).toBe(true);
      expect(json.safety.blocks.length).toBeGreaterThan(0);
      expect(json.safety.blocks[0].rule).toBe(
        "No heading in training for players 10 and under",
      );

      // Read-only: nothing written by the preview.
      const sessions = await expectJson(
        await apiFetch(`/api/coach/sessions?teamId=${unsafeTeamId}`, {
          method: "GET",
          cookie: coachCookie,
        }),
        200,
      );
      expect(sessions.sessions).toHaveLength(0);
    });

    it("(f) blocks via the age-group fallback band when the season itself has null min/max", async () => {
      if (!blockedSequenceId) return; // runtime skip

      // Season with NO minAge/maxAge of its own but an ageGroupId (6-8) --
      // exercises resolveEffectiveSeasonBand's fallback branch
      // (distribution-safety.ts: seasonMinAge ?? ageGroupMinAge), not just
      // the season's own fields like the (d)/(e) fixtures do.
      const ageGroupJson = await expectJson(
        await apiFetch("/api/admin/age-groups", {
          method: "POST",
          cookie: adminCookie,
          body: JSON.stringify({
            name: testSlug("dist-fallback-ag"),
            minAge: 6,
            maxAge: 8,
          }),
        }),
        201,
      );
      const ageGroupId = ageGroupJson.ageGroup.id;

      const fallbackSeasonJson = await expectJson(
        await apiFetch("/api/admin/seasons", {
          method: "POST",
          cookie: adminCookie,
          body: JSON.stringify({
            programId,
            ageGroupId,
            name: "Distribution Fallback-Band Season",
            slug: testSlug("dist-fallback-season"),
            startDate: "2026-09-01",
            endDate: "2026-12-15",
            priceCents: 15000,
            status: "draft",
            // minAge/maxAge deliberately omitted -- the season must fall
            // back to the age group's 6-8 band.
          }),
        }),
        201,
      );
      const fallbackSeasonId = fallbackSeasonJson.season.id;

      const res = await apiFetch(`${SEQUENCES_ENDPOINT}/${blockedSequenceId}/attach`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ seasonId: fallbackSeasonId, ...recurrence }),
      });
      const json = await expectJson(res, 422);
      expect(Array.isArray(json.blocks)).toBe(true);
      expect(json.blocks.length).toBeGreaterThan(0);
      expect(json.blocks[0].rule).toBe("No heading in training for players 10 and under");

      // Zero writes -- same fail-closed contract as the season's-own-band
      // block above.
      const attachmentRows = await getDb()
        .select()
        .from(sequenceAttachments)
        .where(
          and(
            eq(sequenceAttachments.sequenceId, blockedSequenceId),
            eq(sequenceAttachments.seasonId, fallbackSeasonId),
          ),
        );
      expect(attachmentRows).toHaveLength(0);
    });
  });

  describe("Prescribed-session dedupe (migration 0078)", () => {
    it("(g) the partial unique index exists at the DB level", async () => {
      const result = await getDb().execute(sql`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'session_plans'
          AND indexname = 'session_plans_prescribed_dedupe_uniq'
      `);
      const rows =
        (result as unknown as { rows?: Array<{ indexname: string }> }).rows ??
        (result as unknown as Array<{ indexname: string }>);
      expect(rows).toHaveLength(1);
    });

    it("(h) a re-POST after (a)/(b) still reports 0 created and adds no new sessions (race-artifact regression)", async () => {
      if (!safeSequenceId) return;

      const before = await getDb()
        .select()
        .from(sessionPlans)
        .where(eq(sessionPlans.teamId, safeTeamId));

      const res = await apiFetch(`${SEQUENCES_ENDPOINT}/${safeSequenceId}/attach`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ seasonId: safeSeasonId, ...recurrence }),
      });
      const json = await expectJson(res, 200);
      const teamResult = json.results.find((r: any) => r.teamId === safeTeamId);
      expect(teamResult.created).toBe(0);
      expect(json.attachmentId).toBeNull();

      const after = await getDb()
        .select()
        .from(sessionPlans)
        .where(eq(sessionPlans.teamId, safeTeamId));
      expect(after.length).toBe(before.length);
    });
  });
});
