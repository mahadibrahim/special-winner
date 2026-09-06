# Winter Team Entry Fixes (T1–T5 + refundable deposit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the winter team flow match the youth model the owner defined — clubs enter teams (never as players), parents pay for their kids, and the club rep's $200 deposit is a refundable hold — plus the audit's funnel/copy/mobile quick wins.

**Architecture:** PR C (`feat/team-deposit-refund`, off origin/main) is the money path: youth-gate the captain auto-registration, introduce roster-collected accounting that excludes the deposit by construction, auto-refund on full collection, deposit-first shortfall at the deadline, one migration for refund-tracking columns, copy/email updates. PR D (`feat/team-funnel-quick-wins`, stacked on C) is instrumentation (T2), the two-dates banner (T3), `navigator.share` (T4), the club-card link (T5).

**Tech Stack:** as established. ONE migration (refund columns) — `db:generate`, commit the SQL.

**Spec — owner decisions (2026-09-06, in-chat):**
1. Youth captains are **never registered as players** (adult seasons keep captain-plays).
2. Refundable deposit, **youth team seasons only**: parents split the FULL (discounted) team fee; the $200 auto-refunds via **Stripe refund to the original card** the moment roster collections reach the fee; at the payment deadline a shortfall is absorbed **deposit-first**, remainder charged to the captain's card on file (existing backstop).
3. Money-path map: the Explore report in this session (key hazards: `teamMoneyReceivedCents` counts the deposit; two `ensureCaptainRegistration` call sites; `charge.refunded` skips team-level payments; no refund columns exist; split math is `fee − 200` in three places).

## Global Constraints

- **Youth predicate** (money-grade): `isYouthTeamSeason` = resolved `minAge` (season.minAge ?? ageGroup.minAge) is a number `< 18`. **Unknown (null ageGroup and null minAge) = ADULT** — fail toward the existing behavior; no surprise refunds on legacy inventory. One shared helper, used by every branch in this plan.
- **Adult team seasons are byte-for-byte unchanged**: captain auto-registration, `fee − 200` split, captain share credit, no refund. Every new behavior branches on the predicate.
- **Roster-collected accounting** (new, the anti-hazard): `teamRosterCollectedCents` = member `registrations.amountPaidCents` + team-level succeeded payments **excluding the deposit row** (exclude `payments.id = team.depositPaymentId`, fallback `paymentType = 'deposit'`) and netting `paymentType='refund'` rows. The refund trigger and the youth backstop math consume ONLY this helper; `teamMoneyReceivedCents` remains for display/admin surfaces untouched.
- **Refund state machine** on `team_registrations` (new columns): `deposit_refund_status` varchar(20) default `'none'` (`none | refunded | partially_refunded | forfeited`), `deposit_refund_id` varchar(255), `deposit_refunded_cents` integer, `deposit_refunded_at` timestamptz. Transitions happen exactly once, guarded by a conditional UPDATE (`WHERE deposit_refund_status = 'none'`) BEFORE calling Stripe — stamp-then-act, the repo's crash-safe convention.
- **Refund rules** (youth only): full collection (`rosterCollected >= teamFeeCents`) → refund `depositCents`, status `refunded`. At the deadline with `0 < shortfall < depositCents` → charge nothing, refund `depositCents − shortfall`, status `partially_refunded`. `shortfall >= depositCents` → no refund (status `forfeited`), card charged `shortfall − depositCents`. Stripe idempotency key: `` `${depositPaymentIntentId}:deposit-refund` `` (single refund per team; amount varies by branch but the status guard makes a second attempt impossible).
- **Bookkeeping is self-contained**: the refund flow writes its own `payments` row (`paymentType: "refund"`, `teamRegistrationId` set, `registrationId: null`, `refundReason: "team_deposit_release"`) — do NOT touch `handle-charge-refunded.ts` (its team-skip is now correct-by-design; add a comment there saying so).
- **Split math** (youth only): even-split and client defaults use the FULL `teamFeeCents` (3 sites: `invite.ts:158-163`, `team-create.tsx:552`, `:591-593`). Discount `maxOff` guard stays `fee − 200` (prevents fee < deposit degeneracy; noted follow-up).
- Analytics: intent-named, snake_case, ids/enums only, no PII. Emails via the team-flow inline-builder house style.
- NEVER git stash (shared stack). API tests through the bws wrapper, foreground; unique fixtures per run. A dev server will be running at localhost:4321.

