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

interface RefundNotificationEmailProps {
  parentName: string;
  childName: string;
  programName: string;
  seasonName: string;
  refundAmount: string;
  refundStatus: "approved" | "denied" | "credited";
  denialReason?: string;
  dashboardUrl: string;
  brand?: BrandId;
}

export function RefundNotificationEmail({
  parentName,
  childName,
  programName,
  seasonName,
  refundAmount,
  refundStatus,
  denialReason,
  dashboardUrl,
  brand,
}: RefundNotificationEmailProps) {
  const preview =
    refundStatus === "approved"
      ? `Refund approved — ${refundAmount} for ${childName}`
      : refundStatus === "credited"
        ? `${refundAmount} account credit issued for ${childName}`
        : `Refund request update — ${childName}`;

  const heading =
    refundStatus === "approved"
      ? "Refund approved"
      : refundStatus === "credited"
        ? "Account credit issued"
        : "Refund request update";

  const mood = refundStatus === "denied" ? "problem" : "success";

  return (
    <EmailLayout preview={preview} brand={brand}>
      <StatusBanner mood={mood}>{heading}</StatusBanner>
      <Content>
        <H1>{heading}</H1>
        <P>Hi {parentName},</P>

        {refundStatus === "approved" && (
          <>
            <P>
              Great news — your refund request for <strong>{childName}</strong>
              's registration has been approved.
            </P>
            <DetailPanel>
              <Detail label="Program">{programName}</Detail>
              <Detail label="Season">{seasonName}</Detail>
              <Detail label="Player">{childName}</Detail>
              <Detail label="Amount">
                <strong>{refundAmount}</strong>
              </Detail>
            </DetailPanel>
            <P>
              The refund will be processed to your original payment method
              within 5–10 business days.
            </P>
          </>
        )}

        {refundStatus === "credited" && (
          <>
            <P>
              We've issued an account credit for <strong>{childName}</strong>
              's registration — no need to wait on a refund, the balance is
              ready to use on your next checkout.
            </P>
            <DetailPanel>
              <Detail label="Program">{programName}</Detail>
              <Detail label="Season">{seasonName}</Detail>
              <Detail label="Player">{childName}</Detail>
              <Detail label="Credit issued">
                <strong>{refundAmount}</strong>
              </Detail>
            </DetailPanel>
            <P>
              Your credit will automatically apply the next time you register
              and check out.
            </P>
          </>
        )}

        {refundStatus === "denied" && (
          <>
            <P>
              Unfortunately, we were unable to approve your refund request for{" "}
              <strong>{childName}</strong>'s registration in{" "}
              <strong>{programName}</strong>.
            </P>
            <DetailPanel>
              <Detail label="Program">{programName}</Detail>
              <Detail label="Season">{seasonName}</Detail>
              <Detail label="Player">{childName}</Detail>
              {denialReason && (
                <Detail label="Reason">{denialReason}</Detail>
              )}
            </DetailPanel>
            <PMuted>
              If you have questions about this decision, please reply to this
              email.
            </PMuted>
          </>
        )}

        <Button href={dashboardUrl}>View your dashboard →</Button>
      </Content>
    </EmailLayout>
  );
}

export default RefundNotificationEmail;
