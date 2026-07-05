# Curriculum Recovery & Development Loop Activation — Design

**Date:** 2026-07-04
**Status:** Approved direction (user, 2026-07-04); spec pending user review
**Companion (separate spec, later):** Curriculum Refinery — agent pipeline for periodic refinement + product generation (§8)

## Context

The youth-development platform is built and live — coach portal (session planner,
assessments, attendance, messaging), parent dashboard (development reports, domain
progress, coach notes), four-corner domain model (technical/tactical/physical/
psychological, weighted, 1–5 scale, per-season snapshots with trend) — but the
curriculum content tables are **empty** (0 domains, 0 skills, 0 activities, 0
assessments on staging). ~45k lines of authored content were deleted from the repo
in cleanup commits `006d17c` (2026-05-03, dev seeds) and `b5f4cc5` (2026-05-19,
day-0 loader) and recovered from git history on 2026-07-04. Analysis (agent audit,
same day) confirmed the content is high quality, matches
`docs/curriculum/content-architecture.md`, and the current schema is nearly
drift-free against it.

Business timeline: Summer camps running now; full youth launch 2027. Goal: coaches
run sessions using our approaches, document them, communicate with parents, and
track kids' progress spider-chart style.

## Key analysis facts this design is built on

- **Generations:** gen-0 base (`src/lib/db/seed-curriculum.ts` — STILL in repo:
  domains, stages, sports, first skills pass), gen-1 "Phase 7" (49 soccer + 49
  basketball activities, 15 session templates, 23 skills, coach training modules —
  deleted), gen-2 "curriculum-v2" (print-ready comprehensive-guide format: 13
  skills × soccer/basketball/hockey, 9 soccer + 5 basketball activities, 4 soccer
  session plans — deleted). The `*-skills-upgrade*.ts` scripts patch rows by
  **hardcoded UUID** and cannot run verbatim.
- **Schema:** no drift except `practiceTemplates.structure` jsonb type lacks the
  v2 `coachingScript?` segment field (type widening, no migration). **No unique
  constraints** on `skills.slug` / `activities.slug` / template names — the old
  seeds' `onConflictDoNothing()` never deduped anything. Sport lookups in old
  seeds are un-scoped `where(eq(sports.slug, …))` — the CLAUDE.md multi-tenant
  hazard.
- **Dead tables:** `assessment_snapshots` and `player_achievements` have zero
  readers/writers in src/. The spider chart needs a compute pipeline built, not
  restored. `player_skill_summary` + `player_assessments` DO have live consumers.
- **Coach guidance:** `coach_prompts` / `coach_resources` / `coaching_principles`
  tables exist with live API consumers returning empty — pure content restore.
- **No chart library** in package.json.

## Design

### 1. Content-as-code (the permanent home)

`src/lib/curriculum/content/` — TypeScript modules exporting typed content, the
single canonical source, versioned with the repo (this is what the Refinery will
later refine via PRs):

```
content/
  reference.ts            // 4 domains (weights), development stages
  soccer/skills.ts        // v2 13 skills, with the 4 upgrade passes folded in by slug
  soccer/activities.ts    // v2 9 + gen-1 49, deduped by slug, v2 wins
  soccer/session-plans.ts // v2 4 + gen-1 templates for gaps
  basketball/{skills,activities,session-plans}.ts
  hockey/skills.ts        // v2 (no hockey activities exist yet — Refinery backlog)
  baseball/skills.ts      // gen-1/upgrade content where available
  coach-guidance.ts       // prompts, resources, principles, training modules
  index.ts                // typed registry: CURRICULUM_CONTENT
```

Rules for the consolidation (mechanical, done once during implementation):
v2 is canonical where it covers; gen-1 fills gaps; upgrade-script payloads are
re-keyed **by slug** onto their target skills; every item keeps a stable `slug`;
orphaned experiments (`activities-soccer-enhanced`, `comprehensive-example`) are
dropped. `seed-curriculum.ts`'s reference data moves into `reference.ts` and that
file is retired.

### 2. Loader (permanent, idempotent, safe)

`scripts/curriculum-load.ts`, kept in the repo (this is reference content, not a
one-off):

- **Upsert by slug/natural key** per table. Enabled by a new **additive
  migration adding unique indexes**: `skills.slug`, `activities.slug`, plus
  natural-key indexes for `practice_templates` and the three coach-guidance
  tables (exact columns confirmed against their schemas during planning) —
  which also permanently fixes the silent-duplicate hazard the old seeds had.