## File Structure

PR C — Create: `src/lib/registrations/team-season-kind.ts` (youth predicate), `src/lib/payments/team-deposit-refund.ts` (trigger + refund executor), migration `src/lib/db/migrations/NNNN_*.sql`, `tests/unit/payments/team-deposit-refund.test.ts`, `tests/api/team-registrations-refund.test.ts`. Modify: `src/lib/db/schema/team-registrations.ts`, `src/lib/registrations/finalize-team-deposit.ts`, `src/lib/registrations/team-funding.ts` (add the roster-collected helper beside the existing one), `src/lib/payments/team-captain-charge.ts`, `src/pages/api/cron/charge-unpaid-team-shares.ts`, `src/lib/stripe/handle-registration-payment-succeeded.ts`, `src/pages/api/public/team-registrations/[token]/invite.ts`, `src/lib/registrations/captain-credit.ts` + `create-registration.ts` (youth: no captain credit), `src/components/registration/team-create.tsx` (copy + split), `src/lib/email/send.ts` (receipt copy branch + `sendTeamDepositRefundedEmail`), `src/lib/logging/alerts.ts` (+`team_deposit_refund_failed`), `src/lib/db/schema/ops-pings.ts` (+`team_deposit_refunded`), `src/components/footer.tsx` (copy still true: "$200 reserves it").

PR D — Modify: `src/lib/analytics/events.ts` + unit tests, `src/components/registration/team-create.tsx` (deposit_paid fire on finalize success, invite/copy events, share button), `src/pages/api/public/team-registrations/prepare.ts` (team_full → registration_blocked reason path returns a machine code), `src/components/youth/youth-sport-league-page.astro` (hub pills fire division_register_clicked mode=team surface=hub; banner two-dates), `src/lib/leagues/youth-league-page-data.ts` (banner carries both dates), club card link.

---

## PR C — feat/team-deposit-refund

### Task 1: Youth predicate + schema migration

**Files:** Create `src/lib/registrations/team-season-kind.ts` + `tests/unit/registrations/team-season-kind.test.ts`; modify `src/lib/db/schema/team-registrations.ts` (4 new columns per Global Constraints); run `npm run db:generate`, review + commit the migration SQL.

**Interfaces — Produces:** `isYouthTeamSeason(row: { minAge: number | null; ageGroupMinAge: number | null }): boolean` (resolved minAge `< 18`; null-resolved → false/adult). Columns as named in Global Constraints (drizzle camelCase: `depositRefundStatus`, `depositRefundId`, `depositRefundedCents`, `depositRefundedAt`).

- [ ] TDD the predicate (youth 10 → true; adult 18 → false; both null → false; season.minAge overrides ageGroup). Migration: additive, `ADD COLUMN IF NOT EXISTS` per repo convention for drifted DBs. `npx tsc --noEmit`. Commit.

### Task 2: Roster-collected helper + refund executor

**Files:** Modify `src/lib/registrations/team-funding.ts` — add `teamRosterCollectedCents(db, teamId)` (and a batch variant if trivial) per Global Constraints, with a doc comment explaining WHY the deposit is excluded (the refund-trigger feedback hazard). Create `src/lib/payments/team-deposit-refund.ts`:

```ts
export async function maybeRefundTeamDeposit(db, opts: {
  teamId: string;
  /** "full_collection" fires from the share-payment handler; "deadline_settle"
   *  from the cron with the computed shortfall. */
  trigger: "full_collection" | "deadline_settle";
  shortfallCents?: number; // required for deadline_settle
}): Promise<{ status: "refunded" | "partial" | "forfeited" | "skipped"; reason?: string }>
```

