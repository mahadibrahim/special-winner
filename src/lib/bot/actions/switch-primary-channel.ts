import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import type { BotActionDefinition, BotActionResult } from "./types";

const ALLOWED_CHANNELS = new Set(["sms", "email", "telegram"]);

/**
 * switch_primary_channel — updates the parent's preferred messaging channel.
 * Mutation, reversible, low-risk (the parent can always switch back).
 */
export const switchPrimaryChannel: BotActionDefinition = {
  name: "switch_primary_channel",
  description:
    "Update the parent's preferred messaging channel. Use when the parent says 'text me instead', 'use email', 'stop sending me texts, email only', etc.",
  readOnly: false,
  reversible: true,
  requiresConfirmation: false,

  async handler(params, context): Promise<BotActionResult> {
    const channel = typeof params.channel === "string" ? params.channel.toLowerCase() : null;

    if (!channel || !ALLOWED_CHANNELS.has(channel)) {
      return {
        ok: false,
        responseBody:
          "I can switch you to SMS, email, or Telegram — just let me know which one.",
        errorReason: `Invalid or missing channel param: ${channel}`,
      };
    }

    const db = getDb();

    await db
      .update(users)
      .set({
        messagingPrimaryChannel: channel,
        updatedAt: new Date(),
      })
      .where(eq(users.id, context.parentUserId));

    const label =
      channel === "sms"
        ? "text message"
        : channel === "email"
          ? "email"
          : "Telegram";

    return {
      ok: true,
      responseBody: `Done — I'll use ${label} as your primary channel from now on. Reply back anytime to change it.`,
      details: { newChannel: channel },
    };
  },
};
