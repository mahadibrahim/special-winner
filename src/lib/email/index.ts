import { Resend } from "resend";

// Initialize Resend client
const resendApiKey = import.meta.env.RESEND_API_KEY;

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export function isEmailConfigured(): boolean {
  return resend !== null;
}

export const EMAIL_FROM = import.meta.env.RESEND_FROM_EMAIL || "Aspire Sports <hello@aspiresportsohio.com>";

/**
 * Sender identity for a brand. Both brands send from the same verified
 * address — only the display name changes (gosoccerone.com is not yet
 * verified in Resend; see the launch checklist). Falls back to
 * EMAIL_FROM verbatim if the address can't be parsed out of it.
 */
export function fromForBrand(
  brand: "aspire" | "soccerone" | null | undefined,
): string {
  if (brand !== "soccerone") return EMAIL_FROM;
  const match = EMAIL_FROM.match(/<([^>]+)>/);
  return match ? `SoccerOne <${match[1]}>` : EMAIL_FROM;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  /** Sender override (e.g. per-brand display name). Defaults to EMAIL_FROM. */
  from?: string;
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!resend) {
    console.warn("Email not configured - RESEND_API_KEY not set");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: options.from ?? EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      headers: options.headers,
    });

    if (error) {
      console.error("Error sending email:", error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
