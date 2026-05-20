import { Hr } from "@react-email/components";
import {
  Button,
  Content,
  Detail,
  DetailPanel,
  EmailLayout,
  H1,
  H2,
  InfoCard,
  P,
  PMuted,
  tokens,
} from "@/lib/email/components/email-layout";
import { StatusBanner } from "@/lib/email/components/status-banner";

interface PaymentReceiptEmailProps {
  parentName: string;
  childName: string;
  programName: string;
  seasonName: string;
  amountPaid: string;
  paymentDate: string;
  paymentType: string; // 'full', 'deposit', 'balance'
  remainingBalance?: string;
  receiptNumber: string;
  dashboardUrl: string;
}

export function PaymentReceiptEmail({
  parentName,
  childName,
  programName,
  seasonName,
  amountPaid,
  paymentDate,
  paymentType,
  remainingBalance,
  receiptNumber,
  dashboardUrl,
}: PaymentReceiptEmailProps) {
  const hasBalance = !!remainingBalance && remainingBalance !== "$0.00";
  const paymentLabel =
    paymentType === "deposit"
      ? "Deposit payment"
      : paymentType === "balance"
        ? "Balance payment"
        : "Full payment";

  return (
    <EmailLayout
      preview={`Payment receipt for ${childName} — ${programName}`}
    >
      <StatusBanner mood="success">Payment received</StatusBanner>
      <Content>
        <H1>Payment received</H1>
        <P>Hi {parentName},</P>
        <P>
          Thank you for your payment. This email confirms your{" "}
          {paymentType === "deposit"
            ? "deposit"
            : paymentType === "balance"
              ? "balance"
              : "full"}{" "}
          payment for <strong>{childName}</strong>'s registration in{" "}
          <strong>
            {programName} — {seasonName}
          </strong>
          .
        </P>

        <DetailPanel>
          <Detail label="Player">{childName}</Detail>
          <Detail label="Program">{programName}</Detail>
          <Detail label="Season">{seasonName}</Detail>
          <Detail label="Date">{paymentDate}</Detail>
          <Detail label="Type">{paymentLabel}</Detail>
          <Hr style={{ borderColor: tokens.border, margin: "12px 0" }} />
          <Detail label="Amount paid">
            <strong style={amountStyle}>{amountPaid}</strong>
          </Detail>
          {hasBalance && (
            <Detail label="Remaining balance">{remainingBalance}</Detail>
          )}
          <Detail label="Receipt #">{receiptNumber}</Detail>
        </DetailPanel>

        {hasBalance && (
          <InfoCard label="Outstanding balance" variant="warning">
            <P>
              <strong>Remaining balance:</strong> {remainingBalance}
            </P>
            <PMuted>
              Your remaining balance is due before the season starts. You can
              pay the balance anytime from your dashboard.
            </PMuted>
          </InfoCard>
        )}

        <Button href={dashboardUrl}>View your dashboard →</Button>

        <H2>What's next?</H2>
        <P>
          {hasBalance
            ? `${childName}'s spot is secured. Remember to complete your remaining balance payment before the season begins. Check your dashboard for team assignments and schedule updates.`
            : `You're all set. ${childName}'s registration is complete. We'll notify you when team assignments are made and the schedule is published.`}
        </P>
        <PMuted>Please save this email for your records.</PMuted>
      </Content>
    </EmailLayout>
  );
}

const amountStyle = {
  color: tokens.sage,
  fontSize: "16px",
};

export default PaymentReceiptEmail;
