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

interface PlayerWaiverEmailProps {
  kind: "invite" | "reminder";
  playerName: string;
  isMinor: boolean;
  venueName: string;
  whenLabel: string;
  signUrl: string;
  brand?: BrandId;
}

/**
 * Per-player waiver email — sent when a player is added to a field-rental
 * roster ("invite") and again by the unsigned-waiver reminder cron
 * ("reminder"). Minor-aware: a minor's waiver is signed by a parent/guardian,
 * so the copy addresses the signer directly rather than the player.
 */
export function PlayerWaiverEmail({
  kind,
  playerName,
  isMinor,
  venueName,
  whenLabel,
  signUrl,
  brand,
}: PlayerWaiverEmailProps) {
  const heading =
    kind === "invite" ? "One waiver left to sign" : "Reminder: waiver still needed";

  const mood = kind === "invite" ? "warning" : "problem";
  const bannerText = kind === "invite" ? "Waiver required" : "Still waiting on your waiver";

  const body = isMinor
    ? `You're signing on behalf of ${playerName} to play at ${venueName} on ${whenLabel}. A parent or guardian must complete this waiver before they can take the field.`
    : `${playerName}, you need to sign a waiver to play at ${venueName} on ${whenLabel}. It only takes a minute.`;

  const reminderNote =
    kind === "reminder"
      ? isMinor
        ? `We haven't received a signed waiver for ${playerName} yet — please sign before game time.`
        : `We haven't received your signed waiver yet — please sign before game time.`
      : null;

  return (
    <EmailLayout preview={heading} brand={brand}>
      <StatusBanner mood={mood}>{bannerText}</StatusBanner>
      <Content>
        <H1>{heading}</H1>
        <P>{body}</P>

        {reminderNote ? <PMuted>{reminderNote}</PMuted> : null}

        <DetailPanel>
          <Detail label="Player">{playerName}</Detail>
          <Detail label="Where">{venueName}</Detail>
          <Detail label="When">{whenLabel}</Detail>
        </DetailPanel>

        <Button href={signUrl}>Sign the waiver</Button>
      </Content>
    </EmailLayout>
  );
}

export default PlayerWaiverEmail;
