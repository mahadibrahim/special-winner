import { Hr } from "@react-email/components";
import {
  Button,
  Content,
  Detail,
  DetailPanel,
  EmailLayout,
  H1,
  P,
  PMuted,
  tokens,
} from "@/lib/email/components/email-layout";
import { StatusBanner } from "@/lib/email/components/status-banner";

export type BalanceReminderType = "t21" | "t7" | "t1";

interface PaymentBalanceReminderEmailProps {
  parentName: string;
  childName: string;
  programName: string;
  seasonName: string;
  balanceAmount: string; // pre-formatted like "$175.00"
  seasonStartDate: string; // pre-formatted like "May 21, 2026"
  payBalanceUrl: string;
  reminderType: BalanceReminderType;
}

const COPY: Record<
  BalanceReminderType,
  { preview: (child: string) => string; lede: string }
> = {
  t21: {
    preview: (child) => `Friendly reminder: balance due for ${child}'s season`,
    lede: "Just a heads up — the remaining balance for your registration is due before the season starts. Paying now keeps everything on track.",
  },
  t7: {
    preview: (child) => `One week to go: balance due for ${child}'s season`,
    lede: "Your registration's remaining balance is due in one week. Your spot is held; we just need the balance settled before the first session.",
  },
  t1: {
    preview: (child) =>
      `Tomorrow: balance must be paid before the season starts`,
    lede: "The first session is tomorrow. The remaining balance must be paid before then so your spot stays active.",
  },
};

export function PaymentBalanceReminderEmail({
  parentName,
  childName,
  programName,
  seasonName,
  balanceAmount,
  seasonStartDate,
  payBalanceUrl,
  reminderType,
}: PaymentBalanceReminderEmailProps) {
  const copy = COPY[reminderType];

  return (
    <EmailLayout preview={copy.preview(childName)}>
      <StatusBanner mood="warning">Balance due</StatusBanner>
      <Content>
        <H1>Balance due: {balanceAmount}</H1>
        <P>Hi {parentName},</P>
        <P>{copy.lede}</P>

        <DetailPanel>
          <Detail label="Player">{childName}</Detail>
          <Detail label="Program">{programName}</Detail>
          <Detail label="Season">{seasonName}</Detail>
          <Detail label="Season starts">{seasonStartDate}</Detail>
          <Hr style={{ borderColor: tokens.border, margin: "12px 0" }} />
          <Detail label="Balance due">
            <strong style={amountStyle}>{balanceAmount}</strong>
          </Detail>
        </DetailPanel>

        <Button href={payBalanceUrl}>Pay balance now →</Button>

        <PMuted>
          Have questions or already paid? Reply to this email and we'll help.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

const amountStyle = {
  color: tokens.sage,
  fontSize: "16px",
};

export default PaymentBalanceReminderEmail;
