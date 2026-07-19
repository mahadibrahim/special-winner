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

interface FieldRentalConfirmationEmailProps {
  recipientName: string;
  /** Venue (space) name. */
  venueName: string;
  /** Formatted booking window, e.g. "Sat, Jun 20 · 6:00 – 7:30 PM". */
  whenLabel: string;
  /**
   * Payment summary, e.g. "$80.00 paid". Omit (null) for comp/$0 rentals so we
   * don't print "$0.00 paid".
   */
  amountLabel: string | null;
  /**
   * Manage-booking link — dashboard for a signed-in renter, claim link for a
   * guest. Rendered as a button when present.
   */
  manageUrl?: string | null;
  brand?: BrandId;
}

/**
 * Field-rental confirmation — the branded email sent after a rental is
 * confirmed (online checkout or at-facility card-present walk-up). Uses the
 * shared transactional EmailLayout so it matches every other Aspire/SoccerOne
 * email.
 */
export function FieldRentalConfirmationEmail({
  recipientName,
  venueName,
  whenLabel,
  amountLabel,
  manageUrl,
  brand,
}: FieldRentalConfirmationEmailProps) {
  const t = emailThemeFor(brand);

  return (
    <EmailLayout
      preview={`Your field rental is confirmed — ${whenLabel}`}
      brand={brand}
    >
      <StatusBanner mood="success">Rental confirmed</StatusBanner>
      <Content>
        <H1>Your field is booked</H1>
        <P>Hi {recipientName},</P>
        <P>Your field rental is confirmed. Here are the details:</P>

        <DetailPanel>
          <Detail label="When">{whenLabel}</Detail>
          <Detail label="Where">{venueName}</Detail>
          {amountLabel ? (
            <>
              <Hr style={{ borderColor: t.tokens.border, margin: "12px 0" }} />
              <Detail label="Payment">{amountLabel}</Detail>
            </>
          ) : null}
        </DetailPanel>

        <H2>Before you go</H2>
        <P>
          Arrive a few minutes early so the front desk can check you in — bring
          a photo ID that matches the name on your booking.
        </P>

        {manageUrl ? (
          <Button href={manageUrl}>Manage your booking</Button>
        ) : null}

        <PMuted>
          Need to change or cancel? Reply to this email or call the facility and
          we'll sort it out.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default FieldRentalConfirmationEmail;
