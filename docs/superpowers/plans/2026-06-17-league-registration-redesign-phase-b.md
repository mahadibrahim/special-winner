# League Registration Redesign — Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Depends on Phase A** (`2026-06-17-league-registration-redesign-phase-a.md`) being merged — this builds on `team-create.tsx`, the teammate-join token linkage, and the one-door flow.

**Goal:** Add the TeamPayer-style payment model to the team flow: captain pays a **$200 non-refundable deposit that credits the team fee** and **saves a card on file**; the captain **assigns a per-teammate share**; teammates pay their assigned share when they join; and a **cron job charges the captain's saved card** for any unpaid shares the morning after registration closes, with a reminder ~3 days before.

**Architecture:** Extend `team_registrations` with captain card-on-file + deposit + deadline, and add a `team_invitees` table (email + assigned share + status). A new `src/lib/stripe/saved-cards.ts` adds SetupIntent (save card) + off-session charge (net-new — none exists today; `getOrCreateStripeCustomer` in `src/lib/memberships/stripe.ts` is the reuse pattern). A new cron route + Netlify scheduled function reconcile unpaid shares → captain charge, reusing the `send-balance-reminders` pattern.

**Tech Stack:** Drizzle + Postgres (additive migration), Stripe (PaymentIntent `setup_future_usage` + off-session charge), Netlify scheduled functions, Resend (`@/lib/email/send`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-17-league-registration-flow-redesign-design.md` (§ "Resolved decisions (Phase B)").

**Locked decisions:** deposit **$200 (20000 cents), non-refundable, credits the team fee**; **captain-assigned** per-invitee shares (Σ shares = team fee − deposit); auto-charge **the morning after registration closes**, reminder **~3 days before**.

**⚠️ Environment + Stripe safety:** external volume (ABSOLUTE paths, verify with `git diff`, `npx tsc --noEmit`). All Stripe work uses **test keys**; off-session charges MUST be exercised against Stripe test mode with a saved test card before merge. Migrations: `db:generate` → commit the SQL (never `db:push` to remote).

---

## File Structure

**Create:**
- `src/lib/stripe/saved-cards.ts` — SetupIntent / save-card on a PaymentIntent + off-session charge of a saved payment method. Net-new.
- `src/lib/payments/team-captain-charge.ts` — orchestrates the backstop charge (sum unpaid shares → off-session charge → record payment + flip statuses).
- `src/pages/api/cron/charge-unpaid-team-shares.ts` — cron route (CRON_SECRET auth).
- `netlify/functions/scheduled-charge-unpaid-team-shares.ts` — Netlify scheduled wrapper.
- `src/lib/db/migrations/NNNN_*.sql` — generated migration (additive).
- Tests: `tests/unit/team-shares.test.ts`, `tests/api/team-deposit.test.ts`.

**Modify:**
- `src/lib/db/schema/team-registrations.ts` — extend `teamRegistrations`; add `teamInvitees`.
- `src/components/registration/team-create.tsx` — deposit step + assigned-share inputs + tracker.
- `src/pages/api/public/team-registrations/index.ts` — charge deposit + save card on create.
- `src/pages/api/public/team-registrations/[token].ts` — return collected/total + per-invitee status.
- The teammate checkout path (`guest-checkout.ts` / `create-checkout-for-registration.ts`) — charge the assigned share when joining via token.

---

## Task 1: Schema — captain card-on-file, deposit, deadline, invitees

**Files:** Modify `src/lib/db/schema/team-registrations.ts`; generate migration.

- [ ] **Step 1: Extend `teamRegistrations`.** Add columns (all nullable/defaulted — additive, safe on existing rows):
```ts
  // Phase B — captain payment backstop
  teamFeeCents: integer("team_fee_cents"),                 // snapshot of season team price at creation
  depositCents: integer("deposit_cents").default(20000),   // $200 locked decision
  depositPaymentId: uuid("deposit_payment_id"),            // FK-ish ref to payments.id (no hard FK; set after charge)
  captainStripeCustomerId: varchar("captain_stripe_customer_id", { length: 255 }),
  captainPaymentMethodId: varchar("captain_payment_method_id", { length: 255 }),
  paymentDeadline: timestamp("payment_deadline"),          // = season.registrationCloses at creation
  backstopStatus: varchar("backstop_status", { length: 20 }).default("none").notNull(),
  // 'none' | 'pending' | 'charged' | 'failed'
```
Add `integer`, `timestamp` to the imports if missing.

- [ ] **Step 2: Add `teamInvitees` table.**
```ts
export const teamInvitees = pgTable("team_invitees", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamRegistrationId: uuid("team_registration_id").notNull().references(() => teamRegistrations.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 320 }).notNull(),
  assignedShareCents: integer("assigned_share_cents").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  // 'pending' | 'paid' | 'charged_to_captain'
  registrationId: uuid("registration_id").references(() => registrations.id, { onDelete: "set null" }),
  invitedAt: timestamp("invited_at").defaultNow().notNull(),
  paidAt: timestamp("paid_at"),
}, (t) => [
  index("team_invitees_team_idx").on(t.teamRegistrationId),
  uniqueIndex("team_invitees_team_email_uniq").on(t.teamRegistrationId, t.email),
]);
export type TeamInvitee = typeof teamInvitees.$inferSelect;
export type NewTeamInvitee = typeof teamInvitees.$inferInsert;
```
(Import `index`, `uniqueIndex` if not present.)

- [ ] **Step 3: Generate + review the migration.**
```bash
npm run db:generate
```
Open the new `src/lib/db/migrations/NNNN_*.sql`; confirm it's purely `ALTER TABLE ... ADD COLUMN` + `CREATE TABLE team_invitees` (no drops). Commit the SQL.

- [ ] **Step 4: Push locally / typecheck.** Against a LOCAL db only: `npm run db:push` is guarded; for the shared dev/staging DB rely on the generated migration. `npx tsc --noEmit`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/db/schema/team-registrations.ts src/lib/db/migrations/
git commit -m "feat(teams): schema for captain deposit, card-on-file, invitees, backstop"
```

