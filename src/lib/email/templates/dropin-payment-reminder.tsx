import {
  Button,
  Content,
  Detail,
  DetailPanel,
  EmailLayout,
  H1,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";
import { StatusBanner } from "@/lib/email/components/status-banner";
import type { BrandId } from "@/lib/branding/themes";

interface DropInPaymentReminderEmailProps {
  recipientName: string;
  /** Sport / class label, e.g. "Soccer (7v7)". */
  sportLabel: string;
  /** Venue (space) name. */
  venueName: string;
  /** Formatted hold-expiry time, in the venue's timezone, e.g. "Thu, May 22, 9:00 PM". */
  heldUntilLabel: string;
  /** Absolute URL to the self-serve payment page. */
  payUrl: string;
  brand?: BrandId;
}

/**
 * Walk-in payment-hold reminder — the single pre-expiry nudge sent by
 * `sendDuePaymentReminders` (src/lib/dropin/payment-reminder.ts) when a
 * kiosk walk-in hold (`pending_payment`) is within 30 minutes of its
 * `promotionExpiresAt`. Uses the shared branded EmailLayout so it matches
 * every other Aspire/SoccerOne email.
 */
export function DropInPaymentReminderEmail({
  recipientName,
  sportLabel,
  venueName,
  heldUntilLabel,
  payUrl,
  brand,
}: DropInPaymentReminderEmailProps) {
  return (
    <EmailLayout
      preview={`Your spot for ${sportLabel} is held until ${heldUntilLabel}`}
      brand={brand}
    >
      <StatusBanner mood="warning">Payment needed to keep your spot</StatusBanner>
      <Content>
        <H1>Complete payment to keep your spot</H1>
        <P>Hi {recipientName},</P>
        <P>
          Your spot for <strong>{sportLabel}</strong> at{" "}
          <strong>{venueName}</strong> is held until{" "}
          <strong>{heldUntilLabel}</strong>.
        </P>

        <DetailPanel>
          <Detail label="Held until">{heldUntilLabel}</Detail>
          <Detail label="Where">{venueName}</Detail>
        </DetailPanel>

        <Button href={payUrl}>Complete payment →</Button>

        <PMuted>
          If payment isn't completed by then, the hold is released and the
          spot may go to someone else.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default DropInPaymentReminderEmail;
