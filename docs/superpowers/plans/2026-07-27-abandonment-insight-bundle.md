# Checkout Abandonment Insight Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the five approved abandonment-insight mechanisms: PostHog watch dashboard (D), persistent feedback tab (E), ops digest brief + warm-abandon worklist (G+F), and exit-reason chips in the wizard (B).

**Architecture:** D and E are pure PostHog configuration via the MCP (no deploy). F and G are ops-repo documentation with SQL validated against the live schema. B is one small web-app feature: a `checkout_abandon_reason` analytics event, a presentational `ExitReasonChips` component, and wizard wiring on the existing `handlePaymentCancel` path — non-blocking, once per wizard session.

**Tech Stack:** PostHog MCP (dashboard/insight/survey tools), Astro 5 + React 19, Vitest, Playwright.

## Global Constraints

- **Never interrupt an active checkout**: no overlays on `/register`; chips render only after the user has already left the payment step, and never block navigation.
- Analytics props are snake_case ids/enums, no PII (`src/lib/analytics/events.ts` catalog pattern).
- Spec: `docs/superpowers/specs/2026-07-27-abandonment-why-design.md`. Branch: `feat/checkout-abandonment-insights` (exists).
- F outreach is manual, one personal note per person, only to emails typed into a checkout.
- Reason enum (exact values): `just_browsing | checking_with_team | price | had_questions | something_broke`.

---

### Task 1: PostHog — "Abandonment watch" dashboard (D)

**Files:** none (PostHog config via MCP)

**Interfaces:**
- Produces: dashboard named `Abandonment watch` whose ID Task 3 links in the ops brief.

- [ ] **Step 1:** Run `info dashboard-create`, `info insight-create`, and the required `schema` drill-downs per MCP rules. Confirm event names exist via `read-data-schema` (`registration_step_viewed`, `payment_completed`, `$rageclick`, `inapp_banner_clicked`; `payment_step_wallets_resolved` and `checkout_abandon_reason` will not exist yet — create those insights anyway, they populate as data arrives).
- [ ] **Step 2:** Create dashboard `Abandonment watch` with description "Weekly checkout-abandonment review — see marketing/current funnel-health brief in the ops repo."
- [ ] **Step 3:** Create and add five insights:
  1. **Registration funnel** — funnel: `registration_step_viewed` (step=`player`) → `registration_step_viewed` (step=`payment`) → `payment_completed`, breakdown `in_app_browser`, last 30 days.
  2. **Rageclicks on /register** — trend: `$rageclick` filtered `$current_url` contains `/register`, weekly, last 90 days.
  3. **Wallet availability** — trend: `payment_step_wallets_resolved`, breakdown `express_wallets_available`, last 30 days.
  4. **Abandon reasons** — trend: `checkout_abandon_reason`, breakdown `reason`, last 30 days.
  5. **Escape-banner clicks by variant** — trend: `inapp_banner_clicked`, breakdown `variant`, last 30 days.
- [ ] **Step 4:** Verify with `dashboard-get`; record the dashboard URL for Task 3.

### Task 2: PostHog — persistent feedback tab (E)

**Files:** none (PostHog config via MCP)

**Interfaces:**
- Produces: launched widget-type survey `Feedback tab (site-wide)`; URL recorded for Task 3.

- [ ] **Step 1:** Run `info survey-create` + schema drills.
- [ ] **Step 2:** Create survey: name `Feedback tab (site-wide)`, type `widget`, appearance `widgetType: "tab"`, `widgetLabel: "Feedback"`, no URL conditions (site-wide), single open question: `What's not working, or what almost stopped you? We read every response.` Description: "Passive edge tab — replaces the archived register-exit popover (019f9f24…). Opens only on tap; never pops."
- [ ] **Step 3:** Launch it (`survey-launch`), verify with `survey-get` that `start_date` is set and type/widget config is correct.

### Task 3: Ops repo — digest brief (G) + warm-abandon worklist (F)

**Files:**
- Modify: `/Volumes/MahadData/Aspire-Sports/aspire-sports-ops/marketing/current/2026-07-funnel-health-posthog.md`