---

## Task 2: Stripe save-card + off-session charge lib

**Files:** Create `src/lib/stripe/saved-cards.ts`; Test `tests/unit/team-shares.test.ts` (share math here; Stripe calls are integration-verified in test mode).

- [ ] **Step 1: Implement `saved-cards.ts`** (uses the existing Stripe client from `@/lib/stripe/client` — match its export; and the customer pattern from `@/lib/memberships/stripe.ts`).
```ts
import { stripe } from "@/lib/stripe/client"; // confirm the exported client name
import { getOrCreateStripeCustomer } from "@/lib/memberships/stripe";

/**
 * Create a PaymentIntent for the captain deposit that ALSO saves the card for
 * later off-session charges (the backstop). Returns the client secret for the
 * captain to confirm now + the customer id to persist.
 */
export async function createDepositIntentWithSavedCard(params: {
  userId: string; email: string; amountCents: number; metadata: Record<string, string>;
}): Promise<{ clientSecret: string; customerId: string }> {
  const customerId = await getOrCreateStripeCustomer(params.userId, params.email);
  const pi = await stripe.paymentIntents.create({
    amount: params.amountCents,
    currency: "usd",
    customer: customerId,
    setup_future_usage: "off_session", // saves the card on success
    metadata: params.metadata,
  });
  return { clientSecret: pi.client_secret!, customerId };
}

/** Charge a previously-saved card off-session (the captain backstop). */
export async function chargeSavedCardOffSession(params: {
  customerId: string; paymentMethodId: string; amountCents: number; metadata: Record<string, string>;
}): Promise<{ paymentIntentId: string; status: string }> {
  const pi = await stripe.paymentIntents.create({
    amount: params.amountCents,
    currency: "usd",
    customer: params.customerId,
    payment_method: params.paymentMethodId,
    off_session: true,
    confirm: true,
    metadata: params.metadata,
  });
  return { paymentIntentId: pi.id, status: pi.status };
}
```
(After the captain confirms the deposit PI, the webhook/confirm handler must read `payment_intent.payment_method` and persist it to `teamRegistrations.captainPaymentMethodId` — wire this in Task 3 step 3.)

