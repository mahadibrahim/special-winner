/**
 * Netlify Scheduled Function: triggers the recurring-rental-block sweeps
 * hourly by POSTing to the /api/cron/rental-block-sweeps route.
 *
 * It deliberately does NOT import the app lib directly. The lib tree reads
 * `import.meta.env` (a Vite-only construct), which is `undefined` in the
 * Netlify function bundle (esbuild/zisi, not Vite), crashing the module at
 * load. The HTTP route runs the same work inside the Astro SSR runtime
 * where env access works; this function is just the scheduler.
 *
 * Hourly rather than every few minutes: a deposit hold is measured in days and
 * the balance ladder in weeks, so nothing here needs a tighter tick.
 *
 * Returns 200 when the route responds OK, 500 otherwise so Netlify's logs
 * surface failures without retrying (the next tick is an hour away).
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/rental-block-sweeps";

export const handler = schedule("31 * * * *", async () => {
  // `URL` is injected by Netlify (the site's primary URL); PUBLIC_APP_URL
  // is the fallback for any environment that doesn't set it. Trailing
  // slash stripped so it reads as a clean origin for the Origin header.
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-rental-block-sweeps] no site URL in env (URL / PUBLIC_APP_URL)",
    );
    return { statusCode: 500, body: "Site URL not configured" };
  }

  try {
    const res = await fetch(`${base}${ROUTE}`, {
      method: "POST",
      headers: {
        "x-cron-secret": process.env.CRON_SECRET ?? "",
        // Astro's checkOrigin CSRF guard 403s any non-GET request whose
        // `origin` header doesn't match the site origin, including a
        // header-less server-to-server fetch. This request genuinely is
        // same-origin (function + route ship in one deployment), so say so.
        Origin: base,
      },
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(
        `[scheduled-rental-block-sweeps] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-rental-block-sweeps] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-rental-block-sweeps]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
