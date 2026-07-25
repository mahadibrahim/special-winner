# Pickup Page Cleanup — Design

**Date:** 2026-07-20
**Status:** Approved for planning
**Surfaces:** `/adult/pickup` (Aspire), `/soccerone/pickup` (SoccerOne)

## Problem

The adult Pickup page carries three rough edges:

1. **A membership pricing band** ("One price, three ways to pay — walk-in $17 / online $15 / member $12"). The business is moving away from memberships, so the band is off-message. It's also misleading: different pickup games can have different prices, and a single global band can't express that.
2. **A bulky, account-gated notify card.** The `PickupAlertSignup` card shows "Sign in to turn on pickup alerts" to signed-out visitors and, even signed-in, requires a verified phone (`phone_required` 409). Forcing account creation to get a text kills conversion. It also looks out of place against the editorial design.
3. **A sessions list that isn't organized around location.** Filtering exists (Date/Sport/Skill/Venue chips) but location — the axis that matters most as the business expands — is buried as one chip among four.

## Goals

- Remove membership framing from the Pickup page; let per-session prices speak for themselves.
- Make the sessions list **location-first**, built to scale past the current two locations.
- Replace the notify card with an **editorial opt-in banner that works without an account** (a "guest route"), capturing verified consent compliantly.

## Non-goals (explicit follow-ups)

- **WhatsApp *delivery* of alerts.** We capture SMS + Email now. WhatsApp 1:1 delivery needs a send-to-phone primitive, an approved WhatsApp template (business-initiated messages require one), and dispatcher routing — a separate project. The notify banner does **not** show a WhatsApp toggle in v1.
- **"New games posted" broadcasts.** The live system alerts on **capacity** ("a game needs players") via `runFillAlertSweep`. A "new sessions were posted near you" broadcast has no dispatcher yet; deferred.
- **Changing the SoccerOne pricing band** (`SoccerOnePricingBand`). Out of scope unless requested — this spec only removes Aspire's `PickupPricingBand`.

---

## Part 1 — Remove the membership pricing band

**Change:** In `src/pages/adult/pickup.astro`, delete the `<PickupPricingBand rate={rate} />` render and the `dropInRateCard` query + `rate` variable that feed only it. `PickupCard` already renders per-session price (`session.sessionRateCents ?? defaultSessionRateCents`, `src/components/landing/pickup-card.tsx:45-49,115`), so varying prices already work with no card change.

**Files:**
- `src/pages/adult/pickup.astro` — remove import, band render, and the now-dead `rate` fetch.
- `src/components/landing/pickup-pricing-band.astro` — **delete.** Confirmed used only by `/adult/pickup`, so it's dead after this change.
- `src/lib/landing/pickup-pricing.ts` — **keep.** `pricingTiers` is also consumed by `src/components/soccerone/SoccerOnePricingBand.astro`.

**Walk-in nuance:** the band was the only place "walk-in costs more than online" appeared. Once gone, the card shows a single price (the online rate). Accepted: walk-in-vs-online can live on the session detail page rather than clutter every card.

---

## Part 2 — Location tabs on the sessions list

Make location the top-level axis of `PickupFinderSection` (`src/components/landing/pickup-finder-section.tsx`).

**Change:**
- Add a **location tab row** above the chip filters, derived from the live sessions' distinct `venueId`/`venueName` (same `buildOptions` machinery already used for chips). Tabs: `All` + one per venue. Selecting a tab filters the session set by venue.
- **Remove Venue from the chip row** (Date/Sport/Skill remain) — it's now the top-level tab axis.
- Tabs scale automatically: two venues today, N tomorrow. If only one venue is present, the tab row auto-hides (same "collapse when trivial" behavior `FilterChips` already has).
- **Warmer per-location empty state.** Today "0 upcoming" renders a bare box. When a location is selected and has nothing scheduled, show an intentional empty state ("No pickup at {venue} in the next two weeks — try All locations or turn on alerts below") that links to the notify banner.

**Interaction with the hero sport tiles:** the existing `useFinderFilter` cross-filter (hero tile → sport) is unchanged; location tabs compose with it.

**Files:**
- `src/components/landing/pickup-finder-section.tsx` — add location tab state + row, drop Venue chip, refine empty state.
- Possibly a small `LocationTabs` presentational component if the row grows non-trivial; otherwise inline.

