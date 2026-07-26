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
} from "@/lib/email/components/email-layout";
import { emailThemeFor } from "@/lib/email/components/email-theme";
import { StatusBanner } from "@/lib/email/components/status-banner";
import type { BrandId } from "@/lib/branding/themes";

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
  /**
   * Sign-the-waiver link — set only while the booking's waiver is unsigned
   * (the online flows capture it AFTER payment: "sign before you play").
   * Renders the waiver CTA section; omit/null when already signed.
   */
  signWaiverUrl?: string | null;
  brand?: BrandId;
}

/**
 * Drop-in booking confirmation — the branded email sent after a confirmed
 * booking lands (online checkout, kiosk walk-in, or admin walk-up). Uses the
 * shared transactional EmailLayout so it matches every other Aspire/SoccerOne email.
 */
export function DropInBookingConfirmationEmail({
  recipientName,
  sportLabel,
  venueName,
  whenLabel,
  teamAssignment,
  amountLabel,
  sessionUrl,
  signWaiverUrl,
  brand,
}: DropInBookingConfirmationEmailProps) {
  const t = emailThemeFor(brand);

  return (
    <EmailLayout
      preview={`You're confirmed for ${sportLabel} — ${whenLabel}`}
      brand={brand}
    >
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
          <Hr style={{ borderColor: t.tokens.border, margin: "12px 0" }} />
          <Detail label="Payment">{amountLabel}</Detail>
        </DetailPanel>

        {signWaiverUrl ? (
          <>
            <H2>One more step before you play</H2>
            <P>
              Sign the participation waiver — it takes ten seconds and means
              you're straight onto the field at check-in.
            </P>
            <Button href={signWaiverUrl}>Sign the waiver →</Button>
          </>
        ) : null}

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
