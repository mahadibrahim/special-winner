import {
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

interface FeedbackDetractorAlertEmailProps {
  score: number;
  comment: string | null;
  eventLabel: string;
  /** feedback_requests.kind, e.g. "nps_drop_in". */
  kind: string;
  brand?: BrandId;
}

/**
 * Internal staff alert fired the moment a detractor (0-6) score lands, so
 * the relationship can be recovered while it's fresh. The rater is NOT named
 * — staff follow up through the dashboard context, not by confronting the
 * customer with their score.
 */
export function FeedbackDetractorAlertEmail({
  score,
  comment,
  eventLabel,
  kind,
  brand,
}: FeedbackDetractorAlertEmailProps) {
  return (
    <EmailLayout preview={`Low NPS score (${score}/10) — ${eventLabel}`} brand={brand}>
      <StatusBanner mood="warning">Detractor alert</StatusBanner>
      <Content>
        <H1>
          Someone rated us {score}/10
        </H1>
        <DetailPanel>
          <Detail label="Experience">{eventLabel}</Detail>
          <Detail label="Survey type">{kind}</Detail>
          <Detail label="Score">{`${score} / 10`}</Detail>
          <Detail label="Comment">{comment ?? "No comment left (yet)"}</Detail>
        </DetailPanel>
        <P>
          Full response context is in the admin dashboard under Reports → NPS.
        </P>
        <PMuted>
          Sent automatically when a survey score of 6 or below is submitted.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}
