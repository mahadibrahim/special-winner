/**
 * Netlify Scheduled Function — fires the welcome-series enroll + drip once
 * daily by POSTing to /api/cron/send-welcome-series.
 *
 * Mirrors scheduled-send-balance-reminders.ts: no app-lib imports (the lib
 * tree reads import.meta.env, undefined in the Netlify function bundle).
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/send-welcome-series";

// 14:00 UTC ≈ 10am US Eastern.
export const handler = schedule("0 14 * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-send-welcome-series] no site URL in env (URL / PUBLIC_APP_URL)",
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
        `[scheduled-send-welcome-series] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-send-welcome-series] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-send-welcome-series]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
