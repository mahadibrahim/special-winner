import { describe, it, expect, vi, beforeEach } from "vitest";
import * as track from "@/lib/analytics/track";
import {
  trackDivisionRegisterClicked, trackLandingTabViewed, trackRegistrationStepViewed,
  trackCatalogSportTileClicked, LEAGUE_EVENTS,
  trackTeamCreateViewed, trackTeamCreateSubmitted, trackTeamDepositViewed, trackTeamHqViewed,
  trackExpressCheckoutConfirmed,
  trackInappBannerShown, trackInappBannerClicked, trackInappRecaptureRequested,
  trackPaymentStepWalletsResolved, trackCheckoutAbandonReason,
  TEAM_EVENTS, SERVER_EVENTS, YOUTH_EVENTS,
  trackTrialModalOpened, trackTrialBookingAttempted, trackTrialWaiverShown,
  trackTrialBooked, trackTrialFullOfferShown, trackTrialFullOfferAccepted, trackTrialBlocked,
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
  it("registration_step_viewed maps seasonId -> season_id and includes flow, variant, in_app_browser", () => {
    trackRegistrationStepViewed({ step: "payment", seasonId: "s9", flow: "solo", variant: "v1" });
    const call = spy.mock.calls[0];
    expect(call[0]).toBe("registration_step_viewed");
    expect(call[1]).toMatchObject({ step: "payment", season_id: "s9", flow: "solo", variant: "v1" });
    expect(call[1]).toHaveProperty("in_app_browser", expect.any(Boolean));
  });
  it("catalog_sport_tile_clicked carries sport + state", () => {
    trackCatalogSportTileClicked({ sport: "soccer", state: "live" });
    expect(spy).toHaveBeenCalledWith("catalog_sport_tile_clicked", { sport: "soccer", state: "live" });
  });
  it("exposes the event-name catalog", () => {
    expect(LEAGUE_EVENTS.divisionRegisterClicked).toBe("division_register_clicked");
  });

  it("team_create_viewed passes season_id + in_app_browser, no PII", () => {
    trackTeamCreateViewed({ seasonId: "s1" });
    expect(spy).toHaveBeenCalledWith(TEAM_EVENTS.teamCreateViewed, {
      season_id: "s1",
      in_app_browser: expect.any(Boolean),
    });
    const props = spy.mock.calls[0][1] ?? {};
    for (const k of Object.keys(props)) expect(/email|name|phone/i.test(k)).toBe(false);
  });

  it("team_create_submitted passes season_id + authed + in_app_browser", () => {
    trackTeamCreateSubmitted({ seasonId: "s1", authed: true });
    expect(spy).toHaveBeenCalledWith(TEAM_EVENTS.teamCreateSubmitted, {
      season_id: "s1",
      authed: true,
      in_app_browser: expect.any(Boolean),
    });
  });

  it("team_deposit_viewed passes season_id + in_app_browser", () => {
    trackTeamDepositViewed({ seasonId: "s1" });
    expect(spy).toHaveBeenCalledWith(TEAM_EVENTS.teamDepositViewed, {
      season_id: "s1",
      in_app_browser: expect.any(Boolean),
    });
  });

  it("team_hq_viewed passes season_id + in_app_browser", () => {
    trackTeamHqViewed({ seasonId: "s1" });
    expect(spy).toHaveBeenCalledWith(TEAM_EVENTS.teamHqViewed, {
      season_id: "s1",
      in_app_browser: expect.any(Boolean),
    });
  });

  it("express_checkout_confirmed passes express_payment_type + in_app_browser, no PII", () => {
    trackExpressCheckoutConfirmed({ expressPaymentType: "apple_pay" });
    expect(spy).toHaveBeenCalledWith(LEAGUE_EVENTS.expressCheckoutConfirmed, {
      express_payment_type: "apple_pay",
      in_app_browser: expect.any(Boolean),
    });
    const props = spy.mock.calls[0][1] ?? {};
    for (const k of Object.keys(props)) expect(/email|name|phone/i.test(k)).toBe(false);
  });

  it("exposes the express checkout event name", () => {
    expect(LEAGUE_EVENTS.expressCheckoutConfirmed).toBe("express_checkout_confirmed");
  });

  it("inapp_banner_shown passes season_id + in_app_browser and defaults variant to passive, no PII", () => {
    trackInappBannerShown({ seasonId: "s1" });
    expect(spy).toHaveBeenCalledWith(LEAGUE_EVENTS.inappBannerShown, {
      season_id: "s1",
      variant: "passive",
      in_app_browser: expect.any(Boolean),
    });
    const props = spy.mock.calls[0][1] ?? {};
    for (const k of Object.keys(props)) expect(/email|name|phone/i.test(k)).toBe(false);
  });

  it("inapp_banner_clicked passes season_id + kind + in_app_browser and defaults variant to passive", () => {
    trackInappBannerClicked({ seasonId: "s1", kind: "ios" });
    expect(spy).toHaveBeenCalledWith(LEAGUE_EVENTS.inappBannerClicked, {
      season_id: "s1",
      kind: "ios",
      variant: "passive",
      in_app_browser: expect.any(Boolean),
    });
  });

  it("inapp_banner_shown/clicked carry the payment_step_inline variant", () => {
    trackInappBannerShown({ seasonId: "s1", variant: "payment_step_inline" });
    expect(spy).toHaveBeenCalledWith(LEAGUE_EVENTS.inappBannerShown, {
      season_id: "s1",
      variant: "payment_step_inline",
      in_app_browser: expect.any(Boolean),
    });
    trackInappBannerClicked({ seasonId: "s1", kind: "ios", variant: "payment_step_inline" });
    expect(spy).toHaveBeenCalledWith(LEAGUE_EVENTS.inappBannerClicked, {
      season_id: "s1",
      kind: "ios",
      variant: "payment_step_inline",
      in_app_browser: expect.any(Boolean),
    });
  });

  it("checkout_abandon_reason carries reason + funnel context, no PII", () => {
    trackCheckoutAbandonReason({ reason: "price", seasonId: "s9", flow: "solo", variant: "v2" });
    expect(spy).toHaveBeenCalledWith("checkout_abandon_reason", {
      reason: "price",
      season_id: "s9",
      flow: "solo",
      variant: "v2",
      in_app_browser: expect.any(Boolean),
    });
    expect(LEAGUE_EVENTS.checkoutAbandonReason).toBe("checkout_abandon_reason");
    const props = spy.mock.calls[0][1] ?? {};
    for (const k of Object.keys(props)) expect(/email|name|phone/i.test(k)).toBe(false);
  });

  it("payment_step_wallets_resolved carries availability + enabled + in_app_browser, no PII", () => {
    trackPaymentStepWalletsResolved({
      seasonId: "s9",
      expressWalletsAvailable: ["apple_pay"],
      walletsEnabled: false,
    });
    expect(spy).toHaveBeenCalledWith("payment_step_wallets_resolved", {
      season_id: "s9",
      express_wallets_available: ["apple_pay"],
      wallets_enabled: false,
      in_app_browser: expect.any(Boolean),
    });
    expect(LEAGUE_EVENTS.paymentStepWalletsResolved).toBe("payment_step_wallets_resolved");
    const props = spy.mock.calls[0][1] ?? {};
    for (const k of Object.keys(props)) expect(/email|name|phone/i.test(k)).toBe(false);
  });

  it("exposes the inapp banner event names", () => {
    expect(LEAGUE_EVENTS.inappBannerShown).toBe("inapp_banner_shown");
    expect(LEAGUE_EVENTS.inappBannerClicked).toBe("inapp_banner_clicked");
  });

  it("inapp_recapture_requested passes season_id + channel + in_app_browser, no PII", () => {
    trackInappRecaptureRequested({ seasonId: "s1", channel: "sms" });
    expect(spy).toHaveBeenCalledWith(LEAGUE_EVENTS.inappRecaptureRequested, {
      season_id: "s1",
      channel: "sms",
      in_app_browser: expect.any(Boolean),
    });
    const props = spy.mock.calls[0][1] ?? {};
    for (const k of Object.keys(props)) expect(/email|name|phone/i.test(k)).toBe(false);
  });

  it("inapp_recapture_requested accepts the email channel too", () => {
    trackInappRecaptureRequested({ seasonId: "s1", channel: "email" });
    expect(spy).toHaveBeenCalledWith(LEAGUE_EVENTS.inappRecaptureRequested, {
      season_id: "s1",
      channel: "email",
      in_app_browser: expect.any(Boolean),
    });
  });

  it("exposes the inapp recapture event name", () => {
    expect(LEAGUE_EVENTS.inappRecaptureRequested).toBe("inapp_recapture_requested");
  });

  it("exposes the team event-name catalog + server event name", () => {
    expect(TEAM_EVENTS.teamCreateViewed).toBe("team_create_viewed");
    expect(TEAM_EVENTS.teamCreateSubmitted).toBe("team_create_submitted");
    expect(TEAM_EVENTS.teamDepositViewed).toBe("team_deposit_viewed");
    expect(TEAM_EVENTS.teamHqViewed).toBe("team_hq_viewed");
    expect(SERVER_EVENTS.teamDepositPaid).toBe("team_deposit_paid");
  });
});

