import React from "react";
import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { EmailLayout, P, StatusPill } from "@/lib/email/components/email-layout";
import { StatusBanner } from "@/lib/email/components/status-banner";
import { RegistrationConfirmationEmail } from "@/lib/email/templates/registration-confirmation";
import { PaymentReceiptEmail } from "@/lib/email/templates/payment-receipt";

describe("EmailLayout brand rendering", () => {
  it("renders the Aspire image logo and cream palette by default", async () => {
    const { html } = await renderEmail(
      <EmailLayout preview="test">
        <P>hello</P>
      </EmailLayout>,
    );
    expect(html).toContain("/images/logo-black.png");
    expect(html).toContain("#F5EFE3");
    expect(html).toContain("Aspire Sports Ohio");
  });

  it("renders the SoccerOne wordmark and dark palette for brand=soccerone", async () => {
    const { html } = await renderEmail(
      <EmailLayout preview="test" brand="soccerone">
        <P>hello</P>
      </EmailLayout>,
    );
    expect(html).not.toContain("/images/logo-black.png");
    expect(html).toContain("SOCCER");
    expect(html).toContain("#0a0a0d");
    expect(html).toContain("#a3e635");
    expect(html).toContain("SoccerOne");
  });

  it("StatusPill + StatusBanner use SoccerOne-legible status tokens under brand=soccerone", async () => {
    const { html } = await renderEmail(
      <EmailLayout preview="test" brand="soccerone">
        <StatusBanner mood="warning">Payment pending</StatusBanner>
        <StatusPill variant="denied">Denied</StatusPill>
      </EmailLayout>,
    );
    // SoccerOne legible colors must appear
    expect(html).toContain("#fbbf24"); // warningFg
    expect(html).toContain("#f87171"); // deniedFg
    // Cream-era hardcoded colors must NOT appear
    expect(html).not.toContain("#8A6A2E"); // Aspire warningFg
    expect(html).not.toContain("#F4D8D2"); // Aspire deniedBg
  });

  it("StatusPill + StatusBanner use Aspire status tokens under default brand", async () => {
    const { html } = await renderEmail(
      <EmailLayout preview="test">
        <StatusBanner mood="warning">Payment pending</StatusBanner>
        <StatusPill variant="denied">Denied</StatusPill>
      </EmailLayout>,
    );
    // Aspire cream-era colors must appear
    expect(html).toContain("#8A6A2E"); // warningFg
    expect(html).toContain("#F4D8D2"); // deniedBg
  });
});

describe("booking templates accept a brand", () => {
  const confirmationProps = {
    parentName: "Sam",
    childName: "Alex Doe",
    programName: "Adult Pickup",
    seasonName: "Summer 2026",
    startDate: "June 1, 2026",
    endDate: "Aug 1, 2026",
    locationName: "Worthington",
    amountDue: "$120.00",
    paymentStatus: "paid",
    registrationStatus: "confirmed",
    dashboardUrl: "https://www.gosoccerone.com/dashboard",
    hasLinkedTelegram: false,
    paymentUrl: "https://www.gosoccerone.com/pay",
    waitlistClaimHours: 48,
  };

  const receiptProps = {
    parentName: "Sam",
    childName: "Alex Doe",
    programName: "Adult Pickup",
    seasonName: "Summer 2026",
    amountPaid: "$120.00",
    paymentDate: "June 1, 2026",
    paymentType: "full",
    receiptNumber: "REC-001",
    dashboardUrl: "https://www.gosoccerone.com/dashboard",
  };

  it("RegistrationConfirmationEmail with brand=soccerone uses dark palette and SoccerOne name", async () => {
    const { html } = await renderEmail(
      <RegistrationConfirmationEmail {...confirmationProps} brand="soccerone" />,
    );
    expect(html).toContain("#0a0a0d");
    expect(html).toContain("SoccerOne");
  });

  it("PaymentReceiptEmail with brand=soccerone uses dark palette and SoccerOne name", async () => {
    const { html } = await renderEmail(
      <PaymentReceiptEmail {...receiptProps} brand="soccerone" />,
    );
    expect(html).toContain("#0a0a0d");
    expect(html).toContain("SoccerOne");
  });

  it("RegistrationConfirmationEmail without brand uses cream palette and Aspire name", async () => {
    const { html } = await renderEmail(
      <RegistrationConfirmationEmail {...confirmationProps} />,
    );
    expect(html).toContain("#F5EFE3");
    expect(html).toContain("Aspire Sports Ohio");
  });
});
