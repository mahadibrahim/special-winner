import { and, eq, ne, sql } from "drizzle-orm";
import { sendEmail, isEmailConfigured, fromForBrand } from "./index";
import { renderEmail } from "./render";
import { formatEmailDate, formatEmailDateTime } from "./format";
import { RegistrationConfirmationEmail } from "./templates/registration-confirmation";
import { PaymentReceiptEmail } from "./templates/payment-receipt";
import { WaitlistPromotionEmail } from "./templates/waitlist-promotion";
import { RefundNotificationEmail } from "./templates/refund-notification";
import { MagicLinkLoginEmail } from "./templates/magic-link-login";
import { PaymentFailedEmail } from "./templates/payment-failed";
import { AnnouncementEmail } from "./templates/announcement";
import {
  PaymentBalanceReminderEmail,
  type BalanceReminderType,
} from "./templates/payment-balance-reminder";
import { WaiverReminderEmail } from "./templates/waiver-reminder";
import { AbandonedCheckoutEmail } from "./templates/abandoned-checkout";
import type { WaiverReminderWindowType } from "@/lib/registrations/waiver-reminder-windows";
import { SignInLinkEmail } from "./templates/sign-in-link";
import { CoachInviteEmail } from "./templates/coach-invite";
import { EmailVerificationEmail } from "./templates/email-verification";
import { WelcomeEmail1 } from "./templates/welcome-1-welcome";
import { WelcomeEmail2 } from "./templates/welcome-2-story";
import { WelcomeEmail3 } from "./templates/welcome-3-activation";
import { DisputeAlertEmail } from "./templates/dispute-alert";
import { CaptureIncentiveEmail } from "./templates/capture-incentive";
import { InappRecaptureEmail } from "./templates/inapp-recapture";
import { FeedbackNpsEmail } from "./templates/feedback-nps";
import { FeedbackDetractorAlertEmail } from "./templates/feedback-detractor-alert";
import { FeedbackRefereeRatingEmail } from "./templates/feedback-referee-rating";
import { FirstGameRecapEmail } from "./templates/first-game-recap";
import {
  DevReportMonthlyEmail,
  type DevReportMonthlyDomain,
} from "./templates/dev-report-monthly";
import {
  DevReportQuarterlyEmail,
  type DevReportQuarterlyDomain,
  type DevReportQuarterlyAchievement,
} from "./templates/dev-report-quarterly";
import { TrialConvertEmail } from "./templates/trial-convert";
import { ClassBlockNudgeEmail } from "./templates/class-block-nudge";
import { resolveGoogleReviewUrl } from "@/lib/feedback/review-url";
import {
  CAPTURE_INCENTIVE,
  formatIncentiveAmount,
} from "@/lib/marketing/capture-incentive";
import {
  signUnsubscribeToken,
  getUnsubscribeSecret,
} from "@/lib/marketing/unsubscribe-token";
import { getDb } from "@/lib/db";
import { emailLogs, organizations, type OrganizationSettings } from "@/lib/db/schema";
import { sendToParent } from "@/lib/messaging/gateway";
import { env } from "@/lib/env";
import { WAITLIST_PROMOTION_HOURS } from "@/lib/waitlist/processor";
import { originForBrand } from "@/lib/organization/soccerone-routing";
import { getBrandTheme, type BrandId } from "@/lib/branding/themes";

/** Clip a string to `max` chars for use inside an SMS body. */
function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/**
 * Fire a short SMS nudge in ADDITION to a transactional email, for
 * time-sensitive messages only. Uses the messaging gateway forced to the
 * SMS channel — it no-ops cleanly if the parent has no verified phone.
 * Never throws into the caller; an SMS failure must not affect the email.
 */
async function sendSmsNudge(opts: {
  userId: string;
  organizationId: string;
  body: string;
}): Promise<void> {
  try {
    const result = await sendToParent({
      parentUserId: opts.userId,
      organizationId: opts.organizationId,
      body: opts.body,
      forceChannel: "sms",
      senderType: "system",
    });
    if (!result.ok) {
      console.warn(`[email] SMS nudge not delivered: ${result.reason}`);
    }
  } catch (err) {
    console.error("[email] SMS nudge failed:", err);
  }
}

/**
 * Send a transactional email. Email is the channel of record: the HTML
 * email is always sent and always logged. For time-sensitive types the
 * caller passes `smsNudge`, which fires an additional short SMS — never a
 * replacement for the email.
 */
async function sendTransactionalEmail(opts: {
  userId?: string;
  registrationId?: string;
  emailType: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Sender override (per-brand display name); defaults to EMAIL_FROM. */
  from?: string;
  smsNudge?: { organizationId?: string; body: string };
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const result = await sendEmail({
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    from: opts.from,
  });

  await logEmail({
    userId: opts.userId,
    registrationId: opts.registrationId,
    emailType: opts.emailType,
    recipientEmail: opts.to,
    subject: opts.subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  if (opts.smsNudge?.organizationId && opts.userId) {
    // Fire-and-forget — SMS nudge never blocks or fails the email.
    void sendSmsNudge({
      userId: opts.userId,
      organizationId: opts.smsNudge.organizationId,
      body: opts.smsNudge.body,
    });
  }

  return result;
}

// Helper to log emails. Writes one row per send attempt to email_logs;
// failures are swallowed so a logging error never blocks the email itself.
async function logEmail(data: {
  userId?: string;
  registrationId?: string;
  emailType: string;
  recipientEmail: string;
  subject: string;
  resendMessageId?: string;
  status: string;
  /** Free-form identifying stamp for dedupe keys that don't fit the fixed
   *  columns above (e.g. a per-child id when recipientEmail is a shared
   *  parent address) — see sendTrialConvertEmail's dedupe note. */
  metadata?: Record<string, unknown>;
}) {
  try {
    await getDb().insert(emailLogs).values({
      userId: data.userId,
      registrationId: data.registrationId,
      emailType: data.emailType,
      recipientEmail: data.recipientEmail,
      subject: data.subject,
      resendMessageId: data.resendMessageId,
      status: data.status,
      metadata: data.metadata,
    });
  } catch (error) {
    console.error("Error logging email:", error);
  }
}

// Format currency from cents
function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Registration confirmation email
export interface SendRegistrationConfirmationParams {
  userId: string;
  organizationId?: string;
  registrationId: string;
  parentEmail: string;
  parentName: string;
  childName: string;
  programName: string;
  seasonName: string;
  startDate: Date | string;
  endDate: Date | string;
  scheduleNotes?: string;
  locationName: string;
  locationAddress?: string;
  amountDueCents: number;
  paymentStatus: string;
  registrationStatus: string;
  /** Pass true when the parent already has Telegram linked to suppress the connect CTA in the email. */
  hasLinkedTelegram?: boolean;
  /** Magic-link (or plain) URL to /account/complete/{registrationId} — pass
   *  only when the registration's waiver is still unsigned. See the prop
   *  doc on RegistrationConfirmationEmailProps for the render contract. */
  completionUrl?: string;
  /** Brand attribution for the purchase — from Stripe metadata.brand or
   *  the request host. Controls email template + link origin. Defaults
   *  to aspire. */
  brand?: BrandId;
}

export async function sendRegistrationConfirmationEmail(params: SendRegistrationConfirmationParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping registration confirmation email");
    return { success: false, error: "Email not configured" };
  }

  const appUrl = originForBrand(params.brand) ?? env.PUBLIC_APP_URL;

  const { html, text } = await renderEmail(
    RegistrationConfirmationEmail({
      parentName: params.parentName,
      childName: params.childName,
      programName: params.programName,
      seasonName: params.seasonName,
      startDate: formatEmailDate(params.startDate),
      endDate: formatEmailDate(params.endDate),
      scheduleNotes: params.scheduleNotes,
      locationName: params.locationName,
      locationAddress: params.locationAddress,
      amountDue: formatCurrency(params.amountDueCents),
      paymentStatus: params.paymentStatus,
      registrationStatus: params.registrationStatus,
      dashboardUrl: `${appUrl}/dashboard`,
      hasLinkedTelegram: params.hasLinkedTelegram ?? false,
      paymentUrl: `${appUrl}/dashboard/registrations/${params.registrationId}/pay-balance`,
      waitlistClaimHours: WAITLIST_PROMOTION_HOURS,
      completionUrl: params.completionUrl,
      brand: params.brand,
    }),
  );

  const subject =
    params.registrationStatus === "waitlisted"
      ? `Waitlist confirmation — ${params.childName} for ${params.programName}`
      : `Registration confirmed — ${params.childName} for ${params.programName}`;

  return sendTransactionalEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: "registration_confirmation",
    to: params.parentEmail,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
  });
}

// Payment receipt email
export interface SendPaymentReceiptParams {
  userId: string;
  organizationId?: string;
  registrationId: string;
  parentEmail: string;
  parentName: string;
  childName: string;
  programName: string;
  seasonName: string;
  amountPaidCents: number;
  paymentType: string;
  remainingBalanceCents?: number;
  receiptNumber: string;
  /** Brand attribution for the purchase — from Stripe metadata.brand or
   *  the request host. Controls email template + link origin. Defaults
   *  to aspire. */
  brand?: BrandId;
}

export async function sendPaymentReceiptEmail(params: SendPaymentReceiptParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping payment receipt email");
    return { success: false, error: "Email not configured" };
  }

  const appUrl = originForBrand(params.brand) ?? env.PUBLIC_APP_URL;

  const { html, text } = await renderEmail(
    PaymentReceiptEmail({
      parentName: params.parentName,
      childName: params.childName,
      programName: params.programName,
      seasonName: params.seasonName,
      amountPaid: formatCurrency(params.amountPaidCents),
      paymentDate: formatEmailDate(new Date()),
      paymentType: params.paymentType,
      remainingBalance: params.remainingBalanceCents
        ? formatCurrency(params.remainingBalanceCents)
        : undefined,
      receiptNumber: params.receiptNumber,
      dashboardUrl: `${appUrl}/dashboard`,
      brand: params.brand,
    }),
  );

  const subject = `Payment receipt — ${params.childName}, ${params.programName}`;

  return sendTransactionalEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: "payment_receipt",
    to: params.parentEmail,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
  });
}

