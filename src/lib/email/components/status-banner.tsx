// src/lib/email/components/status-banner.tsx
import { Section, Text } from "@react-email/components";
import type { CSSProperties } from "react";
import { tokens, fonts } from "./email-layout";

type Mood = "success" | "warning" | "problem";

const PALETTE: Record<Mood, { bg: string; fg: string; glyph: string }> = {
  success: { bg: tokens.sageSoft, fg: "#436B52", glyph: "✓" },
  warning: { bg: tokens.ochreSoft, fg: "#8A6A2E", glyph: "!" },
  problem: { bg: tokens.primarySoft, fg: tokens.primary, glyph: "!" },
};

/**
 * Full-width status strip shown directly below the logo. Communicates the
 * email's outcome in half a second, before any prose.
 */
export function StatusBanner({
  mood,
  children,
}: {
  mood: Mood;
  children: string;
}) {
  const p = PALETTE[mood];
  return (
    <Section style={{ ...bannerStyle, backgroundColor: p.bg }}>
      <Text style={{ ...textStyle, color: p.fg }}>
        {p.glyph}&nbsp;&nbsp;{children}
      </Text>
    </Section>
  );
}

const bannerStyle: CSSProperties = {
  padding: "10px 40px",
  borderTop: `1px solid ${tokens.border}`,
  borderBottom: `1px solid ${tokens.border}`,
  textAlign: "center",
};

const textStyle: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  margin: 0,
};
