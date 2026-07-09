import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { gameOfficials } from "@/lib/db/schema/teams";
import { sendSms, normalizeUsPhone } from "@/lib/sms/send";
import { env } from "@/lib/env";
import { captureServerException } from "@/lib/observability/server-error";
import { decideReminderAction, findOfficialsOwingCloseout } from "@/lib/referee/closeout-reminders";

/**
 * POST /api/cron/referee-closeout-reminders
 *
 * Escalating SMS reminder for referees who still owe a match close-out.
 * Stage 0 -> "send_first" once T+2h past kickoff. Stage 1 -> "send_second"
 * on the next ET morning. Stage 2 stops texting; the admin flag takes over.
 *
 * Authentication: requires `x-cron-secret` header matching CRON_SECRET env
 * (same convention as the other cron endpoints in this directory).
 *
 * The stage counter is advanced after every send *attempt* — regardless of
 * whether the SMS actually went out (opted-out/unconfigured refs fall
 * through to the admin flag rather than being retried forever) — and also
 * when an official has no usable phone number at all.
 */

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const now = new Date();
  const base = env.PUBLIC_APP_URL.replace(/\/$/, "");
  const db = getDb();
  let sent = 0;
  let skipped = 0;

  let owed: Awaited<ReturnType<typeof findOfficialsOwingCloseout>>;
  try {
    owed = await findOfficialsOwingCloseout(now);
  } catch (err) {
    console.error("[cron] referee-closeout-reminders query failed:", err);
    void captureServerException(err, {
      component: "cron/referee-closeout-reminders",
      metadata: { phase: "query" },
    });
    return json({ sent: 0, skipped: 0, error: "query_failed" }, 500);
  }

  for (const official of owed) {
    try {
      const action = decideReminderAction({
        now,
        scheduledAt: official.scheduledAt,
        status: official.status,
        stage: official.stage,
      });
      if (action === "none") {
        skipped++;
        continue;
      }

      const phone =
        official.phone && official.phoneVerified
          ? normalizeUsPhone(official.phone)
          : null;

      if (!phone) {
        // No usable phone — advance the stage so we don't loop on this
        // official forever; the admin flag takes over instead.
        await db
          .update(gameOfficials)
          .set({ closeoutRemindersSent: official.stage + 1, updatedAt: now })
          .where(eq(gameOfficials.id, official.officialId));
        skipped++;
        continue;
      }

      const matchup = `${official.homeTeamName ?? "your game"} vs ${official.awayTeamName ?? "TBD"}`;
      const body =
        action === "send_first"
          ? `Close out ${matchup} to get paid: ${base}/referee/matches/${official.gameId}`
          : `Reminder: 1 game still needs closing out. You won't be paid until it's done: ${base}/referee/matches/${official.gameId}`;

      const result = await sendSms({
        to: phone,
        body,
        organizationId: official.organizationId,
      });

      // Advance the stage regardless of opt-in outcome — we don't retry the
      // same stage; opted-out/unconfigured refs fall through to the admin
      // flag rather than being texted repeatedly.
      await db
        .update(gameOfficials)
        .set({ closeoutRemindersSent: official.stage + 1, updatedAt: now })
        .where(eq(gameOfficials.id, official.officialId));

      if (result.ok) {
        sent++;
      } else {
        skipped++;
        console.warn(
          "[cron] referee-closeout-reminders skip",
          official.officialId,
          result.reason,
        );
      }
    } catch (err) {
      // One bad official must never block the rest of the run.
      skipped++;
      console.error(
        "[cron] referee-closeout-reminders failed for official",
        official.officialId,
        err,
      );
      void captureServerException(err, {
        component: "cron/referee-closeout-reminders",
        metadata: { officialId: official.officialId, gameId: official.gameId },
      });
    }
  }

  return json({ sent, skipped }, 200);
};

// GET returns a small status page for human debugging. Does not send messages.
export const GET: APIRoute = async () => {
  return json({
    description: "Referee close-out escalating SMS reminder cron endpoint",
    usage:
      "POST to this endpoint with header x-cron-secret: $CRON_SECRET to run the reminder sweep. Intended for scheduled callers only.",
  });
};
