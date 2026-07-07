import { and, eq, ne } from "drizzle-orm";
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
import { SignInLinkEmail } from "./templates/sign-in-link";
import { CoachInviteEmail } from "./templates/coach-invite";
import { EmailVerificationEmail } from "./templates/email-verification";
import { WelcomeEmail1 } from "./templates/welcome-1-welcome";
import { WelcomeEmail2 } from "./templates/welcome-2-story";
import { WelcomeEmail3 } from "./templates/welcome-3-activation";
import { DisputeAlertEmail } from "./templates/dispute-alert";
import { CaptureIncentiveEmail } from "./templates/capture-incentive";
import { FeedbackNpsEmail } from "./templates/feedback-nps";
import { FeedbackDetractorAlertEmail } from "./templates/feedback-detractor-alert";
import { FeedbackRefereeRatingEmail } from "./templates/feedback-referee-rating";
import {
  CAPTURE_INCENTIVE,
  formatIncentiveAmount,
} from "@/lib/marketing/capture-incentive";
import {
  signUnsubscribeToken,
  getUnsubscribeSecret,
} from "@/lib/marketing/unsubscribe-token";
import { getDb } from "@/lib/db";
import { emailLogs } from "@/lib/db/schema";
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
    }),
  );

  const subject = "You're registered — finish setting up your account";

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
  // for the log association, no from override (Aspire-only surface), and no
  // SMS nudge — so we log manually with the recipient email alone.
  const result = await sendEmail({
    to: params.recipientEmail,
    subject,
    html,
    text,
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