**Scope note:** this component is shared only by `PickupPageFinder` (Aspire). SoccerOne uses its own `PickupGames` with `facility` tabs already, so this change is Aspire-only.

---

## Part 3 — Guest notify banner

Replace the `PickupAlertSignup` card with an editorial banner that captures a **verified, compliant opt-in without requiring an account**, reusing the sanctioned kiosk-spectator pattern.

### Channel semantics (be honest about what each delivers)

Two channels, two distinct value props — the banner must reflect this, not blur it:

- **SMS → real-time capacity alerts.** Opting in creates a `pickupAlertSubscriptions` row (venue/sport preference) + a `pending` SMS consent + sends an OTP. On OTP verify, the phone opt-in flips to `opted_in` and the **existing** `runFillAlertSweep` dispatcher (`src/lib/dropin/fill-alerts.ts`) starts texting them — **zero dispatcher changes**. The OTP does double duty: proves the number *and* satisfies `sendSms`'s opt-in gate.
- **Email → general updates** ("sessions, leagues and offers", the existing `CONSENT_COPY.email`). Records a `pending` email consent + sends a double-opt-in link. There is **no** per-session capacity email dispatcher, so email is *not* framed as "we'll email you when a game needs players." It's the "also keep me posted" channel.

At least one channel required. **No pre-checked boxes** (compliance doctrine; see memory `zernio-sms-carrier-review-pending`).

### The compliance doctrine (preserved verbatim from the kiosk)

This is the load-bearing part. An unauthenticated surface may capture **intent**, never grant **consent**:

- Every consent row written by the guest path is `status: "pending"` with evidence (`optInSource`, `consentTextShown`, timestamps) stored immediately.
- Only a **verified act** promotes intent → consent: the SMS OTP (`promotePendingPhoneConsents`) for phone, the double-opt-in email click (`promotePendingEmailConsents`) for email.
- A pending tick never clears an existing unsubscribe and never resurrects a number that replied STOP (enforced by the `setWhere: status = 'pending'` guards already in `recordMarketingConsent`).
- Matching an existing account by typed email is a **match, not an authentication** — that's exactly why rows stay `pending`.

### Backend

**New endpoint: `POST /api/dropin/notify`** (unauthenticated, public).

Request:
```
{
  channels: ("sms" | "email")[],   // ≥1
  phone?: string,                   // required iff "sms" ∈ channels
  email?: string,                   // required iff "email" ∈ channels; also required to create the user row (users.email NOT NULL)
  venueId?: string | null,          // capacity-alert preference (sms)
  sport?: string | null,            // capacity-alert preference (sms)
  firstName?: string,               // optional; nice-to-have for the user row
  turnstileToken: string            // required for guests (see Abuse below)
}
```

Behavior (transaction where multiple rows are one fact, mirroring `spectator/sign`):
1. **Bot + rate gate** (see Abuse) before any write or send.
2. Resolve the acting user:
   - If `locals.user` → use it (signed-in path; no Turnstile required).
   - Else → `resolveMarketingUser({ email, firstName, phone })` (resolve-or-create passwordless user). Email required here — enforced by schema refine, same as the kiosk.
3. If `sms` chosen: upsert a `pickupAlertSubscriptions` row for `(userId, venueId, sport)` (reuse the dedupe/reactivate logic from `src/pages/api/dropin/alerts/subscriptions/index.ts`). **Do not** gate this on `phoneReady` — the OTP establishes opt-in; the dispatcher's `sendSms` gate enforces it at send time. (Email-only opt-ins get **no** subscription row — the dispatcher is SMS-only and would never deliver to them.)
4. `recordMarketingConsent({ ..., status: "pending", source: PICKUP_NOTIFY_SOURCE, textShown: CONSENT_COPY[channel] })` per chosen channel.
5. Send confirmations: OTP via `createPhoneVerification({ purposeContext: { source: PICKUP_NOTIFY_SOURCE, organizationId } })` for SMS; double-opt-in email via `mintToken({ kind: "email_consent" })` + `sendEmailConsentConfirmationEmail` for email.
6. Return the same honest `{ awaitingCode, pending, phoneVerificationId? }` contract the kiosk uses. **Nothing in the response means "subscribed"** — it means "confirmation in flight" (`awaitingCode`) or "captured, no confirmation possible right now" (`pending`).

