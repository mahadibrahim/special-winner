import type { APIRoute } from "astro";
import { createMagicLink } from "@/lib/auth/magic-link";

/**
 * POST /api/dashboard/settings/telegram/link
 *
 * Generates a Telegram deep link the parent can tap to bind their chat
 * to their Aspire account. Flow:
 *   1. Parent taps "Connect Telegram" in settings
 *   2. This endpoint creates a magic link (purpose: telegram_bind, 1h expiry)
 *   3. Response contains a URL like: https://t.me/<bot_username>?start=<token>
 *   4. Tapping the URL opens Telegram and calls /start <token> on our bot
 *   5. Our bot webhook consumes the token and binds the Telegram chat id
 *      to the parent's users row
 *
 * Returns:
 *   - url: the t.me deep link
 *   - expiresAt: when the token stops working
 */

export const POST: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const botUsername = import.meta.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    return json(
      {
        error:
          "Telegram is not configured. Ask an admin to set TELEGRAM_BOT_USERNAME.",
      },
      503,
    );
  }

  const organization = (
    locals as unknown as { organization?: { id: string } | null }
  ).organization;

  const { token, expiresAt } = await createMagicLink({
    userId: user.id,
    organizationId: organization?.id,
    purpose: "telegram_bind",
  });

  // Telegram deep link format: https://t.me/<bot_username>?start=<payload>
  // The payload is passed to the bot as the first argument to /start.
  const url = `https://t.me/${botUsername}?start=${encodeURIComponent(token)}`;

  return json({
    url,
    expiresAt: expiresAt.toISOString(),
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
