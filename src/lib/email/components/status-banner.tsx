// src/lib/email/components/status-banner.tsx
import { Section, Text } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import { useEmailTheme } from "./email-theme";

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

  const palette: Record<Mood, { bg: string; fg: string; glyph: string }> = {
    success: { bg: t.tokens.sageSoft, fg: t.brand === "soccerone" ? t.tokens.sage : "#436B52", glyph: "✓" },
    warning: { bg: t.tokens.ochreSoft, fg: "#8A6A2E", glyph: "!" },
    problem: { bg: t.tokens.primarySoft, fg: t.tokens.primary, glyph: "!" },
  };

  const p = palette[mood];

  const bannerStyle: CSSProperties = {
    padding: "10px 40px",
    borderBottom: `1px solid ${t.tokens.border}`,
    textAlign: "center",
  };

  const textStyle: CSSProperties = {
    fontFamily: t.fonts.body,
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    margin: 0,
  };

  return (
    <Section style={{ ...bannerStyle, backgroundColor: p.bg }}>
      <Text style={{ ...textStyle, color: p.fg }}>
        {p.glyph}&nbsp;&nbsp;{children}
      </Text>
    </Section>
  );
}
