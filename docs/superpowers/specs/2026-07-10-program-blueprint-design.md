# Program Blueprint — Design Spec

**Date:** 2026-07-10
**Status:** Approved by owner (build order, authority model, guardrail tiers,
and group language chosen via review)
**JTBD frame:** As an administrator / head coach, I determine the nature and
flow of our classes, camps, and clinics; build those plans; ensure they are
age-appropriate; and distribute them to the right coaches. (The coach-side
before/during/after lifecycle is the follow-on spec.)

## Decisions locked with the owner

- **Build order:** admin design & distribution first; coach session
  lifecycle second.
- **Authority model — guided but adaptable:** distributed sessions arrive as
  `planned` and visibly prescribed; coaches may adapt them; lineage is kept
  and the director can see which sessions diverged. No locking, no
  ownerless copies.
- **Age guardrails — two-tier:** safety-gated content hard-blocks below its
  rule age (with the governing rule cited); ordinary stage skew warns
  visibly but can be dismissed (dismissal recorded).
- **Language:** the grouping entity in the schema is `teams`, but UI copy
  uses program-type-aware nouns — league → "team", camp → "camp group",
  class/clinic → "class" / "group". No user-facing surface in this feature
  says "team" for a non-league program. (Renaming the coach portal's
  existing "My Teams" nav is a logged follow-up, not in scope.)

## What already exists (this feature is a cockpit over a working engine)

- `curriculumSequences` + `curriculumSequenceEntries` (ordered session
  templates, stage-tagged, org-or-global) with admin CRUD at
  `/admin/curriculum/sequences` and hardened endpoints.
- `POST /api/admin/curriculum/sequences/[id]/attach` — attaches a sequence
  to a season and idempotently generates per-group draft `session_plans`
  via `generatePracticeDates` (season-end truncation handled).
- Curriculum age data: stages with age bands, `skills.introductionAge`,
  `activities.appropriateStages`.
- Coach surfaces that receive the output: practices list, schedule,
  session detail (all hardened this week).

## Architecture

### Data (additive only)

1. **`sequence_attachments` table (new):** id, sequenceId FK, seasonId FK,
   distributedBy (users FK), distributedAt, notes. One row per distribution
   event — the anchor for lineage, re-distribution, and audit.
2. **`session_plans.sequence_attachment_id` (new nullable FK →
   sequence_attachments, ON DELETE SET NULL):** marks a session as
   prescribed and keys it to its distribution. `templateId` alone cannot
   distinguish "distributed" from "coach happened to pick the same
   template."
3. **`blueprint_warning_dismissals` (new):** sequenceEntryId FK, dismissedBy,
   dismissedAt, reason enum/text — records stage-skew warnings a director
   consciously accepted.
4. **`src/lib/curriculum/safety-rules.ts` (new curated module):**
   `Record<skillSlug, { minAge: number; rule: string; source: string }>`.
   First entry: heading-related soccer skills/activities per the US Soccer
   heading policy (no heading in training U11 and below). Unit-tested for
   shape and for the invariant that every safety-flagged slug exists in the
   curriculum registry — the same pattern as `reinforcement.ts`.
   Both the builder UI and the attach endpoint evaluate from this single
   module; the rules are never duplicated client-side.

Attach mutation changes: generated sessions get `status: "planned"` (today:
draft), `sequence_attachment_id` set, and generation stays idempotent per
(group, date). Existing draft-generating behavior is migrated, not
preserved — silent drafts were the gap, not a feature.

### The Blueprint workspace

Route: `/admin/programs/[programId]/seasons/[seasonId]/blueprint` (linked
from the program and season admin pages). SSR + one `client:load` island.

- **Program-type-aware arc layout:** camps render Day 1…Day N; classes and
  clinics render Week 1…Week N (session count and cadence derived from the
  season's schedule settings; the arc length follows what
  `generatePracticeDates` would produce, so what you compose is what
  distributes). Leagues render Week 1…Week N as well (practice arc, not
  fixtures).
- **Header:** program name/type, season dates, age group and computed stage
  band — always visible, because guardrails key off it.
- **Slots:** each holds one session template. Slot card: title, duration,
  focus skills (chip per skill), guardrail state (see below). Empty slot:
  "Day 3 — nothing planned yet" + add affordance.
- **Template rail:** right-hand library of `practice_templates` filtered by
  the program's sport and, by default, the season's stage band. A "show all
  stages" toggle widens it — templates outside the band carry their stage
  visibly, and placing one triggers the warn tier immediately.
