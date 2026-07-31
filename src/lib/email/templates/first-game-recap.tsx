import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";
import type { BrandId } from "@/lib/branding/themes";

interface FirstGameRecapEmailProps {
  recipientName: string;
  /** Program/league name, e.g. "Adult 4v4 Flag Football". */
  programName: string;
  /**
   * Google review deep-link. Nullable by convention — the sender resolves it
   * from org settings and the CTA block renders only when it exists.
   */
  reviewUrl?: string | null;
  appUrl?: string;
  brand?: BrandId;
}

/**
 * Post-first-game review ask. Deliberately minimal — no scores, standings,
 * or schedule facts, and a single CTA (like feedback-nps: mail scanners and
 * Apple link prefetch auto-click embedded links, so one plain button is the
 * safe shape). The ask is genuine and optional — never incentivized.
 */
export function FirstGameRecapEmail({
  recipientName,
  programName,
  reviewUrl,
  appUrl,
  brand,
}: FirstGameRecapEmailProps) {
  return (
    <EmailLayout preview="How was your first game?" appUrl={appUrl} brand={brand}>
      <Content>
        <H1>How was your first game?</H1>
        <P>Hi {recipientName},</P>
        <P>
          Your first <strong>{programName}</strong> game is in the books — we
          hope it was a great one, and we&apos;re glad you&apos;re out here
          playing with us.
        </P>
        {reviewUrl && (
          <>
            <P>
              If you had a good time, would you share a quick Google review of
              your experience so far?
            </P>
            <Button href={reviewUrl}>Leave a review →</Button>
            <PMuted>
              It takes about a minute, and it helps other players find the
              league.
            </PMuted>
          </>
        )}
      </Content>
    </EmailLayout>
  );
}
