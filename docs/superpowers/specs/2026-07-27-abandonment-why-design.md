# Checkout Abandonment — Getting the "Why" (Design)

**Date:** 2026-07-27 · **Approved by:** founder (chat, this date)
**Context:** The "Register page exit – why did you leave?" PostHog popover survey (id
`019f9f24-f55e-0000-7b7c-7dc5f3f786f9`) interrupted active checkouts (it fired on the 07-26 paying
buyer twice, 26s before their rageclick) and collected 0 responses from 6 impressions. It is now
stopped AND archived. This design replaces it with five layered mechanisms.

## Goals

- Learn **why** visitors who reach checkout leave without paying (motivation, not just behavior).
- Keep observing behavioral signals continuously without relying on anyone remembering to look.
- Never interrupt an active checkout. No overlays on `/register` flows, ever.
- Recover high-intent abandoners where we already have consented contact info (manual first;
  automation later = option C, out of scope here).

## Non-goals

- Option C (automated recovery email with reason buttons) — deferred until F proves the message.
- Catching tab-close abandons in the moment — impossible without interruption; covered
  after-the-fact by D (replays) and F (worklist).
- Any bulk or repeated outreach. F is one personal note per person, manually sent.

## Components

### B — Exit-reason chips (web-app feature; the only code change)

**Trigger:** the user clicks **Back** from the payment step (the `onPaymentCancel` path in the
registration wizard). Navigation proceeds exactly as today — the chips never block or delay it.

**UI:** on the step the user lands on, render a slim dismissible row above the step content:

> Anything stop you on payment? `[Just browsing]` `[Checking with my team]` `[Price]`
> `[Had questions]` `[Something broke]` · ✕

- One tap fires the event, swaps the row for a brief "Thanks — noted." confirmation, then hides.
- ✕ or ~20s of no interaction dismisses it silently (no event).
- Shown at most once per wizard session (not once per Back click).
- Renders in both v1 and v2 solo flows; not in the team-reserve flow (its single-screen shape has
  no equivalent Back-from-payment moment).

**Event:** `checkout_abandon_reason`
- `reason`: `just_browsing | checking_with_team | price | had_questions | something_broke`
- `season_id`, `in_app_browser` (via `isInAppBrowser()`), `flow`, `variant` (same values as
  `registration_step_viewed`)
- No PII. Added to the typed catalog in `src/lib/analytics/events.ts` with unit tests, same
  pattern as `payment_step_wallets_resolved`.

**Honesty guard:** Back ≠ abandonment (some users go back to fix a typo and then pay). The copy
stays neutral, and analysis joins on the session: the D dashboard splits reason counts by whether
`payment_completed` later fired in the same session ("backed & bought" vs "backed & left").

### D — Abandonment watch (PostHog config, built via MCP)

One dashboard, name **"Abandonment watch"**, containing:
1. Registration funnel: `registration_step_viewed` step=`player` → step=`payment` →
   `payment_completed`, broken down by `in_app_browser`, last 30 days.
2. Trend: `$rageclick` on `/register` pages.
3. Breakdown: `payment_step_wallets_resolved` by `express_wallets_available`.
4. Breakdown: `checkout_abandon_reason` by `reason` (populated once B ships), split by
   session-completed vs not.
5. Trend: `inapp_banner_clicked` by `variant` (`passive` vs `payment_step_inline`).

Plus a **saved replay filter**: sessions with `registration_step_viewed` step=`payment` and no
`payment_completed`, last 7 days — the weekly watch list.

### E — Persistent feedback tab (PostHog config)

New PostHog survey, **widget** type (edge tab labeled "Feedback"), sitewide including `/register`
(it is passive — opens only when tapped; never pops, never overlays). One open question:

> What's not working, or what almost stopped you? We read every response.

No targeting gymnastics, no wait periods. It exists to catch motivated voices at zero friction.

### F — Warm-abandon worklist (definition + read-only query; founder works it by hand)

**Who counts (all have consented contact info typed into a checkout):**
1. Registrations in a non-final state with an email — created at Pay-click, payment never
   succeeded (statuses to confirm against the schema during implementation; the deferred-intent
   flow from #487 creates the row on Pay).
2. Stripe PaymentIntents in `requires_payment_method` / `requires_confirmation` older than 1h
   with a receipt email — catches team captains, whose account/team rows are only created on
   success.
3. Expired walk-in payment holds.
4. Waitlisted-but-unpaid registrations.

**Mechanism:** a documented read-only SQL/query set in the ops brief (G), run through the existing
Railway read path by the weekly digest ritual. Output: name, season, amount, when — max ~a dozen
rows/week at current volume. The founder sends a personal two-line email per row. No automation,
no templates beyond a suggested opener, no repeat contact.

### G — Weekly abandonment digest (ops repo doc)

Extend the funnel-health monitor brief (`marketing/current/2026-07-funnel-health-posthog.md` in
the ops repo) with a weekly digest section producing a dated file in `marketing/current/`:
1. Abandonment-watch dashboard numbers (funnel conversion, rageclicks, reasons) vs prior week.
2. The saved replay filter's list with 1-line notes on anything anomalous.
3. F's warm-abandon table.
4. Feedback-tab responses (E), verbatim.

Fixed template so weeks are comparable. Run by the ops session on its existing cadence.

## Sequencing

1. D + E: PostHog config, immediately (no code, no deploy).
2. G + F definition: ops-repo doc edits, same day (F's SQL validated against the live schema).
3. B: web-app branch → tests → PR → CI → merge (half-day).

## Acceptance

- No survey, tab, or chip row ever overlays or blocks an active `/register` checkout.
- `checkout_abandon_reason` events visible in PostHog with all listed props after B ships.
- Dashboard + saved replay filter exist and are linked in the ops brief.
- Feedback tab visible sitewide, opens on tap only.
- Ops brief contains the digest template and the warm-abandon queries with a tested run path.
