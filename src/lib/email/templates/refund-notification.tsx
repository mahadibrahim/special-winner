import {
  Button,
  Detail,
  EmailLayout,
  H1,
  InfoCard,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";

interface RefundNotificationEmailProps {
  parentName: string;
  childName: string;
  programName: string;
  seasonName: string;
  refundAmount: string;
  refundStatus: "approved" | "denied";
  denialReason?: string;
  dashboardUrl: string;
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
}: RefundNotificationEmailProps) {
  const isApproved = refundStatus === "approved";

  return (
    <EmailLayout
      preview={
        isApproved
          ? `Refund approved — ${refundAmount} for ${childName}`
          : `Refund request update — ${childName}`
      }
      sectionLabel="Refund"
      sectionMeta={isApproved ? "Approved" : "Update"}
    >
      <H1>{isApproved ? "Refund approved" : "Refund request update"}</H1>
      <P>Hi {parentName},</P>

      {isApproved ? (
        <>
          <P>
            Great news — your refund request for <strong>{childName}</strong>'s
            registration has been approved.
          </P>
          <InfoCard label="Refund details" variant="success">
            <Detail label="Program">{programName}</Detail>
            <Detail label="Season">{seasonName}</Detail>
            <Detail label="Player">{childName}</Detail>
            <Detail label="Amount">
              <strong>{refundAmount}</strong>
            </Detail>
          </InfoCard>
          <P>
            The refund will be processed to your original payment method within
            5–10 business days.
          </P>
        </>
      ) : (
        <>
          <P>
            We've reviewed your refund request for <strong>{childName}</strong>'s
            registration in <strong>{programName}</strong>.
          </P>
          <InfoCard label="Refund request denied" variant="primary">
            <Detail label="Program">{programName}</Detail>
            <Detail label="Season">{seasonName}</Detail>
            <Detail label="Player">{childName}</Detail>
            {denialReason && <Detail label="Reason">{denialReason}</Detail>}
          </InfoCard>
          <PMuted>
            If you have questions about this decision, please reply to this
            email.
          </PMuted>
        </>
      )}

      <Button href={dashboardUrl}>View dashboard</Button>
    </EmailLayout>
  );
}

export default RefundNotificationEmail;
