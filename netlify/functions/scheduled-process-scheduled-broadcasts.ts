/**
 * Netlify Scheduled Function — fires any scheduled_broadcasts rows
 * whose scheduled_for timestamp has passed by POSTing to
 * /api/cron/process-scheduled-broadcasts.
 *
 * Mirrors scheduled-expire-pending-claims.ts (no app-lib imports).
 *
 * Cadence: hourly on the hour. The source endpoint's doc-comment
 * explicitly suggests "intended to run frequently (e.g. hourly)." A
 * scheduled broadcast set for 3:45pm will fire at 4:00pm — acceptable
 * latency for league-night announcements; tightening to 15-min ticks
 * would be straightforward later if pre-game broadcasts feel laggy.
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/process-scheduled-broadcasts";

export const handler = schedule("0 * * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-process-scheduled-broadcasts] no site URL in env (URL / PUBLIC_APP_URL)",
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
        `[scheduled-process-scheduled-broadcasts] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-process-scheduled-broadcasts] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-process-scheduled-broadcasts]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
