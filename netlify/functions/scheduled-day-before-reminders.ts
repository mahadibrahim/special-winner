/**
 * Netlify Scheduled Function — sends reminder messages for events in the
 * next ~24h by POSTing to /api/cron/day-before-reminders.
 *
 * Mirrors scheduled-expire-pending-claims.ts (no app-lib imports).
 *
 * Cadence: daily at 22:00 UTC (~5pm US Eastern). Lands the "you have a
 * game tomorrow" reminder before evening so captains can rally before
 * the night gets away from them.
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/day-before-reminders";

export const handler = schedule("14 22 * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-day-before-reminders] no site URL in env (URL / PUBLIC_APP_URL)",
    );
    return { statusCode: 500, body: "Site URL not configured" };
  }

  try {
    const res = await fetch(`${base}${ROUTE}`, {
      method: "POST",
      headers: {
        "x-cron-secret": process.env.CRON_SECRET ?? "",
        Origin: base,
      },
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(
        `[scheduled-day-before-reminders] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-day-before-reminders] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-day-before-reminders]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
