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
  refundStatus: "approved" | "denied";
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
  const isApproved = refundStatus === "approved";

  return (
    <EmailLayout
      preview={
        isApproved
          ? `Refund approved — ${refundAmount} for ${childName}`
          : `Refund request update — ${childName}`
      }
      brand={brand}
    >
      <StatusBanner mood={isApproved ? "success" : "problem"}>
        {isApproved ? "Refund approved" : "Refund request update"}
      </StatusBanner>
      <Content>
        <H1>{isApproved ? "Refund approved" : "Refund request update"}</H1>
        <P>Hi {parentName},</P>

        {isApproved ? (
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
        ) : (
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
