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

export interface MagicLinkLoginEmailProps {
  parentName: string;
  magicLinkUrl: string;
  expiresIn: string;
  programName?: string;
  childName?: string;
  seasonName?: string;
  brand?: BrandId;
}

export function MagicLinkLoginEmail({
  parentName,
  magicLinkUrl,
  expiresIn,
  programName,
  childName,
  seasonName,
  brand,
}: MagicLinkLoginEmailProps) {
  const t = emailThemeFor(brand);
  const brandName = getBrandTheme(brand).displayName;
  return (
    <EmailLayout
      preview={`You're registered — sign in to your ${brandName} account`}
      brand={brand}
    >
      <Content>
        <H1>You're registered</H1>
        <P>Hi {parentName || "there"},</P>

        {childName && programName && seasonName && (
          <P>
            {childName} is registered for <strong>{programName}</strong> ({seasonName}).
          </P>
        )}

        <P>
          Tap the button below to sign in to your {brandName} account. We
          created an account for you so you can manage your registration, view
          team info, and register for future programs.
        </P>

        <Button href={magicLinkUrl}>Sign in to your account →</Button>

        <P>
          This link expires in <strong>{expiresIn}</strong> and can only be used
          once. You can also set a password later from your account settings.
        </P>

        <P>If the button above doesn't work, copy and paste this link into your browser:</P>
        <Text style={linkLine(t.tokens.inkMuted)}>
          <Link href={magicLinkUrl} style={linkStyle(t.tokens.primary)}>
            {magicLinkUrl}
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

export default MagicLinkLoginEmail;
