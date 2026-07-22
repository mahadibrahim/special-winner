// Typed event catalog over the noop-safe client track(). Props are ids/slugs/
// enums only — never PII. Brand is the auto super-property (posthog.astro).
import { track } from "@/lib/analytics/track";
import { isInAppBrowser } from "@/lib/analytics/in-app-browser";

export const LEAGUE_EVENTS = {
  landingTabViewed: "league_landing_tab_viewed",
  landingCtaClicked: "league_landing_cta_clicked",
  seasonViewed: "league_season_viewed",
  divisionFilterApplied: "division_filter_applied",
  divisionRegisterClicked: "division_register_clicked",
  standingsDivisionSelected: "standings_division_selected",
  catalogSportTileClicked: "catalog_sport_tile_clicked",
  registrationStepViewed: "registration_step_viewed",
  registrationPaymentMethodSelected: "registration_payment_method_selected",
} as const;

// Server-side event names (used by posthog-node callsites elsewhere).
export const SERVER_EVENTS = {
  dropRegisterSubmitted: "drop_register_submitted",
  waiverSigned: "waiver_signed",
  waiverReminderSent: "waiver_reminder_sent",
} as const;

export type RegStep = "player" | "agreements" | "payment" | "confirm" | "completion";
export type RegFlow = "solo" | "team_captain" | "team_member";
export type RegVariant = "v1" | "v2";

export const trackLandingTabViewed = (p: { sport: string; tab: "overview" | "this" | "upcoming" | "past" }) =>
  track(LEAGUE_EVENTS.landingTabViewed, { sport: p.sport, tab: p.tab });
export const trackLandingCtaClicked = (p: { term: string }) =>
  track(LEAGUE_EVENTS.landingCtaClicked, { term: p.term });
export const trackSeasonViewed = (p: { sport: string; term: string }) =>
  track(LEAGUE_EVENTS.seasonViewed, { sport: p.sport, term: p.term });
export const trackDivisionFilterApplied = (p: { facet: "level" | "format" | "day" | "venue" | "ages"; value: string; term: string }) =>
  track(LEAGUE_EVENTS.divisionFilterApplied, { facet: p.facet, value: p.value, term: p.term });
export const trackDivisionRegisterClicked = (p: { seasonId: string; level: string; gender: string; venue: string; mode: "team" | "individual" | "interest"; term: string }) =>
  track(LEAGUE_EVENTS.divisionRegisterClicked, { season_id: p.seasonId, level: p.level, gender: p.gender, venue: p.venue, mode: p.mode, term: p.term });
export const trackStandingsDivisionSelected = (p: { term: string; seasonId: string }) =>
  track(LEAGUE_EVENTS.standingsDivisionSelected, { term: p.term, season_id: p.seasonId });
export const trackCatalogSportTileClicked = (p: { sport: string; state: "live" | "coming_soon" }) =>
  track(LEAGUE_EVENTS.catalogSportTileClicked, { sport: p.sport, state: p.state });
export const trackRegistrationStepViewed = (p: { step: RegStep; seasonId: string; flow: RegFlow; variant: RegVariant }) =>
  track(LEAGUE_EVENTS.registrationStepViewed, {
    step: p.step,
    season_id: p.seasonId,
    flow: p.flow,
    variant: p.variant,
    in_app_browser: isInAppBrowser(),
  });
export const trackRegistrationPaymentMethodSelected = (p: { method: "bank" | "card" }) =>
  track(LEAGUE_EVENTS.registrationPaymentMethodSelected, { method: p.method });
