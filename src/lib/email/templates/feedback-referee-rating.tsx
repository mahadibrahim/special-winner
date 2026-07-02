import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";
import type { BrandId } from "@/lib/branding/themes";

interface FeedbackRefereeRatingEmailProps {
  recipientName: string;
  /** e.g. "U10 Tigers vs U10 Lions — Sat, Jul 4". */
  eventLabel: string;
  /** Display name of the official, e.g. "Alex R.". */
  refereeName: string;
  surveyUrl: string;
  brand?: BrandId;
}

/**
 * Post-game referee rating ask, sent to the adults tied to both rosters
 * once the game is marked completed. Single CTA (no embedded star links —
 * same mail-scanner reasoning as the NPS email).
 */
export function FeedbackRefereeRatingEmail({
  recipientName,
  eventLabel,
  refereeName,
  surveyUrl,
  brand,
}: FeedbackRefereeRatingEmailProps) {
  return (
    <EmailLayout preview={`Rate the referee — ${eventLabel}`} brand={brand}>
      <Content>
        <H1>How did the ref do?</H1>
        <P>Hi {recipientName},</P>
        <P>
          <strong>{eventLabel}</strong> is in the books. Help us keep officiating
          quality high — rate referee <strong>{refereeName}</strong> in about 20
          seconds.
        </P>
        <Button href={surveyUrl}>Rate the referee →</Button>
        <PMuted>
          Ratings are anonymous and go only to league staff — never to the
          referee directly.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}