- [ ] **Step 2: Share-math helper + unit test.** Add to `src/lib/payments/team-captain-charge.ts` a pure `sumUnpaidSharesCents(invitees)` and `assignEvenShares(totalCents, emails)` helper, and test:
```ts
// tests/unit/team-shares.test.ts
import { describe, it, expect } from "vitest";
import { sumUnpaidSharesCents, assignEvenShares } from "@/lib/payments/team-captain-charge";
describe("team shares", () => {
  it("sums only unpaid invitee shares", () => {
    expect(sumUnpaidSharesCents([
      { assignedShareCents: 12000, status: "pending" },
      { assignedShareCents: 12000, status: "paid" },
      { assignedShareCents: 10000, status: "pending" },
    ] as any)).toBe(22000);
  });
  it("even split distributes remainder to the first shares", () => {
    expect(assignEvenShares(10000, ["a@x.com", "b@x.com", "c@x.com"])).toEqual([3334, 3333, 3333]);
  });
});
```
Implement both as pure functions (no Stripe).

- [ ] **Step 3: Run unit → PASS; tsc.** Confirm the `stripe` client import name matches `src/lib/stripe/client.ts` (adjust if it exports a factory).

- [ ] **Step 4: Commit**
```bash
git add src/lib/stripe/saved-cards.ts src/lib/payments/team-captain-charge.ts tests/unit/team-shares.test.ts
git commit -m "feat(payments): save-card SetupIntent + off-session charge + share math"
```

---

## Task 3: Captain deposit + save card on team creation

**Files:** Modify `src/pages/api/public/team-registrations/index.ts`, `src/components/registration/team-create.tsx`, and the payment-confirm/webhook handler that persists the saved method.

- [ ] **Step 1: API — return a deposit client secret.** Extend the POST handler: after inserting the `team_registrations` row (status stays `forming`), snapshot `teamFeeCents = season.teamPriceCents ?? season.priceCents`, set `paymentDeadline = season.registrationCloses`, and call `createDepositIntentWithSavedCard({ userId: captainUserId, email: captainEmail, amountCents: 20000, metadata: { team_registration_id, kind: "team_deposit" } })`. Persist `captainStripeCustomerId`. Return `{ ...existing, depositClientSecret, publishableKey }`. Require an authenticated captain (the deposit needs a user for the saved customer) — if `locals.user` is null, return 401 with a message to sign in first.

- [ ] **Step 2: team-create UI — deposit step.** In `team-create.tsx`, after the captain fills team name, render the Stripe payment element with the returned `depositClientSecret` (reuse the same Stripe Elements integration `payment-step.tsx` uses — confirm the wrapper/provider). On successful confirm, advance to the invite/tracker view. Show the locked-decision copy: "$200 deposit · credits the team fee · unpaid shares charged here after {deadline}."

- [ ] **Step 3: Persist the saved payment method.** In the Stripe confirmation handler (the webhook handling `payment_intent.succeeded`, `src/lib/stripe/*` — find where registration PIs are handled and add a branch for `metadata.kind === "team_deposit"`): on success, update the `team_registrations` row → `captainPaymentMethodId = payment_intent.payment_method`, `depositPaymentId` = the recorded payments row id (insert a `payments` row with `paymentType: "deposit"`, `amountCents: 20000`, linked to the captain), `backstopStatus = "pending"`. Flip team `status` to `forming` (already is) — the deposit success is what makes the team "live"; gate the share/invite UI on `captainPaymentMethodId` being set.

- [ ] **Step 4: API test (test mode).** `tests/api/team-deposit.test.ts`: POST team-registrations as an authed captain → assert response has `depositClientSecret`; (Stripe confirm is manual/test-mode — assert the row has `captainStripeCustomerId` set and `depositCents = 20000`). `npx tsc --noEmit`.

- [ ] **Step 5: Commit**
```bash
git add src/pages/api/public/team-registrations/index.ts src/components/registration/team-create.tsx src/lib/stripe/ tests/api/team-deposit.test.ts
git commit -m "feat(teams): captain $200 deposit + save card on team creation"
```

---

## Task 4: Assigned shares + teammate pays their share

**Files:** Modify `src/components/registration/team-create.tsx` (assign UI), `src/pages/api/public/team-registrations/[token]/invite` (from Phase A — extend to store shares), the teammate checkout path.

