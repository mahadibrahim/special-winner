import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { telegramSendMessage, isTelegramConfigured } from "./client";

/**
 * Send a Telegram message directly to a chat_id, bypassing the
 * parent-user lookup in `sendTelegramToParent`. Used for staff
 * recipients (resolved via venue_role_assignments) whose
 * `users.telegramChatId` is the chat to deliver to. Returns the
 * same result shape so callers can switch helpers without changes.
 */
export async function sendTelegramRaw(
  chatId: string,
  body: string,
  opts: { parseMode?: "HTML" | "MarkdownV2" } = {},
): Promise<TelegramSendOutcome> {
  if (!isTelegramConfigured()) {
    return { ok: false, reason: "not_configured" };
  }
  if (!chatId) {
    return { ok: false, reason: "no_chat_id" };
  }
  try {
    const result = await telegramSendMessage(chatId, body, {
      parseMode: opts.parseMode,
    });
    return { ok: true, messageId: String(result.message_id) };
  } catch (err) {
    return {
      ok: false,
      reason: "api_error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * High-level outbound Telegram helper. Looks up the parent's
 * telegram_chat_id, sends the message, and returns a gateway-compatible
 * result shape.
 */

export interface TelegramSendOutcome {
  ok: boolean;
  messageId?: string;
  reason?: "not_configured" | "no_chat_id" | "api_error";
  error?: string;
}

export async function sendTelegramToParent(
  parentUserId: string,
  body: string,
): Promise<TelegramSendOutcome> {
  if (!isTelegramConfigured()) {
    return { ok: false, reason: "not_configured" };
  }

  const db = getDb();
  const [parent] = await db
    .select({ chatId: users.telegramChatId })
    .from(users)
    .where(eq(users.id, parentUserId))
    .limit(1);

  if (!parent?.chatId) {
    return { ok: false, reason: "no_chat_id" };
  }

  try {
    const result = await telegramSendMessage(parent.chatId, body);
    return {
      ok: true,
      messageId: String(result.message_id),
    };
  } catch (err) {
    return {
      ok: false,
      reason: "api_error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