// Waitlist promotion email
export interface SendWaitlistPromotionParams {
  userId: string;
  organizationId?: string;
  registrationId: string;
  parentEmail: string;
  parentName: string;
  childName: string;
  programName: string;
  seasonName: string;
  amountDueCents: number;
  expiresAt: Date;
  hoursToComplete: number;
  /** Brand attribution for the purchase — controls email template + link origin. */
  brand?: BrandId;
}

export async function sendWaitlistPromotionEmail(params: SendWaitlistPromotionParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping waitlist promotion email");
    return { success: false, error: "Email not configured" };
  }

  const appUrl = originForBrand(params.brand) ?? env.PUBLIC_APP_URL;

  const { html, text } = await renderEmail(
    WaitlistPromotionEmail({
      parentName: params.parentName,
      childName: params.childName,
      programName: params.programName,
      seasonName: params.seasonName,
      amountDue: formatCurrency(params.amountDueCents),
      expiresAt: formatEmailDateTime(params.expiresAt),
      hoursToComplete: params.hoursToComplete,
      registerUrl: `${appUrl}/dashboard/registrations/${params.registrationId}/pay-balance`,
      dashboardUrl: `${appUrl}/dashboard`,
      brand: params.brand,
    }),
  );

  const subject = `Action required: a spot opened for ${params.childName}`;

  const smsBody = `A spot just opened for ${clip(params.childName, 40)} in ${clip(params.programName, 40)}! Confirm within ${params.hoursToComplete}h: ${appUrl}/dashboard/registrations/${params.registrationId}/pay-balance`;

  return sendTransactionalEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: "waitlist_promotion",
    to: params.parentEmail,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
    smsNudge: { organizationId: params.organizationId, body: smsBody },
  });
}

// Refund notification email
export interface SendRefundNotificationParams {
  userId: string;
  organizationId?: string;
  registrationId: string;
  parentEmail: string;
  parentName: string;
  childName: string;
  programName: string;
  seasonName: string;
  refundAmountCents: number;
  refundStatus: "approved" | "denied" | "credited";
  denialReason?: string;
  /** Brand attribution for the registration — controls email template + link origin. */
  brand?: BrandId;
}

export async function sendRefundNotificationEmail(params: SendRefundNotificationParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping refund notification email");
    return { success: false, error: "Email not configured" };
  }

  const appUrl = originForBrand(params.brand) ?? env.PUBLIC_APP_URL;

  const { html, text } = await renderEmail(
    RefundNotificationEmail({
      parentName: params.parentName,
      childName: params.childName,
      programName: params.programName,
      seasonName: params.seasonName,
      refundAmount: formatCurrency(params.refundAmountCents),
      refundStatus: params.refundStatus,
      denialReason: params.denialReason,
      dashboardUrl: `${appUrl}/dashboard`,
      brand: params.brand,
    }),
  );

  const subject =
    params.refundStatus === "approved"
      ? `Refund approved — ${formatCurrency(params.refundAmountCents)} for ${params.childName}`
      : params.refundStatus === "credited"
        ? `${formatCurrency(params.refundAmountCents)} account credit issued — ${params.childName}`
        : `Refund request update — ${params.childName}`;

  const emailType =
    params.refundStatus === "approved"
      ? "refund_approved"
      : params.refundStatus === "credited"
        ? "refund_credited"
        : "refund_denied";

  return sendTransactionalEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType,
    to: params.parentEmail,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
  });
}

// Magic-link login email (sent to guests after checkout to let them access their account)
export interface SendMagicLinkLoginParams {
  userId: string;
  organizationId?: string;
  parentEmail: string;
  parentName: string;
  magicLinkUrl: string;
  expiresIn?: string;
  programName?: string;
  childName?: string;
  seasonName?: string;
  /** Brand the checkout was placed on — controls template theme + sender.
   *  Defaults to aspire. */
  brand?: BrandId;
  /** "existing" = the already-registered manage-link flow (#457): neutral
   *  sign-in copy, no "we created an account for you". Default "welcome". */
  variant?: "welcome" | "existing";
}

export async function sendMagicLinkLoginEmail(params: SendMagicLinkLoginParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping magic-link login email");
    return { success: false, error: "Email not configured" };
  }

  const { html, text } = await renderEmail(
    MagicLinkLoginEmail({
      parentName: params.parentName,
      magicLinkUrl: params.magicLinkUrl,
      expiresIn: params.expiresIn ?? "15 minutes",
      programName: params.programName,
      childName: params.childName,
      seasonName: params.seasonName,
      brand: params.brand,
      variant: params.variant,
    }),
  );

  const subject =
    params.variant === "existing"
      ? "Your sign-in link — manage your registration"
      : "You're registered — finish setting up your account";

  return sendTransactionalEmail({
    userId: params.userId,
    emailType: "magic_link_login",
    to: params.parentEmail,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
  });
}

// Payment-failed notification (Stripe payment_intent.payment_failed webhook)
export interface SendPaymentFailedParams {
  userId: string;
  organizationId?: string;
  registrationId: string;
  parentEmail: string;
  parentName: string;
  childName: string;
  programName: string;
  seasonName: string;
  failureMessage: string;
  /** Caller must build retryUrl using the brand origin. */
  retryUrl: string;
  /** Brand attribution for the registration — controls email template + sender. */
  brand?: BrandId;
}

export async function sendPaymentFailedEmail(params: SendPaymentFailedParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping payment-failed email");
    return { success: false, error: "Email not configured" };
  }

  const { html, text } = await renderEmail(
    PaymentFailedEmail({
      parentName: params.parentName,
      childName: params.childName,
      programName: params.programName,
      seasonName: params.seasonName,
      failureMessage: params.failureMessage,
      retryUrl: params.retryUrl,
      brand: params.brand,
    }),
  );

  const subject = `Payment failed — ${params.childName}'s ${params.programName} registration`;

  const smsBody = `Heads up: your payment for ${clip(params.childName, 40)}'s ${clip(params.programName, 40)} registration didn't go through. Retry: ${params.retryUrl}`;

  return sendTransactionalEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: "payment_failed",
    to: params.parentEmail,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
    smsNudge: { organizationId: params.organizationId, body: smsBody },
  });
}

// Announcement email — fire-and-forget per-recipient send used by the
// admin announcements API when `sendEmail: true` is set on the announcement.
export interface SendAnnouncementParams {
  userId: string;
  organizationId?: string;
  recipientEmail: string;
  recipientName: string;
  announcementTitle: string;
  announcementContent: string;
  authorName: string;
  publishedAt: string;
  organizationName: string;
  dashboardUrl: string;
  /** Brand attribution for the recipient — controls email theme + sender.
   *  Defaults to aspire. */
  brand?: BrandId;
}

export async function sendAnnouncementEmail(params: SendAnnouncementParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping announcement email");
    return { success: false, error: "Email not configured" };
  }

  const { html, text } = await renderEmail(
    AnnouncementEmail({
      recipientName: params.recipientName,
      announcementTitle: params.announcementTitle,
      announcementContent: params.announcementContent,
      authorName: params.authorName,
      publishedAt: params.publishedAt,
      organizationName: params.organizationName,
      dashboardUrl: params.dashboardUrl,
      brand: params.brand,
    }),
  );

  const subject = `${params.organizationName}: ${params.announcementTitle}`;

  return sendTransactionalEmail({
    userId: params.userId,
    emailType: "announcement",
    to: params.recipientEmail,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
  });
}

// Balance reminder email — fired by /api/cron/send-balance-reminders
// at T-21, T-7, T-1 days before the season starts.
export interface SendBalanceReminderParams {
  userId: string;
  organizationId?: string;
  registrationId: string;
  parentEmail: string;
  parentName: string;
  childName: string;
  programName: string;
  seasonName: string;
  balanceCents: number;
  seasonStartDate: Date | string;
  /** Caller must build payBalanceUrl using the brand origin. */
  payBalanceUrl: string;
  reminderType: BalanceReminderType;
  /** Brand attribution for the registration — controls email template + sender. */
  brand?: BrandId;
}

export async function sendBalanceReminderEmail(
  params: SendBalanceReminderParams,
) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping balance reminder email");
    return { success: false, error: "Email not configured" };
  }

  const { html, text } = await renderEmail(
    PaymentBalanceReminderEmail({
      parentName: params.parentName,
      childName: params.childName,
      programName: params.programName,
      seasonName: params.seasonName,
      balanceAmount: formatCurrency(params.balanceCents),
      seasonStartDate: formatEmailDate(params.seasonStartDate),
      payBalanceUrl: params.payBalanceUrl,
      reminderType: params.reminderType,
      brand: params.brand,
    }),
  );

  const subject = `Balance due: ${formatCurrency(params.balanceCents)} — ${params.programName} ${params.seasonName}`;

  const smsBody = `Reminder: ${formatCurrency(params.balanceCents)} balance due for ${clip(params.childName, 40)} (${clip(params.programName, 40)}). Pay: ${params.payBalanceUrl}`;

  return sendTransactionalEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: `balance_reminder_${params.reminderType}`,
    to: params.parentEmail,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
    smsNudge: { organizationId: params.organizationId, body: smsBody },
  });
}

