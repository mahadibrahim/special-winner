import { Link, Text } from "@react-email/components";
import {
  Button,
  EmailLayout,
  H1,
  P,
  tokens,
} from "@/lib/email/components/email-layout";

/**
 * Magic-link sign-in email.
 *
 * Component + file are still named "PasswordResetEmail" / "password-reset.tsx"
 * to avoid touching every call site at once — same template now serves the
 * one-tap sign-in flow that replaced the password-reset endpoint. The prop
 * `resetUrl` likewise carries the magic-link redemption URL; renaming for
 * clarity is a separate follow-up.
 */
interface PasswordResetEmailProps {
  name: string;
  /** Magic-link redemption URL. Prop name kept for back-compat. */
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
      preview="Tap the link to sign in to Aspire Sports"
      sectionLabel="Account"
      sectionMeta="Sign in"
    >
      <H1>Sign in to Aspire Sports</H1>
      <P>Hi {name || "there"},</P>
      <P>
        Tap the button below to sign in to your Aspire Sports account. No
        password needed — this is a one-tap, single-use link.
      </P>
      <Button href={resetUrl}>Sign in</Button>
      <P>
        This link will expire in <strong>{expiresIn}</strong>. If you didn't
        request this email, you can safely ignore it — nobody can access your
        account without tapping the link.
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
