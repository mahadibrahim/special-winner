// src/lib/email/components/status-banner.tsx
import { Section, Text } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import { useEmailTheme, type EmailTheme } from "./email-theme";

type Mood = "success" | "warning" | "problem";

/**
 * Full-width status strip shown directly below the logo. Communicates the
 * email's outcome in half a second, before any prose.
 */
export function StatusBanner({
  mood,
  children,
}: {
  mood: Mood;
  children: ReactNode;
}) {
  const t = useEmailTheme();

  const palette = moodPalette(t, mood);

  return (
    <Section style={bannerStyle(t, palette.bg)}>
      <Text style={textStyle(t, palette.fg)}>
        {palette.glyph}&nbsp;&nbsp;{children}
      </Text>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Style functions (take theme, return CSSProperties)
// ---------------------------------------------------------------------------

function moodPalette(
  t: EmailTheme,
  mood: Mood,
): { bg: string; fg: string; glyph: string } {
  switch (mood) {
    case "success":
      return { bg: t.tokens.sageSoft, fg: t.tokens.successFg, glyph: "✓" };
    case "warning":
      return { bg: t.tokens.ochreSoft, fg: t.tokens.warningFg, glyph: "!" };
    case "problem":
      return { bg: t.tokens.deniedBg, fg: t.tokens.deniedFg, glyph: "!" };
  }
}

const bannerStyle = (t: EmailTheme, bg: string): CSSProperties => ({
  backgroundColor: bg,
  padding: "10px 40px",
  borderBottom: `1px solid ${t.tokens.border}`,
  textAlign: "center",
});

const textStyle = (t: EmailTheme, fg: string): CSSProperties => ({
  fontFamily: t.fonts.body,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: fg,
  margin: 0,
});