- **Org-scoped sport resolution** with explicit `organizationId` argument +
  `orderBy` (multi-tenant rule). Skills/domains/stages are platform-wide
  reference; activities/templates hang off org-scoped sports.
- Guards: `ALLOW_CURRICULUM_SEED=yes` required; targeting prod additionally
  requires `ALLOW_PROD_AUDIT=yes` (same flags as the original day-0 script).
- `--dry-run` prints a content report (counts per sport/domain/table, adds vs
  updates vs unchanged) — this is the review artifact before any live load.
- Type widening: `practiceTemplates.structure` segments gain
  `coachingScript?: string` (jsonb — no migration).

Rollout: dry-run report → load staging → verify in coach portal UI → load prod
(user-approved step).

### 3. Assessment snapshot pipeline (new build)

`src/lib/curriculum/snapshots.ts`:

- `recomputePlayerSnapshots(familyMemberId, seasonId)` — aggregates
  `player_assessments` → per-domain `averageLevel`, carries forward
  `previousAverageLevel` from the prior snapshot, writes `assessment_snapshots`.
- Trigger: called on assessment write (the existing
  `/api/coach/assessments` POST path) — synchronous, cheap (one player).
- Backfill entry point in the loader script for historical assessments (none
  exist today, so effectively a no-op guard).
- `player_achievements` stays dormant — activation deferred to the Refinery
  phase (explicitly out of scope here).

### 4. Spider chart

Hand-rolled SVG radar component (no new dependency — repo precedent is inline
SVG): `src/components/development/domain-radar.tsx`.

- Axes = the four domains (labels from `skill_domains`); ring scale 1–5; two
  polygons: current `averageLevel` (filled) and `previousAverageLevel`
  (outline) for trend; accessible fallback list of values.
- Used in: parent `dashboard/children/[id]/development` (alongside the existing
  bars, replacing the top summary), and coach `assess/[playerId]` detail.
- Empty state (no assessments yet) uses the existing `EmptyState` primitive with
  copy pointing the coach at the assessment form.

### 5. Loop verification (acceptance criteria, not new features)

With content loaded, walk and fix the end-to-end loop on staging:

1. Coach plans a session from a template (curriculum content visible in planner).
2. Coach documents: attendance + session run recorded.
3. Coach records an assessment → snapshot recomputes.
4. Parent sees: development report with spider chart + domain trend + coach note.
5. Coach → parent message flows (existing messaging; no new comms features in
   this spec — session-recap automation belongs to the Refinery).

Anything broken found on this walk is fixed in-scope (house rule: fix what you
find).

### 6. Testing

- Unit: loader dedupe/upsert semantics (pure transform helpers), snapshot
  compute math, radar geometry (points from values).
- API: coach curriculum endpoints (`/api/coach/skills`, `/prompts`,
  `/resources`) return loaded content on staging; assessment POST recomputes a
  snapshot.
- E2E (post-merge): parent development page renders the radar for a seeded
  assessed player; coach assessment flow. E2E fixtures: seed-e2e-tests gains a
  minimal curriculum fixture (1 skill/domain, platform tables are shared) and
  one assessed test player.
- Migration: unique-index migration must handle pre-existing duplicates
  defensively (dedupe-before-index in the same migration, idempotent SQL).

### 7. Out of scope (this spec)

Achievements activation; new parent-communication automation; curriculum
authoring UI changes; adult-league anything; the Refinery itself.

### 8. Companion project (separate spec, after this ships): Curriculum Refinery

Agent pipeline, designed on top of §1's content-as-code:

- **Refine:** a repo skill + scheduled agent that periodically reviews
  `src/lib/curriculum/content/` (coverage gaps like hockey activities, quality
  vs `content-architecture.md`, coaching-science updates), writes findings to
  the existing `curriculum_reviews` schema, and opens PRs editing the content
  modules — human-reviewed like any code change, loaded by the §2 loader on
  merge.
- **Produce:** generation targets using the existing print infrastructure
  (`/guides/**`, `/minibooks/**` prerendered pages): activity books per
  sport/stage, coach field guides, parent explainer booklets — content pulled
  from the same registry so products never drift from the operational
  curriculum.
- Delivery mechanism candidates: Claude Code skill (`.claude/skills/`) +
  scheduled cloud routine; evaluated in its own brainstorm.