- [ ] **Step 1: Assign shares on invite.** Extend the invite action: each invited email gets an `assignedShareCents` (captain enters a $ amount; default = even split of `teamFeeCents − depositCents` across the roster target). Insert/update `team_invitees` rows (`onConflictDoUpdate` on the `(teamRegistrationId, email)` unique index). The invite email (Resend, via `@/lib/email/send`) includes the join link `/register/{seasonId}?team={token}` and the share amount.

- [ ] **Step 2: Teammate pays the assigned share.** In the teammate-join checkout (the path taken when `teamToken` is present — `guest-checkout.ts`/`create-checkout-for-registration.ts`), if the registrant's email matches a `team_invitees` row for that team, set the charge amount to `assignedShareCents` instead of the season price. On payment success, set that invitee row `status = "paid"`, `paidAt = now`, `registrationId = <new reg>` (in addition to the Phase A `team_registration_members` insert). Keep the captain's own registration tied to their deposit (don't double-charge the captain — their deposit credits their share).

- [ ] **Step 3: Guard.** If no invitee row matches (someone used the link without being invited), fall back to the normal season price (open join) — and create a `team_invitees`/member row at the paid price. Document this in a code comment.

- [ ] **Step 4: tsc + API smoke.** `npx tsc --noEmit`; extend `tests/api/team-deposit.test.ts` to assert an invitee row's `status` flips to `paid` after a teammate guest-checkout with the token (mirrors Phase A's linkage test).

- [ ] **Step 5: Commit**
```bash
git add src/components/registration/team-create.tsx src/pages/api/public/team-registrations/ src/pages/api/registrations/ src/lib/payments/
git commit -m "feat(teams): captain-assigned shares + teammate pays assigned share"
```

---

## Task 5: Payment tracker

**Files:** Modify `src/pages/api/public/team-registrations/[token].ts`, `src/components/registration/team-create.tsx`

- [ ] **Step 1: API — collected/total + invitee statuses.** Extend the GET `[token]` response with `payment: { teamFeeCents, depositCents, collectedCents, invitees: [{ email, assignedShareCents, status }] }` where `collectedCents = depositCents + Σ(paid invitee shares)`. Tenant-scoped as today.

- [ ] **Step 2: Tracker UI.** In `team-create.tsx`'s post-deposit view, render the live tracker from that data: a progress bar (`collectedCents / teamFeeCents`), and the invitee list with paid/invited/open dots (matches the mockup `team-flow-v2.html` screen 2). Poll/refresh on focus.

- [ ] **Step 3: tsc + commit**
```bash
git add src/pages/api/public/team-registrations/\[token\].ts src/components/registration/team-create.tsx
git commit -m "feat(teams): live payment tracker (collected vs team total)"
```

---

## Task 6: Captain backstop cron + reminder

**Files:** Create `src/pages/api/cron/charge-unpaid-team-shares.ts`, `netlify/functions/scheduled-charge-unpaid-team-shares.ts`; extend the reminder path.

