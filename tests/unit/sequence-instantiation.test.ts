import { describe, it, expect } from "vitest";
import {
  generatePracticeDates,
  zonedDateTimeToUtc,
} from "@/lib/curriculum/sequence-instantiation";
import {
  buildDraftSessionPlans,
  type SequenceEntryForBuild,
  type TemplateForBuild,
} from "@/lib/curriculum/sequence-instantiation";

// 2026 DST facts (America/New_York): spring forward Sun 2026-03-08 (EST→EDT),
// fall back Sun 2026-11-01 (EDT→EST). 2026-03-01 and 2026-10-25 are Sundays.

describe("zonedDateTimeToUtc", () => {
  it("converts an EST wall time to the correct UTC instant", () => {
    expect(
      zonedDateTimeToUtc("2026-03-01", "09:00", "America/New_York").toISOString(),
    ).toBe("2026-03-01T14:00:00.000Z"); // UTC-5
  });

  it("converts an EDT wall time to the correct UTC instant", () => {
    expect(
      zonedDateTimeToUtc("2026-03-08", "09:00", "America/New_York").toISOString(),
    ).toBe("2026-03-08T13:00:00.000Z"); // UTC-4 (DST began 2am that morning)
  });
});

describe("generatePracticeDates", () => {
  const base = {
    startDate: "2026-03-01", // a Sunday
    weekday: 0, // Sunday
    timeOfDay: "09:00",
    timezone: "America/New_York",
  };

  it("keeps the local wall-clock time across a spring-forward DST boundary", () => {
    const { dates, truncatedBySeasonEnd } = generatePracticeDates({
      ...base,
      count: 3,
    });
    expect(truncatedBySeasonEnd).toBe(false);
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2026-03-01T14:00:00.000Z", // EST, UTC-5
      "2026-03-08T13:00:00.000Z", // EDT, UTC-4 — naive +7*24h math would say 14:00Z
      "2026-03-15T13:00:00.000Z",
    ]);
  });

  it("keeps the local wall-clock time across a fall-back DST boundary", () => {
    const { dates } = generatePracticeDates({
      ...base,
      startDate: "2026-10-25", // a Sunday, still EDT
      count: 2,
    });
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2026-10-25T13:00:00.000Z", // EDT
      "2026-11-01T14:00:00.000Z", // EST — fell back that morning
    ]);
  });

  it("advances startDate forward to the requested weekday when they disagree", () => {
    const { dates } = generatePracticeDates({
      ...base,
      startDate: "2026-03-02", // a Monday
      weekday: 3, // Wednesday
      count: 1,
    });
    expect(dates[0].toISOString()).toBe("2026-03-04T14:00:00.000Z");
  });

  it("truncates when count asks for more weeks than the season has left", () => {
    const { dates, truncatedBySeasonEnd } = generatePracticeDates(
      { ...base, count: 5 },
      "2026-03-10", // season ends before the 3rd Sunday
    );
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2026-03-01T14:00:00.000Z",
      "2026-03-08T13:00:00.000Z",
    ]);
    expect(truncatedBySeasonEnd).toBe(true);
  });

  it("allows a practice ON the season end date (inclusive)", () => {
    const { dates, truncatedBySeasonEnd } = generatePracticeDates(
      { ...base, count: 2 },
      "2026-03-08",
    );
    expect(dates).toHaveLength(2);
    expect(truncatedBySeasonEnd).toBe(false);
  });
});

describe("buildDraftSessionPlans", () => {
  const templateA: TemplateForBuild = {
    id: "tpl-a",
    name: "Dribbling Under Pressure",
    totalDurationMinutes: 60,
    structure: [
      { name: "Warmup", type: "warmup", durationMinutes: 10, description: "Free dribbling" },
      { name: "Main game", type: "technical", durationMinutes: 40 },
      { name: "Cooldown", type: "cooldown", durationMinutes: 10 },
    ],
    equipmentNeeded: ["cones", "balls"],
    focusSkillIds: ["skill-1"],
  };
  const templateB: TemplateForBuild = {
    id: "tpl-b",
    name: "First Passing Session",
    totalDurationMinutes: 45,
    structure: null,
    equipmentNeeded: null,
    focusSkillIds: null,
  };
  const entries: SequenceEntryForBuild[] = [
    { position: 2, templateId: "tpl-b", objectives: null, notes: null },
    { position: 1, templateId: "tpl-a", objectives: ["Keep the ball close"], notes: "Focus on the shy kids" },
  ];
  const templatesById = new Map([
    ["tpl-a", templateA],
    ["tpl-b", templateB],
  ]);
  const dates = [
    new Date("2026-09-05T13:00:00.000Z"),
    new Date("2026-09-12T13:00:00.000Z"),
  ];

  it("maps entry N (by position, regardless of input order) to the Nth date", () => {
    const plans = buildDraftSessionPlans({
      teamId: "team-1",
      coachUserId: "coach-1",
      entries,
      templatesById,
      dates,
    });
    expect(plans).toHaveLength(2);
    expect(plans[0].templateId).toBe("tpl-a");
    expect(plans[0].scheduledDate.toISOString()).toBe("2026-09-05T13:00:00.000Z");
    expect(plans[1].templateId).toBe("tpl-b");
    expect(plans[1].scheduledDate.toISOString()).toBe("2026-09-12T13:00:00.000Z");
  });

  it("builds draft rows carrying the template's content and the entry's coaching intent", () => {
    const [first] = buildDraftSessionPlans({
      teamId: "team-1",
      coachUserId: "coach-1",
      entries,
      templatesById,
      dates,
    });
    expect(first).toMatchObject({
      teamId: "team-1",
      coachUserId: "coach-1",
      title: "Week 1 of 2 — Dribbling Under Pressure",
      durationMinutes: 60,
      status: "draft",
      objectives: ["Keep the ball close"],
      equipmentNeeded: ["cones", "balls"],
      focusSkillIds: ["skill-1"],
      preSessionNotes: "Focus on the shy kids",
    });
    expect(first.segments).toEqual([
      { order: 1, name: "Warmup", type: "warmup", durationMinutes: 10, notes: "Free dribbling" },
      { order: 2, name: "Main game", type: "technical", durationMinutes: 40 },
      { order: 3, name: "Cooldown", type: "cooldown", durationMinutes: 10 },
    ]);
  });

  it("stops at the number of dates when fewer dates than entries (season-end truncation)", () => {
    const plans = buildDraftSessionPlans({
      teamId: "team-1",
      coachUserId: "coach-1",
      entries,
      templatesById,
      dates: [dates[0]],
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].title).toBe("Week 1 of 2 — Dribbling Under Pressure"); // "of 2": total reflects the full arc
  });

  it("handles a template without structure (empty segments, not null crash)", () => {
    const plans = buildDraftSessionPlans({
      teamId: "team-1",
      coachUserId: "coach-1",
      entries: [{ position: 1, templateId: "tpl-b", objectives: null, notes: null }],
      templatesById,
      dates: [dates[0]],
    });
    expect(plans[0].segments).toEqual([]);
    expect(plans[0].durationMinutes).toBe(45);
  });

  it("throws when an entry references a template not in the map", () => {
    expect(() =>
      buildDraftSessionPlans({
        teamId: "team-1",
        coachUserId: "coach-1",
        entries: [{ position: 1, templateId: "tpl-missing", objectives: null, notes: null }],
        templatesById,
        dates: [dates[0]],
      }),
    ).toThrow(/unknown template/);
  });
});
