# Kiosk polish — SoccerOne branding, UX, iPad

**Date:** 2026-07-13
**Branch:** `feat/kiosk-polish`
**Status:** approved, ready for planning

## Goal

Make `/kiosk/[locationSlug]` a credible unattended self-serve station at a
SoccerOne facility: correctly branded, safe to leave running on a mounted iPad
all day, and free of the dead-ends and data leaks it has today.

## Deployment context

- The kiosk runs **SoccerOne only**, on `gosoccerone.com/kiosk/<location>`.
  Brand is already keyed off the request host in middleware, so `data-brand="soccerone"`
  and the token inversion apply for free. This spec *uses* that plumbing; it does not
  build new brand plumbing.
- The iPad is **mounted and unattended** — customers operate it themselves. No staff
  member is holding the device to rescue a stuck flow. That single fact drives the idle
  reset, the camera fallback, and the "never navigate away" rule below.

## Current state (what's wrong)

1. **No brand.** The page passes `navigation={false} footer={false}`, so it renders no
   chrome at all: no wordmark, no attribution. The title says "Aspire Sports" and the
   waiver body names Aspire Sports as the waived entity.
2. **No idle reset.** An abandoned walk-in leaves name, email, phone, and DOB on a public
   screen until the next person clears it.
3. **`WalkInWizard` is a duplicate implementation.** After `walkin/start` returns a token
   it posts to `/api/self-serve/<token>/waiver` and `/photo` — the same endpoints
   `SelfServe` uses. So there are two waiver UIs, two photo UIs, and two payment UIs
   against one backend. Every fix otherwise costs double.
4. **The tab navigates away.** `FindBooking` sends the browser to `/self-serve/<token>`
   and returns via a `sessionStorage` breadcrumb. On a mounted device, leaving the kiosk
   URL is the most likely way to strand it.
5. **Search leaks names.** Two characters lists other customers' names and sessions to
   whoever is standing there.
6. **`search.ts` computes "today" in UTC** while the page computes it in the location's
   timezone. After 8pm Eastern, UTC has rolled over and a 6pm session vanishes from
   "Find my booking" — during the evening block when the kiosk is busiest.
7. **The photo step dead-ends.** `disabled={!file}` with no skip, and `capture="user"`
   bounces to the iOS Camera app, which emits **no error event** when blocked. A denied
   camera permission is an unrecoverable flow on an unattended device.
8. **Missing `catch` blocks.** `submitWaiver` and `submitPhoto` have `try/finally` but no
   `catch` — a network blip yields an unhandled rejection and a silently stuck button.

## Approach

Reskin *and* consolidate. The consolidation is not gold-plating: collapsing the duplicate
wizard onto the single set of self-serve cards is what makes the branding and the iPad
hardening cheap to do once rather than twice. It is also the prerequisite for any future
card-present work (see Out of scope).

### 1. Single page, never navigates

`KioskRoot` (the React island) owns four modes: `landing`, `find`, `walkin`, `finish`.

Both `find` and `walkin` terminate the same way — resolve a **token**, fetch its context
from the existing `/api/self-serve/<token>`, switch to `finish`, and render the existing
`SelfServe` component inline. The URL never leaves `/kiosk/<slug>`.

Consequences:

- `WalkInWizard` loses its waiver, photo, and payment steps. It becomes *pick a session*
  + *who's playing*, then hands off. (~400 lines deleted.)
- `SelfServe` gains an optional `onDone` callback. When the kiosk passes it, "done" resets
  the kiosk in place. When a texted link opens `/self-serve/<token>` standalone, behavior
  is unchanged — `onDone` is absent and the existing path runs.
- `src/lib/kiosk/return-slug.ts` and the `sessionStorage` breadcrumb are deleted.

### 2. Branding

- `KioskMasthead` renders the SoccerOne wordmark using the existing `.so-wordmark`
  treatment. The SoccerOne tokens are already bundled into every page by `BaseLayout`
  (see the chrome-imports note in that file), so this adds no new CSS payload.
- Deliberately **not** `SoccerOneHeader`: it carries nav links and a Sign In. On an
  unattended mounted iPad every link is an escape hatch off the kiosk.
