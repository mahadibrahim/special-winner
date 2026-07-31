// src/lib/email/templates/welcome-2-story.tsx
import { Link } from "@react-email/components";
import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";
import { emailThemeFor } from "@/lib/email/components/email-theme";
import type { BrandId } from "@/lib/branding/themes";

interface WelcomeEmail2Props {
  recipientName: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
  brand?: BrandId;
}

const COPY = {
  aspire: {
    preview: "What makes an Aspire league different",
    intro:
      "Most leagues drop you on a field with strangers and send you home. We built Aspire the other way around — neighborhood-anchored, so you play near where you live, and built around real teams, so every squad has someone who actually knows the people on it.",
    body: "The league itself is run tight: fair refs, reliable communication, and a real post-game scene. The founding cohort sets the tone — and right now, that's you.",
    brandName: "Aspire Sports",
  },
  soccerone: {
    preview: "What makes a SoccerOne league different",
    intro:
      "Most leagues drop you on a field with strangers and send you home. We built SoccerOne the other way around — around real teams, so every squad has someone who actually knows the people on it, and run tight on the details: certified refs, turf, two 24-minute halves, reliable communication.",
    body: "The post-game scene is part of the format, not an afterthought. The founding cohort sets the tone — and right now, that's you.",
    brandName: "SoccerOne",
  },
} as const;

export function WelcomeEmail2({
  recipientName,
  dashboardUrl,
  unsubscribeUrl,
  brand = "aspire",
}: WelcomeEmail2Props) {
  const t = emailThemeFor(brand);
  const c = COPY[brand];
  return (
    <EmailLayout preview={c.preview} brand={brand}>
      <Content>
        <H1>Built around your night, not just the game.</H1>
        <P>Hi {recipientName || "there"},</P>
        <P>{c.intro}</P>
        <P>{c.body}</P>
        <Button href={dashboardUrl}>See what's coming →</Button>
        <PMuted>
          You're getting this because you registered with {c.brandName}.{" "}
          <Link href={unsubscribeUrl} style={{ color: t.tokens.inkMuted }}>
            Unsubscribe from these emails
          </Link>
          .
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default WelcomeEmail2;
