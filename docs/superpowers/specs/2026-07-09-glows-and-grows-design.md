# Glows & Grows — Design Spec

**Date:** 2026-07-09
**Status:** Approved by owner (visibility + flow approach chosen via review)
**Related:** Product-direction review of 2026-07-09 (audit doc
`docs/curriculum/audits/2026-07-09-audit.md`); resolves decision D8 and parts
of D7/D9 from that review.

## Purpose

Make consistent positive reinforcement structurally easy: after every session
(class, camp, clinic, practice), a coach gives each kid a "glow" (something
they did well) and optionally one "grow" (something they're working on) in
under 3 minutes for a full roster, from a phone at the field. Parents see
both — grows always in growth language — turning the family dashboard's
dead "Coach Notes" section into the live channel for coach→parent
development updates.

Product decisions locked in with the owner:

- **Grows are parent-visible**, phrased exclusively via curated "Working
  on…" language so a rushed tap cannot produce something that reads as
  criticism.
- **Capture flow is one kid per screen** (linear swipe-through), not a
  roster grid and not folded into the assessment form.
- **In-app is the only delivery channel for now.** A weekly digest
  (email/WhatsApp) is phase 2 and must not be blocked by this design.
- Coaches primarily run classes, camps, and clinics — all of which
  materialize as `teams` rows, so team-scoped infrastructure covers them.

## Architecture overview

No new tables. The feature assembles existing, currently-unwired
infrastructure:

- **`coach_notes`** (exists, `src/lib/db/schema/teams.ts:316`): categories
  `achievement | encouragement | focus | progress | general`, plus
  `visibleToParent`. Glow rows → `encouragement` (universal chips) or
  `achievement` (skill chips). Grow rows → `focus`. Always
  `visibleToParent: true`.
- **`session_plans`** (exists): source of the roster (via team), the focus
  skills (via segments/activities), and completion state.
- **Curriculum registry** (exists): source of chip language.
- **Family dashboard Coach Notes section** (exists, mock-empty): becomes
  the parent surface.

### One additive migration

`coach_notes.session_plan_id` — nullable uuid FK → `session_plans.id`,
`ON DELETE SET NULL`, plus index on (`session_plan_id`). Enables:
"has this session had glows yet?" (nudge + double-entry guard) and grouping
the parent feed by session. Nullable so ad-hoc notes (future) remain valid.
Migration must be idempotent per repo convention (`ADD COLUMN IF NOT
EXISTS`).

## Components

### 1. Chip content — `src/lib/curriculum/reinforcement.ts` (new)

Pure module, unit-testable, no DB.

- `UNIVERSAL_GLOWS`: ~8 hardcoded chips ("Great effort", "Kind teammate",
  "Brave today", "Great listening", "Never gave up", "Helped a teammate",
  "Positive attitude", "Great focus"). ≤3 words each.
- `getSkillGlow(skillSlug): string | null` and
  `getSkillGrow(skillSlug): string | null` — a curated mapping for the 77
  curriculum skills: one praise phrase ("Sharp first touch") and one
  growth phrase ("Working on looking up while dribbling") per skill,
  written from each skill's existing `coachingTips` /
  `observableBehaviors` language. Curated file, not runtime-generated.
  Unknown slug → null (universal chips always available as fallback).
- `getSessionChips(sessionPlan)`: resolves the session's focus skills
  (from its segments' activities → `skillsDeveloped`) into the
  session-specific glow/grow chip sets, deduped, capped (≤4 skill glows,
  ≤3 grows shown).

### 2. Capture page — `/coach/practices/[id]/glows`

Astro page (SSR, middleware-gated like all `/coach/**`) hosting a
`client:load` React flow (`src/components/coach/glows-grows-flow.tsx`)
that calls `useHydrationBeacon()`.

Flow behavior:

- Loads session + roster + chips via one bootstrap endpoint (below).
  Players with an `absent` attendance record for that session date sort to
  the end, pre-marked skipped (coach can still un-skip).
- One player per screen: name + initials avatar, glow chip group
  (multi-select, max 3), grow chip group (single-select, max 1, each
  phrased "Working on …"), one optional free-text input (single line,
  capped 280 chars), Skip / Next. Progress dots. Back navigation allowed;
  selections persist in component state.
- Nothing is written until the final screen: a summary grid (player →
  chips) and a single **"Share with parents"** button that submits the
  whole batch. Abandoning the flow writes nothing.
- If the session already has glow notes (`session_plan_id` match), the
  page shows the read-only summary with an "Add more" escape hatch
  instead of restarting from scratch (double-entry guard).
- Touch targets ≥44px; chips are large pills; no hover-gated controls;
  layout tested at 375px and 768px widths.

### 3. API — `src/pages/api/coach/sessions/[id]/glows.ts` (new)

- `GET`: bootstrap payload — session summary, roster (with attendance
  status for the session date), chip sets, existing glow/grow notes for
  the session. Auth: coach must own the session's team
  (`getCoachTeamIds` pattern), team pinned to resolved org (D6
  convention). Explicit `orderBy` on all list picks.
- `POST`: batch write. Body zod-validated:
  `{ entries: [{ familyMemberId, glows: string[] (≤3), grow?: string, note?: string (≤280) }] (≤40) }`.
  Server re-validates every chip label against the session's legal chip
  sets + universals (no arbitrary parent-visible text except the free-text
  note, which is stored on the glow row's content). Every
  `familyMemberId` must be on the session team's roster — whole-batch
  reject otherwise (the `coach/messages.ts` pattern). All rows inserted
  in **one transaction**. Response includes per-player created-note ids.
- Note shape written: glow row per player (title = first chip, content =
  all glow chips joined + optional note), grow row per player when
  present (title = grow chip, content = grow chip). Category mapping:
  universal chip → `encouragement`, skill chip → `achievement`, grow →
  `focus`. `visibleToParent: true`, `sessionPlanId` set.

### 4. Entry points

- **Session completion:** after "Mark Complete" succeeds on the session
  detail page, the success state's primary CTA is "Give Glows & Grows →"
  (routes to the capture page). Depends on D4 fixing the completion
  error-handling first.
- **Session detail:** persistent "Glows & Grows" action (label switches
  to "View Glows" once notes exist).
- **Dashboard nudge:** a card listing past completed-or-elapsed sessions
  with zero glow notes ("Glows & Grows for Tuesday's session · 10
  players"). Computed server-side (one query via `session_plan_id`),
  fail-soft like the existing nudge card. Replaces nothing; sits with
  existing dashboard cards.

### 5. Parent surface

- **Family dashboard Coach Notes section** (`coach-notes.tsx`): drop the
  hardcoded mock; fetch via a new parent endpoint
  `GET /api/family/coach-notes` returning `visibleToParent` notes for the
  requesting parent's family members (ownership via the same
  parent/guardian resolution used by the development report — including
  the co-parent join table once D7's access fix lands), newest first,
  grouped by session. Glows styled celebratory; grows under a "What we're
  working on" label. Empty state: honest copy ("Notes from coaches will
  appear here after sessions").
- **Development page:** a compact recent-glows strip above the domain
  cards (reuses the same endpoint filtered to the child).
- The orphaned `/dashboard/notes` page and `coach-notes-full.tsx` are
  deleted (per D9); the family-dashboard section is the single parent
  surface.

## Error handling

- Bootstrap failure → full-page `ErrorBanner` with retry (not a fake
  empty state — the D3/D10 lesson).
- Batch POST failure → `toast.error`, flow state preserved, retry
  available; never a silent local-only "success" (the D2 lesson).
- Partial-batch impossibility: single transaction, whole-batch validation
  before any write.
- Snapshot/radar interactions: none — glows do not touch the assessment
  pipeline.

## Testing

- **Unit** (`tests/unit/curriculum/reinforcement.test.ts`): chip mapping
  covers all 77 skills (praise + grow phrase present, ≤ length caps, no
  internal jargon per the natural-language rule); `getSessionChips`
  dedupe/cap behavior.
- **API** (`tests/api/coach-glows.test.ts`): auth (non-coach 403, coach of
  another team 403), roster whole-batch rejection, chip-label validation,
  transaction atomicity (bad entry → zero rows), double-submit behavior,
  parent endpoint ownership (other parent 403/404, co-parent allowed once
  D7 lands).
- **E2E** (`tests/e2e/coach-glows.spec.ts`): complete session → capture
  flow → two players with chips → share → parent dashboard shows the
  glow. `waitForHydration` before interactions; element clicks only.
  Note: runs post-merge only (`test-full`), so the API layer carries the
  gate.

## Sequencing & dependencies

Built after the D3–D6 dev-loop fixes (shares files with D4's
session-detail changes and D6's auth patterns) and alongside D7 (the
parent endpoint reuses D7's guardian-resolution helper). Supersedes D8;
D9's deletion of `player-notes-editor.tsx` proceeds — the capture flow is
purpose-built and doesn't salvage it.

## Out of scope (explicit)

- Weekly digest / WhatsApp / email delivery (phase 2; unblocked by design).
- Coach-private notes, ad-hoc notes outside sessions (the roster "Add
  note" affordance stays deleted until there's a decided workflow).
- Reactions/replies from parents (two-way messaging remains the existing
  messages surface; channel decision still open).
- Photos on notes.
