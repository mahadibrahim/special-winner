# Coach Session Lifecycle — setup, field mode, wrap-up

**Date:** 2026-07-10
**Status:** Approved design, pre-implementation
**Predecessor:** `2026-07-10-program-blueprint-design.md` (named this as its next spec)

## Why

The Program Blueprint shipped the admin half of the JTBD chain: a director
designs a season's program and distributes prescribed sessions to coaches.
This spec is the coach half — what happens **around a single session**:
getting ready for it, running it from a phone at the field, and closing it
out so the reinforcement chain (glows & grows → parents) and the director's
delivery view both get fed without the coach doing paperwork.

The coach portal today has a practices list, a desktop-ish session-detail
page with segment editing and a post-session reflection modal, and a
separate glows & grows flow. The during-session surface (rotating coaching
prompts, quick notes) was removed in the coach-portal cleanup (PR #355);
this spec restores that job on a foundation that matches how sessions now
work (prescribed structure snapshots, adapted detection, delivery strip).

North-star constraints: phone-first, positive-reinforcement core, no league
nouns on non-league programs (reuse `groupNoun`).

## Shape

**One React island, staged by session state.** New route
`/coach/practices/[id]/live` renders `session-live.tsx` (`client:load`,
`useHydrationBeacon()`), which shows whichever surface matches
`session_plans.status`:

| status | surface |
|---|---|
| `draft` / `planned` | Setup |
| `in_progress` | Field mode; tapping "End session" advances to Wrap-up client-side (status stays `in_progress` until Finish) — a reload while `in_progress` lands back in field mode with a "Wrap up" action available |
| `completed` | Wrap-up in read-only "done" state |
| `cancelled` | dead-end screen linking back to practices |

The existing session-detail page and practices list are untouched except
for a state-aware entry button ("Set up session" → "Resume session" →
"Wrap up") linking to `/live`. Session-detail remains the desktop/manage
view; no existing e2e surface is rewritten.

The island fetches **one composite payload on mount** and never depends on
further reads. All writes go through an ordered, idempotent client queue
(see Resilience).

## Data model (one additive migration)

- `session_plans.started_at` timestamptz NULL — stamped when the coach
  starts the session; `status` transitions to the existing (currently
  unused) `in_progress` enum value.
- **New table `session_captures`** — the field-mode quick-capture inbox:
  - `id` uuid PK
  - `session_plan_id` uuid FK → session_plans (cascade)
  - `roster_id` uuid FK → rosters (who it's about)
  - `kind` enum `glow | observation`
  - `skill_id` uuid FK → skills, NULL
  - `note` text NULL
  - `client_id` text NOT NULL — client-generated idempotency key;
    UNIQUE(`session_plan_id`, `client_id`)
  - `consumed_at` timestamptz NULL — stamped when wrap-up promotes,
    keeps, or discards it
  - `created_at`
- `attendance.session_plan_id` uuid FK NULL → session_plans — precise
  lineage from a field-mode check-off; existing attendance rows and the
  standalone tracker are unaffected (`eventType: "practice"` rows already
  exist keyed by team+roster+date).

No changes to reflection (columns exist on `session_plans`), prompts
(`coach_prompts` already has `during_practice` trigger context), or glows
(`coach_notes` via the existing endpoint).

## API

All endpoints follow the existing coach ownership/tenancy guard pattern
(same checks as `PUT /api/coach/sessions/[id]`; other-org access 404s).

- **`GET /api/coach/sessions/[id]/live`** — the composite payload:
  - session core (status, startedAt, objectives, focus skills, prescribed
    badge info, group noun)
  - resolved segments (order, name, type, duration, activity name,
    activity skills)
  - equipment checklist: union of `equipmentNeeded` across the plan and
    its segments' activities
  - prompt pool: `coach_prompts` filtered to the plan's skills plus
    generic `during_practice` prompts
  - roster, with any attendance rows already recorded for this session's
    date (e.g. pre-marked excused absences) reflected as initial state
  - reinforcement phrase snippets for the focus skills (from
    `src/lib/curriculum/reinforcement.ts` content)
  - existing unconsumed `session_captures`
- **`POST /api/coach/sessions/[id]/captures`** — batch envelope carrying
  captures **and** attendance marks in one flush. Idempotent: captures
  dedupe on (`session_plan_id`, `client_id`); attendance upserts on
  (roster, session). Rejects rosters not on the session's team (404).
- Start / complete / reflection stay on the existing
  `PUT /api/coach/sessions/[id]` (`in_progress` + `startedAt`;
  `completed` + `completedAt` + reflection fields). Transitions are
  no-ops when already applied (safe under retry).
- Glow promotion in wrap-up uses the existing
  `POST /api/coach/sessions/[id]/glows`; promoting/keeping/discarding a
  capture stamps `consumed_at` (part of the captures batch endpoint).

## Surfaces

Visual language: editorial cream design system; outdoor-sized tap targets;
the referee closeout flow is the closest in-repo pattern. Group nouns via
`groupNoun` throughout — never "team" for camps/classes.

### Setup (before)

Vertical read-through: objectives + focus skills, segment timeline,
equipment checklist (checkable client-side only — no persistence),
roster glance with absences. "Adjust plan" deep-links to the existing
segment editor on session-detail, with a quiet note that edits to a
prescribed plan will show as "adapted" to the director (honest, not
scolding — same tone as the prescribed badge). Primary action: **Start
session** → optimistic `in_progress` + `startedAt` (queued if offline).

### Field mode (during)

- **Run-of-show:** big current-segment card, elapsed timer computed
  client-side from `startedAt` (no server ticks), remaining-time bar,
  next-up peek. Advancing segments is **manual** (tap) — the timer
  suggests, the coach decides. Segment advancement is client state, not
  persisted per-segment.
- **Just-in-time prompt:** one rotating prompt tied to the current
  segment's skills; tap to cycle through the pool.
- **Quick capture:** thumb-reach player strip → tap a kid → half-sheet
  with one-tap glow (pre-phrased from reinforcement snippets) or a short
  typed observation → enqueued.
- **Attendance:** first entry into field mode shows check-off — default
  everyone present, tap to flip exceptions.
- Primary action: **End session** → wrap-up.

### Wrap-up (after)

Three-step stepper:
1. **Attendance** confirm/correct.
2. **Glows & grows**, seeded from queued captures — each capture is
   promoted to a parent-visible glow (existing glows endpoint), kept as a
   private note, or discarded; all three stamp `consumed_at`.
3. **Reflection** — `whatWorkedWell` / `whatToImprove` as short free
   text, skippable.

**Finish** sets `completed` + `completedAt` — which is what flips the
director's delivery strip to delivered/adapted (existing logic,
unchanged). Finish is the one action requiring connectivity; if offline
it says so plainly and keeps everything queued (finish from the parking
lot).

## Resilience (load-once)

- Composite payload fetched once on mount, held in memory. Fetch failure
  → full-screen retry (`ErrorBanner`).
- All mutations enter an ordered in-memory queue, flushed on action, on
  the `online` event, and on interval backoff. A quiet "offline — will
  sync" pill shows while flushes fail.
- The queue is mirrored to `sessionStorage` keyed by session id, so a tab
  kill mid-practice survives. No service worker in v1.
- Safe aggressive retry: captures/attendance idempotent server-side;
  status transitions no-op when already applied.

## Error handling

- Server rejects captures for rosters not on the session's team
  (tenancy-pinned 404, standard coach-endpoint pattern).
- Already-completed session → wrap-up renders read-only "done".
- `cancelled` → dead-end screen with a link back to practices.

## Testing

- **Unit:** equipment-union derivation; prompt-pool filtering; capture
  queue reducer (ordering, `client_id` dedupe, flush/retry, sessionStorage
  restore); timer math from `startedAt`.
- **API (`tests/api/coach/`):** live payload shape + tenancy (other org's
  coach 404s); captures batch idempotency (same `client_id` twice → one
  row); attendance writes carry `session_plan_id`; start/complete
  transition no-ops under retry; wrap-up glow promotion stamps
  `consumed_at`.
- **E2E (one spec, `waitForHydration`, click-driven, post-merge
  test-full):** setup → start → advance segment → capture a glow → end →
  wrap-up stepper → completed; assert the director delivery strip shows
  delivered. 3–4 consecutive green local runs before merge, per repo
  convention.

## Out of scope (explicit)

- Full offline PWA / service worker (v1 is load-once + queued sync).
- Persisting per-segment actual timings or segment-advance history.
- Equipment checklist persistence (client-side only).
- Surfacing reflections in the admin delivery view (possible follow-up).
- Editing template/segment content inside the live experience (deep-link
  to the existing editor instead).
- Email/WhatsApp session notifications.
- Coach-portal league-noun renaming outside the new surfaces (existing
  follow-up).
