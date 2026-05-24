/**
 * Server-side exception telemetry — fail-soft PostHog capture for any
 * server code path that isn't already covered by `webhook-telemetry.ts`
 * (cron jobs, fail-soft `.catch()` sites in payment handlers, future
 * API-route middleware, etc.).
 *
 * Why a second helper:
 *   - The webhook helper has a closed `webhook: "stripe" | "stripe-connect"`
 *     union and emits `stripe_webhook_exception` / `stripe_webhook_outcome`
 *     events that the PR #133 alert rules already bind to. Don't
 *     repurpose those events for non-webhook errors or alert thresholds
 *     break.
 *   - This helper takes a free-form `component` string ("cron/<name>",
 *     "stripe-handler/refund-email", etc.) and emits a generic
 *     `server_exception` event PostHog dashboards can group by
 *     `component` without the closed-set constraint.
 *
 * Both are fail-soft — telemetry MUST never throw out of the caller or
 * delay the response. A swallowed PostHog import or capture is far
 * better than a 500 caused by analytics.
 *
 * Component naming convention (use `/` as the separator):
 *   - `cron/<job-name>` — e.g. `cron/expire-pending-claims`
 *   - `stripe-handler/<purpose>` — e.g. `stripe-handler/refund-email`
 *   - `api/<route-segment>` — e.g. `api/admin/registrations` (when an
 *     API route adopts this)
 *
 * Keep the prefix list shallow; PostHog filters get unwieldy fast.
 */

export interface ServerExceptionContext {
  /**
   * Free-form component label. Use the conventions above so PostHog
   * grouping stays consistent.
   */
  component: string;
  /** Extra structured fields attached to the captured event. */
  metadata?: Record<string, unknown>;
}

/**
 * Record a server-side exception in PostHog. Use in every catch block
 * outside the two Stripe webhook endpoints (those use the webhook
 * helper).
 *
 * Never throws — telemetry failure must not turn into an unhandled
 * error in the calling code.
 */
export async function captureServerException(
  error: unknown,
  ctx: ServerExceptionContext,
): Promise<void> {
  try {
    const { getPostHogServer } = await import("@/lib/posthog-server");
    const posthog = getPostHogServer();

    // Capture as both an exception (for PostHog's error-tracking UI)
    // AND a custom event (so alert rules can be built on it without
    // depending on the exception-feed product staying enabled).
    posthog.captureException(error, ctx.component, {
      $exception_source: ctx.component,
      component: ctx.component,
      ...ctx.metadata,
    });

    posthog.capture({
      distinctId: ctx.component,
      event: "server_exception",
      properties: {
        component: ctx.component,
        error_message:
          error instanceof Error ? error.message : String(error),
        ...ctx.metadata,
      },
    });
  } catch {
    // Never let telemetry fail the caller.
  }
}
