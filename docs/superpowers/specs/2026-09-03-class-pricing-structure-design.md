# Class Pricing Structure — Design

**Date:** 2026-09-03
**Status:** Approved by owner (this doc is the write-up of that approved design)

## Problem

The platform supports four ways to buy classes (drop-in, packs, blocks, membership
tiers — the purchase ladder on `/youth/classes`). Presenting parallel systems forces
parents to compare them, which kills conversion. The catalog is currently empty in
prod, so this is a green-field decision about what to *sell*, not a migration.

## Decision

Sell **one system**: monthly membership with frequency tiers, entered through the
existing free trial class. Packs and blocks stay dormant in the catalog (no code
removal — the ladder only renders configured rungs). Technical-training classes
carry a visible premium of about $2/class, framed as extra coaching, not a fee.

Rationale: year-round (ramping) schedule, progressive curriculum that needs the
same kids weekly, fill-rate facility economics where churn is the enemy, and
self-serve cancel already live (#604). Gymnastics/swim-school model, deliberately.

## The offer (per child)

| Product | Price | Effective per-class | Technical band |
|---|---|---|---|
| Free trial | $0 — one per child ever | — | any class |
| Drop-in | $35/class | $35 | $37 |
| **Weekly** — 1 class/week | **$125/mo** | ~$29 | +$9/mo → $134 |
| **Plus** — 2 classes/week | **$199/mo** | ~$23 | +$9 per weekly technical slot → $208 / $217 |
| **Unlimited** | **$240/mo** | ~$18 at 3x/week | included |

- **Annual membership fee: $50/child/year** on any tier — includes the Aspire
  jersey and **10% off camps and clinics**. Rides the first invoice, then each
  anniversary invoice (existing `annual-fee.ts` machinery).
- The per-class discount deepens with commitment ($29 → $23 → ~$18); the
  technical premium follows the same math (+$2/class ≈ +$9 per weekly slot).
- **Unlimited includes technical** — keeps the top tier asterisk-free and makes
  it the obvious choice for serious kids.
- Monthly auto-renew, cancel anytime via the Stripe billing portal.

## Class levels

Two pricing bands only:

- **Standard** — base rate.
- **Technical** — ~$2/class more (smaller groups / extra coaching cost).

The band is a property of the slot template, not the tier. Drop-in pricing picks
it up natively via per-slot `sessionRateCents` ($3500/$3700). Memberships need a
new entitlement (see Engineering).

## Allotment generosity (the "weekly" promise)

Membership allotments are per **calendar month** (`classes_per_month`), but the
offer is sold per week. A 4-class allotment breaks in 5-Tuesday months — a
guaranteed support ticket. **Decision: grant 5/month on Weekly, 10/month on
Plus.** The weekly promise is never broken; the occasional extra class costs a
marginal seat (~$0). Copy still says "1 class a week" / "2 classes a week".

## Parent-facing presentation (`/youth/classes`)

Trial CTA → three tier cards → one supplement line → fee disclosure. Copy shape:

> "First class free. Then from $125/month for a weekly spot — cancel anytime."
> "Technical training classes: +$9/month per weekly class (smaller groups, extra coaching)."
> "$50/year membership fee — includes your Aspire jersey and 10% off camps and clinics."

No system comparisons anywhere. Blocks/packs copy does not appear (rungs absent
from catalog → ladder omits them; `ladderSummarySentence` already handles this).

## Already built — verified 2026-09-03, config only

- **Free trial class** — one per child ever (`payment_method='trial'` in
  `book-child.ts`) + automated convert-nudge email (`trial-convert.ts`).
- **Annual fee** — `annualFeeCents` on tier; first-invoice line item + idempotent
  anniversary invoice items (`annual-fee.ts`).
- **Camp/clinic discount** — `camp_discount_pct` benefit, applied in
  `create-checkout-for-registration.ts` via `computeMemberCampDiscountCents`.
- **Allotments incl. unlimited** — `classes_per_month` / `unlimited_classes`
  handled in `allotment.ts`; booking gate in `book-child.ts`.
- **Per-slot drop-in rates** — `sessionRateCents` on `class_slot_templates`.
- **Self-serve cancel / card update** — Stripe billing portal (#604).
- **Ladder UI fail-soft** — renders only configured rungs (`ladder-model.ts`).

### Catalog entry (admin UI, once engineering lands)

Three tiers: Weekly ($125, `classes_per_month: 5`), Plus ($199,
`classes_per_month: 10`), Unlimited ($240, `unlimited_classes: true`); all with
`camp_discount_pct: 10` and `annualFeeCents: 5000`. Slot templates get
`sessionRateCents` 3500/3700 by band.

## Engineering required

1. **Technical band on slot templates** — new column (e.g. `level` enum
   `standard | technical` or boolean), migration, admin toggle. Today no level
   concept exists on `class_slot_templates`.
2. **Technical entitlement + booking gate** — today any membership books any
   class; a Standard membership booking technical slots would leak the premium.
   Sketch: the +$9 is a Stripe subscription add-on line item with quantity =
   number of weekly technical slots (0–2); the booking path checks entitlement
   quantity vs. the child's distinct technical slots; `unlimited_classes` tiers
   skip the gate.
3. **Jersey size capture at membership signup** — kit-size fields exist on team
   rosters only, not memberships. Either wire size capture into membership
   checkout, or launch fallback: staff collects size at first class.

Details of all three belong to the implementation plan, not this spec.

## Deferred deliberately (post-launch, none block anything)

- Sibling discount (`sibling-discount.ts` exists — enable when families ask).
- Membership pause/freeze.
- Annual-prepay tier pricing (`annualPriceCents` exists, unused here).
- Packs as a product for clinics/one-offs.
- 2x-technical tier evolution as schedule density grows (2027).
