/**
 * Netlify Scheduled Function — promotes team groups whose
 * creation_scheduled_for date has arrived by POSTing to
 * /api/cron/create-scheduled-team-groups.
 *
 * Mirrors scheduled-expire-pending-claims.ts (no app-lib imports).
 *
 * Cadence: daily at 04:00 UTC. Pairs with scheduled-archive-team-groups
 * at 03:00 (creation runs an hour after archival so a same-day reschedule
 * doesn't archive a group we just created).
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/create-scheduled-team-groups";

export const handler = schedule("19 4 * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-create-scheduled-team-groups] no site URL in env (URL / PUBLIC_APP_URL)",
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
        `[scheduled-create-scheduled-team-groups] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-create-scheduled-team-groups] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-create-scheduled-team-groups]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
