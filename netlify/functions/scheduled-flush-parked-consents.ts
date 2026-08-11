/**
 * Netlify Scheduled Function — flushes parked (pending) phone consents whose
 * channel has woken, by POSTing to /api/cron/flush-parked-consents.
 *
 * Half-hourly: a dormant channel can wake at any time (a 10DLC re-appeal is
 * approved, a WABA connects), and half-hourly is cheap and bounded.
 *
 * Mirrors scheduled-send-welcome-series.ts: no app-lib imports (the lib tree
 * reads import.meta.env, undefined in the Netlify function bundle).
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/flush-parked-consents";

export const handler = schedule("8-38/30 * * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-flush-parked-consents] no site URL in env (URL / PUBLIC_APP_URL)",
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
        `[scheduled-flush-parked-consents] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-flush-parked-consents] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-flush-parked-consents]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
