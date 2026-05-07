import { describe, it, expect } from "vitest";
import { filterActivitiesByContext } from "../../../src/lib/activity-tracking/filter";

const ctx = {
  sport_tags: ["outdoor:soccer"],
  venue_tags: ["outdoor", "owned"],
  format_tags: ["league"],
  audience_tags: ["youth" as const],
};

const baseActivity = {
  id: "act.x",
  sport_tags: [] as string[],
  venue_tags: [] as string[],
  format_tags: [] as string[],
  audience_tags: [] as string[],
};

describe("filterActivitiesByContext", () => {
  it("includes activities with no tag constraints (apply to all)", () => {
    expect(filterActivitiesByContext([baseActivity], ctx)).toHaveLength(1);
  });
  it("includes activities whose sport_tag matches (OR within dim)", () => {
    const a = { ...baseActivity, sport_tags: ["outdoor:soccer", "outdoor:flag_football"] };
    expect(filterActivitiesByContext([a], ctx)).toHaveLength(1);
  });
  it("excludes activities whose sport_tag doesn't match", () => {
    const a = { ...baseActivity, sport_tags: ["indoor:basketball"] };
    expect(filterActivitiesByContext([a], ctx)).toHaveLength(0);
  });
  it("AND across dimensions: must match every populated dimension", () => {
    const a = { ...baseActivity, sport_tags: ["outdoor:soccer"], venue_tags: ["indoor"] };
    expect(filterActivitiesByContext([a], ctx)).toHaveLength(0);
  });
  it("includes when audience_tag matches youth", () => {
    const a = { ...baseActivity, audience_tags: ["youth"] };
    expect(filterActivitiesByContext([a], ctx)).toHaveLength(1);
  });
  it("excludes when audience_tag is adult-only", () => {
    const a = { ...baseActivity, audience_tags: ["adult"] };
    expect(filterActivitiesByContext([a], ctx)).toHaveLength(0);
  });
});
