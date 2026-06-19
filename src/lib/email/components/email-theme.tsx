import { createContext, useContext } from "react";
import type { BrandId } from "@/lib/branding/themes";

/**
 * Per-brand email theming. Token NAMES mirror the Aspire originals in
 * email-layout.tsx (cream/ink/navy/…) so every primitive works against
 * either theme — for SoccerOne the values are dark/lime, i.e. "cream"
 * is the dark page background. Names describe the ROLE, not the color.
 *
 * Known compromise (accepted in the spec): Gmail and some clients
 * rewrite colors in their own dark mode, which can mangle dark-designed
 * emails. SoccerOne's email is dark by founder decision; revisit if
 * rendering reports come in.
 */

export interface EmailTokens {
  cream: string; // page background
  cream2: string; // card/panel background
  cream3: string; // deeper panel background
  paper: string; // main container background
  ink: string; // primary text
  ink2: string; // body text
  inkMuted: string; // secondary text
  inkFaint: string; // faint text
  navy: string;
  navyDeep: string;
  primary: string; // brand accent (CTA buttons, accent stripe)
  primarySoft: string;
  ochre: string;
  ochreSoft: string;
  sage: string;
  sageSoft: string;
  border: string;
  borderStrong: string;
  successFg: string; // status fg on sageSoft surfaces
  warningFg: string; // status fg on ochreSoft surfaces
  deniedBg: string; // denied/destructive pill surface
  deniedFg: string; // denied/destructive pill text
}

export interface EmailTheme {
  brand: BrandId;
  brandName: string;
  tokens: EmailTokens;
  fonts: { display: string; body: string; mono: string };
  fontsHref: string;
  /** Weight for display/heading text (H1/H2). Aspire's Newsreader reads as a
   *  medium (500); SoccerOne's email headings are bold DM Sans (700) since
   *  Anton can't be relied on to load in mail clients — see fonts.display. */
  displayWeight: number;
  /**
   * Header lockup. Both brands render an <Img>: a text wordmark would fall
   * back to a generic sans in clients that strip web fonts (Gmail/Outlook),
   * so the brand mark ships as a pre-rendered PNG. width/height are the
   * display dimensions (px); the source is hi-DPI and downscaled.
   */
  logo: {
    kind: "img";
    path: string;
    alt: string;
    width: number;
    height: number;
  };
  footerAddress: string;
}

export const ASPIRE_EMAIL_THEME: EmailTheme = {
  brand: "aspire",
  brandName: "Aspire Sports Ohio",
  tokens: {
    cream: "#F5EFE3",
    cream2: "#EEE7D4",
    cream3: "#E5DDC4",
    paper: "#FAF7ED",
    ink: "#1B1D27",
    ink2: "#2D2F3C",
    inkMuted: "#4F5158",
    inkFaint: "#8C8C95",
    navy: "#1F2547",
    navyDeep: "#131737",
    primary: "#CC442C",
    primarySoft: "#F2DCC9",
    ochre: "#C29E58",
    ochreSoft: "#F2E5C5",
    sage: "#5A8169",
    sageSoft: "#DDE7DC",
    border: "#DBD5C5",
    borderStrong: "#C7BFA9",
    successFg: "#436B52",
    warningFg: "#8A6A2E",
    deniedBg: "#F4D8D2",
    deniedFg: "#CC442C",
  },
  fonts: {
    display: '"Newsreader", Georgia, "Times New Roman", serif',
    body: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif',
    mono: '"IBM Plex Mono", "SF Mono", Menlo, Monaco, Consolas, monospace',
  },
  fontsHref:
    "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap",
  displayWeight: 500,
  logo: {
    kind: "img",
    path: "/images/logo-black.png",
    alt: "Aspire Sports",
    width: 140,
    height: 34,
  },
  footerAddress: "3989 Presidential Pkwy \u00A0\u00B7\u00A0 Powell, OH 43065",
};

export const SOCCERONE_EMAIL_THEME: EmailTheme = {
  brand: "soccerone",
  brandName: "SoccerOne",
  tokens: {
    cream: "#0a0a0d",
    cream2: "#131316",
    cream3: "#1a1a1f",
    paper: "#0e0e10",
    ink: "#ffffff",
    ink2: "#e4e4e7",
    inkMuted: "#b8b8bf",
    inkFaint: "#8c8c95",
    navy: "#0a1929",
    navyDeep: "#080c18",
    primary: "#a3e635",
    primarySoft: "#242e15", // lime 15% over paper (solid: Outlook drops rgba)
    ochre: "#fbbf24",
    ochreSoft: "#312913", // amber 15% over paper
    sage: "#4ade80",
    sageSoft: "#172d21", // green 15% over paper
    border: "#26262b", // white 14% over paper
    borderStrong: "#3a3a3e", // white 25% over paper
    successFg: "#4ade80",
    warningFg: "#fbbf24",
    deniedBg: "#311d1f", // red 15% composited over paper (solid for Outlook)
    deniedFg: "#f87171",
  },
  fonts: {
    // Headings render in DM Sans, NOT Anton. Anton is the brand display face
    // (used in the wordmark image + on the web), but mail clients strip web
    // fonts, so a live-text Anton heading degrades to a generic sans. Bold
    // DM Sans renders consistently everywhere and reads as an intentional
    // headline; the Anton lockup is preserved as the wordmark PNG instead.
    display:
      "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif",
    body: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', Menlo, Monaco, Consolas, monospace",
  },
  fontsHref:
    "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
  displayWeight: 700,
  logo: {
    kind: "img",
    path: "/images/soccerone-wordmark.png",
    alt: "SoccerOne",
    width: 126,
    height: 34,
  },
  // Addresses from SoccerOneFooter.astro
  footerAddress:
    "Worthington — 535 Lakeview Plaza Blvd, OH 43085 · Downtown — 980 E Starr Ave, OH 43201",
};

const EmailThemeContext = createContext<EmailTheme>(ASPIRE_EMAIL_THEME);

export const EmailThemeProvider = EmailThemeContext.Provider;

export function useEmailTheme(): EmailTheme {
  return useContext(EmailThemeContext);
}

/** Resolve a brand string (e.g. Stripe metadata.brand) to a theme. */
export function emailThemeFor(brand: string | null | undefined): EmailTheme {
  return brand === "soccerone" ? SOCCERONE_EMAIL_THEME : ASPIRE_EMAIL_THEME;
}
