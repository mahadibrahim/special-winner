# League Registration Flow Redesign — Design Spec

**Date:** 2026-06-17
**Status:** Design validated in brainstorming (visual companion mockups approved). Pending spec review → implementation plan(s).
**Context:** The league pages (`/adult/leagues`, `/adult/leagues/soccer`, season pages) are bold and editorial. The moment a player clicks **Register** or **Join solo** on a division, that polish falls off a cliff: the solo entry is a bare wizard with a tiny summary card, the team entry is a separate, differently-styled page, and the captain's share link dumps teammates back into the bare wizard. This redesigns the entire register path to the same principles — "think like someone booking a league" — as one coherent experience.

## Goal

Make registering — solo **or** as a team — feel like a continuation of the league pages: bold, contextual ("you're booking *this* division: this night, this venue, this price"), and consistent across every step and both paths. Replace the two-doors-two-pages structure with **one door** and a **persistent league-context shell**. Adopt the proven team payment model (captain deposit + per-teammate shares + captain backstop) that the codebase already anticipates.

## Decisions locked in brainstorming

1. **One door.** The divisions finder's two CTAs collapse to a single **Register →** per division, routing to one canonical URL `/register/{seasonId}`. That page opens on a **"How do you want to join?"** choice (Join solo / Bring a team) with the full league context already visible — the solo/team decision is made *in context*, not via a tiny row button.
2. **Hybrid context shell.** A persistent league-context frame wraps every step: a bold **sticky rail** on desktop (tier-colored division identity, when/where/dates/games, live price, step progress) that collapses to a **pinned condensed strip** on mobile. The rail flips to **sage** on the success step.
3. **Solo flow:** choose mode → **Who's playing** (Myself / Someone else) → **Sign & agree** (rules + waiver + refund) → **Payment** (full inline card/bank form, completed on-page) → **You're in** (confirms spot + receipt; schedule/calendar promised *later*, after registration closes).
4. **Team flow + payment model:** captain → **Reserve team + deposit** (card saved on file) → **Invite** (by email with assigned shares **and** a shareable link) + **live payment tracker** → teammates **claim a spot** via the join landing and pay their share → **captain backstop**: unpaid shares are auto-charged to the captain's card after the deadline. This is the researched industry standard (Players Sport & Social "TeamPayer", LeagueApps).

## Current architecture (what we're changing)

- **Entry:** `src/components/leagues/divisions-finder.tsx` builds `registerHref(d)` → `/register/team/{seasonId}` (team-only signup), `/register/{seasonId}` (individual), or the season-interest API (forming).
- **Solo:** `src/pages/register/[seasonId].astro` is a bare `<main pt-24>` wrapper around `<RegistrationWizard>` (`src/components/registration/registration-wizard.tsx`), which fetches the season and shows a small summary card, then runs steps player→agreements→payment→confirm. Payment is `payment-step.tsx` (bank/card, surcharge) → guest-checkout / authed checkout. Solo registration gate: `src/lib/registrations/create-registration.ts` (`if (season.status !== "open")`).
- **Team:** `src/pages/register/team/[seasonId].astro` (its own editorial hero) → `src/components/create-team-form.tsx` → `POST /api/public/team-registrations` → returns `joinUrl` → captain link to `/register/{seasonId}?team={inviteToken}`. Backed by `team_registrations` + `team_registration_members` (`src/lib/db/schema/team-registrations.ts`): captain fields, `inviteToken`, status `forming|roster_complete|cancelled`, members with role `captain|member`.
- **Relevant existing rails:** `programs.depositCents` + `programs.allowDeposit`; `registrations.registrationType` (`full|deposit`) + status `deposit_paid`; `payments` type `deposit`. Season division metadata (`termSlug`, `divisionGender`, `skillLevel`, `dayOfWeek`, `startTime`, `endTime`) already exists and feeds the rail. People are created via `resolvePerson()` (`src/lib/registrations/resolve-person.ts`).

The `team_registrations` schema explicitly notes: per-player payment is v1; "the TeamPayer-style game-day auto-charge requires a scheduled-job system worth its own design pass." That comment defines our phase boundary.

## Components & files

