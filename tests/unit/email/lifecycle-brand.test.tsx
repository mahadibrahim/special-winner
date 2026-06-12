import React from "react";
import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { WaitlistPromotionEmail } from "@/lib/email/templates/waitlist-promotion";
import { RefundNotificationEmail } from "@/lib/email/templates/refund-notification";
import { PaymentFailedEmail } from "@/lib/email/templates/payment-failed";
import { PaymentBalanceReminderEmail } from "@/lib/email/templates/payment-balance-reminder";
import { DropInBookingConfirmationEmail } from "@/lib/email/templates/dropin-booking-confirmation";
import { SignInLinkEmail } from "@/lib/email/templates/sign-in-link";
import { EmailVerificationEmail } from "@/lib/email/templates/email-verification";
import { MagicLinkLoginEmail } from "@/lib/email/templates/magic-link-login";

// ---------------------------------------------------------------------------
// Shared assertions
// ---------------------------------------------------------------------------

const SOCCERONE_BG = "#0a0a0d";
const ASPIRE_BG = "#F5EFE3";
const SOCCERONE_BRAND_NAME = "SoccerOne";

// ---------------------------------------------------------------------------
// WaitlistPromotionEmail
// ---------------------------------------------------------------------------

const waitlistProps = {
  parentName: "Sam",
  childName: "Alex Doe",
  programName: "Adult Soccer 7v7",
  seasonName: "Summer 2026",
  amountDue: "$120.00",
  expiresAt: "June 15, 2026 at 5:00 PM",
  hoursToComplete: 48,
  registerUrl: "https://www.gosoccerone.com/dashboard/registrations/abc/pay-balance",
  dashboardUrl: "https://www.gosoccerone.com/dashboard",
};

describe("WaitlistPromotionEmail brand rendering", () => {
  it("renders SoccerOne dark palette with brand=soccerone", async () => {
    const { html } = await renderEmail(
      <WaitlistPromotionEmail {...waitlistProps} brand="soccerone" />,
    );
    expect(html).toContain(SOCCERONE_BG);
    expect(html).toContain(SOCCERONE_BRAND_NAME);
    expect(html).not.toContain(ASPIRE_BG);
  });

  it("renders Aspire cream palette without brand", async () => {
    const { html } = await renderEmail(
      <WaitlistPromotionEmail {...waitlistProps} />,
    );
    expect(html).toContain(ASPIRE_BG);
    expect(html).not.toContain(SOCCERONE_BG);
  });
});

// ---------------------------------------------------------------------------
// RefundNotificationEmail
// ---------------------------------------------------------------------------

const refundProps = {
  parentName: "Sam",
  childName: "Alex Doe",
  programName: "Adult Soccer 7v7",
  seasonName: "Summer 2026",
  refundAmount: "$80.00",
  refundStatus: "approved" as const,
  dashboardUrl: "https://www.gosoccerone.com/dashboard",
};

describe("RefundNotificationEmail brand rendering", () => {
  it("renders SoccerOne dark palette with brand=soccerone", async () => {
    const { html } = await renderEmail(
      <RefundNotificationEmail {...refundProps} brand="soccerone" />,
    );
    expect(html).toContain(SOCCERONE_BG);
    expect(html).toContain(SOCCERONE_BRAND_NAME);
    expect(html).not.toContain(ASPIRE_BG);
  });

  it("renders Aspire cream palette without brand", async () => {
    const { html } = await renderEmail(
      <RefundNotificationEmail {...refundProps} />,
    );
    expect(html).toContain(ASPIRE_BG);
    expect(html).not.toContain(SOCCERONE_BG);
  });

  it("renders denied variant with brand=soccerone", async () => {
    const { html } = await renderEmail(
      <RefundNotificationEmail
        {...refundProps}
        refundStatus="denied"
        denialReason="Past cancellation window"
        brand="soccerone"
      />,
    );
    expect(html).toContain(SOCCERONE_BG);
    expect(html).not.toContain(ASPIRE_BG);
  });
});

// ---------------------------------------------------------------------------
// PaymentFailedEmail
// ---------------------------------------------------------------------------

const paymentFailedProps = {
  parentName: "Sam",
  childName: "Alex Doe",
  programName: "Adult Soccer 7v7",
  seasonName: "Summer 2026",
  failureMessage: "Your card was declined.",
  retryUrl: "https://www.gosoccerone.com/dashboard?retry=reg-123",
};

describe("PaymentFailedEmail brand rendering", () => {
  it("renders SoccerOne dark palette with brand=soccerone", async () => {
    const { html } = await renderEmail(
      <PaymentFailedEmail {...paymentFailedProps} brand="soccerone" />,
    );
    expect(html).toContain(SOCCERONE_BG);
    expect(html).toContain(SOCCERONE_BRAND_NAME);
    expect(html).not.toContain(ASPIRE_BG);
  });

  it("renders Aspire cream palette without brand", async () => {
    const { html } = await renderEmail(
      <PaymentFailedEmail {...paymentFailedProps} />,
    );
    expect(html).toContain(ASPIRE_BG);
    expect(html).not.toContain(SOCCERONE_BG);
  });
});

// ---------------------------------------------------------------------------
// PaymentBalanceReminderEmail
// ---------------------------------------------------------------------------

const balanceReminderProps = {
  parentName: "Sam",
  childName: "Alex Doe",
  programName: "Adult Soccer 7v7",
  seasonName: "Summer 2026",
  balanceAmount: "$80.00",
  seasonStartDate: "June 1, 2026",
  payBalanceUrl: "https://www.gosoccerone.com/dashboard/registrations/abc/pay-balance",
  reminderType: "t7" as const,
};

