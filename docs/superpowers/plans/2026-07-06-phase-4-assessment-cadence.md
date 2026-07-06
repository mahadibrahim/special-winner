# Phase 4 — Assessment Cadence & Quality Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/plans/2026-07-06-coach-lifecycle-and-delivery-ops.md`, "Phase 4 — Assessment cadence & quality visibility".

**Goal:** Make non-use of the assessment loop visible — an admin coverage report over per-player×domain staleness, and a non-punitive coach nudge (nav badge + dashboard card deep-linking to the assess page) — without any schema change.

**Architecture:** A pure staleness function (`assessment-cadence.ts`) classifies each roster player × skill domain as fresh/due/overdue/never from `player_assessments.assessedAt` vs `skill_domains.assessmentFrequency`. A thin query layer (`assessment-cadence-query.ts`) feeds it from the existing rosters → registrations → family_members join path. Three consumers: the extended coach `nav-badges` endpoint, a new coach `/api/coach/assessments/due` endpoint backing a dashboard nudge card, and a new admin `/api/admin/curriculum/assessment-coverage` endpoint backing a report page beside the existing `/admin/curriculum` pages.

**Tech Stack:** Existing stack only — Astro 5 + React 19, Drizzle/Postgres, Lucia auth. No new dependencies, **no migrations**.

## Global Constraints

Copied from the program plan; every task's requirements implicitly include these:

