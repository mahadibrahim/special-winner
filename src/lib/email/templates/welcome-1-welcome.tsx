// src/lib/email/templates/welcome-1-welcome.tsx
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

interface WelcomeEmail1Props {
  recipientName: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
}

export function WelcomeEmail1({
  recipientName,
  dashboardUrl,
  unsubscribeUrl,
}: WelcomeEmail1Props) {
  return (
    <EmailLayout preview="Welcome to Aspire Sports — here's what happens next">
      <Content>
        <H1>You're in. Welcome to Aspire.</H1>
        <P>Hi {recipientName || "there"},</P>
        <P>
          Thanks for registering — we're glad you're here. Aspire Sports runs
          neighborhood leagues built around the people, not just the games:
          you play close to home, with a real scene around the matches.
        </P>
        <P>
          You don't need to do anything right now. We'll be in touch with team
          and schedule details as your season takes shape — and your dashboard
          always has the latest.
        </P>
        <Button href={dashboardUrl}>Visit your dashboard →</Button>
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

export default WelcomeEmail1;
