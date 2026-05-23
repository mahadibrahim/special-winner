import { Hr } from "@react-email/components";
import {
  Button,
  Content,
  Detail,
  DetailPanel,
  EmailLayout,
  H1,
  H2,
  P,
  PMuted,
  tokens,
} from "@/lib/email/components/email-layout";
import { StatusBanner } from "@/lib/email/components/status-banner";

interface DropInBookingConfirmationEmailProps {
  recipientName: string;
  /** Sport / class label, e.g. "Soccer (7v7)". */
  sportLabel: string;
  /** Venue (space) name. */
  venueName: string;
  /** Formatted start time, e.g. "Thu, May 22, 9:00 PM". */
  whenLabel: string;
  teamAssignment?: string | null;
  /** Payment summary, e.g. "$15.74 paid" or "Included with membership". */
  amountLabel: string;
  /** Absolute URL to the session detail page. */
  sessionUrl: string;
}

/**
 * Drop-in booking confirmation — the branded email sent after a confirmed
 * booking lands (online checkout, kiosk walk-in, or admin walk-up). Uses the
 * shared transactional EmailLayout so it matches every other Aspire email.
 */
export function DropInBookingConfirmationEmail({
  recipientName,
  sportLabel,
  venueName,
  whenLabel,
  teamAssignment,
  amountLabel,
  sessionUrl,
}: DropInBookingConfirmationEmailProps) {
  return (
    <EmailLayout preview={`You're confirmed for ${sportLabel} — ${whenLabel}`}>
      <StatusBanner mood="success">Booking confirmed</StatusBanner>
      <Content>
        <H1>You're confirmed</H1>
        <P>Hi {recipientName},</P>
        <P>
          You're booked for <strong>{sportLabel}</strong>. Here are the
          details:
        </P>

        <DetailPanel>
          <Detail label="When">{whenLabel}</Detail>
          <Detail label="Where">{venueName}</Detail>
          {teamAssignment ? (
            <Detail label="Team">{teamAssignment}</Detail>
          ) : null}
          <Hr style={{ borderColor: tokens.border, margin: "12px 0" }} />
          <Detail label="Payment">{amountLabel}</Detail>
        </DetailPanel>

        <Button href={sessionUrl}>View session details →</Button>

        <H2>Before you go</H2>
        <P>
          Arrive a few minutes early so the front desk can check you in — bring
          a photo ID that matches the name on your booking.
        </P>
        <PMuted>
          Need to cancel? You can do it from your dashboard up to the
          cancellation window.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default DropInBookingConfirmationEmail;
