/**
 * Shared in-memory rate limiter.
 *
 * Per-key sliding-window counter. The endpoint composes a key (e.g.
 * `signin:${ip}:${email}`) and asks: have we seen `max` hits for this key in
 * the last `windowMs`? If so, deny; otherwise record and allow.
 *
 * IMPORTANT: this is process-local. Netlify Functions run as multiple isolated
 * instances, so an attacker hitting different cold-instance pods can effectively
 * multiply the limit by N. That's still better than nothing for OTP/SMS toll
 * fraud and brute-force defense, and we fail-open if the limiter throws (so a
 * bug here can't take down auth).
 *
 * Post-launch TODO: replace with a Redis/Upstash-backed limiter so the
 * window is shared across function instances.
 */

type Bucket = number[];

const buckets = new Map<string, Bucket>();

// Default clock; tests/callers can pass an alternate via the `now` param.
const defaultNow = () => Date.now();

// Soft cap on bucket map size to prevent unbounded growth from spray attacks.
// We don't LRU-evict precisely — once over cap we drop the oldest-touched keys.
const MAX_KEYS = 50_000;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds the caller should wait before retrying (only set when !allowed). */
  retryAfter?: number;
}

/**
 * Record a hit for `key` and decide whether it's allowed under the
 * (`max` per `windowMs`) policy.
 *
 * Fail-open contract: if anything throws, this returns `{ allowed: true }` so
 * a bug in the limiter never blocks a legitimate signin.
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
  now: () => number = defaultNow,
): RateLimitResult {
  // Test bypass: integration tests sign in dozens of times per run from one IP.
  // Opt-in via env so prod and CI keep the real limit.
  if (process.env.DISABLE_RATE_LIMIT === "1") {
    return { allowed: true };
  }
  try {
    const t = now();
    const cutoff = t - windowMs;

    let arr = buckets.get(key);
    if (!arr) {
      // Soft cap — drop a few entries if the map is huge.
      if (buckets.size >= MAX_KEYS) {
        let dropped = 0;
        for (const k of buckets.keys()) {
          buckets.delete(k);
          if (++dropped >= 1000) break;
        }
      }
      arr = [];
    } else {
      // Drop expired hits.
      arr = arr.filter((ts) => ts > cutoff);
    }

    if (arr.length >= max) {
      buckets.set(key, arr);
      // Caller should wait until the oldest in-window hit ages out.
      const oldest = arr[0] ?? t;
      const retryAfterMs = Math.max(1, oldest + windowMs - t);
      return {
        allowed: false,
        retryAfter: Math.ceil(retryAfterMs / 1000),
      };
    }

    arr.push(t);
    buckets.set(key, arr);
    return { allowed: true };
  } catch (err) {
    // Fail-open. Don't take down auth because of a limiter bug.
    console.error("rateLimit error (fail-open):", err);
    return { allowed: true };
  }
}

/**
 * Build a JSON 429 Response with a Retry-After header. Convenience helper for
 * endpoints that hit a rate-limit; keeps the response shape consistent.
 */
export function rateLimitedResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ error: "rate_limited", retryAfter }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}

/** Test-only — clears all in-memory buckets. Not exported via index. */
export function _resetRateLimitForTests(): void {
  buckets.clear();
}
