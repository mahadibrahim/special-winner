import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";

/**
 * GET /api/dashboard/settings/messaging
 *   Returns the current messaging settings for the signed-in parent:
 *   phone (if any), phoneVerified, primary/fallback channel, telegram
 *   chat id and username, email.
 *
 * POST /api/dashboard/settings/messaging
 *   Updates the parent's messaging channel preferences.
 *   Body: { primaryChannel?, fallbackChannel? }
 *   Both fields are validated against allowed values and nullable.
 */

const updateSchema = z.object({
  primaryChannel: z
    .enum(["sms", "email", "telegram"])
    .nullable()
    .optional(),
  fallbackChannel: z
    .enum(["sms", "email", "telegram"])
    .nullable()
    .optional(),
});

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) return json({ error: "Unauthorized" }, 401);

  const db = getDb();
  const [row] = await db
    .select({
      email: users.email,
      phone: users.phone,
      phoneVerified: users.phoneVerified,
      primaryChannel: users.messagingPrimaryChannel,
      fallbackChannel: users.messagingFallbackChannel,
      telegramChatId: users.telegramChatId,
      telegramUsername: users.telegramUsername,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!row) return json({ error: "User not found" }, 404);

  return json({
    email: row.email,
    phone: row.phone,
    phoneVerified: row.phoneVerified,
    primaryChannel: row.primaryChannel,
    fallbackChannel: row.fallbackChannel,
    telegramConnected: Boolean(row.telegramChatId),
    telegramUsername: row.telegramUsername,
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: "Unauthorized" }, 401);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }

  // Defensive: don't let a parent set primaryChannel to telegram if they
  // haven't actually bound a Telegram chat id yet.
  if (parsed.data.primaryChannel === "telegram") {
    const db = getDb();
    const [u] = await db
      .select({ chatId: users.telegramChatId })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!u?.chatId) {
      return json(
        {
          error:
            "Connect Telegram first before setting it as your primary channel.",
        },
        400,
      );
    }
  }

  // Defensive: don't let a parent set primaryChannel to sms if phone isn't verified
  if (parsed.data.primaryChannel === "sms") {
    const db = getDb();
    const [u] = await db
      .select({ verified: users.phoneVerified })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!u?.verified) {
      return json(
        {
          error: "Verify your phone first before setting SMS as primary channel.",
        },
        400,
      );
    }
  }

  const updates: {
    messagingPrimaryChannel?: string | null;
    messagingFallbackChannel?: string | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (parsed.data.primaryChannel !== undefined) {
    updates.messagingPrimaryChannel = parsed.data.primaryChannel;
  }
  if (parsed.data.fallbackChannel !== undefined) {
    updates.messagingFallbackChannel = parsed.data.fallbackChannel;
  }

  await getDb().update(users).set(updates).where(eq(users.id, user.id));

  return json({ success: true });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
