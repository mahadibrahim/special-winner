# Account-Credit Balance — Implementation Plan

Product backlog build #2 (`docs/product/backlog-from-sop-review-2026-07.md` §1). Owner: refunds **default to store credit**, not cash; families see + spend the balance at their next checkout; cash refunds are the director-approved exception via the existing `adminRefund()` Stripe path (kept — this adds a sibling branch).

**v1 scope decisions (owner-agreed, reversible):** no expiry (the `expiresAt` column exists so a policy is a later 1-line change; balance/redemption logic already honors it); auto-apply `min(balance, amountDue)` via a boolean only (server computes the amount → over-apply impossible by construction); customer-request refund-approve dialog defaults to CREDIT (matches policy), admin-direct refund dialog defaults to CASH (the exception path); credit ≥ total reuses the existing `paid_zero` comp path that 100%-off discount codes already use.

## Global Constraints
- **Ledger, never a mutable balance column.** `account_credits` = issuance rows; `account_credit_redemptions` = append-only spend rows referencing a specific issuance id. Balance = `SUM(unexpired issued) − SUM(redeemed)`, computed on every read. Mirrors `discountCodes`/`discountUsages` in `src/lib/db/schema/discounts.ts`.
- **Identity = `registrations.registeredByUserId`** (== the column `payments.userId` keys off) — never `family_member_id`.
- Tenant-scope every credit query by `organization_id`; admin endpoints via `requireOrgAdminAccess` + `requireSameOrgRegistration` exactly like the existing refund endpoints.
- Client never supplies a credit amount — checkout accepts only `applyAccountCredit: boolean`; server computes `min(balance, amountDue)` (this IS the over-apply guard, matching how discount codes send a code string not an amount).
- Redemption allocation walks + locks issuance rows `FOR UPDATE` with an **explicit orderBy** (oldest-expiring, then oldest-issued) — mirrors the discount redemption transaction in `create-checkout-for-registration.ts`.
- Migration: `npm run db:generate` (this branch is off post-#1 main so it gets **0068**; verify with `ls src/lib/db/migrations | tail`), review idempotency (0063/0065 pattern), `db:migrate` to staging (confirmed staging). Never db:push remote.
- `adminRefund({asCredit})` must keep the existing `refundAmountCents > previousAmountPaid` guard.
- Pre-push: catalog:validate (no catalog change here, skip if untouched), db:seed:e2e, test:api, Playwright (touches checkout + admin refund UI), build, tsc 0. Grep tests/e2e for specs on `/admin/registrations` and the payment step.

## Tasks (14; commit per task; TDD)

1. **Schema** — `src/lib/db/schema/account-credits.ts`: `account_credits` (id, organizationId FK, userId FK, amountCents int, currency default usd, reason text, sourceRegistrationId FK nullable, issuedByUserId FK, expiresAt timestamp nullable, timestamps; indexes org+user, sourceRegistration) + `account_credit_redemptions` (id, accountCreditId FK restrict, userId, organizationId, registrationId FK set-null, amountCents, redeemedAt; indexes credit, org+user, registration). Relations + type exports. Add `"credited"` to `refundStatusEnum` in `registrations.ts`. Export from `schema/index.ts`. `db:generate` → 0068 → review idempotent → `db:migrate`.

2. **`getAccountCreditBalanceCents(userId, orgId)`** — `src/lib/payments/account-credit.ts`. SUM(unexpired issued) − SUM(redeemed against unexpired), `Math.max(0, …)`. Unit/API tests: 0 when none; issued amount; excludes expired; org-scoped (no leak). Consider extracting a shared seed helper `tests/utils/registration-context.ts` from `tests/api/webhooks/charge-refunded.test.ts`'s `seedPaidRegistration`.

3. **`redeemAccountCredit({userId, organizationId, registrationId, amountCentsRequested})`** — FIFO allocation in a transaction, `FOR UPDATE`, explicit orderBy (oldest-expiring→oldest-issued), per-row available = amount − already-redeemed, insert redemption rows, return `{redeemedCents}` clamped at available (the over-apply guard). Tests: single-row redeem; cap at balance; FIFO split across rows.

4. **`issueAccountCredit(...)`** — insert an issuance row; throw on non-positive amount. Tests: reflected in balance; rejects 0.

5. **`adminRefund({asCredit:true})`** — sibling branch in `src/lib/payments/admin-refund.ts` (before the Stripe lookup, after the amount guard): call `issueAccountCredit` for `refundAmountCents`; set `refundStatus='credited'`, `amountPaidCents -= refund`, `paymentStatus` (refunded if full, partial_refund if partial, unchanged if 0), `status` refunded if full; return `{ok, registration, stripeRefundId: null, isPartial}`; send the refund email with a new `refundStatus:'credited'` branch (extend `src/lib/email/send.ts` + `refund-notification.tsx`). Tests: issues credit not Stripe (stripeRefundId null, refundStatus credited, balance += amount); partial; still rejects over-amount.

6. **Wire `asCredit` through both refund endpoints** — `src/pages/api/admin/registrations/[id]/refund.ts` + `src/pages/api/admin/refunds/[id].ts` (add `asCredit: z.boolean().optional()` to schemas, pass through, return `isCredit`). Tests: issues credit at 200; cross-tenant 404 even with asCredit.

7. **`GET /api/account-credit/balance`** — authed user + org context → `{balanceCents}`. Tests: 401; number for authed.

8. **Checkout apply** — `src/lib/payments/create-checkout-for-registration.ts`: add `applyAccountCredit?: boolean`; move orgId resolution earlier; after the discount step and before the zero-check, apply `redeemAccountCredit(min(balance, amountDue))`, reduce amountDue, thread `creditAppliedCents` into the single zero-check (reuse the existing `paid_zero` path when amountDue hits 0) and both return shapes. Tests: full-cover→paid_zero no Stripe + credit redeemed; partial→stripe_session with creditAppliedCents; cap at amountDue (over-apply guard); off when flag omitted; regression on existing discount/checkout tests.

9. **`create-checkout` route** — accept + pass `applyAccountCredit`, return `creditAppliedCents`.

10. **Admin UI** — "Issue as store credit" checkbox in `RefundDialog` (`registration-detail.tsx`) + the approve dialog in `refunds-management.tsx`; thread `asCredit`; toast copy flips; approve-dialog default checked, admin-direct default unchecked.

11. **Checkout UI** — balance display + "Apply my $X credit" checkbox in `payment-step.tsx` + `order-summary.tsx` line item + `registration-wizard.tsx` (fetch balance on mount, default applyAccountCredit=true, thread into create-checkout POSTs, fold creditAppliedCents into final value). Skip for guest checkout.

12. **Dashboard balance** — small self-contained `account-credit-balance.tsx` (fetches `/api/account-credit/balance`, renders null if 0) on `/dashboard/family.astro`. (Don't rewire the mock `payments-summary.tsx`.)

13. **(folded into 6)** shared seed helper extraction.

14. **Pre-push checklist** — full run (this touches schema + admin endpoints + registration wizard + payment).

## Key decisions
- Separate append-only redemption table (not a redeemed_at/registration pair on issuance) so one issuance splits across checkouts + FIFO expiry works without a mutable "remaining" column.
- Balance always computed; no cached column.
- Checkout takes a boolean only; server computes the amount (over-apply impossible).
- credit≥total → existing paid_zero comp path.
- `adminRefund` gains an `asCredit` sibling branch; `refundStatus` gains `credited`.

## Open owner questions (building the default; flag at PR)
- **Expiry policy** — building "never" (column reserved). Owner may want 12mo / end-of-next-season.
- Fully-credit-covered registration currently behaves like a 100%-off code (instant confirmed/paid) — confirm the customer messaging is acceptable (a distinct "$0 due to credit" email could be a follow-on).
- Finance/reconciliation: a "credited" registration leaves `payments.status='succeeded'` (money never moved); reconciliation tooling may want a follow-up to distinguish — out of scope, flagged.
