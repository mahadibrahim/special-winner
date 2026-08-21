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
  expressCheckoutConfirmed: "express_checkout_confirmed",
  paymentStepWalletsResolved: "payment_step_wallets_resolved",
  checkoutAbandonReason: "checkout_abandon_reason",
  inappBannerShown: "inapp_banner_shown",
  inappBannerClicked: "inapp_banner_clicked",
  inappRecaptureRequested: "inapp_recapture_requested",
} as const;

// Team funnel client events (team-create.tsx form → deposit → HQ share view).
export const TEAM_EVENTS = {
  teamCreateViewed: "team_create_viewed", // form rendered
  teamCreateSubmitted: "team_create_submitted", // POST fired (client, pre-response)
  teamDepositViewed: "team_deposit_viewed", // deposit screen rendered
  teamHqViewed: "team_hq_viewed", // "ok" share/invite state rendered
} as const;

// Server-side event names (used by posthog-node callsites elsewhere).
export const SERVER_EVENTS = {
  dropRegisterSubmitted: "drop_register_submitted",
  waiverSigned: "waiver_signed",
  waiverReminderSent: "waiver_reminder_sent",
  teamDepositPaid: "team_deposit_paid",
  // Interest in a forming season was invisible to analytics until #543 —
  // demand signal for unopened divisions couldn't be measured at all.
  seasonInterestSubmitted: "season_interest_submitted",
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
export const trackExpressCheckoutConfirmed = (p: { expressPaymentType: string }) =>
  track(LEAGUE_EVENTS.expressCheckoutConfirmed, {
    express_payment_type: p.expressPaymentType,
    in_app_browser: isInAppBrowser(),
  });
/** Which placement of the in-app escape UI fired the event — the passive
 *  top-of-wizard banner or the inline prompt on the payment step. */
export type InappBannerVariant = "passive" | "payment_step_inline";

export const trackInappBannerShown = (p: { seasonId: string; variant?: InappBannerVariant }) =>
  track(LEAGUE_EVENTS.inappBannerShown, {
    season_id: p.seasonId,
    variant: p.variant ?? "passive",
    in_app_browser: isInAppBrowser(),
  });
export const trackInappBannerClicked = (p: {
  seasonId: string;
  kind: "ios" | "android";
  variant?: InappBannerVariant;
}) =>
  track(LEAGUE_EVENTS.inappBannerClicked, {
    season_id: p.seasonId,
    kind: p.kind,
    variant: p.variant ?? "passive",
    in_app_browser: isInAppBrowser(),
  });

/** Fired once per mounted payment form when wallet availability settles.
 *  express_wallets_available = what Stripe reports possible in this browser
 *  (canMakePayment probe); wallets_enabled = whether we let the Payment
 *  Element offer them (false in in-app webviews, where they render broken). */
export const trackPaymentStepWalletsResolved = (p: {
  seasonId: string;
  expressWalletsAvailable: string[];
  walletsEnabled: boolean;
}) =>
  track(LEAGUE_EVENTS.paymentStepWalletsResolved, {
    season_id: p.seasonId,
    express_wallets_available: p.expressWalletsAvailable,
    wallets_enabled: p.walletsEnabled,
    in_app_browser: isInAppBrowser(),
  });
export const trackInappRecaptureRequested = (p: {
  seasonId: string
  channel: "email" | "sms"
}) =>
  track(LEAGUE_EVENTS.inappRecaptureRequested, {
    season_id: p.seasonId,
    channel: p.channel,
    in_app_browser: isInAppBrowser(),
  });

/** One-tap exit-reason chips shown after backing out of the payment step. */
export type AbandonReason =
  | "just_browsing"
  | "checking_with_team"
  | "price"
  | "had_questions"
  | "something_broke";

export const trackCheckoutAbandonReason = (p: {
  reason: AbandonReason;
  seasonId: string;
  flow: RegFlow;
  variant: RegVariant;
}) =>
  track(LEAGUE_EVENTS.checkoutAbandonReason, {
    reason: p.reason,
    season_id: p.seasonId,
    flow: p.flow,
    variant: p.variant,
    in_app_browser: isInAppBrowser(),
  });

export const trackTeamCreateViewed = (p: { seasonId: string }) =>
  track(TEAM_EVENTS.teamCreateViewed, { season_id: p.seasonId, in_app_browser: isInAppBrowser() });
export const trackTeamCreateSubmitted = (p: { seasonId: string; authed: boolean }) =>
  track(TEAM_EVENTS.teamCreateSubmitted, {
    season_id: p.seasonId,
    authed: p.authed,
    in_app_browser: isInAppBrowser(),
  });
export const trackTeamDepositViewed = (p: { seasonId: string }) =>
  track(TEAM_EVENTS.teamDepositViewed, { season_id: p.seasonId, in_app_browser: isInAppBrowser() });
export const trackTeamHqViewed = (p: { seasonId: string }) =>
  track(TEAM_EVENTS.teamHqViewed, { season_id: p.seasonId, in_app_browser: isInAppBrowser() });
