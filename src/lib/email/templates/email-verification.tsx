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
  /**
   * Double opt-in mode. When set, this is the literal sentence the customer
   * ticked — the email confirms a MARKETING CONSENT rather than a signup, and
   * it quotes the consent back to them so the click is informed. Nobody is on
   * the list until it happens: the click is the verified act.
   */
  consentTextShown?: string;
}

export function EmailVerificationEmail({
  name,
  verifyUrl,
  expiresIn,
  brand,
  consentTextShown,
}: EmailVerificationEmailProps) {
  const t = emailThemeFor(brand);
  const brandName = getBrandTheme(brand).displayName;
  const isConsent = !!consentTextShown;
  return (
    <EmailLayout
      preview={
        isConsent
          ? `Confirm you want emails from ${brandName}`
          : `Verify your email address for ${brandName}`
      }
      brand={brand}
    >
      <Content>
        <H1>{isConsent ? "Confirm your email" : "Verify your email"}</H1>
        <P>Hi {name || "there"},</P>
        {isConsent ? (
          <>
            <P>
              Someone ticked this box for {brandName}: “{consentTextShown}”
            </P>
            <P>
              We only add an address once its owner confirms — so we will not
              email you until you click below.
            </P>
          </>
        ) : (
          <P>
            Welcome to {brandName}! Please verify your email address by clicking
            the button below.
          </P>
        )}
        <Button href={verifyUrl}>
          {isConsent ? "Yes, confirm my email →" : "Verify email address →"}
        </Button>
        <P>
          This link will expire in <strong>{expiresIn}</strong>.{" "}
          {isConsent
            ? `If this wasn't you, ignore this email — you will not be added to any list.`
            : `If you didn't create an account with ${brandName}, you can safely ignore this email.`}
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
