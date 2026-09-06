/**
 * Task 7 of the 2026-09-06-camps-phase4 plan: daily curriculum arcs for camps.
 *
 * POST /api/admin/curriculum/sequences/:id/attach against a CAMP season must:
 *   - generate session_plans on consecutive Mon–Fri days ("weekdaily"
 *     cadence) from the body startDate, skipping weekends — not weekly,
 *   - title them "Day N of M — <template>" (arcUnit mirror of the UI's
 *     arcUnitLabel), not "Week N of M",
 *   - accept a body with NO weekday at all (ignored for camps), while
 *     non-camp seasons still 400 without one (league contract unchanged),
 *   - distribute to the season's pods (ordinary teams rows — Task 4) via
 *     the untouched team targeting, one plan set per pod coach,
 *   - stay idempotent on re-POST (dedupe on (team, template, date)).
 *
 * Fixture pattern per tests/api/camps/pod-placements.test.ts: direct DB
 * inserts (no Stripe in CI), ids tracked for FK-ordered afterAll cleanup,
 * dates anchored to `new Date()`. The sequence + entries are created
 * directly in the DB (test isolation — no dependency on the reference
 * content having been loaded into this environment).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { seasons, programs } from "@/lib/db/schema/programs";
import { teams, games, venues } from "@/lib/db/schema/teams";
import { sports, ageGroups } from "@/lib/db/schema/sports";
import { developmentStages } from "@/lib/db/schema/curriculum";
import { practiceTemplates, sessionPlans } from "@/lib/db/schema/practice-planning";
import {
  curriculumSequences,
  curriculumSequenceEntries,
} from "@/lib/db/schema/curriculum-sequences";
import { sequenceAttachments } from "@/lib/db/schema/blueprint";
import { apiFetch, expectJson, getAdminCookie, getCoachCookie, resetCookies } from "../setup/test-helpers";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";

const SEQUENCES_ENDPOINT = "/api/admin/curriculum/sequences";

let adminCookie: string;
let coachCookie: string;
let coachUserId: string;

let campSeasonId: string;
let podAId: string;
let podBId: string;
let leagueSeasonId: string;

let sequenceId: string;
let templateAId: string;
let templateBId: string;
let createdStageId: string | null = null; // only when the DB had no stages at all

const createdTeamIds: string[] = [];
const createdSeasonIds: string[] = [];
const createdProgramIds: string[] = [];
const createdSportIds: string[] = [];
const createdAgeGroupIds: string[] = [];
const createdVenueIds: string[] = [];

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Wraps createAdminOrgGameContext and tracks every id it mints. */
async function mintSeason(
  opts: Parameters<typeof createAdminOrgGameContext>[0],
): Promise<Awaited<ReturnType<typeof createAdminOrgGameContext>>> {
  const ctx = await createAdminOrgGameContext(opts);
  createdSeasonIds.push(ctx.seasonId);
  createdProgramIds.push(ctx.programId);
  createdVenueIds.push(ctx.venueId);
  createdTeamIds.push(ctx.homeTeamId, ctx.awayTeamId);

  const db = getDb();
  const [programRow] = await db
    .select({ sportId: programs.sportId })
    .from(programs)
    .where(eq(programs.id, ctx.programId));
  if (programRow?.sportId) createdSportIds.push(programRow.sportId);

  const [seasonRow] = await db
    .select({ ageGroupId: seasons.ageGroupId })
    .from(seasons)
    .where(eq(seasons.id, ctx.seasonId));
  if (seasonRow?.ageGroupId) createdAgeGroupIds.push(seasonRow.ageGroupId);

  return ctx;
}

// Attach starts a week out from "now" — never a fixed calendar date
// (time-of-day/rollover lottery; see the plan's global constraints).
const startCursor = new Date();
startCursor.setUTCDate(startCursor.getUTCDate() + 7);
const START_DATE = startCursor.toISOString().slice(0, 10);
const COUNT = 5;

