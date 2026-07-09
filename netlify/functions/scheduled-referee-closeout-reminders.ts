/**
 * Netlify Scheduled Function — fires the referee close-out reminder sweep
 * once daily by POSTing to /api/cron/referee-closeout-reminders.
 *
 * Mirrors scheduled-send-balance-reminders.ts: it does NOT import app lib
 * (the lib tree reads import.meta.env, undefined in the Netlify function
 * bundle). The HTTP route runs the work inside the Astro SSR runtime.
 *
 * Cadence note: a single daily 12:00 UTC run means the "T+2h" reminder
 * actually fires on the next daily sweep after kickoff+2h, not exactly 2h
 * later. That's acceptable for a nudge. If tighter timing is wanted later,
 * raise the schedule to hourly — the stage logic already guards against
 * double-sends.
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/referee-closeout-reminders";

// 12:00 UTC = 8am ET, so both the T+2h and next-morning windows get swept.
export const handler = schedule("0 12 * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-referee-closeout-reminders] no site URL in env (URL / PUBLIC_APP_URL)",
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
        `[scheduled-referee-closeout-reminders] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-referee-closeout-reminders] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-referee-closeout-reminders]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
