# Waiver + purchase-ladder follow-ups — issues #593 / #594 / #596

**Date:** 2026-09-01
**Status:** Approved design (owner decisions captured 2026-09-01), pending plan
**Branch:** `waiver-ladder-followups` off main (post-#595)

## Owner decisions (locked)

1. **Desk walk-ins for classes charge the class's own per-session price** — never the
   adult pickup card. A class with no configured rate is not sellable at the desk
   (same `class_rate_not_configured` posture as online).
2. **Quitting a block mid-run converts remaining pinned credits to floating credits**
   — usable on any class until the block's original end date (expiry unchanged). No
   cash refunds.
3. **Comp credits: build now** — admins can grant free class credits with
   attribution, no Stripe payment behind them.

## Scope (issue → items)

### #593 — adult-rate-card exposure + badge

- **A. Kiosk/front-desk class pricing + eligibility.** All walk-up pricing paths
  (`kiosk/[locationSlug]/walkin/start.ts`, `walkin/payment.ts`,
  `self-serve/build-context.ts`, `admin/dropin/sessions/[id]/walk-up.ts`) price
  `kind='class'` sessions from the SESSION's `sessionRateCents` (the class rate the
  cron copies from the template), never `drop_in_rate_card` and never
  `walkUpRateCents`. Null rate → the session is excluded from kiosk listings /
  walk-up 409s `class_rate_not_configured` (mirror the online posture incl. ops
  visibility). Eligibility: a class walk-up requires a CHILD participant
  (familyMemberId set) and passes the same template age gate the online path uses
  (`isAgeIneligible`); adult self walk-ups into class sessions are refused with a
  clear message.
- **B. `GET /api/dropin/sessions/[id]` display quote** for class sessions: return the
  class session rate (member rate only when the CHILD's membership applies — never
  price a kid's class off the parent's adult pickup membership, never `$0` from
  `unlimited_pickup`). Null rate → omit the quote.
- **C. `SessionDetail.tsx` renders a `pack_credit` badge** ("Paid with class credit")
  alongside the existing member/trial treatments.

### #594 — remaining items

- **D. Abandoned-block nudge email.** Daily cron (piggyback the existing materialize
  cron's post-run or a sibling cron per repo convention) finds block families with
  an active credit-backed enrollment, NO valid waiver, and NO booking yet — the
  `skippedNoWaiver` state — and sends ONE nudge email (stamp-then-send, one-shot
  marker on the grant or enrollment row) linking to the choose-slot success flow.
  Respects `MESSAGING_LIVE` gating conventions.
- **E. End-enrollment credit handling (owner decision 2).** Ending a credit-backed
  enrollment (parent `DELETE /api/classes/enrollments/:id`, plus any admin path that
  ends enrollments): in the same transaction, cancel future $0 bookings on that
  template (same scope as the slot-change cancel: `member_allotment` + `pack_credit`
  only, `cancellationReason: user_request`, post-commit waitlist promotion) AND
  un-pin the grant (`slotTemplateId → NULL`) so remaining credits float to any class
  until their unchanged `expiresAt`. Surface copy: the end-enrollment UI states
  "remaining sessions become credits you can use on any class until <expiry>".
- **F. Comp credit grants (owner decision 3).** Schema: add `'comp'` to
  `class_credit_source` (OWN migration, `ADD VALUE IF NOT EXISTS`); make
  `classCreditGrants.stripeCheckoutSessionId` nullable with the unique index rebuilt
  as partial (`WHERE stripe_checkout_session_id IS NOT NULL` — rename-on-change rule
  applies to index migrations); add nullable `grantedByUserId` (FK users, set null).
  Comp rows: `source: 'comp'`, sessions/expiry chosen by the admin (default 90-day
  expiry), `pricePaidCents: 0`, `grantedByUserId` required for comps. Endpoint:
  `POST /api/admin/classes/credits/grant` `{ familyMemberId, sessions, expiresInDays?,
  note? }` (requireOrgAdminAccess + child org pinning; note lands in an ops ping).
  UI: an "Issue credits" action on the admin person page's class section (or the
  family lookup surface the admin already uses — implementer follows the existing
  admin person-page pattern). Redemption: comp credits behave exactly like floating
  pack credits (no engine change — the credits lib treats null `slotTemplateId` as
  floating; verify `source` isn't switched on anywhere that would exclude 'comp').
- **G. FAQ copy:** soften the unconditional "A trial class costs nothing" line to
  member-aware phrasing ("Your first class is a free trial for new families").

### #596 — annual-waiver fast-follows

- **H. Server-side waiver gate on the paid child door.** `POST /api/dropin/bookings`
  (child path): when the child has no valid waiver AND no signature fields arrive →
  `422 { error: "waiver_required" }` BEFORE Stripe. The clients already route that
  code into their waiver panels (W7). Adult path unchanged (sign-before-you-play).
- **I. Record real signatures even when covered.** Unify on the kiosk posture: when
  a covered person nonetheless submits a genuine typed signature (rentals booking,
  registrations v1/create, guest checkout), record it — dated local columns + an
  appended consents row via `recordLiabilityWaiver`. Replaces the discard-and-stamp
  behavior. (The v1 wizard's redundant ask thereby becomes harmless; no wizard UI
  change.)
- **J/K. Batched predicate + staff surfaces.** Add
  `hasValidLiabilityWaiverBatch(people: {familyMemberId}[], organizationId, dbOrTx?)`
  → `Map<familyMemberId, boolean>` inside `src/lib/consents/liability.ts` (same
  three-source rule, set-based queries — one implementation, the singular helper
  delegates to it or shares internals). Adopt it in: the family-members probe (drop
  the 25-person cap's serial fan-out), `/api/classes/summary`, day-view
  `waiversOutstanding` (drop-ins AND rentals — covered-but-unstamped rows no longer
  count as outstanding), and the roll-call chip's data source.
- **L. Adult session-page ask.** Adult (`familyMemberId` null) drop-in bookings:
  resolve the booker's self person (read-only on GET, as W6 established) and treat a
  valid waiver as covered — hide the post-payment WaiverCard, and born-stamp adult
  bookings at creation like W4 did for kiosk minors. Test fixtures use dedicated
  accounts (never the shared parent — its coverage state is load-bearing elsewhere).
- **M. Guardian sentence on the drop-in card.** Child bookings' post-payment/inline
  waiver records (and renders) the guardian assent sentence via
  `waiverAssentSentence("guardian", childName)` instead of the adult-shaped accept
  label.
- **N. 12-month reminder:** file a dated GitHub issue ("2027-09: remove the legacy
  waiver fallback queries + reassess `drop_in_bookings_waiver_signature_idx`") at
  the end of this round.

## Out of scope

Billing portal / self-serve payment-method update (older follow-up, own mini-plan);
waiver-text unification; spectator waivers; pack cash refunds.

## Testing

Per-surface TDD as before. Cross-cutting invariants to re-assert: derived stamps
stay undated; comp credits redeem via the existing floating path; the batched and
singular predicates return identical verdicts (property-style test over seeded
combinations); kiosk class walk-up charges the session rate end-to-end.

## Execution

Same pipeline: Fable orchestrates; Opus for engine/schema/kiosk-pricing/webhook
surfaces, Sonnet for UI/copy/cron; task reviews + final whole-branch review; CI
green gates the PR.
