# Webview-Aware Payment Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Meta in-app webviews (FB/IG), the registration payment step renders card-first with zero dead wallet buttons plus an inline "open in browser" prompt; real-browser behavior is unchanged; wallet availability becomes measurable in PostHog.

**Architecture:** The Express Checkout Element the ops spec references was removed in #487 — Apple/Google Pay now ride inside the Payment Element (`embedded-payment.tsx`, `wallets: "auto"`). The adapted mechanism: (1) when `isInAppBrowser()` is true, mount the Payment Element with `wallets: { applePay: "never", googlePay: "never" }` (Stripe's `"auto"` already hides unavailable wallets in real browsers — no other real-browser change); (2) probe wallet availability via `stripe.paymentRequest(...).canMakePayment()` and fire a new `payment_step_wallets_resolved` event (the spec's sanctioned alternative to stamping `registration_step_viewed`); (3) a new compact `InAppEscapePrompt` component reuses the existing detection (`isInAppBrowser`) + breakout (`buildBreakoutUrl`) + `inapp_banner_*` tracking with `variant: "payment_step_inline"`, rendered directly above the card form.

**Tech Stack:** Astro 5 + React 19, @stripe/react-stripe-js (Payment Element, deferred mode), PostHog via `src/lib/analytics/track`, Vitest unit tests, Playwright e2e.

## Global Constraints