**Refactor: extract `resolveMarketingUser`.** It's currently private in `src/pages/api/kiosk/[locationSlug]/spectator/sign.ts:426`. Move it to a shared module (`src/lib/consents/resolve-marketing-user.ts`) and import it in both the kiosk endpoint and the new notify endpoint. Behavior unchanged.

**New source constant:** add `export const PICKUP_NOTIFY_SOURCE = "pickup_notify";` to `src/lib/consents/marketing.ts` (alongside `KIOSK_SPECTATOR_SOURCE`).

**Generalize `phone-verify/check.ts`.** Today it promotes pending consents only when `ctx.source === KIOSK_SPECTATOR_SOURCE` (`src/pages/api/auth/phone-verify/check.ts:108`). Change to promote when `ctx.source` is any recognized marketing-consent source. Introduce a small allowlist (e.g. `MARKETING_CONSENT_SOURCES = new Set([KIOSK_SPECTATOR_SOURCE, PICKUP_NOTIFY_SOURCE])`) and promote with `source: ctx.source` when it's a member. Keeps the "scoped to rows this flow owns" guarantee while supporting both surfaces.

**Abuse protection (this endpoint sends SMS + email unauthenticated):**
- **Turnstile:** guest submissions must carry a Turnstile token verified via `verifyTurnstile` (`src/lib/auth/turnstile.ts`). Signed-in submissions skip it. The Turnstile widget must be allowlisted for both brand hostnames — SoccerOne domains already need this per memory `turnstile-hostname-allowlist-per-brand-domain`; verify `gosoccerone` is covered.
- **Rate limit:** per-IP `rateLimit(\`dropin-notify:${ip}\`, ...)` mirroring the kiosk sign endpoint. Per-phone OTP throttling already lives in `createPhoneVerification`.

### Frontend

**New component** (replaces `PickupAlertSignup` on both pages): an editorial banner. Suggested `src/components/dropin/PickupNotifyBanner.tsx`.

States:
- **Idle (guest or signed-in):**
  - Headline + one-line value prop ("Get a text when a game needs players — never spam").
  - Location + Sport selects (native `<select>`, per the SoccerOne portal-dropdown constraint documented in the old card).
  - Phone input + "Text me when a game needs players" (SMS consent copy).
  - Optional email input + "Also email me about new sessions & leagues" checkbox (email consent copy).
  - Turnstile widget (guests only).
  - Signed-in: prefill phone/email from `/api/auth/me`; if the user already has a verified SMS opt-in, POST goes straight through (no OTP step).
- **Awaiting code (SMS):** inline OTP entry → `POST /api/auth/phone-verify/check` with `{ verificationId, code }` (same call `SpectatorFlow` makes). On success → confirmed state.
- **Awaiting email confirm:** "Check your inbox and click the link to confirm."
- **Confirmed:** "You're on the list — we'll text you when a game needs players. Manage anytime from My Play."
- **Error:** `ErrorBanner` for hard failures; honest copy for dormant/`pending` channels ("we'll be in touch to confirm").

**Placement — the capture card appears on THREE surfaces; all three swap to the banner:**
- `src/pages/adult/pickup.astro` — swap `<PickupAlertSignup>` for `<PickupNotifyBanner>`. Consider surfacing it from the per-location empty state (Part 2) as well.
- `src/pages/soccerone/pickup.astro` — swap inside the existing `.pas-panel` cream re-pin wrapper (the banner is editorial-cream; the SoccerOne page remaps tokens page-wide, so the local re-pin must stay — see `soccerone-brandtheme-inverts-aspire-tokens`).
- `src/pages/dropin/index.astro` — swap here too (standalone drop-in browse page).

**Keep:** `MyPickupAlerts` (the `/dashboard/play` manage-list variant, `src/pages/dashboard/play.astro`) and the existing `GET`/`DELETE /api/dropin/alerts/subscriptions` endpoints — unchanged. Only the *capture* surface changes. Once all three pages are swapped, the old `PickupAlertSignup` capture export can be deleted (leave `MyPickupAlerts` in the file).

