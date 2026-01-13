import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

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
  const previewText = `Payment receipt for ${childName} - ${programName}`;
  const hasBalance = remainingBalance && remainingBalance !== "$0.00";

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Aspire Sports</Heading>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Heading style={heading}>Payment Received</Heading>

            <Text style={paragraph}>Hi {parentName},</Text>

            <Text style={paragraph}>
              Thank you for your payment! This email confirms your{" "}
              {paymentType === "deposit" ? "deposit" : paymentType === "balance" ? "balance" : "full"} payment
              for <strong>{childName}</strong>'s registration in{" "}
              <strong>{programName} - {seasonName}</strong>.
            </Text>

            {/* Receipt Box */}
            <Section style={receiptBox}>
              <div style={receiptHeader}>
                <Text style={receiptTitle}>Payment Receipt</Text>
                <Text style={receiptId}>#{receiptNumber}</Text>
              </div>

              <Hr style={receiptDivider} />

              <div style={receiptRow}>
                <Text style={receiptLabel}>Player</Text>
                <Text style={receiptValue}>{childName}</Text>
              </div>

              <div style={receiptRow}>
                <Text style={receiptLabel}>Program</Text>
                <Text style={receiptValue}>{programName}</Text>
              </div>

              <div style={receiptRow}>
                <Text style={receiptLabel}>Season</Text>
                <Text style={receiptValue}>{seasonName}</Text>
              </div>

              <div style={receiptRow}>
                <Text style={receiptLabel}>Payment Date</Text>
                <Text style={receiptValue}>{paymentDate}</Text>
              </div>

              <div style={receiptRow}>
                <Text style={receiptLabel}>Payment Type</Text>
                <Text style={receiptValue}>
                  {paymentType === "deposit" ? "Deposit Payment" :
                   paymentType === "balance" ? "Balance Payment" : "Full Payment"}
                </Text>
              </div>

              <Hr style={receiptDivider} />

              <div style={receiptRow}>
                <Text style={receiptLabelBold}>Amount Paid</Text>
                <Text style={receiptValueBold}>{amountPaid}</Text>
              </div>

              {hasBalance && (
                <div style={receiptRow}>
                  <Text style={receiptLabelMuted}>Remaining Balance</Text>
                  <Text style={receiptValueMuted}>{remainingBalance}</Text>
                </div>
              )}
            </Section>

            {/* Balance Notice */}
            {hasBalance && (
              <Section style={balanceNotice}>
                <Text style={balanceText}>
                  <strong>Remaining Balance:</strong> {remainingBalance}
                </Text>
                <Text style={balanceSubtext}>
                  Your remaining balance is due before the season starts. You can pay the balance anytime from your dashboard.
                </Text>
              </Section>
            )}

            {/* CTA Button */}
            <Section style={buttonContainer}>
              <Link href={dashboardUrl} style={button}>
                View Dashboard
              </Link>
            </Section>

            {/* Next Steps */}
            <Section>
              <Heading as="h3" style={subheading}>What's Next?</Heading>
              <Text style={paragraph}>
                {hasBalance ? (
                  <>
                    {childName}'s spot is secured! Remember to complete your remaining balance
                    payment before the season begins. Check your dashboard for team assignments
                    and schedule updates.
                  </>
                ) : (
                  <>
                    You're all set! {childName}'s registration is complete. We'll notify you
                    when team assignments are made and the schedule is published.
                  </>
                )}
              </Text>
            </Section>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              This is an automated receipt from Aspire Sports.
            </Text>
            <Text style={footerText}>
              Please save this email for your records.
            </Text>
            <Text style={footerText}>
              Questions? Reply to this email or contact us at support@aspiresports.com
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = {
  backgroundColor: "#f6f9fc",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  maxWidth: "600px",
};

const header = {
  backgroundColor: "#0a0a0f",
  padding: "24px",
  textAlign: "center" as const,
};

const logo = {
  color: "#ffffff",
  fontSize: "24px",
  fontWeight: "bold",
  margin: "0",
};

const content = {
  padding: "24px 32px",
};

const heading = {
  color: "#1a1a1a",
  fontSize: "28px",
  fontWeight: "bold",
  margin: "0 0 24px",
};

const subheading = {
  color: "#1a1a1a",
  fontSize: "18px",
  fontWeight: "600",
  margin: "24px 0 12px",
};

const paragraph = {
  color: "#525f7f",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

const receiptBox = {
  backgroundColor: "#ffffff",
  border: "1px solid #e6ebf1",
  borderRadius: "8px",
  margin: "24px 0",
  overflow: "hidden",
};

const receiptHeader = {
  backgroundColor: "#f8fafc",
  padding: "16px 20px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const receiptTitle = {
  color: "#1a1a1a",
  fontSize: "16px",
  fontWeight: "600",
  margin: "0",
};

const receiptId = {
  color: "#8898aa",
  fontSize: "14px",
  margin: "0",
};

const receiptDivider = {
  borderColor: "#e6ebf1",
  margin: "0",
};

const receiptRow = {
  padding: "12px 20px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const receiptLabel = {
  color: "#8898aa",
  fontSize: "14px",
  margin: "0",
};

const receiptValue = {
  color: "#525f7f",
  fontSize: "14px",
  margin: "0",
  textAlign: "right" as const,
};

const receiptLabelBold = {
  color: "#1a1a1a",
  fontSize: "16px",
  fontWeight: "600",
  margin: "0",
};

const receiptValueBold = {
  color: "#059669",
  fontSize: "18px",
  fontWeight: "700",
  margin: "0",
  textAlign: "right" as const,
};

const receiptLabelMuted = {
  color: "#8898aa",
  fontSize: "14px",
  margin: "0",
};

const receiptValueMuted = {
  color: "#d97706",
  fontSize: "14px",
  fontWeight: "600",
  margin: "0",
  textAlign: "right" as const,
};

const balanceNotice = {
  backgroundColor: "#fef9c3",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "24px 0",
};

const balanceText = {
  color: "#92400e",
  fontSize: "14px",
  margin: "0 0 8px",
};

const balanceSubtext = {
  color: "#92400e",
  fontSize: "13px",
  margin: "0",
  opacity: 0.8,
};

const buttonContainer = {
  textAlign: "center" as const,
  margin: "32px 0",
};

const button = {
  backgroundColor: "#cc442c",
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "600",
  padding: "12px 32px",
  textDecoration: "none",
};

const hr = {
  borderColor: "#e6ebf1",
  margin: "32px 0",
};

const footer = {
  padding: "0 32px",
};

const footerText = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
  textAlign: "center" as const,
  margin: "0 0 8px",
};

export default PaymentReceiptEmail;
