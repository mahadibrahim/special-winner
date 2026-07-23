# Checkout Redesign Wave 3 (Wallets + In-App Escape + Recapture) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Apple Pay / Google Pay actually available on the registration payment surfaces (domain registration + Express Checkout Element), give Instagram/Facebook webview visitors a one-tap escape to a real browser, and let in-app stayers email themselves a resume link.

**Architecture:** Wallets ride the existing card rail — no server PI changes needed (the deposit path's `payment_method_types: ["card"]` is wallet-compatible; do NOT "fix" it). The blocking gap is that no app domain is registered with Stripe as a payment-method domain (test mode has only `checkout.stripe.com`; live is unverified — CLI auth is test-only). ECE mounts inside the existing `Elements` tree in `embedded-payment.tsx` with its own confirm path sharing the success/tracking logic. The escape banner mounts once in `register-experience.tsx` (covers wizard + team-create), gated on the Wave-1 `isInAppBrowser()`. Recapture clones `sendCaptureIncentiveEmail`'s unauthenticated plain-URL pattern — `createMagicLink` requires a userId, so no magic links for anonymous visitors.

**Tech Stack:** `@stripe/react-stripe-js@4.0.2` / `@stripe/stripe-js@7.9.0` (ExpressCheckoutElement confirmed exported — no bump), Astro `public/` static passthrough, Resend via `src/lib/email/send.ts`, PostHog client events.

**Base:** origin/main 68978860 (Waves 1+2 live).

## Global Constraints

- **Worktree:** `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/checkout-redesign-wallets`, branch `feat/checkout-redesign-wallets`. Absolute paths in every dispatch.
- **Kiosk/self-serve (`PayCard.tsx`, `SelfServe.tsx`, `KioskRoot.tsx`) is OUT OF SCOPE — untouched.** The shared kiosk tablet renders the same PayCard as self-serve; wallets there need the `kioskSlug` gating question answered first. Wave 3 wallets = the three `EmbeddedPayment` surfaces only (wizard payment step, team deposit, dashboard pay-balance).
- **No server PI changes.** `saved-cards.ts` `payment_method_types: ["card"]` stays (wallet-compatible by design). `create-checkout-for-registration` paths stay.
- **ECE never renders when `paymentMethodCategory === "bank"`** (the customer chose bank transfer). It renders for `"card"` and for surfaces that don't pass the prop (team deposit, pay-balance — audited: they pass undefined).
- **Banner renders ONLY when `isInAppBrowser()` is true** — nobody else ever sees it. Dismissible (sessionStorage), copying `email-verification-banner.tsx`'s pattern.
- **Client absolute URLs via `window.location`** — `PUBLIC_APP_URL` is not exposed to client bundles (audited).
- **Recapture email**: exact structural clone of `sendCaptureIncentiveEmail` (no userId, plain URL, `emailLogs` dedupe by `(emailType, recipientEmail)` excluding failed, brand-aware origin via `originForBrand(brand) ?? env.PUBLIC_APP_URL`). MESSAGING_LIVE/MOCK gating inherited by using the shared send path. New endpoint rate-limited 5/min/IP.
- **No PII in analytics props.** New events additive in `LEAGUE_EVENTS`: `inappBannerShown: "inapp_banner_shown"`, `inappBannerClicked: "inapp_banner_clicked"`, `inappRecaptureRequested: "inapp_recapture_requested"`. ECE usage is observable via the existing `trackAddPaymentInfo` methodType + a new `expressCheckoutConfirmed: "express_checkout_confirmed"` fired from the ECE confirm handler with `{ express_payment_type }` (values like "apple_pay"/"google_pay" — enums, not PII).
- **E2E hazard:** `self-serve-payment.spec.ts:106-117` and `registration-guest-flow.spec.ts:130` race `iframe[name^="__privateStripeFrame"]` with `.first()` — ECE adds a second Stripe iframe; keep `.first()`/scoped locators in any spec edits; never submit a real card in specs; wallet sheets are OS-native and untestable in Playwright — coverage bar is "ECE mount doesn't error and PaymentElement still works".
- **CSP is Report-Only** (netlify.toml:81) — wallets work today; note in the PR that a future CSP-enforcement pass must add Apple/Google Pay origins.
- **SMS recapture stays out** (10DLC still pending).
- **Deploy-order runbook (PR body + script header):** the domain-association file must be LIVE on the domain before Stripe can validate a registration. Sequence: merge → deploy → run `scripts/register-payment-method-domain.ts` with the test key (bws) → owner runs `stripe login` (live) in-session → re-run with live key. Until then, wallets simply don't render (graceful).

## File Structure

```
public/.well-known/apple-developer-merchantid-domain-association   # NEW (Stripe's canonical file)
scripts/register-payment-method-domain.ts                          # NEW idempotent registration+validation script
src/components/registration/embedded-payment.tsx                   # + ExpressCheckoutElement + shared confirm-success helper
src/lib/analytics/events.ts                                        # + 4 events
src/components/registration/in-app-escape-banner.tsx               # NEW banner (detect + breakout + recapture form)
src/components/registration/register-experience.tsx                # mounts banner
src/lib/email/templates/inapp-recapture.tsx                        # NEW (clone capture-incentive structure)
src/lib/email/send.ts                                              # + sendInappRecaptureEmail
src/pages/api/public/register-recapture.ts                         # NEW endpoint
tests/unit/breakout-link.test.ts                                   # NEW (pure URL builder)
tests/api/register-recapture.test.ts                               # NEW
tests/e2e/ (grep + targeted assertions)
```

---

### Task 1: Payment-method domain — association file + registration script

**Files:**
- Create: `public/.well-known/apple-developer-merchantid-domain-association`
- Create: `scripts/register-payment-method-domain.ts`

**Interfaces:**
- Produces: the association file served verbatim at `/.well-known/apple-developer-merchantid-domain-association` (Astro `public/` passthrough — no code needed; netlify.toml has no interfering redirects, audited). Script: `tsx scripts/register-payment-method-domain.ts [domain ...]` — defaults `["aspiresportsohio.com", "www.gosoccerone.com"]`; reads `STRIPE_SECRET_KEY` from env; for each domain: list existing `payment_method_domains`, create if absent, call validate, print per-domain `{ domain, apple_pay, google_pay, link }` statuses; idempotent; exits 0 even when validation fails (file not yet deployed) with a clear WARN. Mirror the structure/tone of `scripts/register-telegram-webhook.ts` and `scripts/stripe-preflight.ts`.

- [ ] **Step 1:** Download Stripe's canonical association file: `curl -fsSL https://stripe.com/files/apple-pay/apple-developer-merchantid-domain-association -o public/.well-known/apple-developer-merchantid-domain-association`. Verify it's non-empty ASCII (`file` + `head -c 100`). Commit it as-is — never hand-edit.
- [ ] **Step 2:** Write the script per the Interfaces block (use the `stripe` SDK already in deps — `new Stripe(key)`, `stripe.paymentMethodDomains.list/create/validate`). Header comment carries the deploy-order runbook verbatim from Global Constraints.
- [ ] **Step 3:** Run against the dev origin? NO — validation hits the public domain; locally just run `./scripts/with-bws.sh npx tsx scripts/register-payment-method-domain.ts` and confirm it reaches the WARN path gracefully (file not deployed yet) without creating garbage: it's fine for the create to happen pre-deploy (Stripe keeps the domain in `inactive` until validated — that's the designed flow; the WARN must say "re-run after deploy to validate").
- [ ] **Step 4:** `npx tsc --noEmit` clean (script included via tsconfig? check how other scripts/*.ts are typechecked — match). Commit — `feat(payments): apple pay domain association file + registration script`

### Task 2: Express Checkout Element in `EmbeddedPayment`

**Files:**
- Modify: `src/components/registration/embedded-payment.tsx`
- Modify: `src/lib/analytics/events.ts` (+ `expressCheckoutConfirmed`)
- Test: extend `tests/unit/analytics-events.test.ts`; e2e spot-assert per Global Constraints hazard.

**Interfaces (audited):** `Elements` at :79-93 (clientSecret mode); `PaymentElement` accordion at :164-180; `handlePay` at :118-160 (`elements.submit()` → `confirmPayment(redirect: "if_required")` → success → `trackPurchase` + `onSuccess(paymentIntentId)`); `onSuccess: (paymentIntentId: string) => void` consumed by Wave 2's deposit bridge.

- Produces:
  - Extract the post-confirm result handling from `handlePay` (success → trackPurchase + onSuccess; processing/requires_action → redirect to returnUrl) into one helper used by BOTH paths, e.g. `settleConfirmResult(result): void`. `handlePay` behavior byte-identical.
  - `<ExpressCheckoutElement onConfirm={handleExpressConfirm} options={{...}} />` rendered ABOVE `PaymentElement`, only when `paymentMethodCategory !== "bank"`. `handleExpressConfirm`: `stripe.confirmPayment({ elements, clientSecret? per API shape, confirmParams: { return_url }, redirect: "if_required" })` — follow the react-stripe-js v4 ECE contract exactly (READ `node_modules/@stripe/react-stripe-js/dist/react-stripe.d.ts:355-399` — the onConfirm event provides `{expressPaymentType}` and the element handles collection; confirmPayment still uses the same `elements`). Fire `track(LEAGUE_EVENTS.expressCheckoutConfirmed, { express_payment_type })` before confirm; route the result through `settleConfirmResult`.
  - ECE render errors must never break the card path: wrap in an error boundary or rely on `onLoadError` → hide ECE (log via console only). When no wallet is available, ECE self-hides (its default) — no layout gap (wrap with a container that collapses; check ECE's `onReady({availablePaymentMethods})` and hide the divider when none).
  - A small "or pay with card" divider between ECE and PaymentElement, shown only when ECE reports available methods (mirrors the v2 proposal mockups; plain copy).

- [ ] **Step 1:** events.ts addition + unit test (TDD).
- [ ] **Step 2:** Extract `settleConfirmResult` (mechanical; card path byte-identical — trace it in the report).
- [ ] **Step 3:** ECE mount + confirm handler + divider + availability-driven visibility.
- [ ] **Step 4:** E2E: grep the two iframe-racing specs; confirm `.first()` still holds (no changes expected); add to `registration-guest-flow.spec.ts` (or the closest payment-step spec) one assertion that the PaymentElement iframe still mounts post-ECE (existing race pattern already does this — verify, adjust only if broken). Do not run Playwright here.
- [ ] **Step 5:** tsc clean; unit green. Commit — `feat(payments): express checkout (apple/google pay) on embedded payment surfaces`

### Task 3: In-app escape banner

**Files:**
- Create: `src/components/registration/in-app-escape-banner.tsx`
- Create: `src/lib/analytics/breakout-link.ts` (pure builder) + `tests/unit/breakout-link.test.ts`
- Modify: `src/lib/analytics/events.ts` (+ `inappBannerShown`, `inappBannerClicked`)
- Modify: `src/components/registration/register-experience.tsx` (mount above `modeLine`, both paths — audited: single mount covers wizard + team-create)

**Interfaces:**
- `buildBreakoutUrl(currentHref: string, ua?: string): { kind: "ios" | "android" | "none"; url: string | null }` — iOS (iPhone/iPad UA): `x-safari-` + currentHref (i.e. `x-safari-https://...`); Android: `intent://{host}{path+search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url={encoded href};end`; other/unknown: none. Pure, unit-tested (iOS UA, Android UA, desktop UA, query-string preservation, https only — refuse non-https).
- Banner: renders `null` unless `isInAppBrowser()`. Copy: headline "You're in Instagram's browser" (or generic "an in-app browser" when UA isn't specifically IG), line "Payment works best in Safari or Chrome — Apple Pay and autofill are blocked here.", primary button "Open in browser →" (only when `kind !== "none"`), dismiss X (sessionStorage key `aspire:inapp-banner-dismissed`). Fires `inapp_banner_shown` once on mount, `inapp_banner_clicked { kind }` on tap. Amber/info styling per `email-verification-banner.tsx` pattern; both-brand-safe literal palette (Wave 2 badge precedent).
- Recapture affordance placeholder: the banner exposes a "Can't switch? Email yourself a link" disclosure — Task 4 fills it; in this task render nothing for it (single-responsibility commit).

- [ ] **Step 1:** TDD the pure builder.
- [ ] **Step 2:** Banner + events + mount. SSR-safe (component is inside client islands? register-experience is `client:load` — verify banner only touches navigator/sessionStorage in effects/handlers or behind `typeof window` guards).
- [ ] **Step 3:** E2E: banner must NOT appear in normal Playwright runs (desktop UA) — add a negative assertion to `register-flow.spec.ts` (banner testid absent); optionally a positive spec via `test.use({ userAgent: <IG UA> })` asserting banner + that the step content still renders. Do not run here.
- [ ] **Step 4:** tsc clean; unit green. Commit — `feat(register): in-app browser escape banner with one-tap breakout`

### Task 4: Email recapture

**Files:**
- Create: `src/pages/api/public/register-recapture.ts`
- Create: `src/lib/email/templates/inapp-recapture.tsx`
- Modify: `src/lib/email/send.ts` (+ `sendInappRecaptureEmail`)
- Modify: `src/components/registration/in-app-escape-banner.tsx` (fill the disclosure)
- Modify: `src/lib/analytics/events.ts` (+ `inappRecaptureRequested`)
- Test: `tests/api/register-recapture.test.ts`

**Interfaces:**
- Endpoint: POST `{ seasonId: uuid, email: email }`; rate-limit `register-recapture:ip:` 5/min; resolves the season (404 unknown; also derive brand from request host via `brandFromHost` like guest-checkout); sends via `sendInappRecaptureEmail`; responds `{ sent: true }` even when email_logs dedupe suppressed a resend (no oracle for "we already emailed you"); NEVER discloses whether an account exists.
- `sendInappRecaptureEmail({ email, seasonId, seasonName, brand })`: exact structural clone of `sendCaptureIncentiveEmail` (audited ~send.ts:950-1025): `emailType: "inapp_recapture"`, dedupe `(emailType, recipientEmail)` excluding failed, origin `originForBrand(brand) ?? env.PUBLIC_APP_URL`, link `${origin}/register/${seasonId}?mode=individual&utm_source=inapp_recapture`. Template: subject "Finish signing up for {seasonName}", one CTA button, one sentence "Open this on your phone's browser — Apple Pay and autofill work there." Plain copy, no eyebrow.
- Banner disclosure: email input (`inputMode="email"`, `autoComplete="email"`) + "Send link" → POST → success state "Sent — check your email." Fires `inapp_recapture_requested` (no email in props). Client-side the season id comes from a prop threaded at the register-experience mount (it has `seasonId`).

- [ ] **Step 1:** API test first (401-free public endpoint: happy 200 shape, bad email 400, unknown season 404, dedupe second-call still `{ sent: true }`). MESSAGING mock env makes sends inert — assert via response shape only (email_logs assertions need DB access; follow whatever the capture-incentive tests do, if any — grep first).
- [ ] **Step 2:** Sender + template + endpoint.
- [ ] **Step 3:** Banner integration + event.
- [ ] **Step 4:** tsc clean; unit suite green. Commit — `feat(register): in-app recapture email (finish in your real browser)`

### Task 5: Verification + PR (controller-run)

- [ ] Dev server (bws + flags) + seed; targeted API: register-recapture, payments-create-checkout, registrations-guest-checkout, team suites (regression); full API suite background untruncated.
- [ ] Playwright: register-flow (banner-negative), registration-guest-flow (Stripe iframe race), self-serve-payment (must be untouched), registration-adult-guest.
- [ ] Manual dev-browser check (chrome-devtools/claude-in-chrome): payment step renders ECE container without console errors on localhost (wallets won't show — domain unregistered + localhost — the check is "no crash, card path intact").
- [ ] Build + tsc. Final whole-branch review (most capable model). PR (body: CSP note, kiosk out-of-scope note, deploy-order runbook, SMS-deferred note).
- [ ] Post-merge: run the domain registration (test key), verify file serves 200 on prod, prompt owner for `stripe login` → live registration → validate; PostHog: no new funnel needed (banner/recapture events ride existing dashboards; add a trend for inapp_banner_shown/_clicked + recapture if signal warrants later).

## Self-Review Notes

- Proposal coverage: P2 → Tasks 1-2; P3 → Task 3; P4 → Task 4 (email variant only; SMS 10DLC-blocked); P5 was finished in Waves 1-2.
- Type consistency: `buildBreakoutUrl` defined Task 3 and consumed only there; `settleConfirmResult` internal to embedded-payment.
- Deliberate scope cuts: kiosk/self-serve wallets (needs kioskSlug gating decision); CSP enforcement; staging-domain registration (hostname not in repo — grab from Netlify if wanted later).