// Abandoned-checkout reminder — fired by
// /api/cron/send-abandoned-checkout-reminders for registrations that were
// started but never paid. Two touches ("nudge" ~1 day, "last_call" ~4 days);
// the emailType carries the touch so email_logs dedupes each exactly once.
export interface SendAbandonedCheckoutParams {
  /** Solo carts have a user + registration; team carts (reservation
   *  attempts) have neither — the email logs by recipient only. */
  userId?: string;
  organizationId?: string;
  registrationId?: string;
  variant: import("./templates/abandoned-checkout").AbandonedCartVariant;
  parentEmail: string;
  parentName: string;
  /** Solo: player name. Team: team name. */
  subjectName: string;
  programName: string;
  seasonName: string;
  amountDueCents: number;
  /** Pre-formatted deadline (e.g. "Sunday, Sep 3") for the deadline-anchored
   *  touches. */
  deadlineLabel?: string;
  resumeUrl: string;
  touch: import("./templates/abandoned-checkout").AbandonedCheckoutTouch;
  brand?: BrandId;
}

export async function sendAbandonedCheckoutReminderEmail(
  params: SendAbandonedCheckoutParams,
) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping abandoned-checkout email");
    return { success: false, error: "Email not configured" };
  }

  const { html, text } = await renderEmail(
    AbandonedCheckoutEmail({
      variant: params.variant,
      parentName: params.parentName,
      subjectName: params.subjectName,
      programName: params.programName,
      seasonName: params.seasonName,
      amountDue: formatCurrency(params.amountDueCents),
      deadlineLabel: params.deadlineLabel,
      resumeUrl: params.resumeUrl,
      touch: params.touch,
      brand: params.brand,
    }),
  );

  const subjectByTouch: Record<typeof params.touch, string> =
    params.variant === "team"
      ? {
          attempt: `${params.subjectName}'s spot is one step away`,
          nudge: `Still building ${params.subjectName}?`,
          closing_soon: `Team registration closes ${params.deadlineLabel ?? "soon"} — ${params.seasonName}`,
          last_day: `Last day to reserve ${params.subjectName}'s spot`,
        }
      : {
          attempt: `Your spot in ${params.seasonName} is one step away`,
          nudge: `Still thinking it over? Your ${params.seasonName} spot is saved`,
          closing_soon: `Registration closes ${params.deadlineLabel ?? "soon"} — ${params.seasonName}`,
          last_day: `Today is the last day to register for ${params.seasonName}`,
        };

  const emailTypePrefix =
    params.variant === "team" ? "team_abandoned" : "abandoned_checkout";

  return sendTransactionalEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: `${emailTypePrefix}_${params.touch}`,
    to: params.parentEmail,
    subject: subjectByTouch[params.touch],
    html,
    text,
    from: fromForBrand(params.brand),
  });
}

// Waiver reminder email — fired by /api/cron/send-waiver-reminders on the
// cadence documented in src/lib/registrations/waiver-reminder-windows.ts.
export interface SendWaiverReminderParams {
  userId: string;
  organizationId?: string;
  registrationId: string;
  parentEmail: string;
  parentName: string;
  seasonName: string;
  seasonStartDate: Date | string;
  locationName: string;
  /** Caller must build completionUrl using the brand origin (magic-link for
   *  guest/passwordless parents, plain path otherwise). */
  completionUrl: string;
  reminderType: WaiverReminderWindowType;
  brand?: BrandId;
}

export async function sendWaiverReminderEmail(params: SendWaiverReminderParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping waiver reminder email");
    return { success: false, error: "Email not configured" };
  }

  const { html, text } = await renderEmail(
    WaiverReminderEmail({
      parentName: params.parentName,
      seasonName: params.seasonName,
      seasonStartDate: formatEmailDate(params.seasonStartDate),
      locationName: params.locationName,
      completionUrl: params.completionUrl,
      brand: params.brand,
    }),
  );

  const subject = `Sign your waiver before game 1 — ${params.seasonName}`;

  return sendTransactionalEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: `waiver_reminder_${params.reminderType}`,
    to: params.parentEmail,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
  });
}

// Sign-in link email (magic-link for signup + forgot-password flows)
export interface SendSignInLinkParams {
  userId: string;
  recipientEmail: string;
  name: string;
  signInUrl: string;
  expiresIn?: string;
  /** Brand the sign-in was requested from — controls template theme, sender,
   *  and subject display name. Defaults to aspire. */
  brand?: BrandId;
}

export async function sendSignInLinkEmail(params: SendSignInLinkParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping sign-in link email");
    return { success: false, error: "Email not configured" };
  }

  const brandName = getBrandTheme(params.brand).displayName;

  const { html, text } = await renderEmail(
    SignInLinkEmail({
      name: params.name,
      signInUrl: params.signInUrl,
      expiresIn: params.expiresIn ?? "15 minutes",
      brand: params.brand,
    }),
  );

  const subject = `Sign in to ${brandName}`;

  return sendTransactionalEmail({
    userId: params.userId,
    emailType: "sign_in_link",
    to: params.recipientEmail,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
  });
}

// Coach hire invite (sent by POST /api/admin/applications/[id]/hire)
export interface SendCoachInviteParams {
  userId: string;
  recipientEmail: string;
  name: string;
  inviteUrl: string;
  expiresIn?: string;
  brand?: BrandId;
}

export async function sendCoachInviteEmail(params: SendCoachInviteParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping coach invite email");
    return { success: false, error: "Email not configured" };
  }

  const brandName = getBrandTheme(params.brand).displayName;

  const { html, text } = await renderEmail(
    CoachInviteEmail({
      name: params.name,
      inviteUrl: params.inviteUrl,
      expiresIn: params.expiresIn ?? "72 hours",
      brand: params.brand,
    }),
  );

  return sendTransactionalEmail({
    userId: params.userId,
    emailType: "coach_invite",
    to: params.recipientEmail,
    subject: `Welcome to the ${brandName} coaching team`,
    html,
    text,
    from: fromForBrand(params.brand),
  });
}

// Email verification email (sent after signup to confirm email ownership)
export interface SendEmailVerificationParams {
  userId: string;
  recipientEmail: string;
  name: string;
  verifyUrl: string;
  expiresIn?: string;
  /** Brand the signup was initiated from — controls template theme, sender,
   *  and subject display name. Defaults to aspire. */
  brand?: BrandId;
}

export async function sendEmailVerificationEmail(
  params: SendEmailVerificationParams,
) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping email verification email");
    return { success: false, error: "Email not configured" };
  }

  const brandName = getBrandTheme(params.brand).displayName;

  const { html, text } = await renderEmail(
    EmailVerificationEmail({
      name: params.name,
      verifyUrl: params.verifyUrl,
      expiresIn: params.expiresIn ?? "24 hours",
      brand: params.brand,
    }),
  );

  const subject = `Verify your email — ${brandName}`;

  return sendTransactionalEmail({
    userId: params.userId,
    emailType: "email_verification",
    to: params.recipientEmail,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
  });
}

// Marketing double opt-in confirmation. THE address is not on any list until
// this link is clicked — the click is the verified act that promotes the
// captured intent (see /api/consent/confirm/[token] and
// promotePendingEmailConsents). The message itself is TRANSACTIONAL: it is the
// one email we may send an unconfirmed address, and it asks for nothing but the
// confirmation.
export interface SendEmailConsentConfirmationParams {
  userId: string;
  recipientEmail: string;
  name: string;
  confirmUrl: string;
  /** The literal sentence they ticked — quoted back so the click is informed. */
  consentTextShown: string;
  expiresIn?: string;
  brand?: BrandId;
}

export async function sendEmailConsentConfirmationEmail(
  params: SendEmailConsentConfirmationParams,
) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping consent confirmation email");
    return { success: false, error: "Email not configured" };
  }

  const brandName = getBrandTheme(params.brand).displayName;

  const { html, text } = await renderEmail(
    EmailVerificationEmail({
      name: params.name,
      verifyUrl: params.confirmUrl,
      expiresIn: params.expiresIn ?? "14 days",
      brand: params.brand,
      consentTextShown: params.consentTextShown,
    }),
  );

  return sendTransactionalEmail({
    userId: params.userId,
    emailType: "email_consent_confirmation",
    to: params.recipientEmail,
    subject: `Confirm your email — ${brandName}`,
    html,
    text,
    from: fromForBrand(params.brand),
  });
}

// Welcome-series marketing email. Unlike sendTransactionalEmail this is
// opt-out marketing: it carries a List-Unsubscribe header and a body
// unsubscribe link. The caller (the cron) has already checked opt-out state.
// Subjects are brand-aware: SoccerOne is the consumer-facing brand, so a
// SoccerOne-themed welcome can't carry an "Aspire" subject line. emailType
// stays brand-neutral — it's the dedupe key in email_logs.
const WELCOME_STEP_META: Record<
  1 | 2 | 3,
  {
    subject: Record<BrandId, string>;
    emailType: string;
    Component: typeof WelcomeEmail1;
  }
> = {
  1: {
    subject: {
      aspire: "Welcome to Aspire Sports",
      soccerone: "Welcome to SoccerOne",
    },
    emailType: "welcome_series_1",
    Component: WelcomeEmail1,
  },
  2: {
    subject: {
      aspire: "What makes an Aspire league different",
      soccerone: "What makes a SoccerOne league different",
    },
    emailType: "welcome_series_2",
    Component: WelcomeEmail2,
  },
  3: {
    subject: {
      aspire: "Bring your people",
      soccerone: "Bring your people",
    },
    emailType: "welcome_series_3",
    Component: WelcomeEmail3,
  },
};