- [ ] **Step 1: Cron route.** Mirror `src/pages/api/cron/send-balance-reminders.ts` exactly for the `CRON_SECRET` auth block. Logic:
  - Find `team_registrations` where `paymentDeadline < now()`, `backstopStatus = "pending"`, `captainPaymentMethodId` set.
  - For each, sum unpaid invitee shares (`sumUnpaidSharesCents`). If 0 → set `backstopStatus = "charged"` (nothing owed) and continue.
  - Else call `chargeSavedCardOffSession({ customerId, paymentMethodId, amountCents, metadata: { team_registration_id, kind: "captain_backstop" } })`. On `status === "succeeded"`: record a `payments` row (`paymentType: "balance"`, captain's user), set the unpaid invitees `status = "charged_to_captain"`, set team `backstopStatus = "charged"`. On failure: `backstopStatus = "failed"` + alert (captureServerException) — needs manual follow-up (off-session charges can require authentication).
  - Idempotent: the `backstopStatus` transition guards against double-charge; also pass a Stripe idempotency key `team-backstop:{teamRegistrationId}`.

- [ ] **Step 2: Netlify schedule.** Create `netlify/functions/scheduled-charge-unpaid-team-shares.ts` mirroring `netlify/functions/scheduled-send-balance-reminders.ts`, calling `POST /api/cron/charge-unpaid-team-shares` with the cron secret. Schedule `"0 13 * * *"` (daily 13:00 UTC ≈ morning ET) — the route itself only acts on teams whose deadline has passed, so "morning after close" falls out naturally.

- [ ] **Step 3: Reminder ~3 days before.** Extend `send-balance-reminders` (or add a sibling cron) to email captains + unpaid invitees when `paymentDeadline` is ~3 days out, using `@/lib/email/send` (add a `sendTeamShareReminderEmail` following the existing `sendBalanceReminderEmail` shape). Include the join link / pay link.

- [ ] **Step 4: Test the cron locally.** With dev server + `CRON_SECRET` set: `curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:4321/api/cron/charge-unpaid-team-shares` returns 200 with a summary `{ processed, charged, failed }`. Unit-test `sumUnpaidSharesCents` already covers the math (Task 2). Stripe off-session success/failure verified in test mode with a saved test card (`pm_card_visa` for success; a SCA-required card to exercise the `failed` branch).

- [ ] **Step 5: Commit**
```bash
git add src/pages/api/cron/charge-unpaid-team-shares.ts netlify/functions/scheduled-charge-unpaid-team-shares.ts src/lib/email/ src/lib/payments/team-captain-charge.ts
git commit -m "feat(teams): captain backstop cron + 3-day reminder"
```

---

## Task 7: Verify + PR

- [ ] **Step 1:** `npx vitest run tests/unit/team-shares.test.ts`; `npx tsc --noEmit` (zero errors); `npm run build` (ignore baseball).
- [ ] **Step 2:** `npm run db:generate` shows no pending diff (migration already committed). Re-seed e2e: `npm run db:seed:e2e`.
- [ ] **Step 3:** With dev server up: `TEST_BASE_URL=http://localhost:4321 npm run test:api` (team-deposit + linkage pass).
- [ ] **Step 4: Stripe test-mode dry run** (manual, documented in the PR): create a team → confirm $200 deposit with `4242…` → invite + assign shares → pay one share → run the cron with the deadline in the past → confirm the captain's saved card is charged for the remaining unpaid shares and invitee statuses flip to `charged_to_captain`.
- [ ] **Step 5: PR** `git push` + `gh pr create --fill`; watch CI to green (typecheck/build/test-api/test-critical). The migrate-staging workflow applies the new migration; confirm it succeeds.

---

## Self-Review
- **Spec coverage (Phase B):** deposit $200 credits fee + saves card (T1 schema, T2 stripe, T3 flow); captain-assigned shares (T4); teammate pays share (T4); tracker (T5); backstop cron morning-after + 3-day reminder (T6); migration + verify (T1, T7). The locked decisions (amount, assigned shares, timing) are encoded as constants (`20000`) and cron schedule.
- **Placeholders:** Stripe calls are shown with real PI params (`setup_future_usage`, `off_session`, `confirm`); share math is real + tested; no "implement charge logic" hand-waves.
- **Type consistency:** `chargeSavedCardOffSession`/`createDepositIntentWithSavedCard` names used consistently T2→T3→T6; `backstopStatus` values (`none|pending|charged|failed`) consistent T1/T3/T6; invitee `status` (`pending|paid|charged_to_captain`) consistent T1/T4/T6.
- **Dependencies/risks called out:** off-session charges can fail SCA (handled via `failed` branch + alert); the exact Stripe client export name + Elements provider must be confirmed against `client.ts`/`payment-step.tsx` during T2/T3 (noted in steps). Net-new Stripe surface — must be exercised in test mode (T7 step 4) before merge.
- **Known soft spot:** T3 step 3 assumes a webhook path handles registration PIs where a `team_deposit` branch can be added — the implementer must locate that handler (`src/lib/stripe/handle-registration-payment-succeeded.ts` is the analog) and add the branch; if team-deposit PIs need a distinct webhook route, add one following that file's pattern. This is the one place needing live-code discovery; flagged, not hand-waved.
