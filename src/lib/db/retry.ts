import { sql } from "drizzle-orm";
import { getDb } from "./index";

/**
 * Connection-class DB errors that are safe to retry: they mean the query never
 * executed because a connection couldn't be established, so retrying can't
 * double-apply a write. The dominant one in prod is Railway's `CONNECT_TIMEOUT`
 * tripping our deliberately tight 3s connect budget (see src/lib/db/index.ts) —
 * it surfaces most in the every-5-minutes cron ticks, occasionally clustering
 * into ~30-minute windows during a Railway connectivity blip.
 *
 * Match on message text/codes — postgres-js surfaces these as plain Errors.
 */
export function isTransientDbError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("connect_timeout") ||
    msg.includes("timeout exceeded when trying to connect") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("enotfound") ||
    msg.includes("connection terminated") ||
    msg.includes("connection ended")
  );
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying ONLY on connection-class errors with a short linear
 * backoff. Non-transient errors rethrow immediately (no masking real bugs);
 * after `attempts` the last error rethrows so a genuine outage still surfaces
 * to the caller's catch + telemetry.
 *
 * Only safe to wrap operations that are idempotent OR that we know didn't
 * execute on a connection failure. Prefer wrapping reads / a connection warmup
 * over wrapping a sequence with side effects.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 200;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts || !isTransientDbError(err)) throw err;
      await sleep(baseDelayMs * attempt);
    }
  }
  throw lastErr;
}

/**
 * Warm the pooled DB connection (with retries) before a background job does its
 * real work. The serverless pool is `max: 1`, so once a connection is
 * established it's reused for the rest of the invocation — meaning the job's
 * subsequent queries don't re-trip the connect timeout. The probe is a plain
 * `select 1`, so retrying is always safe. If it still fails after retries, it
 * throws — a genuine DB outage, which the cron's catch surfaces as before.
 */
export async function warmDbConnection(): Promise<void> {
  await withDbRetry(() => getDb().execute(sql`select 1`));
}