**Interfaces:**
- Consumes: dashboard URL (Task 1), survey URL (Task 2).

- [ ] **Step 1: Finalize the warm-abandon SQL against the real schema.** Verify column names before writing them into the brief:

```bash
grep -n "email\|firstName\|first_name" src/lib/db/schema/users.ts | head
grep -rn "hold" src/lib/db/schema/*.ts | head   # find the walk-in hold table name
```

Draft (adjust names to what the greps show):

```sql
-- 1) Pay-click abandons: row created on Pay (deferred flow, #487), never completed
SELECT r.id, u.email, u.first_name, s.name AS season, r.created_at
FROM registrations r
JOIN users u ON u.id = r.user_id
JOIN seasons s ON s.id = r.season_id
WHERE r.status = 'pending' AND r.payment_status IN ('unpaid','failed')
  AND r.created_at BETWEEN now() - interval '14 days' AND now() - interval '1 hour'
ORDER BY r.created_at DESC;

-- 2) Waitlisted but unpaid
SELECT r.id, u.email, u.first_name, s.name AS season, r.created_at
FROM registrations r JOIN users u ON u.id = r.user_id JOIN seasons s ON s.id = r.season_id
WHERE r.status = 'waitlisted' AND r.payment_status = 'unpaid'
  AND r.created_at > now() - interval '14 days';

-- 3) Expired walk-in holds: adapt to the hold table found by the grep above.
```

- [ ] **Step 2: Smoke-test queries** read-only against staging: `./scripts/with-bws.sh npx tsx -e '...'` or `psql "$DATABASE_URL"` with the SQL from Step 1 (staging DB — safe). Fix column errors now, not in the founder's weekly run.
- [ ] **Step 3: Append the digest section to the funnel-health brief**, containing: cadence (weekly, existing monitor run); output path `marketing/current/abandonment-digest-YYYY-MM-DD.md`; the fixed template below; the validated SQL; the Stripe dashboard link for incomplete PaymentIntents (`https://dashboard.stripe.com/payments?status%5B%5D=incomplete`) for team-captain abandons; links to the Task 1 dashboard, the replay filter recipe (sessions where `registration_step_viewed` step=`payment` fired and `payment_completed` did not, last 7 days), and the Task 2 survey responses.

```markdown
## Weekly abandonment digest (added 2026-07-27)
Template:
### Week of YYYY-MM-DD
- Funnel: player → payment → paid: N% / N% (prev: …)  · webview split: …
- Rageclicks on /register: N (prev: …)
- Abandon reasons (chips): browsing N · team N · price N · questions N · broke N
- Feedback tab: <verbatims or "none">
- Replays watched: N — <one line per anomaly>
- Warm abandons (SQL below): table of name · season · amount · when → founder sends
  one personal 2-line email each. Log who was contacted to avoid repeats.
```

- [ ] **Step 4: Commit** in the ops repo: `git commit -m "marketing: weekly abandonment digest + warm-abandon worklist (F+G)"`.

### Task 4: `checkout_abandon_reason` analytics event (B, part 1)

**Files:**
- Modify: `src/lib/analytics/events.ts`
- Test: `tests/unit/analytics-events.test.ts`

**Interfaces:**
- Produces: `type AbandonReason = "just_browsing" | "checking_with_team" | "price" | "had_questions" | "something_broke"`; `trackCheckoutAbandonReason(p: { reason: AbandonReason; seasonId: string; flow: RegFlow; variant: RegVariant })` emitting `checkout_abandon_reason` with `{ reason, season_id, flow, variant, in_app_browser }`; `LEAGUE_EVENTS.checkoutAbandonReason`.

- [ ] **Step 1: Failing test** (append to the existing describe; add `trackCheckoutAbandonReason` to imports):

