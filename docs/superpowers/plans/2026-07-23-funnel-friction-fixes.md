# Funnel Friction Fixes (Wave A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every dead end and over-ask the funnel audit found: cancelled-registration lockout, the repeat-registrant bare error, the phone gate, the state-losing sign-in round trip, the pay-then-discover-you're-registered path, and the premature victory copy.

**Architecture:** Server fix first (the cancelled-row bug in `create-registration.ts` — one lookup + one throw branch), then client states in the wizard. The guest "already registered" experience becomes a structured error code + a friendly state + a server-sent manage link (magic link, existing infra). No schema changes. Approved proposal: artifact "Funnel Friction & Card System — Fix Proposal" v2, §01 + §03 Wave A.

**Base:** origin/main e4d2ca46 (includes checkout Waves 1–3 + SMS recapture).

## Global Constraints

- **Worktree:** `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/funnel-friction`, branch `feat/funnel-friction-fixes`. Absolute paths in dispatches.
- **Disclosure rule:** the guest already-registered state discloses no MORE than today's error already does (the raw 400 text already reveals registration existence for an email). The friendly state may confirm "this email has a spot" and trigger an email to that address — never render registration details (name, payment status) to the unauthenticated visitor.
- **Multi-tenant lookup rule (CLAUDE.md):** any `.limit(1)` needs an explicit `orderBy`.
- **v1 youth flow byte-identical** except where a fix explicitly targets shared code (cancelled-row fix applies to all flows deliberately).
- **No PII in analytics props.** New event props additive only.
- **Guest draft stash may contain ADULT self fields only** (first/last/email) — never child fields (the existing guests-excluded-from-drafts comment cites child PII; honor it by scoping, not by keeping the exclusion).
- **E2E:** grep + update affected specs per task; runs in verification (Task 7).

## Task 1: Cancelled rows stop blocking (server) — A1

**Files:** `src/lib/registrations/create-registration.ts` (~:300-312 lookup, ~:433-436 throw); Test: `tests/api/registrations-rejoin.test.ts` (new)

- The existing-registration lookup currently takes the OLDEST row (`asc(createdAt)`, any status). Change: exclude `status = 'cancelled'` rows from the lookup entirely (SQL `ne`/`notInArray`), keep `orderBy asc(createdAt)` on the remainder (multi-tenant rule). A person whose only rows are cancelled therefore falls through to fresh creation.
- The throw at ~:433-436 keeps its behavior for live rows (paid/confirmed), with the error made structured: `RegistrationError(409, "already_registered")`... **CHECK CALLERS FIRST**: the string "This player is already registered for this season" may be asserted in tests/UI. Contract: server returns status 409 with `{ error: "already_registered", message: "This player is already registered for this season" }` — the message string is preserved for humans, the code is new for machines. Update both API routes that surface it (`/api/registrations`, guest-checkout) to pass the code through.
- TDD (API tests, staging server): (a) cancel a registration (find the cancel endpoint/fixture idiom — grep `cancelled` in tests/api) then re-register same person+season → succeeds; (b) paid row → 409 `already_registered`; (c) pending/unpaid → still `resumed`.

## Task 2: Guest repeat-registrant friendly state — A2

**Files:** `src/pages/api/registrations/guest-checkout.ts`; `src/components/registration/registration-wizard.tsx` (~:986-1037 guest submit catch); `src/lib/stripe`-adjacent NOT touched; email via existing magic-link login sender; Test: extend `tests/api/registrations-guest-checkout.test.ts`

- Server: when `createRegistration` throws `already_registered` on the guest path, guest-checkout (a) responds `409 { error: "already_registered" }` and (b) fire-and-forget sends the existing **magic-link login email** (`sendMagicLinkLoginEmail` — the exact sender `handle-registration-payment-succeeded.ts:273` uses) to that email with destination `/dashboard` — the "manage link" from the proposal. Rate-limit consideration: the endpoint is already 5/min/IP; the email send additionally dedupes via the sender's own emailLogs semantics IF it has them — check; if not, cap by reusing the rate limiter with key `regd-manage-link:email-hash` 1/10min (hash the email — no raw email in limiter keys? keys are in-memory only; raw email in key is fine, matches existing patterns — check how other limiters key).
- Wizard: on 409 `already_registered` (guest), replace the red banner with the proposal's state: heading "You're already registered 🎉", body "This email has a spot in this division. We've sent you a link to view and manage it — no sign-in needed.", ghost button "Register a different player instead" → returns to step 1 with the email field focused (adult v2) — plain copy, no details rendered. Authed 409 handled in Task 5.
- Timing note: the proposal says "detected as soon as the email is known" — implement detection AT SUBMIT (method-select), not on keystroke: the check-email collision hook must NOT be extended to reveal registration state pre-submit (bigger oracle surface). The friendly state replacing the payment step satisfies the proposal's intent (never *pays* first — the 409 occurs before any PI is created; verify order in guest-checkout and note it in the report).
- Tests: guest checkout with already-paid fixture → 409 shape; second POST within window → still 409, email deduped (assert via mock outbox count if feasible).

