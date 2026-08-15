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

interface RentalBlockConfirmationEmailProps {
  recipientName: string;
  blockLabel: string;
  /** One line per session: "Tue Jan 6 · 8:00–9:00 PM · Orange". */
  scheduleLines: string[];
  /** Whole dollars, e.g. "$702". */
  depositPaidLabel: string;
  /** Whole dollars plus its due date, e.g. "$2,106 due Dec 7". Null once settled. */
  balanceLabel: string | null;
  manageUrl: string;
  brand?: BrandId;
}

/** Beyond this the email becomes a wall of dates; the page carries the rest. */
const MAX_LINES = 12;

/**
 * Sent when a block's deposit lands and every session flips to confirmed.
 * This is the renter's proof the whole winter is theirs, so it carries the
 * full session schedule rather than a single window.
 */
export function RentalBlockConfirmationEmail({
  recipientName,
  blockLabel,
  scheduleLines,
  depositPaidLabel,
  balanceLabel,
  manageUrl,
  brand,
}: RentalBlockConfirmationEmailProps) {
  const t = emailThemeFor(brand);
  const shown = scheduleLines.slice(0, MAX_LINES);
  const hidden = scheduleLines.length - shown.length;

  return (
    <EmailLayout preview={`Your dates are confirmed - ${blockLabel}`} brand={brand}>
      <StatusBanner mood="success">Block confirmed</StatusBanner>
      <Content>
        <H1>Your dates are locked in</H1>
        <P>Hi {recipientName},</P>
        <P>
          Your deposit landed, so every session in {blockLabel} is confirmed and off the
          board for anyone else.
        </P>

        <DetailPanel>
          <Detail label="Sessions">{String(scheduleLines.length)}</Detail>
          <Detail label="Deposit paid">{depositPaidLabel}</Detail>
          {balanceLabel ? (
            <>
              <Hr style={{ borderColor: t.tokens.border, margin: "12px 0" }} />
              <Detail label="Balance">{balanceLabel}</Detail>
            </>
          ) : null}
        </DetailPanel>

        <H2>Your schedule</H2>
        {shown.map((line) => (
          <P key={line}>{line}</P>
        ))}
        {hidden > 0 ? (
          <PMuted>
            + {hidden} more session{hidden === 1 ? "" : "s"} - see the full schedule on
            your booking page.
          </PMuted>
        ) : null}

        <Button href={manageUrl}>View your schedule</Button>

        <PMuted>
          Arrive a few minutes early for your first session so the front desk can check
          you in. Need to move a date? Reply to this email or call the facility.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default RentalBlockConfirmationEmail;
