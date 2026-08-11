/**
 * Netlify Scheduled Function — fires the abandoned-checkout reminder sweep
 * once daily by POSTing to /api/cron/send-abandoned-checkout-reminders.
 *
 * Mirrors scheduled-send-balance-reminders.ts: it does NOT import app lib
 * (the lib tree reads import.meta.env, undefined in the Netlify function
 * bundle). The HTTP route runs the work inside the Astro SSR runtime.
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/send-abandoned-checkout-reminders";

// 15:00 UTC ≈ 10-11am US Eastern — mid-morning, when a "finish signing up"
// nudge is most likely to be acted on (observed buyers convert on evening
// and mid-morning sessions).
export const handler = schedule("12 15 * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-abandoned-checkout-reminders] no site URL in env (URL / PUBLIC_APP_URL)",
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
        `[scheduled-abandoned-checkout-reminders] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-abandoned-checkout-reminders] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-abandoned-checkout-reminders]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
