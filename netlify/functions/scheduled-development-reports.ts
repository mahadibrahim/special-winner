/**
 * Netlify Scheduled Function — triggers the monthly development-report
 * sweep at 13:00 UTC on the 1st of every month by POSTing to
 * /api/cron/send-development-reports. The repo's FIRST monthly-cadence
 * scheduled function (every sibling in this directory is daily).
 *
 * Same "don't import the app lib directly" shape as
 * scheduled-trial-convert-emails.ts: `import.meta.env` is Vite-only and
 * undefined in the Netlify function bundle, so this stays a thin HTTP
 * trigger and the real work runs inside Astro SSR via the route.
 *
 * Returns 200 when the route responds OK, 500 otherwise so Netlify's logs
 * surface failures without retrying (the next tick is a month away).
 *
 * RECOVERY MODEL (F2): this function never retries a failed invocation, and
 * the route's default period is always "whatever just closed relative to
 * now" — so a failure here is only silently self-healing WITHIN the same
 * month (a manual re-POST to the route still resolves the same just-closed
 * period; dedupe makes it idempotent). Once the month rolls, this schedule
 * fires again for the NEW period and the missed one is otherwise
 * unreachable. Ops recovery for that case: manually re-POST the route with
 * `?period=YYYY-MM` (or `?period=YYYY-Qn`) naming the missed period — see
 * the route's header and `resolveOverridePeriod` in
 * src/lib/reports/development-reports.ts.
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/send-development-reports";

export const handler = schedule("0 13 1 * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(/\/$/, "");
  if (!base) {
    console.error("[scheduled-development-reports] no site URL in env (URL / PUBLIC_APP_URL)");
    return { statusCode: 500, body: "Site URL not configured" };
  }

  try {
    const res = await fetch(`${base}${ROUTE}`, {
      method: "POST",
      headers: {
        "x-cron-secret": process.env.CRON_SECRET ?? "",
        // Astro's checkOrigin CSRF guard 403s any non-GET request whose
        // `origin` header doesn't match the site origin — this request
        // genuinely is same-origin (function + route ship in one
        // deployment), so say so.
        Origin: base,
      },
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`[scheduled-development-reports] ${ROUTE} → ${res.status}: ${body}`);
      return { statusCode: 500, body };
    }
    console.info(`[scheduled-development-reports] ${ROUTE} → ${res.status}: ${body}`);
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-development-reports]", err);
    return { statusCode: 500, body: err instanceof Error ? err.message : String(err) };
  }
});