export async function sendWelcomeSeriesEmail(params: {
  userId: string;
  step: 1 | 2 | 3;
  recipientEmail: string;
  recipientName: string;
  /** Brand attribution for the recipient — controls template theme/copy,
   *  subject, sender, and link origin. Defaults to aspire. */
  brand?: BrandId;
}) {
  const meta = WELCOME_STEP_META[params.step];
  const brand = params.brand ?? "aspire";
  const subject = meta.subject[brand];

  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping welcome-series email");
    // Still record the attempt in email_logs so the drip cron stays
    // idempotent (it gates on email_logs) — otherwise it would re-attempt
    // this step on every run when email is unconfigured.
    await logEmail({
      userId: params.userId,
      emailType: meta.emailType,
      recipientEmail: params.recipientEmail,
      subject,
      status: "skipped",
    });
    return { success: false, error: "Email not configured" };
  }

  // Unsubscribe + dashboard links resolve to the brand's own origin.
  const appUrl = originForBrand(brand) ?? env.PUBLIC_APP_URL;
  const token = signUnsubscribeToken(params.userId, getUnsubscribeSecret());
  const unsubscribeUrl = `${appUrl}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;

  const { html, text } = await renderEmail(
    meta.Component({
      recipientName: params.recipientName,
      dashboardUrl: `${appUrl}/dashboard`,
      unsubscribeUrl,
      brand,
    }),
  );

  const result = await sendEmail({
    to: params.recipientEmail,
    subject,
    html,
    text,
    from: fromForBrand(brand),
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  await logEmail({
    userId: params.userId,
    emailType: meta.emailType,
    recipientEmail: params.recipientEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
}

// ---- Capture-band incentive code email ----

// One-shot incentive-code delivery for capture-band signups. The visitor
// explicitly requested the code, so this is a transactional one-off, not a
// drip series — no List-Unsubscribe (and none is possible: newsletter
// signups have no user id to sign an unsubscribe token with).
// Deduped per address via email_logs so re-submitting the band can't resend.
export async function sendCaptureIncentiveEmail(params: {
  recipientEmail: string;
  brand?: BrandId;
}) {
  const brand = params.brand ?? "aspire";
  const brandName = getBrandTheme(brand).displayName;
  const emailType = "capture_incentive";
  const amount = formatIncentiveAmount(CAPTURE_INCENTIVE.amountCents);
  const subject = `Your ${amount} code for ${brandName}`;

  // Existence check — a sent/skipped row means we already handled this
  // address, so no orderBy is needed on the limit(1). Failed sends are
  // excluded on purpose: the band told the visitor the code is on the way,
  // so a resubmit after a transient Resend error must retry, not dedupe.
  const [already] = await getDb()
    .select({ id: emailLogs.id })
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.emailType, emailType),
        eq(emailLogs.recipientEmail, params.recipientEmail),
        ne(emailLogs.status, "failed"),
      ),
    )
    .limit(1);
  if (already) {
    return { success: true, deduped: true };
  }

  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping capture-incentive email");
    // Record the attempt anyway so the dedupe gate holds (same pattern as
    // the welcome series).
    await logEmail({
      emailType,
      recipientEmail: params.recipientEmail,
      subject,
      status: "skipped",
    });
    return { success: false, error: "Email not configured" };
  }

  const appUrl = originForBrand(brand) ?? env.PUBLIC_APP_URL;
  const { html, text } = await renderEmail(
    CaptureIncentiveEmail({
      amount,
      code: CAPTURE_INCENTIVE.code,
      programsUrl: `${appUrl}/programs`,
      brand,
    }),
  );

  // Direct sendEmail rather than sendTransactionalEmail: there is no userId
  // for the log association and no SMS nudge — so we log manually with the
  // recipient email alone. The sender IS brand-resolved (#457): this
  // function takes a brand and themes the template with it, so a SoccerOne
  // recipient must not get the Aspire sender (the newer recapture sibling
  // always did this correctly).
  const result = await sendEmail({
    to: params.recipientEmail,
    subject,
    html,
    text,
    from: fromForBrand(brand),
  });

  await logEmail({
    emailType,
    recipientEmail: params.recipientEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
}

// ---- In-app browser recapture (escape banner "email yourself a link") ----

// One-shot recapture-link delivery for a visitor stuck in an in-app browser
// (Instagram/Facebook webview) who asked the escape banner to email them a
// link instead of switching apps manually. Transactional one-off, not a
// drip series — no List-Unsubscribe, and no userId (the visitor may not
// have an account yet). Deduped per address via email_logs, exact structural
// clone of sendCaptureIncentiveEmail.
export async function sendInappRecaptureEmail(params: {
  email: string;
  seasonId: string;
  seasonName: string;
  brand?: BrandId;
}) {
  const brand = params.brand ?? "aspire";
  const emailType = "inapp_recapture";
  const subject = `Finish signing up for ${params.seasonName}`;

  // Existence check — a sent/skipped row means we already handled this
  // address, so no orderBy is needed on the limit(1). Failed sends are
  // excluded on purpose: a resubmit after a transient Resend error must
  // retry, not dedupe.
  const [already] = await getDb()
    .select({ id: emailLogs.id })
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.emailType, emailType),
        eq(emailLogs.recipientEmail, params.email),
        ne(emailLogs.status, "failed"),
      ),
    )
    .limit(1);
  if (already) {
    return { success: true, deduped: true };
  }

  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping inapp-recapture email");
    // Record the attempt anyway so the dedupe gate holds (same pattern as
    // the welcome series).
    await logEmail({
      emailType,
      recipientEmail: params.email,
      subject,
      status: "skipped",
    });
    return { success: false, error: "Email not configured" };
  }

  const appUrl = originForBrand(brand) ?? env.PUBLIC_APP_URL;
  const registerUrl = `${appUrl}/register/${params.seasonId}?mode=individual&utm_source=inapp_recapture`;
  const { html, text } = await renderEmail(
    InappRecaptureEmail({
      seasonName: params.seasonName,
      registerUrl,
      brand,
    }),
  );

  // Direct sendEmail rather than sendTransactionalEmail: there is no userId
  // for the log association, so we log manually with the recipient email
  // alone (same pattern as sendCaptureIncentiveEmail).
  const result = await sendEmail({
    to: params.email,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
  });

  await logEmail({
    emailType,
    recipientEmail: params.email,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
}

// ---- Team invite (captain → prospective teammate) ----

export interface SendTeamInviteParams {
  to: string;
  teamName: string;
  captainName: string;
  joinUrl: string;
  /** Brand attribution — controls sender display name + subject. Defaults to aspire. */
  brand?: BrandId;
  /** Assigned per-player share in cents — surfaced in the email body when set. */
  shareCents?: number;
}

/**
 * Invite a prospective teammate to join a captain-created team. The captain
 * triggers this from the team-create flow; each recipient gets the one-door
 * join link tagged to the team. Plain inline HTML — no React template, since
 * this is a short captain-authored nudge rather than a branded transactional
 * receipt. Logged like any other send.
 */
export async function sendTeamInviteEmail(params: SendTeamInviteParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping team invite email");
    return { success: false, error: "Email not configured" };
  }

  const brandName = getBrandTheme(params.brand).displayName;
  const subject = `${params.captainName} invited you to join ${params.teamName}`;

  const shareLine =
    typeof params.shareCents === "number"
      ? `Your share is $${(params.shareCents / 100).toFixed(2)}, due when you register.`
      : "Click below to register and pay your share.";
  const shareTextLine =
    typeof params.shareCents === "number"
      ? `Your share is $${(params.shareCents / 100).toFixed(2)}, due when you register.`
      : "Register and pay your share here:";

  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;line-height:1.5;">
    <p>${escapeHtml(params.captainName)} put together a team — <strong>${escapeHtml(params.teamName)}</strong> — on ${escapeHtml(brandName)} and wants you on the roster.</p>
    <p>${escapeHtml(shareLine)} You'll join their roster automatically once you finish signup.</p>
    <p><a href="${params.joinUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Join ${escapeHtml(params.teamName)} →</a></p>
    <p style="color:#666;font-size:13px;">Or paste this link into your browser:<br>${escapeHtml(params.joinUrl)}</p>
  </body></html>`;

  const text = `${params.captainName} put together a team — ${params.teamName} — on ${brandName} and wants you on the roster.\n\n${shareTextLine}\n${params.joinUrl}\n`;

  const result = await sendEmail({
    to: params.to,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
  });

  await logEmail({
    emailType: "team_invite",
    recipientEmail: params.to,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
}

// ---- Team deposit receipt (captain, right after the $200 deposit succeeds) ----

export interface TeamDepositReceiptParams {
  to: string;
  captainName: string;
  teamName: string;
  seasonName: string;
  seasonId: string;
  inviteToken: string;
  /**
   * team_registrations.id — powers the "Manage your team" deep-link into the
   * Team Hub (/dashboard/teams/{id}). Optional so legacy callers/tests still
   * build; when absent, the receipt shows only the shareable join link.
   */
  teamRegistrationId?: string;
  /** Snapshot from team_registrations — null on legacy rows. */
  teamFeeCents: number | null;
  depositCents: number;
  paymentDeadline: Date | null;
  brand?: BrandId;
}

/**
 * Pure body builder — exported for unit tests. The receipt is the captain's
 * only durable copy of the join link and next steps: before this email
 * existed, closing the post-deposit tab lost both.
 */
export function buildTeamDepositReceipt(params: TeamDepositReceiptParams): {
  subject: string;
  html: string;
  text: string;
  joinUrl: string;
} {
  const appUrl = originForBrand(params.brand) ?? env.PUBLIC_APP_URL;
  const joinUrl = `${appUrl}/register/${params.seasonId}?team=${encodeURIComponent(params.inviteToken)}`;
  // Deep-link into the persistent Team Hub. A signed-out captain hits the
  // middleware auth gate and is bounced through /signin back to this URL.
  const manageUrl = params.teamRegistrationId
    ? `${appUrl}/dashboard/teams/${params.teamRegistrationId}`
    : null;
  const deposit = `$${(params.depositCents / 100).toLocaleString("en-US")}`;
  const total =
    params.teamFeeCents != null ? `$${(params.teamFeeCents / 100).toLocaleString("en-US")}` : null;
  const remainder =
    params.teamFeeCents != null
      ? `$${(Math.max(0, params.teamFeeCents - params.depositCents) / 100).toLocaleString("en-US")}`
      : null;
  // paymentDeadline is a full instant — pin to the org timezone
  // (America/New_York) so this agrees with the fee box on team-create.tsx,
  // which formats the same registrationCloses instant the same way.
  const deadline = params.paymentDeadline
    ? params.paymentDeadline.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "America/New_York",
      })
    : null;

  const subject = `${params.teamName} is reserved — here's your team link`;
  const feeLine = total
    ? `Your ${deposit} deposit is in and counts toward the ${total} team fee — your roster covers the remaining ${remainder} as they register.`
    : `Your ${deposit} deposit is in and counts toward the team fee — your roster covers the rest as they register.`;
  const deadlineLine = `Teammate shares still unpaid after ${deadline ?? "the payment deadline"} are charged to your card on file.`;

  const manageButton = manageUrl
    ? `<p><a href="${manageUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Manage your team →</a></p>
    <p style="color:#666;font-size:13px;">Invite teammates, track who's paid, and follow your schedule anytime here:<br>${escapeHtml(manageUrl)}</p>`
    : "";
  const manageText = manageUrl
    ? `Manage your team — invite teammates, track who's paid, and follow your schedule anytime:\n${manageUrl}\n\n`
    : "";

  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;line-height:1.5;">
    <p>${escapeHtml(params.captainName)}, <strong>${escapeHtml(params.teamName)}</strong> is reserved for ${escapeHtml(params.seasonName)}.</p>
    <p>${escapeHtml(feeLine)}</p>
    ${manageButton}
    <p><strong>Your team link</strong> — share it so teammates can register and pay their share:</p>
    <p style="color:#666;font-size:13px;">${escapeHtml(joinUrl)}</p>
    <p style="color:#666;font-size:13px;">${escapeHtml(deadlineLine)}</p>
  </body></html>`;

  const text = `${params.captainName}, ${params.teamName} is reserved for ${params.seasonName}.\n\n${feeLine}\n\n${manageText}Your team link — share it so teammates can register and pay their share:\n${joinUrl}\n\n${deadlineLine}\n`;

  return { subject, html, text, joinUrl };
}

export async function sendTeamDepositReceiptEmail(params: TeamDepositReceiptParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping team deposit receipt");
    return { success: false, error: "Email not configured" };
  }
  const { subject, html, text } = buildTeamDepositReceipt(params);
  const result = await sendEmail({
    to: params.to,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
  });
  await logEmail({
    emailType: "team_deposit_receipt",
    recipientEmail: params.to,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });
  return result;
}

// ---- Team deposit refunded (winter-team-fixes — maybeRefundTeamDeposit) ----

export interface TeamDepositRefundedParams {
  to: string;
  captainName: string;
  teamName: string;
  /** Which of the three outcomes the deposit-refund executor landed on —
   *  selects the copy variant. Matches maybeRefundTeamDeposit's internal
   *  FinalStatus verbatim so callers can pass it straight through. */
  outcome: "refunded" | "partially_refunded" | "forfeited";
  /**
   * Amount actually returned to the captain's card, in cents. Required for
   * 'refunded'/'partially_refunded'; omitted for 'forfeited' (nothing is
   * returned).
   */
  refundedCents?: number;
  /** The deposit's face amount, in cents — phrases the forfeited copy
   *  ("your $200 deposit..."). */
  depositCents: number;
  /**
   * The roster shortfall the deposit absorbed at the payment deadline.
   * Required for 'partially_refunded' and 'forfeited'; irrelevant (omit)
   * for a full_collection-triggered full refund.
   */
  shortfallCents?: number;
  brand?: BrandId;
}

/**
 * Pure body builder — exported for unit tests. Mirrors buildTeamDepositReceipt
 * in shape, but has THREE copy variants (not two) selected by `outcome`,
 * matching the deposit-refund executor's math
 * (src/lib/payments/team-deposit-refund.ts) — including the forfeited case,
 * which is NOT silent: the owner-model transparency promise means the
 * captain hears about it even when nothing is returned to their card.
 *
 * Money is formatted via the shared `formatCurrency` (`.toFixed(2)`) helper,
 * not `.toLocaleString`, because a partial refund (depositCents minus an
 * arbitrary shortfall) routinely carries odd cents that `.toLocaleString`
 * would render inconsistently (e.g. "150.4" instead of "150.40").
 */
export function buildTeamDepositRefunded(params: TeamDepositRefundedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const deposit = formatCurrency(params.depositCents);

  let subject: string;
  let bodyLine: string;

  if (params.outcome === "refunded") {
    const refund = formatCurrency(params.refundedCents ?? params.depositCents);
    subject = `Your ${refund} team deposit is on its way back`;
    bodyLine = `Your roster covered the team fee — your ${refund} deposit is being refunded to your card, arriving in 5-10 business days.`;
  } else if (params.outcome === "partially_refunded") {
    const refund = formatCurrency(params.refundedCents ?? 0);
    // Don't call the refunded remainder "your deposit" in the subject — it's
    // less than the full $200, so the full-refund subject's phrasing would
    // overstate it.
    subject = "Part of your team deposit is on its way back";
    // shortfallCents may be absent or (rarely) non-positive when the
    // refunded amount came from reconciling an adopted Stripe refund rather
    // than a freshly-computed shortfall — the caller passes undefined in
    // that case rather than a stale/incoherent figure (see
    // src/lib/payments/team-deposit-refund.ts). Fall back to copy that
    // doesn't name a specific dollar shortfall at all.
    bodyLine =
      typeof params.shortfallCents === "number" && params.shortfallCents > 0
        ? `After the payment deadline, ${formatCurrency(params.shortfallCents)} of the roster's shares were uncovered — your deposit covered that, and the remaining ${refund} is being refunded to your card.`
        : `After the payment deadline, part of the roster's shares went uncovered — your deposit covered that, and the remaining ${refund} is being refunded to your card.`;
  } else {
    // forfeited — the deposit was kept in full; no money moves, but the
    // captain still hears exactly what happened to it.
    const shortfallCents = params.shortfallCents ?? 0;
    subject = "About your team deposit";
    bodyLine =
      shortfallCents > params.depositCents
        ? `After the payment deadline, the roster's payments didn't fully cover the team fee — your ${deposit} deposit covered ${deposit} of the ${formatCurrency(shortfallCents)} shortfall and was not refunded.`
        : `After the payment deadline, the roster's payments didn't fully cover the team fee — your ${deposit} deposit was applied in full toward the shortfall and was not refunded.`;
  }

  const greeting = params.outcome === "forfeited" ? "an update" : "good news";

  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;line-height:1.5;">
    <p>${escapeHtml(params.captainName)}, ${greeting} about <strong>${escapeHtml(params.teamName)}</strong>.</p>
    <p>${escapeHtml(bodyLine)}</p>
  </body></html>`;

  const text = `${params.captainName}, ${greeting} about ${params.teamName}.\n\n${bodyLine}\n`;

  return { subject, html, text };
}

export async function sendTeamDepositRefundedEmail(params: TeamDepositRefundedParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping team deposit refunded email");
    return { success: false, error: "Email not configured" };
  }
  const { subject, html, text } = buildTeamDepositRefunded(params);
  const result = await sendEmail({
    to: params.to,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
  });
  await logEmail({
    emailType: "team_deposit_refunded",
    recipientEmail: params.to,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });
  return result;
}

// ---- Team share reminder (~3 days before the payment deadline) ----

export interface SendTeamShareReminderParams {
  to: string;
  teamName: string;
  /** Captain display name — surfaced so the recipient knows whose team this is. */
  captainName?: string;
  joinUrl: string;
  /** Assigned per-player share in cents — surfaced when set. */
  shareCents?: number;
  /** Payment deadline — surfaced in the body when set. */
  deadline?: Date | string;
  /** Brand attribution — controls sender display name + subject. Defaults to aspire. */
  brand?: BrandId;
}

/**
 * Remind a teammate (or the captain) to pay their share before the deadline,
 * after which the captain's saved card is charged the unpaid balance (the
 * backstop). Fired by the charge-unpaid-team-shares cron ~3 days out. Plain
 * inline HTML, mirroring sendTeamInviteEmail. Logged like any other send.
 */
export async function sendTeamShareReminderEmail(params: SendTeamShareReminderParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping team share reminder email");
    return { success: false, error: "Email not configured" };
  }

  const brandName = getBrandTheme(params.brand).displayName;
  const subject = `Reminder: pay your share for ${params.teamName}`;

  const deadlineStr =
    params.deadline != null ? formatEmailDate(params.deadline) : null;
  const shareLine =
    typeof params.shareCents === "number"
      ? `Your share is $${(params.shareCents / 100).toFixed(2)}.`
      : "You still owe your share.";
  const deadlineLine = deadlineStr
    ? `Please pay by ${deadlineStr}, or ${params.captainName ? `${params.captainName}, your captain,` : "your team captain"} will be charged the unpaid balance.`
    : `Please pay soon, or ${params.captainName ? `${params.captainName}, your captain,` : "your team captain"} will be charged the unpaid balance.`;

  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;line-height:1.5;">
    <p>This is a reminder about your spot on <strong>${escapeHtml(params.teamName)}</strong> on ${escapeHtml(brandName)}.</p>
    <p>${escapeHtml(shareLine)} ${escapeHtml(deadlineLine)}</p>
    <p><a href="${params.joinUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Pay my share →</a></p>
    <p style="color:#666;font-size:13px;">Or paste this link into your browser:<br>${escapeHtml(params.joinUrl)}</p>
  </body></html>`;

  const text = `Reminder about your spot on ${params.teamName} on ${brandName}.\n\n${shareLine} ${deadlineLine}\n\nPay your share here:\n${params.joinUrl}\n`;

  const result = await sendEmail({
    to: params.to,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
  });

  await logEmail({
    emailType: "team_share_reminder",
    recipientEmail: params.to,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
}

// ---- Team backstop warning (captain, ~3 days before the deadline) ----

export interface TeamBackstopWarningParams {
  to: string;
  captainName: string;
  teamName: string;
  joinUrl: string;
  /** Sum of assignedShareCents across still-unpaid invitees. */
  unpaidTotalCents: number;
  unpaidCount: number;
  deadline: Date | null;
  brand?: BrandId;
}

/**
 * Pure body builder — exported for unit tests. This is what the captain
 * should get instead of the teammate "pay your share" template: it names
 * the total that will land on their card if teammates don't pay, not a
 * confusing self-referential "your captain will be charged" line.
 */
export function buildTeamBackstopWarning(params: TeamBackstopWarningParams): {
  subject: string;
  html: string;
  text: string;
} {
  // Keep both cent digits on fractional totals ("$450.50", never "$450.5") —
  // even splits of odd remainders produce non-whole-dollar sums.
  const totalDollars = params.unpaidTotalCents / 100;
  const total = `$${totalDollars.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(totalDollars) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
  // deadline is a full instant — pin to the org timezone (America/New_York)
  // so this agrees with the deadline rendering elsewhere (e.g.
  // buildTeamDepositReceipt, team-create.tsx).
  const deadline = params.deadline
    ? params.deadline.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "America/New_York",
      })
    : null;

  const subject = `Heads up: ${total} in unpaid shares for ${params.teamName}`;
  const teammateWord = params.unpaidCount === 1 ? "teammate" : "teammates";
  const bodyLine = `${params.unpaidCount} ${teammateWord} haven't paid. Shares still unpaid are charged to your card on ${deadline ?? "the payment deadline"}. Nudge them or adjust splits from your team page.`;

  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;line-height:1.5;">
    <p>${escapeHtml(params.captainName)}, <strong>${escapeHtml(total)}</strong> in unpaid shares for <strong>${escapeHtml(params.teamName)}</strong> is coming due.</p>
    <p>${escapeHtml(bodyLine)}</p>
    <p><a href="${params.joinUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Open your team page →</a></p>
    <p style="color:#666;font-size:13px;">Or paste this link into your browser:<br>${escapeHtml(params.joinUrl)}</p>
  </body></html>`;

  const text = `${params.captainName}, ${total} in unpaid shares for ${params.teamName} is coming due.\n\n${bodyLine}\n\nOpen your team page:\n${params.joinUrl}\n`;

  return { subject, html, text };
}

export async function sendTeamBackstopWarningEmail(params: TeamBackstopWarningParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping team backstop warning email");
    return { success: false, error: "Email not configured" };
  }
  const { subject, html, text } = buildTeamBackstopWarning(params);
  const result = await sendEmail({
    to: params.to,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
  });
  await logEmail({
    emailType: "team_backstop_warning",
    recipientEmail: params.to,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });
  return result;
}

// ---- Trial-convert follow-up (youth classes cron) ----

export interface TrialConvertTier {
  name: string;
  /** Pre-formatted, e.g. "$79/mo" — see formatMonthlyPriceCents in
   *  src/lib/classes/trial-convert.ts. */
  priceLabel: string;
}

export interface SendTrialConvertParams {
  /** Dedupe key — see the module-level note on trial-convert.ts for why
   *  this, not recipientEmail, is the "one per X ever" identity. */
  familyMemberId: string;
  parentUserId: string;
  parentEmail: string;
  parentFirstName: string | null;
  childFirstName: string;
  className: string;
  tiers: TrialConvertTier[];
}

/**
 * Trial-convert nudge — fired by /api/cron/trial-convert-emails for a child
 * whose one-time trial class ended 1-3 days ago and who still has no live
 * membership. One per child EVER.
 *
 * Dedupe: same shape as sendCaptureIncentiveEmail/sendInappRecaptureEmail
 * (check email_logs immediately before sending, log unconditionally after),
 * but keyed on `metadata->>'familyMemberId'` instead of recipientEmail —
 * see trial-convert.ts's module header for why. The SQL scan in
 * trial-convert.ts already anti-joins on this same key, so this check is a
 * race guard, not the primary dedupe gate. Failed sends are excluded from
 * the "already sent" check so a transient Resend error retries on the next
 * cron run instead of dead-ending the child forever.
 */
export async function sendTrialConvertEmail(
  params: SendTrialConvertParams,
): Promise<{ success: boolean; deduped?: boolean; error?: string }> {
  const emailType = "trial_convert";
  const subject = `How was ${params.childFirstName}'s trial class?`;

  const [already] = await getDb()
    .select({ id: emailLogs.id })
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.emailType, emailType),
        ne(emailLogs.status, "failed"),
        sql`${emailLogs.metadata} ->> 'familyMemberId' = ${params.familyMemberId}`,
      ),
    )
    .limit(1);
  if (already) {
    return { success: true, deduped: true };
  }

  const metadata = { familyMemberId: params.familyMemberId };

  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping trial-convert email");
    // Record the attempt anyway so the dedupe gate holds (same pattern as
    // sendWelcomeSeriesEmail/sendCaptureIncentiveEmail).
    await logEmail({
      userId: params.parentUserId,
      emailType,
      recipientEmail: params.parentEmail,
      subject,
      status: "skipped",
      metadata,
    });
    return { success: false, error: "Email not configured" };
  }

  // Classes are an Aspire-only product (no SoccerOne equivalent), so
  // originForBrand("aspire") always returns null here — but computing it
  // this way (instead of hardcoding the prod host) matches every sibling
  // send*Email function's appUrl convention: it falls through to
  // env.PUBLIC_APP_URL, which is the LOCAL/staging origin outside prod. A
  // hardcoded prod URL would have emailed parents a production link from a
  // staging or preview cron run.
  const appUrl = originForBrand("aspire") ?? env.PUBLIC_APP_URL;

  const { html, text } = await renderEmail(
    TrialConvertEmail({
      parentFirstName: params.parentFirstName ?? "there",
      childFirstName: params.childFirstName,
      className: params.className,
      tiers: params.tiers,
      ctaUrl: `${appUrl}/youth/classes#pricing`,
    }),
  );

  const result = await sendEmail({
    to: params.parentEmail,
    subject,
    html,
    text,
    from: fromForBrand("aspire"),
  });

  await logEmail({
    userId: params.parentUserId,
    emailType,
    recipientEmail: params.parentEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
    metadata,
  });

  return result;
}

