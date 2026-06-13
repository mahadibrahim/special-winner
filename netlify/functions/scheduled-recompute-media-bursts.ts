/**
 * Netlify Scheduled Function — regroups newly-uploaded media assets into
 * bursts by POSTing to /api/cron/recompute-media-bursts.
 *
 * Mirrors scheduled-media-unconfirmed-reminders.ts (no app-lib imports).
 *
 * Cadence: hourly at :15. Burst grouping feeds the tagging queue, so
 * photos uploaded after a shoot get grouped within the hour — fast enough
 * for same-day tagging — while sitting off the top-of-hour where the
 * activity-tracker tick and scheduled broadcasts run.
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/recompute-media-bursts";

export const handler = schedule("15 * * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-recompute-media-bursts] no site URL in env (URL / PUBLIC_APP_URL)",
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
        `[scheduled-recompute-media-bursts] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-recompute-media-bursts] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-recompute-media-bursts]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
