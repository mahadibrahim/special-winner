# League Solo Audit Fixes (F1–F9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the developmental-league solo signup audit findings — age gate (F1), COPPA at collection (F2), schedule-copy bug (F3), derived door kicker (F4), analytics gaps (F5), closed-state capture (F6), seed gap (F8), hub hop (F9) — as two small CI-gated PRs.

**Architecture:** PR A (`feat/league-age-gate-coppa`, off origin/main) hardens the registration write path: a pure age-eligibility helper enforced in both registration endpoints plus client-side inline validation, and parental-consent capture moved to collection time on the guest path. PR B (`feat/league-funnel-quick-wins`, **stacked on feat/youth-guest-trial** because both touch `src/lib/analytics/events.ts`) is copy/instrumentation/seed work with no schema changes. F7 (payment-step mobile polish) is deferred to a design pass — owner-visible layout change, low severity.

**Tech Stack:** Astro/React/Drizzle/Zod as established; no schema changes (COPPA columns exist).

**Spec:** The audit findings + owner decisions (2026-09-05, in-chat): F1 = HARD BLOCK both directions with a "think this is wrong? contact us" escape; F2 = mirror the guest-trial flow (checkbox at collection + stamps at checkout); F4 = kicker derived from live terms. Memory record: design-system-v2-broadsheet.md "DEV-LEAGUE SOLO AUDIT".

## Global Constraints

