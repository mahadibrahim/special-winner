import {
  Button,
  Content,
  Detail,
  DetailPanel,
  EmailLayout,
  H1,
  InfoCard,
  P,
} from "@/lib/email/components/email-layout";
import { StatusBanner } from "@/lib/email/components/status-banner";
import type { BrandId } from "@/lib/branding/themes";

interface DropInOverflowRefundedEmailProps {
  recipientName: string;
  /** Sport / class label, e.g. "Soccer (7v7)". */
  sportLabel: string;
  /** Venue (space) name. */
  venueName: string;
  /** Formatted start time, e.g. "Thu, May 22, 9:00 PM". */
  whenLabel: string;
  /** Formatted refund amount, e.g. "$17.00". */
  refundAmountLabel: string;
  /** Absolute URL to the session detail page. */
  sessionUrl: string;
  brand?: BrandId;
}

/**
 * Transactional-capacity-gate overflow notice — sent when a paid Checkout
 * completes for a session that filled up (by another confirm point) while
 * the payment was in flight. The customer is refunded in full and moved to
 * the FRONT of the waitlist (not the back) since they already committed
 * and paid. Uses the shared branded EmailLayout so it matches every other
 * Aspire/SoccerOne email.
 */
export function DropInOverflowRefundedEmail({
  recipientName,
  sportLabel,
  venueName,
  whenLabel,
  refundAmountLabel,
  sessionUrl,
  brand,
}: DropInOverflowRefundedEmailProps) {
  const headline = `${sportLabel} filled up right as you paid — you're first in line.`;
  return (
    <EmailLayout preview={headline} brand={brand}>
      <StatusBanner mood="warning">Session filled up as you paid</StatusBanner>
      <Content>
        <H1>You're first on the waitlist</H1>
        <P>Hi {recipientName},</P>
        <P>
          <strong>{sportLabel}</strong> at <strong>{venueName}</strong> on{" "}
          <strong>{whenLabel}</strong> filled up in the moment between you
          starting checkout and your payment going through. We've put you at
          the very front of the waitlist — you'll be the first person texted
          the moment a spot opens.
        </P>

        <DetailPanel>
          <Detail label="Session">{sportLabel}</Detail>
          <Detail label="When">{whenLabel}</Detail>
          <Detail label="Where">{venueName}</Detail>
        </DetailPanel>

        <InfoCard label="Refund">
          <P>
            {refundAmountLabel} is on its way back to your card (5–10
            business days) — you were not charged for this session.
          </P>
        </InfoCard>

        <Button href={sessionUrl} variant="outline">
          View session details →
        </Button>
      </Content>
    </EmailLayout>
  );
}

export default DropInOverflowRefundedEmail;
