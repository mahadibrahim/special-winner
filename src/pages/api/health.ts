/**
 * GET /api/health — liveness + readiness probe for external uptime monitors.
 *
 * Returns 200 when the function runtime is up AND the database answers a cheap
 * `SELECT 1`; returns 503 when the DB is unreachable/unconfigured. An external
 * monitor (Better Stack, UptimeRobot, etc.) pointed here detects both a total
 * runtime outage (request never completes / non-200) and a DB-connectivity
 * outage (503) — the latter being the most common real failure mode.
 *
 * Public + unauthenticated by design: monitors hit it without credentials, and
 * it exposes no sensitive data. The raw DB error is logged server-side only,
 * never returned in the response body.
 *
 * Middleware note: org/brand resolution in middleware fails soft (Promise.
 * allSettled) and auth swallows DB errors, and `/api/**` skips redirect logic —
 * so this handler still runs and reports cleanly even when the DB is down.
 */
import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Never let a CDN/monitor cache a stale health verdict.
      "Cache-Control": "no-store, max-age=0",
    },
  });

/**
 * Ping the database with a bounded timeout. `connect_timeout` (3s) covers a
 * dead host, but a connection that hangs mid-query would otherwise stall the
 * probe — so we race the query against an explicit timeout.
 */
async function pingDb(timeoutMs = 2500): Promise<{ ok: boolean; error?: string }> {
  if (!db) return { ok: false, error: "DATABASE_URL not configured" };
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db ping timeout")), timeoutMs),
      ),
    ]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const GET: APIRoute = async () => {
  const startedAt = Date.now();
  const dbResult = await pingDb();

  if (!dbResult.ok) {
    // Log the detail server-side (Netlify Function logs) without leaking it to
    // an unauthenticated caller.
    console.error("[health] db check failed:", dbResult.error);
  }

  return json(
    {
      status: dbResult.ok ? "ok" : "error",
      db: dbResult.ok ? "up" : "down",
      durationMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    },
    dbResult.ok ? 200 : 503,
  );
};