**New / shared shell:**
- `src/components/registration/league-context-rail.tsx` — the hybrid shell: sticky rail (desktop ≥ lg) / pinned condensed strip (mobile). Props: division identity (name, tier + color, gender), facts (day/time, venue, start date, games count, roster cap), price (solo share / team rate / "your share" / deposit), `step`/`stepCount` progress, and a `variant` (`active|success`) so it can flip sage on confirm. Pure presentational — no data fetching.
- `src/components/registration/register-experience.tsx` — the orchestrator island mounted by `/register/{seasonId}`. Owns the league fetch, the **choose-mode** screen, and renders the rail + the active sub-flow (solo wizard, team-create, or teammate-join) inside it. Calls `useHydrationBeacon()`.
- `src/components/registration/choose-mode.tsx` — the "How do you want to join?" step (Solo / Bring a team cards with prices).

**Reused / refactored:**
- `registration-wizard.tsx` — kept as the solo step engine, but re-skinned to render *inside* the rail shell (the wizard stops drawing its own summary card; the rail owns context). Steps get the bold editorial treatment from the mockups.
- `payment-step.tsx` — unchanged mechanics; the inline card/bank form is surfaced fully on the Payment step (it already is — confirm it renders within the new shell width).
- `create-team-form.tsx` → folded into a `team-create.tsx` sub-flow inside the shell (captain setup). The standalone `src/pages/register/team/[seasonId].astro` page is **retired** (redirects to `/register/{seasonId}` for back-compat).

**Routing:**
- `/register/{seasonId}` — the single canonical entry (SSR; reads `?team={token}`, `?audience=`, `?payment=cancelled`). `?team={token}` → teammate-join landing; otherwise → choose-mode.
- `/register/team/{seasonId}` — 301 → `/register/{seasonId}` (preserve any inbound links).
- `divisions-finder.tsx` — `registerHref` collapses to `/register/{seasonId}` for both team-capable and individual divisions; forming still → season-interest. The `division_register_clicked` analytics `mode` stays (team/individual/interest) so we keep funnel granularity even with one URL.

## Phasing (two implementation plans)

This is one product vision but two separable subsystems. Each phase ships working, testable software; write them as **separate plans, Phase A first.**

### Phase A — Unified entry + context shell + redesigned flows (UI/routing; no new payment mechanics)

Delivers the entire redesigned experience on top of **today's** payment model (each player pays their own share through the existing wizard; captain creates a team and shares a link/invites — no deposit, no backstop yet).

- One-door routing + `divisions-finder` change + `/register/team` redirect.
- `league-context-rail` (hybrid) + `register-experience` orchestrator + `choose-mode`.
- Solo wizard re-skinned inside the shell (who → agree → pay inline → confirm; confirm copy promises schedule later).
- Team-create sub-flow inside the shell (reusing `team_registrations`/`inviteToken`), with **both** invite modes: email invites (capture emails; send invite emails via existing Resend) **and** copyable link; a **roster/payment tracker** that reads which members have registered/paid (read-only of existing per-player registrations).
- Teammate-join landing (`?team={token}`) inside the shell: shows the team + captain + "your share", then the solo steps, then links the resulting registration to the team via `team_registration_members`.

Phase A is fully shippable and already a massive UX win.

### Phase B — Team deposit + shares + captain backstop (payments/schema subsystem)

The TeamPayer model the schema comment defers. Depends on Phase A's team-create sub-flow. **Decisions locked (see below): $200 non-refundable deposit that credits the team fee; captain-assigned per-invitee shares; auto-charge the morning after registration closes with a 3-day warning email.**

- **Schema extension** (`team_registrations`): captain card-on-file (Stripe customer id + payment method id), `depositCents` (=$20000) + deposit payment reference, `paymentDeadline`, and an **invitees** concept (email + captain-assigned `shareCents` + status `pending|paid|charged_to_captain`) distinct from post-registration members. Migration via `db:generate` (additive, idempotent).
- **Captain deposit at team creation:** charge the $200 deposit + save the card (reuse `programs.depositCents`/`allowDeposit` + the existing deposit payment rails). The deposit **credits the team total** (it is not an extra charge). Team is `forming` only after the deposit succeeds.
- **Assigned shares:** captain assigns a $ amount per invited email (sum of shares = team fee − deposit); the teammate-join landing charges that exact `shareCents`; tracker shows collected vs team total.
- **Captain backstop:** a new cron route `src/pages/api/cron/charge-unpaid-team-shares.ts` (following the existing `CRON_SECRET` pattern, e.g. `send-balance-reminders.ts`) charges the captain's saved card for the sum of `pending` shares the morning after `paymentDeadline`. A companion reminder fires ~3 days before close (extend or mirror `send-balance-reminders`). **Infra dependency is satisfied** — the Netlify scheduled-function + cron system already exists (14 routes); this is one more cron, not new infrastructure. (This resolves the schema comment's "needs its own design pass.")

