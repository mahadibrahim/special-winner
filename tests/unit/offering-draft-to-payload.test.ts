import { describe, it, expect } from "vitest";
import { draftToOfferingPayload } from "@/lib/admin/offering-draft-to-payload";

const ctx = { locationId: "loc", sportId: "sp", publish: true };
const campDraft = {
  name: "Summer Camp", slug: "summer-camp", startDate: "2026-07-06", endDate: "2026-07-10",
  dailyStartTime: "09:00", dailyEndTime: "16:00",
  fullDayPrice: "375", halfDayPrice: "200", individualPrice: "", teamPrice: "",
  minAge: "5", maxAge: "12", capacity: "50", deposit: "100", divisionGender: "", skillLevel: "",
};

describe("draftToOfferingPayload", () => {
  it("maps a camp draft to cents, ints, individual signup, and open status", () => {
    const p = draftToOfferingPayload("camp", campDraft, ctx) as any;
    expect(p.programType).toBe("camp");
    expect(p.season.priceCents).toBe(37500);
    expect(p.season.halfDayPriceCents).toBe(20000);
    expect(p.season.minAge).toBe(5);
    expect(p.season.maxAge).toBe(12);
    expect(p.season.signupModes).toEqual(["individual"]);
    expect(p.season.status).toBe("open");
    expect(p.season.startTime).toBe("09:00");
  });

  it("uses draft status when not publishing", () => {
    const p = draftToOfferingPayload("camp", campDraft, { ...ctx, publish: false }) as any;
    expect(p.season.status).toBe("draft");
  });

  it("maps tournament to team signup and team price", () => {
    const t = draftToOfferingPayload("tournament", { ...campDraft, teamPrice: "1050", fullDayPrice: "", individualPrice: "" }, ctx) as any;
    expect(t.season.signupModes).toEqual(["team"]);
    expect(t.season.teamPriceCents).toBe(105000);
  });
});
