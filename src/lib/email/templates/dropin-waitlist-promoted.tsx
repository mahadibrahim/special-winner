import {
  Button,
  Content,
  Detail,
  DetailPanel,
  EmailLayout,
  H1,
  InfoCard,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";
import { StatusBanner } from "@/lib/email/components/status-banner";

interface DropInWaitlistPromotedEmailProps {
  recipientName: string;
  /** Sport / class label, e.g. "Soccer (7v7)". */
  sportLabel: string;
  /** Venue (space) name. */
  venueName: string;
  /** Formatted start time, e.g. "Thu, May 22, 9:00 PM". */
  whenLabel: string;
  /** Minutes left to claim the spot. */
  minutesLeft: number;
  /** Absolute URL to the one-time claim link. */
  claimUrl: string;
}

/**
 * Drop-in waitlist-promotion email — fired when a spot opens and the next
 * waitlister is promoted. Uses the shared branded EmailLayout so it matches
 * every other Aspire email.
 */
export function DropInWaitlistPromotedEmail({
  recipientName,
  sportLabel,
  venueName,
  whenLabel,
  minutesLeft,
  claimUrl,
}: DropInWaitlistPromotedEmailProps) {
  return (
    <EmailLayout
      preview={`A spot opened for ${sportLabel} — claim within ${minutesLeft} min`}
    >
      <StatusBanner mood="warning">Spot available — act fast</StatusBanner>
      <Content>
        <H1>A spot opened up</H1>
        <P>Hi {recipientName},</P>
        <P>
          Good news — a spot opened up for <strong>{sportLabel}</strong> at{" "}
          <strong>{venueName}</strong>.
        </P>

        <DetailPanel>
          <Detail label="When">{whenLabel}</Detail>
          <Detail label="Where">{venueName}</Detail>
        </DetailPanel>

        <InfoCard variant="warning">
          <P>
            Claim your spot within <strong>{minutesLeft} minutes</strong> or it
            goes to the next person on the waitlist.
          </P>
        </InfoCard>

        <Button href={claimUrl}>Claim my spot →</Button>

        <PMuted>
          If the link expires, you'll automatically stay on the waitlist for
          the next opening.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default DropInWaitlistPromotedEmail;
