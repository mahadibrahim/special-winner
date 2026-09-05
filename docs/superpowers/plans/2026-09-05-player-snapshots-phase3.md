# Phase 3: Player-Centric Snapshots + Parent Development Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One development record per child, bucketed monthly regardless of source activity (league, class), with a quarterly rollup; class-context assessments finally feed the radar; monthly subset + quarterly full reports email out to parents idempotently. (Spec `docs/superpowers/specs/2026-09-05-coach-activity-pipeline-scoping.md` §3 Phase 3, §6 decisions 3+4.)

**Architecture:** `assessment_snapshots` gains `period_key` (e.g. `2026-09`) and demotes `season_id` to nullable context; legacy rows get `legacy:<seasonId>` keys (collision-proof — the old unique guarantees the new one) and keep rendering until fresh monthly rows exist. `recomputePlayerSnapshots` re-buckets by `player_assessments.assessedAt` month and loses its season-null no-op — the class-assessment dead end dies here. The radar defaults to the CURRENT-QUARTER view (monthly buckets are too sparse for the ≥3-axes gate). Reports clone the trial-convert scan/dedupe pattern with period-suffixed `emailType`, on the repo's first monthly cron.

**Tech Stack:** Astro 5 SSR, React 19, Drizzle/Postgres, Resend (mocked off-prod), Netlify scheduled functions, Vitest, Playwright.

## Global Constraints