```ts
  it("checkout_abandon_reason carries reason + funnel context, no PII", () => {
    trackCheckoutAbandonReason({ reason: "price", seasonId: "s9", flow: "solo", variant: "v2" });
    expect(spy).toHaveBeenCalledWith("checkout_abandon_reason", {
      reason: "price",
      season_id: "s9",
      flow: "solo",
      variant: "v2",
      in_app_browser: expect.any(Boolean),
    });
    expect(LEAGUE_EVENTS.checkoutAbandonReason).toBe("checkout_abandon_reason");
    const props = spy.mock.calls[0][1] ?? {};
    for (const k of Object.keys(props)) expect(/email|name|phone/i.test(k)).toBe(false);
  });
```

- [ ] **Step 2:** `npx vitest run tests/unit/analytics-events.test.ts` → FAIL (not exported).
- [ ] **Step 3: Implement** in `events.ts` — add `checkoutAbandonReason: "checkout_abandon_reason"` to `LEAGUE_EVENTS` and:

```ts
/** One-tap exit-reason chips shown after backing out of the payment step. */
export type AbandonReason =
  | "just_browsing" | "checking_with_team" | "price" | "had_questions" | "something_broke";

export const trackCheckoutAbandonReason = (p: {
  reason: AbandonReason; seasonId: string; flow: RegFlow; variant: RegVariant;
}) =>
  track(LEAGUE_EVENTS.checkoutAbandonReason, {
    reason: p.reason,
    season_id: p.seasonId,
    flow: p.flow,
    variant: p.variant,
    in_app_browser: isInAppBrowser(),
  });
```

- [ ] **Step 4:** `npx vitest run tests/unit/analytics-events.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(analytics): checkout_abandon_reason event`.

### Task 5: ExitReasonChips component (B, part 2)

**Files:**
- Create: `src/components/registration/exit-reason-chips.tsx`
- Test: `tests/unit/exit-reason-chips.test.tsx`

**Interfaces:**
- Consumes: `trackCheckoutAbandonReason`, `AbandonReason` (Task 4); `RegFlow`, `RegVariant` from events.
- Produces: `<ExitReasonChips seasonId flow variant onClose />` — parent controls mounting; component handles tap → track → "Thanks — noted." → auto-close (2.5s), ✕/20s-idle → silent close. `data-testid="exit-reason-chips"`.

- [ ] **Step 1: Failing static-render test** (repo pattern: `renderToStaticMarkup`, see `tests/unit/consent-boxes-unchecked.test.tsx`):

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ExitReasonChips } from "@/components/registration/exit-reason-chips";

