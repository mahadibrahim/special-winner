<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Aspire Sports platform. Both client-side (browser) and server-side (API routes) tracking are active. Users are identified by their database UUID on both the client and server after sign-in and sign-up, ensuring session continuity across the full stack. The PostHog JS snippet is injected into all key pages; `posthog-node` is used in API routes via a singleton pattern to avoid multiple client instances.

## Files created

| File | Purpose |
|---|---|
| `src/components/posthog.astro` | Client-side PostHog JS snippet — injected into each page's `<head>` |
| `src/lib/posthog-server.ts` | Server-side `posthog-node` singleton used from all API routes |

## Pages instrumented (PostHog snippet added to `<head>`)

- `src/pages/index.astro` — marketing homepage
- `src/pages/signin.astro`
- `src/pages/signup.astro`
- `src/pages/dashboard/index.astro`
- `src/pages/register/[seasonId].astro`

## Events instrumented

| Event name | Description | File |
|---|---|---|
| `user_signed_up` | New account created via signup endpoint | `src/pages/api/auth/signup.ts` |
| `user_signed_in` | User successfully authenticates | `src/pages/api/auth/signin.ts` |
| `registration_created` | Parent creates a new registration (authenticated) | `src/pages/api/registrations/index.ts` |
| `registration_waitlisted` | Registration added to waitlist (season at capacity) | `src/pages/api/registrations/index.ts` |
| `checkout_initiated` | Stripe Checkout session created for a registration | `src/pages/api/payments/create-checkout.ts` |
| `checkout_zero_amount` | Registration completed with 100% discount (no payment) | `src/pages/api/payments/create-checkout.ts` |
| `guest_checkout_started` | Guest begins the combined registration+checkout flow | `src/pages/api/registrations/guest-checkout.ts` |
| `guest_checkout_completed` | Guest checkout creates user, registration, and Stripe session | `src/pages/api/registrations/guest-checkout.ts` |
| `registration_cancelled` | Parent cancels a registration | `src/pages/api/registrations/[id]/cancel.ts` |
| `family_member_added` | Parent adds a child/family member to their account | `src/pages/api/family-members/index.ts` |
| `sign_in_failed` | Sign-in attempt fails due to invalid credentials | `src/components/auth/signin-form.tsx` |
| `stripe_connect_account_activated` | Connected Stripe account becomes fully active | `src/pages/api/webhooks/stripe-connect.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics:** https://us.posthog.com/project/398219/dashboard/1511993
- **Signup → Registration → Checkout funnel:** https://us.posthog.com/project/398219/insights/wuSDOawK
- **New signups over time:** https://us.posthog.com/project/398219/insights/JFJ6yUy0
- **Registration cancellations (churn):** https://us.posthog.com/project/398219/insights/MeL9c5VU
- **Waitlist vs paid registrations:** https://us.posthog.com/project/398219/insights/l3SiucBC
- **Sign-in failures vs successes:** https://us.posthog.com/project/398219/insights/tSxj9cHV

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-astro-ssr/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
