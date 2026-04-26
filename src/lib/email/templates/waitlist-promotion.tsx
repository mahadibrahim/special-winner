import { Link } from "@react-email/components";
import {
  Button,
  Detail,
  EmailLayout,
  H1,
  H2,
  InfoCard,
  P,
  PMuted,
  tokens,
} from "@/lib/email/components/email-layout";

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
}: WaitlistPromotionEmailProps) {
  return (
    <EmailLayout
      preview={`A spot opened up for ${childName} in ${programName}`}
      sectionLabel="Waitlist"
      sectionMeta="Action required"
    >
      <H1>A spot just opened up</H1>
      <P>Hi {parentName},</P>
      <P>
        Great news — a spot has become available for{" "}
        <strong>{childName}</strong> in{" "}
        <strong>
          {programName} — {seasonName}
        </strong>
        . You've been moved off the waitlist and can now complete registration.
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

      <InfoCard label="Registration summary">
        <Detail label="Player">{childName}</Detail>
        <Detail label="Program">{programName}</Detail>
        <Detail label="Season">{seasonName}</Detail>
        <Detail label="Amount due">
          <strong>{amountDue}</strong>
        </Detail>
      </InfoCard>

      <Button href={registerUrl}>Complete registration now</Button>
      <PMuted>
        Or view all your registrations on your{" "}
        <Link href={dashboardUrl} style={linkStyle}>
          dashboard
        </Link>
        .
      </PMuted>

      <H2>Frequently asked questions</H2>

      <P>
        <strong>What if I miss the deadline?</strong>
      </P>
      <PMuted>
        If you don't complete registration within {hoursToComplete} hours, your
        spot will be offered to the next person on the waitlist. You'll remain
        on the waitlist but will need to wait for another opening.
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
    </EmailLayout>
  );
}

const linkStyle = {
  color: tokens.primary,
  textDecoration: "underline",
};

export default WaitlistPromotionEmail;
