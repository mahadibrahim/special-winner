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

interface SignInLinkEmailProps {
  name: string;
  signInUrl: string;
  expiresIn: string;
  brand?: BrandId;
}

export function SignInLinkEmail({
  name,
  signInUrl,
  expiresIn,
  brand,
}: SignInLinkEmailProps) {
  const t = emailThemeFor(brand);
  const brandName = getBrandTheme(brand).displayName;
  return (
    <EmailLayout preview={`Tap the link to sign in to ${brandName}`} brand={brand}>
      <Content>
        <H1>Sign in to {brandName}</H1>
        <P>Hi {name || "there"},</P>
        <P>
          Tap the button below to sign in to your {brandName} account. No
          password needed — this is a one-tap, single-use link.
        </P>
        <Button href={signInUrl}>Sign in</Button>
        <P>
          This link will expire in <strong>{expiresIn}</strong>. If you didn't
          request this email, you can safely ignore it — nobody can access your
          account without tapping the link.
        </P>
        <P>If the button above doesn't work, copy and paste this link into your browser:</P>
        <Text style={linkLine(t.tokens.inkMuted)}>
          <Link href={signInUrl} style={linkStyle(t.tokens.primary)}>
            {signInUrl}
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

export default SignInLinkEmail;
