import { Link } from "@react-email/components";
import {
  Button,
  Content,
  Detail,
  DetailPanel,
  EmailLayout,
  H1,
  H2,
  InfoCard,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";
import { emailThemeFor } from "@/lib/email/components/email-theme";
import { StatusBanner } from "@/lib/email/components/status-banner";
import type { BrandId } from "@/lib/branding/themes";

interface WaitlistPromotionEmailProps {
  parentName: string;
  childName: string;
  programName: string;
  seasonName: string;
  amountDue: string;
  expiresAt: string; // e.g., "January 15, 2024 at 5:00 PM"
  hoursToComplete: number;
  registerUrl: string;
  dashboardUrl: string;
  brand?: BrandId;
}

export function WaitlistPromotionEmail({
  parentName,
  childName,
  programName,
  seasonName,
  amountDue,
  expiresAt,
  hoursToComplete,
  registerUrl,
  dashboardUrl,
  brand,
}: WaitlistPromotionEmailProps) {
  const t = emailThemeFor(brand);

  return (
    <EmailLayout
      preview={`A spot opened up for ${childName} in ${programName}`}
      brand={brand}
    >
      <StatusBanner mood="warning">
        Action required — {hoursToComplete}-hour deadline
      </StatusBanner>
      <Content>
        <H1>A spot opened up for {childName}.</H1>
        <P>Hi {parentName},</P>
        <P>
          A spot has become available for <strong>{childName}</strong> in{" "}
          <strong>
            {programName} — {seasonName}
          </strong>
          . You've been moved off the waitlist and can now complete
          registration.
        </P>

        <InfoCard label={`${hoursToComplete}-hour deadline`} variant="warning">
          <P>
            <strong>Reserved for you until {expiresAt}.</strong>
          </P>
          <PMuted>
            After that, the spot will be offered to the next person on the
            waitlist.
          </PMuted>
        </InfoCard>

        <DetailPanel>
          <Detail label="Player">{childName}</Detail>
          <Detail label="Program">{programName}</Detail>
          <Detail label="Season">{seasonName}</Detail>
          <Detail label="Amount due">
            <strong>{amountDue}</strong>
          </Detail>
        </DetailPanel>

        <Button href={registerUrl}>Complete registration now →</Button>
        <PMuted>
          Or view all your registrations on your{" "}
          <Link
            href={dashboardUrl}
            style={{ color: t.tokens.primary, textDecoration: "underline" }}
          >
            dashboard
          </Link>
          .
        </PMuted>

        <H2>Frequently asked questions</H2>

        <P>
          <strong>What if I miss the deadline?</strong>
        </P>
        <PMuted>
          If you don't complete registration within {hoursToComplete} hours,
          your spot will be offered to the next person on the waitlist. You'll
          remain on the waitlist but will need to wait for another opening.
        </PMuted>

        <P>
          <strong>Can I extend the deadline?</strong>
        </P>
        <PMuted>
          Unfortunately, we cannot extend the deadline as others are also
          waiting. Please complete your registration as soon as possible.
        </PMuted>

        <P>
          <strong>What payment methods do you accept?</strong>
        </P>
        <PMuted>
          We accept all major credit cards through our secure payment system.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default WaitlistPromotionEmail;
