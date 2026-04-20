import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { shootSessions } from "@/lib/db/schema/media";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import {
  notifyUnconfirmedReminder,
  notifyAdminUnconfirmedEscalation,
} from "@/lib/media/notifications";

/**
 * POST /api/cron/media-unconfirmed-reminders
 *
 * Scans shoot_sessions for unconfirmed assignments that are approaching
 * their scheduled start time and fires reminder notifications:
 *
 *   48h window — sessions whose scheduledStart falls in (now+47h, now+48h]
 *                → notifyUnconfirmedReminder (photographer, 48h)
 *
 *   24h window — sessions whose scheduledStart falls in (now+23h, now+24h]
 *                → notifyUnconfirmedReminder (photographer, 24h)
 *                → notifyAdminUnconfirmedEscalation (assigning admin)
 *
 * The 1-hour window (e.g. 47–48 h) means a cron running hourly will catch
 * every session exactly once.  A cron running more frequently would
 * double-notify; this endpoint does not deduplicate.
 *
 * Authentication: requires x-cron-secret header matching the CRON_SECRET
 * environment variable (same pattern as all other cron endpoints in this
 * project).
 */

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");

  if (secret) {
    if (provided !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else if (import.meta.env.PROD) {
    console.error(
      "[cron] CRON_SECRET not configured in production. Refusing request.",
    );
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const startedAt = Date.now();
    const db = getDb();
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const in47h = new Date(now.getTime() + 47 * 60 * 60 * 1000);
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000);

    // 48h window: sessions with scheduledStart in (now+47h, now+48h]
    const due48 = await db
      .select()
      .from(shootSessions)
      .where(
        and(
          isNull(shootSessions.confirmedAt),
          eq(shootSessions.status, "assigned"),
          gt(shootSessions.scheduledStart, in47h),
          lt(shootSessions.scheduledStart, in48h),
        ),
      );

    for (const s of due48) {
      if (s.assignedUserId) {
        await notifyUnconfirmedReminder(s, s.assignedUserId, 48);
      }
    }

    // 24h window: sessions with scheduledStart in (now+23h, now+24h]
    const due24 = await db
      .select()
      .from(shootSessions)
      .where(
        and(
          isNull(shootSessions.confirmedAt),
          eq(shootSessions.status, "assigned"),
          gt(shootSessions.scheduledStart, in23h),
          lt(shootSessions.scheduledStart, in24h),
        ),
      );

    for (const s of due24) {
      if (s.assignedUserId) {
        await notifyUnconfirmedReminder(s, s.assignedUserId, 24);
      }
      if (s.assignedByUserId) {
        await notifyAdminUnconfirmedEscalation(s, s.assignedByUserId);
      }
    }

    const elapsedMs = Date.now() - startedAt;

    console.info(
      `[cron] media-unconfirmed-reminders: reminded48=${due48.length}, reminded24=${due24.length} in ${elapsedMs}ms`,
    );

    return new Response(
      JSON.stringify({ ok: true, reminded48: due48.length, reminded24: due24.length, elapsedMs }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[cron] media-unconfirmed-reminders failed:", err);
    return new Response(
      JSON.stringify({
        error: "Cron job failed",
        details: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};

export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify({
      description: "Media unconfirmed-shoot reminder cron endpoint",
      usage:
        "POST to this endpoint with header x-cron-secret: $CRON_SECRET to dispatch reminders. Intended to run hourly.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
