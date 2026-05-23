import { Link, Text } from "@react-email/components";
import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  tokens,
} from "@/lib/email/components/email-layout";

interface EmailVerificationEmailProps {
  name: string;
  verifyUrl: string;
  expiresIn: string;
}

export function EmailVerificationEmail({
  name,
  verifyUrl,
  expiresIn,
}: EmailVerificationEmailProps) {
  return (
    <EmailLayout preview="Verify your email address for Aspire Sports">
      <Content>
        <H1>Verify your email</H1>
        <P>Hi {name || "there"},</P>
        <P>
          Welcome to Aspire Sports! Please verify your email address by clicking
          the button below.
        </P>
        <Button href={verifyUrl}>Verify email address →</Button>
        <P>
          This link will expire in <strong>{expiresIn}</strong>. If you didn't
          create an account with Aspire Sports, you can safely ignore this email.
        </P>
        <P>If the button above doesn't work, copy and paste this link into your browser:</P>
        <Text style={linkLine}>
          <Link href={verifyUrl} style={linkStyle}>
            {verifyUrl}
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

export default EmailVerificationEmail;
