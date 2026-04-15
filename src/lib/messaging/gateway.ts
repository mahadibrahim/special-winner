import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import {
  conversations,
  conversationMessages,
} from "@/lib/db/schema/conversations";
import { sendSms, normalizeUsPhone } from "@/lib/sms/send";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { sendTelegramToParent } from "@/lib/telegram/send";

/**
 * Outbound messaging gateway.
 *
 * Every outbound parent message should go through this module. It handles:
 *  - Resolving the parent's preferred channel (SMS, email, Telegram)
 *  - Checking opt-in status on the selected channel
 *  - Falling back to the secondary channel on failure
 *  - Logging the message to conversation_messages with the external provider id
 *  - Updating the parent's conversation last_outbound_at and last_message_at
 *
 * Call patterns:
 *   sendToParent({ parentUserId, organizationId, body, conversationId? })
 *     — the most common path; auto-creates/resolves a conversation
 *   sendReply({ conversationMessageId, body })
 *     — staff reply to an inbound message; inherits the inbound's channel
 */

export interface SendToParentInput {
  parentUserId: string;
  organizationId: string;
  body: string;
  bodyHtml?: string;
  subject?: string; // used for email channel only
  conversationId?: string;
  /**
   * Optional override — force a specific channel even if the parent has a
   * different primary. Useful for transactional emails (receipts) that are
   * email-native even when a parent prefers SMS for conversation.
   */
  forceChannel?: "sms" | "email" | "telegram";
  senderType?: "bot" | "coach" | "admin" | "system";
  senderUserId?: string;
}

export type SendResult =
  | {
      ok: true;
      messageId: string;
      channel: "sms" | "email" | "telegram";
      externalMessageId: string | null;
      conversationId: string;
    }
  | {
      ok: false;
      reason:
        | "no_channel_available"
        | "all_channels_failed"
        | "parent_not_found"
        | "opted_out"
        | "not_configured";
      channel?: "sms" | "email" | "telegram";
      error?: string;
    };

/**
 * Main entry point. Sends an outbound message to a parent via their preferred
 * channel, with automatic fallback and conversation tracking.
 */
export async function sendToParent(
  input: SendToParentInput,
): Promise<SendResult> {
  const db = getDb();

  // Look up the parent's channel preferences and contact info
  const parent = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      phoneVerified: users.phoneVerified,
      primaryChannel: users.messagingPrimaryChannel,
      fallbackChannel: users.messagingFallbackChannel,
      telegramChatId: users.telegramChatId,
      firstName: users.firstName,
    })
    .from(users)
    .where(eq(users.id, input.parentUserId))
    .limit(1);

  if (parent.length === 0) {
    return { ok: false, reason: "parent_not_found" };
  }

  const p = parent[0];

  // Resolve channel order
  const channelsToTry = resolveChannelOrder({
    forced: input.forceChannel,
    primary: p.primaryChannel as "sms" | "email" | "telegram" | null,
    fallback: p.fallbackChannel as "sms" | "email" | "telegram" | null,
    hasPhone: Boolean(p.phone && p.phoneVerified),
    hasEmail: Boolean(p.email),
    hasTelegram: Boolean(p.telegramChatId),
  });

  if (channelsToTry.length === 0) {
    return { ok: false, reason: "no_channel_available" };
  }

  // Resolve or create the conversation
  const conversationId = await resolveOrCreateConversation(
    input.parentUserId,
    input.organizationId,
    input.conversationId,
  );

  // Try each channel in order until one succeeds
  let lastError: string | undefined;
  let lastOptedOut = false;

  for (const channel of channelsToTry) {
    const attempt = await attemptSend(channel, p, input);

    if (attempt.ok) {
      // Log the outbound message
      const [msgRow] = await db
        .insert(conversationMessages)
        .values({
          conversationId,
          organizationId: input.organizationId,
          direction: "outbound",
          channel,
          senderType: input.senderType ?? "bot",
          senderUserId: input.senderUserId ?? null,
          externalMessageId: attempt.externalMessageId,
          body: input.body,
          bodyHtml: input.bodyHtml ?? null,
          deliveredAt: new Date(),
        })
        .returning({ id: conversationMessages.id });

      // Update conversation timestamps
      await db
        .update(conversations)
        .set({
          lastMessageAt: new Date(),
          lastOutboundAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId));

      return {
        ok: true,
        messageId: msgRow.id,
        channel,
        externalMessageId: attempt.externalMessageId,
        conversationId,
      };
    }

    lastError = attempt.error;
    if (attempt.reason === "opted_out") lastOptedOut = true;
  }

  return {
    ok: false,
    reason: lastOptedOut ? "opted_out" : "all_channels_failed",
    error: lastError,
  };
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function resolveChannelOrder(opts: {
  forced?: "sms" | "email" | "telegram";
  primary: "sms" | "email" | "telegram" | null;
  fallback: "sms" | "email" | "telegram" | null;
  hasPhone: boolean;
  hasEmail: boolean;
  hasTelegram: boolean;
}): ("sms" | "email" | "telegram")[] {
  if (opts.forced) {
    return canSend(opts.forced, opts) ? [opts.forced] : [];
  }

  const order: ("sms" | "email" | "telegram")[] = [];

  const primary = opts.primary ?? (opts.hasPhone ? "sms" : "email");
  if (canSend(primary, opts) && !order.includes(primary)) order.push(primary);

  if (opts.fallback && canSend(opts.fallback, opts) && !order.includes(opts.fallback)) {
    order.push(opts.fallback);
  }

  // Final fallback — try anything reachable
  for (const c of ["sms", "email", "telegram"] as const) {
    if (!order.includes(c) && canSend(c, opts)) order.push(c);
  }

  return order;
}

