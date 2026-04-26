import { Link, Text } from "@react-email/components";
import {
  Button,
  EmailLayout,
  H1,
  P,
  tokens,
} from "@/lib/email/components/email-layout";

interface PasswordResetEmailProps {
  name: string;
  resetUrl: string;
  expiresIn: string;
}

export function PasswordResetEmail({
  name,
  resetUrl,
  expiresIn,
}: PasswordResetEmailProps) {
  return (
    <EmailLayout
      preview="Reset your Aspire Sports password"
      sectionLabel="Account"
      sectionMeta="Password reset"
    >
      <H1>Reset your password</H1>
      <P>Hi {name || "there"},</P>
      <P>
        We received a request to reset your password for your Aspire Sports
        account. Click the button below to create a new password.
      </P>
      <Button href={resetUrl}>Reset password</Button>
      <P>
        This link will expire in <strong>{expiresIn}</strong>. If you didn't
        request a password reset, you can safely ignore this email — your
        password will not be changed.
      </P>
      <P>If the button above doesn't work, copy and paste this link into your browser:</P>
      <Text style={linkLine}>
        <Link href={resetUrl} style={linkStyle}>
          {resetUrl}
        </Link>
      </Text>
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

export default PasswordResetEmail;
