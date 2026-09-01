import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";

interface ClassBlockNudgeEmailProps {
  parentFirstName: string;
  childFirstName: string;
  className: string;
  ctaUrl: string;
}

// Youth classes are an Aspire-only feature (SoccerOne has no class-slot
// product), so — same as trial-convert.tsx — this template is not
// brand-aware; it always renders EmailLayout's aspire chrome and lets the
// layout's default appUrl resolve the logo. The CTA URL is passed in
// fully-built by the caller (send.ts), same convention as every other
// template here.
export function ClassBlockNudgeEmail({
  parentFirstName,
  childFirstName,
  className,
  ctaUrl,
}: ClassBlockNudgeEmailProps) {
  return (
    <EmailLayout preview={`One more step for ${childFirstName}'s spot in ${className}`}>
      <Content>
        <H1>{childFirstName}'s spot in {className} is already paid for</H1>
        <P>Hi {parentFirstName},</P>
        <P>
          There's just one thing left before {childFirstName} can start:
          sign the guardian waiver and pick up the weeks you already booked.
          It only takes a minute.
        </P>

        <Button href={ctaUrl}>Finish setting up {childFirstName}'s spot →</Button>

        <PMuted>
          {childFirstName}'s booked weeks are waiting either way — this is
          just the last step to get them on the schedule.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default ClassBlockNudgeEmail;
