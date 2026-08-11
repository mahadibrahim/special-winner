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
import type { BrandId } from "@/lib/branding/themes";

export type AbandonedCheckoutTouch = "nudge" | "last_call";

interface AbandonedCheckoutEmailProps {
  parentName: string;
  playerName: string;
  programName: string;
  seasonName: string;
  amountDue: string; // pre-formatted like "$120.00"
  resumeUrl: string;
  touch: AbandonedCheckoutTouch;
  brand?: BrandId;
}

const COPY: Record<
  AbandonedCheckoutTouch,
  { preview: (season: string) => string; heading: string; lede: string; cta: string }
> = {
  nudge: {
    preview: (season) => `Your spot in ${season} is one step away`,
    heading: "Your spot is one step away",
    lede: "You started a registration but didn't get to the finish line. Everything you entered is saved — picking it back up takes under a minute.",
    cta: "Finish registration →",
  },
  last_call: {
    preview: (season) => `Last call — ${season} is filling up`,
    heading: "Last call on your registration",
    lede: "Your registration is still waiting, but rosters fill and registration closes on a date, not a vibe. Lock your spot in before it's gone.",
    cta: "Lock in my spot →",
  },
};

export function AbandonedCheckoutEmail({
  parentName,
  playerName,
  programName,
  seasonName,
  amountDue,
  resumeUrl,
  touch,
  brand,
}: AbandonedCheckoutEmailProps) {
  const copy = COPY[touch];

  return (
    <EmailLayout preview={copy.preview(seasonName)} brand={brand}>
      <Content>
        <H1>{copy.heading}</H1>
        <P>Hi {parentName},</P>
        <P>{copy.lede}</P>

        <DetailPanel>
          <Detail label="Player">{playerName}</Detail>
          <Detail label="Program">{programName}</Detail>
          <Detail label="Season">{seasonName}</Detail>
          <Detail label="Amount">{amountDue}</Detail>
        </DetailPanel>

        <Button href={resumeUrl}>{copy.cta}</Button>

        <PMuted>
          Changed your mind or have a question? Just reply to this email —
          a real person reads these.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default AbandonedCheckoutEmail;
