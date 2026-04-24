/**
 * Register the Telegram bot webhook with Telegram's API.
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from .env, and
 * points Telegram at the PUBLIC_APP_URL's inbound handler. Idempotent —
 * safe to re-run after the URL or secret changes.
 *
 * Run: npx tsx scripts/register-telegram-webhook.ts
 */
import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl =
  process.env.PUBLIC_APP_URL ?? "https://sage-lollipop-3c5d35.netlify.app";

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is required in .env");
  process.exit(1);
}
if (!secret) {
  console.error("TELEGRAM_WEBHOOK_SECRET is required in .env");
  process.exit(1);
}

const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/messaging/inbound/telegram`;

async function tg<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`${method} failed: ${JSON.stringify(json)}`);
  }
  return json.result as T;
}

async function main() {
  console.log(`Target webhook URL: ${webhookUrl}\n`);

  const me = await tg<{ id: number; username: string; first_name: string }>(
    "getMe",
  );
  console.log(
    `Bot identity: ${me.first_name} (@${me.username}) — id ${me.id}`,
  );

  const setResult = await tg<boolean>("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: [
      "message",
      "edited_message",
      "my_chat_member",
      "chat_member",
    ],
    drop_pending_updates: true,
  });
  console.log(`\nsetWebhook result: ${setResult}`);

  const info = await tg<{
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
    max_connections?: number;
    allowed_updates?: string[];
  }>("getWebhookInfo");

  console.log("\nCurrent webhook state (from Telegram):");
  console.log(`  URL: ${info.url}`);
  console.log(`  Pending updates: ${info.pending_update_count}`);
  console.log(
    `  Allowed updates: ${(info.allowed_updates ?? []).join(", ") || "(all)"}`,
  );
  if (info.last_error_message) {
    console.log(
      `  Last error: ${info.last_error_message} at ${
        info.last_error_date
          ? new Date(info.last_error_date * 1000).toISOString()
          : "?"
      }`,
    );
  }

  if (info.url !== webhookUrl) {
    console.error(
      `\nMismatch: Telegram reports ${info.url} but we asked for ${webhookUrl}`,
    );
    process.exit(1);
  }

  console.log("\nDone. DM the bot /start to verify end-to-end.");
}

main().catch((err) => {
  console.error("\nFailed:", err);
  process.exit(1);
});
