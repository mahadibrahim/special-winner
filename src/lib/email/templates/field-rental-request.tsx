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

interface FieldRentalRequestEmailProps {
  recipientName: string;
  /** Venue (space) name. */
  venueName: string;
  /** Formatted booking window, e.g. "Sat, Jun 20 · 6:00 – 7:30 PM". */
  whenLabel: string;
  kind: "received" | "approved" | "declined";
  /** Amount due, e.g. "$50.00". Omit (null) for comp/$0 rentals. */
  amountLabel: string | null;
  /** Self-serve pay link — present (and rendered) only for "approved". */
  payUrl: string | null;
  brand?: BrandId;
}

/**
 * Field-rental request-lifecycle email — sent to the renter at each stage of
 * the request flow: received (awaiting review), approved (pay to lock it
 * in), or declined. Mirrors FieldRentalConfirmationEmail's layout/tone but
 * covers the pre-payment states the request flow adds.
 */
export function FieldRentalRequestEmail({
  recipientName,
  venueName,
  whenLabel,
  kind,
  amountLabel,
  payUrl,
  brand,
}: FieldRentalRequestEmailProps) {
  const heading =
    kind === "received"
      ? "We got your request"
      : kind === "approved"
        ? "Your rental is approved — reserve it"
        : "Your rental request";

  const mood = kind === "approved" ? "success" : kind === "declined" ? "problem" : "warning";
  const bannerText =
    kind === "received"
      ? "Request received"
      : kind === "approved"
        ? "Approved — pay to confirm"
        : "Request declined";

  const body =
    kind === "received"
      ? `Thanks, ${recipientName}. We received your request for ${venueName} on ${whenLabel}. Our team will review it and email you a link to pay once it's approved.`
      : kind === "approved"
        ? `Good news, ${recipientName} — your request for ${venueName} on ${whenLabel} is approved. Pay within 24 hours to lock in the slot.`
        : `Sorry, ${recipientName} — we couldn't accommodate your request for ${venueName} on ${whenLabel}. Please pick another time, and reach out if we can help.`;

  return (
    <EmailLayout preview={heading} brand={brand}>
      <StatusBanner mood={mood}>{bannerText}</StatusBanner>
      <Content>
        <H1>{heading}</H1>
        <P>{body}</P>

        <DetailPanel>
          <Detail label="When">{whenLabel}</Detail>
          <Detail label="Where">{venueName}</Detail>
          {amountLabel ? <Detail label="Amount due">{amountLabel}</Detail> : null}
        </DetailPanel>

        {kind === "approved" && payUrl ? (
          <Button href={payUrl}>Pay &amp; confirm your rental</Button>
        ) : null}

        {kind === "declined" ? (
          <PMuted>
            Questions? Reply to this email or call the facility and we'll
            help you find another time.
          </PMuted>
        ) : null}
      </Content>
    </EmailLayout>
  );
}

export default FieldRentalRequestEmail;
