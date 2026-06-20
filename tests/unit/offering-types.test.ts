import { describe, it, expect } from "vitest";
import { OFFERING_TYPES, offeringFieldShown, offeringFieldRequired } from "@/lib/admin/offering-types";

describe("OFFERING_TYPES", () => {
  it("shows half-day price and age range for camps but not divisions", () => {
    expect(offeringFieldShown("camp", "halfDayPrice")).toBe(true);
    expect(offeringFieldShown("camp", "ageRange")).toBe(true);
    expect(offeringFieldShown("camp", "divisions")).toBe(false);
    expect(offeringFieldShown("camp", "teamPrice")).toBe(false);
  });

  it("shows team price + divisions + team capacity for tournaments", () => {
    expect(offeringFieldShown("tournament", "teamPrice")).toBe(true);
    expect(offeringFieldShown("tournament", "divisions")).toBe(true);
    expect(offeringFieldShown("tournament", "capacityTeams")).toBe(true);
    expect(offeringFieldShown("tournament", "halfDayPrice")).toBe(false);
  });

  it("shows divisions + individual & team price for leagues", () => {
    expect(offeringFieldShown("league", "divisions")).toBe(true);
    expect(offeringFieldShown("league", "individualPrice")).toBe(true);
    expect(offeringFieldShown("league", "teamPrice")).toBe(true);
  });

  it("marks full-day price and age range required for camps", () => {
    expect(offeringFieldRequired("camp", "fullDayPrice")).toBe(true);
    expect(offeringFieldRequired("camp", "ageRange")).toBe(true);
    expect(offeringFieldRequired("camp", "halfDayPrice")).toBe(false);
  });

  it("exposes a label and description per type", () => {
    expect(OFFERING_TYPES.camp.label).toBe("Camp");
    expect(OFFERING_TYPES.camp.description.length).toBeGreaterThan(0);
  });
});