function canSend(
  channel: "sms" | "email" | "telegram",
  opts: { hasPhone: boolean; hasEmail: boolean; hasTelegram: boolean },
): boolean {
  if (channel === "sms") return opts.hasPhone;
  if (channel === "email") return opts.hasEmail;
  if (channel === "telegram") return opts.hasTelegram;
  return false;
}

interface AttemptResult {
  ok: boolean;
  externalMessageId: string | null;
  reason?: string;
  error?: string;
}

async function attemptSend(
  channel: "sms" | "email" | "telegram",
  parent: {
    phone: string | null;
    email: string;
    telegramChatId: string | null;
    firstName: string | null;
  },
  input: SendToParentInput,
): Promise<AttemptResult> {
  if (channel === "sms") {
    if (!parent.phone) {
      return { ok: false, externalMessageId: null, reason: "no_phone" };
    }
    const normalized = normalizeUsPhone(parent.phone);
    if (!normalized) {
      return {
        ok: false,
        externalMessageId: null,
        reason: "invalid_phone",
      };
    }

    const result = await sendSms({
      to: normalized,
      organizationId: input.organizationId,
      body: input.body,
    });

    if (!result.ok) {
      return {
        ok: false,
        externalMessageId: null,
        reason: result.reason,
        error: result.error,
      };
    }
    return { ok: true, externalMessageId: result.messageId };
  }

  if (channel === "email") {
    if (!isEmailConfigured()) {
      return {
        ok: false,
        externalMessageId: null,
        reason: "not_configured",
      };
    }

    const html = input.bodyHtml || wrapPlainTextAsHtml(input.body);
    const subject = input.subject || defaultSubjectFor(parent.firstName);

    const result = await sendEmail({
      to: parent.email,
      subject,
      html,
      text: input.body,
    });

    if (!result.success) {
      return {
        ok: false,
        externalMessageId: null,
        reason: "email_failed",
        error: result.error,
      };
    }

    return {
      ok: true,
      externalMessageId: result.messageId ?? null,
    };
  }

  if (channel === "telegram") {
    // We already verified the parent has a telegramChatId via canSend(),
    // so this call can proceed. The parentUserId lookup inside sendTelegramToParent
    // re-validates and returns a structured outcome.
    const result = await sendTelegramToParent(
      input.parentUserId,
      input.body,
    );
    if (!result.ok) {
      return {
        ok: false,
        externalMessageId: null,
        reason: result.reason,
        error: result.error,
      };
    }
    return {
      ok: true,
      externalMessageId: result.messageId ?? null,
    };
  }

  return {
    ok: false,
    externalMessageId: null,
    reason: "unknown_channel",
  };
}

function wrapPlainTextAsHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #222;"><div style="max-width: 520px; padding: 24px;">${escaped
    .split("\n")
    .map((line) => `<p style="margin: 0 0 12px 0;">${line || "&nbsp;"}</p>`)
    .join("")}<p style="margin-top: 28px; color: #888; font-size: 12px;">— Aspire Sports</p></div></body></html>`;
}

function defaultSubjectFor(firstName: string | null): string {
  return firstName ? `A message from Aspire Sports, ${firstName}` : "A message from Aspire Sports";
}

async function resolveOrCreateConversation(
  parentUserId: string,
  organizationId: string,
  existingId?: string,
): Promise<string> {
  const db = getDb();

  if (existingId) return existingId;

  // Look for an active conversation for this parent + org
  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.parentUserId, parentUserId),
        eq(conversations.status, "active"),
      ),
    )
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  // Create a new conversation
  const [row] = await db
    .insert(conversations)
    .values({
      organizationId,
      parentUserId,
      status: "active",
      assignmentRole: "bot",
    })
    .returning({ id: conversations.id });

  return row.id;
}
