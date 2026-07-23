# Team Registration Clarity — PR 2 (Member Truth + Edge Cases + Follow-ups) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The number a team invitee sees is the number they're charged; invitee data stops leaking to anyone with the link; the captain's backstop warning email speaks to the captain; and the PR 1 review follow-ups land.

**Architecture:** The server already computes authoritative share amounts (`createRegistration` applies `assignedShareCents` overrides and returns `amountDueCents`; PR #451). PR 2 threads that truth to the UI: the token GET gains a viewer-scoped `viewerShare` (authed email-match or `?invitee=<id>` ref carried by invite-email links) and stops returning the full invitee list to non-captains; the rail and payment step render the real share; checkout display uses the server's `amountDueCents`. Plus: a captain-specific backstop warning email, team-context already-registered copy, and four small follow-ups from the PR 1 final review.

**Tech Stack:** Astro 5 + React 19, Drizzle, Vitest, Playwright, Resend via `src/lib/email/send.ts`.

**Spec:** `docs/superpowers/specs/2026-07-23-team-registration-clarity-design.md` §3 + §4 (§1/§2 shipped in PR #453). Base: origin/main at `af512ce1` (includes #451 funnel-friction and #452 card system).

## Global Constraints

- **Display-only truth-threading**: never change what the server charges — only what the client shows. `createRegistration` / `create-checkout` remain the pricing authority.
- Never hardcode `200`/`20000` in new code — use `CAPTAIN_DEPOSIT_CENTS`/`CAPTAIN_DEPOSIT_DOLLARS` from `src/lib/registrations/team-deposit.ts`.
- Copy, verbatim where specified: rail fallback *"Your captain set your share — you'll see the exact amount before payment."*; payment-step share label *"Your share — set by your captain"*; mismatch notice *"This email doesn't match your team invite, so your captain's share amount didn't apply. Register with the invited email, or ask your captain to re-invite this one."*; already-registered team variant adds *"To appear on {teamName}'s roster, ask your captain to add you. Nothing more to pay through this link."*; captain warning subject *"Heads up: {$X} in unpaid shares for {teamName}"*.
- A failed email must never fail its caller (cron): try/catch + log, mirroring PR 1's webhook pattern.
- Deadline dates in emails render in `America/New_York` (PR 1 convention).
- Work on branch `feat/team-clarity-pr2` in this worktree. Done = unit suite green (via `./scripts/with-bws.sh npm run test:unit`), API tests green for touched endpoints, `npx tsc --noEmit` zero errors, `./scripts/with-bws.sh npm run build` clean, and the five affected E2E specs green locally (they gate post-merge only).

---

### Task 1: Token endpoint — `viewerShare` + privacy scope-down

**Files:**
- Modify: `src/pages/api/public/team-registrations/[token].ts`
- Test: `tests/api/` — find the existing suite exercising this GET (grep `team-registrations` under `tests/api/`); update + extend it.

**Interfaces:**
- Produces (consumed by Tasks 3–4): response gains `viewerShare: { shareCents: number; status: string } | null`, resolved for (a) an authed viewer whose email case-insensitively matches an invitee (captain or not), or (b) an `?invitee=<uuid>` query param matching a `teamInvitees.id` on this team — (a) wins when both apply. `team.invitees` and `payment.invitees` become **captain-only** (same `isCaptain` check as `viewerCaptainCredit`, but WITHOUT the `teamDepositPaid` gate — visibility isn't payment-gated); non-captains receive `invitees: []` in both places (keep `inviteeCount` and `payment.teamFeeCents/depositCents/collectedCents` public — aggregates only).

- [ ] **Step 1: Write failing API tests** (dev server required — see plan footer). In the existing team-registrations API suite add/adjust:
  - anonymous GET with token: `team.invitees` and `payment.invitees` are `[]`, `inviteeCount` still correct, `viewerShare` null.
  - anonymous GET with `?invitee=<id>` (mint the id in test setup via the invite POST — see Task 2's `inviteeIds`; until Task 2 lands, insert directly via the test DB helper if the suite has one, else query the invite POST response after Task 2 and order tasks accordingly — if that's the situation, mark this assertion `it.todo` and complete it in Task 2's step 4): `viewerShare.shareCents` equals the assigned share.
  - captain-authed GET: full `invitees` arrays still present (existing assertions keep passing).
  - authed non-captain whose email matches an invitee: `viewerShare` set, `invitees` empty.
- [ ] **Step 2: Implement.** In `[token].ts`:
  - After the `viewerCaptainCredit` block (ends ~line 171), compute `isCaptain` ONCE above both uses (hoist the existing check out of the `if (viewer)` so serialization can reuse it; guests → `false`).
  - Add:
```ts
    // Viewer-scoped share: the ONE invitee row this viewer may see. Authed
    // email match wins; otherwise an `?invitee=<id>` ref carried by the
    // personal invite-email link. Never exposes any other invitee.
    const inviteeRef = url.searchParams.get("invitee");
    let viewerShare: { shareCents: number; status: string } | null = null;
    const viewerEmailLower2 = viewer?.email.toLowerCase() ?? null;
    const ownRow = viewerEmailLower2
      ? invitees.find((i) => i.email.toLowerCase() === viewerEmailLower2)
      : null;
    const refRow =
      !ownRow && inviteeRef
        ? inviteesWithIds.find((i) => i.id === inviteeRef)
        : null;
    const shareRow = ownRow ?? refRow;
    if (shareRow) {
      viewerShare = {
        shareCents: shareRow.assignedShareCents,
        status: shareRow.status,
      };
    }
```
    The invitees select (lines ~108–118) must also select `id: teamInvitees.id` (rename the local to `inviteesWithIds` or just add the field — keep serialization from ever emitting `id` to non-captains). `url` comes from `new URL(request.url)` — check the handler's existing context destructure and add `request` if absent.
  - Serialization: `invitees: isCaptain ? invitees.map(...) : []` in BOTH `team.invitees` and `payment.invitees`; add `viewerShare` as a top-level sibling of `viewerCaptainCredit`.
- [ ] **Step 3: Run the API suite for this endpoint** (`CRON_SECRET=<match dev server> TEST_BASE_URL=http://localhost:4321 npm run test:api -- <suite file>`): green.
- [ ] **Step 4: Commit** — `feat(api): team token GET adds viewer-scoped share; invitee list is captain-only`

---

### Task 2: Per-invitee refs in invite emails

**Files:**
- Modify: `src/pages/api/public/team-registrations/[token]/invite.ts`
- Test: same API suite as Task 1 (the invite POST portion).

**Interfaces:**
- Produces: the invite upsert gains `.returning({ id: teamInvitees.id, email: teamInvitees.email })`; each invite email's join link becomes `` `${joinUrl}&i=${row.id}` `` for that recipient (the shared/captain-copied link is unchanged). Task 4 reads `i` from the register URL.

- [ ] **Step 1:** Add `.returning(...)` to the upsert (~line 141–153) and build a `Map<emailLower, id>`. In the email loop (~155–166), pass a per-recipient URL: `` joinUrl: `${joinUrl}&i=${encodeURIComponent(idByEmail.get(email.toLowerCase()) ?? "")}` `` — omit the param entirely when the id is somehow missing (ternary, no dangling `&i=`).
- [ ] **Step 2:** Complete the Task 1 `?invitee=` API assertion using the returned invite POST → GET round-trip (mint via POST invite, then GET with `?invitee=`). Run the suite: green.
- [ ] **Step 3: Commit** — `feat(api): invite emails carry a per-invitee ref for share display`

---

### Task 3: Rail tells the truth in share mode

**Files:**
- Modify: `src/lib/leagues/rail-content.ts`, `src/components/registration/league-context-rail.tsx`, `src/components/registration/register-experience.tsx`
- Test: `tests/unit/rail-content.test.ts`

**Interfaces:**
- `priceLabel` gains an optional third arg: `priceLabel(mode, season, opts?: { shareCents?: number | null })`. Share mode: with `opts.shareCents` → `{ amount: usd(shareCents/100), unit: "your share" }`; without → `{ amount: "", unit: "" }` (rail handles the fallback copy itself). Solo/team modes ignore opts.
- `LeagueContextRail` gains optional prop `shareCents?: number | null`; when `mode === "share"` and no `shareCents`, the price block (desktop lines ~79–84 and the mobile `amount` slot) renders the fallback sentence *"Your captain set your share — you'll see the exact amount before payment."* in the existing small-muted style instead of a dollar figure.
- `RegisterExperience` parses `inviteeRef` from `window.location.search` param `i` (top of component, alongside how `teamToken` arrives), fetches `/api/public/team-registrations/${teamToken}?invitee=${inviteeRef}` when `teamToken` is present (include the param only when set — the fetch also serves authed email-match via `viewerShare`), stores `viewerShareCents: number | null`, passes it to the rail (`shareCents={viewerShareCents}`) and DOWN to `RegistrationWizard` as a new `inviteeShareCents` prop (Task 4 consumes it). Fetch is best-effort: any failure → null, no error UI.

- [ ] **Step 1: Failing unit tests** in `tests/unit/rail-content.test.ts`: share mode with `{ shareCents: 9000 }` → `{ amount: "$90", unit: "your share" }`; share mode without opts → `{ amount: "", unit: "" }`; solo/team unaffected by opts. Run: fails.
- [ ] **Step 2: Implement** the three files per the interface block. Run unit tests: green. `npx tsc --noEmit`: zero errors.
- [ ] **Step 3: Commit** — `feat(register): invite-link rail shows the real assigned share, never the solo price`

---

### Task 4: Payment display truth + mismatch notice (wizard + payment step + guest checkout)

**Files:**
- Modify: `src/components/registration/registration-wizard.tsx`, `src/components/registration/payment-step.tsx`, `src/pages/api/registrations/guest-checkout.ts`

**Interfaces:**
- Wizard accepts `inviteeShareCents?: number | null` (from Task 3's RegisterExperience).
- `PaymentStep` gains `teamShareCents?: number | null`: when set, the "Pay in Full" tile (~lines 275–282) renders `${(teamShareCents/100)}` with the label *"Your share — set by your captain"* replacing "Pay in Full", and the deposit option is not offered for that render (shares are paid in full — guard the deposit radio on `teamShareCents == null`). `OrderSummary`'s amount for this path comes from the same value.
- Wizard passes `teamShareCents={!effectiveCaptainCredit && teamToken ? inviteeShareCents ?? null : null}` to PaymentStep.
- **Checkout display base** (authed path, ~lines 1298–1302): replace the final fallback so a team-token registrant's displayed base is the server's number:
```ts
          const valueCents = effectiveCaptainCredit
            ? effectiveCaptainCredit.dueCents
            : paymentOption === "deposit" && depositValid(season!)
              ? season!.depositCents!
              : teamToken != null && typeof regData.amountDueCents === "number"
                ? regData.amountDueCents
                : fullPriceCents(season!)
```
  (`regData` is the parsed POST /api/registrations response, already in scope; it returns `amountDueCents` — equal to the share when one applied, the full price otherwise, so display always equals charge.)
- **Guest checkout**: `guest-checkout.ts` adds `amountDueCents: regResult.registration.amountDueCents` to BOTH success responses (`paid_zero` ~line 406–413 and the clientSecret body ~line 415–427). Wizard guest path (~lines 1115–1118) mirrors the authed change: `teamToken != null && typeof data.amountDueCents === "number" ? data.amountDueCents : ...existing...`.
- **Mismatch notice**: in `PaymentStep`, new optional prop `shareMismatch?: boolean`; when true render (above the payment options, existing warn style used by other notices in the file — reuse the closest existing pattern):
  *"This email doesn't match your team invite, so your captain's share amount didn't apply. Register with the invited email, or ask your captain to re-invite this one."*
  Wizard computes it: `const shareMismatch = teamToken != null && inviteeShareCents != null && !effectiveCaptainCredit && regData?.amountDueCents != null && regData.amountDueCents !== inviteeShareCents` — i.e. a personal invite ref promised a share the server didn't apply. (Requires stashing `regData.amountDueCents` in state at submit time — add `serverAmountDueCents` state set in both submit paths.) Note the notice can only appear post-submit renders; that's acceptable — it exists to explain the charge they're about to confirm.
- [ ] **Step 1: Implement** all of the above.
- [ ] **Step 2: Verify** `npx tsc --noEmit` zero errors; `./scripts/with-bws.sh npm run test:unit` green (guards against helper regressions); manual check happens in Task 8's browser pass + E2E runs.
- [ ] **Step 3: Commit** — `feat(register): payment step and checkout display the server's share amount; invite-mismatch notice`

---

### Task 5: Already-registered, team-context copy

**Files:**
- Modify: `src/components/registration/registration-wizard.tsx`

**Interfaces:** none new. Uses existing `teamToken` + the team name — the wizard does not currently hold the team name; Task 3's RegisterExperience fetch response includes `team.teamName`; pass it down as `teamName?: string | null` alongside `inviteeShareCents`.

- [ ] **Step 1:** Guest friendly-state (`guestAlreadyRegistered` render, ~lines 1703–1726): when `teamToken` is present, swap the body copy to: heading unchanged; paragraph *"This email already has a spot in this season. {teamName ? `To appear on ${teamName}'s roster, ask your captain to add you.` : "To appear on the team's roster, ask your captain to add you."} Nothing more to pay through this link."* Keep the manage-link sentence and the "Register a different player instead" action.
- [ ] **Step 2:** Authed v1 inline banner (~lines 1245–1261): when `teamToken` present, the `setError` string becomes `` `${firstName} is already registered for this season. To appear on ${teamName ?? "the team"}'s roster, ask your captain to add them — nothing more to pay through this link.` `` (match the existing string's name-interpolation pattern).
- [ ] **Step 3:** `npx tsc --noEmit` zero errors. Commit — `feat(register): already-registered states explain the team-roster path`

---

### Task 6: Captain backstop warning email (replaces the teammate template)

**Files:**
- Modify: `src/lib/email/send.ts` (new builder + sender next to `sendTeamShareReminderEmail`), `src/pages/api/cron/charge-unpaid-team-shares.ts`
- Test: `tests/unit/email/team-backstop-warning.test.ts` (new; mirror `team-deposit-receipt.test.ts` structure)

**Interfaces:**
- `export function buildTeamBackstopWarning(params: TeamBackstopWarningParams): { subject: string; html: string; text: string }` — pure. `TeamBackstopWarningParams = { to: string; captainName: string; teamName: string; joinUrl: string; unpaidTotalCents: number; unpaidCount: number; deadline: Date | null; brand?: BrandId }`.
  - Subject: `` `Heads up: $${(unpaidTotalCents/100).toLocaleString("en-US")} in unpaid shares for ${teamName}` ``
  - Body (html + text): `{unpaidCount} teammate{s} haven't paid. Shares still unpaid are charged to your card on {deadline in America/New_York, "Sep 3" style, or "the payment deadline"}. Nudge them or adjust splits from your team page.` CTA button "Open your team page →" → joinUrl. Follow `buildTeamDepositReceipt`'s exact idiom (escapeHtml on interpolations, inline styles, text variant).
- `export async function sendTeamBackstopWarningEmail(params)` — standard configured/send/log flow, `emailType: "team_backstop_warning"`.
- Cron: the captain send (~lines 125–133) becomes `sendTeamBackstopWarningEmail({ to: team.captainEmail, captainName: team.captainName, teamName: team.teamName, joinUrl, unpaidTotalCents, unpaidCount: unpaid.length, deadline: team.paymentDeadline ?? null, brand })` where `unpaidTotalCents = unpaid.reduce((s, i) => s + i.assignedShareCents, 0)` (compute above the send). Teammate loop unchanged. Wrap the captain send in its own try/catch + `console.error` so a failure can't skip the teammate reminders (check current structure — if the whole team iteration is already try/catch'd, keep that AND isolate the captain send so teammates still get theirs).

- [ ] **Step 1: Failing unit test** — subject exact-match, body contains the dollar total / count / "Sep 3" (noon-ET fixture) / joinUrl, degrades cleanly with `deadline: null` (contains "the payment deadline", no "null"/"NaN"). Run: fails (not exported).
- [ ] **Step 2: Implement** builder + sender. Test: green.
- [ ] **Step 3: Wire the cron.** `npx tsc --noEmit` zero errors; full unit suite green.
- [ ] **Step 4: Commit** — `fix(email): captain gets a captain backstop warning, not the teammate pay-your-share template`

---

### Task 7: PR 1 review follow-ups

**Files:**
- Modify: `src/lib/soccerone/featured-term.ts`, `tests/unit/soccerone-featured-term.test.ts`, `src/lib/stripe/handle-team-deposit-succeeded.ts`, `src/pages/adult/leagues/soccer/[term].astro`
- Delete: `src/components/create-team-form.tsx`

- [ ] **Step 1: uniformPrice canonical framing.** In `featured-term.ts` (~lines 82–90): team half becomes the canonical story — `` `${fmtMoney(p)}/player · team: $${CAPTAIN_DEPOSIT_DOLLARS} reserves it, ${fmtMoney(tp)} total` `` (import the constant). Update `tests/unit/soccerone-featured-term.test.ts` line ~31 expectation to `"$120/player · team: $200 reserves it, $1,050 total"`; the null-on-variance test is unchanged. TDD: update test first, see it fail, then implement.
- [ ] **Step 2: Deposit constants.** `handle-team-deposit-succeeded.ts`: import `CAPTAIN_DEPOSIT_CENTS` from `@/lib/registrations/team-deposit`; line ~136 `amountCents: 20000` → `amountCents: CAPTAIN_DEPOSIT_CENTS` and line ~207 `?? 20000` → `?? CAPTAIN_DEPOSIT_CENTS`.
- [ ] **Step 3: Hero CTA gate.** `[term].astro`: above the hero, `const anyOpenTeam = divisions.some((d) => d.status === "open" && d.signupModes.includes("team"));` and wrap the team CTA anchor (~line 124) in `{anyOpenTeam && (...)}` — "Join solo" CTA unchanged.
- [ ] **Step 4: Delete `src/components/create-team-form.tsx`** (zero importers — verified; re-verify with a grep before deleting).
- [ ] **Step 5:** `npx tsc --noEmit` zero errors; unit suite green; `./scripts/with-bws.sh npm run build` clean.
- [ ] **Step 6: Commit** — `chore(team-clarity): PR1 review follow-ups — canonical uniformPrice, deposit constants, gated hero CTA, dead component removed`

---

### Task 8: Seed fix + full verification battery

**Files:**
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts`

- [ ] **Step 1:** Add `audienceType: "adults"` to the `e2e-adult-open-soccer` program insert (~lines 1699–1712; match the SoccerOne programs' existing pattern at lines 3146/3393). Re-seed: `./scripts/with-bws.sh npm run db:seed:e2e`.
- [ ] **Step 2:** With a dev server up from THIS worktree (`E2E_TEST_ENDPOINTS=yes R2_MOCK=1 ./scripts/with-bws.sh npm run dev`), run the five affected specs: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- register-team-flow registration-adult registration-adult-guest register-flow registration-guest-flow` — all green (risk-assessed LOW: mode derivation keys on age group + URL param, not the seed field).
- [ ] **Step 3:** Full battery: `./scripts/with-bws.sh npm run test:unit`, touched API suites, `npx tsc --noEmit`, `./scripts/with-bws.sh npm run build`.
- [ ] **Step 4:** Browser spot-check (controller): invite-link register page rail (fallback copy without ref; real share with `?i=`), payment step share display, catalog card now says "per player" on adult fixtures.
- [ ] **Step 5: Commit** — `fix(seed): adult e2e program audienceType adults — catalog stops saying "per kid"`

---

**Dev server note:** Tasks 1–2 (API tests) and Task 8 (E2E) need the dev server + fresh seed; the controller manages one server for those phases. E2E specs gate post-merge only — local green is the gate.

**Out of scope / deferred:** `send.ts` file-wide href/subject sanitization sweep (own hygiene pass); persistent captain tracker page and invite-management UX (management fast-follow); `priceLabel`'s vestigial `deposit` field.
