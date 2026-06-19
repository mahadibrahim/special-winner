// src/lib/email/templates/welcome-3-activation.tsx
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

interface WelcomeEmail3Props {
  recipientName: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
  brand?: BrandId;
}

export function WelcomeEmail3({
  recipientName,
  dashboardUrl,
  unsubscribeUrl,
  brand = "aspire",
}: WelcomeEmail3Props) {
  const t = emailThemeFor(brand);
  const brandName = brand === "soccerone" ? "SoccerOne" : "Aspire Sports";
  return (
    <EmailLayout
      preview="The best leagues are the ones you bring friends to"
      brand={brand}
    >
      <Content>
        <H1>Bring your people.</H1>
        <P>Hi {recipientName || "there"},</P>
        <P>
          A league night is better with your crew. The people who have the
          best season are the ones who show up with friends — so this is your
          nudge to pull a few in.
        </P>
        <P>
          Know someone who'd be in? Send them our way. The more of your circle
          that plays, the better every match night gets.
        </P>
        <Button href={dashboardUrl}>Visit your dashboard →</Button>
        <PMuted>
          You're getting this because you registered with {brandName}.{" "}
          <Link href={unsubscribeUrl} style={{ color: t.tokens.inkMuted }}>
            Unsubscribe from these emails
          </Link>
          .
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default WelcomeEmail3;
