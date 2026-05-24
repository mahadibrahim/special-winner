/**
 * Netlify Scheduled Function — reconciles Telegram team-group membership
 * (invites who should be in but aren't, removes who shouldn't be) by
 * POSTing to /api/cron/reconcile-team-groups.
 *
 * Mirrors scheduled-expire-pending-claims.ts (no app-lib imports).
 *
 * Cadence: every 6 hours (00, 06, 12, 18 UTC). The source endpoint's
 * doc-comment says "intended to run daily or multiple times per day."
 * Six hours keeps membership lag bounded for the captain experience
 * without flooding Telegram's API.
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/reconcile-team-groups";

export const handler = schedule("0 */6 * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-reconcile-team-groups] no site URL in env (URL / PUBLIC_APP_URL)",
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
        `[scheduled-reconcile-team-groups] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-reconcile-team-groups] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-reconcile-team-groups]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
