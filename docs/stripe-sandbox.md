# Stripe sandbox (test mode) dev workflow

Use this when you want to drive the registration → payment flow end-to-end
against your local dev server.

## One-time setup

1. Install the Stripe CLI: https://stripe.com/docs/stripe-cli
2. `stripe login` — associates the CLI with your test-mode account.
3. In `.env`, confirm these three vars are set with **test** keys:
   - `STRIPE_SECRET_KEY=sk_test_...`
   - `STRIPE_PUBLISHABLE_KEY=pk_test_...`
   - `STRIPE_WEBHOOK_SECRET=whsec_...` (filled in step 2 of "each session" below)

## Each dev session

Open two terminals.

**Terminal A — dev server:**
```bash
npm run dev
```

**Terminal B — webhook forwarder:**
```bash
npm run stripe:listen
```

The first time you run `stripe:listen` in a session it prints:

```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxx
```

Copy that `whsec_...` value into `.env` as `STRIPE_WEBHOOK_SECRET` and restart
the dev server. The secret is stable for your machine — you only need to do
this once unless you reset your CLI credentials.

## Smoke test

1. Sign in at http://localhost:4321/signin as `parent@test.aspiresports.com` / `TestParent123!`
2. Browse to http://localhost:4321/programs, pick any open season, click Register.
3. Step through Select Player → Sign Waiver → Payment.
4. On the Stripe Checkout page, use test card `4242 4242 4242 4242`, any
   future expiry, any CVC, any ZIP.
5. You'll land back on `/dashboard?payment=success&registration=<id>`.
6. Verify in Drizzle Studio (`npm run db:studio`):
   - `registrations.status = 'confirmed'`
   - `registrations.payment_status = 'paid'` (or `'deposit_paid'` if you picked deposit)
   - One row in `payments` with `status = 'succeeded'` and
     `metadata->>'stripeCheckoutSessionId'` set.

## Test cards

- `4242 4242 4242 4242` — succeeds
- `4000 0000 0000 0002` — declined (generic)
- `4000 0000 0000 9995` — insufficient funds
- Full list: https://stripe.com/docs/testing#cards