// ---- Block-abandon nudge (youth classes cron) ----

export interface SendClassBlockNudgeParams {
  parentUserId: string;
  parentEmail: string;
  parentFirstName: string | null;
  childFirstName: string;
  /** Identifies the CHILD, not the grant — matches the `child=` query param
   *  choose-slot.astro reads (see src/lib/classes/block-nudge.ts). */
  familyMemberId: string;
  /** The enrollment's slot template — the `slot=` query param that puts
   *  choose-slot.astro's island into BLOCK MODE. */
  slotTemplateId: string;
  className: string;
}

/**
 * Block-abandon nudge — fired by /api/cron/block-nudge-emails for a
 * credit-backed (block/pack) class enrollment that the materialization
 * cron has never been able to auto-book because no guardian waiver is on
 * file yet (the `skippedNoWaiver` cohort — see materialize.ts). One per
 * grant EVER.
 *
 * Unlike sendTrialConvertEmail, this function does NOT itself gate on a
 * dedupe check: the caller (runBlockNudgeEmails) already claims the
 * one-shot stamp — an atomic `UPDATE ... WHERE nudge_sent_at IS NULL
 * RETURNING` on class_credit_grants — BEFORE calling this function, so by
 * the time this runs the send is already the winning claim. This function's
 * only job is to render, send, and log — same as
 * dispatchPaymentReminder/dispatchBookingConfirmation's shape for other
 * stamp-then-send crons.
 */
