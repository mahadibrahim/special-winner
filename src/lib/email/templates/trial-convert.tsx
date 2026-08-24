import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";

export interface TrialConvertTierDisplay {
  name: string;
  /** Pre-formatted, e.g. "$79/mo" or "Ask us about pricing". */
  priceLabel: string;
}

interface TrialConvertEmailProps {
  parentFirstName: string;
  childFirstName: string;
  className: string;
  tiers: TrialConvertTierDisplay[];
  ctaUrl: string;
}

// Youth classes are an Aspire-only feature (SoccerOne has no class-slot
// product), so this template is not brand-aware like most of its siblings —
// it always renders EmailLayout's aspire chrome and lets the layout's
// default appUrl ("https://aspiresportsohio.com") resolve the logo. The CTA
// URL is passed in fully-built by the caller (send.ts), same convention as
// every other template here.
export function TrialConvertEmail({
  parentFirstName,
  childFirstName,
  className,
  tiers,
  ctaUrl,
}: TrialConvertEmailProps) {
  return (
    <EmailLayout preview={`How was ${childFirstName}'s trial class?`}>
      <Content>
        <H1>How did {className} go for {childFirstName}?</H1>
        <P>Hi {parentFirstName},</P>
        <P>
          {childFirstName}'s trial class wrapped up a few days ago — we hope
          it was a good one. If {childFirstName} is ready to keep coming
          back, here's what joining looks like:
        </P>

        {tiers.map((tier) => (
          <P key={tier.name}>
            <strong>{tier.name}</strong> — {tier.priceLabel}
          </P>
        ))}

        <Button href={ctaUrl}>See membership pricing →</Button>

        <PMuted>
          No pressure — {childFirstName}'s trial class is already taken care
          of either way. This is just here if you want to keep the momentum
          going.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default TrialConvertEmail;
