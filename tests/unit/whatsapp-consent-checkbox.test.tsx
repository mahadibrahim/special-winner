// tests/unit/whatsapp-consent-checkbox.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { WhatsAppConsentCheckbox } from "@/components/consents/whatsapp-consent-checkbox";
import { SmsConsentCheckbox } from "@/components/sms/sms-consent-checkbox";
import { CONSENT_COPY } from "@/lib/consents/marketing-channels";

const render = (checked: boolean) =>
  renderToStaticMarkup(
    React.createElement(WhatsAppConsentCheckbox, {
      checked,
      onCheckedChange: () => {},
    }),
  );

describe("WhatsAppConsentCheckbox", () => {
  it("renders UNCHECKED when unchecked", () => {
    // A pre-checked box got the 10DLC registration declined once already.
    // If this fails, do not "fix" it by changing the assertion.
    //
    // Asserted on the semantic state rather than a bare "checked" substring:
    // the shadcn Checkbox emits aria-checked / data-state / data-[state=checked]
    // utility classes, so a substring check passes or fails for reasons that
    // have nothing to do with the box's actual state.
    const html = render(false);
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('data-state="unchecked"');
    expect(html).not.toContain('aria-checked="true"');
  });

  it("reflects the checked state when the parent sets it", () => {
    // Proves the assertion above is meaningful — that it would actually catch
    // a default-checked regression rather than passing vacuously.
    const html = render(true);
    expect(html).toContain('aria-checked="true"');
    expect(html).not.toContain('aria-checked="false"');
  });

  it("renders the stored consent sentence VERBATIM", () => {
    // The endpoint stores CONSENT_COPY.whatsapp as consentTextShown. A
    // reviewer compares the live form against that evidence, so the rendered
    // label and the stored string must be the same string — not merely
    // similar. Inlining the sentence in the component is what breaks this.
    expect(render(false)).toContain(CONSENT_COPY.whatsapp);
  });

  it("does not reuse the operational SMS consent language", () => {
    // Marketing consent (sessions, leagues, offers) and 10DLC operational
    // consent (schedule updates, reminders) are legally distinct. If the two
    // components ever render the same sentence, one of them is wrong.
    const whatsapp = render(false);
    const sms = renderToStaticMarkup(
      React.createElement(SmsConsentCheckbox, {
        checked: false,
        onCheckedChange: () => {},
      }),
    );
    expect(whatsapp).not.toContain("Text me schedule updates");
    expect(sms).not.toContain(CONSENT_COPY.whatsapp);
  });

  it("states that it is separate from the SMS consent and optional", () => {
    const html = render(false);
    expect(html).toContain("Separate from the text-message consent");
    expect(html).toContain("not a condition of registration");
  });
});
