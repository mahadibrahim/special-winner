import React from "react";
import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { EmailLayout, P, StatusPill } from "@/lib/email/components/email-layout";
import { StatusBanner } from "@/lib/email/components/status-banner";
import { RegistrationConfirmationEmail } from "@/lib/email/templates/registration-confirmation";
import { PaymentReceiptEmail } from "@/lib/email/templates/payment-receipt";
import { AnnouncementEmail } from "@/lib/email/templates/announcement";
import { WelcomeEmail1 } from "@/lib/email/templates/welcome-1-welcome";
import { WelcomeEmail2 } from "@/lib/email/templates/welcome-2-story";
import { WelcomeEmail3 } from "@/lib/email/templates/welcome-3-activation";

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

  it("renders the SoccerOne wordmark image and dark palette for brand=soccerone", async () => {
    const { html } = await renderEmail(
      <EmailLayout preview="test" brand="soccerone">
        <P>hello</P>
      </EmailLayout>,
    );
    expect(html).not.toContain("/images/logo-black.png");
    // Wordmark is a pre-rendered image, not live text.
    expect(html).toContain("/images/soccerone-wordmark.png");
    expect(html).toContain('alt="SoccerOne"');
    expect(html).toContain("#0a0a0d");
    expect(html).toContain("#a3e635"); // lime still drives the accent stripe + CTA
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
    expect(html).not.toContain("#F5EFE3");
  });

  it("PaymentReceiptEmail with brand=soccerone uses dark palette and SoccerOne name", async () => {
    const { html } = await renderEmail(
      <PaymentReceiptEmail {...receiptProps} brand="soccerone" />,
    );
    expect(html).toContain("#0a0a0d");
    expect(html).toContain("SoccerOne");
    expect(html).not.toContain("#F5EFE3");
  });

  it("RegistrationConfirmationEmail without brand uses cream palette and Aspire name", async () => {
    const { html } = await renderEmail(
      <RegistrationConfirmationEmail {...confirmationProps} />,
    );
    expect(html).toContain("#F5EFE3");
    expect(html).toContain("Aspire Sports Ohio");
    expect(html).not.toContain("#0a0a0d");
  });

  it("PaymentReceiptEmail without brand uses cream palette and Aspire name", async () => {
    const { html } = await renderEmail(
      <PaymentReceiptEmail {...receiptProps} />,
    );
    expect(html).toContain("#F5EFE3");
    expect(html).toContain("Aspire Sports Ohio");
    expect(html).not.toContain("#0a0a0d");
  });
});

describe("announcement + welcome-series templates are brand-aware", () => {
  const announcementProps = {
    recipientName: "Sam",
    announcementTitle: "Week 1 schedule is up",
    announcementContent: "Kickoff is 7pm on field 2.",
    authorName: "Jordan",
    publishedAt: "June 1, 2026",
    organizationName: "",
    dashboardUrl: "https://www.gosoccerone.com/dashboard",
  };

  const welcomeProps = {
    recipientName: "Sam",
    dashboardUrl: "https://www.gosoccerone.com/dashboard",
    unsubscribeUrl: "https://www.gosoccerone.com/unsub",
  };

  it("AnnouncementEmail with brand=soccerone uses dark palette and SoccerOne chrome", async () => {
    const { html } = await renderEmail(
      <AnnouncementEmail {...announcementProps} brand="soccerone" />,
    );
    expect(html).toContain("#0a0a0d");
    expect(html).toContain("SoccerOne");
    expect(html).not.toContain("#F5EFE3");
  });

  it("AnnouncementEmail without brand uses cream palette", async () => {
    const { html } = await renderEmail(
      <AnnouncementEmail {...announcementProps} />,
    );
    expect(html).toContain("#F5EFE3");
    expect(html).not.toContain("#0a0a0d");
  });

  it("welcome series under brand=soccerone uses dark palette and SoccerOne copy, no Aspire branding leaks in", async () => {
    for (const Email of [WelcomeEmail1, WelcomeEmail2, WelcomeEmail3]) {
      const { html } = await renderEmail(
        <Email {...welcomeProps} brand="soccerone" />,
      );
      expect(html).toContain("#0a0a0d");
      expect(html).toContain("SoccerOne");
      expect(html).not.toContain("#F5EFE3");
      // The Aspire-specific copy must not survive into a SoccerOne render.
      // (Scoped to the brand copy, not a blanket "Aspire" ban — the brand
      // kit allows a subtle "Powered by Aspire Sports" mark.)
      expect(html).not.toContain("Welcome to Aspire");
      expect(html).not.toContain("registered with Aspire Sports");
      expect(html).not.toContain("an Aspire league");
    }
  });

  it("welcome series without brand keeps Aspire copy + cream palette", async () => {
    for (const Email of [WelcomeEmail1, WelcomeEmail2, WelcomeEmail3]) {
      const { html } = await renderEmail(<Email {...welcomeProps} />);
      expect(html).toContain("#F5EFE3");
      expect(html).toContain("Aspire Sports");
      expect(html).not.toContain("#0a0a0d");
    }
  });
});
