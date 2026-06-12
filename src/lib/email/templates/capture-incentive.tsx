import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";

// Aspire-only by design: the capture incentive is gated to the home-page
// band (source "home-incentive"), which never renders on SoccerOne hosts.
// If a SoccerOne incentive ever ships, thread `brand` through to EmailLayout
// like payment-receipt.tsx does — don't reuse this template as-is.
interface CaptureIncentiveEmailProps {
  /** Human-formatted amount, e.g. "$15". */
  amount: string;
  /** The shared discount code, e.g. "WELCOME15". */
  code: string;
  programsUrl: string;
}

export function CaptureIncentiveEmail({
  amount,
  code,
  programsUrl,
}: CaptureIncentiveEmailProps) {
  return (
    <EmailLayout preview={`Your ${amount} code is inside`}>
      <Content>
        <H1>Here's your {amount} — see you out there.</H1>
        <P>
          Use this code at checkout and we'll take {amount} off your first
          league, camp, or pickup block:
        </P>
        <P>
          <strong style={{ fontSize: "20px", letterSpacing: "0.08em" }}>
            {code}
          </strong>
        </P>
        <Button href={programsUrl}>Browse programs →</Button>
        <PMuted>
          You're getting this one-time email because you asked for a code on
          our site. The code is good for {amount} off one registration per
          person.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default CaptureIncentiveEmail;
