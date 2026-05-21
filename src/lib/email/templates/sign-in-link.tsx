import { Link, Text } from "@react-email/components";
import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  tokens,
} from "@/lib/email/components/email-layout";

interface SignInLinkEmailProps {
  name: string;
  signInUrl: string;
  expiresIn: string;
}

export function SignInLinkEmail({
  name,
  signInUrl,
  expiresIn,
}: SignInLinkEmailProps) {
  return (
    <EmailLayout preview="Tap the link to sign in to Aspire Sports">
      <Content>
        <H1>Sign in to Aspire Sports</H1>
        <P>Hi {name || "there"},</P>
        <P>
          Tap the button below to sign in to your Aspire Sports account. No
          password needed — this is a one-tap, single-use link.
        </P>
        <Button href={signInUrl}>Sign in</Button>
        <P>
          This link will expire in <strong>{expiresIn}</strong>. If you didn't
          request this email, you can safely ignore it — nobody can access your
          account without tapping the link.
        </P>
        <P>If the button above doesn't work, copy and paste this link into your browser:</P>
        <Text style={linkLine}>
          <Link href={signInUrl} style={linkStyle}>
            {signInUrl}
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

export default SignInLinkEmail;