---

## Data flow (guest SMS opt-in, the primary path)

```
Guest fills banner (phone, venue, sport, Turnstile)
  → POST /api/dropin/notify
      → verifyTurnstile + rate limit
      → resolveMarketingUser(email)         [passwordless user, or match existing]
      → upsert pickupAlertSubscriptions(userId, venueId, sport)
      → recordMarketingConsent(sms, status="pending", source="pickup_notify")
      → createPhoneVerification(purposeContext.source="pickup_notify")  → OTP text
      ← { awaitingCode: ["sms"], phoneVerificationId }
  → Banner shows OTP entry
  → POST /api/auth/phone-verify/check { verificationId, code }
      → promotePendingPhoneConsents(source="pickup_notify")   [pending → opted_in]
  → Banner shows confirmed
  ...later...
runFillAlertSweep (cron, existing, unchanged)
  → finds pickupAlertSubscriptions matching a needs-players session
  → sendSms (opt-in gate now passes) → guest gets the text
```

## Files touched (summary)

**Part 1:** `src/pages/adult/pickup.astro`; delete `pickup-pricing-band.astro` (keep `pickup-pricing.ts` — SoccerOne uses it).
**Part 2:** `src/components/landing/pickup-finder-section.tsx`.
**Part 3 backend:** new `src/pages/api/dropin/notify.ts`; new `src/lib/consents/resolve-marketing-user.ts` (extracted); `src/lib/consents/marketing.ts` (+source const, +sources allowlist); `src/pages/api/auth/phone-verify/check.ts` (generalize promotion); `src/pages/api/kiosk/[locationSlug]/spectator/sign.ts` (import the extracted helper).
**Part 3 frontend:** new `src/components/dropin/PickupNotifyBanner.tsx`; swap the capture card on all three surfaces — `src/pages/adult/pickup.astro`, `src/pages/soccerone/pickup.astro`, `src/pages/dropin/index.astro`. Then delete the `PickupAlertSignup` capture export (keep `MyPickupAlerts`).

## Edge cases

- **Email-only opt-in:** no subscription row, no capacity texts — general email consent only. Banner copy must not promise capacity alerts for email.
- **Existing account, typed email:** resolves to that user but consent stays `pending` until verified — a stranger can't hijack. Never clears their existing opt-out.
- **Number that replied STOP:** `pending` tick + valid OTP still does **not** resurrect it (the `status = 'pending'` guard in `promotePendingPhoneConsents`). Correct and intended.
- **SMS channel dormant** (10DLC still under review): OTP send fails → channel reported `pending`, consent + evidence still filed, re-sendable. Banner says "we'll be in touch to confirm."
- **Signed-in, already opted-in phone:** skip OTP, POST creates/reactivates the subscription directly.
- **Duplicate submits:** `pickupAlertSubscriptions` upsert reactivates rather than duplicating; consent rows use the existing `onConflictDoUpdate`.

## Testing

- **API (`tests/api/`):** `POST /api/dropin/notify` — guest SMS path writes pending consent + subscription + OTP; email path writes pending email consent + confirmation; Turnstile rejection; rate limit; email-only creates no subscription; signed-in path uses `locals.user`. Assert the honest response contract (no "subscribed" leakage).
- **Consent promotion:** extend/verify `phone-verify/check` tests so a `pickup_notify` OTP promotes its pending rows and a STOPped row is not resurrected (mirror `tests/api/kiosk/spectator.test.ts`).
- **Unit (`tests/unit/`):** location-tab derivation + Venue-chip removal in `pickup-finder-section` (pure filtering logic).
- **E2E (`tests/e2e/`):** if a pickup spec exists, update it for the removed band + new banner; guard against the post-merge `test-full` gap (memory `hydration-beacon-and-test-full-gap`). New banner island must use `useHydrationBeacon` + `client:load`.

## Rollout / phasing

Build in order so visible cleanup ships even if Part 3 slips:

1. **Part 1 + Part 2** — pure frontend, low risk. Shippable on their own.
2. **Part 3** — guest notify banner + endpoint + consent wiring. Larger, compliance-sensitive; its own review pass.

WhatsApp delivery and "new games posted" broadcasts are tracked as post-v1 follow-ups.
