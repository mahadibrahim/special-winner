import {
  Button,
  Content,
  Detail,
  DetailPanel,
  EmailLayout,
  H1,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";
import { StatusBanner } from "@/lib/email/components/status-banner";
import type { BrandId } from "@/lib/branding/themes";

interface PaymentFailedEmailProps {
  parentName: string;
  childName: string;
  programName: string;
  seasonName: string;
  failureMessage: string;
  retryUrl: string;
  brand?: BrandId;
}

export function PaymentFailedEmail({
  parentName,
  childName,
  programName,
  seasonName,
  failureMessage,
  retryUrl,
  brand,
}: PaymentFailedEmailProps) {
  return (
    <EmailLayout
      preview={`Payment didn't go through for ${childName}'s registration`}
      brand={brand}
    >
      <StatusBanner mood="problem">Action required — payment failed</StatusBanner>
      <Content>
        <H1>Your payment didn't go through</H1>
        <P>Hi {parentName},</P>
        <P>
          We weren't able to process your payment for{" "}
          <strong>{childName}</strong>'s registration in{" "}
          <strong>
            {programName} — {seasonName}
          </strong>
          . Your spot isn't confirmed yet — please retry the payment to secure
          it.
        </P>

        <DetailPanel>
          <Detail label="Player">{childName}</Detail>
          <Detail label="Program">{programName}</Detail>
          <Detail label="Season">{seasonName}</Detail>
          <Detail label="Reason">{failureMessage}</Detail>
        </DetailPanel>

        <Button href={retryUrl}>Retry payment →</Button>

        <PMuted>
          Common fixes: try a different card, double-check the billing zip, or
          contact your bank to confirm the charge was authorized. If you keep
          getting an error, just reply to this email and we'll help.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default PaymentFailedEmail;
