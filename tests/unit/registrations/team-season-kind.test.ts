import { describe, expect, it } from "vitest";
import { isYouthTeamSeason } from "@/lib/registrations/team-season-kind";

describe("isYouthTeamSeason", () => {
  it("is youth when the season's own minAge is under 18", () => {
    expect(isYouthTeamSeason({ minAge: 10, ageGroupMinAge: null })).toBe(true);
  });

  it("is adult when the season's own minAge is 18", () => {
    expect(isYouthTeamSeason({ minAge: 18, ageGroupMinAge: null })).toBe(false);
  });

  it("is adult (fail-toward-existing-behavior) when both ages are null", () => {
    expect(isYouthTeamSeason({ minAge: null, ageGroupMinAge: null })).toBe(false);
  });

  it("prefers season.minAge over ageGroupMinAge when both are present", () => {
    expect(isYouthTeamSeason({ minAge: 16, ageGroupMinAge: 20 })).toBe(true);
  });

  it("treats 0 as a real number, not a falsy null-substitute", () => {
    expect(isYouthTeamSeason({ minAge: 0, ageGroupMinAge: null })).toBe(true);
  });

  it("falls back to ageGroupMinAge when season.minAge is null", () => {
    expect(isYouthTeamSeason({ minAge: null, ageGroupMinAge: 12 })).toBe(true);
    expect(isYouthTeamSeason({ minAge: null, ageGroupMinAge: 21 })).toBe(false);
  });
});