describe("ExitReasonChips", () => {
  const html = renderToStaticMarkup(
    <ExitReasonChips seasonId="s1" flow="solo" variant="v2" onClose={() => {}} />,
  );
  it("renders the neutral prompt and all five reasons", () => {
    expect(html).toContain("Anything stop you on payment?");
    for (const label of ["Just browsing", "Checking with my team", "Price", "Had questions", "Something broke"])
      expect(html).toContain(label);
  });
  it("renders a dismiss control and testid", () => {
    expect(html).toContain('data-testid="exit-reason-chips"');
    expect(html).toContain('aria-label="Dismiss"');
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/unit/exit-reason-chips.test.tsx` → FAIL (module not found).
- [ ] **Step 3: Implement:**

```tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import {
  trackCheckoutAbandonReason,
  type AbandonReason,
  type RegFlow,
  type RegVariant,
} from "@/lib/analytics/events"

const REASONS: { value: AbandonReason; label: string }[] = [
  { value: "just_browsing", label: "Just browsing" },
  { value: "checking_with_team", label: "Checking with my team" },
  { value: "price", label: "Price" },
  { value: "had_questions", label: "Had questions" },
  { value: "something_broke", label: "Something broke" },
]

interface ExitReasonChipsProps {
  seasonId: string
  flow: RegFlow
  variant: RegVariant
  onClose: () => void
}

// One-line optional ask rendered by the wizard right after the user backs out
// of the payment step (once per wizard session). Never blocks anything: one
// tap records a reason and thanks them; the ✕ or ~20s of no interaction
// dismisses it silently. Back ≠ abandonment (people back up to fix typos), so
// the copy stays neutral — analysis separates backed-and-bought later.
export function ExitReasonChips({ seasonId, flow, variant, onClose }: ExitReasonChipsProps) {
  const [thanked, setThanked] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    closeTimer.current = setTimeout(onClose, thanked ? 2_500 : 20_000)
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current) }
    // Rearm on state flip only — onClose is stable enough for a dismiss timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thanked])

  function handlePick(reason: AbandonReason) {
    if (thanked) return
    trackCheckoutAbandonReason({ reason, seasonId, flow, variant })
    setThanked(true)
  }

  return (
    <div
      data-testid="exit-reason-chips"
      className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-cream-2 p-3 text-sm"
    >
      <div className="flex-1 min-w-0">
        {thanked ? (
          <p className="text-ink">Thanks — noted.</p>
        ) : (
          <>
            <p className="text-ink-2">
              Anything stop you on payment? <span className="text-ink-faint">(optional, one tap)</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => handlePick(r.value)}
                  className="rounded-full border border-border bg-paper px-3 py-1 text-xs text-ink hover:border-ink-faint transition-colors"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="flex-shrink-0 p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-cream-2 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
```

- [ ] **Step 4:** `npx vitest run tests/unit/exit-reason-chips.test.tsx` → PASS.
- [ ] **Step 5: Commit** `feat(checkout): exit-reason chips component`.

### Task 6: Wizard wiring + e2e + ship (B, part 3)

**Files:**
- Modify: `src/components/registration/registration-wizard.tsx` (handlePaymentCancel ~line 1014; step-content render area ~line 1830)
- Test: `tests/e2e/payment-confirmation.spec.ts`

**Interfaces:**
- Consumes: `ExitReasonChips` (Task 5); wizard's existing `season`, `regFlow`, `flowVariant`, `stepName`, `registrationComplete` state.

- [ ] **Step 1: Wire state.** Near the other wizard state hooks add:

```tsx
  // Exit-reason chips: offered once per wizard session, right after the first
  // Back out of the payment step. Parent-controlled so navigation is never
  // gated on the ask.
  const [showExitChips, setShowExitChips] = useState(false)
  const exitChipsOfferedRef = useRef(false)
```

In `handlePaymentCancel`, before the step decrement:

```tsx
    if (!exitChipsOfferedRef.current) {
      exitChipsOfferedRef.current = true
      setShowExitChips(true)
    }
```

- [ ] **Step 2: Render.** At the top of the step-content area (immediately before the `{stepName === "player" && ...}` blocks), render:

```tsx
        {showExitChips && stepName !== "payment" && !registrationComplete && season && (
          <ExitReasonChips
            seasonId={season.id}
            flow={regFlow}
            variant={flowVariant}
            onClose={() => setShowExitChips(false)}
          />
        )}
```

Add the import: `import { ExitReasonChips } from "./exit-reason-chips"`.

- [ ] **Step 3: e2e.** In `tests/e2e/payment-confirmation.spec.ts` (desktop describe), add:

```ts
  test("backing out of payment offers exit-reason chips; tapping one thanks and hides", async ({
    page,
  }) => {
    const mounted = await walkGuestToPaymentStep(page, seasonId, "exit-chips");
    test.skip(!mounted, "Stripe not configured in this environment (no payment iframe)");

    await page.getByRole("button", { name: /^back$/i }).click();
    const chips = page.getByTestId("exit-reason-chips");
    await expect(chips).toBeVisible();
    await chips.getByRole("button", { name: "Price" }).click();
    await expect(chips.getByText(/thanks — noted/i)).toBeVisible();
    await expect(chips).toBeHidden({ timeout: 5_000 });
  });
```

- [ ] **Step 4: Verify locally.** `npx tsc --noEmit`; `npx vitest run tests/unit`; with the bws dev server up: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test payment-confirmation register-flow`; `./scripts/with-bws.sh npm run build`.
- [ ] **Step 5: Commit** `feat(checkout): offer exit-reason chips after backing out of payment`, push, open PR (body: spec link, event contract, non-blocking guarantees), wait for CI green, merge. Post-merge: confirm `checkout_abandon_reason` appears in PostHog after prod traffic (may take days at current volume).