## Task 3: Phone gate removal — A3

**Files:** `src/components/registration/who-step.tsx` (~:86-140); Test: unit if extractable, else e2e assertion

- `computeMissing`: phone no longer contributes to `any` (the gate). The phone field still renders when missing, clearly "(optional)", with SMS consent below when filled. Submit enables without it. First/Last/DOB gating unchanged.
- Grep e2e for who-step profile-completion assertions; update.

## Task 4: Sign-in round trip preserves state — A4

**Files:** `src/components/registration/guest-info-step.tsx` (~:481-489 link); `src/components/registration/registration-wizard.tsx` (draft: ~:304, ~:440-487); Test: e2e

- Redirect carries the full current URL: `redirect=${encodeURIComponent(location.pathname + location.search)}` (client-side — the component is an island; guard SSR).
- Guest ADULT draft stash: on clicking Sign in, stash `{ v, seasonId, firstName, lastName, email }` to sessionStorage key `aspire:guest-draft:{seasonId}` (mirror `teamDraftKey` mechanics from team-create.tsx:228-242). On wizard mount (authed OR guest), if a stash exists for this season: prefill guest fields (guest) or discard after showing nothing (authed users get WhoStep — their profile supersedes; just clear the stash). NEVER stash child fields.
- Signin page: verify `/signin?redirect=` honors an encoded path+query (grep the signin/redirect handling — middleware bounce or signin-form; confirm no open-redirect regression: the redirect target must stay same-origin relative paths — check existing validation; if none, add a `startsWith("/")` guard where consumed).
- e2e: guest types → clicks sign-in link → assert URL carries encoded search params (mode/audience). Full round-trip needs magic-link email — assert the stash exists in sessionStorage instead.

## Task 5: Authed up-front already-registered / resume — A5

**Files:** `src/components/registration/registration-wizard.tsx` (~:413-438 effect, ~:1322-1358 resume card, ~:1093-1096 error path); Test: e2e + API regression

- Fetch `GET /api/registrations` for authed users unconditionally on season load (it's already fetched when `wasCancelled` — widen the gate). Derive for THIS season + selected person scope: (a) confirmed/paid → render "You're already in ✓" state (proposal mock: status line + "View my registration" → /dashboard) before step 1; (b) pending/unpaid → show the existing "Finish your payment" resume card on normal entry too (drop the `wasCancelled` requirement); (c) none → normal flow.
- Nuance: "already registered" is per-familyMember. For self-registration seasons (adult-locked) the self row decides. For youth (v1) a parent may register a SECOND child — do NOT short-circuit the whole wizard when ANY dependent is registered; only surface per-person state (who-step already disables ineligible options — add a "registered ✓" marker on already-registered people instead of a global gate when flow is v1/dependent-capable). Global short-circuit ONLY for adult-locked v2 self flows.
- The 409 from `/api/registrations` (authed, race/edge) renders the same friendly state instead of the generic banner.

## Task 6: Confirm copy — A6

**Files:** `src/components/registration/confirmation-step.tsx` (~:51)
- "Your spot is locked!" → when the CompletionForm will render (waiverSigned false): "You're in — one step left before game 1". When no completion needed (v1/signed): keep celebratory copy. Check tests/e2e for the string.

## Task 7: Verification + PR (controller-run)

- Dev server (bws, E2E_TEST_ENDPOINTS/R2_MOCK/MESSAGING_MOCK/CRON_SECRET), seed. Targeted API: registrations-rejoin (new), registrations-guest-checkout, registrations-self, registration-completion, team suites regression. Full API suite background untruncated. Playwright: registration-adult, registration-adult-guest, register-flow, registration-guest-flow + updated specs. Build + tsc. Final whole-branch review (opus). PR; monitor CI; post-merge watch.

## Self-Review Notes

- Proposal coverage: A1→T1, A2→T2, A3→T3, A4→T4, A5→T5, copy→T6. Non-changes honored (team detour, first-time collision flow, DOB for authed self).
- Ordering: T1 before T2/T5 (both consume the structured 409).
- Risk: T5's per-person nuance is the subtle one — v1 multi-child families must not be blocked.
