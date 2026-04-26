/**
 * Sentry init scaffolding.
 *
 * No-op when `SENTRY_DSN` is unset (so dev and CI don't fail). The actual
 * SDK init for Astro happens via the `@sentry/astro` integration in
 * `astro.config.mjs`; this module exists for any code that wants to
 * `Sentry.captureException(...)` directly.
 *
 * See https://docs.sentry.io/platforms/javascript/guides/astro/ for the
 * Astro integration semantics. We re-export `@sentry/astro` so consumers
 * have a single import surface and we can swap the SDK without touching
 * call sites.
 */
import * as Sentry from "@sentry/astro";

const dsn = import.meta.env.SENTRY_DSN || (typeof process !== "undefined" ? process.env.SENTRY_DSN : undefined);

let initialized = false;

/**
 * Initialize Sentry programmatically. The Astro integration handles SSR/
 * client init for the framework, so most callers won't need this — but
 * it's available for entrypoints (scripts, workers) that don't go through
 * the Astro integration.
 */
export function initSentry(): void {
  if (initialized) return;
  if (!dsn) {
    // No-op in dev / when DSN unset. Don't log; this is the common case
    // and would just be noise.
    initialized = true;
    return;
  }

  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: import.meta.env.MODE,
    // Don't bother capturing browser-only errors that aren't ours
    // (extension noise, third-party script failures, etc.).
    ignoreErrors: [
      // Browser extensions
      /extension\//i,
      /^chrome:\/\//i,
      /^moz-extension:\/\//i,
      // Common noise
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
    ],
    denyUrls: [
      // Browser extension URLs
      /extensions\//i,
      /^chrome:\/\//i,
      /^moz-extension:\/\//i,
    ],
  });

  initialized = true;
}

export { Sentry };
