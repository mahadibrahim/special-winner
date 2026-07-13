import { Resend } from "resend";
import { isMessagingMockEnabled, recordMockMessage } from "@/lib/messaging/mock";

// Initialize Resend client
const resendApiKey = import.meta.env.RESEND_API_KEY;

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export function isEmailConfigured(): boolean {
  // MESSAGING_MOCK=1 (see src/lib/messaging/mock.ts) reports "configured"
  // without a real RESEND_API_KEY, so callers that gate on isEmailConfigured()
  // (most of src/lib/email/send.ts) proceed to render + call sendEmail(),
  // which records instead of sending. Mirrors R2_MOCK's credential bypass.
  if (isMessagingMockEnabled()) return true;
  return resend !== null;
}

export const EMAIL_FROM = import.meta.env.RESEND_FROM_EMAIL || "Aspire Sports <hello@aspiresportsohio.com>";

/**
 * Sender identity for a brand. Resolution order for SoccerOne:
 *  1. RESEND_FROM_EMAIL_SOCCERONE verbatim when set (use this once
 *     gosoccerone.com is verified in Resend — set the env var in Netlify,
 *     no code change needed).
 *  2. "SoccerOne <addr>" where addr is parsed from EMAIL_FROM.
 *  3. EMAIL_FROM verbatim (fallback when EMAIL_FROM has no angle-bracket address).
 * For aspire (or unknown brand), EMAIL_FROM is returned unchanged.
 */
export function fromForBrand(
  brand: "aspire" | "soccerone" | null | undefined,
): string {
  if (brand !== "soccerone") return EMAIL_FROM;
  const envOverride = import.meta.env.RESEND_FROM_EMAIL_SOCCERONE as string | undefined;
  if (envOverride) return envOverride;
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
  // Test mode: record instead of calling Resend. See src/lib/messaging/mock.ts.
  if (isMessagingMockEnabled()) {
    const to = Array.isArray(options.to) ? options.to.join(", ") : options.to;
    const mock = recordMockMessage({
      channel: "email",
      to,
      subject: options.subject,
      body: options.text ?? options.html,
      organizationId: null,
    });
    return { success: true, messageId: mock.id };
  }

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