- Every admin API endpoint validates tenant ownership via `requireSameOrg*` helpers / org-pinned queries; coach endpoints use `requireCoachAccess*` helpers scoped to team assignments.
- Any `findFirst`/`.limit(1)` gets an explicit `orderBy` (shared CI database hazard). (This plan's queries are all set queries — no `.limit(1)` anywhere.)
- All coach/admin pages are SSR (no `prerender = true`); UI states use `ErrorBanner` / `EmptyState` / `LoadingSkeleton` primitives.
- New timestamps in UTC, displayed in org timezone.
- E2E specs run post-merge only — grep `tests/e2e/` for affected surfaces before merging route changes (accounted for in Task 5).
- Phase 4 implementation runs in a worktree (≥3 tasks, subagent-driven).

**Phase 4 scope-outs (hard boundaries — do not implement):**

- NO blocking or auto-escalating enforcement — visibility only.
- NO coach performance scoring or automated flagging verdicts — the level-distribution summary is data display only.
- NO parent-facing changes of any kind (never show parents staleness).
- NO changes to snapshot computation (`src/lib/curriculum/snapshots.ts` is untouched).
- NO schema changes (see Design Decisions).

## Design Decisions

**1. No schema change — confirmed feasible.** The cadence source of truth already exists: `skill_domains.assessmentFrequency` is a nullable `varchar(50)` (`src/lib/db/schema/curriculum.ts:59`) seeded with `"weekly" | "monthly" | "per_season"` (`src/lib/db/seed-curriculum.ts:178-211`, mirrored in `src/lib/curriculum/content/reference.ts`). Last-assessed derives from `player_assessments.assessedAt`; roster membership from `rosters → registrations → family_members`; coach identity from `teams.coachUserId`. Everything Phase 4 needs is derivable at read time.

**2. Cadence semantics.** `assessmentFrequency` maps to a threshold in days: `weekly`→7, `monthly`→30, `per_season`→90 (a documented approximation — seasons vary in length, and looking up the actual season would make the function impure and ambiguous for players on multiple teams; 90 days is the conservative "a season has passed" reading). Status per player×domain: `never` when the player has zero assessments in the domain; `fresh` when `daysSince < threshold`; `due` when `threshold <= daysSince < 2×threshold` (**exactly at threshold = due**); `overdue` when `daysSince >= 2×threshold`. A null/unrecognized frequency means "no cadence": `fresh` once ever assessed, still `never` when never assessed. Severity rank for rollups: `fresh < due < overdue < never` — "never" is most severe because it means the loop never started for that player/domain, which is exactly the silent-non-use this phase makes visible.

**3. The coach nudge is a dynamic computed card, NOT a seeded `coach_prompts` row.** Verified against how `triggerContext` actually works: `GET /api/coach/prompts` (`src/pages/api/coach/prompts/index.ts`) serves **static content rows** from `coach_prompts` filtered by `triggerContext`/`sportId`/`stageId` with per-coach dismissal rows; `content` is `text NOT NULL` with a global unique index (`coach_prompts_content_uniq`), and the `conditions` jsonb supports only static predicates (`minCoachExperience`, `dayOfWeek`, `weekOfSeason`). There is no mechanism to interpolate per-coach computed data ("4 players on Tigers haven't been assessed in 5 weeks") into a prompt row, and a seeded row would show identical text to every coach regardless of whether anything is due. So: a new coach-scoped endpoint computes the due data, and a new `AssessmentNudgeCard` component renders it in the same JIT-prompt visual idiom (yellow "reminder" styling, matching `CoachingTipCard`'s reminder variant) on the dashboard sidebar. It renders nothing when nothing is due, so there is no dismissal persistence to build — the nudge disappears when the coach records assessments, which is the correct "dismissal". No `coach_prompts` seed row.

**4. Admin report placement: dedicated page `/admin/curriculum/assessment-coverage`, linked from the existing `/admin/curriculum` overview.** The existing admin curriculum tracking view (`/admin/curriculum` → `CurriculumManager`) is a content-library stats overview (skill/activity/template counts) whose established pattern is *cards that link to sub-pages* (`skills.astro`, `activities.astro`, `templates.astro`). The coverage report is an operational table over live assessment data (per-team rows, per-coach rollups, never-assessed player lists) — it doesn't compress into a stats card, and jamming the table into the overview would bloat a page that loads three other endpoints on mount. Decision: a fourth sub-page following the exact `skills.astro` pattern, plus a Quick Links entry on the overview.

**5. "% assessed this period" definition.** A player is **covered** when every domain with a cadence is `fresh`; team coverage % = covered players / roster size. This is cadence-aware ("this period" = each domain's own window) rather than an arbitrary fixed window, and matches the pure function's semantics. The report also exposes raw per-status player counts (`fresh/due/overdue/never` by worst status) and the **never-assessed flag list** = players with zero assessment rows in any domain (the strongest flag, listed by name).

**6. Query scoping choices.** (a) A player's "last assessed" uses **any** `player_assessments` row for that family member (not filtered to team/coach) — staleness is a property of the player's development record, and an assessment by an assistant coach or a previous team still counts. (b) Roster rows are not filtered by `rosters.status` — consistent with the existing coach-scoping helpers (`getCoachPlayerIds` in `src/lib/auth/roles.ts`). (c) The admin report covers teams in **running seasons** (`seasons.status IN ('open','closed','active')`) — `draft`/`forming` teams aren't practicing yet, `completed`/`cancelled` seasons are history. (d) The per-coach level distribution aggregates `player_assessments.level` where `coachUserId` is one of the org's current team coaches AND `familyMemberId` is on an org roster — anchored on author + org players rather than `player_assessments.teamId` (nullable, often unset).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/curriculum/assessment-cadence.ts` | Create | Pure functions: threshold mapping, status classification, player×domain matrix, worst-status rollup, level-distribution summary. No DB imports. |
| `tests/unit/curriculum/assessment-cadence.test.ts` | Create | Unit tests for all pure functions. |
| `src/lib/curriculum/assessment-cadence-query.ts` | Create | DB query layer: `getTeamCadence(db, teamIds, now)`, `getAssessmentsDueCount(db, teamIds, now)`. |
| `src/pages/api/coach/assessments/due.ts` | Create | Coach endpoint: due/overdue/never players grouped by team. |
| `tests/api/coach/assessments-due.test.ts` | Create | Coach endpoint auth + shape tests; nav-badges due-count assertion. |
| `src/pages/api/coach/nav-badges.ts` | Modify | Add `assessmentsDue` to the badge payload. |
| `tests/unit/coach/coach-nav-badges.test.ts` | Modify | Cover the new field. |
| `src/components/portal/portal-layout.tsx` | Modify | Add `assessmentsDue` to `PortalBadges`. |
| `src/lib/admin/nav-super-admin.ts` | Modify | Add `"assessmentsDue"` to the `badgeKey` union. |
| `src/lib/admin/nav-coach.ts` | Modify | Badge the Assessments nav item. |
| `src/components/coach/assessment-nudge-card.tsx` | Create | Dashboard nudge card with deep links to `/coach/assess/[playerId]`. |
| `src/components/coach/coach-dashboard-overview.tsx` | Modify | Mount the nudge card in the sidebar; remove a pre-existing dead import. |
| `tests/e2e/coach-dashboard.spec.ts` | Modify | Conditional post-merge check on the nudge deep link. |
| `src/pages/api/admin/curriculum/assessment-coverage.ts` | Create | Tenant-scoped admin coverage report endpoint. |
| `tests/api/admin/assessment-coverage.test.ts` | Create | Admin endpoint auth/tenancy/shape tests. |
| `src/components/admin/assessment-coverage-report.tsx` | Create | Report UI: team table, coach rollup, never-assessed flags. |
| `src/pages/admin/curriculum/assessment-coverage.astro` | Create | SSR admin page hosting the report. |
| `src/components/admin/curriculum-manager.tsx` | Modify | Quick Links entry pointing at the report. |

---

### Task 1: Pure cadence core — thresholds and status classification

**Files:**
- Create: `src/lib/curriculum/assessment-cadence.ts`
- Test: `tests/unit/curriculum/assessment-cadence.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, no imports).
- Produces (later tasks rely on these exact names):
  - `type CadenceStatus = "fresh" | "due" | "overdue" | "never"`
  - `cadenceThresholdDays(assessmentFrequency: string | null): number | null`
  - `daysBetween(from: Date, to: Date): number`
  - `computeCadenceStatus(lastAssessedAt: Date | null, assessmentFrequency: string | null, now: Date): CadenceStatus`

- [x] **Step 1: Write the failing test**

Create `tests/unit/curriculum/assessment-cadence.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  cadenceThresholdDays,
  computeCadenceStatus,
  daysBetween,
} from "@/lib/curriculum/assessment-cadence";

const NOW = new Date("2026-07-06T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("cadenceThresholdDays", () => {
  it("maps the seeded skill_domains.assessmentFrequency values", () => {
    expect(cadenceThresholdDays("weekly")).toBe(7);
    expect(cadenceThresholdDays("monthly")).toBe(30);
    expect(cadenceThresholdDays("per_season")).toBe(90);
  });

  it("returns null for null or unrecognized values", () => {
    expect(cadenceThresholdDays(null)).toBeNull();
    expect(cadenceThresholdDays("fortnightly")).toBeNull();
  });
});

describe("daysBetween", () => {
  it("returns whole days, flooring partial days", () => {
    expect(daysBetween(daysAgo(30), NOW)).toBe(30);
    // 29 days and 20 hours ago is still 29 whole days.
    expect(
      daysBetween(new Date(NOW.getTime() - (29 * 24 + 20) * 3_600_000), NOW),
    ).toBe(29);
  });
});

describe("computeCadenceStatus", () => {
  it("returns never when the player has no assessment in the domain", () => {
    expect(computeCadenceStatus(null, "monthly", NOW)).toBe("never");
    // never applies even when the domain has no cadence configured
    expect(computeCadenceStatus(null, null, NOW)).toBe("never");
  });

  it("is fresh strictly below the threshold and due exactly at it", () => {
    expect(computeCadenceStatus(daysAgo(29), "monthly", NOW)).toBe("fresh");
    expect(computeCadenceStatus(daysAgo(30), "monthly", NOW)).toBe("due");
  });

  it("becomes overdue at twice the threshold", () => {
    expect(computeCadenceStatus(daysAgo(59), "monthly", NOW)).toBe("due");
    expect(computeCadenceStatus(daysAgo(60), "monthly", NOW)).toBe("overdue");
  });

  it("applies each frequency's own threshold", () => {
    expect(computeCadenceStatus(daysAgo(8), "weekly", NOW)).toBe("due");
    expect(computeCadenceStatus(daysAgo(8), "monthly", NOW)).toBe("fresh");
    expect(computeCadenceStatus(daysAgo(89), "per_season", NOW)).toBe("fresh");
  });

  it("treats an unmapped frequency as no cadence: fresh once assessed", () => {
    expect(computeCadenceStatus(daysAgo(400), null, NOW)).toBe("fresh");
    expect(computeCadenceStatus(daysAgo(400), "fortnightly", NOW)).toBe("fresh");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/curriculum/assessment-cadence.test.ts`
Expected: FAIL — `Cannot find module '@/lib/curriculum/assessment-cadence'` (or equivalent resolve error).

- [x] **Step 3: Write minimal implementation**

Create `src/lib/curriculum/assessment-cadence.ts`:

```typescript
/**
 * Assessment cadence (Phase 4 of the coach-lifecycle program).
 *
 * Pure staleness classification: for a roster player × skill domain, how long
 * since the last `player_assessments` row vs the domain's
 * `assessmentFrequency` (`skill_domains.assessment_frequency`, seeded values
 * "weekly" | "monthly" | "per_season").
 *
 * Semantics (see the phase plan's Design Decisions):
 *   - never   — no assessment ever recorded for the player in the domain
 *   - fresh   — daysSince < threshold (or the domain has no cadence)
 *   - due     — threshold <= daysSince < 2 × threshold (AT the threshold = due)
 *   - overdue — daysSince >= 2 × threshold
 *
 * "per_season" maps to 90 days — a deliberate approximation; resolving the
 * actual season would make this impure and ambiguous for multi-team players.
 *
 * This module is pure by design (no DB imports) so it can be unit-tested
 * exhaustively; querying lives in ./assessment-cadence-query.ts.
 */

export type CadenceStatus = "fresh" | "due" | "overdue" | "never";

const MS_PER_DAY = 86_400_000;

/** Threshold in days for each known assessmentFrequency value. */
export const CADENCE_THRESHOLD_DAYS: Record<string, number> = {
  weekly: 7,
  monthly: 30,
  per_season: 90,
};

/** Null frequency (or an unrecognized value) means "no cadence configured". */
export function cadenceThresholdDays(
  assessmentFrequency: string | null,
): number | null {
  if (!assessmentFrequency) return null;
  return CADENCE_THRESHOLD_DAYS[assessmentFrequency] ?? null;
}

/** Whole days from `from` to `to`, floored (both UTC instants). */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function computeCadenceStatus(
  lastAssessedAt: Date | null,
  assessmentFrequency: string | null,
  now: Date,
): CadenceStatus {
  if (lastAssessedAt === null) return "never";
  const threshold = cadenceThresholdDays(assessmentFrequency);
  if (threshold === null) return "fresh";
  const days = daysBetween(lastAssessedAt, now);
  if (days < threshold) return "fresh";
  if (days < threshold * 2) return "due";
  return "overdue";
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/curriculum/assessment-cadence.test.ts`
Expected: PASS (all tests green).

- [x] **Step 5: Commit**

```bash
git add src/lib/curriculum/assessment-cadence.ts tests/unit/curriculum/assessment-cadence.test.ts
git commit -m "feat(curriculum): pure assessment-cadence status classification"
```

---

### Task 2: Pure cadence matrix and rollup helpers

**Files:**
- Modify: `src/lib/curriculum/assessment-cadence.ts` (append)
- Test: `tests/unit/curriculum/assessment-cadence.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's `CadenceStatus`, `cadenceThresholdDays`, `daysBetween`, `computeCadenceStatus`.
- Produces (later tasks rely on these exact names):
  - `interface CadencePlayer { familyMemberId: string; firstName: string; lastName: string }`
  - `interface CadenceDomain { domainId: string; displayName: string; assessmentFrequency: string | null }`
  - `interface LastAssessedRow { familyMemberId: string; domainId: string; lastAssessedAt: Date }`
  - `interface DomainCadence { domainId: string; displayName: string; assessmentFrequency: string | null; thresholdDays: number | null; status: CadenceStatus; daysSinceLast: number | null }`
  - `interface PlayerCadence { familyMemberId: string; firstName: string; lastName: string; worstStatus: CadenceStatus; hasAnyAssessment: boolean; domains: DomainCadence[] }`
  - `STATUS_RANK: Record<CadenceStatus, number>` (fresh 0 < due 1 < overdue 2 < never 3)
  - `worstStatus(statuses: CadenceStatus[]): CadenceStatus`
  - `computeCadenceMatrix(players: CadencePlayer[], domains: CadenceDomain[], lastAssessed: LastAssessedRow[], now: Date): PlayerCadence[]`
  - `interface LevelDistribution { count: number; mean: number; stdDev: number }`
  - `summarizeLevelDistribution(levels: number[]): LevelDistribution | null`

- [x] **Step 1: Write the failing test**

Append to `tests/unit/curriculum/assessment-cadence.test.ts` (extend the import at the top of the file first):

```typescript
import {
  cadenceThresholdDays,
  computeCadenceMatrix,
  computeCadenceStatus,
  daysBetween,
  summarizeLevelDistribution,
  worstStatus,
} from "@/lib/curriculum/assessment-cadence";
```

Then append these suites at the bottom of the file:

```typescript
describe("worstStatus", () => {
  it("ranks fresh < due < overdue < never", () => {
    expect(worstStatus(["fresh", "due"])).toBe("due");
    expect(worstStatus(["due", "overdue", "fresh"])).toBe("overdue");
    expect(worstStatus(["overdue", "never"])).toBe("never");
    expect(worstStatus([])).toBe("fresh");
  });
});

describe("computeCadenceMatrix", () => {
  const domains = [
    { domainId: "d-weekly", displayName: "Technical", assessmentFrequency: "weekly" },
    { domainId: "d-monthly", displayName: "Tactical", assessmentFrequency: "monthly" },
  ];
  const player = { familyMemberId: "p1", firstName: "Ada", lastName: "Lovelace" };

  it("applies each domain's own frequency to the same player", () => {
    const [row] = computeCadenceMatrix(
      [player],
      domains,
      [
        { familyMemberId: "p1", domainId: "d-weekly", lastAssessedAt: daysAgo(20) },
        { familyMemberId: "p1", domainId: "d-monthly", lastAssessedAt: daysAgo(20) },
      ],
      NOW,
    );
    const byDomain = Object.fromEntries(row.domains.map((d) => [d.domainId, d.status]));
    expect(byDomain["d-weekly"]).toBe("overdue"); // 20 days >= 2 × 7
    expect(byDomain["d-monthly"]).toBe("fresh"); // 20 days < 30
    expect(row.worstStatus).toBe("overdue");
    expect(row.hasAnyAssessment).toBe(true);
  });

  it("flags a never-assessed player across every domain", () => {
    const [row] = computeCadenceMatrix([player], domains, [], NOW);
    expect(row.domains.every((d) => d.status === "never")).toBe(true);
    expect(row.domains.every((d) => d.daysSinceLast === null)).toBe(true);
    expect(row.worstStatus).toBe("never");
    expect(row.hasAnyAssessment).toBe(false);
  });

  it("keeps players independent and carries threshold metadata", () => {
    const p2 = { familyMemberId: "p2", firstName: "Grace", lastName: "Hopper" };
    const rows = computeCadenceMatrix(
      [player, p2],
      domains,
      [{ familyMemberId: "p2", domainId: "d-monthly", lastAssessedAt: daysAgo(30) }],
      NOW,
    );
    const p2Row = rows.find((r) => r.familyMemberId === "p2")!;
    const monthly = p2Row.domains.find((d) => d.domainId === "d-monthly")!;
    expect(monthly.status).toBe("due"); // exactly at the threshold
    expect(monthly.daysSinceLast).toBe(30);
    expect(monthly.thresholdDays).toBe(30);
    expect(rows.find((r) => r.familyMemberId === "p1")!.worstStatus).toBe("never");
  });
});

describe("summarizeLevelDistribution", () => {
  it("returns null when there are no assessments", () => {
    expect(summarizeLevelDistribution([])).toBeNull();
  });

  it("computes mean and population spread, 2dp", () => {
    expect(summarizeLevelDistribution([5, 5, 5])).toEqual({ count: 3, mean: 5, stdDev: 0 });
    expect(summarizeLevelDistribution([2, 4])).toEqual({ count: 2, mean: 3, stdDev: 1 });
    expect(summarizeLevelDistribution([1, 2, 4])).toEqual({ count: 3, mean: 2.33, stdDev: 1.25 });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/curriculum/assessment-cadence.test.ts`
Expected: FAIL — `worstStatus`, `computeCadenceMatrix`, `summarizeLevelDistribution` are not exported.

- [x] **Step 3: Write minimal implementation**

Append to `src/lib/curriculum/assessment-cadence.ts`:

```typescript
// ---------------------------------------------------------------------------
// Player × domain matrix and rollups (still pure — inputs are queried rows).
// ---------------------------------------------------------------------------

export interface CadencePlayer {
  familyMemberId: string;
  firstName: string;
  lastName: string;
}

export interface CadenceDomain {
  domainId: string;
  displayName: string;
  assessmentFrequency: string | null;
}

/** One row per (player, domain) that has at least one assessment: max(assessedAt). */
export interface LastAssessedRow {
  familyMemberId: string;
  domainId: string;
  lastAssessedAt: Date;
}

export interface DomainCadence {
  domainId: string;
  displayName: string;
  assessmentFrequency: string | null;
  thresholdDays: number | null;
  status: CadenceStatus;
  daysSinceLast: number | null;
}

export interface PlayerCadence {
  familyMemberId: string;
  firstName: string;
  lastName: string;
  /** Most severe status across all domains (see STATUS_RANK). */
  worstStatus: CadenceStatus;
  /** False only when the player has zero assessment rows in ANY domain. */
  hasAnyAssessment: boolean;
  domains: DomainCadence[];
}

/**
 * Severity order for rollups. "never" ranks above "overdue" — the loop never
 * started for that player/domain, the exact silent non-use Phase 4 surfaces.
 */
export const STATUS_RANK: Record<CadenceStatus, number> = {
  fresh: 0,
  due: 1,
  overdue: 2,
  never: 3,
};

export function worstStatus(statuses: CadenceStatus[]): CadenceStatus {
  let worst: CadenceStatus = "fresh";
  for (const status of statuses) {
    if (STATUS_RANK[status] > STATUS_RANK[worst]) worst = status;
  }
  return worst;
}

/**
 * Classify every player × domain pair. `lastAssessed` may contain rows for
 * players outside `players` (callers batch-query once per team set) — lookups
 * are keyed, extras are ignored.
 */
export function computeCadenceMatrix(
  players: CadencePlayer[],
  domains: CadenceDomain[],
  lastAssessed: LastAssessedRow[],
  now: Date,
): PlayerCadence[] {
  const lastByKey = new Map<string, Date>();
  for (const row of lastAssessed) {
    lastByKey.set(`${row.familyMemberId}:${row.domainId}`, row.lastAssessedAt);
  }

  return players.map((player) => {
    const domainStatuses: DomainCadence[] = domains.map((domain) => {
      const last =
        lastByKey.get(`${player.familyMemberId}:${domain.domainId}`) ?? null;
      return {
        domainId: domain.domainId,
        displayName: domain.displayName,
        assessmentFrequency: domain.assessmentFrequency,
        thresholdDays: cadenceThresholdDays(domain.assessmentFrequency),
        status: computeCadenceStatus(last, domain.assessmentFrequency, now),
        daysSinceLast: last ? daysBetween(last, now) : null,
      };
    });

    return {
      familyMemberId: player.familyMemberId,
      firstName: player.firstName,
      lastName: player.lastName,
      worstStatus: worstStatus(domainStatuses.map((d) => d.status)),
      hasAnyAssessment: domainStatuses.some((d) => d.daysSinceLast !== null),
      domains: domainStatuses,
    };
  });
}

// ---------------------------------------------------------------------------
// Level-distribution summary (admin report "distribution sanity" — display
// only, no verdicts).
// ---------------------------------------------------------------------------

export interface LevelDistribution {
  count: number;
  mean: number;
  /** Population standard deviation, rounded to 2dp. */
  stdDev: number;
}

export function summarizeLevelDistribution(
  levels: number[],
): LevelDistribution | null {
  if (levels.length === 0) return null;
  const mean = levels.reduce((sum, l) => sum + l, 0) / levels.length;
  const variance =
    levels.reduce((sum, l) => sum + (l - mean) ** 2, 0) / levels.length;
  return {
    count: levels.length,
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
  };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/curriculum/assessment-cadence.test.ts`
Expected: PASS (all Task 1 + Task 2 tests green).

- [x] **Step 5: Commit**

```bash
git add src/lib/curriculum/assessment-cadence.ts tests/unit/curriculum/assessment-cadence.test.ts
git commit -m "feat(curriculum): cadence matrix, worst-status rollup, level-distribution summary"
```

---

### Task 3: Query layer + coach "assessments due" endpoint

**Files:**
- Create: `src/lib/curriculum/assessment-cadence-query.ts`
- Create: `src/pages/api/coach/assessments/due.ts`
- Test: `tests/api/coach/assessments-due.test.ts`

**Interfaces:**
- Consumes: Task 2's `computeCadenceMatrix`, `PlayerCadence`, `STATUS_RANK`; existing `requireCoachAccess` from `@/lib/auth`; existing schema tables.
- Produces (later tasks rely on these exact signatures):
  - `interface TeamCadence { teamId: string; teamName: string; players: PlayerCadence[] }`
  - `getTeamCadence(db: Database, teamIds: string[], now: Date): Promise<TeamCadence[]>`
  - `getAssessmentsDueCount(db: Database, teamIds: string[], now: Date): Promise<number>` — distinct players with `worstStatus !== "fresh"`.
  - `GET /api/coach/assessments/due` → `{ totalPlayersDue: number, teams: [{ teamId, teamName, players: [{ familyMemberId, firstName, lastName, worstStatus, hasAnyAssessment, dueDomains: DomainCadence[] }] }] }` (only non-fresh players; only teams with ≥1 such player; players sorted most-severe first).

- [x] **Step 1: Write the failing API test**

API tests hit the running dev server (start it first — see Step 2). Create `tests/api/coach/assessments-due.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  apiFetch,
  expectJson,
  getCoachCookie,
  getParentCookie,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/coach/assessments/due";

describe("GET /api/coach/assessments/due", () => {
  let coachCookie: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  it("returns 401 unauthenticated", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-coach (parent)", async () => {
    const parentCookie = await getParentCookie();
    const res = await apiFetch(ENDPOINT, { method: "GET", cookie: parentCookie });
    expect(res.status).toBe(403);
  });

  it("returns due players grouped by team, non-fresh only", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET", cookie: coachCookie });
    const json = await expectJson(res, 200);

    expect(typeof json.totalPlayersDue).toBe("number");
    expect(Array.isArray(json.teams)).toBe(true);

    for (const team of json.teams) {
      expect(team.teamId).toBeTruthy();
      expect(typeof team.teamName).toBe("string");
      // Teams only appear when they have at least one non-fresh player.
      expect(team.players.length).toBeGreaterThan(0);
      for (const player of team.players) {
        expect(player.familyMemberId).toBeTruthy();
        expect(["due", "overdue", "never"]).toContain(player.worstStatus);
        expect(typeof player.hasAnyAssessment).toBe("boolean");
        // Every listed player carries at least one non-fresh domain.
        expect(player.dueDomains.length).toBeGreaterThan(0);
        for (const domain of player.dueDomains) {
          expect(["due", "overdue", "never"]).toContain(domain.status);
        }
      }
    }
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Start the dev server in another shell if not already running (`npm run dev:bws` — API tests need it; see also the memory note that `E2E_TEST_ENDPOINTS=yes` must be set on the server for other tenant suites, harmless here). Then:

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run --config vitest.config.ts --project api tests/api/coach/assessments-due.test.ts`
Expected: FAIL — 404 responses (route does not exist), so the 401/403/200 assertions fail.

- [x] **Step 3: Implement the query layer**

Create `src/lib/curriculum/assessment-cadence-query.ts`:

```typescript
/**
 * DB feeder for the pure cadence functions (Phase 4).
 *
 * Scoping choices (see the phase plan's Design Decisions):
 *  - "last assessed" uses ANY player_assessments row for the family member —
 *    staleness is a property of the player's record, not of one coach/team.
 *  - roster rows are not filtered by status, matching getCoachPlayerIds.
 */
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { playerAssessments } from "@/lib/db/schema/assessments";
import { skills, skillDomains } from "@/lib/db/schema/curriculum";
import { rosters, teams } from "@/lib/db/schema/teams";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import {
  computeCadenceMatrix,
  type LastAssessedRow,
  type PlayerCadence,
} from "./assessment-cadence";

export interface TeamCadence {
  teamId: string;
  teamName: string;
  players: PlayerCadence[];
}

/**
 * Full player × domain cadence for a set of teams. One batch of queries for
 * the whole set (teams, rosters, domains, last-assessed), then pure compute.
 */
export async function getTeamCadence(
  db: Database,
  teamIds: string[],
  now: Date,
): Promise<TeamCadence[]> {
  if (teamIds.length === 0) return [];

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(inArray(teams.id, teamIds))
    .orderBy(asc(teams.name));

  const rosterRows = await db
    .select({
      teamId: rosters.teamId,
      familyMemberId: familyMembers.id,
      firstName: familyMembers.firstName,
      lastName: familyMembers.lastName,
    })
    .from(rosters)
    .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
    .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
    .where(inArray(rosters.teamId, teamIds));

  const domainRows = await db
    .select({
      domainId: skillDomains.id,
      displayName: skillDomains.displayName,
      assessmentFrequency: skillDomains.assessmentFrequency,
    })
    .from(skillDomains)
    .orderBy(asc(skillDomains.sortOrder));

  const playerIds = [...new Set(rosterRows.map((r) => r.familyMemberId))];

  const lastRows =
    playerIds.length === 0
      ? []
      : await db
          .select({
            familyMemberId: playerAssessments.familyMemberId,
            domainId: skills.domainId,
            lastAssessedAt: sql<
              string | Date
            >`max(${playerAssessments.assessedAt})`,
          })
          .from(playerAssessments)
          .innerJoin(skills, eq(playerAssessments.skillId, skills.id))
          .where(inArray(playerAssessments.familyMemberId, playerIds))
          .groupBy(playerAssessments.familyMemberId, skills.domainId);

  // max() over a timestamp comes back as a string from some drivers; normalize.
  const lastAssessed: LastAssessedRow[] = lastRows.map((r) => ({
    familyMemberId: r.familyMemberId,
    domainId: r.domainId,
    lastAssessedAt:
      r.lastAssessedAt instanceof Date
        ? r.lastAssessedAt
        : new Date(r.lastAssessedAt),
  }));

  return teamRows.map((team) => {
    const seen = new Set<string>();
    const teamPlayers = rosterRows
      .filter((r) => r.teamId === team.id)
      .filter((r) => {
        if (seen.has(r.familyMemberId)) return false;
        seen.add(r.familyMemberId);
        return true;
      })
      .map((r) => ({
        familyMemberId: r.familyMemberId,
        firstName: r.firstName,
        lastName: r.lastName,
      }));

    return {
      teamId: team.id,
      teamName: team.name,
      players: computeCadenceMatrix(teamPlayers, domainRows, lastAssessed, now),
    };
  });
}

/**
 * Badge count: distinct players across the teams with at least one domain
 * due, overdue, or never assessed.
 */
export async function getAssessmentsDueCount(
  db: Database,
  teamIds: string[],
  now: Date,
): Promise<number> {
  const cadence = await getTeamCadence(db, teamIds, now);
  const duePlayers = new Set<string>();
  for (const team of cadence) {
    for (const player of team.players) {
      if (player.worstStatus !== "fresh") duePlayers.add(player.familyMemberId);
    }
  }
  return duePlayers.size;
}
```

- [x] **Step 4: Implement the coach endpoint**

Create `src/pages/api/coach/assessments/due.ts`:

```typescript
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { requireCoachAccess } from "@/lib/auth";
import { STATUS_RANK } from "@/lib/curriculum/assessment-cadence";
import { getTeamCadence } from "@/lib/curriculum/assessment-cadence-query";

export const prerender = false;

// GET - Players due/overdue/never-assessed on the coach's teams, for the
// dashboard nudge. Visibility only — nothing here blocks any coach action.
export const GET: APIRoute = async (context) => {
  const auth = await requireCoachAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const cadence = await getTeamCadence(getDb(), auth.teamIds, new Date());

    const duePlayerIds = new Set<string>();
    const teams = cadence
      .map((team) => ({
        teamId: team.teamId,
        teamName: team.teamName,
        players: team.players
          .filter((p) => p.worstStatus !== "fresh")
          .sort((a, b) => STATUS_RANK[b.worstStatus] - STATUS_RANK[a.worstStatus])
          .map((p) => {
            duePlayerIds.add(p.familyMemberId);
            return {
              familyMemberId: p.familyMemberId,
              firstName: p.firstName,
              lastName: p.lastName,
              worstStatus: p.worstStatus,
              hasAnyAssessment: p.hasAnyAssessment,
              dueDomains: p.domains.filter((d) => d.status !== "fresh"),
            };
          }),
      }))
      .filter((team) => team.players.length > 0);

    return new Response(
      JSON.stringify({ totalPlayersDue: duePlayerIds.size, teams }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error computing assessments due:", error);
    return new Response(
      JSON.stringify({ error: "Failed to compute assessments due" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
```

- [x] **Step 5: Run test to verify it passes**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run --config vitest.config.ts --project api tests/api/coach/assessments-due.test.ts`
Expected: PASS (3 tests). If the coach fixture has no teams, the 200 test still passes with `teams: []`.

- [x] **Step 6: Commit**

```bash
git add src/lib/curriculum/assessment-cadence-query.ts src/pages/api/coach/assessments/due.ts tests/api/coach/assessments-due.test.ts
git commit -m "feat(coach): assessments-due endpoint over the cadence query layer"
```

---

### Task 4: `assessmentsDue` nav badge

**Files:**
- Modify: `src/pages/api/coach/nav-badges.ts`
- Modify: `tests/unit/coach/coach-nav-badges.test.ts`
- Modify: `src/components/portal/portal-layout.tsx:12-18` (`PortalBadges` type)
- Modify: `src/lib/admin/nav-super-admin.ts:46` (`badgeKey` union)
- Modify: `src/lib/admin/nav-coach.ts:29` (Assessments nav item)
- Test: `tests/api/coach/assessments-due.test.ts` (append one assertion)

**Interfaces:**
- Consumes: Task 3's `getAssessmentsDueCount(db, teamIds, now)`.
- Produces: `GET /api/coach/nav-badges` → `{ inbox: number, assessmentsDue: number }`; `PortalBadges.assessmentsDue?: number`; badge renders on the "Assessments" sidebar item via the existing `badgeKey` plumbing in `PortalLayout` (no changes needed there beyond the type).

- [x] **Step 1: Update the unit test to expect the new field (failing first)**

Replace the whole of `tests/unit/coach/coach-nav-badges.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

let teamIds: string[] = [];
let parentRows: Array<{ parentUserId: string | null }> = [];
let unreadCount = 0;
let dueCount = 0;

vi.mock("@/lib/auth/roles", () => ({
  getCoachTeamIds: async () => teamIds,
}));
vi.mock("@/lib/curriculum/assessment-cadence-query", () => ({
  getAssessmentsDueCount: async () => dueCount,
}));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    selectDistinct: () => ({ from: () => ({ innerJoin: () => ({ innerJoin: () => ({ where: async () => parentRows }) }) }) }),
    select: () => ({ from: () => ({ where: async () => [{ count: unreadCount }] }) }),
  }),
}));

import { GET } from "@/pages/api/coach/nav-badges";

const ctx = () => ({ locals: { user: { id: "u1" } } }) as never;

describe("GET /api/coach/nav-badges", () => {
  beforeEach(() => { teamIds = []; parentRows = []; unreadCount = 0; dueCount = 0; });

  it("returns zeros when the coach has no teams", async () => {
    teamIds = [];
    const res = await GET(ctx());
    expect(await res.json()).toEqual({ inbox: 0, assessmentsDue: 0 });
  });

  it("counts unread conversations and assessments due", async () => {
    teamIds = ["t1"];
    parentRows = [{ parentUserId: "p1" }, { parentUserId: "p2" }];
    unreadCount = 3;
    dueCount = 4;
    const res = await GET(ctx());
    expect(await res.json()).toEqual({ inbox: 3, assessmentsDue: 4 });
  });

  it("still reports assessments due when no roster parents have accounts", async () => {
    teamIds = ["t1"];
    parentRows = [];
    dueCount = 2;
    const res = await GET(ctx());
    expect(await res.json()).toEqual({ inbox: 0, assessmentsDue: 2 });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/coach/coach-nav-badges.test.ts`
Expected: FAIL — payloads are missing `assessmentsDue`.

- [x] **Step 3: Extend the endpoint**

Replace the whole of `src/pages/api/coach/nav-badges.ts` with:

```typescript
import type { APIRoute } from "astro";
import { and, eq, inArray, isNull, isNotNull, gt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema/conversations";
import { rosters } from "@/lib/db/schema/teams";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import { getCoachTeamIds } from "@/lib/auth/roles";
import { getAssessmentsDueCount } from "@/lib/curriculum/assessment-cadence-query";

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// Sidebar badge counts for the coach portal: unread team-scoped inbox +
// players with a due/overdue/never assessment (Phase 4 cadence). Fail-soft:
// any error returns zeros so the sidebar never breaks on a badge fetch.
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  try {
    const teamIds = await getCoachTeamIds(locals.user.id);
    if (teamIds.length === 0) return json({ inbox: 0, assessmentsDue: 0 });

    const db = getDb();
    const assessmentsDue = await getAssessmentsDueCount(db, teamIds, new Date());

    const parents = await db
      .selectDistinct({ parentUserId: familyMembers.parentUserId })
      .from(rosters)
      .innerJoin(registrations, eq(registrations.id, rosters.registrationId))
      .innerJoin(familyMembers, eq(familyMembers.id, registrations.familyMemberId))
      .where(inArray(rosters.teamId, teamIds));
    const parentIds = parents.map((p) => p.parentUserId).filter((x): x is string => !!x);
    if (parentIds.length === 0) return json({ inbox: 0, assessmentsDue });

    const unread = and(
      isNotNull(conversations.lastInboundAt),
      or(
        isNull(conversations.lastOutboundAt),
        gt(conversations.lastInboundAt, conversations.lastOutboundAt),
      ),
    );
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(conversations)
      .where(and(inArray(conversations.parentUserId, parentIds), unread));
    return json({ inbox: row?.count ?? 0, assessmentsDue });
  } catch {
    return json({ inbox: 0, assessmentsDue: 0 });
  }
};
```

- [x] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/coach/coach-nav-badges.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Wire the badge key through the portal chrome**

In `src/components/portal/portal-layout.tsx`, extend the `PortalBadges` type:

```typescript
export type PortalBadges = {
  inbox?: number
  refundsPending?: number
  attention?: number
  mediaQueue?: number
  reportsOwed?: number
  assessmentsDue?: number
}
```

In `src/lib/admin/nav-super-admin.ts` (line 46), extend the `NavItem` badge union:

```typescript
  badgeKey?: "inbox" | "refundsPending" | "attention" | "mediaQueue" | "reportsOwed" | "assessmentsDue";
```

In `src/lib/admin/nav-coach.ts`, badge the Assessments item (line 29):

```typescript
      { name: "Assessments", href: "/coach/assessments", icon: ClipboardList, badgeKey: "assessmentsDue" },
```

No change to `CoachLayout` — it already forwards the whole `/api/coach/nav-badges` payload as `badges`, and `PortalLayout` already renders `badges[item.badgeKey]`.

- [x] **Step 6: Append the live-endpoint assertion to the API test**

Append to `tests/api/coach/assessments-due.test.ts`, inside the existing `describe` block after the last `it`:

```typescript
  it("nav-badges exposes the due count alongside inbox", async () => {
    const res = await apiFetch("/api/coach/nav-badges", {
      method: "GET",
      cookie: coachCookie,
    });
    const json = await expectJson(res, 200);
    expect(typeof json.inbox).toBe("number");
    expect(typeof json.assessmentsDue).toBe("number");
  });
```

- [x] **Step 7: Run tests + typecheck to verify**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run --config vitest.config.ts --project api tests/api/coach/assessments-due.test.ts`
Expected: PASS (4 tests).

Run: `npx tsc --noEmit`
Expected: zero errors (the widened union and type must line up).

- [x] **Step 8: Commit**

```bash
git add src/pages/api/coach/nav-badges.ts tests/unit/coach/coach-nav-badges.test.ts src/components/portal/portal-layout.tsx src/lib/admin/nav-super-admin.ts src/lib/admin/nav-coach.ts tests/api/coach/assessments-due.test.ts
git commit -m "feat(coach): assessmentsDue nav badge on the Assessments sidebar item"
```

---

### Task 5: Coach dashboard nudge card

**Files:**
- Create: `src/components/coach/assessment-nudge-card.tsx`
- Modify: `src/components/coach/coach-dashboard-overview.tsx` (mount card; remove dead `CoachingTipCard` import at line 24 — pre-existing unused import, fix while here)
- Modify: `tests/e2e/coach-dashboard.spec.ts` (post-merge-only spec — update now so `test-full` doesn't silently break later)

**Interfaces:**
- Consumes: `GET /api/coach/assessments/due` (Task 3's response shape).
- Produces: `<AssessmentNudgeCard />` — self-fetching client component; renders `null` while loading, on error, or when nothing is due. Root element carries `data-testid="assessment-nudge"`. Deep links: `/coach/assess/{familyMemberId}?teamId={teamId}` (the existing assess route reads `teamId` from `Astro.url.searchParams`, see `src/pages/coach/assess/[playerId].astro`).

- [x] **Step 1: Create the nudge card component**

Create `src/components/coach/assessment-nudge-card.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, ChevronRight } from "lucide-react";

type DueStatus = "due" | "overdue" | "never";

interface DuePlayer {
  familyMemberId: string;
  firstName: string;
  lastName: string;
  worstStatus: DueStatus;
}

interface DueTeam {
  teamId: string;
  teamName: string;
  players: DuePlayer[];
}

const STATUS_LABEL: Record<DueStatus, string> = {
  due: "Due",
  overdue: "Overdue",
  never: "Not yet assessed",
};

const STATUS_CLASS: Record<DueStatus, string> = {
  due: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  overdue: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  never: "bg-red-500/10 text-red-600 border-red-500/20",
};

const MAX_PLAYERS_SHOWN = 3;

/**
 * Phase 4 JIT nudge for the coach dashboard: players due / overdue / never
 * assessed per the domain cadence, deep-linking to the assess page. Dynamic
 * computed card (not a coach_prompts row — see the phase plan's Design
 * Decisions). Fail-soft: renders nothing while loading, on error, or when
 * nothing is due; recording assessments is the natural "dismissal".
 */
export function AssessmentNudgeCard() {
  const [teams, setTeams] = useState<DueTeam[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach/assessments/due")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setTeams(data?.teams ?? []);
      })
      .catch(() => {
        if (!cancelled) setTeams([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!teams || teams.length === 0) return null;

  return (
    <Card
      data-testid="assessment-nudge"
      className="bg-cream border border-yellow-500/20"
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-yellow-500/10">
            <ClipboardList className="w-4 h-4 text-yellow-600" />
          </div>
          <span className="text-sm font-medium text-ink">Assessments due</span>
        </div>

        {teams.map((team) => (
          <div key={team.teamId} className="space-y-1.5">
            <p className="text-sm text-ink/70">
              {team.players.length}{" "}
              {team.players.length === 1 ? "player" : "players"} on{" "}
              {team.teamName}{" "}
              {team.players.length === 1 ? "needs" : "need"} an assessment
            </p>
            {team.players.slice(0, MAX_PLAYERS_SHOWN).map((player) => (
              <a
                key={player.familyMemberId}
                href={`/coach/assess/${player.familyMemberId}?teamId=${team.teamId}`}
                className="flex items-center gap-2 p-2 rounded-lg bg-cream-2 hover:bg-cream-3 transition-colors group"
              >
                <span className="text-sm text-ink flex-1 truncate">
                  {player.firstName} {player.lastName}
                </span>
                <Badge
                  variant="secondary"
                  className={`border text-[10px] ${STATUS_CLASS[player.worstStatus]}`}
                >
                  {STATUS_LABEL[player.worstStatus]}
                </Badge>
                <ChevronRight className="w-3.5 h-3.5 text-ink/40 group-hover:translate-x-0.5 transition-transform" />
              </a>
            ))}
            {team.players.length > MAX_PLAYERS_SHOWN && (
              <p className="text-xs text-ink/40 pl-2">
                +{team.players.length - MAX_PLAYERS_SHOWN} more on this team
              </p>
            )}
          </div>
        ))}

        <a
          href="/coach/assessments"
          className="flex items-center gap-1 text-xs font-medium text-primary hover:gap-2 transition-all"
        >
          Open assessments
          <ChevronRight className="w-3 h-3" />
        </a>
      </CardContent>
    </Card>
  );
}
```

- [x] **Step 2: Mount it on the dashboard**

In `src/components/coach/coach-dashboard-overview.tsx`, replace the import at line 24:

```tsx
import { CoachingTipCard } from "./coaching-tip-card"
```

with (the old import is dead code — `CoachingTipCard` is never rendered in this file):

```tsx
import { AssessmentNudgeCard } from "./assessment-nudge-card"
```

Then in the sidebar column, insert the card between Quick Actions and the Pre-Practice Checklist. Replace:

```tsx
          <section className="dashboard-section">
            <QuickActions />
          </section>

          {/* Pre-Practice Checklist */}
```

with:

```tsx
          <section className="dashboard-section">
            <QuickActions />
          </section>

          {/* Assessment cadence nudge (Phase 4) — renders nothing when no
              players are due, so it is NOT wrapped in a spacing section. */}
          <AssessmentNudgeCard />

          {/* Pre-Practice Checklist */}
```

(Not wrapping in `<section className="dashboard-section">` is deliberate: the component returns `null` when idle and a wrapper would leave an empty spacing element.)

- [x] **Step 3: Update the post-merge E2E spec**

E2E specs only run in the post-merge `test-full` job — update the coach-dashboard spec now. Append to `tests/e2e/coach-dashboard.spec.ts`, inside the top-level `test.describe("Coach Dashboard", ...)` block (after the `Team Management` describe):

```typescript
  test.describe("Assessment Nudge", () => {
    test("nudge deep links target the assess page when present", async ({ page }) => {
      await page.goto("/coach");
      await waitForPageLoad(page);

      // The nudge only renders when the seeded coach has due/overdue/never
      // players — assert conditionally, like the roster tests above.
      const nudge = page.locator('[data-testid="assessment-nudge"]');
      if ((await nudge.count()) > 0) {
        const link = nudge.locator('a[href*="/coach/assess/"]').first();
        await expect(link).toBeVisible();
        const href = await link.getAttribute("href");
        expect(href).toMatch(/\/coach\/assess\/[0-9a-f-]+\?teamId=[0-9a-f-]+/);
      }
    });
  });
```

(Attribute-only assertions — no clicks or keypresses, so no `waitForHydration` needed per the Playwright conventions.)

- [x] **Step 4: Verify manually and by build**

With the dev server running and signed in as `coach@test.aspiresports.com` / `TestCoach123!`, load `http://localhost:4321/coach`: seeded rosters have few/no assessments, so the nudge should appear with "Not yet assessed" badges; clicking a player lands on `/coach/assess/<id>?teamId=<id>`.

Run: `npx tsc --noEmit`
Expected: zero errors (also confirms removing the dead import broke nothing).

Optionally run the spec locally: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- tests/e2e/coach-dashboard.spec.ts`
Expected: PASS (nudge test passes whether or not the nudge renders).

- [x] **Step 5: Commit**

```bash
git add src/components/coach/assessment-nudge-card.tsx src/components/coach/coach-dashboard-overview.tsx tests/e2e/coach-dashboard.spec.ts
git commit -m "feat(coach): assessment-cadence nudge card on the dashboard"
```

---

### Task 6: Admin assessment-coverage endpoint (tenant-scoped)

**Files:**
- Create: `src/pages/api/admin/curriculum/assessment-coverage.ts`
- Test: `tests/api/admin/assessment-coverage.test.ts`

**Interfaces:**
- Consumes: Task 2's `cadenceThresholdDays`, `summarizeLevelDistribution`; Task 3's `getTeamCadence`; existing `requireOrgAdminAccess` from `@/lib/auth`.
- Produces: `GET /api/admin/curriculum/assessment-coverage` →

```jsonc
{
  "generatedAt": "2026-07-06T…Z",
  "domains": [{ "domainId", "displayName", "assessmentFrequency", "thresholdDays" }],
  "teams": [{
    "teamId", "teamName", "seasonName", "coachUserId", "coachName",
    "rosterCount", "freshCount", "dueCount", "overdueCount", "neverCount",
    "coveragePct",                      // fresh / roster, rounded; null when roster empty
    "neverAssessedPlayers": [{ "familyMemberId", "name" }]  // zero assessments in ANY domain
  }],
  "coaches": [{
    "coachUserId", "coachName", "teamCount", "playerCount", "freshCount", "coveragePct",
    "levelDistribution": { "count", "mean", "stdDev" }  // or null — display only, no verdicts
  }]
}
```

- [ ] **Step 1: Write the failing API test**

Create `tests/api/admin/assessment-coverage.test.ts`:

```typescript
/**
 * Tenant + auth checks for the Phase 4 assessment-coverage report.
 * The endpoint is org-pinned via the teams -> seasons -> programs ->
 * locations.organizationId join; the tenancy assertion cross-checks the
 * returned team ids against /api/admin/teams (already org-scoped).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  apiFetch,
  expectJson,
  getAdminCookie,
  getCoachCookie,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/curriculum/assessment-coverage";

describe("GET /api/admin/curriculum/assessment-coverage", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  it("returns 401 unauthenticated", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a coach (non-admin)", async () => {
    const coachCookie = await getCoachCookie();
    const res = await apiFetch(ENDPOINT, { method: "GET", cookie: coachCookie });
    expect(res.status).toBe(403);
  });

  it("returns the report shape for an admin", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET", cookie: adminCookie });
    const json = await expectJson(res, 200);

    expect(typeof json.generatedAt).toBe("string");
    expect(Array.isArray(json.domains)).toBe(true);
    expect(Array.isArray(json.teams)).toBe(true);
    expect(Array.isArray(json.coaches)).toBe(true);

    for (const team of json.teams) {
      expect(team.teamId).toBeTruthy();
      // Status buckets partition the roster.
      expect(
        team.freshCount + team.dueCount + team.overdueCount + team.neverCount,
      ).toBe(team.rosterCount);
      expect(Array.isArray(team.neverAssessedPlayers)).toBe(true);
    }

    for (const coach of json.coaches) {
      expect(coach.coachUserId).toBeTruthy();
      // Distribution is display-only data: null or {count, mean, stdDev}.
      if (coach.levelDistribution !== null) {
        expect(typeof coach.levelDistribution.mean).toBe("number");
        expect(typeof coach.levelDistribution.stdDev).toBe("number");
        expect(coach.levelDistribution.count).toBeGreaterThan(0);
      }
    }
  });

  it("only returns teams belonging to the caller's org", async () => {
    // /api/admin/teams is already org-scoped (super-admin, org-pinned);
    // every coverage team must be in that set.
    const teamsRes = await apiFetch("/api/admin/teams", {
      method: "GET",
      cookie: adminCookie,
    });
    const teamsJson = await expectJson(teamsRes, 200);
    const orgTeamIds = new Set(
      (teamsJson.teams as Array<{ id: string }>).map((t) => t.id),
    );

    const res = await apiFetch(ENDPOINT, { method: "GET", cookie: adminCookie });
    const json = await expectJson(res, 200);
    for (const team of json.teams) {
      expect(orgTeamIds.has(team.teamId)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run --config vitest.config.ts --project api tests/api/admin/assessment-coverage.test.ts`
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Implement the endpoint**

Create `src/pages/api/admin/curriculum/assessment-coverage.ts`:

```typescript
import type { APIRoute } from "astro";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teams } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import { playerAssessments } from "@/lib/db/schema/assessments";
import { skillDomains } from "@/lib/db/schema/curriculum";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  cadenceThresholdDays,
  summarizeLevelDistribution,
} from "@/lib/curriculum/assessment-cadence";
import { getTeamCadence } from "@/lib/curriculum/assessment-cadence-query";

export const prerender = false;

// Seasons currently being delivered: registration open/closed but running,
// or explicitly active. draft/forming teams aren't practicing; completed/
// cancelled seasons are history.
const RUNNING_SEASON_STATUSES = ["open", "closed", "active"] as const;

// GET - Phase 4 assessment-coverage report. Visibility only (no enforcement,
// no verdicts): per-team staleness buckets + never-assessed flags, and a
// per-coach rollup with a display-only level distribution.
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const db = getDb();
    const now = new Date();

    // Tenant pin: every team is reached through the org's own location chain.
    const teamRows = await db
      .select({
        teamId: teams.id,
        teamName: teams.name,
        seasonName: seasons.name,
        coachUserId: teams.coachUserId,
      })
      .from(teams)
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(
        and(
          eq(locations.organizationId, auth.organizationId),
          inArray(seasons.status, [...RUNNING_SEASON_STATUSES]),
        ),
      )
      .orderBy(asc(teams.name));

    const teamIds = teamRows.map((t) => t.teamId);
    const cadence = await getTeamCadence(db, teamIds, now);
    const cadenceByTeam = new Map(cadence.map((t) => [t.teamId, t]));

    // Coach display names.
    const coachIds = [
      ...new Set(
        teamRows.map((t) => t.coachUserId).filter((x): x is string => !!x),
      ),
    ];
    const coachRows =
      coachIds.length === 0
        ? []
        : await db
            .select({
              id: users.id,
              firstName: users.firstName,
              lastName: users.lastName,
            })
            .from(users)
            .where(inArray(users.id, coachIds));
    const coachNameById = new Map(
      coachRows.map((c) => [
        c.id,
        [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown",
      ]),
    );

    // Level distribution inputs: assessments authored by the org's current
    // coaches on the org's current roster players (playerAssessments.teamId
    // is nullable/often unset, so anchor on author + org players instead).
    const playerIds = [
      ...new Set(cadence.flatMap((t) => t.players.map((p) => p.familyMemberId))),
    ];
    const levelRows =
      coachIds.length === 0 || playerIds.length === 0
        ? []
        : await db
            .select({
              coachUserId: playerAssessments.coachUserId,
              level: playerAssessments.level,
            })
            .from(playerAssessments)
            .where(
              and(
                inArray(playerAssessments.coachUserId, coachIds),
                inArray(playerAssessments.familyMemberId, playerIds),
              ),
            );
    const levelsByCoach = new Map<string, number[]>();
    for (const row of levelRows) {
      const list = levelsByCoach.get(row.coachUserId) ?? [];
      list.push(row.level);
      levelsByCoach.set(row.coachUserId, list);
    }

    const teamsOut = teamRows.map((t) => {
      const players = cadenceByTeam.get(t.teamId)?.players ?? [];
      const bucket = { fresh: 0, due: 0, overdue: 0, never: 0 };
      for (const p of players) bucket[p.worstStatus]++;
      return {
        teamId: t.teamId,
        teamName: t.teamName,
        seasonName: t.seasonName,
        coachUserId: t.coachUserId,
        coachName: t.coachUserId
          ? (coachNameById.get(t.coachUserId) ?? "Unknown")
          : null,
        rosterCount: players.length,
        freshCount: bucket.fresh,
        dueCount: bucket.due,
        overdueCount: bucket.overdue,
        neverCount: bucket.never,
        coveragePct:
          players.length === 0
            ? null
            : Math.round((bucket.fresh / players.length) * 100),
        neverAssessedPlayers: players
          .filter((p) => !p.hasAnyAssessment)
          .map((p) => ({
            familyMemberId: p.familyMemberId,
            name: `${p.firstName} ${p.lastName}`,
          })),
      };
    });

    const coachesOut = coachIds.map((id) => {
      const coachTeams = teamsOut.filter((t) => t.coachUserId === id);
      const playerCount = coachTeams.reduce((s, t) => s + t.rosterCount, 0);
      const freshCount = coachTeams.reduce((s, t) => s + t.freshCount, 0);
      return {
        coachUserId: id,
        coachName: coachNameById.get(id) ?? "Unknown",
        teamCount: coachTeams.length,
        playerCount,
        freshCount,
        coveragePct:
          playerCount === 0 ? null : Math.round((freshCount / playerCount) * 100),
        levelDistribution: summarizeLevelDistribution(
          levelsByCoach.get(id) ?? [],
        ),
      };
    });

    const domainRows = await db
      .select({
        domainId: skillDomains.id,
        displayName: skillDomains.displayName,
        assessmentFrequency: skillDomains.assessmentFrequency,
      })
      .from(skillDomains)
      .orderBy(asc(skillDomains.sortOrder));
    const domains = domainRows.map((d) => ({
      ...d,
      thresholdDays: cadenceThresholdDays(d.assessmentFrequency),
    }));

    return new Response(
      JSON.stringify({
        generatedAt: now.toISOString(),
        domains,
        teams: teamsOut,
        coaches: coachesOut,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error building assessment coverage report:", error);
    return new Response(
      JSON.stringify({ error: "Failed to build assessment coverage report" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run --config vitest.config.ts --project api tests/api/admin/assessment-coverage.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/curriculum/assessment-coverage.ts tests/api/admin/assessment-coverage.test.ts
git commit -m "feat(admin): tenant-scoped assessment-coverage report endpoint"
```

---

### Task 7: Admin coverage page + report component + overview link

**Files:**
- Create: `src/components/admin/assessment-coverage-report.tsx`
- Create: `src/pages/admin/curriculum/assessment-coverage.astro`
- Modify: `src/components/admin/curriculum-manager.tsx` (Quick Links entry + one icon import)

**Interfaces:**
- Consumes: `GET /api/admin/curriculum/assessment-coverage` (Task 6's shape); shared UI primitives `ErrorBanner` / `EmptyState` / `LoadingSkeleton`.
- Produces: `/admin/curriculum/assessment-coverage` (SSR, middleware-gated admin page).

- [ ] **Step 1: Create the report component**

Create `src/components/admin/assessment-coverage-report.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ClipboardCheck, Users } from "lucide-react";

interface DomainInfo {
  domainId: string;
  displayName: string;
  assessmentFrequency: string | null;
  thresholdDays: number | null;
}

interface TeamCoverage {
  teamId: string;
  teamName: string;
  seasonName: string;
  coachUserId: string | null;
  coachName: string | null;
  rosterCount: number;
  freshCount: number;
  dueCount: number;
  overdueCount: number;
  neverCount: number;
  coveragePct: number | null;
  neverAssessedPlayers: { familyMemberId: string; name: string }[];
}

interface CoachCoverage {
  coachUserId: string;
  coachName: string;
  teamCount: number;
  playerCount: number;
  freshCount: number;
  coveragePct: number | null;
  levelDistribution: { count: number; mean: number; stdDev: number } | null;
}

interface CoverageReport {
  generatedAt: string;
  domains: DomainInfo[];
  teams: TeamCoverage[];
  coaches: CoachCoverage[];
}

function coverageBadgeClass(pct: number | null): string {
  if (pct === null) return "bg-cream-2 text-ink/40 border-0";
  if (pct >= 80) return "bg-emerald-500/10 text-emerald-600 border-0";
  if (pct >= 40) return "bg-yellow-500/10 text-yellow-600 border-0";
  return "bg-red-500/10 text-red-600 border-0";
}

export function AssessmentCoverageReport() {
  useHydrationBeacon();
  const [report, setReport] = useState<CoverageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/curriculum/assessment-coverage")
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load the assessment coverage report");
        return r.json() as Promise<CoverageReport>;
      })
      .then(setReport)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load report"),
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton rows={6} />;
  if (error) return <ErrorBanner message={error} />;
  if (!report || report.teams.length === 0) {
    return (
      <EmptyState
        title="No teams in running seasons"
        description="Coverage is computed for teams in open, closed, or active seasons. Once a season is running, per-team assessment staleness appears here."
      />
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink mb-2">Assessment Coverage</h1>
        <p className="text-muted-foreground">
          Which rosters have stale or missing assessments. Cadence per domain:{" "}
          {report.domains
            .map((d) =>
              d.thresholdDays
                ? `${d.displayName} every ${d.thresholdDays}d`
                : `${d.displayName} (no cadence)`,
            )
            .join(" · ")}
          . Due at the threshold, overdue at twice it. Visibility only — nothing
          here blocks coaches.
        </p>
      </div>

      {/* Per-team coverage */}
      <Card className="bg-paper border border-border">
        <CardHeader>
          <CardTitle className="text-ink flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5" />
            Teams
          </CardTitle>
          <CardDescription>
            A player is covered when every cadenced domain is fresh. "Never"
            means at least one domain has never been assessed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted uppercase tracking-wide border-b border-border">
                  <th className="py-2 pr-4">Team</th>
                  <th className="py-2 pr-4">Season</th>
                  <th className="py-2 pr-4">Coach</th>
                  <th className="py-2 pr-4">Roster</th>
                  <th className="py-2 pr-4">Covered</th>
                  <th className="py-2 pr-4">Due</th>
                  <th className="py-2 pr-4">Overdue</th>
                  <th className="py-2 pr-4">Never</th>
                  <th className="py-2">Never-assessed players</th>
                </tr>
              </thead>
              <tbody>
                {report.teams.map((team) => (
                  <tr key={team.teamId} className="border-b border-border/50 align-top">
                    <td className="py-2 pr-4 font-medium text-ink">{team.teamName}</td>
                    <td className="py-2 pr-4 text-ink/70">{team.seasonName}</td>
                    <td className="py-2 pr-4 text-ink/70">{team.coachName ?? "—"}</td>
                    <td className="py-2 pr-4 text-ink/70">{team.rosterCount}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="secondary" className={coverageBadgeClass(team.coveragePct)}>
                        {team.coveragePct === null ? "—" : `${team.coveragePct}%`}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-ink/70">{team.dueCount}</td>
                    <td className="py-2 pr-4 text-ink/70">{team.overdueCount}</td>
                    <td className="py-2 pr-4 text-ink/70">{team.neverCount}</td>
                    <td className="py-2 text-ink/70">
                      {team.neverAssessedPlayers.length === 0 ? (
                        "—"
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {team.neverAssessedPlayers.map((p) => (
                            <Badge
                              key={p.familyMemberId}
                              variant="secondary"
                              className="bg-red-500/10 text-red-600 border-0 text-xs"
                            >
                              {p.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Per-coach rollup */}
      <Card className="bg-paper border border-border">
        <CardHeader>
          <CardTitle className="text-ink flex items-center gap-2">
            <Users className="w-5 h-5" />
            Coaches
          </CardTitle>
          <CardDescription>
            Level distribution is the mean and spread (std dev) of the 1–5
            levels each coach has recorded — data display only. A very low
            spread with a high mean can indicate "everyone's a 5"; use the
            calibration guide, not this table, to coach the coach.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted uppercase tracking-wide border-b border-border">
                  <th className="py-2 pr-4">Coach</th>
                  <th className="py-2 pr-4">Teams</th>
                  <th className="py-2 pr-4">Players</th>
                  <th className="py-2 pr-4">Covered</th>
                  <th className="py-2 pr-4">Assessments</th>
                  <th className="py-2 pr-4">Mean level</th>
                  <th className="py-2">Spread (σ)</th>
                </tr>
              </thead>
              <tbody>
                {report.coaches.map((coach) => (
                  <tr key={coach.coachUserId} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium text-ink">{coach.coachName}</td>
                    <td className="py-2 pr-4 text-ink/70">{coach.teamCount}</td>
                    <td className="py-2 pr-4 text-ink/70">{coach.playerCount}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="secondary" className={coverageBadgeClass(coach.coveragePct)}>
                        {coach.coveragePct === null ? "—" : `${coach.coveragePct}%`}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-ink/70">
                      {coach.levelDistribution?.count ?? 0}
                    </td>
                    <td className="py-2 pr-4 text-ink/70">
                      {coach.levelDistribution ? coach.levelDistribution.mean.toFixed(2) : "—"}
                    </td>
                    <td className="py-2 text-ink/70">
                      {coach.levelDistribution ? coach.levelDistribution.stdDev.toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create the page**

Create `src/pages/admin/curriculum/assessment-coverage.astro` (mirrors `skills.astro`; SSR by default — no `prerender` flag, per the prerender policy for `/admin/**`):

```astro
---
import BaseLayout from '../../../layouts/BaseLayout.astro';
import { AdminLayout } from '../../../components/admin/admin-layout';
import { getPrimaryRoleName } from "@/lib/auth";
import { AssessmentCoverageReport } from '../../../components/admin/assessment-coverage-report';

// Middleware guarantees user is an admin for /admin routes.
const user = Astro.locals.user!;
const primaryRole = getPrimaryRoleName(Astro.locals.userRoles);
---

<BaseLayout title="Assessment Coverage — Aspire Sports Admin" navigation={false} footer={false}>
  <AdminLayout
    client:load
    role={primaryRole}
    currentPath="/admin/curriculum"
    user={{ firstName: user.firstName, lastName: user.lastName, email: user.email }}
  >
    <AssessmentCoverageReport client:load />
  </AdminLayout>
</BaseLayout>
```

- [ ] **Step 3: Link it from the curriculum overview**

In `src/components/admin/curriculum-manager.tsx`, add `ClipboardCheck` to the lucide import (the block importing `BookOpen, Dumbbell, FileText, ...`):

```tsx
import {
  BookOpen,
  Dumbbell,
  FileText,
  Plus,
  ChevronRight,
  Target,
  Users,
  Clock,
  TrendingUp,
  Loader2,
  ClipboardCheck,
} from "lucide-react";
```

Then in the Quick Links grid, insert a fifth entry after the "Featured Activities" link (after the `</a>` closing the `href="/admin/curriculum/activities?featured=true"` anchor):

```tsx
            <a href="/admin/curriculum/assessment-coverage" className="block">
              <div className="p-4 rounded-lg bg-cream-2 hover:bg-cream-3 transition-colors">
                <ClipboardCheck className="w-5 h-5 text-rose-600 mb-2" />
                <p className="font-medium text-ink">Assessment Coverage</p>
                <p className="text-sm text-ink-muted">See which rosters have stale or missing assessments</p>
              </div>
            </a>
```

(The grid is `lg:grid-cols-4`; a fifth card wraps to a second row — fine.)

- [ ] **Step 4: Verify**

With the dev server running, sign in as `admin@test.aspiresports.com` / `TestAdmin123!` and load `http://localhost:4321/admin/curriculum/assessment-coverage`: the team table and coach rollup render (or the EmptyState if no running seasons); `/admin/curriculum` shows the new Quick Links card.

Run: `npx tsc --noEmit`
Expected: zero errors.

Run: `npm run build`
Expected: build succeeds; the new page appears in the SSR manifest (no prerender warnings beyond the known middleware false-positive noise).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/assessment-coverage-report.tsx src/pages/admin/curriculum/assessment-coverage.astro src/components/admin/curriculum-manager.tsx
git commit -m "feat(admin): assessment-coverage report page under /admin/curriculum"
```

---

### Task 8: Full verification sweep

**Files:** none created/modified (fix-forward only if a step fails).

- [ ] **Step 1: Unit suite**

Run: `npm run test:unit`
Expected: PASS, including `tests/unit/curriculum/assessment-cadence.test.ts` and the updated `tests/unit/coach/coach-nav-badges.test.ts`. (Per the memory note on staging-DB state: triage any failure by file overlap with this branch — 2 API + 4 Playwright failures are known data-state issues, not regressions.)

- [ ] **Step 2: API suite with CI-equivalent env**

With the dev server up (started via `./scripts/with-bws.sh` so DB env is present, with `E2E_TEST_ENDPOINTS=yes` and `R2_MOCK=1 CRON_SECRET=<anything>`):

Run: `CRON_SECRET=<same-as-dev-server> TEST_BASE_URL=http://localhost:4321 npm run test:api`
Expected: PASS on the new files (`assessments-due.test.ts`, `assessment-coverage.test.ts`) and no regressions in `tests/api/coach/*` / `tests/api/admin/curriculum*`.

- [ ] **Step 3: Type check + build**

Run: `npx tsc --noEmit`
Expected: zero errors.

Run: `npm run build`
Expected: success.

- [ ] **Step 4: E2E surface check**

Run: `grep -rln "coach\|curriculum" tests/e2e/`
Expected: `tests/e2e/coach-dashboard.spec.ts` (updated in Task 5; no admin-curriculum spec exists). Optionally run locally: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- tests/e2e/coach-dashboard.spec.ts` → PASS. Remember these specs gate nothing on the PR — watch `test-full` post-merge.

- [ ] **Step 5: Scope-out audit (read-only)**

Confirm by inspection/grep before hand-off:
- `git diff main --stat` touches **no** `src/lib/db/schema/*` and **no** `src/lib/db/migrations/*` (no schema change).
- `src/lib/curriculum/snapshots.ts` untouched.
- No changes under `src/pages/dashboard/**`, `src/components/dashboard/**`, or any parent-facing API (no parent-facing staleness).
- No write endpoints added — both new endpoints are GET-only (no blocking/enforcement).
- The admin report renders numbers only — no "flag"/"verdict" copy about coach quality.

- [ ] **Step 6: Commit any fixes and stop**

```bash
git status
```
Expected: clean tree. Hand off per the repo's release flow (`/ship` skill → PR); do not merge without CI green on origin.

---

## Self-review (performed while writing)

- **Spec coverage:** staleness pure function + unit tests (Tasks 1–2, covering never-assessed / exactly-at-threshold / multi-domain frequency differences per the acceptance criteria); admin report endpoint + page with per-team %, per-coach rollup, never-assessed flags, level distribution (Tasks 6–7); coach nudges via nav-badges due-count + dashboard card deep-linking to `assess/[playerId]` (Tasks 3–5); placement and prompt-mechanism decisions documented in Design Decisions per the phase-design mandate.
- **Placeholder scan:** every code step contains complete code; no TBDs; commands include expected outcomes.
- **Type consistency:** `CadenceStatus`/`PlayerCadence`/`DomainCadence`/`STATUS_RANK` defined in Tasks 1–2 are consumed by name in Tasks 3, 4, 6; `getTeamCadence`/`getAssessmentsDueCount` signatures match at all three call sites; the coach endpoint's `dueDomains` reuses `DomainCadence` verbatim, and the React components' local interfaces mirror the JSON shapes emitted by Tasks 3 and 6.