- **Scope guard:** real-browser behavior must not change — express/wallet checkout stays exactly as-is outside webviews (`wallets: "auto"`, no inline prompt).
- **Telemetry:** never remove or rename existing events/properties: `guest_checkout_started`, `payment_form_reached`, `payment_completed`, `inapp_banner_shown`, `inapp_banner_clicked`, `registration_step_viewed`. Adding properties is allowed.
- **Copy (verified):** registration state does NOT survive the webview→browser breakout (wizard drafts are localStorage in the webview's storage; the breakout URL carries only the page URL). Therefore the inline prompt must NOT say "your registration is saved". Approved copy: iOS → "Prefer Apple Pay? Open this page in your browser to use it." Android → same with Google Pay.
- **Reuse, don't re-detect:** in-app detection is `isInAppBrowser()` from `src/lib/analytics/in-app-browser.ts`; breakout links come from `buildBreakoutUrl()` in `src/lib/analytics/breakout-link.ts`. No second detection util.
- Keep the existing passive `InAppEscapeBanner` exactly as-is (aside from the tracking helpers gaining an optional `variant` param that defaults to `"passive"`).
- Analytics props are snake_case ids/enums only — never PII.
- Branch: `feat/webview-payment-step` off `origin/main` (the worktree's current branch belongs to open PR #508 — do not build on it).

---

### Task 0: Branch setup

**Files:** none (git only)

- [ ] **Step 1: Create the feature branch off origin/main**

```bash
cd "/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/fix+posthog-errors"
git fetch origin
git checkout -b feat/webview-payment-step origin/main
git branch --show-current   # must print feat/webview-payment-step
```

---

### Task 1: Analytics — `variant` on inapp banner events + `payment_step_wallets_resolved`

**Files:**
- Modify: `src/lib/analytics/events.ts`
- Test: `tests/unit/analytics-events.test.ts`

**Interfaces:**
- Produces: `trackInappBannerShown(p: { seasonId: string; variant?: InappBannerVariant })`, `trackInappBannerClicked(p: { seasonId: string; kind: "ios" | "android"; variant?: InappBannerVariant })` where `InappBannerVariant = "passive" | "payment_step_inline"` (default `"passive"`), and `trackPaymentStepWalletsResolved(p: { seasonId: string; expressWalletsAvailable: string[]; walletsEnabled: boolean })` emitting event `payment_step_wallets_resolved` with props `{ season_id, express_wallets_available, wallets_enabled, in_app_browser }`.

- [ ] **Step 1: Write the failing tests** — append to `tests/unit/analytics-events.test.ts` (inside the existing `describe`):

```ts
  it("inapp_banner_shown defaults variant to passive", () => {
    trackInappBannerShown({ seasonId: "s1" });
    expect(spy).toHaveBeenCalledWith(LEAGUE_EVENTS.inappBannerShown, {
      season_id: "s1",
      variant: "passive",
      in_app_browser: expect.any(Boolean),
    });
  });

  it("inapp_banner_shown/clicked carry the payment_step_inline variant", () => {
    trackInappBannerShown({ seasonId: "s1", variant: "payment_step_inline" });
    expect(spy).toHaveBeenCalledWith(LEAGUE_EVENTS.inappBannerShown, {
      season_id: "s1",
      variant: "payment_step_inline",
      in_app_browser: expect.any(Boolean),
    });
    trackInappBannerClicked({ seasonId: "s1", kind: "ios", variant: "payment_step_inline" });
    expect(spy).toHaveBeenCalledWith(LEAGUE_EVENTS.inappBannerClicked, {
      season_id: "s1",
      kind: "ios",
      variant: "payment_step_inline",
      in_app_browser: expect.any(Boolean),
    });
  });

  it("payment_step_wallets_resolved carries availability + enabled + in_app_browser, no PII", () => {
    trackPaymentStepWalletsResolved({
      seasonId: "s9",
      expressWalletsAvailable: ["apple_pay"],
      walletsEnabled: false,
    });
    expect(spy).toHaveBeenCalledWith("payment_step_wallets_resolved", {
      season_id: "s9",
      express_wallets_available: ["apple_pay"],
      wallets_enabled: false,
      in_app_browser: expect.any(Boolean),
    });
    const props = spy.mock.calls[0][1] ?? {};
    for (const k of Object.keys(props)) expect(/email|name|phone/i.test(k)).toBe(false);
  });
```

Add `trackPaymentStepWalletsResolved` to the import list at the top of the test file.

Also update any existing test asserting the exact `inapp_banner_shown` / `inapp_banner_clicked` call shape (search the file for `inappBannerShown`) to include `variant: "passive"`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/analytics-events.test.ts`
Expected: FAIL — `trackPaymentStepWalletsResolved` not exported; variant prop missing.

- [ ] **Step 3: Implement in `src/lib/analytics/events.ts`**

Add to `LEAGUE_EVENTS`:

```ts
  paymentStepWalletsResolved: "payment_step_wallets_resolved",
```

Replace the two banner helpers and add the new one:

```ts
/** Which placement of the in-app escape UI fired the event — the passive
 *  top-of-wizard banner or the inline prompt on the payment step. */
export type InappBannerVariant = "passive" | "payment_step_inline";

export const trackInappBannerShown = (p: { seasonId: string; variant?: InappBannerVariant }) =>
  track(LEAGUE_EVENTS.inappBannerShown, {
    season_id: p.seasonId,
    variant: p.variant ?? "passive",
    in_app_browser: isInAppBrowser(),
  });
export const trackInappBannerClicked = (p: {
  seasonId: string;
  kind: "ios" | "android";
  variant?: InappBannerVariant;
}) =>
  track(LEAGUE_EVENTS.inappBannerClicked, {
    season_id: p.seasonId,
    kind: p.kind,
    variant: p.variant ?? "passive",
    in_app_browser: isInAppBrowser(),
  });

/** Fired once per mounted payment form when wallet availability settles.
 *  express_wallets_available = what Stripe reports possible in this browser
 *  (canMakePayment probe); wallets_enabled = whether we let the Payment
 *  Element offer them (false in in-app webviews, where they render broken). */
export const trackPaymentStepWalletsResolved = (p: {
  seasonId: string;
  expressWalletsAvailable: string[];
  walletsEnabled: boolean;
}) =>
  track(LEAGUE_EVENTS.paymentStepWalletsResolved, {
    season_id: p.seasonId,
    express_wallets_available: p.expressWalletsAvailable,
    wallets_enabled: p.walletsEnabled,
    in_app_browser: isInAppBrowser(),
  });
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/unit/analytics-events.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/events.ts tests/unit/analytics-events.test.ts
git commit -m "feat(analytics): banner variant + payment_step_wallets_resolved event"
```

---

### Task 2: Pure helper — canMakePayment result → wallet name list

**Files:**
- Create: `src/lib/payments/express-wallets.ts`
- Test: `tests/unit/express-wallets.test.ts`

**Interfaces:**
- Produces: `walletNamesFromCanMakePayment(result: { applePay?: boolean; googlePay?: boolean } | null | undefined): string[]` returning a subset of `["apple_pay", "google_pay"]`.

- [ ] **Step 1: Write the failing test** — `tests/unit/express-wallets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { walletNamesFromCanMakePayment } from "@/lib/payments/express-wallets";

describe("walletNamesFromCanMakePayment", () => {
  it("returns [] for null (no wallet support at all)", () => {
    expect(walletNamesFromCanMakePayment(null)).toEqual([]);
  });
  it("returns [] when both flags are false", () => {
    expect(walletNamesFromCanMakePayment({ applePay: false, googlePay: false })).toEqual([]);
  });
  it("maps applePay to apple_pay", () => {
    expect(walletNamesFromCanMakePayment({ applePay: true, googlePay: false })).toEqual(["apple_pay"]);
  });
  it("maps both wallets in stable order", () => {
    expect(walletNamesFromCanMakePayment({ applePay: true, googlePay: true })).toEqual([
      "apple_pay",
      "google_pay",
    ]);
  });
  it("tolerates undefined", () => {
    expect(walletNamesFromCanMakePayment(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/express-wallets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/lib/payments/express-wallets.ts`:

```ts
/**
 * Maps Stripe's canMakePayment() result to the snake_case wallet names we
 * report as express_wallets_available on payment_step_wallets_resolved.
 * Pure — the Stripe probe itself lives in embedded-payment.tsx.
 */
export function walletNamesFromCanMakePayment(
  result: { applePay?: boolean; googlePay?: boolean } | null | undefined,
): string[] {
  if (!result) return [];
  const names: string[] = [];
  if (result.applePay) names.push("apple_pay");
  if (result.googlePay) names.push("google_pay");
  return names;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/unit/express-wallets.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments/express-wallets.ts tests/unit/express-wallets.test.ts
git commit -m "feat(payments): map canMakePayment result to wallet names"
```

---

### Task 3: EmbeddedPayment — suppress wallets in webviews + availability probe

**Files:**
- Modify: `src/components/registration/embedded-payment.tsx`

**Interfaces:**
- Consumes: `isInAppBrowser()` from `@/lib/analytics/in-app-browser`; `walletNamesFromCanMakePayment` (Task 2); `trackPaymentStepWalletsResolved` (Task 1).
- Produces: no API change — `EmbeddedPaymentProps` unchanged. All EmbeddedPayment surfaces (registration payment step, team deposit, pay-balance, drop-in BookButton) inherit the webview behavior; that is intended.

- [ ] **Step 1: Add imports**

```ts
import { useEffect, useMemo, useRef, useState } from "react";
import { isInAppBrowser } from "@/lib/analytics/in-app-browser";
import { walletNamesFromCanMakePayment } from "@/lib/payments/express-wallets";
import { trackPaymentStepWalletsResolved } from "@/lib/analytics/events";
```

(keep the existing imports; only `useEffect`/`useRef` are new from react)

- [ ] **Step 2: Suppress wallets in webviews.** In `PaymentForm`, before the return, add:

```ts
  // Meta's in-app webviews (FB/IG) render wallet buttons that can't actually
  // open a payment sheet — Apple Pay probes as available but the sheet is
  // blocked, which produced rage-clicks on the 07-26 paid session. Card-only
  // there; real browsers keep Stripe's own "auto" availability logic.
  const [inAppBrowser] = useState(() => isInAppBrowser());
```

and change the `PaymentElement` `wallets` option from the current literal to:

```ts
        options={{
          layout: "accordion",
          wallets: inAppBrowser
            ? { applePay: "never" as const, googlePay: "never" as const }
            : { applePay: "auto" as const, googlePay: "auto" as const },
        }}
```

- [ ] **Step 3: Add the availability probe + telemetry.** In `PaymentForm` (which already has `stripe = useStripe()`, `seasonItem`, `valueCents` in scope), add:

```ts
  // Probe what Stripe could offer in this browser and report it once —
  // "express_wallets_available" is the measurement half of the webview fix
  // (did hiding dead buttons match real availability?). The probe is
  // display-less; the Payment Element independently decides what to render.
  const walletsReported = useRef(false);
  useEffect(() => {
    if (!stripe || walletsReported.current) return;
    walletsReported.current = true;
    stripe
      .paymentRequest({
        country: "US",
        currency: "usd",
        total: { label: "Registration", amount: valueCents },
      })
      .canMakePayment()
      .then((result) => {
        trackPaymentStepWalletsResolved({
          seasonId: seasonItem.id,
          expressWalletsAvailable: walletNamesFromCanMakePayment(result),
          walletsEnabled: !inAppBrowser,
        });
      })
      .catch(() => {
        /* probe failure is not worth breaking checkout over */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe]);
```

- [ ] **Step 4: Verify types + existing unit tests**

Run: `npx tsc --noEmit && npx vitest run tests/unit`
Expected: zero type errors; unit suite green.

- [ ] **Step 5: Commit**

```bash
git add src/components/registration/embedded-payment.tsx
git commit -m "feat(checkout): card-only Payment Element in in-app webviews + wallet availability telemetry"
```

---

### Task 4: Inline escape prompt component

**Files:**
- Create: `src/components/registration/in-app-escape-prompt.tsx`

**Interfaces:**
- Consumes: `isInAppBrowser`, `buildBreakoutUrl` + `BreakoutResult`, `trackInappBannerShown` / `trackInappBannerClicked` with `variant: "payment_step_inline"` (Task 1).
- Produces: `<InAppEscapePrompt seasonId={string} />` — renders `null` outside webviews (and when no breakout URL can be built); `data-testid="inapp-escape-prompt"`.

- [ ] **Step 1: Implement** — `src/components/registration/in-app-escape-prompt.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { ExternalLink } from "lucide-react"
import { isInAppBrowser } from "@/lib/analytics/in-app-browser"
import { buildBreakoutUrl, type BreakoutResult } from "@/lib/analytics/breakout-link"
import { trackInappBannerShown, trackInappBannerClicked } from "@/lib/analytics/events"

interface InAppEscapePromptProps {
  seasonId: string
}

// Compact, non-dismissible escape hatch rendered directly above the card
// fields on the payment step — webviews only. The passive top-of-wizard
// InAppEscapeBanner stays as-is; this inline placement exists because wallet
// buttons are suppressed in webviews (embedded-payment.tsx) and wallet-first
// buyers need the "use your real browser" path at the moment of payment.
// Copy deliberately does NOT claim state is saved: wizard drafts live in the
// webview's localStorage and don't carry into Safari/Chrome.
// SSR-safe: initial render is null; detection runs client-side in an effect.
export function InAppEscapePrompt({ seasonId }: InAppEscapePromptProps) {
  const [breakout, setBreakout] = useState<BreakoutResult>({ kind: "none", url: null })

  useEffect(() => {
    if (typeof window === "undefined") return
    const ua = navigator.userAgent
    if (!isInAppBrowser(ua)) return
    const built = buildBreakoutUrl(window.location.href, ua)
    if (built.kind === "none" || !built.url) return
    setBreakout(built)
    trackInappBannerShown({ seasonId, variant: "payment_step_inline" })
    // Mount-only: detection inputs (UA, href) don't change within a page view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (breakout.kind === "none" || !breakout.url) return null

  const wallet = breakout.kind === "ios" ? "Apple Pay" : "Google Pay"

  return (
    <div
      data-testid="inapp-escape-prompt"
      className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        Prefer {wallet}?{" "}
        <a
          href={breakout.url}
          onClick={() =>
            trackInappBannerClicked({
              seasonId,
              kind: breakout.kind as "ios" | "android",
              variant: "payment_step_inline",
            })
          }
          className="font-medium underline underline-offset-2 hover:text-amber-950"
        >
          Open this page in your browser
        </a>{" "}
        to use it.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/registration/in-app-escape-prompt.tsx
git commit -m "feat(checkout): inline open-in-browser prompt for in-app webviews"
```

---

### Task 5: Render the prompt on the payment step

**Files:**
- Modify: `src/components/registration/payment-step.tsx`

**Interfaces:**
- Consumes: `<InAppEscapePrompt seasonId={...} />` (Task 4); `seasonItem.id` (already a prop, non-null inside the Payment Details block).

- [ ] **Step 1: Import and render.** Add the import:

```tsx
import { InAppEscapePrompt } from "./in-app-escape-prompt"
```

Inside the `{!zeroDue && seasonItem && (...)}` Payment Details block, render the prompt between the heading row (`<div className="flex items-center justify-between mb-4">…</div>`) and `<EmbeddedPayment …/>`:

```tsx
          <InAppEscapePrompt seasonId={seasonItem.id} />
```

- [ ] **Step 2: Verify types + build**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/registration/payment-step.tsx
git commit -m "feat(checkout): show inline escape prompt above card fields on payment step"
```

---

### Task 6: E2E — webview payment step (card-first, prompt, end-to-end payment) + desktop no-prompt guard

**Files:**
- Modify: `tests/e2e/payment-confirmation.spec.ts`

**Interfaces:**
- Consumes: existing `fillTestCard` helper, `ADULT_OPEN_SEASON_SLUG` fixture, `waitForHydration`; `data-testid="inapp-escape-prompt"` (Task 4) and `data-testid="inapp-escape-banner"` (existing passive banner).

Notes for the implementer:
- This spec self-skips on CI (no Stripe keys); it runs locally against a bws dev server: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- payment-confirmation`.
- Read the existing solo guest test in this file first and mirror its navigation exactly (guest flow to the payment step); do not invent new navigation.

- [ ] **Step 1: Desktop guard — assert no inline prompt.** In the existing solo guest payment test, immediately after the payment step is reached (where the card iframe is located), add:

```ts
    // Webview-only UI must not leak into real browsers.
    await expect(page.getByTestId("inapp-escape-prompt")).toHaveCount(0);
```

- [ ] **Step 2: New webview describe block.** Append a describe that reuses the same guest walk under an Instagram iPhone UA:

```ts
test.describe("Payment step in Meta webview (Instagram UA)", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Instagram 300.0.0.0.0",
    viewport: { width: 390, height: 844 },
  });
  test.setTimeout(180_000);

  test("card fields render, inline prompt visible, test card completes", async ({ page }) => {
    // …same navigation as the solo guest test above, to the payment step…

    // Inline escape prompt sits with the card form (webview-only UI).
    const prompt = page.getByTestId("inapp-escape-prompt");
    await expect(prompt).toBeVisible();
    await expect(prompt.getByText(/apple pay/i)).toBeVisible();

    // Card fields are present and payable — wallets suppressed, card-first.
    // (fillTestCard self-skips the run if the Stripe iframe never mounts.)
    // …fillTestCard + Pay + confirmation assertion, mirroring the solo test…
  });
});
```

The `…` sections must be filled with the concrete navigation/assertion code copied from the existing solo test in this file (the implementer copies it verbatim, adjusting nothing but the added prompt assertions). If the existing solo test extracts no reusable helper for the walk, extract one (`walkGuestFlowToPayment(page, seasonId)`) and use it from both tests rather than duplicating 60 lines.

- [ ] **Step 3: Run the spec locally** (requires bws dev server running: `npm run dev:bws` in another shell, seeded via `npm run db:seed:e2e`):

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- payment-confirmation`
Expected: PASS (or documented self-skip if Stripe iframe absent — but with bws keys it must run).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/payment-confirmation.spec.ts
git commit -m "test(e2e): webview payment step — inline prompt + card-first + paid end-to-end"
```

---

### Task 7: Full verification + ship

**Files:** none new

- [ ] **Step 1: Unit suite** — `npx vitest run tests/unit` → all green.
- [ ] **Step 2: Type check** — `npx tsc --noEmit` → zero errors.
- [ ] **Step 3: Build** — `npm run build` → succeeds (catches SSR/prerender mistakes).
- [ ] **Step 4: E2E affected specs** — `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- payment-confirmation register-flow` with the bws dev server up. register-flow's Instagram-UA banner tests must still pass (passive banner untouched).
- [ ] **Step 5: Push + PR** — push `feat/webview-payment-step`, open a PR titled "Webview-aware payment step: card-first in Meta in-app browsers + inline escape prompt", body summarizing: wallet suppression via Payment Element `wallets: never` in webviews (ECE was removed in #487, so `availablepaymentmethodschange` no longer exists — canMakePayment probe is the availability signal), inline prompt with `variant: "payment_step_inline"`, new `payment_step_wallets_resolved` event, real-browser behavior unchanged.
- [ ] **Step 6: CI green, then merge.** A push isn't done until CI is green on origin. Merge ships to prod automatically.
- [ ] **Step 7: Tell the ops session** — append a short "shipped" note (date, PR #, what changed, new event/property names for the funnel-health monitor) to `/Volumes/MahadData/Aspire-Sports/aspire-sports-ops/marketing/current/2026-07-27-webview-payment-step-handoff.md`, and state in the final report that manual FB/IG webview verification (acceptance criteria 1, 2, 5) needs a real device pass.
