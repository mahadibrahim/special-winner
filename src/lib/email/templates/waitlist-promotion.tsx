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

interface WaitlistPromotionEmailProps {
  parentName: string;
  childName: string;
  programName: string;
  seasonName: string;
  amountDue: string;
  expiresAt: string; // e.g., "January 15, 2024 at 5:00 PM"
  hoursToComplete: number;
  registerUrl: string;
  dashboardUrl: string;
}

export function WaitlistPromotionEmail({
  parentName,
  childName,
  programName,
  seasonName,
  amountDue,
  expiresAt,
  hoursToComplete,
  registerUrl,
  dashboardUrl,
}: WaitlistPromotionEmailProps) {
  const previewText = `A spot opened up for ${childName} in ${programName}!`;

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

          {/* Urgent Banner */}
          <Section style={urgentBanner}>
            <Text style={urgentText}>ACTION REQUIRED - SPOT AVAILABLE</Text>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Heading style={heading}>A Spot Just Opened Up!</Heading>

            <Text style={paragraph}>Hi {parentName},</Text>

            <Text style={paragraph}>
              Great news! A spot has become available for <strong>{childName}</strong> in{" "}
              <strong>{programName} - {seasonName}</strong>. You've been moved from the
              waitlist and can now complete your registration.
            </Text>

            {/* Time Limit Warning */}
            <Section style={warningBox}>
              <Text style={warningTitle}>
                You have {hoursToComplete} hours to complete registration
              </Text>
              <Text style={warningText}>
                This spot is reserved for you until <strong>{expiresAt}</strong>.
                After that, it will be offered to the next person on the waitlist.
              </Text>
            </Section>

            {/* Registration Details */}
            <Section style={detailsBox}>
              <Heading as="h3" style={detailsHeading}>Registration Summary</Heading>

              <Text style={detailRow}>
                <strong>Player:</strong> {childName}
              </Text>
              <Text style={detailRow}>
                <strong>Program:</strong> {programName}
              </Text>
              <Text style={detailRow}>
                <strong>Season:</strong> {seasonName}
              </Text>
              <Text style={detailRow}>
                <strong>Amount Due:</strong> {amountDue}
              </Text>
            </Section>

            {/* CTA Button */}
            <Section style={buttonContainer}>
              <Link href={registerUrl} style={button}>
                Complete Registration Now
              </Link>
            </Section>

            <Text style={secondaryText}>
              Or view all your registrations on your{" "}
              <Link href={dashboardUrl} style={link}>dashboard</Link>.
            </Text>

            {/* FAQ Section */}
            <Section style={faqSection}>
              <Heading as="h3" style={faqHeading}>Frequently Asked Questions</Heading>

              <Text style={faqQuestion}>What if I miss the deadline?</Text>
              <Text style={faqAnswer}>
                If you don't complete registration within {hoursToComplete} hours, your spot
                will be offered to the next person on the waitlist. You'll remain on the
                waitlist but will need to wait for another opening.
              </Text>

              <Text style={faqQuestion}>Can I extend the deadline?</Text>
              <Text style={faqAnswer}>
                Unfortunately, we cannot extend the deadline as others are also waiting.
                Please complete your registration as soon as possible.
              </Text>

              <Text style={faqQuestion}>What payment methods do you accept?</Text>
              <Text style={faqAnswer}>
                We accept all major credit cards through our secure payment system.
              </Text>
            </Section>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              This spot is being held for you until {expiresAt}.
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

const urgentBanner = {
  backgroundColor: "#dc2626",
  padding: "12px 24px",
  textAlign: "center" as const,
};

const urgentText = {
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "700",
  letterSpacing: "0.5px",
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

const paragraph = {
  color: "#525f7f",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

const warningBox = {
  backgroundColor: "#fef2f2",
  border: "2px solid #fecaca",
  borderRadius: "8px",
  padding: "20px",
  margin: "24px 0",
};

const warningTitle = {
  color: "#dc2626",
  fontSize: "18px",
  fontWeight: "700",
  margin: "0 0 8px",
};

const warningText = {
  color: "#7f1d1d",
  fontSize: "14px",
  lineHeight: "20px",
  margin: "0",
};

const detailsBox = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  padding: "20px",
  margin: "24px 0",
};

const detailsHeading = {
  color: "#1a1a1a",
  fontSize: "16px",
  fontWeight: "600",
  margin: "0 0 16px",
};

const detailRow = {
  color: "#525f7f",
  fontSize: "14px",
  lineHeight: "20px",
  margin: "0 0 8px",
};

const buttonContainer = {
  textAlign: "center" as const,
  margin: "32px 0 16px",
};

const button = {
  backgroundColor: "#cc442c",
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "18px",
  fontWeight: "700",
  padding: "16px 48px",
  textDecoration: "none",
};

const secondaryText = {
  color: "#8898aa",
  fontSize: "14px",
  textAlign: "center" as const,
  margin: "0 0 24px",
};

const link = {
  color: "#cc442c",
  textDecoration: "underline",
};

const faqSection = {
  marginTop: "32px",
  paddingTop: "24px",
  borderTop: "1px solid #e6ebf1",
};

const faqHeading = {
  color: "#1a1a1a",
  fontSize: "16px",
  fontWeight: "600",
  margin: "0 0 16px",
};

const faqQuestion = {
  color: "#1a1a1a",
  fontSize: "14px",
  fontWeight: "600",
  margin: "16px 0 4px",
};

const faqAnswer = {
  color: "#8898aa",
  fontSize: "14px",
  lineHeight: "20px",
  margin: "0 0 8px",
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

export default WaitlistPromotionEmail;
