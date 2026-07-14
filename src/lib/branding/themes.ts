/**
 * Brand themes — typed, code-reviewed visual identity per brand
 * (Approach B, spec 2026-06-11-brand-skinned-booking-flows-design.md).
 *
 * `brand_profiles` (DB, via Astro.locals.brand) supplies *content*
 * (displayName override, footer copy, logo media). This module supplies
 * the *look*: CSS custom-property overrides, chrome selection, fonts.
 *
 * SoccerOne values are lifted from src/styles/soccerone-tokens.css —
 * the locked source of truth for the marketing tree. Change them there
 * first, then mirror here (cross-reference comment in that file).
 */

export type BrandId = "aspire" | "soccerone";

export interface BrandTheme {
  id: BrandId;
  /** Fallback brand name when no brand_profiles row resolves. */
  displayName: string;
  /**
   * The legal entity phrase the liability waiver names ("I waive <entity>
   * from liability…"). THE single source of the waiver's entity naming —
   * WaiverCard renders whatever this says, so a new brand is a new entry
   * here and nothing else. Never hardcode a brand name in the React tree:
   * the waiver is a legal document and an Aspire customer must never sign
   * one naming SoccerOne (or vice versa).
   */
  waiverEntity: string;
  /** Which header/footer pair BaseLayout renders on shared pages. */
  chrome: "aspire" | "soccerone";
  /** Default <meta name="description"> when a page doesn't pass one. */
  defaultDescription: string;
  favicon: string;
  /** Google Fonts stylesheet for brand fonts; null = base layout fonts suffice. */
  fontsHref: string | null;
  /**
   * Custom-property overrides applied as `html[data-brand="<id>"] { … }`.
   * Override the *palette* vars (--cream, --ink, …) — the semantic vars in
   * globals.css are var() references to them and re-resolve automatically.
   * null = no override; the Aspire design system applies untouched.
   *
   * The override block MUST live on the html element itself (html[data-brand]):
   * :root custom properties substitute on the declaring element, so an
   * override on body or a wrapper re-themes Tailwind utilities but NOT
   * hand-authored var(--font-*) consumers — a split-brain failure.
   *
   * Values are emitted verbatim into an inline <style> via set:html — never populate cssVars from DB or user input.
   */
  cssVars: Record<string, string> | null;
}

const aspire: BrandTheme = {
  id: "aspire",
  displayName: "Aspire Sports",
  waiverEntity: "Aspire Sports and its partner venues",
  chrome: "aspire",
  defaultDescription:
    "Aspire Sports — evidence-based youth and adult sports in Central Ohio.",
  favicon: "/favicon.svg?v=2",
  fontsHref: null,
  cssVars: null,
};

const soccerone: BrandTheme = {
  id: "soccerone",
  displayName: "SoccerOne",
  waiverEntity: "SoccerOne, operated by Aspire Sports, and its partner venues",
  chrome: "soccerone",
  defaultDescription:
    "SoccerOne — indoor soccer in Columbus, OH. Leagues, pickup, field rentals, and memberships at Worthington and Downtown.",
  favicon: "/soccerone-favicon.svg",
  fontsHref:
    "https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=JetBrains+Mono:wght@400;500;600&display=swap",
  cssVars: {
    // —— Editorial palette inversion (values from soccerone-tokens.css) ——
    // Entries without a --so- comment are seam-only values with no soccerone-tokens.css source.
    "--cream": "#0a0a0d", // --so-ink: page background
    "--cream-2": "#131316",
    "--cream-3": "#1a1a1f",
    "--ink": "#ffffff",
    "--ink-2": "#e4e4e7",
    "--ink-muted": "#b8b8bf",
    "--ink-faint": "#8c8c95",
    "--navy": "#0a1929", // --so-navy
    "--navy-deep": "#080c18", // --so-navy-deep
    "--primary-orange": "#a3e635", // --so-lime
    "--primary-orange-bright": "#bef264", // --so-lime-bright
    "--primary-orange-soft": "rgba(163, 230, 53, 0.12)", // --so-lime-a12
    "--ochre": "#fbbf24", // --so-tier-founder
    "--sage": "#4ade80",
    "--paper": "#0e0e10", // --so-surface
    "--paper-shadow": "rgba(0, 0, 0, 0.45)",
    // —— Semantic vars with literal values in globals.css (don't cascade) ——
    // (--sidebar-* literals deliberately not overridden: sidebar is an
    // admin-only surface, out of booking-flow scope.)
    "--border": "rgba(255, 255, 255, 0.14)",
    "--input": "rgba(255, 255, 255, 0.14)",
    "--destructive": "oklch(0.55 0.2 27)",
    // —— var()-defined semantics whose palette resolution lands wrong on dark ——
    "--destructive-foreground": "#ffffff", // paired with the --destructive override above
    "--secondary-foreground": "#ffffff", // default resolves to near-black via --cream
    // —— Brand fonts (Tailwind font utilities resolve through these seams) ——
    "--brand-font-sans": "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    "--brand-font-display": "'Anton', 'Arial Narrow', sans-serif",
    "--brand-font-serif": "'Anton', 'Arial Narrow', sans-serif",
    "--brand-font-mono": "'JetBrains Mono', ui-monospace, monospace",
  },
};

export const BRAND_THEMES: Record<BrandId, BrandTheme> = { aspire, soccerone };

export function getBrandTheme(id: BrandId | null | undefined): BrandTheme {
  return BRAND_THEMES[id ?? "aspire"] ?? BRAND_THEMES.aspire;
}
