import { render } from "@react-email/components";
import { sendEmail, isEmailConfigured } from "./index";
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
import { getDb } from "@/lib/db";
import { emailLogs } from "@/lib/db/schema";
import { sendToParent } from "@/lib/messaging/gateway";
import { env } from "@/lib/env";

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
    await sendToParent({
      parentUserId: opts.userId,
      organizationId: opts.organizationId,
      body: opts.body,
      forceChannel: "sms",
      senderType: "system",
    });
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
  smsNudge?: { organizationId?: string; body: string };
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const result = await sendEmail({
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
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

/**
 * Helper: if organizationId is provided and we can route through the
 * messaging gateway (multi-channel SMS/email/telegram with opt-in enforcement),
 * use that. Otherwise fall back to direct email send. This lets legacy
 * callers keep working while new callers automatically get the Phase 1
 * multi-channel behavior by passing organizationId.
 */
async function sendViaGatewayOrDirect(opts: {
  userId?: string;
  organizationId?: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  smsBody?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (opts.userId && opts.organizationId) {
    const result = await sendToParent({
      parentUserId: opts.userId,
      organizationId: opts.organizationId,
      body: opts.smsBody || opts.text || stripHtmlTags(opts.html),
      bodyHtml: opts.html,
      subject: opts.subject,
      senderType: "system",
    });

    if (result.ok) {
      return {
        success: true,
        messageId: result.externalMessageId ?? undefined,
      };
    }

    // Gateway failed to send via all channels — fall back to direct email
    // so the parent still gets the transactional notification.
    console.warn(
      `Gateway send failed (${result.reason}), falling back to direct email`,
    );
  }

  return await sendEmail({
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

// Format date
function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Format date with time
function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
}

export async function sendRegistrationConfirmationEmail(params: SendRegistrationConfirmationParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping registration confirmation email");
    return { success: false, error: "Email not configured" };
  }

  const appUrl = env.PUBLIC_APP_URL;

  const html = await render(
    RegistrationConfirmationEmail({
      parentName: params.parentName,
      childName: params.childName,
      programName: params.programName,
      seasonName: params.seasonName,
      startDate: formatDate(params.startDate),
      endDate: formatDate(params.endDate),
      scheduleNotes: params.scheduleNotes,
      locationName: params.locationName,
      locationAddress: params.locationAddress,
      amountDue: formatCurrency(params.amountDueCents),
      paymentStatus: params.paymentStatus,
      registrationStatus: params.registrationStatus,
      dashboardUrl: `${appUrl}/dashboard`,
      hasLinkedTelegram: params.hasLinkedTelegram ?? false,
    })
  );

  const subject = params.registrationStatus === "waitlisted"
    ? `Waitlist Confirmation - ${params.childName} for ${params.programName}`
    : `Registration Confirmed - ${params.childName} for ${params.programName}`;

  // SMS-friendly version for multi-channel delivery
  const smsBody =
    params.registrationStatus === "waitlisted"
      ? `${params.childName} is on the waitlist for ${params.programName}. We'll notify you if a spot opens up.`
      : `${params.childName}'s registration for ${params.programName} is confirmed. First session: ${formatDate(params.startDate)}. Details: ${appUrl}/dashboard`;

  const result = await sendViaGatewayOrDirect({
    userId: params.userId,
    organizationId: params.organizationId,
    to: params.parentEmail,
    subject,
    html,
    smsBody,
  });

  await logEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: "registration_confirmation",
    recipientEmail: params.parentEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
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
}

export async function sendPaymentReceiptEmail(params: SendPaymentReceiptParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping payment receipt email");
    return { success: false, error: "Email not configured" };
  }

  const appUrl = env.PUBLIC_APP_URL;

  const html = await render(
    PaymentReceiptEmail({
      parentName: params.parentName,
      childName: params.childName,
      programName: params.programName,
      seasonName: params.seasonName,
      amountPaid: formatCurrency(params.amountPaidCents),
      paymentDate: formatDate(new Date()),
      paymentType: params.paymentType,
      remainingBalance: params.remainingBalanceCents
        ? formatCurrency(params.remainingBalanceCents)
        : undefined,
      receiptNumber: params.receiptNumber,
      dashboardUrl: `${appUrl}/dashboard`,
    })
  );

  const subject = `Payment Receipt - ${params.childName} - ${params.programName}`;

  const smsBody = `Payment received: ${formatCurrency(params.amountPaidCents)} for ${params.childName}'s ${params.programName}. Receipt #${params.receiptNumber}.`;

  const result = await sendViaGatewayOrDirect({
    userId: params.userId,
    organizationId: params.organizationId,
    to: params.parentEmail,
    subject,
    html,
    smsBody,
  });

  await logEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: "payment_receipt",
    recipientEmail: params.parentEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
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
}

export async function sendWaitlistPromotionEmail(params: SendWaitlistPromotionParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping waitlist promotion email");
    return { success: false, error: "Email not configured" };
  }

  const appUrl = env.PUBLIC_APP_URL;

  const html = await render(
    WaitlistPromotionEmail({
      parentName: params.parentName,
      childName: params.childName,
      programName: params.programName,
      seasonName: params.seasonName,
      amountDue: formatCurrency(params.amountDueCents),
      expiresAt: formatDateTime(params.expiresAt),
      hoursToComplete: params.hoursToComplete,
      registerUrl: `${appUrl}/dashboard`,
      dashboardUrl: `${appUrl}/dashboard`,
    })
  );

  const subject = `ACTION REQUIRED: Spot Available for ${params.childName} - ${params.programName}`;

  const smsBody = `A spot just opened for ${params.childName} in ${params.programName}! Confirm within ${params.hoursToComplete}h: ${appUrl}/dashboard`;

  const result = await sendViaGatewayOrDirect({
    userId: params.userId,
    organizationId: params.organizationId,
    to: params.parentEmail,
    subject,
    html,
    smsBody,
  });

  await logEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: "waitlist_promotion",
    recipientEmail: params.parentEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
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
}

export async function sendRefundNotificationEmail(params: SendRefundNotificationParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping refund notification email");
    return { success: false, error: "Email not configured" };
  }

  const appUrl = env.PUBLIC_APP_URL;

  const html = await render(
    RefundNotificationEmail({
      parentName: params.parentName,
      childName: params.childName,
      programName: params.programName,
      seasonName: params.seasonName,
      refundAmount: formatCurrency(params.refundAmountCents),
      refundStatus: params.refundStatus,
      denialReason: params.denialReason,
      dashboardUrl: `${appUrl}/dashboard`,
    })
  );

  const subject = params.refundStatus === "approved"
    ? `Refund Approved - ${formatCurrency(params.refundAmountCents)} for ${params.childName}`
    : `Refund Request Update - ${params.childName}`;

  const smsBody =
    params.refundStatus === "approved"
      ? `Refund of ${formatCurrency(params.refundAmountCents)} for ${params.childName}'s ${params.programName} has been approved. Expect 5-10 business days.`
      : `Refund request for ${params.childName}'s ${params.programName} was not approved. ${params.denialReason ?? "Check your dashboard for details."}`;

  const result = await sendViaGatewayOrDirect({
    userId: params.userId,
    organizationId: params.organizationId,
    to: params.parentEmail,
    subject,
    html,
    smsBody,
  });

  await logEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: params.refundStatus === "approved" ? "refund_approved" : "refund_denied",
    recipientEmail: params.parentEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
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
}

export async function sendMagicLinkLoginEmail(params: SendMagicLinkLoginParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping magic-link login email");
    return { success: false, error: "Email not configured" };
  }

  const html = await render(
    MagicLinkLoginEmail({
      parentName: params.parentName,
      magicLinkUrl: params.magicLinkUrl,
      expiresIn: params.expiresIn ?? "15 minutes",
      programName: params.programName,
      childName: params.childName,
      seasonName: params.seasonName,
    }),
  );

  const subject = "You're registered — finish setting up your account";

  // magicLinkUrl contains a single-use, 15-minute login token. Routing it via
  // SMS is the whole point of this email type — see /m/[token] for redemption.
  const smsBody = `You're registered! Sign in to your Aspire Sports account: ${params.magicLinkUrl}`;

  const result = await sendViaGatewayOrDirect({
    userId: params.userId,
    organizationId: params.organizationId,
    to: params.parentEmail,
    subject,
    html,
    smsBody,
  });

  await logEmail({
    userId: params.userId,
    emailType: "magic_link_login",
    recipientEmail: params.parentEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
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
  retryUrl: string;
}

export async function sendPaymentFailedEmail(params: SendPaymentFailedParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping payment-failed email");
    return { success: false, error: "Email not configured" };
  }

  const html = await render(
    PaymentFailedEmail({
      parentName: params.parentName,
      childName: params.childName,
      programName: params.programName,
      seasonName: params.seasonName,
      failureMessage: params.failureMessage,
      retryUrl: params.retryUrl,
    }),
  );

  const subject = `Payment failed — ${params.childName}'s ${params.programName} registration`;

  const smsBody = `Heads up: your payment for ${params.childName}'s ${params.programName} registration didn't go through. Retry: ${params.retryUrl}`;

  const result = await sendViaGatewayOrDirect({
    userId: params.userId,
    organizationId: params.organizationId,
    to: params.parentEmail,
    subject,
    html,
    smsBody,
  });

  await logEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: "payment_failed",
    recipientEmail: params.parentEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
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

  const html = await render(
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

  // Trim SMS body so a long announcement body doesn't blow past 160 chars.
  const trimmed =
    params.announcementContent.length > 100
      ? `${params.announcementContent.slice(0, 100).trim()}…`
      : params.announcementContent;
  const smsBody = `${params.organizationName}: ${params.announcementTitle}. ${trimmed} ${params.dashboardUrl}`;

  const result = await sendViaGatewayOrDirect({
    userId: params.userId,
    organizationId: params.organizationId,
    to: params.recipientEmail,
    subject,
    html,
    smsBody,
  });

  await logEmail({
    userId: params.userId,
    emailType: "announcement",
    recipientEmail: params.recipientEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
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
  payBalanceUrl: string;
  reminderType: BalanceReminderType;
}

export async function sendBalanceReminderEmail(
  params: SendBalanceReminderParams,
) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping balance reminder email");
    return { success: false, error: "Email not configured" };
  }

  const html = await render(
    PaymentBalanceReminderEmail({
      parentName: params.parentName,
      childName: params.childName,
      programName: params.programName,
      seasonName: params.seasonName,
      balanceAmount: formatCurrency(params.balanceCents),
      seasonStartDate: formatDate(params.seasonStartDate),
      payBalanceUrl: params.payBalanceUrl,
      reminderType: params.reminderType,
    }),
  );

  const subject = `Balance due: ${formatCurrency(params.balanceCents)} — ${params.programName} ${params.seasonName}`;

  const smsBody = `Reminder: ${formatCurrency(params.balanceCents)} balance due for ${params.childName} (${params.programName}). Pay: ${params.payBalanceUrl}`;

  const result = await sendViaGatewayOrDirect({
    userId: params.userId,
    organizationId: params.organizationId,
    to: params.parentEmail,
    subject,
    html,
    smsBody,
  });

  await logEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: `balance_reminder_${params.reminderType}`,
    recipientEmail: params.parentEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
}
