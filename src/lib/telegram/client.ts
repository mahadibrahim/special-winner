/**
 * Telegram Bot API client.
 *
 * Uses fetch() against the public HTTPS Bot API rather than pulling in a
 * full library like telegraf — our needs are narrow (send message, read
 * webhook updates) and the Bot API is a simple JSON protocol.
 *
 * All Telegram calls go through this module so the rest of the app has a
 * single surface to mock in tests and a single place to add retries,
 * rate limiting, or failure handling.
 */

const TELEGRAM_API = "https://api.telegram.org";

export function isTelegramConfigured(): boolean {
  return Boolean(import.meta.env.TELEGRAM_BOT_TOKEN);
}

function getBotToken(): string {
  const token = import.meta.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "Telegram not configured. Set TELEGRAM_BOT_TOKEN to enable the Telegram channel.",
    );
  }
  return token;
}

async function callTelegram<T = unknown>(
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  const token = getBotToken();
  const url = `${TELEGRAM_API}/bot${token}/${method}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const data = (await res.json()) as {
    ok: boolean;
    result?: T;
    description?: string;
    error_code?: number;
  };

  if (!data.ok) {
    throw new Error(
      `Telegram API error: ${data.error_code} ${data.description ?? "(no description)"}`,
    );
  }

  return data.result as T;
}

export interface TelegramSendMessageResult {
  message_id: number;
  chat: { id: number };
  date: number;
}

/**
 * Send a text message to a specific Telegram chat.
 */
export async function telegramSendMessage(
  chatId: number | string,
  text: string,
  opts: {
    parseMode?: "MarkdownV2" | "HTML";
    disableWebPagePreview?: boolean;
    inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>;
  } = {},
): Promise<TelegramSendMessageResult> {
  const params: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };

  if (opts.parseMode) params.parse_mode = opts.parseMode;
  if (opts.disableWebPagePreview) params.disable_web_page_preview = true;
  if (opts.inlineKeyboard) {
    params.reply_markup = { inline_keyboard: opts.inlineKeyboard };
  }

  return await callTelegram<TelegramSendMessageResult>("sendMessage", params);
}

/**
 * Answer a callback query (when the user taps an inline keyboard button).
 */
export async function telegramAnswerCallback(
  callbackQueryId: string,
  text?: string,
): Promise<boolean> {
  return await callTelegram<boolean>("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

/**
 * Set the webhook URL for inbound updates. Run once during deployment.
 */
export async function telegramSetWebhook(
  webhookUrl: string,
  secretToken?: string,
): Promise<boolean> {
  const params: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ["message", "callback_query"],
  };
  if (secretToken) params.secret_token = secretToken;

  return await callTelegram<boolean>("setWebhook", params);
}