- **One migration (0147), written idempotently from the start** (the 0146 lesson: staging's journal rebuild orphans branch-applied migrations — every statement guarded per the 0023/0024 pattern). No `ALTER TYPE ADD VALUE`.
- Assessments are the source of truth; snapshots are derived. Any backfill regenerates from `player_assessments.assessedAt`, never from snapshot timestamps (`snapshotDate`/`updatedAt` are bumped on every recompute — useless for bucketing).
- Auth: assessment WRITE moves to `canCoachReachFamilyMember(userId, familyMemberId, organizationId)` (#626); team/season validators still apply WHEN those fields are supplied. Org-read never grants write.
- Email/cron: `MESSAGING_LIVE` stays untouchable (mock everywhere off prod); every send logs to `email_logs` even when skipped/mocked (the inert-channel convention, `send.ts:2021-2035`) so scans never re-attempt forever; idempotency = period-suffixed `emailType` anti-join (`dev_report_2026-09` — note `email_logs.email_type` is varchar(50), keep keys short) PLUS the pre-send race re-check (trial-convert pattern, `send.ts:1580-1594`). Staging runs crons against thousands of seeded users — assume the cron fires there from day one.
- Radar UI contract: `DomainRadar` keeps taking bare `axes`; the ≥3-populated-axes empty state (`domain-radar.tsx:21,43-52`) is why the DEFAULT view is the quarter rollup, not the newest month. The all-time cards (`overallProgress`/`domainProgress`) stay all-time — label them so the period radar and all-time cards can't be read as disagreeing.
- Tenant scoping on every new query; `.limit(1)` needs orderBy or a uniqueness comment; batched queries.
- E2E conventions (waitForHydration, element clicks, testids, hydration beacons, FK-safe fixtures, no cross-describe shared-mutable fixtures). Subagents: FOREGROUND commands only; never kill/start servers; `npm run build` belongs to the ship gate ONLY (Vite-cache poison).
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility | Fate |
|---|---|---|
| `src/lib/db/schema/assessments.ts` + migration `0147_*` | `period_key` NOT NULL after backfill; season_id nullable; new unique (member, period_key, domain); old unique dropped | modify/create (S1) |
| `src/lib/curriculum/snapshots.ts` | monthly bucketing by assessedAt; trend vs chronologically-previous month; seasonId param removed | modify (S2) |
| `src/lib/curriculum/period-key.ts` | pure helpers: `periodKeyFor(date)`, `quarterKeyFor(date)`, `monthsOfQuarter(qk)`, prev-period math | create (S2) |
| `src/pages/api/coach/assessments/index.ts` | reach-predicate swap; class-context accepted | modify (S3) |
| `src/pages/api/development/reports/[familyMemberId].ts` | response gains `periods` (monthly + quarter rollups); radar data per period | modify (S4) |
| `src/components/dashboard/development-report.tsx` | period selector, quarter default, all-time labels | modify (S4) |
| `src/components/coach/classes/class-roster.tsx` (+ small assess entry) | "Assess" action for class children (no team/season) | modify (S5) |
| `src/lib/email/templates/dev-report-monthly.tsx`, `dev-report-quarterly.tsx` + `src/lib/email/send.ts` | the two report emails + dedupe-guarded send fns | create/modify (S6) |
| `src/pages/api/cron/send-development-reports.ts` + `netlify/functions/scheduled-development-reports.ts` | monthly cron (1st of month; quarterly variant on Jan/Apr/Jul/Oct) | create (S6) |
| `tests/…` | per task | create/modify |

---

### S1: Migration — period-keyed snapshots

`ALTER TABLE assessment_snapshots`: `ADD COLUMN IF NOT EXISTS period_key varchar(16)`; backfill `UPDATE … SET period_key = 'legacy:' || season_id WHERE period_key IS NULL` (collision-proof: old triple was unique); `SET NOT NULL`; `CREATE UNIQUE INDEX IF NOT EXISTS assessment_snapshots_member_period_domain_uniq (family_member_id, period_key, domain_id)`; `DROP INDEX IF EXISTS assessment_snapshots_member_season_domain_uniq`; `ALTER COLUMN season_id DROP NOT NULL`. Schema TS mirrors. Every statement idempotency-guarded. Constraint tests (dupe triple rejected; legacy + monthly keys coexist; season_id null accepted). Apply to staging twice.

### S2: Recompute rewrite + period helpers

`src/lib/curriculum/period-key.ts` (pure, dependency-free): `periodKeyFor(date: Date): string` → `YYYY-MM` (org-agnostic UTC — assessments are coach-entered timestamps; document the UTC choice), `quarterKeyFor(date): string` → `YYYY-Qn`, `monthsOfQuarter(quarterKey): string[]`, `previousPeriod(periodKey): string`. Unit tests incl. year boundaries.

`recomputePlayerSnapshots(db, familyMemberId, at: Date)`: buckets = the month of `at` (the new/changed assessment's assessedAt); aggregation query filters `assessedAt` within that month (same latest-per-skill/domain-average logic, seasonId filter GONE); upsert on the NEW unique with `periodKey`, `seasonId: null` for new rows; trend compares against the chronologically previous month's row for (member, domain) — falling back over `legacy:` rows is NOT attempted (trend `new` when no prior monthly row; document). The season-null no-op is deleted. Callers updated: assessments POST passes the inserted assessment's `assessedAt`; e2e seed + demo seed updated (they pass seasons today). Existing snapshot tests (`tests/api/coach/assessment-snapshots.test.ts`) updated to the monthly world; new cases: two assessments same child same skill in different months → two period rows; trend improving across consecutive months; same-month upsert overwrites.

### S3: Class-context assessment writes

`assessments/index.ts` POST: replace `isPlayerOnCoachTeam(auth.teamIds, familyMemberId)` with `canCoachReachFamilyMember(auth.user.id, familyMemberId, auth.organizationId)` (403 message updated to be context-neutral); `teamId`/`seasonId` validators unchanged when supplied; recompute call per S2. GET list gate: check what it uses (`isPlayerOnCoachTeam` at ~:63) — swap to the same predicate (read of a child you can reach; org-staff read stays out of scope for this route this phase — note in header). Update `tests/api/coach/assessment-season-validation.test.ts` expectations if messages changed; NEW API tests: class-template-assigned coach assesses an enrolled child with NO team/season → 201, snapshot row with monthly periodKey exists; unassigned org coach → 403; parent → 403.

### S4: Reports API + radar periods

`[familyMemberId].ts`: response gains `periods: { current: { quarterKey, months: string[] }, radar: Array<{ periodKey | quarterKey, snapshots: {domain, averageLevel, previousAverageLevel}[] }> }` — quarter rollup computed on read by averaging the quarter's monthly rows per domain (skip `legacy:` rows from period math; if a child has ONLY legacy rows, fall back to the existing latest-per-domain behavior so old data keeps rendering). Existing `snapshots` field stays (back-compat, now sourced as: current-quarter rollup if present else legacy fallback — the radar keeps working with zero UI change as safety). `development-report.tsx`: period selector (current quarter default; prior quarters + individual months in a dropdown), all-time labels on the non-period cards. Update `tests/e2e/development-radar.spec.ts` if the seed's radar path changed (seed now produces monthly rows at seed-run month → current quarter → radar renders; verify).

### S5: Coach class-assessment entry

On the coach class roster page (`class-roster.tsx`, #626): per-child "Assess" action opening an assessment flow WITHOUT team/season. Reuse `player-assessment-form.tsx` by extracting/parameterizing its skill-picker sport source: verify what `classSlotTemplates` carries for sport (check schema — templates belong to a program? a sportId? if absent, resolve sport via the template's venue/program chain or add a sport prop resolved server-side in the roster payload). The form currently hard-requires `selectedTeam` (`:227`) — parameterize (team optional; when absent POST omits teamId/seasonId). Keep the team flow byte-identical. E2E: class coach assesses enrolled child from the roster → child's development page (parent view) shows the radar with the new data (THE Phase 3 acceptance test: class activity feeds the player record).

### S6: Report emails + monthly cron

Templates: `dev-report-monthly.tsx` (subset: per-domain level + trend arrows for the month, glows count (`coach_notes` visibleToParent in period), CTA to the child's development page) and `dev-report-quarterly.tsx` (full: quarter rollup per domain, assessments/skills counts, achievements earned in quarter, same CTA) — clone `first-game-recap.tsx` structure/brand handling. Send fns in `send.ts` with the trial-convert dedupe (anti-join on `emailType` = `dev_report_<periodKey>` / `dev_report_<quarterKey>` — fits varchar(50) — plus metadata familyMemberId, plus pre-send re-check, plus skipped-logging on inert channel). Cron `POST /api/cron/send-development-reports`: standard CRON_SECRET shell; scan = children with ≥1 assessment OR parent-visible coach_note in the just-closed period; on quarter months send the quarterly INSTEAD of the monthly (decision 4: monthly subset, quarterly complete); resolve guardians (parentUserId + family_member_parents — mirror how `family/coach-notes.ts` resolves guardianship in reverse); per-candidate try/catch, counters. Netlify `scheduled-development-reports.ts` `schedule("0 13 1 * *", …)` (1st of month, 13:00Z — daytime US). API tests (mock messaging): scan sends once per child-period, re-run skips (anti-join), failed sends retry next run, quarter-month sends quarterly type, child with no period activity skipped.

### S7: Ship gate + final review + PR

Suites: `tests/unit/curriculum/` (or wherever period-key tests land) + `tests/api/coach/assessment*` + `tests/api/development/` (if exists — grep) + new cron tests + `tests/e2e/development-radar.spec.ts` + `tests/e2e/coach-classes.spec.ts` + parent-dashboard; migration idempotency ×2 on staging; tsc; build LAST + server restart. Final whole-branch review (most capable model) + one fix wave + scoped re-review. Browser smoke: radar with period selector, coach class assess flow. Push, PR referencing spec #623 Phase 3; note prod backfill reality (legacy rows keep rendering; fresh monthly data accrues from merge day; optional one-shot historical regeneration listed as a follow-up decision, NOT built).

## Deliberately out of scope

- Historical regeneration of monthly snapshots from old assessments (legacy rows suffice; follow-up decision).
- SMS/WhatsApp report delivery; report PDFs.
- Assessment cadence/nudge changes (`assessments/due.ts` stays team-based this phase).
- Org-staff read surfaces for assessments (spec §6.3 read-openness lands with the broader record-read surface later).
- Camp anything (Phase 4). Session-lifecycle unification (Phase 5).
