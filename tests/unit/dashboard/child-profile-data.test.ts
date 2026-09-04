import { describe, it, expect } from "vitest";
import {
  buildClassesSection,
  buildProfile,
  computeAge,
  parseLocalDate,
  type FamilyMemberApi,
  type RegistrationApiRow,
} from "@/components/dashboard/child-profile-data";

const NOW = parseLocalDate("2026-06-19").getTime();

const member: FamilyMemberApi = {
  id: "child-1",
  firstName: "Emma",
  lastName: "Stone",
  birthDate: "2015-03-10",
  photoUrl: null,
};

function reg(overrides: Partial<RegistrationApiRow> & {
  id: string;
  startDate: string;
  endDate: string;
}): RegistrationApiRow {
  return {
    id: overrides.id,
    status: overrides.status ?? "confirmed",
    familyMember: { id: "child-1" },
    season: {
      name: overrides.season?.name ?? "Season",
      startDate: overrides.startDate,
      endDate: overrides.endDate,
      scheduleNotes: overrides.season?.scheduleNotes ?? null,
    },
    program: { name: overrides.program?.name ?? "Lightning" },
    sport: { name: overrides.sport?.name ?? "Soccer" },
    location: overrides.location ?? { name: "Powell", city: "Powell" },
  };
}

describe("computeAge", () => {
  it("computes age before the birthday this year", () => {
    // Born 2015-03-10; as of 2026-06-19 the birthday has passed → 11.
    expect(computeAge(parseLocalDate("2015-03-10"), new Date(NOW))).toBe(11);
  });

  it("does not count an unreached birthday", () => {
    // Born 2015-12-25; as of 2026-06-19 not yet had birthday → 10.
    expect(computeAge(parseLocalDate("2015-12-25"), new Date(NOW))).toBe(10);
  });
});

describe("buildProfile", () => {
  it("classifies past / current / future seasons", () => {
    const profile = buildProfile(
      member,
      [
        reg({ id: "past", startDate: "2025-09-01", endDate: "2025-12-01" }),
        reg({ id: "current", startDate: "2026-06-01", endDate: "2026-08-01" }),
        reg({ id: "future", startDate: "2026-09-01", endDate: "2026-12-01" }),
      ],
      NOW,
    );

    const byId = Object.fromEntries(profile.programs.map((p) => [p.id, p.status]));
    expect(byId.past).toBe("completed");
    expect(byId.current).toBe("active");
    expect(byId.future).toBe("upcoming");
  });

  it("excludes cancelled registrations entirely", () => {
    const profile = buildProfile(
      member,
      [reg({ id: "x", status: "cancelled", startDate: "2026-09-01", endDate: "2026-12-01" })],
      NOW,
    );
    expect(profile.programs).toHaveLength(0);
    expect(profile.upcomingEvents).toHaveLength(0);
  });

  it("lists only future-starting seasons as upcoming events, sorted ascending", () => {
    const profile = buildProfile(
      member,
      [
        reg({ id: "later", startDate: "2026-10-01", endDate: "2026-12-01" }),
        reg({ id: "sooner", startDate: "2026-08-01", endDate: "2026-10-01" }),
        reg({ id: "past", startDate: "2025-01-01", endDate: "2025-03-01" }),
      ],
      NOW,
    );
    expect(profile.upcomingEvents.map((e) => e.id)).toEqual(["sooner", "later"]);
  });

  it("builds season history from completed seasons only", () => {
    const profile = buildProfile(
      member,
      [
        reg({ id: "done", startDate: "2024-09-01", endDate: "2024-12-01" }),
        reg({ id: "active", startDate: "2026-06-01", endDate: "2026-08-01" }),
      ],
      NOW,
    );
    expect(profile.seasonHistory).toHaveLength(1);
    expect(profile.seasonHistory[0].year).toBe(2024);
  });

  it("orders programs active → upcoming → completed", () => {
    const profile = buildProfile(
      member,
      [
        reg({ id: "completed", startDate: "2024-09-01", endDate: "2024-12-01" }),
        reg({ id: "upcoming", startDate: "2026-09-01", endDate: "2026-12-01" }),
        reg({ id: "active", startDate: "2026-06-01", endDate: "2026-08-01" }),
      ],
      NOW,
    );
    expect(profile.programs.map((p) => p.id)).toEqual(["active", "upcoming", "completed"]);
  });
});

describe("buildClassesSection", () => {
  it("assembles the classes section from a summary child", () => {
    const section = buildClassesSection({
      membership: { tierName: "All-In", status: "active", classAllotmentRemaining: "unlimited",
        renewsAt: "2026-10-01T00:00:00.000Z", cancelAtPeriodEnd: false, technicalMonthlyCents: 900 },
      enrollment: { id: "e1", templateId: "t1", templateName: "U8 Wednesdays",
        weekday: 3, startTime: "17:30", creditsExpireAt: null },
      credits: [], kitSize: "YM", hasWaiverOnFile: true,
    });
    expect(section).toMatchObject({
      tierLine: "All-In · Unlimited classes this month",
      homeSlotLine: expect.stringContaining("Wednesday"),
      kitSize: "YM",
      renewsAt: "2026-10-01T00:00:00.000Z",
    });
  });
  it("returns null when the child has no class touchpoints", () => {
    expect(buildClassesSection({ membership: null, enrollment: null, credits: [],
      kitSize: null, hasWaiverOnFile: false })).toBeNull();
  });
});
