// src/lib/email/templates/welcome-2-story.tsx
import { Link } from "@react-email/components";
import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
  tokens,
} from "@/lib/email/components/email-layout";

interface WelcomeEmail2Props {
  recipientName: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
}

export function WelcomeEmail2({
  recipientName,
  dashboardUrl,
  unsubscribeUrl,
}: WelcomeEmail2Props) {
  return (
    <EmailLayout preview="What makes an Aspire league different">
      <Content>
        <H1>Built around your night, not just the game.</H1>
        <P>Hi {recipientName || "there"},</P>
        <P>
          Most leagues drop you on a field with strangers and send you home.
          We built Aspire the other way around — neighborhood-anchored, so you
          play near where you live, and captain-first, so every team has
          someone who actually knows the people on it.
        </P>
        <P>
          The league itself is run tight: fair refs, reliable communication,
          and a real post-game scene. The founding cohort sets the tone — and
          right now, that's you.
        </P>
        <Button href={dashboardUrl}>See what's coming →</Button>
        <PMuted>
          You're getting this because you registered with Aspire Sports.{" "}
          <Link href={unsubscribeUrl} style={{ color: tokens.inkMuted }}>
            Unsubscribe from these emails
          </Link>
          .
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default WelcomeEmail2;
