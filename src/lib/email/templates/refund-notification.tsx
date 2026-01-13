import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components";

interface RefundNotificationEmailProps {
  parentName: string;
  childName: string;
  programName: string;
  seasonName: string;
  refundAmount: string;
  refundStatus: "approved" | "denied";
  denialReason?: string;
  dashboardUrl: string;
}

export function RefundNotificationEmail({
  parentName,
  childName,
  programName,
  seasonName,
  refundAmount,
  refundStatus,
  denialReason,
  dashboardUrl,
}: RefundNotificationEmailProps) {
  const isApproved = refundStatus === "approved";

  return (
    <Html>
      <Head />
      <Preview>
        {isApproved
          ? `Refund Approved - ${refundAmount} for ${childName}`
          : `Refund Request Update - ${childName}`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Aspire Sports</Heading>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Heading style={heading}>
              {isApproved ? "Refund Approved" : "Refund Request Update"}
            </Heading>

            <Text style={paragraph}>Hi {parentName},</Text>

            {isApproved ? (
              <>
                <Text style={paragraph}>
                  Great news! Your refund request for <strong>{childName}</strong>'s
                  registration has been approved.
                </Text>

                {/* Refund Details */}
                <Section style={detailsBox}>
                  <Text style={detailsTitle}>Refund Details</Text>
                  <Text style={detailItem}>
                    <strong>Program:</strong> {programName}
                  </Text>
                  <Text style={detailItem}>
                    <strong>Season:</strong> {seasonName}
                  </Text>
                  <Text style={detailItem}>
                    <strong>Player:</strong> {childName}
                  </Text>
                  <Hr style={divider} />
                  <Text style={amountText}>
                    <strong>Refund Amount:</strong> {refundAmount}
                  </Text>
                </Section>

                <Text style={paragraph}>
                  The refund will be processed to your original payment method within
                  5-10 business days.
                </Text>
              </>
            ) : (
              <>
                <Text style={paragraph}>
                  We've reviewed your refund request for <strong>{childName}</strong>'s
                  registration in <strong>{programName}</strong>.
                </Text>

                <Section style={deniedBox}>
                  <Text style={deniedTitle}>Refund Request Denied</Text>
                  <Text style={detailItem}>
                    <strong>Program:</strong> {programName}
                  </Text>
                  <Text style={detailItem}>
                    <strong>Season:</strong> {seasonName}
                  </Text>
                  <Text style={detailItem}>
                    <strong>Player:</strong> {childName}
                  </Text>
                  {denialReason && (
                    <>
                      <Hr style={divider} />
                      <Text style={detailItem}>
                        <strong>Reason:</strong> {denialReason}
                      </Text>
                    </>
                  )}
                </Section>

                <Text style={paragraph}>
                  If you have questions about this decision, please contact us.
                </Text>
              </>
            )}

            {/* CTA */}
            <Section style={ctaSection}>
              <Link href={dashboardUrl} style={button}>
                View Dashboard
              </Link>
            </Section>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Questions? Reply to this email or contact us at{" "}
              <Link href="mailto:support@aspiresports.com" style={footerLink}>
                support@aspiresports.com
              </Link>
            </Text>
            <Text style={footerText}>
              © {new Date().getFullYear()} Aspire Sports. All rights reserved.
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
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
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
  padding: "32px 24px",
};

const heading = {
  color: "#1a1a1a",
  fontSize: "24px",
  fontWeight: "bold",
  margin: "0 0 24px",
};

const paragraph = {
  color: "#525252",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

const detailsBox = {
  backgroundColor: "#ecfdf5",
  borderRadius: "8px",
  padding: "20px",
  margin: "24px 0",
  border: "1px solid #a7f3d0",
};

const deniedBox = {
  backgroundColor: "#fef2f2",
  borderRadius: "8px",
  padding: "20px",
  margin: "24px 0",
  border: "1px solid #fecaca",
};

const detailsTitle = {
  color: "#065f46",
  fontSize: "14px",
  fontWeight: "bold",
  textTransform: "uppercase" as const,
  margin: "0 0 12px",
  letterSpacing: "0.5px",
};

const deniedTitle = {
  color: "#991b1b",
  fontSize: "14px",
  fontWeight: "bold",
  textTransform: "uppercase" as const,
  margin: "0 0 12px",
  letterSpacing: "0.5px",
};

const detailItem = {
  color: "#374151",
  fontSize: "14px",
  margin: "4px 0",
};

const amountText = {
  color: "#065f46",
  fontSize: "18px",
  fontWeight: "bold",
  margin: "0",
};

const divider = {
  borderColor: "#d1d5db",
  margin: "12px 0",
};

const ctaSection = {
  textAlign: "center" as const,
  margin: "32px 0",
};

const button = {
  backgroundColor: "#cc442c",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "bold",
  padding: "12px 24px",
  textDecoration: "none",
};

const footer = {
  backgroundColor: "#f9fafb",
  padding: "24px",
  textAlign: "center" as const,
};

const footerText = {
  color: "#6b7280",
  fontSize: "12px",
  margin: "4px 0",
};

const footerLink = {
  color: "#cc442c",
  textDecoration: "underline",
};

export default RefundNotificationEmail;
