import { createContext, useContext } from "react";

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
}

export interface EmailTheme {
  brand: "aspire" | "soccerone";
  brandName: string;
  tokens: EmailTokens;
  fonts: { display: string; body: string; mono: string };
  fontsHref: string;
  /** Aspire renders an <Img> wordmark; SoccerOne a styled text wordmark. */
  logo: { kind: "img"; path: string; alt: string } | { kind: "wordmark" };
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
  },
  fonts: {
    display: '"Newsreader", Georgia, "Times New Roman", serif',
    body: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif',
    mono: '"IBM Plex Mono", "SF Mono", Menlo, Monaco, Consolas, monospace',
  },
  fontsHref:
    "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap",
  logo: { kind: "img", path: "/images/logo-black.png", alt: "Aspire Sports" },
  footerAddress: "3989 Presidential Pkwy · Powell, OH 43065",
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
    primarySoft: "rgba(163, 230, 53, 0.15)",
    ochre: "#fbbf24",
    ochreSoft: "rgba(251, 191, 36, 0.15)",
    sage: "#4ade80",
    sageSoft: "rgba(74, 222, 128, 0.15)",
    border: "rgba(255, 255, 255, 0.14)",
    borderStrong: "rgba(255, 255, 255, 0.25)",
  },
  fonts: {
    display: "'Anton', 'Arial Narrow', sans-serif",
    body: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', Menlo, Monaco, Consolas, monospace",
  },
  fontsHref:
    "https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
  logo: { kind: "wordmark" },
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