describe("PaymentBalanceReminderEmail brand rendering", () => {
  it("renders SoccerOne dark palette with brand=soccerone", async () => {
    const { html } = await renderEmail(
      <PaymentBalanceReminderEmail {...balanceReminderProps} brand="soccerone" />,
    );
    expect(html).toContain(SOCCERONE_BG);
    expect(html).toContain(SOCCERONE_BRAND_NAME);
    expect(html).not.toContain(ASPIRE_BG);
  });

  it("renders Aspire cream palette without brand", async () => {
    const { html } = await renderEmail(
      <PaymentBalanceReminderEmail {...balanceReminderProps} />,
    );
    expect(html).toContain(ASPIRE_BG);
    expect(html).not.toContain(SOCCERONE_BG);
  });
});

// ---------------------------------------------------------------------------
// DropInBookingConfirmationEmail
// ---------------------------------------------------------------------------

const dropInConfirmationProps = {
  recipientName: "Sam",
  sportLabel: "Soccer (7v7)",
  venueName: "Downtown",
  whenLabel: "Thu, Jun 15, 9:00 PM",
  amountLabel: "$15.74 paid",
  sessionUrl: "https://www.gosoccerone.com/dropin/sess-123",
};

describe("DropInBookingConfirmationEmail brand rendering", () => {
  it("renders SoccerOne dark palette with brand=soccerone", async () => {
    const { html } = await renderEmail(
      <DropInBookingConfirmationEmail {...dropInConfirmationProps} brand="soccerone" />,
    );
    expect(html).toContain(SOCCERONE_BG);
    expect(html).toContain(SOCCERONE_BRAND_NAME);
    expect(html).not.toContain(ASPIRE_BG);
  });

  it("renders Aspire cream palette without brand", async () => {
    const { html } = await renderEmail(
      <DropInBookingConfirmationEmail {...dropInConfirmationProps} />,
    );
    expect(html).toContain(ASPIRE_BG);
    expect(html).not.toContain(SOCCERONE_BG);
  });
});

// ---------------------------------------------------------------------------
// SignInLinkEmail
// ---------------------------------------------------------------------------

const signInLinkProps = {
  name: "Sam",
  signInUrl: "https://www.gosoccerone.com/auth/magic?token=abc",
  expiresIn: "15 minutes",
};

describe("SignInLinkEmail brand rendering", () => {
  it("renders SoccerOne dark palette and display name with brand=soccerone", async () => {
    const { html } = await renderEmail(
      <SignInLinkEmail {...signInLinkProps} brand="soccerone" />,
    );
    expect(html).toContain(SOCCERONE_BG);
    expect(html).toContain(SOCCERONE_BRAND_NAME);
    expect(html).not.toContain(ASPIRE_BG);
  });

  it("renders Aspire cream palette and display name without brand", async () => {
    const { html } = await renderEmail(
      <SignInLinkEmail {...signInLinkProps} />,
    );
    expect(html).toContain(ASPIRE_BG);
    expect(html).toContain("Aspire Sports");
    expect(html).not.toContain(SOCCERONE_BG);
  });
});

// ---------------------------------------------------------------------------
// EmailVerificationEmail
// ---------------------------------------------------------------------------

const emailVerificationProps = {
  name: "Sam",
  verifyUrl: "https://www.gosoccerone.com/verify-email/tok-abc",
  expiresIn: "24 hours",
};

describe("EmailVerificationEmail brand rendering", () => {
  it("renders SoccerOne dark palette and display name with brand=soccerone", async () => {
    const { html } = await renderEmail(
      <EmailVerificationEmail {...emailVerificationProps} brand="soccerone" />,
    );
    expect(html).toContain(SOCCERONE_BG);
    expect(html).toContain(SOCCERONE_BRAND_NAME);
    expect(html).not.toContain(ASPIRE_BG);
  });

  it("renders Aspire cream palette and display name without brand", async () => {
    const { html } = await renderEmail(
      <EmailVerificationEmail {...emailVerificationProps} />,
    );
    expect(html).toContain(ASPIRE_BG);
    expect(html).toContain("Aspire Sports");
    expect(html).not.toContain(SOCCERONE_BG);
  });
});

// ---------------------------------------------------------------------------
// MagicLinkLoginEmail
// ---------------------------------------------------------------------------

const magicLinkLoginProps = {
  parentName: "Sam",
  magicLinkUrl: "https://www.gosoccerone.com/auth/magic?token=abc",
  expiresIn: "15 minutes",
  programName: "Adult Soccer 7v7",
  childName: "Alex Doe",
  seasonName: "Summer 2026",
};

describe("MagicLinkLoginEmail brand rendering", () => {
  it("renders SoccerOne dark palette and display name with brand=soccerone", async () => {
    const { html } = await renderEmail(
      <MagicLinkLoginEmail {...magicLinkLoginProps} brand="soccerone" />,
    );
    expect(html).toContain(SOCCERONE_BG);
    expect(html).toContain(SOCCERONE_BRAND_NAME);
    expect(html).not.toContain(ASPIRE_BG);
  });

  it("renders Aspire cream palette and display name without brand", async () => {
    const { html } = await renderEmail(
      <MagicLinkLoginEmail {...magicLinkLoginProps} />,
    );
    expect(html).toContain(ASPIRE_BG);
    expect(html).toContain("Aspire Sports");
    expect(html).not.toContain(SOCCERONE_BG);
  });
});