/**
 * The first `count` Mon–Fri calendar days on/after startISO — the behavior
 * spec for the weekdaily cadence (exact fixed-date instants are pinned by
 * tests/unit/sequence-instantiation.test.ts; this suite asserts the DAY
 * sequence for a now-anchored start). 09:00 America/New_York resolves to
 * 13:00/14:00 UTC, so a plan's UTC date slice equals its org-local day.
 */
function expectedWeekdayDates(startISO: string, count: number): string[] {
  const [y, m, d] = startISO.split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  while (cur.getUTCDay() === 0 || cur.getUTCDay() === 6) {
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  const out: string[] = [];
  while (out.length < count) {
    out.push(cur.toISOString().slice(0, 10));
    do {
      cur.setUTCDate(cur.getUTCDate() + 1);
    } while (cur.getUTCDay() === 0 || cur.getUTCDay() === 6);
  }
  return out;
}

async function podPlans(teamId: string) {
  return getDb()
    .select()
    .from(sessionPlans)
    .where(eq(sessionPlans.teamId, teamId))
    .orderBy(asc(sessionPlans.scheduledDate));
}

beforeAll(async () => {
  adminCookie = await getAdminCookie();
  coachCookie = await getCoachCookie();
  const coachMe = await expectJson(
    await apiFetch("/api/auth/me", { method: "GET", cookie: coachCookie }),
    200,
  );
  coachUserId = coachMe.user.id;

  const db = getDb();

  // Camp season with 2 pods (ordinary teams rows — Task 4), both coached.
  const campCtx = await mintSeason({ programType: "camp", audienceType: "parents" });
  campSeasonId = campCtx.seasonId;
  podAId = campCtx.homeTeamId;
  podBId = campCtx.awayTeamId;
  await db
    .update(teams)
    .set({ coachUserId })
    .where(inArray(teams.id, [podAId, podBId]));

  // Same-org league season for the weekday-still-required contract check.
  const leagueCtx = await mintSeason({ programType: "league", audienceType: "parents" });
  leagueSeasonId = leagueCtx.seasonId;

  // Any existing development stage (shared curriculum seed) — else a
  // suite-owned one (mirrors blueprint-attach.test.ts's self-created stage).
  const [existingStage] = await db
    .select({ id: developmentStages.id })
    .from(developmentStages)
    .orderBy(asc(developmentStages.createdAt))
    .limit(1);
  let stageId = existingStage?.id;
  if (!stageId) {
    const [stage] = await db
      .insert(developmentStages)
      .values({
        name: `Camp Attach Stage ${stamp}`,
        slug: `camp-attach-stage-${stamp}`,
        ageMin: 6,
        ageMax: 12,
        sortOrder: 99,
      })
      .returning({ id: developmentStages.id });
    stageId = stage.id;
    createdStageId = stage.id;
  }

  // Two clean templates (no safety-ruled skills, no activitySuggestions) on
  // the camp program's own sport, and a 5-entry camp sequence over them —
  // created directly for isolation, per the suite docstring.
  const [programRow] = await db
    .select({ sportId: programs.sportId })
    .from(programs)
    .where(eq(programs.id, campCtx.programId));
  const sportId = programRow.sportId;

  const [tplA] = await db
    .insert(practiceTemplates)
    .values({
      organizationId: campCtx.organizationId,
      sportId,
      stageId,
      name: `Camp Morning Skills ${stamp}`,
      totalDurationMinutes: 60,
      structure: [{ name: "Warmup", type: "warmup", durationMinutes: 15 }],
    })
    .returning({ id: practiceTemplates.id });
  templateAId = tplA.id;
  const [tplB] = await db
    .insert(practiceTemplates)
    .values({
      organizationId: campCtx.organizationId,
      sportId,
      stageId,
      name: `Camp Small Games ${stamp}`,
      totalDurationMinutes: 60,
      structure: [{ name: "Small-sided games", type: "game", durationMinutes: 45 }],
    })
    .returning({ id: practiceTemplates.id });
  templateBId = tplB.id;

  const [sequence] = await db
    .insert(curriculumSequences)
    .values({
      organizationId: campCtx.organizationId,
      sportId,
      developmentStageId: stageId,
      programType: "camp",
      name: `Camp Week Arc ${stamp}`,
      description: "Suite-owned five-day camp arc",
    })
    .returning({ id: curriculumSequences.id });
  sequenceId = sequence.id;

  const templateByDay = [templateAId, templateBId, templateAId, templateBId, templateAId];
  await db.insert(curriculumSequenceEntries).values(
    templateByDay.map((templateId, i) => ({
      sequenceId,
      position: i + 1,
      templateId,
    })),
  );
});

afterAll(async () => {
  const db = getDb();
  // FK order: plans → attachments → entries → sequence → templates → stage,
  // then the minted org scaffolding (mirrors pod-placements.test.ts).
  if (createdTeamIds.length > 0) {
    await db.delete(sessionPlans).where(inArray(sessionPlans.teamId, createdTeamIds));
  }
  if (sequenceId) {
    await db
      .delete(sequenceAttachments)
      .where(eq(sequenceAttachments.sequenceId, sequenceId));
    await db
      .delete(curriculumSequenceEntries)
      .where(eq(curriculumSequenceEntries.sequenceId, sequenceId));
    await db.delete(curriculumSequences).where(eq(curriculumSequences.id, sequenceId));
  }
  const templateIds = [templateAId, templateBId].filter(Boolean);
  if (templateIds.length > 0) {
    await db.delete(practiceTemplates).where(inArray(practiceTemplates.id, templateIds));
  }
  if (createdStageId) {
    await db.delete(developmentStages).where(eq(developmentStages.id, createdStageId));
  }
  if (createdTeamIds.length > 0) {
    await db.delete(teams).where(inArray(teams.id, createdTeamIds));
  }
  if (createdSeasonIds.length > 0) {
    await db.delete(games).where(inArray(games.seasonId, createdSeasonIds));
    await db.delete(seasons).where(inArray(seasons.id, createdSeasonIds));
  }
  if (createdProgramIds.length > 0) {
    await db.delete(programs).where(inArray(programs.id, createdProgramIds));
  }
  if (createdSportIds.length > 0) {
    await db.delete(sports).where(inArray(sports.id, createdSportIds));
  }
  if (createdAgeGroupIds.length > 0) {
    await db.delete(ageGroups).where(inArray(ageGroups.id, createdAgeGroupIds));
  }
  if (createdVenueIds.length > 0) {
    await db.delete(venues).where(inArray(venues.id, createdVenueIds));
  }
  resetCookies();
});

describe("POST attach on a camp season — daily arc", () => {
  it("generates Day-titled planned sessions on consecutive weekdays for every pod coach, with NO weekday in the body", async () => {
    const res = await apiFetch(`${SEQUENCES_ENDPOINT}/${sequenceId}/attach`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        seasonId: campSeasonId,
        startDate: START_DATE,
        timeOfDay: "09:00",
        count: COUNT,
        // weekday deliberately omitted — camps must not require it.
      }),
    });
    const json = await expectJson(res, 200);
    expect(json.attached).toBe(true);
    expect(json.truncatedBySeasonEnd).toBe(false);
    expect(json.attachmentId).toBeTruthy();

    const expectedDays = expectedWeekdayDates(START_DATE, COUNT);
    for (const podId of [podAId, podBId]) {
      const podResult = json.results.find((r: any) => r.teamId === podId);
      expect(podResult, `results row for pod ${podId}`).toBeTruthy();
      expect(podResult.created).toBe(COUNT);
      expect(podResult.error).toBeUndefined();

      const plans = await podPlans(podId);
      expect(plans).toHaveLength(COUNT);

      // Consecutive Mon–Fri days from startDate — weekends skipped.
      expect(plans.map((p) => p.scheduledDate.toISOString().slice(0, 10))).toEqual(
        expectedDays,
      );
      for (const p of plans) {
        const day = p.scheduledDate.getUTCDay();
        expect(day).toBeGreaterThanOrEqual(1);
        expect(day).toBeLessThanOrEqual(5);
        expect(p.status).toBe("planned");
        expect(p.coachUserId).toBe(coachUserId);
        expect(p.sequenceAttachmentId).toBe(json.attachmentId);
      }

      // "Day N of M" titles (arcUnit mirror of the UI's arcUnitLabel), in
      // date order, naming the entry's own template.
      const expectedNames = [
        `Camp Morning Skills ${stamp}`,
        `Camp Small Games ${stamp}`,
        `Camp Morning Skills ${stamp}`,
        `Camp Small Games ${stamp}`,
        `Camp Morning Skills ${stamp}`,
      ];
      expect(plans.map((p) => p.title)).toEqual(
        expectedNames.map((name, i) => `Day ${i + 1} of ${COUNT} — ${name}`),
      );
    }
  });

  it("is idempotent: a re-POST creates nothing, keeps counts, and persists no second attachment row", async () => {
    const res = await apiFetch(`${SEQUENCES_ENDPOINT}/${sequenceId}/attach`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        seasonId: campSeasonId,
        startDate: START_DATE,
        timeOfDay: "09:00",
        count: COUNT,
      }),
    });
    const json = await expectJson(res, 200);
    expect(json.attachmentId).toBeNull();
    for (const podId of [podAId, podBId]) {
      const podResult = json.results.find((r: any) => r.teamId === podId);
      expect(podResult.created).toBe(0);
      expect(podResult.skippedExisting).toBe(COUNT);
      expect(await podPlans(podId)).toHaveLength(COUNT); // no duplicates
    }

    const attachmentRows = await getDb()
      .select()
      .from(sequenceAttachments)
      .where(eq(sequenceAttachments.sequenceId, sequenceId));
    expect(attachmentRows).toHaveLength(1); // only the first run's row
  });

  it("attach-preview mirrors the same weekdaily dates, weekday-less", async () => {
    const previewUrl =
      `${SEQUENCES_ENDPOINT}/${sequenceId}/attach-preview` +
      `?seasonId=${campSeasonId}&startDate=${START_DATE}&timeOfDay=09:00&count=${COUNT}`;
    const json = await expectJson(
      await apiFetch(previewUrl, { method: "GET", cookie: adminCookie }),
      200,
    );
    const expectedDays = expectedWeekdayDates(START_DATE, COUNT);
    const group = json.groups.find((g: any) => g.teamId === podAId);
    expect(group).toBeTruthy();
    expect(group.noun).toBe("camp group");
    expect(group.dates.map((iso: string) => iso.slice(0, 10))).toEqual(expectedDays);
  });
});

describe("non-camp seasons keep the weekly contract", () => {
  it("400s a weekday-less POST attach against a league season", async () => {
    const res = await apiFetch(`${SEQUENCES_ENDPOINT}/${sequenceId}/attach`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        seasonId: leagueSeasonId,
        startDate: START_DATE,
        timeOfDay: "09:00",
        count: 2,
      }),
    });
    const json = await expectJson(res, 400);
    expect(json.error).toBe("Validation failed");
    expect(json.details.weekday).toBeTruthy();
  });

  it("400s a weekday-less attach-preview against a league season", async () => {
    const previewUrl =
      `${SEQUENCES_ENDPOINT}/${sequenceId}/attach-preview` +
      `?seasonId=${leagueSeasonId}&startDate=${START_DATE}&timeOfDay=09:00&count=2`;
    const json = await expectJson(
      await apiFetch(previewUrl, { method: "GET", cookie: adminCookie }),
      400,
    );
    expect(json.error).toBe("Validation failed");
    expect(json.details.weekday).toBeTruthy();
  });
});
