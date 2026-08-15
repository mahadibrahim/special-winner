// src/lib/email/templates/welcome-1-welcome.tsx
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

interface WelcomeEmail1Props {
  recipientName: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
  brand?: BrandId;
}

// Brand-aware copy. SoccerOne is the consumer-facing adult-soccer brand
// (co-ed 7v7, Columbus); Aspire is the parent operator. The structure is
// shared — only the brand name and the one-line "what we run" clause differ.
const COPY = {
  aspire: {
    preview: "Welcome to Aspire Sports — here's what happens next",
    h1: "You're in. Welcome to Aspire.",
    intro:
      "Thanks for registering — we're glad you're here. Aspire Sports runs neighborhood leagues built around the people, not just the games: you play close to home, with a real scene around the matches.",
    brandName: "Aspire Sports",
  },
  soccerone: {
    preview: "Welcome to SoccerOne — here's what happens next",
    h1: "You're in. Welcome to SoccerOne.",
    intro:
      "Thanks for signing up — glad you're in. SoccerOne runs co-ed 7v7 in Columbus: two 24-minute halves, certified refs, turf, and a real post-game scene at Worthington and downtown.",
    brandName: "SoccerOne",
  },
} as const;

export function WelcomeEmail1({
  recipientName,
  dashboardUrl,
  unsubscribeUrl,
  brand = "aspire",
}: WelcomeEmail1Props) {
  const t = emailThemeFor(brand);
  const c = COPY[brand];
  return (
    <EmailLayout preview={c.preview} brand={brand}>
      <Content>
        <H1>{c.h1}</H1>
        <P>Hi {recipientName || "there"},</P>
        <P>{c.intro}</P>
        <P>
          You don't need to do anything right now. We'll be in touch with team
          and schedule details as your season takes shape — and your dashboard
          always has the latest.
        </P>
        <Button href={dashboardUrl}>Visit your dashboard →</Button>
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

export default WelcomeEmail1;
