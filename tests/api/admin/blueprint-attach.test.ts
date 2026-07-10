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
import { eq, asc, and, sql, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  skills,
  skillDomains,
  sequenceAttachments,
  sessionPlans,
  teams,
} from "@/lib/db/schema";
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
    // Test hygiene: this used to be a silent `return` (a bare return inside
    // beforeAll masks every downstream test as a false "pass" with zero
    // assertions run, not a visible skip) — development_stages is seeded
    // reference data every other suite in this file already depends on
    // unconditionally, so a missing "development" stage here means the
    // environment itself is broken, not an expected/legitimate skip.
    if (!developmentStageId) {
      // Fails loudly (not a silent skip): every other suite in this file
      // depends on this same seeded stage unconditionally, so its absence
      // means the environment itself is broken. expect() throws before
      // `return` ever runs; the `if` shape is kept only so TypeScript can
      // narrow `developmentStageId` to non-null for the rest of this scope.
      expect(developmentStageId, "expected a seeded 'development' development_stages row").toBeTruthy();
      return;
    }

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
      // Test hygiene: safeSequenceId is created earlier in THIS suite's own
      // beforeAll (not conditionally-seeded reference data) — if it's
      // missing, the suite's own setup silently failed and this test
      // should fail loudly, not pass with zero assertions run.
      expect(safeSequenceId, "safeSequenceId should have been created in beforeAll").toBeTruthy();

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

    it("(c3) flags a same-day, different-time existing session as a conflict (review I3: day-level, not exact-instant)", async () => {
      if (!safeSequenceId) {
        // Hard failure, not a silent skip — beforeAll should have created it.
        throw new Error("fixture sequence missing — beforeAll should have created it");
      }

      const daySeasonJson = await expectJson(
        await apiFetch("/api/admin/seasons", {
          method: "POST",
          cookie: adminCookie,
          body: JSON.stringify({
            programId,
            name: "Distribution Day-Level Conflict Season",
            slug: testSlug("dist-day-conflict-season"),
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
      const daySeasonId = daySeasonJson.season.id;
      const dayTeamJson = await expectJson(
        await apiFetch("/api/admin/teams", {
          method: "POST",
          cookie: adminCookie,
          body: JSON.stringify({
            seasonId: daySeasonId,
            name: testSlug("dist-day-conflict-team"),
            coachUserId,
          }),
        }),
        201,
      );
      const dayTeamId = dayTeamJson.team.id;

      // Same calendar day as DATE_1 (2026-11-07), but a DIFFERENT wall
      // time (20:00 UTC / 3pm EST vs. DATE_1's 14:00 UTC / 9am EST) --
      // still Nov 7 in both UTC and the org's own zone, so this isn't a
      // tz-boundary edge case, just an ordinary same-day double-booking.
      // Comparing full ISO instants (the pre-fix behavior) would miss this
      // entirely; day-level comparison must not.
      const SAME_DAY_DIFFERENT_TIME = "2026-11-07T20:00:00.000Z";
      await expectJson(
        await apiFetch("/api/coach/sessions", {
          method: "POST",
          cookie: coachCookie,
          body: JSON.stringify({
            teamId: dayTeamId,
            title: "Same-day different-time session",
            scheduledDate: SAME_DAY_DIFFERENT_TIME,
            durationMinutes: 60,
          }),
        }),
        201,
      );

      const previewUrl =
        `${SEQUENCES_ENDPOINT}/${safeSequenceId}/attach-preview` +
        `?seasonId=${daySeasonId}&weekday=${recurrence.weekday}` +
        `&startDate=${recurrence.startDate}&timeOfDay=${recurrence.timeOfDay}` +
        `&count=${recurrence.count}`;

      const preview = await expectJson(
        await apiFetch(previewUrl, { method: "GET", cookie: adminCookie }),
        200,
      );
      const group = preview.groups.find((g: any) => g.teamId === dayTeamId);
      expect(group).toBeDefined();
      // The candidate date itself (DATE_1, exact instant 14:00 UTC) is
      // flagged as a conflict even though the existing session sits at a
      // different instant (20:00 UTC) on the same calendar day.
      expect(group.conflicts).toContain(DATE_1);
    });

    it("(c2) surfaces a non-blocking WARN for a stage-skewed (but safety-clean) template", async () => {
      // Test hygiene: same reasoning as the beforeAll guard above — by this
      // point developmentStageId is either resolved or the suite already
      // failed loudly there; a bare `return` here would silently no-op.
      expect(developmentStageId, "developmentStageId should have been resolved in beforeAll").toBeTruthy();

      // "Traffic Lights" (soccer/activities.ts) is tagged
      // appropriateStages: ["fundamentals"] (ages 6-8) and carries no
      // safety-ruled skill -- attaching it to a 12-14 season (stages
      // development + competitive, no overlap with fundamentals) should
      // warn on stage fit without ever blocking.
      const skewedTplRes = await apiFetch("/api/admin/curriculum/templates", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          sportId: orgASportId,
          stageId: developmentStageId,
          name: testSlug("distribution-stage-skew-tpl"),
          totalDurationMinutes: 30,
          structure: [
            {
              name: "Traffic Lights drill",
              type: "technical",
              durationMinutes: 20,
              activitySuggestions: ["Traffic Lights"],
            },
          ],
        }),
      });
      const skewedTemplateId = (await expectJson(skewedTplRes, 201)).template.id;

      const skewedSeqRes = await apiFetch(SEQUENCES_ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          sportId: orgASportId,
          developmentStageId,
          programType: "league",
          name: testSlug("distribution-stage-skew-sequence"),
        }),
      });
      const skewedSequenceId = (await expectJson(skewedSeqRes, 201)).sequence.id;
      await expectJson(
        await apiFetch(`${SEQUENCES_ENDPOINT}/${skewedSequenceId}/entries`, {
          method: "PUT",
          cookie: adminCookie,
          body: JSON.stringify({ entries: [{ templateId: skewedTemplateId }] }),
        }),
        200,
      );

      const skewedSeasonJson = await expectJson(
        await apiFetch("/api/admin/seasons", {
          method: "POST",
          cookie: adminCookie,
          body: JSON.stringify({
            programId,
            name: "Distribution Stage-Skew Season",
            slug: testSlug("dist-skew-season"),
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
      const skewedSeasonId = skewedSeasonJson.season.id;
      await expectJson(
        await apiFetch("/api/admin/teams", {
          method: "POST",
          cookie: adminCookie,
          body: JSON.stringify({
            seasonId: skewedSeasonId,
            name: testSlug("dist-skew-team"),
            coachUserId,
          }),
        }),
        201,
      );

      const previewJson = await expectJson(
        await apiFetch(
          `${SEQUENCES_ENDPOINT}/${skewedSequenceId}/attach-preview` +
            `?seasonId=${skewedSeasonId}&weekday=${recurrence.weekday}` +
            `&startDate=${recurrence.startDate}&timeOfDay=${recurrence.timeOfDay}` +
            `&count=1`,
          { method: "GET", cookie: adminCookie },
        ),
        200,
      );

      expect(previewJson.safety.blocks).toHaveLength(0);
      expect(previewJson.safety.warns.length).toBeGreaterThan(0);
      expect(previewJson.safety.warns[0]).toEqual(
        expect.objectContaining({ activityName: "Traffic Lights" }),
      );

      // Season/team left in place (same convention as (c) above); template
      // + sequence are test-scoped and safe to delete.
      await apiFetch(`${SEQUENCES_ENDPOINT}/${skewedSequenceId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
      await apiFetch(`/api/admin/curriculum/templates/${skewedTemplateId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
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

  describe("Fix A — anchors on the first team WITH fresh work, not the oldest team", () => {
    it("(i) re-POST after adding a coached team anchors the new attachment on the new team's sessions, never a zero-session row", async () => {
      if (!safeSequenceId) {
        // Hard failure, not a silent skip — beforeAll should have created it.
        throw new Error("fixture sequence missing — beforeAll should have created it");
      }

      // Fresh season + team A (created first via the API, so it is the
      // OLDEST team by createdAt) -- fully distribute it so its `fresh`
      // array is empty on the next POST. Pre-fix, `teamPlans[0]` (team A)
      // would still be picked as the anchor even though it has nothing to
      // insert.
      const fixASeasonJson = await expectJson(
        await apiFetch("/api/admin/seasons", {
          method: "POST",
          cookie: adminCookie,
          body: JSON.stringify({
            programId,
            name: "Distribution Fix-A Season",
            slug: testSlug("dist-fixa-season"),
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
      const fixASeasonId = fixASeasonJson.season.id;

      const teamAJson = await expectJson(
        await apiFetch("/api/admin/teams", {
          method: "POST",
          cookie: adminCookie,
          body: JSON.stringify({
            seasonId: fixASeasonId,
            name: testSlug("dist-fixa-team-a"),
            coachUserId,
          }),
        }),
        201,
      );
      const teamAId = teamAJson.team.id;

      const firstAttachRes = await apiFetch(
        `${SEQUENCES_ENDPOINT}/${safeSequenceId}/attach`,
        {
          method: "POST",
          cookie: adminCookie,
          body: JSON.stringify({ seasonId: fixASeasonId, ...recurrence }),
        },
      );
      const firstAttachJson = await expectJson(firstAttachRes, 200);
      expect(firstAttachJson.attachmentId).toBeTruthy();
      const firstAttachmentId = firstAttachJson.attachmentId;
      const teamAFirstResult = firstAttachJson.results.find(
        (r: any) => r.teamId === teamAId,
      );
      expect(teamAFirstResult.created).toBe(2);

      // Team B, inserted directly (copies the direct-insert pattern used
      // in tests/api/admin/suspensions-tenant-isolation.test.ts) so it
      // lands with a LATER createdAt than team A, guaranteeing team A is
      // still `teamPlans[0]` on the next POST.
      const db = getDb();
      const [teamB] = await db
        .insert(teams)
        .values({
          seasonId: fixASeasonId,
          name: testSlug("dist-fixa-team-b"),
          coachUserId,
        })
        .returning();
      const teamBId = teamB.id;

      // Re-POST: team A (oldest) has nothing fresh (already fully
      // distributed); team B has everything fresh. The fix must anchor the
      // new attachment row on team B, not skip/misfire on team A.
      const secondAttachRes = await apiFetch(
        `${SEQUENCES_ENDPOINT}/${safeSequenceId}/attach`,
        {
          method: "POST",
          cookie: adminCookie,
          body: JSON.stringify({ seasonId: fixASeasonId, ...recurrence }),
        },
      );
      const secondAttachJson = await expectJson(secondAttachRes, 200);
      expect(secondAttachJson.attachmentId).toBeTruthy();
      expect(secondAttachJson.attachmentId).not.toBe(firstAttachmentId);
      expect(secondAttachJson.raceLost).toBeFalsy();

      const teamAResult = secondAttachJson.results.find(
        (r: any) => r.teamId === teamAId,
      );
      expect(teamAResult.created).toBe(0);
      const teamBResult = secondAttachJson.results.find(
        (r: any) => r.teamId === teamBId,
      );
      expect(teamBResult.created).toBe(2);

      // Team B's sessions are anchored by the NEW attachment id, not the
      // first (team A) attachment.
      const teamBSessions = await db
        .select()
        .from(sessionPlans)
        .where(eq(sessionPlans.teamId, teamBId));
      expect(teamBSessions.length).toBeGreaterThanOrEqual(2);
      for (const row of teamBSessions) {
        expect(row.sequenceAttachmentId).toBe(secondAttachJson.attachmentId);
      }

      // No zero-session attachment row exists for this sequence: left-join
      // attachments to sessions and assert none come back unmatched.
      const orphanRows = await db
        .select({ id: sequenceAttachments.id })
        .from(sequenceAttachments)
        .leftJoin(
          sessionPlans,
          eq(sessionPlans.sequenceAttachmentId, sequenceAttachments.id),
        )
        .where(
          and(
            eq(sequenceAttachments.sequenceId, safeSequenceId),
            isNull(sessionPlans.id),
          ),
        );
      expect(orphanRows).toHaveLength(0);
    });
  });

  describe("Fix B — race-lost distributions never leave an empty attachment row", () => {
    // Fix B's race path (a concurrent request winning every one of the
    // anchor team's (template, date) pairs between the pre-check read and
    // the insert) isn't deterministically triggerable over HTTP in this
    // harness -- there is no hook to pause the request between the
    // pre-check and the transaction's insert. Instead, assert the
    // invariant the sentinel exists to protect, globally across every
    // sequence this suite touched: no `sequence_attachments` row is ever
    // left with zero referencing `session_plans` rows. This also
    // regression-guards the now-removed insert-then-delete cleanup path
    // and the Fix A anchor-selection change above.
    it("(j) no sequence_attachments row for this suite's sequences exists without at least one referencing session", async () => {
      const sequenceIds = [safeSequenceId, blockedSequenceId].filter(
        (id): id is string => Boolean(id),
      );
      if (sequenceIds.length === 0) return; // runtime skip: no development_stages seeded

      const orphanRows = await getDb()
        .select({
          id: sequenceAttachments.id,
          sequenceId: sequenceAttachments.sequenceId,
        })
        .from(sequenceAttachments)
        .leftJoin(
          sessionPlans,
          eq(sessionPlans.sequenceAttachmentId, sequenceAttachments.id),
        )
        .where(
          and(
            inArray(sequenceAttachments.sequenceId, sequenceIds),
            isNull(sessionPlans.id),
          ),
        );
      expect(orphanRows).toHaveLength(0);
    });
  });
});
