import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";
import type { BrandId } from "@/lib/branding/themes";

interface FeedbackNpsEmailProps {
  recipientName: string;
  /** e.g. "Pickup Soccer — Mon, Jun 29" or "Fall 2026 U10 Soccer season". */
  eventLabel: string;
  /** Absolute tokenized URL to /feedback/[token]. */
  surveyUrl: string;
  brand?: BrandId;
}

/**
 * Post-event NPS ask. Deliberately a single CTA — no embedded 0-10 score
 * links, because mail scanners and Apple link prefetch auto-click them and
 * fabricate responses. The score tap happens on the page.
 */
export function FeedbackNpsEmail({
  recipientName,
  eventLabel,
  surveyUrl,
  brand,
}: FeedbackNpsEmailProps) {
  return (
    <EmailLayout preview={`How was ${eventLabel}?`} brand={brand}>
      <Content>
        <H1>How was it?</H1>
        <P>Hi {recipientName},</P>
        <P>
          Thanks for being part of <strong>{eventLabel}</strong>. We&apos;d love
          to know how it went — it takes about 20 seconds.
        </P>
        <Button href={surveyUrl}>How was it? →</Button>
        <PMuted>
          Your answer goes straight to the people who run the program.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}
