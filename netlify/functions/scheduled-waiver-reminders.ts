/**
 * Netlify Scheduled Function — fires the waiver-reminder sweep once daily
 * by POSTing to /api/cron/send-waiver-reminders.
 *
 * Mirrors scheduled-send-balance-reminders.ts: it does NOT import app lib
 * (the lib tree reads import.meta.env, undefined in the Netlify function
 * bundle). The HTTP route runs the work inside the Astro SSR runtime.
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/send-waiver-reminders";

// 13:00 UTC ≈ 8-9am US Eastern — same slot as send-balance-reminders.
export const handler = schedule("36 13 * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-waiver-reminders] no site URL in env (URL / PUBLIC_APP_URL)",
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
        `[scheduled-waiver-reminders] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-waiver-reminders] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-waiver-reminders]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