export async function sendClassBlockNudgeEmail(
  params: SendClassBlockNudgeParams,
): Promise<{ success: boolean; error?: string }> {
  const emailType = "class_block_nudge";
  const subject = `Finish setting up ${params.childFirstName}'s class`;
  const metadata = {
    familyMemberId: params.familyMemberId,
    slotTemplateId: params.slotTemplateId,
  };

  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping class block-nudge email");
    // Record the attempt anyway — the grant's nudgeSentAt stamp is already
    // claimed by the caller regardless, so this is purely for observability
    // (same pattern as sendTrialConvertEmail/sendWelcomeSeriesEmail).
    await logEmail({
      userId: params.parentUserId,
      emailType,
      recipientEmail: params.parentEmail,
      subject,
      status: "skipped",
      metadata,
    });
    return { success: false, error: "Email not configured" };
  }

  // Classes are an Aspire-only product (no SoccerOne equivalent), so
  // originForBrand("aspire") always returns null here — but computing it
  // this way (instead of hardcoding the prod host) matches every sibling
  // send*Email function's appUrl convention: it falls through to
  // env.PUBLIC_APP_URL, which is the LOCAL/staging origin outside prod. A
  // hardcoded prod URL would have emailed parents a production link from a
  // staging or preview cron run (the bee1b4f9 lesson).
  const appUrl = originForBrand("aspire") ?? env.PUBLIC_APP_URL;

  const { html, text } = await renderEmail(
    ClassBlockNudgeEmail({
      parentFirstName: params.parentFirstName ?? "there",
      childFirstName: params.childFirstName,
      className: params.className,
      ctaUrl: `${appUrl}/dashboard/family/choose-slot?child=${params.familyMemberId}&block=success&slot=${params.slotTemplateId}`,
    }),
  );

  const result = await sendEmail({
    to: params.parentEmail,
    subject,
    html,
    text,
    from: fromForBrand("aspire"),
  });

  await logEmail({
    userId: params.parentUserId,
    emailType,
    recipientEmail: params.parentEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
    metadata,
  });

  return result;
}

