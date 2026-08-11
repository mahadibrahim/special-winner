/**
 * Netlify Scheduled Function — archives team groups whose season ended
 * more than 7 days ago by POSTing to /api/cron/archive-team-groups.
 *
 * Mirrors scheduled-expire-pending-claims.ts: no app-lib imports (the
 * lib tree reads import.meta.env, undefined in the Netlify function
 * bundle).
 *
 * Cadence: daily at 03:00 UTC (overnight US ET, low traffic).
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/archive-team-groups";

export const handler = schedule("16 3 * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-archive-team-groups] no site URL in env (URL / PUBLIC_APP_URL)",
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
        `[scheduled-archive-team-groups] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-archive-team-groups] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-archive-team-groups]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
