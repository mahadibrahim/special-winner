/**
 * Netlify Scheduled Function — sends unconfirmed-assignment reminders
 * for media shoots (48h + 24h ahead) by POSTing to
 * /api/cron/media-unconfirmed-reminders.
 *
 * Mirrors scheduled-expire-pending-claims.ts (no app-lib imports).
 *
 * Cadence: daily at 04:30 UTC. Off-peak so media notifications don't
 * compete with the morning ops emails landing 9-10am ET.
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/media-unconfirmed-reminders";

export const handler = schedule("38 4 * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-media-unconfirmed-reminders] no site URL in env (URL / PUBLIC_APP_URL)",
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
        `[scheduled-media-unconfirmed-reminders] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-media-unconfirmed-reminders] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-media-unconfirmed-reminders]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