/** Minimal HTML-escape for interpolating user-supplied strings into email bodies. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---- Dispute alert (founder-only operational email) ----

export interface SendDisputeAlertParams {
  /** Stripe dispute id, used in the email body + link to the dashboard. */
  stripeDisputeId: string;
  /** For email_logs association — the registration the charge belongs to. */
  registrationId: string;
  /** "First Last" of the player on the registration. */
  playerName: string;
  /** Program + season the registration is in (for context in the alert). */
  programName: string;
  seasonName: string;
  /** Customer-of-record email — surfaced so the founder can reach out. */
  parentEmail: string;
  /** Dispute amount in cents (formatted to USD in the email). */
  amountCents: number;
  /** Stripe reason code verbatim (e.g. "fraudulent", "duplicate"). */
  reasonCode: string;
  /** Stripe evidence deadline. Null when Stripe didn't supply one. */
  evidenceDueBy: Date | null;
}

/**
 * Founder-only operational alert when a Stripe dispute is filed against
 * a registration charge. Goes to `FOUNDER_ALERT_EMAIL` (required for
 * delivery — handler is fail-soft if the env var is missing).
 *
 * Deliberately not a customer-facing email: the response surface is the
 * Stripe dashboard, and we don't want to confuse the cardholder about
 * who is processing the dispute.
 */
export async function sendDisputeAlertEmail(
  params: SendDisputeAlertParams,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping dispute alert email");
    return { success: false, error: "Email not configured" };
  }

  const founderEmail = env.FOUNDER_ALERT_EMAIL;
  if (!founderEmail) {
    console.error(
      "[email] FOUNDER_ALERT_EMAIL is not set — dispute alert for " +
        `${params.stripeDisputeId} was not sent`,
    );
    return { success: false, error: "FOUNDER_ALERT_EMAIL not set" };
  }

  const stripeUrl = `https://dashboard.stripe.com/disputes/${params.stripeDisputeId}`;

  const { html, text } = await renderEmail(
    DisputeAlertEmail({
      stripeDisputeId: params.stripeDisputeId,
      playerName: params.playerName,
      programName: params.programName,
      seasonName: params.seasonName,
      parentEmail: params.parentEmail,
      amount: formatCurrency(params.amountCents),
      reasonCode: params.reasonCode,
      evidenceDueBy: params.evidenceDueBy
        ? formatEmailDateTime(params.evidenceDueBy)
        : null,
      stripeUrl,
    }),
  );

  const subject = `[ACTION REQUIRED] Stripe dispute on ${params.playerName} — respond before deadline`;

  const result = await sendEmail({
    to: founderEmail,
    subject,
    html,
    text,
  });

  await logEmail({
    registrationId: params.registrationId,
    emailType: "dispute_alert",
    recipientEmail: founderEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
}

export interface SendNpsSurveyEmailParams {
  to: string;
  userId: string;
  organizationId: string;
  brand: BrandId;
  recipientName: string;
  eventLabel: string;
  surveyUrl: string;
  /** When true, also fire the SMS nudge (org has SMS + recipient opted in). */
  smsOptIn?: boolean;
}

export async function sendNpsSurveyEmail(params: SendNpsSurveyEmailParams) {
  const { html, text } = await renderEmail(
    FeedbackNpsEmail({
      recipientName: params.recipientName,
      eventLabel: params.eventLabel,
      surveyUrl: params.surveyUrl,
      brand: params.brand,
    }),
  );

  return sendTransactionalEmail({
    userId: params.userId,
    emailType: "feedback_nps_survey",
    to: params.to,
    subject: `How was ${params.eventLabel}?`,
    html,
    text,
    from: fromForBrand(params.brand),
    smsNudge: params.smsOptIn
      ? {
          organizationId: params.organizationId,
          body: `How was ${clip(params.eventLabel, 60)}? 20-second survey: ${params.surveyUrl}`,
        }
      : undefined,
  });
}

export interface SendDetractorAlertEmailParams {
  to: string;
  brand: BrandId;
  score: number;
  comment: string | null;
  eventLabel: string;
  kind: string;
}

export async function sendDetractorAlertEmail(params: SendDetractorAlertEmailParams) {
  const { html, text } = await renderEmail(
    FeedbackDetractorAlertEmail({
      score: params.score,
      comment: params.comment,
      eventLabel: params.eventLabel,
      kind: params.kind,
      brand: params.brand,
    }),
  );

  return sendTransactionalEmail({
    emailType: "feedback_detractor_alert",
    to: params.to,
    subject: `Low NPS score (${params.score}/10) — ${params.eventLabel}`,
    html,
    text,
    from: fromForBrand(params.brand),
  });
}

export interface SendOpsPingFallbackEmailParams {
  to: string;
  brand: BrandId;
  message: string;
}

/**
 * Email fallback for operational pings when the WhatsApp channel is
 * unavailable. Plain one-liner — the message IS the content.
 */
export async function sendOpsPingFallbackEmail(params: SendOpsPingFallbackEmailParams) {
  return sendTransactionalEmail({
    emailType: "ops_ping_fallback",
    to: params.to,
    subject: `[Ops] ${params.message}`,
    html: `<p style="font-family: sans-serif; font-size: 14px;">${escapeHtml(params.message)}</p>`,
    text: params.message,
    from: fromForBrand(params.brand),
  });
}

export interface SendRefereeRatingEmailParams {
  to: string;
  userId: string;
  organizationId: string;
  brand: BrandId;
  recipientName: string;
  eventLabel: string;
  refereeName: string;
  surveyUrl: string;
  smsOptIn?: boolean;
}

export async function sendRefereeRatingEmail(params: SendRefereeRatingEmailParams) {
  const { html, text } = await renderEmail(
    FeedbackRefereeRatingEmail({
      recipientName: params.recipientName,
      eventLabel: params.eventLabel,
      refereeName: params.refereeName,
      surveyUrl: params.surveyUrl,
      brand: params.brand,
    }),
  );

  return sendTransactionalEmail({
    userId: params.userId,
    emailType: "feedback_referee_rating",
    to: params.to,
    subject: `Rate the referee — ${params.eventLabel}`,
    html,
    text,
    from: fromForBrand(params.brand),
    smsNudge: params.smsOptIn
      ? {
          organizationId: params.organizationId,
          body: `How did the ref do at ${clip(params.eventLabel, 50)}? 20-second rating: ${params.surveyUrl}`,
        }
      : undefined,
  });
}

export interface SendFirstGameRecapEmailParams {
  to: string;
  userId: string;
  organizationId: string;
  /**
   * The recipient's registration for the season — associates the email_logs
   * row so the dispatch scan's per-season idempotency anti-join (email_logs
   * joined to registrations.seasonId) can see this send.
   */
  registrationId: string;
  brand: BrandId;
  recipientName: string;
  programName: string;
  /** Venue the game was played at; a venue-specific review listing wins over the brand fallback. */
  venueId?: string | null;
}

/**
 * "How was your first game?" review ask, sent after a team's first completed
 * game of a season. Resolves the Google review deep-link from org settings
 * (venue-specific listing wins over the per-brand fallback — same precedence
 * as the NPS promoter funnel). The review CTA is the entire point of this
 * email, so when no URL resolves we skip the send altogether — without
 * logging, so the ask goes out on a later run once the org configures a URL.
 */
export async function sendFirstGameRecapEmail(
  params: SendFirstGameRecapEmailParams,
): Promise<{ success: boolean; messageId?: string; error?: string; skipped?: boolean }> {
  const [org] = await getDb()
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, params.organizationId))
    .limit(1);
  const reviewUrl = resolveGoogleReviewUrl(
    (org?.settings ?? {}) as OrganizationSettings,
    params.brand,
    params.venueId,
  );
  if (!reviewUrl) {
    return { success: false, skipped: true, error: "No Google review URL configured" };
  }

  const subject = "How was your first game?";

  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping first-game recap email");
    // Record the attempt as skipped so the dispatch scan's email_logs
    // anti-join holds (same convention as the capture-incentive dedupe —
    // an intentionally inert channel must not retry hourly forever).
    await logEmail({
      userId: params.userId,
      registrationId: params.registrationId,
      emailType: "first_game_recap",
      recipientEmail: params.to,
      subject,
      status: "skipped",
    });
    return { success: false, skipped: true, error: "Email not configured" };
  }

  const { html, text } = await renderEmail(
    FirstGameRecapEmail({
      recipientName: params.recipientName,
      programName: params.programName,
      reviewUrl,
      appUrl: originForBrand(params.brand) ?? env.PUBLIC_APP_URL,
      brand: params.brand,
    }),
  );

  return sendTransactionalEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: "first_game_recap",
    to: params.to,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
  });
}

// ---- Development reports (Phase 3 S6 — monthly subset / quarterly full) ----

export type { DevReportMonthlyDomain, DevReportQuarterlyDomain, DevReportQuarterlyAchievement };

export interface SendDevReportMonthlyParams {
  /** Dedupe identity, PART 1 — see the module note on the pre-send check
   *  below for why familyMemberId ALONE isn't sufficient. */
  familyMemberId: string;
  /** Dedupe identity, PART 2 — the guardian being emailed. */
  parentUserId: string;
  parentEmail: string;
  parentFirstName: string | null;
  childFirstName: string;
  /** `YYYY-MM` of the closed month — the emailType suffix. */
  periodKey: string;
  /** Human label, e.g. "August 2026". */
  periodLabel: string;
  domains: DevReportMonthlyDomain[];
  glowCount: number;
  ctaUrl: string;
}