## Data flow

- **Solo:** `register-experience` fetches the league (season + division metadata + price) once → renders rail + choose-mode → solo wizard collects person (`resolvePerson`), agreements, payment → existing checkout creates the `registration` (gate unchanged: season must be `open`) → confirm. Rail reads everything from the single league fetch.
- **Team (A):** captain submits team-create → `POST /api/public/team-registrations` creates `team_registrations` row + `inviteToken` → captain sees tracker + invite UI. Each teammate opens `/register/{seasonId}?token` → registers (own payment) → on success, a `team_registration_members` row links the registration (role `member`; captain's own registration is role `captain`). Tracker polls/loads members.
- **Team (B) adds:** deposit charge + card save at create; per-invitee share assignment; teammate pays assigned share; scheduled job reconciles unpaid → captain charge.

## Error / loading / empty

- League fetch: `LoadingSkeleton` while loading; `ErrorBanner` on failure; if the season is not `open` (or not found), an empty/closed state with a link back to the season page (mirrors the registration gate).
- Choose-mode: if the division is individual-only (no team signup configured) or team-only, skip the choice and go straight to the available path.
- Team tracker: `EmptyState` ("No teammates yet — share your link") until the first member.
- Teammate-join with an invalid/expired token: clear error + fall back to solo on the same division.
- Payment errors: existing `payment-step` handling (toast + inline) preserved.

## Design system

Reuse the editorial cream tokens and tier colors (D=sage, C=ochre, B=orange, A/open=ink), Newsreader display + IBM Plex, and the season-page hero/tab patterns. The rail is navy/ink with the tier-color accent; CTAs orange; success = sage. The condensed mobile strip matches the season-page pinned-strip pattern.

## Testing

- **Unit (`tests/unit/`):** rail content/variant logic (price label per mode: solo share / team rate / your share / deposit; success variant); `registerHref` now-single-URL mapping; any share-math helper (Phase B).
- **API (`tests/api/`):** `team-registrations` create + token fetch still succeed; Phase B — deposit charge path, share assignment, invitee status transitions.
- **E2E (`tests/e2e/`, tag `@critical`):** division **Register →** lands on `/register/{seasonId}` with choose-mode visible; solo path reaches the inline payment step with the rail present; `/register/team/{id}` redirects to the canonical URL; teammate-join token shows the team context. (Per the #225/#229 lesson: tag league-flow E2E `@critical` so the PR gate runs them, not just main's `test-full`.)
- Pages driven by E2E use `useHydrationBeacon()` + `waitForHydration` (the orchestrator island already will).

## Out of scope (follow-ups)

- The captain auto-charge **scheduled-job infrastructure** itself (cron/queue) beyond wiring the Phase B job — if no scheduler exists, that is its own task and Phase B's backstop waits on it.
- Refund/cancellation UX changes beyond surfacing the existing policy copy.
- Roster management for captains post-registration (jersey numbers, etc. — that's the coach/team dashboards, already built elsewhere).
- Non-soccer sports (the flow is sport-agnostic; lights up when those leagues exist).
- Real Aspire photography in the rail (sport-color block placeholder for now).

## Resolved decisions (Phase B)

- **Deposit:** **$200, non-refundable, credits the team fee** (reserves the division spot; counts toward the total, not an extra charge).
- **Share computation:** **captain-assigned per invitee** — captain enters a $ amount per invited email; sum of shares = team fee − deposit.
- **Auto-charge:** **the morning after registration closes**, the captain's saved card is charged for all still-unpaid shares; a **reminder email ~3 days before close** goes to the captain + unpaid teammates.

## Open items to confirm in planning

- **Solo "someone else"** on adult leagues: confirm whether adult divisions ever need the dependent path, or if "Myself" is the only adult case (the youth path already handles dependents elsewhere). Low-risk default: keep "Myself" primary, retain "Someone else" via the existing `resolvePerson` path.
