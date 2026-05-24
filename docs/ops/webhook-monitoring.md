# Webhook Delivery Monitoring

How we know when a Stripe webhook fails — and how the founder finds out.

## What's in code

Two webhook endpoints:

- `POST /api/webhooks/stripe` — primary payment webhook (PaymentIntents, Checkout Sessions, refunds, disputes).
- `POST /api/webhooks/stripe-connect` — Connect-specific (connected-account lifecycle, Connect-account-scoped Checkout Sessions, subscriptions for memberships, payouts).

Both endpoints fire two kinds of PostHog events via `src/lib/observability/webhook-telemetry.ts`:

| Event | When | Properties |
|---|---|---|
| `stripe_webhook_outcome` | Every successful delivery, dedup, or unhandled event | `webhook` (`stripe` / `stripe-connect`), `outcome` (`processed` / `deduped` / `unhandled`), `event_type`, `event_id` |
| `stripe_webhook_exception` | Every caught exception in either endpoint | `webhook`, `event_type` (or `(unknown)` if signature verification failed), `event_id`, `error_message` |

Exceptions are ALSO captured via PostHog's `captureException` so they show up in PostHog's error-tracking UI, but the `stripe_webhook_exception` event is the durable signal — it's what the alert rules below filter on, and it doesn't depend on PostHog's exception-feed product staying enabled.

## Two alert layers (recommended setup)

The two layers cover different failure modes; set up both.

### Layer 1 — Stripe-side notifications

Catches the case where our endpoint returns 4xx/5xx, or doesn't respond at all, on a delivery Stripe tried to send.

**Per-endpoint email alerts are NOT a Stripe feature in 2026.** (Earlier drafts of this doc said they were — they're not, the dashboard reorganized.) What Stripe does provide:

1. **Auto-disable email.** Stripe automatically emails the account owner when an endpoint is disabled after sustained failures (~3 days of retries). This is the floor — it's "you've already lost 3 days of events" notification, not a leading indicator.
2. **Account-level operational emails.** `Settings → Communication preferences` lets you opt into general health/operational notifications. Coarse, account-wide, but the only Stripe-native push channel.
3. **Workbench → Health → Alerts.** In-app surface (not push) showing detected issues including webhook latency. Bookmark for periodic checking — not an alert mechanism.

Founder action:
- Enable everything in **Settings → Communication preferences** so the auto-disable + general health emails land.
- Bookmark **Workbench → Health** for both prod webhook endpoints; glance during weekly ops checks.

Because Stripe doesn't push per-endpoint failure alerts, **the PostHog rules in Layer 2 are the primary near-real-time signal**, not the secondary.

### Layer 2 — PostHog alert on `stripe_webhook_exception`

Catches the case where our endpoint accepted the delivery (Stripe stops retrying), but our handler threw an exception. Stripe doesn't know our internal code blew up — only PostHog does.

Founder action:

1. PostHog → **Insights → New insight → Trend**.
2. Series: event = `stripe_webhook_exception`.
3. Optionally break down by `webhook` to see which endpoint is failing.
4. Save the insight (e.g. "Stripe webhook exceptions, 7d").
5. PostHog → **Alerts → New alert**.
6. Bind it to the insight above.
7. Threshold: `> 0` over the last 1h (or whatever cadence matches founder tolerance).
8. Notification channel: email to founder.

For the "Stripe stopped delivering" failure mode, build a second alert on `stripe_webhook_outcome` filtered by `outcome = processed`: alert when the count drops to 0 over any 2h window that's normally non-zero (e.g. a weekday business hour). This catches the silent-delivery-failure case where Stripe is healthy but somehow not hitting us.

## Recovering from a fired alert

1. Open the failing delivery in the Stripe dashboard's webhook log to see the request body + our response.
2. If our response was a 5xx, Stripe is already retrying — fix the bug, redeploy, and Stripe's retries will replay the event.
3. If our response was a 4xx (Stripe will NOT retry), use the dashboard's **"Resend"** button after the fix is deployed.
4. If our handler returned 200 but threw post-response (rare — the `handleStripeEvent` dispatcher releases the ledger claim on throw so this shouldn't happen for the main endpoint), use the Stripe dashboard's resend.

## Known follow-up (out of scope here)

`src/pages/api/webhooks/stripe-connect.ts` returns **400** on caught internal errors. This tells Stripe NOT to retry, so a transient internal failure permanently drops the event. The main `/api/webhooks/stripe` endpoint returns **500** on the same shape of error, which is correct (transient → Stripe retries).

The fix is a one-line change but it's a webhook semantic change and warrants its own PR + smoke. Tracked alongside the launch readiness sweep; see `docs/launch-readiness-2026-summer.md` engineering hardening section.

## Local testing

PostHog server-side capture works in any environment that has `POSTHOG_PROJECT_TOKEN` set. To verify telemetry locally:

1. Set `POSTHOG_PROJECT_TOKEN` + `POSTHOG_HOST` in `.env`.
2. Trigger a webhook with the Stripe CLI: `stripe listen --forward-to localhost:4321/api/webhooks/stripe`.
3. Send a test event: `stripe trigger payment_intent.succeeded`.
4. Open PostHog → live events. Look for `stripe_webhook_outcome` with the corresponding event id.

To exercise the exception path, point the local webhook at a deliberately failing event (e.g. one whose handler can't find the matching DB row) and confirm `stripe_webhook_exception` appears.

## Don't add custom alerting (yet)

There is an instinct to build a `webhook_failures` table, a cron that scans it, a custom dashboard, and Slack integration. That's all premature for launch volume. The PostHog setup above gives the founder the same signal in ~10 minutes of dashboard work, with no schema migration and no ongoing maintenance. Revisit if launch volume reveals the PostHog UI isn't enough.
