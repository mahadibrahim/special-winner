import { and, eq } from "drizzle-orm";
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
import { EmailVerificationEmail } from "./templates/email-verification";
import { WelcomeEmail1 } from "./templates/welcome-1-welcome";
import { WelcomeEmail2 } from "./templates/welcome-2-story";
import { WelcomeEmail3 } from "./templates/welcome-3-activation";
import { DisputeAlertEmail } from "./templates/dispute-alert";
import { CaptureIncentiveEmail } from "./templates/capture-incentive";
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
  refundStatus: "approved" | "denied";
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
      : `Refund request update — ${params.childName}`;

  return sendTransactionalEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: params.refundStatus === "approved" ? "refund_approved" : "refund_denied",
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
const WELCOME_STEP_META: Record<
  1 | 2 | 3,
  { subject: string; emailType: string; Component: typeof WelcomeEmail1 }
> = {
  1: {
    subject: "Welcome to Aspire Sports",
    emailType: "welcome_series_1",
    Component: WelcomeEmail1,
  },
  2: {
    subject: "What makes an Aspire league different",
    emailType: "welcome_series_2",
    Component: WelcomeEmail2,
  },
  3: {
    subject: "Bring your people",
    emailType: "welcome_series_3",
    Component: WelcomeEmail3,
  },
};

export async function sendWelcomeSeriesEmail(params: {
  userId: string;
  step: 1 | 2 | 3;
  recipientEmail: string;
  recipientName: string;
}) {
  const meta = WELCOME_STEP_META[params.step];

  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping welcome-series email");
    // Still record the attempt in email_logs so the drip cron stays
    // idempotent (it gates on email_logs) — otherwise it would re-attempt
    // this step on every run when email is unconfigured.
    await logEmail({
      userId: params.userId,
      emailType: meta.emailType,
      recipientEmail: params.recipientEmail,
      subject: meta.subject,
      status: "skipped",
    });
    return { success: false, error: "Email not configured" };
  }

  const appUrl = env.PUBLIC_APP_URL;
  const token = signUnsubscribeToken(params.userId, getUnsubscribeSecret());
  const unsubscribeUrl = `${appUrl}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;

  const { html, text } = await renderEmail(
    meta.Component({
      recipientName: params.recipientName,
      dashboardUrl: `${appUrl}/dashboard`,
      unsubscribeUrl,
    }),
  );

  const result = await sendEmail({
    to: params.recipientEmail,
    subject: meta.subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  await logEmail({
    userId: params.userId,
    emailType: meta.emailType,
    recipientEmail: params.recipientEmail,
    subject: meta.subject,
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
}) {
  const emailType = "capture_incentive";
  const amount = formatIncentiveAmount(CAPTURE_INCENTIVE.amountCents);
  const subject = `Your ${amount} code for Aspire Sports`;

  // Existence check — any matching row means we already handled this address
  // (sent, failed, or skipped), so no orderBy is needed on the limit(1).
  const [already] = await getDb()
    .select({ id: emailLogs.id })
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.emailType, emailType),
        eq(emailLogs.recipientEmail, params.recipientEmail),
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

  const { html, text } = await renderEmail(
    CaptureIncentiveEmail({
      amount,
      code: CAPTURE_INCENTIVE.code,
      programsUrl: `${env.PUBLIC_APP_URL}/programs`,
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
