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

export interface MagicLinkLoginEmailProps {
  parentName: string;
  magicLinkUrl: string;
  expiresIn: string;
  programName?: string;
  childName?: string;
  seasonName?: string;
}

export function MagicLinkLoginEmail({
  parentName,
  magicLinkUrl,
  expiresIn,
  programName,
  childName,
  seasonName,
}: MagicLinkLoginEmailProps) {
  const previewText = "You're registered — sign in to your Aspire Sports account";

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
            <Heading style={heading}>You're registered!</Heading>

            <Text style={paragraph}>Hi {parentName || "there"},</Text>

            {childName && programName && seasonName && (
              <Text style={paragraph}>
                {childName} is registered for <strong>{programName}</strong> ({seasonName}).
              </Text>
            )}

            <Text style={paragraph}>
              Tap the button below to sign in to your Aspire Sports account. We
              created an account for you so you can manage your registration,
              view team info, and register for future programs.
            </Text>

            {/* CTA Button */}
            <Section style={buttonContainer}>
              <Link href={magicLinkUrl} style={button}>
                Sign in to your account
              </Link>
            </Section>

            <Text style={paragraph}>
              This link expires in <strong>{expiresIn}</strong> and can only be
              used once. You can also set a password later from your account
              settings.
            </Text>

            <Text style={paragraph}>
              If the button above doesn't work, copy and paste this link into
              your browser:
            </Text>
            <Text style={linkText}>
              <Link href={magicLinkUrl} style={linkStyle}>{magicLinkUrl}</Link>
            </Text>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Aspire Sports - Building character through athletics
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

const paragraph = {
  color: "#525f7f",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0 0 16px",
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

const linkText = {
  color: "#525f7f",
  fontSize: "14px",
  lineHeight: "20px",
  margin: "0 0 16px",
  wordBreak: "break-all" as const,
};

const linkStyle = {
  color: "#cc442c",
  textDecoration: "underline",
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

export default MagicLinkLoginEmail;
