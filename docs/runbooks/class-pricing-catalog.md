# Class pricing catalog — data entry runbook

Do these in the admin UI once the technical-band release is live.

## Membership tiers (Admin → Memberships → Tiers)
| Name | Monthly | Benefits | Annual fee | Technical supplement |
|---|---|---|---|---|
| Weekly | $125 | classes_per_month: 5, camp_discount_pct: 10 | $50 | $9 |
| Plus | $199 | classes_per_month: 10, camp_discount_pct: 10 | $50 | $9 |
| Unlimited | $240 | unlimited_classes: true, camp_discount_pct: 10 | $50 | (leave empty — included) |

Allotments are 5/10 on purpose (not 4/8): months with five Tuesdays must
never block a weekly kid. Copy still says "1 class a week" / "2 a week".

## Slot templates (Admin → Classes → Templates)
- Standard classes: session rate $35, technical checkbox OFF
- Technical classes: session rate $37, technical checkbox ON

## Do NOT create
- Class packs, class blocks — deliberately dormant (spec: one system only).

## Verify after entry
1. /youth/classes shows: trial CTA, three tier cards, the technical
   supplement line, the $50/yr fee copy. No packs/blocks rungs.
2. Test-card subscribe on Weekly → choose a technical slot → confirm dialog
   shows +$9/month → Stripe subscription shows the supplement line item.
3. Cancel the test subscription in the billing portal.