Behavior: load the team row; skip unless youth (predicate — join season/ageGroup), unless `depositRefundStatus === 'none'`, unless `depositPaymentIntentId` present. Compute refund amount per the rules. Conditional-UPDATE the status first (`WHERE deposit_refund_status='none'`; zero rows → skipped/raced), then `stripe.refunds.create({ payment_intent, amount, metadata: { kind: "team_deposit_release", team_registration_id } }, { idempotencyKey: `${pi}:deposit-refund` })`, then: write the `payments` refund row, stamp `depositRefundId/RefundedCents/RefundedAt`, ops ping `team_deposit_refunded`, `sendTeamDepositRefundedEmail`, PostHog server capture. On Stripe failure: revert the status to `'none'` in a try/catch-with-logging (`logAlert("team_deposit_refund_failed", …)`) so the next trigger retries — model on `refundLateClaimPayment` (`handle-dropin-claim-payment.ts:238-301`) incl. the Stripe-not-configured soft path.

- [ ] TDD with mocked db/stripe (unit): full-collection refund; partial math; forfeit; adult skip; raced double-call → one refund; Stripe failure reverts status. Add `team_deposit_refund_failed` to `AlertTag` (+doc block) and `team_deposit_refunded` to `opsPingKindEnum` (enum-add = its own migration per the 55P04 rule — fold into Task 1's migration if not yet applied, else a second migration). tsc. Commit.

### Task 3: Wire the triggers

**Files:** Modify `src/lib/stripe/handle-registration-payment-succeeded.ts` — after the invitee flip block (~L140-149), when the registration belongs to a team (`teamRegistrationMembers` / matched invitee), call `maybeRefundTeamDeposit({ trigger: "full_collection" })` when `teamRosterCollectedCents >= teamFeeCents`; best-effort try/catch (a refund failure must never fail payment fulfillment). Modify `src/pages/api/cron/charge-unpaid-team-shares.ts` phase 2 + `src/lib/payments/team-captain-charge.ts`:

Youth branch math (adult keeps today's exactly): `shortfall = max(0, teamFeeCents − rosterCollected)`; `chargeCents = max(0, shortfall − depositCents)`; charge card only for `chargeCents > 0`; then `maybeRefundTeamDeposit({ trigger: "deadline_settle", shortfallCents: shortfall })` (handles full/partial/forfeit). `teamBackstopDueCents` gains an explicit youth signature or a new sibling — do NOT silently change the adult formula (its implicit deposit-inclusion is the adult behavior).

- [ ] Extend the cron's phase-2 flow carefully; API test (`tests/api/team-registrations-refund.test.ts`): use the E2E test endpoints/db helpers to fabricate a youth team row with a fake `depositPaymentIntentId` (Stripe-not-configured soft path exercises the state machine without a real refund — assert status transitions, payments row, no crash; the real-Stripe path is `itWithStripe`-gated if the suite supports it). Re-run the whole cron test file if one exists. tsc. Commit.

### Task 4: Youth captain is a manager, not a player

**Files:** Modify `src/lib/registrations/finalize-team-deposit.ts`: extend the existing season SELECT (L171-176) with `minAge`, `ageGroupId` + leftJoin `ageGroups.minAge`; gate BOTH `ensureCaptainRegistration` call sites (L132 re-entry AND L340) on `!isYouthTeamSeason(...)`. Modify `src/lib/registrations/create-registration.ts` (~L317-341) + `captain-credit.ts`: the captain share credit applies only on adult seasons (youth captain registering a CHILD via their own team link pays that child's full share — the deposit is a refundable hold, not credit). Modify `src/components/registration/team-create.tsx` copy (youth vs adult branch on data the component already has or can cheaply get — season ageGroup via its season fetch): HQ "You're on the roster as captain…" → youth: "Your team is reserved — share the link below; each family registers and pays for their own player. Your $200 deposit is refunded once the roster covers the team fee."; reserve-step disclosure sentence gains the refund promise; `:719` auto-registered note youth-branched. Modify `src/lib/email/send.ts` `buildTeamDepositReceipt` (+params flag) — youth `feeLine`: "Your $200 deposit holds the team. Your roster covers the full ${total} as families register — once they do, your deposit is refunded to your card."; create `sendTeamDepositRefundedEmail` (inline-builder style, logged `emailType: "team_deposit_refunded"`).

- [ ] Unit-test the builder branches (existing builder tests show the pattern). API test: youth team finalize (Stripe-less shortcut if the suite has one, else assert via the finalize path's testable seams) creates NO captain registration; adult path still does. tsc. Commit.

### Task 5: Full-fee split (youth)

**Files:** Modify `src/pages/api/public/team-registrations/[token]/invite.ts` (~L158-163): youth → `splittable = teamFeeCents`; adult unchanged. Modify `team-create.tsx` `:552` + `:591-593` (client defaults) with the same branch; the sidebar/summary "Your roster pays" figure youth → full fee. Update any tests asserting the $600 split.

- [ ] Tests + tsc + browser-visible check via curl of the register page HTML is NOT possible (client math) — verify with the unit/API layer + note for the controller's browser pass. Commit.

### Task 6: Gate + PR C

- [ ] `npm run db:generate` output committed (Task 1); full unit suite; touched API files re-run green (bws wrapper); affected e2e (`register-team-flow.spec.ts` — update copy assertions if they pin the old strings); `npm run build`; `npx tsc --noEmit`; push; PR with the owner's three decisions + the accounting design (deposit-exclusion rationale) + migration note; watch CI.

---

## PR D — feat/team-funnel-quick-wins (stacked on C)

### Task 7: T2 — team funnel events

**Files:** `src/lib/analytics/events.ts` + `tests/unit/analytics-events.test.ts`; `team-create.tsx`; `prepare.ts`; `youth-sport-league-page.astro`.

- TEAM_EVENTS gains `teamDepositPaid: "team_deposit_paid"` (client, fired in `finalize()` success with `{seasonId, authed}`), `teamInviteSent: "team_invite_sent"` (`{seasonId, count}`), `teamLinkCopied: "team_link_copied"` (`{seasonId}`); fix `team_deposit_viewed` to fire when the card element MOUNTS (separate tick from create_viewed) if a clean seam exists, else delete it and note (no same-tick duplicate).
- `RegistrationBlockedReason` gains `"team_full"`; `prepare.ts`'s cap rejection returns a machine code the client maps; `team-create.tsx` fires `trackRegistrationBlocked({seasonId, reason: "team_full"})`.
- Hub team pills additionally fire `division_register_clicked {mode: "team", surface: "hub", season_id}` via the existing delegated handler (keep the youth_hub event too — different question).

### Task 8: T3 banner + T5 club card

**Files:** `youth-league-page-data.ts` (banner payload carries `earlyBirdDeadline` AND `registrationCloses` distinctly), `youth-sport-league-page.astro` (banner copy: "$800 early-bird until Sep 28 · entry closes Oct 29" — degrade gracefully when either date is null or equal), club card `:532` links `/register/{bannerSeasonId}?mode=team` when a team-mode season is open (fallback `#open`).

### Task 9: T4 — native share

**Files:** `team-create.tsx` HQ block: a Share button using `navigator.share({ title, text, url: joinUrl })` when available, falling back to the existing copy behavior; fires `team_link_copied` (or a `method` prop share|copy). Keep clipboard button.

### Task 10: Gate + PR D

- [ ] Unit + touched suites; build; tsc; push; PR (stacked note); watch CI. PostHog follow-up noted in the PR body: add team funnel tiles once events accrue.

## Self-Review notes

- The deposit-exclusion accounting closes the map's hazard #1; hazards #2-#6 each map to a task (both call sites Task 4; charge.refunded comment Task 2; columns Task 1; split sites Task 5; eager-path: `handle-team-deposit-succeeded`/`index.ts` never call ensureCaptainRegistration — but Task 4's reviewer must verify that claim from the map against the code).
- Adult-path invariance is a stated constraint in every task; reviewers get it as the top attention item.
- Refund executor is trigger-agnostic and race-guarded; both triggers converge on one function.
