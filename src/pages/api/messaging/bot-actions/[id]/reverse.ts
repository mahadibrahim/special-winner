import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { botActionsLog } from "@/lib/db/schema/conversations";
import { attendance } from "@/lib/db/schema/teams";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { findRosterForKidAndGame } from "@/lib/bot/actions/rsvp";

/**
 * POST /api/messaging/bot-actions/:id/reverse
 *
 * Admin reversal of a bot action. Only reversible actions can be reversed.
 * Each action type has its own reversal logic — e.g. 'rsvp_absent' becomes
 * 'present', 'switch_primary_channel' reverts to the previous channel, etc.
 *
 * Phase 1 supports reversal for rsvp_absent only. Other actions fall back
 * to a best-effort reversal by the same inverse action (e.g. running
 * rsvp_present against the same kid/event).
 */

export const POST: APIRoute = async (context) => {
  const { params } = context;

  // Admin-of-this-org only, then org-pinned. The original bare `locals.user`
  // check let any authenticated user (even a parent) reverse any org's bot
  // action; requireOrgAdminAccess also blocks an admin of a different org.
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const actionId = params.id;
  if (!actionId) {
    return json({ error: "Missing action id" }, 400);
  }

  const db = getDb();
  const [action] = await db
    .select()
    .from(botActionsLog)
    .where(eq(botActionsLog.id, actionId))
    .limit(1);

  if (!action || action.organizationId !== auth.organizationId) {
    // 404 on a cross-org or missing id — don't disclose another tenant's action.
    return json({ error: "Action not found" }, 404);
  }
  if (!action.reversible) {
    return json({ error: "This action is not reversible" }, 409);
  }
  if (action.reversedAt) {
    return json({ error: "This action has already been reversed" }, 409);
  }

  // Dispatch to action-specific reversal logic
  const params_ = action.actionParams as Record<string, unknown> | null;

  try {
    switch (action.actionType) {
      case "rsvp_absent": {
        const eventId = typeof params_?.eventId === "string" ? params_.eventId : null;
        const kidId = typeof params_?.kidId === "string" ? params_.kidId : null;
        if (!eventId || !kidId) {
          return json({ error: "Action params missing kidId or eventId" }, 400);
        }
        // Scope the update to the SINGLE roster row the original action
        // affected — keyed by (gameId, rosterId), mirroring how rsvp_absent
        // wrote it. The previous `WHERE gameId = eventId` (roster-unscoped)
        // would flip the entire game's attendance to present.
        const rosterInfo = await findRosterForKidAndGame(kidId, eventId);
        if (!rosterInfo) {
          return json({ error: "Could not resolve the player for this action" }, 409);
        }
        await db
          .update(attendance)
          .set({
            status: "present",
            notes: "Reversed by admin via bot action reversal",
          })
          .where(
            and(
              eq(attendance.gameId, eventId),
              eq(attendance.rosterId, rosterInfo.rosterId),
            ),
          );
        break;
      }

      default:
        return json(
          { error: `No reversal handler for action type: ${action.actionType}` },
          501,
        );
    }

    // Mark the action as reversed
    await db
      .update(botActionsLog)
      .set({
        reversedAt: new Date(),
        reversedByUserId: auth.user.id,
      })
      .where(eq(botActionsLog.id, actionId));

    return json({ success: true });
  } catch (err) {
    console.error("Bot action reversal error:", err);
    return json({ error: "Reversal failed" }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