describe("youth trial funnel events", () => {
  const spy = vi.spyOn(track, "track").mockImplementation(() => {});
  beforeEach(() => spy.mockClear());

  it("spine events use snake_case template_id, no PII", () => {
    trackTrialModalOpened({ templateId: "tpl1" });
    expect(spy).toHaveBeenCalledWith("trial_modal_opened", { template_id: "tpl1" });
    trackTrialBookingAttempted({ templateId: "tpl1" });
    expect(spy).toHaveBeenCalledWith("trial_booking_attempted", { template_id: "tpl1" });
    trackTrialWaiverShown({ templateId: "tpl1" });
    expect(spy).toHaveBeenCalledWith("trial_waiver_shown", { template_id: "tpl1" });
    for (const call of spy.mock.calls) {
      for (const k of Object.keys(call[1] ?? {})) expect(/email|name|phone/i.test(k)).toBe(false);
    }
  });

  it("booked distinguishes idempotent repeats; offer + blocked carry outcomes", () => {
    trackTrialBooked({ templateId: "tpl1", alreadyBooked: false });
    expect(spy).toHaveBeenCalledWith("trial_booked", { template_id: "tpl1", already_booked: false });
    trackTrialFullOfferShown({ templateId: "tpl1" });
    trackTrialFullOfferAccepted({ templateId: "tpl1" });
    trackTrialBlocked({ templateId: "tpl1", reason: "trial_already_used" });
    expect(spy).toHaveBeenCalledWith("trial_blocked", { template_id: "tpl1", reason: "trial_already_used" });
  });

  it("event names are stable strings", () => {
    expect(YOUTH_EVENTS.trialModalOpened).toBe("trial_modal_opened");
    expect(YOUTH_EVENTS.trialBooked).toBe("trial_booked");
    expect(YOUTH_EVENTS.trialBlocked).toBe("trial_blocked");
  });
});
