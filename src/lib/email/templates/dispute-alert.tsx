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

interface DisputeAlertEmailProps {
  stripeDisputeId: string;
  playerName: string;
  programName: string;
  seasonName: string;
  parentEmail: string;
  amount: string; // formatted, e.g. "$175.00"
  reasonCode: string; // Stripe reason verbatim
  evidenceDueBy: string | null; // formatted localized; null when Stripe didn't include a deadline
  stripeUrl: string;
}

/**
 * Founder-only operational alert when a Stripe dispute is filed against
 * a registration charge. NOT a customer email — this goes to the
 * founder's inbox so they can log into the Stripe dashboard and respond
 * before the evidence deadline.
 *
 * Deliberately minimal: the response surface is Stripe's evidence-upload
 * UI, which is better than anything we'd build at this stage. This email
 * just surfaces the existence of the dispute and links into the dashboard.
 */
export function DisputeAlertEmail({
  stripeDisputeId,
  playerName,
  programName,
  seasonName,
  parentEmail,
  amount,
  reasonCode,
  evidenceDueBy,
  stripeUrl,
}: DisputeAlertEmailProps) {
  return (
    <EmailLayout
      preview={`Action needed: dispute on ${playerName}'s registration (${amount})`}
    >
      <StatusBanner mood="problem">
        Stripe dispute filed — response needed
      </StatusBanner>
      <Content>
        <H1>Dispute on a registration charge</H1>
        <P>
          Stripe just notified us that the cardholder is disputing a charge.
          Funds may have already been withdrawn from the connected account.
          Log into the Stripe dashboard and respond before the evidence
          deadline.
        </P>
        <DetailPanel>
          <Detail label="Player">{playerName}</Detail>
          <Detail label="Program">{programName}</Detail>
          <Detail label="Season">{seasonName}</Detail>
          <Detail label="Parent email">{parentEmail}</Detail>
          <Detail label="Amount disputed">
            <strong>{amount}</strong>
          </Detail>
          <Detail label="Reason code">{reasonCode}</Detail>
          {evidenceDueBy && (
            <Detail label="Evidence due by">{evidenceDueBy}</Detail>
          )}
          <Detail label="Stripe dispute ID">{stripeDisputeId}</Detail>
        </DetailPanel>
        <Button href={stripeUrl}>Open this dispute in Stripe →</Button>
        <PMuted>
          This is an internal operational alert. The customer has not been
          notified by Aspire Sports.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default DisputeAlertEmail;
