import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";
import type { BrandId } from "@/lib/branding/themes";

// Sent when a visitor stuck in an in-app browser (Instagram/Facebook) asks
// the escape banner to email them a link instead of switching apps manually.
// Plain, no eyebrow — mirrors the structure of capture-incentive.tsx.
interface InappRecaptureEmailProps {
  seasonName: string;
  registerUrl: string;
  brand?: BrandId;
}

export function InappRecaptureEmail({
  seasonName,
  registerUrl,
  brand = "aspire",
}: InappRecaptureEmailProps) {
  return (
    <EmailLayout preview={`Finish signing up for ${seasonName}`} brand={brand}>
      <Content>
        <H1>Finish signing up.</H1>
        <P>You asked for a link to {seasonName} to finish on your own device.</P>
        <Button href={registerUrl}>Finish signing up</Button>
        <PMuted>
          Open this on your phone's browser — Apple Pay and autofill work
          there.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default InappRecaptureEmail;
