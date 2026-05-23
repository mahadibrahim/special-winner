import { Link, Text } from "@react-email/components";
import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  tokens,
} from "@/lib/email/components/email-layout";

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
  return (
    <EmailLayout preview="You're registered — sign in to your Aspire Sports account">
      <Content>
        <H1>You're registered</H1>
        <P>Hi {parentName || "there"},</P>

        {childName && programName && seasonName && (
          <P>
            {childName} is registered for <strong>{programName}</strong> ({seasonName}).
          </P>
        )}

        <P>
          Tap the button below to sign in to your Aspire Sports account. We
          created an account for you so you can manage your registration, view
          team info, and register for future programs.
        </P>

        <Button href={magicLinkUrl}>Sign in to your account →</Button>

        <P>
          This link expires in <strong>{expiresIn}</strong> and can only be used
          once. You can also set a password later from your account settings.
        </P>

        <P>If the button above doesn't work, copy and paste this link into your browser:</P>
        <Text style={linkLine}>
          <Link href={magicLinkUrl} style={linkStyle}>
            {magicLinkUrl}
          </Link>
        </Text>
      </Content>
    </EmailLayout>
  );
}

const linkLine = {
  fontSize: "13px",
  lineHeight: "1.5",
  color: tokens.inkMuted,
  margin: "0 0 16px",
  wordBreak: "break-all" as const,
};

const linkStyle = {
  color: tokens.primary,
  textDecoration: "underline",
};

export default MagicLinkLoginEmail;