/**
 * Monthly subset development report — fired by
 * /api/cron/send-development-reports for every month that ISN'T the close
 * of a quarter (src/lib/reports/development-reports.ts's
 * computeReportPeriod). One per (child, guardian, month) — a child can have
 * more than one guardian, and each gets their own email.
 *
 * Dedupe: unlike sendTrialConvertEmail's "one per child ever" (keyed on
 * familyMemberId alone, safe because a trial booking has exactly one parent
 * account), a development report can go to MULTIPLE guardians per child —
 * so the dedupe key must be the (familyMemberId, parentUserId) PAIR, or
 * guardian B's send would read guardian A's already-logged row and skip
 * itself. Both fields live in `metadata` (recipientEmail alone can't serve
 * as the key either — see trial-convert.ts's module header on why a shared
 * parent address breaks a sibling-keyed dedupe; the same asymmetry applies
 * here in the other direction). This check is the PRIMARY dedupe gate, not
 * a race guard — see development-reports.ts's module docstring for why the
 * scan has no SQL-level anti-join to back it up. Failed sends
 * (`status = 'failed'`) are excluded from the "already sent" check so a
 * transient Resend error retries on the next cron run.
 */
export async function sendDevReportMonthly(
  params: SendDevReportMonthlyParams,
): Promise<{ success: boolean; deduped?: boolean; error?: string }> {
  const emailType = `dev_report_${params.periodKey}`;
  const subject = `${params.childFirstName}'s ${params.periodLabel} development update`;
  const metadata = { familyMemberId: params.familyMemberId, parentUserId: params.parentUserId };

  const [already] = await getDb()
    .select({ id: emailLogs.id })
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.emailType, emailType),
        ne(emailLogs.status, "failed"),
        sql`${emailLogs.metadata} ->> 'familyMemberId' = ${params.familyMemberId}`,
        sql`${emailLogs.metadata} ->> 'parentUserId' = ${params.parentUserId}`,
      ),
    )
    .limit(1);
  if (already) {
    return { success: true, deduped: true };
  }

  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping monthly development report email");
    // Record the attempt anyway so the dedupe gate holds — an intentionally
    // inert channel must not retry forever (same convention as
    // sendFirstGameRecapEmail's "Email not configured" branch).
    await logEmail({
      userId: params.parentUserId,
      emailType,
      recipientEmail: params.parentEmail,
      subject,
      status: "skipped",
      metadata,
    });
    return { success: false, error: "Email not configured" };
  }

  // Classes/curriculum are an Aspire-only surface (no SoccerOne equivalent
  // — see trial-convert.ts's identical note), so brand is hardcoded rather
  // than threaded through from an org lookup.
  const appUrl = originForBrand("aspire") ?? env.PUBLIC_APP_URL;

  const { html, text } = await renderEmail(
    DevReportMonthlyEmail({
      parentFirstName: params.parentFirstName ?? "there",
      childFirstName: params.childFirstName,
      periodLabel: params.periodLabel,
      domains: params.domains,
      glowCount: params.glowCount,
      ctaUrl: params.ctaUrl,
      appUrl,
    }),
  );

  const result = await sendEmail({
    to: params.parentEmail,
    subject,
    html,
    text,
    from: fromForBrand("aspire"),
  });

  await logEmail({
    userId: params.parentUserId,
    emailType,
    recipientEmail: params.parentEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
    metadata,
  });

  return result;
}

export interface SendDevReportQuarterlyParams {
  familyMemberId: string;
  parentUserId: string;
  parentEmail: string;
  parentFirstName: string | null;
  childFirstName: string;
  /** `YYYY-Qn` of the closed quarter — the emailType suffix. */
  quarterKey: string;
  /** Human label, e.g. "Q3 2026". */
  quarterLabel: string;
  domains: DevReportQuarterlyDomain[];
  assessmentCount: number;
  skillCount: number;
  achievements: DevReportQuarterlyAchievement[];
  ctaUrl: string;
}

/**
 * Quarterly FULL development report — fired INSTEAD of the monthly subset
 * on the four months that close a quarter (decision 4). Same dedupe shape
 * as sendDevReportMonthly (see its docstring): keyed on the
 * (familyMemberId, parentUserId) pair, one per (child, guardian, quarter).
 */
export async function sendDevReportQuarterly(
  params: SendDevReportQuarterlyParams,
): Promise<{ success: boolean; deduped?: boolean; error?: string }> {
  const emailType = `dev_report_${params.quarterKey}`;
  const subject = `${params.childFirstName}'s ${params.quarterLabel} development report`;
  const metadata = { familyMemberId: params.familyMemberId, parentUserId: params.parentUserId };

  const [already] = await getDb()
    .select({ id: emailLogs.id })
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.emailType, emailType),
        ne(emailLogs.status, "failed"),
        sql`${emailLogs.metadata} ->> 'familyMemberId' = ${params.familyMemberId}`,
        sql`${emailLogs.metadata} ->> 'parentUserId' = ${params.parentUserId}`,
      ),
    )
    .limit(1);
  if (already) {
    return { success: true, deduped: true };
  }

  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping quarterly development report email");
    await logEmail({
      userId: params.parentUserId,
      emailType,
      recipientEmail: params.parentEmail,
      subject,
      status: "skipped",
      metadata,
    });
    return { success: false, error: "Email not configured" };
  }

  const appUrl = originForBrand("aspire") ?? env.PUBLIC_APP_URL;

  const { html, text } = await renderEmail(
    DevReportQuarterlyEmail({
      parentFirstName: params.parentFirstName ?? "there",
      childFirstName: params.childFirstName,
      quarterLabel: params.quarterLabel,
      domains: params.domains,
      assessmentCount: params.assessmentCount,
      skillCount: params.skillCount,
      achievements: params.achievements,
      ctaUrl: params.ctaUrl,
      appUrl,
    }),
  );

  const result = await sendEmail({
    to: params.parentEmail,
    subject,
    html,
    text,
    from: fromForBrand("aspire"),
  });

  await logEmail({
    userId: params.parentUserId,
    emailType,
    recipientEmail: params.parentEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
    metadata,
  });

  return result;
}

/**
 * Sentinel `email_logs.recipient_email` for the no-guardian audit
 * breadcrumb below. The column is `NOT NULL varchar(255)` and nothing ever
 * sends TO this address — `logDevReportSkippedNoGuardian` calls `logEmail`
 * directly, bypassing `sendEmail` entirely, so no message is ever dispatched
 * anywhere near it.
 */
const NO_GUARDIAN_SENTINEL_EMAIL = "no-guardian@internal.aspiresports.com";

/**
 * Audit-log breadcrumb for a development-report candidate that resolved to
 * ZERO guardians (a data anomaly — every `family_members` dependent row
 * should carry a `parentUserId`, and a self-registered adult row has no
 * separate guardian to notify at all). No email is possible, so there's no
 * `sendEmail` call here — but every OTHER terminal state in this cron logs
 * to `email_logs` (sent, failed, skipped-for-inert-channel, deduped), and
 * this one shouldn't be the silent exception: without a breadcrumb, an ops
 * investigation into "why didn't this family get a report" finds nothing at
 * all instead of a clear reason. Uses the same anti-dedupe metadata shape
 * (`familyMemberId`) as the guardian-keyed sends, plus `reason` for
 * disambiguation, so a repeat scan of the same period doesn't need special
 * handling to avoid re-logging (though see runDevelopmentReports — the scan
 * has no anti-join either way, per its own docstring, so re-runs will log
 * this breadcrumb again; harmless, since it's diagnostic rather than a
 * dedupe gate).
 */
export async function logDevReportSkippedNoGuardian(params: {
  familyMemberId: string;
  emailType: string;
}): Promise<void> {
  await logEmail({
    emailType: params.emailType,
    recipientEmail: NO_GUARDIAN_SENTINEL_EMAIL,
    subject: "Development report skipped — no guardian on file",
    status: "skipped",
    metadata: { familyMemberId: params.familyMemberId, reason: "no_guardian" },
  });
}

export interface SendSeasonInterestOpsAlertParams {
  email: string;
  firstName: string | null;
  seasonName: string;
  programName: string;
  /** Interest rows on this season including the new one — "3rd hand raised". */
  seasonInterestTotal: number;
}

/**
 * Ops ping when someone joins a forming season's interest list (#543 — these
 * submissions were previously write-only: stored, surfaced nowhere, and the
 * founder had no idea they existed). Goes to FOUNDER_ALERT_EMAIL like the
 * dispute alert. Inline markup rather than a React Email template: this is an
 * internal one-liner, not customer-facing mail, and it must never grow enough
 * copy to warrant one. No logEmail call — the log table keys on
 * registrationId and an interest record has none.
 */
export async function sendSeasonInterestOpsAlert(
  params: SendSeasonInterestOpsAlertParams,
) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping season-interest ops alert");
    return { success: false, error: "Email not configured" };
  }

  const founderEmail = env.FOUNDER_ALERT_EMAIL;
  if (!founderEmail) {
    console.error(
      "[email] FOUNDER_ALERT_EMAIL is not set — season-interest alert for " +
        `${params.seasonName} was not sent`,
    );
    return { success: false, error: "FOUNDER_ALERT_EMAIL not set" };
  }

  const who = params.firstName ? `${params.firstName} <${params.email}>` : params.email;
  const subject = `[Ops] Interest: ${params.seasonName} — ${params.seasonInterestTotal} waiting`;
  const listUrl = `${env.PUBLIC_APP_URL}/admin/season-interest`;
  // firstName/email are visitor-supplied — escape them (and everything else,
  // uniformly) so the founder's mail client never renders submitted markup.
  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    );
  const text =
    `${who} joined the interest list for ${params.seasonName} (${params.programName}).\n` +
    `That season now has ${params.seasonInterestTotal} interested.\n\n` +
    `Full list + CSV export: ${listUrl}\n`;
  const html =
    `<p><strong>${esc(who)}</strong> joined the interest list for ` +
    `<strong>${esc(params.seasonName)}</strong> (${esc(params.programName)}).</p>` +
    `<p>That season now has <strong>${params.seasonInterestTotal}</strong> interested.</p>` +
    `<p><a href="${listUrl}">Full list + CSV export</a></p>`;

  return sendEmail({ to: founderEmail, subject, html, text });
}
