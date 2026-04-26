import { render } from "@react-email/components";
import { sendEmail, isEmailConfigured } from "./index";
import { RegistrationConfirmationEmail } from "./templates/registration-confirmation";
import { PaymentReceiptEmail } from "./templates/payment-receipt";
import { WaitlistPromotionEmail } from "./templates/waitlist-promotion";
import { RefundNotificationEmail } from "./templates/refund-notification";
import { MagicLinkLoginEmail } from "./templates/magic-link-login";
import { getDb } from "@/lib/db";
import { emailLogs } from "@/lib/db/schema";
import { sendToParent } from "@/lib/messaging/gateway";

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

// Helper to log emails
async function logEmail(data: {
  userId?: string;
  registrationId?: string;
  emailType: string;
  recipientEmail: string;
  subject: string;
  resendMessageId?: string;
  status: string;
}) {
  if (false) return;

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

  const appUrl = import.meta.env.PUBLIC_APP_URL || "http://localhost:4321";

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

  const appUrl = import.meta.env.PUBLIC_APP_URL || "http://localhost:4321";

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

  const appUrl = import.meta.env.PUBLIC_APP_URL || "http://localhost:4321";

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

  const appUrl = import.meta.env.PUBLIC_APP_URL || "http://localhost:4321";

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
