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

interface AnnouncementEmailProps {
  recipientName: string;
  announcementTitle: string;
  announcementContent: string;
  authorName: string;
  publishedAt: string;
  organizationName: string;
  dashboardUrl: string;
}

export function AnnouncementEmail({
  recipientName,
  announcementTitle,
  announcementContent,
  authorName,
  publishedAt,
  organizationName,
  dashboardUrl,
}: AnnouncementEmailProps) {
  const previewText = `New announcement: ${announcementTitle}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>{organizationName || "Aspire Sports"}</Heading>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Text style={announcementBadge}>NEW ANNOUNCEMENT</Text>

            <Heading style={heading}>{announcementTitle}</Heading>

            <Text style={meta}>
              From {authorName} &bull; {publishedAt}
            </Text>

            <Hr style={divider} />

            <Text style={paragraph}>Hi {recipientName || "there"},</Text>

            <Text style={paragraph}>
              A new announcement has been posted:
            </Text>

            <Section style={announcementBox}>
              <Text style={announcementText}>{announcementContent}</Text>
            </Section>

            {/* CTA Button */}
            <Section style={buttonContainer}>
              <Link href={dashboardUrl} style={button}>
                View in Dashboard
              </Link>
            </Section>

            <Text style={footerNote}>
              You're receiving this email because you're subscribed to announcements
              from {organizationName || "Aspire Sports"}. You can update your notification
              preferences in your dashboard settings.
            </Text>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              {organizationName || "Aspire Sports"} - Building character through athletics
            </Text>
            <Text style={footerText}>
              Questions? Reply to this email or contact your program administrator.
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

const announcementBadge = {
  backgroundColor: "#cc442c",
  color: "#ffffff",
  fontSize: "11px",
  fontWeight: "600",
  letterSpacing: "0.5px",
  padding: "4px 10px",
  borderRadius: "4px",
  display: "inline-block",
  marginBottom: "16px",
};

const heading = {
  color: "#1a1a1a",
  fontSize: "24px",
  fontWeight: "bold",
  margin: "0 0 8px",
  lineHeight: "1.3",
};

const meta = {
  color: "#8898aa",
  fontSize: "14px",
  margin: "0 0 16px",
};

const divider = {
  borderColor: "#e6ebf1",
  margin: "24px 0",
};

const paragraph = {
  color: "#525f7f",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

const announcementBox = {
  backgroundColor: "#f8f9fa",
  borderLeft: "4px solid #cc442c",
  padding: "16px 20px",
  margin: "24px 0",
  borderRadius: "0 8px 8px 0",
};

const announcementText = {
  color: "#1a1a1a",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0",
  whiteSpace: "pre-wrap" as const,
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

const footerNote = {
  color: "#8898aa",
  fontSize: "13px",
  lineHeight: "20px",
  margin: "24px 0 0",
  fontStyle: "italic" as const,
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

export default AnnouncementEmail;
