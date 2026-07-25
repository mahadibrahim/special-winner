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

interface WaiverReminderEmailProps {
  parentName: string;
  seasonName: string;
  seasonStartDate: string; // pre-formatted like "May 21, 2026"
  locationName: string;
  completionUrl: string;
  brand?: BrandId;
}

export function WaiverReminderEmail({
  parentName,
  seasonName,
  seasonStartDate,
  locationName,
  completionUrl,
  brand,
}: WaiverReminderEmailProps) {
  return (
    <EmailLayout
      preview={`Sign your waiver before game 1 — ${seasonName}`}
      brand={brand}
    >
      <StatusBanner mood="warning">Waiver still needed</StatusBanner>
      <Content>
        <H1>Sign your waiver before game 1.</H1>
        <P>Hi {parentName},</P>
        <P>
          Your registration is confirmed, but the waiver still needs a
          signature before the first game.
        </P>

        <DetailPanel>
          <Detail label="Season">{seasonName}</Detail>
          <Detail label="Starts">{seasonStartDate}</Detail>
          <Detail label="Location">{locationName}</Detail>
        </DetailPanel>

        <Button href={completionUrl}>Sign the waiver →</Button>

        <PMuted>We'll stop reminding you the moment it's signed.</PMuted>
      </Content>
    </EmailLayout>
  );
}

export default WaiverReminderEmail;
