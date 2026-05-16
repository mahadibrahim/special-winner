/**
 * Netlify Scheduled Function — triggers the unverified-user TTL sweep
 * every day at 03:30 UTC by POSTing to the
 * /api/cron/expire-unverified-users route.
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

const ROUTE = "/api/cron/expire-unverified-users";

// Stagger off the midnight self-service-tokens cleanup so concurrent
// large deletes don't pile up on the same Railway connection.
export const handler = schedule("30 3 * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-expire-unverified-users] no site URL in env (URL / PUBLIC_APP_URL)",
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
        `[scheduled-expire-unverified-users] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-expire-unverified-users] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-expire-unverified-users]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
