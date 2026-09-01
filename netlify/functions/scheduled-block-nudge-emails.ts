/**
 * Netlify Scheduled Function — triggers the block-abandon nudge sweep every
 * day at 5:12 AM UTC by POSTing to the /api/cron/block-nudge-emails route.
 * Scheduled after both scheduled-materialize-class-sessions.ts (4:23 AM UTC)
 * and scheduled-trial-convert-emails.ts (4:47 AM UTC) so the day's
 * `skippedNoWaiver` state is fresh before this sweep reads it.
 *
 * It deliberately does NOT import the app lib directly. The lib tree reads
 * `import.meta.env` (a Vite-only construct) — which is `undefined` in the
 * Netlify function bundle (esbuild/zisi, not Vite), crashing the module at
 * load. The HTTP route runs the same work inside the Astro SSR runtime
 * where env access works; this function is just the scheduler.
 *
 * Returns 200 when the route responds OK, 500 otherwise so Netlify's logs
 * surface failures without retrying (the next tick is 24 hours away).
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/block-nudge-emails";

export const handler = schedule("12 5 * * *", async () => {
  // `URL` is injected by Netlify (the site's primary URL); PUBLIC_APP_URL
  // is the fallback for any environment that doesn't set it. Trailing
  // slash stripped so it reads as a clean origin for the Origin header.
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-block-nudge-emails] no site URL in env (URL / PUBLIC_APP_URL)",
    );
    return { statusCode: 500, body: "Site URL not configured" };
  }

  try {
    const res = await fetch(`${base}${ROUTE}`, {
      method: "POST",
      headers: {
        "x-cron-secret": process.env.CRON_SECRET ?? "",
        // Astro's checkOrigin CSRF guard 403s any non-GET request whose
        // `origin` header doesn't match the site origin — including a
        // header-less server-to-server fetch. This request genuinely is
        // same-origin (function + route ship in one deployment), so say so.
        Origin: base,
      },
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(
        `[scheduled-block-nudge-emails] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-block-nudge-emails] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-block-nudge-emails]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
