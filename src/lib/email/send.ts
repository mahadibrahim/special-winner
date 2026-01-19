import { render } from "@react-email/components";
import { sendEmail, isEmailConfigured } from "./index";
import { RegistrationConfirmationEmail } from "./templates/registration-confirmation";
import { PaymentReceiptEmail } from "./templates/payment-receipt";
import { WaitlistPromotionEmail } from "./templates/waitlist-promotion";
import { RefundNotificationEmail } from "./templates/refund-notification";
import { getDb } from "@/lib/db";
import { emailLogs } from "@/lib/db/schema";

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
    })
  );

  const subject = params.registrationStatus === "waitlisted"
    ? `Waitlist Confirmation - ${params.childName} for ${params.programName}`
    : `Registration Confirmed - ${params.childName} for ${params.programName}`;

  const result = await sendEmail({
    to: params.parentEmail,
    subject,
    html,
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

  const result = await sendEmail({
    to: params.parentEmail,
    subject,
    html,
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

  const result = await sendEmail({
    to: params.parentEmail,
    subject,
    html,
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

  const result = await sendEmail({
    to: params.parentEmail,
    subject,
    html,
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
