/**
 * Check the current Telegram webhook registration status.
 * Shows last_error_message if Telegram failed to deliver anything.
 *
 * Run: npx tsx scripts/check-telegram-webhook.ts
 */
import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is required in .env");
  process.exit(1);
}

async function main() {
  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const json = await res.json();
  if (!json.ok) {
    console.error("getWebhookInfo failed:", json);
    process.exit(1);
  }
  console.log(JSON.stringify(json.result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
