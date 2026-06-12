import { Link, Text } from "@react-email/components";
import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
} from "@/lib/email/components/email-layout";
import { emailThemeFor } from "@/lib/email/components/email-theme";
import { getBrandTheme, type BrandId } from "@/lib/branding/themes";

interface EmailVerificationEmailProps {
  name: string;
  verifyUrl: string;
  expiresIn: string;
  brand?: BrandId;
}

export function EmailVerificationEmail({
  name,
  verifyUrl,
  expiresIn,
  brand,
}: EmailVerificationEmailProps) {
  const t = emailThemeFor(brand);
  const brandName = getBrandTheme(brand).displayName;
  return (
    <EmailLayout preview={`Verify your email address for ${brandName}`} brand={brand}>
      <Content>
        <H1>Verify your email</H1>
        <P>Hi {name || "there"},</P>
        <P>
          Welcome to {brandName}! Please verify your email address by clicking
          the button below.
        </P>
        <Button href={verifyUrl}>Verify email address →</Button>
        <P>
          This link will expire in <strong>{expiresIn}</strong>. If you didn't
          create an account with {brandName}, you can safely ignore this email.
        </P>
        <P>If the button above doesn't work, copy and paste this link into your browser:</P>
        <Text style={linkLine(t.tokens.inkMuted)}>
          <Link href={verifyUrl} style={linkStyle(t.tokens.primary)}>
            {verifyUrl}
          </Link>
        </Text>
      </Content>
    </EmailLayout>
  );
}

const linkLine = (inkMuted: string) => ({
  fontSize: "13px",
  lineHeight: "1.5",
  color: inkMuted,
  margin: "0 0 16px",
  wordBreak: "break-all" as const,
});

const linkStyle = (primary: string) => ({
  color: primary,
  textDecoration: "underline",
});

export default EmailVerificationEmail;