- **Interactions:** add/replace/remove template per slot; reorder slots;
  open a template in the existing template editor (no duplicate editor
  built here). All persistence through the existing sequence-entry
  endpoints, extended only where the slot model needs ordering metadata
  they don't carry.

### Age guardrails (two-tier), evaluated live and at distribution

Evaluation input: the season's age band (from its age group) mapped to the
curriculum stage band; per-slot template → activities → skills.

- **Block tier:** any activity whose skills hit `safety-rules.ts` below
  `minAge` for this season: the slot refuses placement. Copy pattern:
  "Blocked: heading drills below U11 — US Soccer heading policy." The block
  is also enforced server-side in the sequence-entry write and re-checked
  at distribution (templates can change after composition; distribution is
  the last gate and fails the specific group/date rows with a clear error,
  not the whole distribution).
- **Warn tier:** stage skew (activity's `appropriateStages` excludes the
  season's stage band): amber badge on the slot, expandable to
  per-activity reasons, dismissible. Dismissal writes a
  `blueprint_warning_dismissals` row (who/when) and the badge collapses to
  a quiet acknowledged state. Warnings never block distribution.

### Distribution

"Distribute" is the arc's primary action once at least one slot is filled.

- **Preview step (modal or side pane):** every group in the season × every
  generated date. Per row: group name (program-type noun), date, and flags —
  conflict (the group already has a session that day), truncation (season
  ends before the arc completes), safety re-check failures. Summary line:
  "3 groups · 24 sessions · 2 conflicts."
- **Confirm:** generates sessions transactionally **per group** (one
  group's failure cannot half-populate another; failed groups are reported
  by name and re-distribution picks them up). Sessions arrive `planned`,
  prescribed, lineage set.
- **Coach notification:** one in-app notification per affected coach —
  "Your {season name} {class|camp group|team} schedule is ready — N
  sessions," landing as a dashboard card via the existing nudge-card
  pattern (fail-soft card, real endpoint). No email/WhatsApp in this spec.
- **Re-distribution:** same action later (new group added, arc extended)
  generates only missing (group, date) pairs — the existing idempotency,
  surfaced honestly in the preview ("8 already distributed, 2 new").

### The coach seam (thin — full lifecycle is the next spec)

- Prescribed sessions carry a badge on the practices list, schedule, and
  session detail: "Program plan · from {director first name}". Wording
  warm, never "locked" — coaches edit exactly as their own sessions.
- **Adapted state:** computed, not coach-managed — a prescribed session
  whose segments differ from its template's structure counts as adapted.
  No new coach UI beyond the badge.

### Delivery visibility (director side)

On the blueprint, a per-group delivery strip under each slot (or a
toggleable "delivery" view): ✓ delivered as planned / ✎ adapted / ○ not yet
run / – cancelled, derived from session status + the adapted computation.
Read-only, group-level, framed as curriculum coverage ("Week 3 delivered to
2 of 3 classes"), not coach surveillance. Clicking through opens the
group's session detail.

## Error handling

- Blueprint island: LoadingSkeleton / ErrorBanner + retry on bootstrap;
  toast.error preserving state on slot-save failures (never a full-page
  error after load).
- Distribution: per-group transactional; partial results reported by group
  name; preview always re-runs guardrails server-side.
- All new/changed endpoints follow the hardened conventions:
  requireOrgAdminAccess (admin) / requireCoachPortalAccess (coach reads),
  zod bodies, explicit orderBy on limit(1), no raw error.message.

## Testing

- **Unit:** safety-rules coverage + registry-existence invariant; stage-band
  mapping from age group; adapted-state computation (pure function over
  segments vs template structure).
- **API:** guardrail block on entry write and on distribution; warn +
  dismissal recording; distribution preview correctness (conflicts,
  truncation, idempotent re-distribution counts); generated sessions are
  planned + prescribed + lineage set; notification rows; tenancy (other
  org's director 403s; coach cannot hit admin blueprint endpoints).
- **E2E (post-merge test-full):** director composes a 2-slot camp arc →
  warn appears on an off-stage template and is dismissed → distributes →
  coach sees the badged planned session on their practices list with the
  dashboard notification card.

## Out of scope (explicit)

- Coach before/during/after session lifecycle (next spec: setup view,
  field mode, reflection restoration).
- Renaming "My Teams" and other league nouns across the existing coach
  portal (follow-up).
- Email/WhatsApp delivery of distribution notifications.
- Editing template content inside the blueprint (existing editor is
  linked, not rebuilt).
- Cross-season copying of blueprints (worth doing later; not now).
