# Checkout Redesign Wave 2 (Team Flow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anonymous captains reserve a team inline (no email-link detour), make the off-session backstop charge an explicit recorded consent, instrument the team funnel end-to-end, and surface waiver-pending on the team roster.

**Architecture:** Mirror the solo guest-checkout pattern (`upsertGuestUser` + session-for-new-users-only) inside the team-create endpoint, replacing the current 401 + magic-link detour for NEW emails while keeping the magic-link path for EXISTING emails (account-takeover rule: never mint a session for an email that already has an account). Backstop consent becomes a required checkbox recorded as `team_registrations.backstop_consented_at` (the consents table's familyMember+registration FK shape doesn't fit a team-level deposit). Captain deposit crediting is ALREADY SHIPPED on main (`captain-credit.ts`, `resolveTeamPricing`, zero-due finalize, tracker math) — this plan only verifies and instruments it.

**Tech Stack:** Astro 5 + React 19, Drizzle/Postgres, Stripe PaymentIntent with `setup_future_usage: "off_session"` (existing `saved-cards.ts`), PostHog client `track()` + posthog-node.

**Base:** origin/main 5713a060 (includes Wave 1 / PR #446). Audit of record: see Global Constraints and per-task "audited facts" — line numbers reference this base.

## Global Constraints

- **Worktree:** `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/checkout-redesign-team`, branch `feat/checkout-redesign-team`. Absolute paths in every subagent dispatch.
- **Do NOT re-implement captain deposit crediting** — `src/lib/registrations/captain-credit.ts`, `resolveTeamPricing` in `create-registration.ts:217-288`, zero-due finalize (:577-601), `teamCollectedCents`, `[token].ts` `viewerCaptainCredit`, and the wizard display (:330-363) are shipped. Any change there needs explicit controller sign-off.
- **Session rule (account-takeover prevention):** a session cookie is set ONLY for newly-created users (`wasNewUser === true`), exactly like `guest-checkout.ts:353-356`. Existing-email captains keep the current magic-link path (`team-create.tsx` `requestMagicLink`, lines 252-303).
- **Rate limiting is mandatory** the moment the endpoint accepts anonymous requests: same 5/min/IP `rateLimit()` idiom as `guest-checkout.ts:114-124`.
- **Deposit constant:** use `CAPTAIN_DEPOSIT_CENTS` from `src/lib/registrations/team-deposit.ts:10` (authoritative). Remove the duplicate local `DEPOSIT_AMOUNT_CENTS` in `team-registrations/index.ts:13` while touching that file.
- **No PII in analytics props.** Event names never change; only additions.
- **Schema changes:** additive; `npm run db:generate` (next number: 0104); `ADD COLUMN IF NOT EXISTS` idempotency convention.
- **Deviation from proposal, decided:** the team form's `notes` field STAYS on the pre-payment form (optional field, 4th input). Moving it post-payment requires a captain-authed write endpoint against a token-shared page — auth complexity not worth an optional field. Flag to the user in the PR body.
- **E2E:** `tests/api/team-shares.test.ts:61-74` asserts the 401 — must be rewritten. `tests/api/team-linkage.test.ts` pre-authenticates — keep, and add an anon-captain variant. Grep `tests/e2e/register-team-flow.spec.ts` (its "no auth required to view" comment goes stale).
- **Local Stripe caveat:** anon-captain tests must use unique per-run emails (fresh users → fresh Stripe customers → no testmode idempotency-residue clashes; see memory: team-linkage local failure).

## File Structure (Wave 2 footprint)

```
src/lib/registrations/upsert-guest-user.ts       # NEW: extracted from guest-checkout.ts (shared)
src/pages/api/registrations/guest-checkout.ts    # uses the extracted helper (no behavior change)
src/pages/api/public/team-registrations/index.ts # anon path + rate limit + consent + events + constant cleanup
src/lib/db/schema/team-registrations.ts          # + backstop_consented_at
src/lib/db/migrations/0104_*.sql                 # generated
src/components/registration/team-create.tsx      # guest-first UX + consent checkbox + client events
src/components/registration/register-experience.tsx # passes user email/name (unchanged shape check)
src/lib/stripe/handle-team-deposit-succeeded.ts  # + team_deposit_paid server event; fix stale NOT-NULL comment
src/lib/analytics/events.ts                      # + TEAM_EVENTS (client) + SERVER_EVENTS.teamDepositPaid
src/components/registration/registration-wizard.tsx # flow: team_captain when viewer is captain
src/pages/api/public/team-registrations/[token].ts  # members query + waiverSigned
src/pages/team/[token].astro (+ its React island)   # waiver ✓ / pending badge per member
tests/api/team-shares.test.ts                    # 401 test rewritten
tests/api/team-registrations-anon.test.ts        # NEW: anon captain create
tests/unit/ (as needed per task)
```

---

### Task 1: Extract `upsertGuestUser` into a shared helper

**Files:**
- Create: `src/lib/registrations/upsert-guest-user.ts`
- Modify: `src/pages/api/registrations/guest-checkout.ts:140-196` (delete inline helper, import shared)
- Test: `tests/unit/upsert-guest-user.test.ts` — type-level/shape test only (the helper is DB-bound; its behavior is covered by existing guest-checkout API tests, which must stay green in Task 8)

**Interfaces:**
- Produces: `upsertGuestUser(db, opts: { email: string; firstName: string; lastName: string; phone?: string | null; birthDate?: string | null }): Promise<{ userRow: users.$inferSelect; wasNewUser: boolean; normalizedEmail: string }>` — byte-identical logic to the inline version (onConflictDoNothing on email, parent-role grant for new users, re-fetch on race).

- [ ] **Step 1:** Move the function verbatim (including comments) into the new file; parameterize `db` (first arg). Export the return type as `UpsertGuestUserResult`.
- [ ] **Step 2:** guest-checkout.ts imports it; call sites updated (two: adult path :399, parent+child path :445). Diff to the moved code must be mechanical (arg threading only).
- [ ] **Step 3:** `npx tsc --noEmit` clean; `npx vitest run tests/unit` no new failures.
- [ ] **Step 4:** Commit — `refactor(registrations): extract shared upsertGuestUser helper`

---

### Task 2: Schema — `backstop_consented_at` (+ stale comment fix)

**Files:**
- Modify: `src/lib/db/schema/team-registrations.ts` (add column after `backstopStatus`)
- Modify: `src/lib/stripe/handle-team-deposit-succeeded.ts:17-19` (comment claims `payments.registrationId` is NOT NULL; it is nullable since the schema at `payments.ts:70-71` — fix the comment only, no behavior change)
- Create: generated `src/lib/db/migrations/0104_*.sql`

**Interfaces:**
- Produces: `teamRegistrations.backstopConsentedAt: timestamp | null` — set at team creation when the captain checked the required consent box; null on legacy rows.

- [ ] **Step 1:** Schema edit:
```ts
// Captain's explicit affirmation that the saved card may be charged for
// unpaid teammate shares after the deadline (off-session backstop). Recorded
// at team creation; legacy rows predate the checkbox and stay null.
backstopConsentedAt: timestamp("backstop_consented_at", { withTimezone: true }),
```
- [ ] **Step 2:** `npm run db:generate` → 0104; hand-edit to `ADD COLUMN IF NOT EXISTS` if needed; commit schema+migration together.
- [ ] **Step 3:** Fix the stale comment in `handle-team-deposit-succeeded.ts` (reference: payments.registrationId is nullable).
- [ ] **Step 4:** tsc clean. Commit — `feat(schema): team_registrations.backstop_consented_at + stale payments comment fix`

---

### Task 3: Anonymous captain — endpoint

**Files:**
- Modify: `src/pages/api/public/team-registrations/index.ts`
- Test: `tests/api/team-registrations-anon.test.ts` (new), `tests/api/team-shares.test.ts:61-74` (rewrite)

**Interfaces (audited facts):** today the endpoint 401s guests at :53-58; deposit PI via `createDepositIntentWithSavedCard()` (saved-cards.ts:28-52) needing only `{userId, email}`; response `{ ok, teamRegistrationId, inviteToken, joinUrl, teamFeeCents, depositClientSecret, publishableKey }`; no rate limit; local `DEPOSIT_AMOUNT_CENTS` dup at :13.

- Produces: POST body gains `backstopConsent: z.literal(true)` (required — the UI can't submit without it) and the endpoint accepts anonymous callers:
  - `locals.user` present → current behavior (captainUserId = session user), plus `backstopConsentedAt: new Date()` on the insert.
  - Anonymous + email NOT in users → `upsertGuestUser` (Task 1) → `createSession` (new user only) → proceed as that user. Response gains `wasNewUser: true`.
  - Anonymous + email EXISTS → **409** `{ error: "account_exists", message: "We emailed you a link to continue — this email already has an account." }` and the endpoint does NOT create the team (client falls back to the existing `requestMagicLink` flow). Never attach a team or mint a session for an existing account without auth.
- Rate limit: `rateLimit(\`team-create:ip:${ip}\`, 5, 60_000)` before any DB work, mirroring guest-checkout.
- Constant cleanup: import `CAPTAIN_DEPOSIT_CENTS`, delete the local dup.

- [ ] **Step 1: Failing API tests first** (in the new file; dev server + staging DB in Task 8 run them — write now, run what's runnable):
```ts
// tests/api/team-registrations-anon.test.ts (shape; follow team-linkage.test.ts idioms)
// 1. anon create with unique email + backstopConsent:true → 200, inviteToken, wasNewUser:true,
//    Set-Cookie present (new user session)
// 2. anon create with parent@test.aspiresports.com (existing) → 409 account_exists, no team row
// 3. create without backstopConsent → 400
// 4. 6th request same IP within a minute → 429
```
Rewrite `team-shares.test.ts:61-74`: the "captain must sign in" test becomes "anonymous captain with an existing email gets 409 + magic-link fallback signal" (or delete it in favor of the new file's case 2 — keep exactly one owner of that assertion).
- [ ] **Step 2:** Implement per the Interfaces block. The consent timestamp goes on the insert (:125-142 today). Keep the Stripe-unconfigured graceful branch working for anonymous users too (CI path).
- [ ] **Step 3:** tsc clean; unit suite no new failures. Commit — `feat(teams): anonymous captains reserve inline (guest upsert + rate limit + recorded backstop consent)`

---

### Task 4: Anonymous captain — client (`team-create.tsx`)

**Files:**
- Modify: `src/components/registration/team-create.tsx`
- Modify: `src/components/registration/register-experience.tsx` (only if prop threading requires — audited: TeamCreate gets `isAuthed`, `defaultName`, `defaultEmail`)

**Interfaces (audited facts):** states `idle|submitting|deposit|ok|error|link_sent`; `requestMagicLink()` at :252-303 stashes a draft and emails a link; a mid-submit stale-session 401 also falls back there (:341-351); backstop copy is static text at :518-521.

- Produces:
  - Required consent checkbox on the create form above submit: label "Save my card to cover unpaid teammate shares after the deadline" + sub-line "Charged only if your team hasn't collected the full fee by {paymentDeadline}." Submit disabled until checked; `backstopConsent: true` in the POST.
  - Anonymous submit goes STRAIGHT to POST (no pre-emptive magic-link detour). On `409 account_exists` → existing `requestMagicLink()` flow (reuse, don't fork) and the `link_sent` state with copy "This email already has an account — we sent you a sign-in link to continue."
  - Deposit screen keeps the existing disclosure line (now reinforcing the recorded consent), plus P5 input attributes on the form fields (`autocomplete="name" / "email"`, `enterKeyHint`).
  - The stale-session 401 fallback (:341-351) stays as-is.
- v1-preserving: authed captains see the same form + new checkbox; nothing else moves. Notes field STAYS (Global Constraints deviation).

- [ ] **Step 1:** Implement; trace both captain types (authed, anon-new) through form → deposit → ok, and anon-existing through form → 409 → link_sent.
- [ ] **Step 2:** Update `tests/e2e/register-team-flow.spec.ts`: stale comment; add assertions — consent checkbox present and gating submit (form-level, no POST needed); anonymous view still renders the form. Do not run Playwright here.
- [ ] **Step 3:** tsc clean. Commit — `feat(teams): guest-first team creation UX with required backstop consent`

---

### Task 5: Team eventing

**Files:**
- Modify: `src/lib/analytics/events.ts`
- Modify: `src/components/registration/team-create.tsx` (client events)
- Modify: `src/pages/api/public/team-registrations/index.ts` (posthog server capture on create)
- Modify: `src/lib/stripe/handle-team-deposit-succeeded.ts` (team_deposit_paid)
- Modify: `src/components/registration/registration-wizard.tsx:545` (team_captain flow)
- Test: extend `tests/unit/analytics-events.test.ts`

**Interfaces:**
- Produces in `events.ts`:
```ts
export const TEAM_EVENTS = {
  teamCreateViewed: "team_create_viewed",     // form rendered
  teamCreateSubmitted: "team_create_submitted", // POST fired (client, pre-response)
  teamDepositViewed: "team_deposit_viewed",   // deposit screen rendered
  teamHqViewed: "team_hq_viewed",             // "ok" share/invite state rendered
} as const;
export const trackTeamCreateViewed = (p: { seasonId: string }) => track(TEAM_EVENTS.teamCreateViewed, { season_id: p.seasonId, in_app_browser: isInAppBrowser() });
// …Submitted gains { authed: boolean }; DepositViewed/HqViewed same shape as Viewed
```
`SERVER_EVENTS` gains `teamDepositPaid: "team_deposit_paid"`.
- Server captures: on successful create → (existing posthog-server client) `team_create_submitted`-server? NO — client owns submitted; the endpoint captures nothing on create (keep one owner per event). `handle-team-deposit-succeeded.ts` captures `team_deposit_paid { team_registration_id, season_id, amount_cents }`, distinctId = captainUserId.
- Wizard flow prop: `flow: teamToken ? (captainCredit != null ? "team_captain" : "team_member") : "solo"` — audited: the wizard already fetches `viewerCaptainCredit` (:330-363, `effectiveCaptainCredit` :340); use whatever local variable indicates the viewer is the captain; if that data loads async, the effect deps must include it so the step event fires with the settled value (acceptable: first fire may say team_member then settle — NOT acceptable: double-fire per step; guard accordingly — fire once per step with the settled value by keying the effect on both step and the loaded flag).
- [ ] **Step 1:** events.ts + unit test (mirrors Wave 1's analytics-events test — real composition, mock transport only).
- [ ] **Step 2:** Wire client events in team-create.tsx (mount effects per state) and the wizard flow change.
- [ ] **Step 3:** Server capture in the webhook handler.
- [ ] **Step 4:** tsc clean; unit green. Commit — `feat(analytics): team funnel events + team_captain flow`

---

### Task 6: Waiver-pending on the team roster

**Files:**
- Modify: `src/pages/api/public/team-registrations/[token].ts:83-103` (members select + waiverSigned)
- Modify: the members list renderer under `src/pages/team/[token].astro` (its React island) and the `PaymentTracker` members list in `team-create.tsx` if it shares the payload (audited: tracker reads `payment.invitees`, separate from `members` — check and touch only the members list)
- Test: extend `tests/api/public/team-registrations-token.test.ts` (payload shape)

**Interfaces (audited facts):** `[token].ts` members query selects `role, joinedAt, registrationStatus, paymentStatus, firstName, lastName` — no waiverSigned. UI precedent: `PickupRollCall.tsx:384-386` "waiver ✓ / waiver out" badge pair.

- Produces: members payload gains `waiverSigned: boolean`; roster rows render the PickupRollCall-style badge ("waiver ✓" ok / "waiver pending" amber). Copy "pending" not "out" (customer-facing surface; plain language).
- [ ] **Step 1:** API test first: token GET → members[].waiverSigned present (boolean).
- [ ] **Step 2:** Query + payload + badge.
- [ ] **Step 3:** tsc clean. Commit — `feat(teams): waiver status on team roster`

---

### Task 7: Verify captain-credit + Wave 1 interplay (no new code expected)

**Files:** none expected; findings go to the controller.

- [ ] **Step 1:** Trace and DOCUMENT (report only): anon-new captain → deposit paid → "Register myself" → wizard with `?team=` → v2 flow (adult season) → `resolveTeamPricing` captain branch → zero-due finalize (`status: confirmed, paymentStatus: "paid"`) → confirm screen shows CompletionForm (waiverSigned false) → completion endpoint owner check passes (registeredByUserId = the mid-checkout-created user) → waiver reminders cover it (`paymentStatus: 'paid'`).
- [ ] **Step 2:** Identify any seam broken by the anon path (e.g. zero-due captains skip payment step — does the step-event sequence still emit payment/confirm? does `trackPurchase` fire on zero-due? Report, don't fix without controller sign-off).
- [ ] **Step 3:** Report findings; controller decides fixes.

---

### Task 8: Verification + PR (controller-run)

- [ ] `npm run db:generate` diff empty; dev server up with bws (+ `E2E_TEST_ENDPOINTS=yes R2_MOCK=1 MESSAGING_MOCK=1 CRON_SECRET=…`); `npm run db:seed:e2e`.
- [ ] Targeted API: team-registrations-anon, team-shares, team-linkage, team-registrations-token, team-early-bird, registrations-guest-checkout (helper extraction), registration-completion. Then full `npm run test:api` (background, untruncated).
- [ ] Playwright: `register-team-flow.spec.ts` + any spec greps from Tasks 4/6.
- [ ] `npm run build` (bws); `npx tsc --noEmit`.
- [ ] Final whole-branch review (most capable model) → fixes → PR to main. PR body flags the notes-field deviation and the Task 7 findings.
- [ ] Post-merge: watch main CI/test-full + Netlify sha + prod smoke (team create as anon happy-path NOT smoke-testable in prod without paying — verify page 200s + 409/400 shapes only).

## Self-Review Notes

- Proposal coverage: P1d → Tasks 1,3,4; P1e → shipped, verified by Task 7; consent line → Tasks 2,3,4; team events → Task 5; roster flag → Task 6. Deviation: notes field stays pre-payment (flagged). Wave 3 items untouched.
- Type consistency: `upsertGuestUser` signature defined Task 1, consumed Task 3. `TEAM_EVENTS`/`SERVER_EVENTS.teamDepositPaid` defined Task 5 only.
- Risk note: Task 3's 409-for-existing-email changes the anon submit contract — Task 4's client work depends on it; execute in order.
