import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { telegramSendMessage, isTelegramConfigured } from "./client";

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