- Masthead: wordmark + facility name + date (already formatted in the location's timezone).
- A persistent footer strip reads **Powered by Aspire Sports**.
- Title becomes `<facility> — SoccerOne`. Favicon is already brand-driven by `BaseLayout`.
- **Nothing hardcodes "SoccerOne" in the React tree.** Brand name reads from
  `getBrandTheme(locals.brandId).displayName`, so an Aspire-hosted kiosk still renders
  correctly.

**Open decision — waiver copy.** The waiver body currently reads *"I waive Aspire Sports
and its partner venues from liability."* On a SoccerOne kiosk that is arguably the wrong
name on a legal document. Default wording for implementation, pending owner sign-off:
*"SoccerOne, operated by Aspire Sports, and its partner venues."* Implement the default;
flag it in the PR for the owner to confirm or replace. Do not treat this as settled.

### 3. Idle reset

A single timer in `KioskRoot`, reset by any `pointerdown` or `keydown`.

| Screen | Behavior |
|---|---|
| `landing` | No timer. Nothing to protect. |
| Any screen holding PII (contact, waiver, photo, payment) | 60s idle → "Still there?" modal with a 20s countdown → hard reset to landing. |
| In-flight payment confirmation (`busy`) | Timer suppressed. Never reset mid-charge. |

Hard reset re-keys the React subtree so all state is destroyed rather than cleared field by
field, and wipes `sessionStorage`.

An abandoned walk-in leaves a DB row and a hold. This needs **no new backend work** — the
existing 2h hold-expiry sweep and auto-refund safety net already cover it.

### 4. Phone-only search

- `search.ts`: drop the name `ilike` branch. Match on phone digits only, minimum 4.
- UI: a large on-screen **numeric keypad**, not a text input. Also avoids the iOS keyboard
  covering half the screen.
- Results render first name + last initial + session time. A last-4 collision therefore
  reveals almost nothing, and the searcher had to know the number to get there.
- Accepted residual risk: a 4-digit space is brute-forceable in principle. Scope is one
  facility, one day, and the payload is a first name and a session time. Not worth a
  rate-limiter at this stage.

### 5. Correctness fixes

- **`dayBoundsInTz(tz, now)`** — new helper in `src/lib/time/`. Returns UTC `{start, end}`
  for the local day in `tz`. Use in `search.ts` **and** `sessions.ts` (same bug). Unit-test
  the evening boundary.
- **Camera** — replace `capture="user"` with a `getUserMedia` live preview + shutter button
  in `PhotoCard` (one place, now used by both flows):
  - Permission denial surfaces as a catchable `NotAllowedError` → honest copy + a visible
    upload fallback. `NotFoundError` handled likewise.
  - Downscale to ~800px and re-encode client-side before upload (matters on gym Wi-Fi).
  - **Stop all media tracks on unmount and on idle reset** — otherwise a mounted iPad sits
    with its camera light on all day.
  - Photo remains **required** (owner's call); the fix is that it can no longer dead-end.
- Add the missing `catch` blocks. Route all errors through `ErrorBanner` with `role="alert"`
  per the repo's UI-feedback conventions.
- **Offline** — `navigator.onLine` plus `online`/`offline` listeners in `KioskRoot` show a
  persistent banner and block the primary CTA with an honest "ask the front desk" message.
  Deliberately *not* offline queueing: a Stripe payment cannot be queued, and a booking
  cannot be queued behind the transactional capacity gate without risking telling someone
  later that their session filled up.

### 6. iPad hardening

- `BaseLayout` gains an optional `head` slot (it has none today) so the kiosk page can add:
  `viewport-fit=cover`, `apple-mobile-web-app-capable`, and status-bar styling.
- Safe-area padding on the masthead and footer strip.
- `touch-action: manipulation` (kills the double-tap zoom delay), `overscroll-behavior: none`
  (rubber-banding must not reveal Safari chrome), `-webkit-text-size-adjust: 100%`,
  `user-select: none` on chrome but **not** on inputs.
- Every input stays ≥16px — below that, iOS zooms the viewport on focus.
- `← Back` becomes a real button; it is a ~20px touch target today.
- Stripe.js already loads lazily at the payment step. Keep it that way.
- **Device lockdown is iOS Guided Access, not code.** Write it up as an operator note.

## Testing

- **Unit:** `dayBoundsInTz` (including the evening rollover), phone-digit extraction.
- **API:** update `tests/api/kiosk/search.test.ts` for phone-only matching; add a
  timezone-boundary case that fails against the current UTC bounds.
- **E2E:** new `tests/e2e/kiosk.spec.ts` — landing → walk-in → waiver → payment, plus the
  idle reset. Uses `waitForHydration` per the repo's Playwright conventions.
  **The full Playwright job only runs post-merge (`test-full`), so run this spec locally
  before merging** — a broken spec will not gate the PR.

## Out of scope (and why)

- **Tap to Pay** — does not exist on iPad. It requires an iPhone XS or later and ships via
  the Terminal *native* iOS/Android SDKs; our kiosk is a web page in Safari.
- **Card-present via a Stripe Terminal reader** (WisePOS E / S700, internet-connected,
  driven server-side off the PaymentIntent) is the only viable path from a web kiosk. It is
  a real project — hardware per facility, Terminal enabled on the account, reader
  provisioning, a connection-token endpoint. Gate it on evidence: *is card entry actually
  costing us walk-ins?* The consolidation in this spec puts payment behind one component,
  which is what makes that integration affordable later.
- **Offline queueing** — see §5. The useful sliver (an honest offline screen) is in scope;
  the expensive remainder is the wrong behavior.
- **Staff unlock PIN** — Guided Access already requires a passcode to exit, for free. The
  distinct feature hiding under that name (in-flow staff overrides: comp a session, mark
  paid-in-cash, force past a stuck step) is real but unproven. Wait until the kiosk is live
  and we know which overrides staff actually reach for.
