import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import {
  conversations,
  conversationMessages,
} from "@/lib/db/schema/conversations";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { consumeMagicLink } from "@/lib/auth/magic-link";
import { telegramSendMessage } from "@/lib/telegram/client";
import { routeInboundMessage } from "@/lib/messaging/inbound-pipeline";

/**
 * POST /api/messaging/inbound/telegram
 *
 * Telegram sends inbound updates here via webhook (configured via
 * setWebhook). This route handles:
 *
 *  - /start <magic-link-token> — parent has tapped a deep link from an
 *    SMS or email we sent; we consume the token to bind their Telegram
 *    chat id to their parent user record.
 *  - /stop — parent wants to opt out of Telegram. Clears their telegram
 *    chat id so future messages route to SMS / email.
 *  - Any other text — treated as a normal inbound message, routed through
 *    the inbound pipeline to the classifier and action dispatch.
 *
 * Authentication is via a secret header Telegram includes when we
 * configure the webhook with a secret_token (set on setWebhook).
 */

export const prerender = false;

interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
  };
}

export const POST: APIRoute = async ({ request }) => {
  // Verify webhook secret token
  const expectedSecret = import.meta.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const provided = request.headers.get("x-telegram-bot-api-secret-token");
    if (provided !== expectedSecret) {
      return new Response("Forbidden", { status: 403 });
    }
  } else if (import.meta.env.PROD) {
    console.error(
      "[telegram webhook] TELEGRAM_WEBHOOK_SECRET not set in production",
    );
    return new Response("Server misconfigured", { status: 500 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const message = update.message;
  if (!message || !message.text) {
    return json({ ok: true, skipped: "non-text update" });
  }

  const chatId = message.chat.id;
  const text = message.text.trim();
  const db = getDb();

  // /start binds a parent account to this chat id via magic link
  if (text.startsWith("/start ")) {
    const token = text.slice(7).trim();
    const consumed = await consumeMagicLink(token);
    if (!consumed.ok) {
      await telegramSendMessage(
        chatId,
        "That link didn't work — it may have expired. Ask your admin to send a fresh one.",
      );
      return json({ ok: true, skipped: "invalid token" });
    }

    // Bind chat id to the parent
    await db
      .update(users)
      .set({
        telegramChatId: String(chatId),
        telegramUsername: message.from?.username ?? null,
        messagingPrimaryChannel: "telegram",
        updatedAt: new Date(),
      })
      .where(eq(users.id, consumed.userId));

    await telegramSendMessage(
      chatId,
      "You're all set. Aspire will send schedule updates, reminders, and coach messages here. Reply to me anytime — I'll route your question to the right person. Reply /stop to switch back to SMS.",
    );
    return json({ ok: true, bound: true });
  }

  // Bare /start with no token — user found the bot on their own
  if (text === "/start") {
    await telegramSendMessage(
      chatId,
      "Welcome to Aspire Sports 👋\n\nTo link this chat to your Aspire account, ask your admin to send you the connection link from the parent portal. Once you tap it, we'll bind this Telegram chat to your account and you can use it for schedules and messages.",
    );
    return json({ ok: true, intro: true });
  }

  // /stop — disconnect the chat
  if (text === "/stop" || text === "/unbind") {
    await db
      .update(users)
      .set({
        telegramChatId: null,
        telegramUsername: null,
        updatedAt: new Date(),
      })
      .where(eq(users.telegramChatId, String(chatId)));

    await telegramSendMessage(
      chatId,
      "You're disconnected from Aspire Telegram. We'll send updates via SMS or email instead. Reconnect anytime by tapping a fresh link from the parent portal.",
    );
    return json({ ok: true, unbound: true });
  }

  // /help
  if (text === "/help") {
    await telegramSendMessage(
      chatId,
      "Aspire Sports bot\n\nAsk me anything about your kid's schedule, practice times, or team. I'll answer if I can, or pass it to a coach or admin.\n\nCommands:\n/start <token> — link to your account\n/stop — unlink\n/help — this message",
    );
    return json({ ok: true });
  }

  // Normal message — route through the inbound pipeline
  const [parent] = await db
    .select()
    .from(users)
    .where(eq(users.telegramChatId, String(chatId)))
    .limit(1);

  if (!parent) {
    await telegramSendMessage(
      chatId,
      "This chat isn't linked to an Aspire account yet. Ask your admin for a connection link.",
    );
    return json({ ok: true, skipped: "unbound chat" });
  }

  // Look up the parent's organization (via phone_opt_ins for now)
  const [optIn] = await db
    .select({ orgId: phoneOptIns.organizationId })
    .from(phoneOptIns)
    .where(eq(phoneOptIns.userId, parent.id))
    .limit(1);

  if (!optIn) {
    await telegramSendMessage(
      chatId,
      "I can't find your organization context. Please contact your admin.",
    );
    return json({ ok: true, skipped: "no org context" });
  }

  // Resolve or create the conversation
  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.parentUserId, parent.id))
    .limit(1);

  let conversationId: string;
  if (existing.length > 0) {
    conversationId = existing[0].id;
  } else {
    const [row] = await db
      .insert(conversations)
      .values({
        organizationId: optIn.orgId,
        parentUserId: parent.id,
        status: "active",
        assignmentRole: "bot",
      })
      .returning({ id: conversations.id });
    conversationId = row.id;
  }

  const [msgRow] = await db
    .insert(conversationMessages)
    .values({
      conversationId,
      organizationId: optIn.orgId,
      direction: "inbound",
      channel: "telegram",
      senderType: "parent",
      senderUserId: parent.id,
      externalMessageId: String(message.message_id),
      body: text,
      deliveredAt: new Date(),
    })
    .returning({ id: conversationMessages.id });

  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      lastInboundAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));

  // Fire and forget — the bot reply goes back via the outbound gateway
  routeInboundMessage({
    conversationId,
    organizationId: optIn.orgId,
    parentUserId: parent.id,
    messageId: msgRow.id,
    messageBody: text,
    channel: "telegram",
  }).catch((err) => {
    console.error("Telegram inbound pipeline error:", err);
  });

  return json({ ok: true });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
