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

export type AbandonedCheckoutTouch =
  | "attempt"
  | "nudge"
  | "closing_soon"
  | "last_day";

export type AbandonedCartVariant = "solo" | "team";

interface AbandonedCheckoutEmailProps {
  variant: AbandonedCartVariant;
  parentName: string;
  /** Solo: the player being registered. Team: the team name. */
  subjectName: string;
  programName: string;
  seasonName: string;
  amountDue: string; // pre-formatted like "$120.00"
  /** Pre-formatted deadline like "Sunday, Sep 3" — required for the two
   *  deadline-anchored touches, ignored otherwise. */
  deadlineLabel?: string;
  resumeUrl: string;
  touch: AbandonedCheckoutTouch;
  brand?: BrandId;
}

interface TouchCopy {
  preview: string;
  heading: string;
  lede: string;
  cta: string;
}

function copyFor(
  variant: AbandonedCartVariant,
  touch: AbandonedCheckoutTouch,
  subjectName: string,
  seasonName: string,
  deadlineLabel: string | undefined,
  amountDue: string,
): TouchCopy {
  const deadline = deadlineLabel ?? "soon";
  if (variant === "team") {
    switch (touch) {
      case "attempt":
        return {
          preview: `${subjectName}'s spot is one step away`,
          heading: "Your team's spot is one step away",
          lede: `You started reserving ${subjectName} but didn't finish. ${amountDue} down holds the whole team — your roster splits the rest, and every teammate who joins pays their own share.`,
          cta: "Reserve my team →",
        };
      case "nudge":
        return {
          preview: `Still building ${subjectName}?`,
          heading: `Still building ${subjectName}?`,
          lede: `Your team reservation is saved and ready to finish. Captains tell us the hardest part is deciding — the reserving takes about two minutes.`,
          cta: "Reserve my team →",
        };
      case "closing_soon":
        return {
          preview: `Team registration closes ${deadline}`,
          heading: `Team registration closes ${deadline}`,
          lede: `${seasonName} locks its rosters on ${deadline}. Reserve ${subjectName} now and your crew can keep joining right up to the deadline.`,
          cta: `Reserve before ${deadline} →`,
        };
      case "last_day":
        return {
          preview: `Today is the last day to reserve ${subjectName}`,
          heading: "Today's the day",
          lede: `Registration for ${seasonName} closes tonight. This is the last chance to lock in ${subjectName}'s spot — after today the season is set.`,
          cta: "Reserve my team today →",
        };
    }
  }
  switch (touch) {
    case "attempt":
      return {
        preview: `Your spot in ${seasonName} is one step away`,
        heading: "Your spot is one step away",
        lede: "You started a registration but didn't get to the finish line. Everything you entered is saved — picking it back up takes under a minute.",
        cta: "Finish registration →",
      };
    case "nudge":
      return {
        preview: `Still thinking it over?`,
        heading: "Still thinking it over?",
        lede: `No rush — your registration is saved right where you left it. If a question is holding you up, just reply to this email and ask.`,
        cta: "Finish registration →",
      };
    case "closing_soon":
      return {
        preview: `Registration closes ${deadline} — ${seasonName}`,
        heading: `Registration closes ${deadline}`,
        lede: `${seasonName} locks its rosters on ${deadline}. Your saved registration takes under a minute to finish — after the deadline, spots are gone for the season.`,
        cta: `Finish before ${deadline} →`,
      };
    case "last_day":
      return {
        preview: `Today is the last day to register for ${seasonName}`,
        heading: "Today's the day",
        lede: `Registration for ${seasonName} closes tonight. Your spot is still saved — this is the last chance to claim it before the season is set.`,
        cta: "Claim my spot today →",
      };
  }
}

export function AbandonedCheckoutEmail({
  variant,
  parentName,
  subjectName,
  programName,
  seasonName,
  amountDue,
  deadlineLabel,
  resumeUrl,
  touch,
  brand,
}: AbandonedCheckoutEmailProps) {
  const copy = copyFor(variant, touch, subjectName, seasonName, deadlineLabel, amountDue);

  return (
    <EmailLayout preview={copy.preview} brand={brand}>
      <Content>
        <H1>{copy.heading}</H1>
        <P>Hi {parentName},</P>
        <P>{copy.lede}</P>

        <DetailPanel>
          <Detail label={variant === "team" ? "Team" : "Player"}>{subjectName}</Detail>
          <Detail label="Program">{programName}</Detail>
          <Detail label="Season">{seasonName}</Detail>
          <Detail label={variant === "team" ? "Deposit due today" : "Amount"}>
            {amountDue}
          </Detail>
          {deadlineLabel && (
            <Detail label="Registration closes">{deadlineLabel}</Detail>
          )}
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
