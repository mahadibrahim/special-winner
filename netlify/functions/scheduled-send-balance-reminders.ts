/**
 * Netlify Scheduled Function — fires the balance-reminder sweep once daily
 * by POSTing to /api/cron/send-balance-reminders.
 *
 * Mirrors scheduled-expire-pending-claims.ts: it does NOT import app lib
 * (the lib tree reads import.meta.env, undefined in the Netlify function
 * bundle). The HTTP route runs the work inside the Astro SSR runtime.
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/send-balance-reminders";

// 13:00 UTC ≈ 8-9am US Eastern — well before any season's first session.
export const handler = schedule("0 13 * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-send-balance-reminders] no site URL in env (URL / PUBLIC_APP_URL)",
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
        `[scheduled-send-balance-reminders] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-send-balance-reminders] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-send-balance-reminders]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