- Two branches: PR A off `origin/main`; PR B off `feat/youth-guest-trial` (#635). Small PRs; owner merges.
- Age is computed **on the season start date** (fall back to `now` when `startDate` is null), using the same year-math as `ageOnDate` in `src/lib/classes/book-child.ts:123-131`.
- Error surface for the gate: HTTP 422 `{ error: "age_ineligible", minAge, maxAge, ageGroupName }` — both endpoints identical.
- COPPA checkbox copy must reuse the guest-trial wording: "I am this child's parent or legal guardian and I consent to Aspire collecting their information for this class." with "class" → "program", plus the "Required by federal law (COPPA) for participants under 13." sentence (see `trial-booking.tsx` guest form / `add-dependent-form.tsx:15`).
- Consent audit ip/user-agent from request context, never the body. No PII in analytics props.
- A season with `ageGroup: null` gates nothing (open-age divisions exist) — both server and client must skip the check cleanly.
- Existing e2e/API tests that create youth registrations must be updated in the same task that changes the contract (guest-checkout youth branch gains a required `parentalConsent`; a wrong-age fixture would now 422).

## File Structure

PR A — Create: `src/lib/registrations/age-eligibility.ts`, `tests/unit/registrations/age-eligibility.test.ts`. Modify: `src/pages/api/registrations/guest-checkout.ts`, `src/pages/api/registrations/index.ts`, `src/components/registration/guest-info-step.tsx`, `src/components/registration/registration-wizard.tsx`, `src/components/registration/who-step.tsx` (only if the signed-in dependent picker lacks bounds display), `tests/api/registrations/*` (existing files covering these endpoints), affected `tests/e2e/*` youth registration specs.

PR B — Modify: `src/lib/leagues/rail-content.ts` (+ its unit test), `src/lib/leagues/youth-league-page-data.ts`, `src/lib/youth/league-page-content.ts`, `src/components/youth/youth-sport-league-page.astro`, `src/components/leagues/seasons-finder-section.tsx`, `src/components/leagues/youth-division-table.tsx`, `src/components/leagues/DivisionPageLayout.astro`, `src/components/registration/register-experience.tsx`, `src/lib/analytics/events.ts`, `tests/unit/analytics-events.test.ts`, `src/lib/db/seeds/seed-e2e-tests.ts`, `src/pages/youth.astro`.

---

## PR A — feat/league-age-gate-coppa

### Task 1: Pure age-eligibility helper

**Files:** Create `src/lib/registrations/age-eligibility.ts`, `tests/unit/registrations/age-eligibility.test.ts`.

**Interfaces — Produces:** `checkAgeEligibility(opts: { birthDate: string; minAge: number | null; maxAge: number | null; onDate: Date }): { eligible: true } | { eligible: false; reason: "too_young" | "too_old"; age: number }` and a re-usable `ageOnDate(birthDate: string, onDate: Date): number` (copy the exact implementation from `book-child.ts:123-131` into this DB-free module; leave book-child's copy alone — PR-scope isolation, noted as a later dedupe).

- [ ] **Step 1:** Write failing unit tests: exact boundary cases (turns minAge on `onDate` → eligible; one day short → too_young; maxAge exact → eligible; maxAge+1 → too_old; null minAge only gates max; null both → always eligible; invalid/empty birthDate string → treat as eligible:false is WRONG — return `{ eligible: true }` and let zod own format validation, test that).
- [ ] **Step 2:** Run: `npx vitest run tests/unit/registrations/age-eligibility.test.ts` → FAIL.
- [ ] **Step 3:** Implement (pure, no imports beyond types).
- [ ] **Step 4:** Tests green. **Step 5:** Commit `feat(registrations): pure age-eligibility helper`.

### Task 2: Server gate — both endpoints

**Files:** Modify `src/pages/api/registrations/guest-checkout.ts` (youth branch — the parent+child payload shape, `~L587-660` region where the child is resolved; the season row with `ageGroupId` is already loaded for registration creation — join/fetch `age_groups.min_age/max_age/name` beside it), `src/pages/api/registrations/index.ts` (signed-in POST — same check against the selected family member's `birthDate`). Test: extend the existing API test files covering each endpoint (find them under `tests/api/registrations/`).

**Interfaces — Consumes:** Task A1's helper. **Produces:** 422 `{ error: "age_ineligible", minAge, maxAge, ageGroupName }` from both endpoints, BEFORE any user/family-member/registration write and before any Stripe call.

- [ ] **Step 1:** Failing API tests: youth guest checkout with an out-of-range DOB → 422 with the exact body; signed-in registration for an out-of-range dependent → 422; in-range passes as today; a season with no age group skips the gate. Use the seeded `e2e-test-spring-2026` (U8) / `e2e-youth-dual-winter-2027` (U12, min 10 max 12) fixtures; unique emails/kids per run.
- [ ] **Step 2:** Run against the dev server → FAIL (currently 200/402 flow).
- [ ] **Step 3:** Implement in both endpoints. Placement: after zod parse + season load, before `upsertGuestUser`/any write. Age date: `season.startDate ? new Date(season.startDate) : new Date()`.
- [ ] **Step 4:** Tests green; re-run the files' existing cases (no regression). **Step 5:** Commit.

### Task 3: COPPA at collection (guest youth branch)

**Files:** Modify `src/pages/api/registrations/guest-checkout.ts`: youth (`legacyGuestCheckoutSchema`) gains `parentalConsent: z.literal(true)`; after `resolvePerson` creates/dedupes the child, stamp `family_members.parental_consent_given_at/by/ip` (skip if already stamped) and write the `consents` type `parental` row gated on `hasActiveConsent` — at CHECKOUT time, not post-payment. Keep the existing post-payment write (it is already `hasActiveConsent`-gated, so it becomes a no-op backstop). Reference implementation: `src/pages/api/classes/guest-trial.ts` COPPA block. Test: extend the same API file — after a successful youth guest checkout, the family_members row has the stamps and a parental consent row exists (query via an existing test helper or a follow-up authenticated read if the suite has one; otherwise assert via the DB helper pattern the suite already uses).

- [ ] Steps: failing test → run → implement → green → commit. Adult branch (`adultGuestCheckoutSchema`) is untouched.

### Task 4: Client — inline age validation + COPPA checkbox

**Files:** Modify `src/components/registration/guest-info-step.tsx` (props already carry `childBirthDate` at `:62`; season `ageGroup.minAge/maxAge` are in the wizard's season payload — thread them in as new props), `src/components/registration/registration-wizard.tsx` (pass bounds + collect `parentalConsent` into the guest payload; block Continue until checked on the youth guest path), and the signed-in player selection (locate where a dependent is chosen for youth solo — if it renders DOB, add the same inline mismatch error; if the audit's signed-in surface is `who-step.tsx`, wire it there).

Behavior: on DOB change/blur AND on Continue, if out of range show inline: `"{Age group name} is for ages {min}–{max}. {firstName || "This player"} would be {age} when the season starts — think this is wrong? Contact us at hello@aspiresportsohio.com."` — block Continue (hard block per owner decision). COPPA checkbox renders ONLY on the youth guest branch (`!adultSelfFlow && isGuest`), required, exact copy per Global Constraints.

- [ ] Steps: implement → `npx tsc --noEmit` → verify in the browser against the dev server (out-of-range DOB blocks with the message; checkbox gates Continue; server 422 also renders the same inline error as a fallback via the existing error plumbing) → update any e2e spec that walks youth guest registration (grep `tests/e2e/` for the register flow specs; they must now check the checkbox and use in-range DOBs) → run those specs locally → commit.

### Task 5: Gate + PR A

- [ ] `npm run db:seed:e2e`; API files touched re-run green; affected e2e specs green locally; `npm run build`; `npx tsc --noEmit`; push branch; open PR A (body: audit F1/F2, owner decisions, note the trial-flow parity argument); watch CI; owner merges.

---

## PR B — feat/league-funnel-quick-wins (stacked on feat/youth-guest-trial)

### Task 6: F3 — daypart-aware schedule label

**Files:** `src/lib/leagues/rail-content.ts:142-152` `formatDayTime`; its unit test (grep `tests/unit` for rail-content; create `tests/unit/leagues/rail-content.test.ts` if absent).

Replace the hardcoded `nights`: daypart from start hour — `<12 → "mornings"`, `<17 → "afternoons"`, else `"nights"`; no start time → just the day label ("Sat"). Failing test first (`("sat","09:00","11:00") → "Sat mornings · 9–11am"`, `("wed","19:00","22:00") → "Wed nights · 7–10pm"`, `("sun", null, null) → "Sun"`).

### Task 7: F4 — kicker derived from live terms

**Files:** `src/lib/leagues/youth-league-page-data.ts` (developmentalRows exist at `~:96-97`; derive `developmentalTermLabels: string[]` = unique ordered `termLabel`s of those rows), `src/lib/youth/league-page-content.ts:52` (keep the authored string as the empty-catalog fallback), `src/components/youth/youth-sport-league-page.astro` (render the derived labels joined " · " as the developmental door kicker when non-empty). Same treatment for the competitive door's kicker (`:39` "Winter · November – late March") only if trivially symmetric — otherwise leave it and note. Verify in browser: door now reads "Winter 1 2026-27" against staging.

### Task 8: F5 — instrumentation

**Files:** `src/lib/analytics/events.ts` + `tests/unit/analytics-events.test.ts`; `src/components/leagues/seasons-finder-section.tsx`; `src/components/leagues/youth-division-table.tsx` (caller passes `onBook` at `seasons-finder-section.tsx:368`); `src/components/leagues/DivisionPageLayout.astro` (delegated click script like `youth-sport-league-page.astro:716-721`); `src/components/registration/register-experience.tsx`; `src/components/registration/registration-wizard.tsx`.

New catalog entries (LEAGUE_EVENTS block, snake_case, ids only):
```ts
  registrationBlocked: "registration_blocked", // register page dead-ends: reason not_open|closed|already_registered
  guestFormShown: "guest_registration_form_shown", // guest who-step rendered (client-side twin of guest_checkout_started)
```
Wiring: landing `#open` table Book → existing `trackDivisionRegisterClicked({ mode: "individual", surface: "landing" })` (extend the wrapper with an optional `surface` prop, default "term" — keep existing call sites unchanged); landing Level/facet chips → `trackDivisionFilterApplied({ facet, value, surface: "landing" })` (same optional-prop treatment); DivisionPageLayout "Sign Up Solo"/team CTAs → delegated `division_register_clicked` with `surface: "division"`; `register-experience.tsx:144-147` bail-outs + the wizard's `already_registered` friendly state (`registration-wizard.tsx:~1272`) → `registration_blocked` with the reason; guest who-step mount → `guest_registration_form_shown` once per wizard mount. `express_checkout_confirmed`: wire it where the wallet express path confirms in `embedded-payment.tsx` if a natural point exists; otherwise DELETE the dead constant and its type references (decide in-code, note in report). Unit tests for every new/extended wrapper.

### Task 9: F6 — closed-state capture

**Files:** `src/components/registration/register-experience.tsx:140-150` region. Both bail-out states render, instead of the bare message: the message + `<EmptyNotifyForm audience="parent" source="league-closed" />` + a "Back to leagues" link to `/youth/leagues/soccer` (derive the sport link from season payload if it carries the sport slug; hardcode soccer fallback). Reuse the import pattern from `trial-booking.tsx`.

### Task 10: F8 seed + F9 hub links

**Files:** `src/lib/db/seeds/seed-e2e-tests.ts` — extend `e2e-test-spring-2026` (`:2354-2386`) with `termSlug: "spring-2026"`, `termLabel: "Spring 2026"`, `skillLevel: "developmental"` (idempotent update-if-different, matching the file's self-heal patterns). `src/pages/youth.astro:108,221-223` — point the league CTAs at `/youth/leagues/soccer` directly (keep `/youth/leagues` redirect for external links). Run `npm run db:seed:e2e`; verify the term page `/youth/leagues/soccer/spring-2026` now renders the developmental row with its tier badge in the browser.

### Task 11: Gate + PR B

- [ ] Unit + touched API/e2e green; build; tsc; push; open PR B **with base main but note the stack** (merge after #635; GitHub will show only B's own commits once #635 merges — or open with base `feat/youth-guest-trial` and retarget after merge, whichever `gh` supports cleanly); watch CI; owner merges.

## Self-Review notes

- F1 both endpoints + client (A2/A4); F2 guest-only with signed-in path already covered by /api/family-members' checkbox (verified in the audit map) — stated, not assumed, in A3's scope.
- Age-gate skip on null ageGroup covered in A2 tests; boundary math pinned in A1.
- B3's optional `surface` props keep existing event call sites and their tests untouched.
- Contract changes ripple to fixtures: A3's required `parentalConsent` breaks any existing API/e2e youth guest checkout test — A3/A4 own updating them (Global Constraints).
