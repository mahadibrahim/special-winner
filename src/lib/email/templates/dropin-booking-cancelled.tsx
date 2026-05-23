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

interface DropInBookingCancelledEmailProps {
  recipientName: string;
  /** Sport / class label, e.g. "Soccer (7v7)". */
  sportLabel: string;
  /** Venue (space) name. */
  venueName: string;
  /** Formatted start time, e.g. "Thu, May 22, 9:00 PM". */
  whenLabel: string;
  /** Lead sentence — wording differs by reason. */
  headline: string;
  /** Refund-status sentence. */
  refundLine: string;
  /** Absolute URL to the session detail page. */
  sessionUrl: string;
  reason: "session_cancelled" | "admin_refund";
}

/**
 * Drop-in admin-cancelled / admin-refunded booking notice. Uses the shared
 * branded EmailLayout so it matches every other Aspire email.
 */
export function DropInBookingCancelledEmail({
  recipientName,
  sportLabel,
  venueName,
  whenLabel,
  headline,
  refundLine,
  sessionUrl,
  reason,
}: DropInBookingCancelledEmailProps) {
  const title =
    reason === "session_cancelled" ? "Session cancelled" : "Booking cancelled";
  return (
    <EmailLayout preview={headline}>
      <StatusBanner mood="problem">{title}</StatusBanner>
      <Content>
        <H1>{title}</H1>
        <P>Hi {recipientName},</P>
        <P>{headline}</P>

        <DetailPanel>
          <Detail label="Session">{sportLabel}</Detail>
          <Detail label="When">{whenLabel}</Detail>
          <Detail label="Where">{venueName}</Detail>
        </DetailPanel>

        <InfoCard label="Refund">
          <P>{refundLine}</P>
        </InfoCard>

        {reason === "session_cancelled" ? (
          <P>Sorry for the disruption — we'll see you next time.</P>
        ) : null}

        <Button href={sessionUrl} variant="outline">
          View session details →
        </Button>
      </Content>
    </EmailLayout>
  );
}

export default DropInBookingCancelledEmail;
