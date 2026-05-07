import { describe, it, expect } from "vitest";
import { deriveTagContext } from "../../../src/lib/activity-tracking/derive-tag-context";

const baseInput = {
  venue: { indoor: false, owned: true, concessions: false, parkingManaged: false },
  program: { programType: "league", audienceType: "parents", sport: { slug: "soccer" } },
};

describe("deriveTagContext", () => {
  it("composes outdoor:soccer for outdoor venue + soccer program", () => {
    expect(deriveTagContext(baseInput).sport_tags).toEqual(["outdoor:soccer"]);
  });
  it("composes indoor:soccer for indoor venue", () => {
    const ctx = deriveTagContext({ ...baseInput, venue: { ...baseInput.venue, indoor: true } });
    expect(ctx.sport_tags).toEqual(["indoor:soccer"]);
  });
  it("includes outdoor + owned in venue_tags when both set", () => {
    expect(deriveTagContext(baseInput).venue_tags).toContain("outdoor");
    expect(deriveTagContext(baseInput).venue_tags).toContain("owned");
  });
  it("includes rented when owned=false", () => {
    const ctx = deriveTagContext({ ...baseInput, venue: { ...baseInput.venue, owned: false } });
    expect(ctx.venue_tags).toContain("rented");
    expect(ctx.venue_tags).not.toContain("owned");
  });
  it("includes concessions only when venue.concessions=true", () => {
    const without = deriveTagContext(baseInput).venue_tags;
    const withC = deriveTagContext({
      ...baseInput,
      venue: { ...baseInput.venue, concessions: true },
    }).venue_tags;
    expect(without).not.toContain("concessions");
    expect(withC).toContain("concessions");
  });
  it("maps audienceType=parents to youth", () => {
    expect(deriveTagContext(baseInput).audience_tags).toEqual(["youth"]);
  });
  it("maps audienceType=players to adult", () => {
    const ctx = deriveTagContext({
      ...baseInput,
      program: { ...baseInput.program, audienceType: "players" },
    });
    expect(ctx.audience_tags).toEqual(["adult"]);
  });
  it("uses programType for format_tags", () => {
    expect(deriveTagContext(baseInput).format_tags).toEqual(["league"]);
  });
});
