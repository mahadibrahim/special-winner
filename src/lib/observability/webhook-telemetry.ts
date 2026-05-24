/**
 * Webhook telemetry — thin wrapper around the PostHog server client for
 * the two Stripe webhook endpoints. Two functions, both fail-soft:
 *
 *   - captureWebhookException(): records an error event PostHog UI can
 *     alert on. Use in every webhook catch block.
 *
 *   - captureWebhookOutcome(): records a structured event for each
 *     processed / deduped / skipped delivery so PostHog dashboards show
 *     traffic — not just failures. Otherwise "no alert" looks the same
 *     as "no webhook traffic at all," and we'd never notice if Stripe
 *     stopped delivering.
 *
 * Both functions are intentionally synchronous-looking even though
 * PostHog's underlying calls are async — telemetry MUST never delay a
 * webhook response or throw out of one. Errors importing or initializing
 * PostHog are swallowed; the worst case is "no telemetry for this
 * delivery," never "webhook 500s."
 *
 * The set of `webhook` values is closed so PostHog queries can filter
 * cleanly without typo drift. Add new webhook surfaces here when they
 * land.
 */

export type WebhookName = "stripe" | "stripe-connect";

export type WebhookOutcome =
  | "processed"
  | "deduped"
  | "skipped"
  | "unhandled";

interface WebhookExceptionContext {
  webhook: WebhookName;
  /** Stripe event type (e.g. "charge.refunded"), if known at the catch site. */
  eventType?: string;
  /** Stripe event id, if signature verification succeeded before the throw. */
  eventId?: string;
  /** Extra fields to attach to the captured event for grouping in PostHog. */
  metadata?: Record<string, unknown>;
}

interface WebhookOutcomeContext {
  webhook: WebhookName;
  outcome: WebhookOutcome;
  eventType: string;
  eventId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Record a webhook handler exception in PostHog. Every webhook catch
 * block should call this. The PostHog UI can then alert on
 * `stripe_webhook_exception` (or filtered by `webhook`) events.
 *
 * Never throws — telemetry failure must not turn into a webhook 500.
 */
export async function captureWebhookException(
  error: unknown,
  ctx: WebhookExceptionContext,
): Promise<void> {
  try {
    const { getPostHogServer } = await import("@/lib/posthog-server");
    const posthog = getPostHogServer();

    // Capture as both an exception (for PostHog's error tracking UI) AND
    // a custom event (so alert rules can be built on it without relying
    // on PostHog's exception-feed UX). The distinct_id is the webhook
    // surface, matching the prior ad-hoc convention.
    posthog.captureException(error, ctx.webhook, {
      $exception_source: ctx.webhook,
      webhook: ctx.webhook,
      event_type: ctx.eventType ?? "(unknown)",
      event_id: ctx.eventId ?? "(unknown)",
      ...ctx.metadata,
    });

    posthog.capture({
      distinctId: ctx.webhook,
      event: "stripe_webhook_exception",
      properties: {
        webhook: ctx.webhook,
        event_type: ctx.eventType ?? "(unknown)",
        event_id: ctx.eventId ?? "(unknown)",
        error_message:
          error instanceof Error ? error.message : String(error),
        ...ctx.metadata,
      },
    });
  } catch {
    // Never let telemetry fail a webhook.
  }
}

/**
 * Record a successful webhook outcome (processed / deduped / skipped /
 * unhandled) so dashboards show traffic, not just failures. Use this
 * AFTER signature verification succeeds — pre-verification calls
 * pollute the dashboard with bot traffic.
 *
 * Never throws.
 */
export async function captureWebhookOutcome(
  ctx: WebhookOutcomeContext,
): Promise<void> {
  try {
    const { getPostHogServer } = await import("@/lib/posthog-server");
    const posthog = getPostHogServer();

    posthog.capture({
      distinctId: ctx.webhook,
      event: "stripe_webhook_outcome",
      properties: {
        webhook: ctx.webhook,
        outcome: ctx.outcome,
        event_type: ctx.eventType,
        event_id: ctx.eventId,
        ...ctx.metadata,
      },
    });
  } catch {
    // Never let telemetry fail a webhook.
  }
}
