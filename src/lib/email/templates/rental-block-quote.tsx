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

interface RentalBlockQuoteEmailProps {
  recipientName: string;
  /** e.g. "Ohio Elite 03B - Winter Tuesdays". */
  blockLabel: string;
  /** Deposit ask (holds the dates) vs balance ask (already holding them). */
  kind: "deposit" | "balance";
  /** Whole dollars, e.g. "$702". Block money never shows cents. */
  amountLabel: string;
  /** Whole dollars, e.g. "$2,808". */
  totalLabel: string;
  /** e.g. "Hold expires Nov 8" / "Due Dec 7". Null when there is no deadline. */
  dueLabel: string | null;
  /** One line per session: "Tue Jan 6 · 8:00–9:00 PM · Orange". */
  scheduleLines: string[];
  payUrl: string;
  brand?: BrandId;
}

/** Beyond this the email becomes a wall of dates; the page carries the rest. */
const MAX_LINES = 12;

/**
 * The renter-facing ask for a recurring rental block - deposit first, then the
 * balance. One template covers both because the shape is identical (amount,
 * deadline, schedule, pay button) and only the framing changes.
 */
export function RentalBlockQuoteEmail({
  recipientName,
  blockLabel,
  kind,
  amountLabel,
  totalLabel,
  dueLabel,
  scheduleLines,
  payUrl,
  brand,
}: RentalBlockQuoteEmailProps) {
  const t = emailThemeFor(brand);
  const isDeposit = kind === "deposit";
  const shown = scheduleLines.slice(0, MAX_LINES);
  const hidden = scheduleLines.length - shown.length;

  return (
    <EmailLayout
      preview={
        isDeposit
          ? `${amountLabel} deposit holds your dates - ${blockLabel}`
          : `${amountLabel} balance due - ${blockLabel}`
      }
      brand={brand}
    >
      <StatusBanner mood="warning">
        {isDeposit ? "Deposit due" : "Balance due"}
      </StatusBanner>
      <Content>
        <H1>{isDeposit ? "Let's lock in your dates" : "Time to settle the balance"}</H1>
        <P>Hi {recipientName},</P>
        <P>
          {isDeposit
            ? `Here's the quote for ${blockLabel}. Paying the deposit confirms every session below - until then the dates are not held.`
            : `Your deposit for ${blockLabel} is in and your sessions are confirmed. The remaining balance is due now.`}
        </P>

        <DetailPanel>
          <Detail label={isDeposit ? "Deposit due now" : "Balance due"}>
            {amountLabel}
          </Detail>
          {dueLabel ? <Detail label="By">{dueLabel}</Detail> : null}
          <Hr style={{ borderColor: t.tokens.border, margin: "12px 0" }} />
          <Detail label="Block total">{totalLabel}</Detail>
          <Detail label="Sessions">{String(scheduleLines.length)}</Detail>
        </DetailPanel>

        <Button href={payUrl}>{isDeposit ? "Pay the deposit" : "Pay the balance"}</Button>

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

        <PMuted>
          Need to move a date or change the schedule? Reply to this email or call the
          facility and we'll sort it out.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default RentalBlockQuoteEmail;
