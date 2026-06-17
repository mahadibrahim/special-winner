import { describe, it, expect, vi, beforeEach } from "vitest";
import * as track from "@/lib/analytics/track";
import {
  trackDivisionRegisterClicked, trackLandingTabViewed, trackRegistrationStepViewed,
  trackCatalogSportTileClicked, LEAGUE_EVENTS,
} from "@/lib/analytics/events";

describe("analytics events", () => {
  const spy = vi.spyOn(track, "track").mockImplementation(() => {});
  beforeEach(() => spy.mockClear());

  it("division_register_clicked uses snake_case props, no PII", () => {
    trackDivisionRegisterClicked({ seasonId: "s1", level: "c", gender: "coed", venue: "worthington", mode: "team", term: "fall-2026" });
    expect(spy).toHaveBeenCalledWith("division_register_clicked", { season_id: "s1", level: "c", gender: "coed", venue: "worthington", mode: "team", term: "fall-2026" });
    const props = spy.mock.calls[0][1] ?? {};
    for (const k of Object.keys(props)) expect(/email|name|phone/i.test(k)).toBe(false);
  });
  it("landing_tab_viewed passes sport + tab", () => {
    trackLandingTabViewed({ sport: "soccer", tab: "overview" });
    expect(spy).toHaveBeenCalledWith("league_landing_tab_viewed", { sport: "soccer", tab: "overview" });
  });
  it("registration_step_viewed maps seasonId -> season_id", () => {
    trackRegistrationStepViewed({ step: "payment", seasonId: "s9" });
    expect(spy).toHaveBeenCalledWith("registration_step_viewed", { step: "payment", season_id: "s9" });
  });
  it("catalog_sport_tile_clicked carries sport + state", () => {
    trackCatalogSportTileClicked({ sport: "soccer", state: "live" });
    expect(spy).toHaveBeenCalledWith("catalog_sport_tile_clicked", { sport: "soccer", state: "live" });
  });
  it("exposes the event-name catalog", () => {
    expect(LEAGUE_EVENTS.divisionRegisterClicked).toBe("division_register_clicked");
  });
});
