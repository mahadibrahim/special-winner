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

interface CoachInviteEmailProps {
  name: string;
  inviteUrl: string;
  expiresIn: string;
  brand?: BrandId;
}

export function CoachInviteEmail({
  name,
  inviteUrl,
  expiresIn,
  brand,
}: CoachInviteEmailProps) {
  const t = emailThemeFor(brand);
  const brandName = getBrandTheme(brand).displayName;
  return (
    <EmailLayout
      preview={`You're hired — set up your ${brandName} coach account`}
      brand={brand}
    >
      <Content>
        <H1>Welcome to the {brandName} coaching team</H1>
        <P>Hi {name || "there"},</P>
        <P>
          Your coach account is ready. Tap the button below to sign in — no
          password needed. You&apos;ll land on your coach dashboard, where you
          can see your teams, plan practices, and track player development.
        </P>
        <Button href={inviteUrl}>Set up my coach account</Button>
        <P>
          This link expires in <strong>{expiresIn}</strong>. If it expires,
          use &quot;Forgot password&quot; on the sign-in page with this email
          address to get a fresh one.
        </P>
        <P>
          If the button above doesn&apos;t work, copy and paste this link into
          your browser:
        </P>
        <Text style={linkLine(t.tokens.inkMuted)}>
          <Link href={inviteUrl} style={linkStyle(t.tokens.primary)}>
            {inviteUrl}
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

export default CoachInviteEmail;
