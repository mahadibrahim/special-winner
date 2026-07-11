# Coach Session Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-first live-session experience at `/coach/practices/[id]/live` that stages setup → field mode → wrap-up off `session_plans.status`, loads one composite payload, and syncs all writes through an idempotent offline-tolerant queue.

**Architecture:** One React island (`session-live.tsx`) staged by session status; one composite `GET .../live` payload; one batch `POST .../captures` write endpoint (captures + attendance + consumption in a single idempotent envelope); start/complete transitions stay on the existing session PUT, hardened to be retry-safe. Spec: `docs/superpowers/specs/2026-07-10-coach-session-lifecycle-design.md`.

**Tech Stack:** Astro 5 + React 19 (`client:load` island), Drizzle/Postgres, zod, Tailwind 4, Vitest (unit + API), Playwright.

## Global Constraints

- All schema changes additive + idempotent (`ADD COLUMN IF NOT EXISTS`, guarded `CREATE TYPE` — see migrations 0023/0024 pattern). Never `db:push` against remote; `npm run db:generate` and commit the migration.
- Every `findFirst`/`.limit(1)` gets an explicit `orderBy` (CI DB is shared and accumulates rows).
- API tests must self-create any fixture they need (CI's DB has no curriculum seed — hard-learned in `blueprint-attach.test.ts`).
- Coach endpoints: `requireCoachPortalAccess(context)` + the `verifyCoachAccess` head/assistant-coach ownership check; cross-org/cross-coach access returns 403 (matching existing session endpoints).
- User-facing copy: `groupNoun(programType)` from `src/lib/programs/group-noun.ts` — never "team" for non-league programs. No eyebrow/kicker labels.
- The island calls `useHydrationBeacon()` from `@/lib/hooks/use-hydration-beacon`; e2e uses `waitForHydration(page)` before interactions, element clicks over keypresses.
- Tap targets ≥ 44px (`min-h-11`) on all field-mode controls.
- UI feedback: `ErrorBanner` for payload failure, `toast.error` for transient action errors (sonner), `EmptyState` where applicable.
- `npx tsc --noEmit` stays at zero errors.
- Timestamps stored UTC. `startedAt` is server-stamped (client never sends a time for it).

## File Structure

```
src/lib/db/schema/session-lifecycle.ts      # NEW: session_captures table + kind enum
src/lib/db/schema/practice-planning.ts      # +startedAt column
src/lib/db/schema/teams.ts                  # +attendance.sessionPlanId column
src/lib/db/schema/index.ts                  # export new module
src/lib/db/migrations/00NN_*.sql            # generated, hand-hardened idempotent
src/lib/sessions/equipment.ts               # NEW pure: equipment union
src/lib/sessions/prompt-pool.ts             # NEW pure: pool ordering + per-segment pick
src/lib/sessions/capture-queue.ts           # NEW pure: client op queue reducer
src/lib/sessions/timer.ts                   # NEW pure: segment windows + elapsed math
src/pages/api/coach/sessions/[id]/live.ts   # NEW: composite GET
src/pages/api/coach/sessions/[id]/captures.ts # NEW: batch POST
src/pages/api/coach/sessions/[id].ts        # PUT hardening (startedAt, no-op retries)
src/pages/coach/practices/[id]/live.astro   # NEW route
src/components/coach/live/session-live.tsx  # NEW island shell (state staging + queue wiring)
src/components/coach/live/setup-view.tsx    # NEW surface
src/components/coach/live/field-mode.tsx    # NEW surface
src/components/coach/live/wrap-up.tsx       # NEW surface
src/components/coach/session-detail.tsx     # entry button
src/components/coach/practices-overview.tsx # entry button
tests/unit/sessions/{equipment,prompt-pool,capture-queue,timer}.test.ts
tests/api/coach/session-live.test.ts
tests/api/coach/session-captures.test.ts
tests/api/coach/sessions-transitions.test.ts
tests/e2e/coach-session-lifecycle.spec.ts
```

Shared payload/queue types live in `src/lib/sessions/types.ts` (created in Task 2) so island, endpoints, and tests import one definition.

---

### Task 1: Schema + migration

**Files:**
- Create: `src/lib/db/schema/session-lifecycle.ts`
- Modify: `src/lib/db/schema/practice-planning.ts` (add `startedAt` after `status`, ~line 262)
- Modify: `src/lib/db/schema/teams.ts` (add `sessionPlanId` to `attendance`, after `gameId` ~line 360)
- Modify: `src/lib/db/schema/index.ts` (add `export * from "./session-lifecycle";`)
- Create: `src/lib/db/migrations/00NN_coach_session_lifecycle.sql` (via `npm run db:generate`, then harden)

**Interfaces:**
- Produces: `sessionCaptures` table + `SessionCapture`/`NewSessionCapture` types; `captureKindEnum` (`glow | observation`); `sessionPlans.startedAt: timestamp | null`; `attendance.sessionPlanId: uuid | null`.

- [ ] **Step 1: Write `session-lifecycle.ts`**

```typescript
import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { sessionPlans } from "./practice-planning";
import { rosters } from "./teams";
import { skills } from "./curriculum";

export const captureKindEnum = pgEnum("capture_kind", ["glow", "observation"]);

// Field-mode quick-capture inbox (coach session lifecycle spec). Rows are
// seeds for the wrap-up flow, not parent-visible content — promotion into
// coach_notes happens in wrap-up, which stamps consumedAt.
export const sessionCaptures = pgTable(
  "session_captures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionPlanId: uuid("session_plan_id")
      .notNull()
      .references(() => sessionPlans.id, { onDelete: "cascade" }),
    rosterId: uuid("roster_id")
      .notNull()
      .references(() => rosters.id, { onDelete: "cascade" }),
    kind: captureKindEnum("kind").notNull(),
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
    note: text("note"),
    // Client-generated idempotency key: offline flush retries must never
    // double-insert. Unique per session, not globally — two sessions may
    // coincidentally generate the same client id.
    clientId: text("client_id").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("session_captures_session_client_uniq").on(
      table.sessionPlanId,
      table.clientId,
    ),
    index("session_captures_session_idx").on(table.sessionPlanId),
  ],
);

export const sessionCapturesRelations = relations(sessionCaptures, ({ one }) => ({
  sessionPlan: one(sessionPlans, {
    fields: [sessionCaptures.sessionPlanId],
    references: [sessionPlans.id],
  }),
  roster: one(rosters, {
    fields: [sessionCaptures.rosterId],
    references: [rosters.id],
  }),
}));

export type SessionCapture = typeof sessionCaptures.$inferSelect;
export type NewSessionCapture = typeof sessionCaptures.$inferInsert;
```

- [ ] **Step 2: Add the two columns**

In `practice-planning.ts`, directly under `status: sessionStatusEnum("status").default("draft").notNull(),`:

```typescript
    // Coach session lifecycle: stamped server-side when the coach starts
    // field mode (status -> in_progress). Never overwritten on retry.
    startedAt: timestamp("started_at"),
```

In `teams.ts` `attendance` table, under the `gameId` column:

```typescript
    // Coach session lifecycle: precise lineage from a field-mode check-off
    // to its practice session. Null on rows from the standalone tracker.
    sessionPlanId: uuid("session_plan_id").references(() => sessionPlans.id, {
      onDelete: "set null",
    }),
```

`teams.ts` must import `sessionPlans` — but `practice-planning.ts` already imports `teams` (cycle). Use the deferred-reference form Drizzle supports instead of an import cycle:

```typescript
    sessionPlanId: uuid("session_plan_id"),
```

…with the FK added in raw SQL in the migration (Step 4). This mirrors how cross-module FKs are handled elsewhere when imports would cycle; the column type + migration FK are sufficient (Drizzle relations to it aren't needed).

Add to `src/lib/db/schema/index.ts`: `export * from "./session-lifecycle";`

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: new `src/lib/db/migrations/00NN_*.sql` containing `CREATE TYPE "capture_kind"`, `CREATE TABLE "session_captures"`, `ALTER TABLE "session_plans" ADD COLUMN "started_at"`, `ALTER TABLE "attendance" ADD COLUMN "session_plan_id"`.

- [ ] **Step 4: Harden the migration to be idempotent**

Edit the generated SQL so every statement survives a drifted DB, and add the attendance FK:

```sql
DO $$ BEGIN
  CREATE TYPE "capture_kind" AS ENUM ('glow', 'observation');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "session_captures" (
  -- keep the generated column list verbatim
);

ALTER TABLE "session_plans" ADD COLUMN IF NOT EXISTS "started_at" timestamp;
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "session_plan_id" uuid;

DO $$ BEGIN
  ALTER TABLE "attendance"
    ADD CONSTRAINT "attendance_session_plan_id_fk"
    FOREIGN KEY ("session_plan_id") REFERENCES "session_plans"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;
```

(Keep the generated FK/index statements for `session_captures`, wrapped the same way if not already guarded.)

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` — Expected: 0 errors.

```bash
git add src/lib/db/schema/ src/lib/db/migrations/
git commit -m "feat(sessions): session_captures table + startedAt + attendance session lineage"
```

---

### Task 2: Shared types + pure libs — equipment union and prompt pool

**Files:**
- Create: `src/lib/sessions/types.ts`
- Create: `src/lib/sessions/equipment.ts`
- Create: `src/lib/sessions/prompt-pool.ts`
- Test: `tests/unit/sessions/equipment.test.ts`, `tests/unit/sessions/prompt-pool.test.ts`

**Interfaces:**
- Produces (types.ts, consumed by every later task):

```typescript
export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export interface LiveSegment {
  order: number;
  name: string;
  type: string;
  durationMinutes: number;
  activityId?: string;
  activityName?: string;
  notes?: string;
  activitySkillIds: string[]; // resolved server-side; [] when no activity
}

export interface LivePlayer {
  rosterId: string;
  familyMemberId: string;
  firstName: string;
  lastName: string;
  attendanceStatus: AttendanceStatus | null; // pre-recorded same-day rows
}

export interface LivePrompt {
  id: string;
  promptType: "question" | "reminder" | "tip" | "warning" | "encouragement";
  content: string;
  skillId: string | null; // null = generic during_practice prompt
  priority: number;
}

export interface CaptureInput {
  clientId: string;
  rosterId: string;
  kind: "glow" | "observation";
  skillId?: string | null;
  note?: string | null;
}

export interface LivePayload {
  session: {
    id: string;
    title: string;
    status: "draft" | "planned" | "in_progress" | "completed" | "cancelled";
    startedAt: string | null;
    scheduledDate: string;
    durationMinutes: number;
    objectives: string[];
    focusSkillIds: string[];
    preSessionNotes: string | null;
    prescribed: { attachmentId: string; distributorFirstName: string | null } | null;
    groupNoun: string;
    teamName: string;
  };
  segments: LiveSegment[];
  equipment: string[];
  prompts: LivePrompt[];
  roster: LivePlayer[];
  glowChips: { glows: string[]; grows: string[] };
  captures: Array<CaptureInput & { id: string; consumedAt: string | null }>;
}
```

- Produces (equipment.ts): `deriveEquipment(planEquipment: string[] | null, activityEquipment: Array<string[] | null>): string[]`
- Produces (prompt-pool.ts): `orderPromptPool(prompts: LivePrompt[], cap?: number): LivePrompt[]` and `promptForSegment(pool: LivePrompt[], segment: LiveSegment, cycleIndex: number): LivePrompt | null`

- [ ] **Step 1: Write failing tests**

`tests/unit/sessions/equipment.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { deriveEquipment } from "@/lib/sessions/equipment";

describe("deriveEquipment", () => {
  it("unions plan + activity equipment, plan first, insertion-ordered", () => {
    expect(
      deriveEquipment(["Cones", "Pinnies"], [["Balls", "Cones"], null, ["Goals"]]),
    ).toEqual(["Cones", "Pinnies", "Balls", "Goals"]);
  });

  it("dedupes case-insensitively, keeping first casing", () => {
    expect(deriveEquipment(["cones"], [["Cones", "CONES", "Balls"]])).toEqual([
      "cones",
      "Balls",
    ]);
  });

  it("handles null/empty everything", () => {
    expect(deriveEquipment(null, [])).toEqual([]);
  });
});
```

`tests/unit/sessions/prompt-pool.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { orderPromptPool, promptForSegment } from "@/lib/sessions/prompt-pool";
import type { LivePrompt, LiveSegment } from "@/lib/sessions/types";

const p = (id: string, priority: number, skillId: string | null): LivePrompt => ({
  id, priority, skillId, promptType: "tip", content: `prompt ${id}`,
});
const seg = (activitySkillIds: string[]): LiveSegment => ({
  order: 0, name: "s", type: "technical", durationMinutes: 10, activitySkillIds,
});

describe("orderPromptPool", () => {
  it("orders by priority desc, stable on ties, caps at 40 by default", () => {
    const pool = orderPromptPool([p("a", 1, null), p("b", 5, null), p("c", 1, null)]);
    expect(pool.map((x) => x.id)).toEqual(["b", "a", "c"]);
    const big = orderPromptPool(
      Array.from({ length: 50 }, (_, i) => p(String(i), 0, null)),
    );
    expect(big).toHaveLength(40);
  });
});

describe("promptForSegment", () => {
  const pool = [p("skillA", 2, "skill-a"), p("generic1", 1, null), p("generic2", 0, null)];

  it("prefers prompts matching the segment's activity skills, then generics", () => {
    expect(promptForSegment(pool, seg(["skill-a"]), 0)?.id).toBe("skillA");
    expect(promptForSegment(pool, seg(["skill-a"]), 1)?.id).toBe("generic1");
  });

  it("cycles with wraparound", () => {
    expect(promptForSegment(pool, seg(["skill-a"]), 3)?.id).toBe("skillA");
  });

  it("returns null on an empty pool", () => {
    expect(promptForSegment([], seg([]), 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/sessions/`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/lib/sessions/equipment.ts`:

```typescript
/**
 * Union of the plan-level equipment list and each segment activity's list.
 * Plan items first, then activity items in segment order; case-insensitive
 * dedupe keeps the first casing seen (coaches read this on a phone —
 * "Cones" and "cones" are the same pile).
 */
export function deriveEquipment(
  planEquipment: string[] | null,
  activityEquipment: Array<string[] | null>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...(planEquipment ?? []), ...activityEquipment.flatMap((a) => a ?? [])]) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}
```

`src/lib/sessions/prompt-pool.ts`:

```typescript
import type { LivePrompt, LiveSegment } from "./types";

const DEFAULT_CAP = 40;

/** Priority-desc, stable, capped — the shape the live payload ships. */
export function orderPromptPool(prompts: LivePrompt[], cap = DEFAULT_CAP): LivePrompt[] {
  return [...prompts].sort((a, b) => b.priority - a.priority).slice(0, cap);
}

/**
 * The one prompt to show for the current segment: skill-matched prompts
 * first (any of the segment's activity skills), then generic (skillId
 * null); cycleIndex taps through the combined list with wraparound.
 */
export function promptForSegment(
  pool: LivePrompt[],
  segment: LiveSegment,
  cycleIndex: number,
): LivePrompt | null {
  const skillSet = new Set(segment.activitySkillIds);
  const matched = pool.filter((p) => p.skillId !== null && skillSet.has(p.skillId));
  const generic = pool.filter((p) => p.skillId === null);
  const candidates = [...matched, ...generic];
  if (candidates.length === 0) return null;
  return candidates[cycleIndex % candidates.length];
}
```

Create `src/lib/sessions/types.ts` with the exact block from **Interfaces** above.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/sessions/`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sessions/ tests/unit/sessions/
git commit -m "feat(sessions): live-payload types, equipment union, prompt pool"
```

---

### Task 3: Pure libs — capture queue reducer and timer math

**Files:**
- Create: `src/lib/sessions/capture-queue.ts`
- Create: `src/lib/sessions/timer.ts`
- Test: `tests/unit/sessions/capture-queue.test.ts`, `tests/unit/sessions/timer.test.ts`

**Interfaces:**
- Produces (capture-queue.ts):

```typescript
export interface QueueState {
  captures: CaptureInput[];                        // pending, deduped by clientId
  attendance: Record<string, AttendanceStatus>;    // rosterId -> latest status
  consumedClientIds: string[];                     // pending consumption stamps
}
export const emptyQueue: QueueState;
export function enqueueCapture(q: QueueState, c: CaptureInput): QueueState;
export function enqueueAttendance(q: QueueState, rosterId: string, s: AttendanceStatus): QueueState;
export function enqueueConsume(q: QueueState, clientIds: string[]): QueueState;
export function buildEnvelope(q: QueueState): FlushEnvelope | null; // null when nothing pending
export function markFlushed(q: QueueState, sent: FlushEnvelope): QueueState;
export function serializeQueue(q: QueueState): string;
export function restoreQueue(raw: string | null): QueueState;      // tolerant of garbage
export interface FlushEnvelope {
  captures: CaptureInput[];
  attendance: Array<{ rosterId: string; status: AttendanceStatus }>;
  consumedClientIds: string[];
}
```

- Produces (timer.ts):

```typescript
export interface SegmentWindow { order: number; startsAtMinute: number; endsAtMinute: number; }
export function segmentWindows(segments: Array<{ order: number; durationMinutes: number }>): SegmentWindow[];
export function elapsedMinutes(startedAtIso: string, nowMs: number): number; // >= 0, fractional
```

- [ ] **Step 1: Write failing tests**

`tests/unit/sessions/capture-queue.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  emptyQueue, enqueueCapture, enqueueAttendance, enqueueConsume,
  buildEnvelope, markFlushed, serializeQueue, restoreQueue,
} from "@/lib/sessions/capture-queue";
import type { CaptureInput } from "@/lib/sessions/types";

const cap = (clientId: string): CaptureInput => ({
  clientId, rosterId: "r1", kind: "glow", skillId: null, note: null,
});

describe("capture queue", () => {
  it("dedupes captures by clientId (last write wins)", () => {
    let q = enqueueCapture(emptyQueue, cap("c1"));
    q = enqueueCapture(q, { ...cap("c1"), note: "updated" });
    expect(q.captures).toHaveLength(1);
    expect(q.captures[0].note).toBe("updated");
  });

  it("attendance is last-wins per roster", () => {
    let q = enqueueAttendance(emptyQueue, "r1", "absent");
    q = enqueueAttendance(q, "r1", "present");
    expect(q.attendance).toEqual({ r1: "present" });
  });

  it("buildEnvelope returns null when empty, envelope otherwise", () => {
    expect(buildEnvelope(emptyQueue)).toBeNull();
    const q = enqueueCapture(emptyQueue, cap("c1"));
    expect(buildEnvelope(q)?.captures).toHaveLength(1);
  });

  it("markFlushed removes exactly what was sent; later writes survive", () => {
    let q = enqueueCapture(emptyQueue, cap("c1"));
    const envelope = buildEnvelope(q)!;
    q = enqueueCapture(q, cap("c2")); // arrives mid-flight
    q = markFlushed(q, envelope);
    expect(q.captures.map((c) => c.clientId)).toEqual(["c2"]);
  });

  it("consume queue accumulates and flushes", () => {
    let q = enqueueConsume(emptyQueue, ["c1", "c2"]);
    q = enqueueConsume(q, ["c2", "c3"]);
    expect(buildEnvelope(q)?.consumedClientIds).toEqual(["c1", "c2", "c3"]);
  });

  it("serialize/restore round-trips; restore tolerates garbage", () => {
    const q = enqueueAttendance(enqueueCapture(emptyQueue, cap("c1")), "r2", "late");
    expect(restoreQueue(serializeQueue(q))).toEqual(q);
    expect(restoreQueue(null)).toEqual(emptyQueue);
    expect(restoreQueue("{not json")).toEqual(emptyQueue);
  });
});
```

`tests/unit/sessions/timer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { segmentWindows, elapsedMinutes } from "@/lib/sessions/timer";

describe("segmentWindows", () => {
  it("accumulates start/end minutes in order", () => {
    expect(
      segmentWindows([
        { order: 0, durationMinutes: 10 },
        { order: 1, durationMinutes: 20 },
      ]),
    ).toEqual([
      { order: 0, startsAtMinute: 0, endsAtMinute: 10 },
      { order: 1, startsAtMinute: 10, endsAtMinute: 30 },
    ]);
  });
});

describe("elapsedMinutes", () => {
  it("computes fractional minutes since startedAt, clamped at 0", () => {
    const start = "2026-07-10T18:00:00.000Z";
    expect(elapsedMinutes(start, Date.parse("2026-07-10T18:07:30.000Z"))).toBeCloseTo(7.5);
    expect(elapsedMinutes(start, Date.parse("2026-07-10T17:59:00.000Z"))).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/sessions/capture-queue.test.ts tests/unit/sessions/timer.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/lib/sessions/capture-queue.ts`:

```typescript
import type { AttendanceStatus, CaptureInput } from "./types";

export interface FlushEnvelope {
  captures: CaptureInput[];
  attendance: Array<{ rosterId: string; status: AttendanceStatus }>;
  consumedClientIds: string[];
}

export interface QueueState {
  captures: CaptureInput[];
  attendance: Record<string, AttendanceStatus>;
  consumedClientIds: string[];
}

export const emptyQueue: QueueState = { captures: [], attendance: {}, consumedClientIds: [] };

export function enqueueCapture(q: QueueState, c: CaptureInput): QueueState {
  return { ...q, captures: [...q.captures.filter((x) => x.clientId !== c.clientId), c] };
}

export function enqueueAttendance(
  q: QueueState, rosterId: string, status: AttendanceStatus,
): QueueState {
  return { ...q, attendance: { ...q.attendance, [rosterId]: status } };
}

export function enqueueConsume(q: QueueState, clientIds: string[]): QueueState {
  const merged = [...q.consumedClientIds];
  for (const id of clientIds) if (!merged.includes(id)) merged.push(id);
  return { ...q, consumedClientIds: merged };
}

export function buildEnvelope(q: QueueState): FlushEnvelope | null {
  const attendance = Object.entries(q.attendance).map(([rosterId, status]) => ({ rosterId, status }));
  if (q.captures.length === 0 && attendance.length === 0 && q.consumedClientIds.length === 0) {
    return null;
  }
  return { captures: [...q.captures], attendance, consumedClientIds: [...q.consumedClientIds] };
}

/** Remove exactly what a successful flush sent; writes that arrived mid-flight survive. */
export function markFlushed(q: QueueState, sent: FlushEnvelope): QueueState {
  const sentIds = new Set(sent.captures.map((c) => c.clientId));
  const sentConsumed = new Set(sent.consumedClientIds);
  const attendance: Record<string, AttendanceStatus> = {};
  for (const [rosterId, status] of Object.entries(q.attendance)) {
    const sentRow = sent.attendance.find((a) => a.rosterId === rosterId);
    if (!sentRow || sentRow.status !== status) attendance[rosterId] = status;
  }
  return {
    captures: q.captures.filter((c) => !sentIds.has(c.clientId)),
    attendance,
    consumedClientIds: q.consumedClientIds.filter((id) => !sentConsumed.has(id)),
  };
}

export function serializeQueue(q: QueueState): string {
  return JSON.stringify(q);
}

export function restoreQueue(raw: string | null): QueueState {
  if (!raw) return emptyQueue;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.captures)) return emptyQueue;
    return {
      captures: parsed.captures,
      attendance: parsed.attendance ?? {},
      consumedClientIds: parsed.consumedClientIds ?? [],
    };
  } catch {
    return emptyQueue;
  }
}
```

`src/lib/sessions/timer.ts`:

```typescript
export interface SegmentWindow {
  order: number;
  startsAtMinute: number;
  endsAtMinute: number;
}

export function segmentWindows(
  segments: Array<{ order: number; durationMinutes: number }>,
): SegmentWindow[] {
  let cursor = 0;
  return segments.map((s) => {
    const startsAtMinute = cursor;
    cursor += s.durationMinutes;
    return { order: s.order, startsAtMinute, endsAtMinute: cursor };
  });
}

export function elapsedMinutes(startedAtIso: string, nowMs: number): number {
  return Math.max(0, (nowMs - Date.parse(startedAtIso)) / 60_000);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/sessions/`
Expected: PASS (all sessions unit tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sessions/ tests/unit/sessions/
git commit -m "feat(sessions): capture queue reducer + timer math"
```

---

### Task 4: PUT transition hardening (startedAt, retry-safe no-ops)

**Files:**
- Modify: `src/pages/api/coach/sessions/[id].ts` (PUT handler, status block ~line 293)
- Test: `tests/api/coach/sessions-transitions.test.ts`

**Interfaces:**
- Consumes: existing `PUT /api/coach/sessions/[id]` with `{ status }` body.
- Produces: `status: "in_progress"` stamps `startedAt` once (never overwritten); `status: "completed"` stamps `completedAt` once; repeating either transition is a 200 no-op that does not move the timestamp. Response unchanged: `{ session }` including `startedAt`.

- [ ] **Step 1: Write failing API test**

Requires the dev server running (`E2E_TEST_ENDPOINTS=yes R2_MOCK=1 CRON_SECRET=localdev ./scripts/with-bws.sh npm run dev`).

`tests/api/coach/sessions-transitions.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sessionPlans } from "@/lib/db/schema";
import { getCoachCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

describe("Session lifecycle transitions", () => {
  let coachCookie: string;
  let sessionId: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    const playersRes = await apiFetch("/api/coach/players", { method: "GET", cookie: coachCookie });
    const playersJson = await expectJson(playersRes, 200);
    expect(playersJson.players.length).toBeGreaterThan(0);
    const teamId = playersJson.players[0].team.id;

    const createRes = await apiFetch("/api/coach/sessions", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        title: "Transitions test session",
        scheduledDate: new Date().toISOString(),
        durationMinutes: 60,
        status: "planned",
        segments: [
          { order: 0, name: "Warmup", type: "warmup", durationMinutes: 10 },
          { order: 1, name: "Main", type: "technical", durationMinutes: 50 },
        ],
      }),
    });
    const created = await expectJson(createRes, 201);
    sessionId = created.session.id;
  });

  afterAll(async () => {
    if (sessionId) await getDb().delete(sessionPlans).where(eq(sessionPlans.id, sessionId));
    resetCookies();
  });

  it("in_progress stamps startedAt once; retry is a no-op", async () => {
    const first = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}`, {
        method: "PUT", cookie: coachCookie, body: JSON.stringify({ status: "in_progress" }),
      }), 200);
    expect(first.session.startedAt).toBeTruthy();

    const second = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}`, {
        method: "PUT", cookie: coachCookie, body: JSON.stringify({ status: "in_progress" }),
      }), 200);
    expect(second.session.startedAt).toBe(first.session.startedAt);
  });

  it("completed stamps completedAt once; retry does not move it", async () => {
    const first = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}`, {
        method: "PUT", cookie: coachCookie, body: JSON.stringify({ status: "completed" }),
      }), 200);
    expect(first.session.completedAt).toBeTruthy();

    const second = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}`, {
        method: "PUT", cookie: coachCookie, body: JSON.stringify({ status: "completed" }),
      }), 200);
    expect(second.session.completedAt).toBe(first.session.completedAt);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `CRON_SECRET=localdev TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run --config vitest.config.ts --project api tests/api/coach/sessions-transitions.test.ts`
Expected: FAIL — `startedAt` is undefined (column not selected / never set), and `completedAt` moves on retry.

- [ ] **Step 3: Implement**

In the PUT handler, `verifyCoachAccess` must also return the current row's timestamps. Extend the status block (replacing the current `if (data.status !== undefined)` body):

```typescript
    if (data.status !== undefined) {
      // Fetch current timestamps so transitions are retry-safe no-ops —
      // the field-mode client flushes aggressively offline->online and
      // must never move startedAt/completedAt on a duplicate request.
      const [current] = await getDb()
        .select({
          startedAt: sessionPlans.startedAt,
          completedAt: sessionPlans.completedAt,
        })
        .from(sessionPlans)
        .where(eq(sessionPlans.id, id));

      updateData.status = data.status;
      if (data.status === "in_progress" && !current?.startedAt) {
        updateData.startedAt = new Date();
      }
      if (data.status === "completed" && !current?.completedAt) {
        updateData.completedAt = new Date();
      }
    }
```

(The existing unconditional `updateData.completedAt = new Date()` on completed is what the second test catches — remove it.)

- [ ] **Step 4: Run to verify pass**

Same command as Step 2. Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/coach/sessions/ tests/api/coach/sessions-transitions.test.ts
git commit -m "fix(sessions): retry-safe in_progress/completed transitions with startedAt stamp"
```

---

### Task 5: `GET /api/coach/sessions/[id]/live` — composite payload

**Files:**
- Create: `src/pages/api/coach/sessions/[id]/live.ts`
- Test: `tests/api/coach/session-live.test.ts`

**Interfaces:**
- Consumes: `deriveEquipment`, `orderPromptPool`, `LivePayload` types (Task 2); `getSessionChips` from `@/lib/curriculum/reinforcement`; `groupNoun` from `@/lib/programs/group-noun`; the `verifyCoachAccess` pattern (copy it in — it is a module-local helper in the sibling files, not exported).
- Produces: `GET` returning the exact `LivePayload` JSON shape from Task 2. 403 for non-coaches of the team; 404 unknown id.

- [ ] **Step 1: Write failing API test**

`tests/api/coach/session-live.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sessionPlans } from "@/lib/db/schema";
import {
  getCoachCookie, getParentCookie, apiFetch, expectJson, resetCookies,
} from "../setup/test-helpers";

describe("GET /api/coach/sessions/[id]/live", () => {
  let coachCookie: string;
  let parentCookie: string;
  let sessionId: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    parentCookie = await getParentCookie();
    const playersJson = await expectJson(
      await apiFetch("/api/coach/players", { method: "GET", cookie: coachCookie }), 200);
    expect(playersJson.players.length).toBeGreaterThan(0);
    const teamId = playersJson.players[0].team.id;

    const created = await expectJson(
      await apiFetch("/api/coach/sessions", {
        method: "POST", cookie: coachCookie,
        body: JSON.stringify({
          teamId,
          title: "Live payload test",
          scheduledDate: new Date().toISOString(),
          durationMinutes: 60,
          status: "planned",
          equipmentNeeded: ["Cones"],
          objectives: ["First touch"],
          segments: [{ order: 0, name: "Warmup", type: "warmup", durationMinutes: 10 }],
        }),
      }), 201);
    sessionId = created.session.id;
  });

  afterAll(async () => {
    if (sessionId) await getDb().delete(sessionPlans).where(eq(sessionPlans.id, sessionId));
    resetCookies();
  });

  it("returns the composite payload in one round trip", async () => {
    const payload = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}/live`, {
        method: "GET", cookie: coachCookie,
      }), 200);

    expect(payload.session.id).toBe(sessionId);
    expect(payload.session.status).toBe("planned");
    expect(payload.session.groupNoun).toBeTruthy();
    expect(payload.session.prescribed).toBeNull();
    expect(payload.equipment).toContain("Cones");
    expect(Array.isArray(payload.segments)).toBe(true);
    expect(payload.segments[0].activitySkillIds).toEqual([]);
    expect(Array.isArray(payload.prompts)).toBe(true);
    expect(Array.isArray(payload.roster)).toBe(true);
    expect(payload.roster.length).toBeGreaterThan(0);
    expect(payload.roster[0].rosterId).toBeTruthy();
    expect(payload.roster[0].familyMemberId).toBeTruthy();
    expect(payload.glowChips.glows.length).toBeGreaterThan(0);
    expect(payload.captures).toEqual([]);
  });

  it("403s a non-coach of the team", async () => {
    const res = await apiFetch(`/api/coach/sessions/${sessionId}/live`, {
      method: "GET", cookie: parentCookie,
    });
    expect([401, 403]).toContain(res.status);
  });

  it("404s an unknown session", async () => {
    const res = await apiFetch(
      `/api/coach/sessions/00000000-0000-4000-8000-000000000000/live`,
      { method: "GET", cookie: coachCookie },
    );
    expect([403, 404]).toContain(res.status);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `CRON_SECRET=localdev TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run --config vitest.config.ts --project api tests/api/coach/session-live.test.ts`
Expected: FAIL — 404 route not found.

- [ ] **Step 3: Implement `live.ts`**

```typescript
/**
 * GET /api/coach/sessions/[id]/live
 *
 * The one composite payload behind the live-session island (coach session
 * lifecycle spec). Everything setup/field-mode/wrap-up needs, in one round
 * trip — the client holds it in memory for the whole session (load-once
 * resilience; fields have bad signal).
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  sessionPlans, activities, skills, teams, seasons, programs,
  rosters, registrations, familyMembers, attendance, users,
} from "@/lib/db/schema";
import { sessionCaptures } from "@/lib/db/schema/session-lifecycle";
import { coachPrompts } from "@/lib/db/schema/coach-guidance";
import { sequenceAttachments } from "@/lib/db/schema/blueprint";
import { eq, and, or, asc, desc, inArray, isNull, gte, lte } from "drizzle-orm";
import { requireCoachPortalAccess } from "@/lib/auth";
import { getSessionChips } from "@/lib/curriculum/reinforcement";
import { groupNoun } from "@/lib/programs/group-noun";
import { deriveEquipment } from "@/lib/sessions/equipment";
import { orderPromptPool } from "@/lib/sessions/prompt-pool";
import type { LivePrompt, LiveSegment } from "@/lib/sessions/types";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Same ownership check as the sibling session endpoints.
async function verifyCoachAccess(userId: string, sessionId: string) {
  const [session] = await getDb()
    .select({
      id: sessionPlans.id,
      teamId: sessionPlans.teamId,
      coachUserId: teams.coachUserId,
      assistantCoachUserId: teams.assistantCoachUserId,
    })
    .from(sessionPlans)
    .innerJoin(teams, eq(sessionPlans.teamId, teams.id))
    .where(eq(sessionPlans.id, sessionId));
  if (!session) return null;
  if (session.coachUserId !== userId && session.assistantCoachUserId !== userId) return null;
  return session;
}

export const GET: APIRoute = async (context) => {
  try {
    const { params } = context;
    const auth = await requireCoachPortalAccess(context);
    if (!auth.authorized) return auth.response;

    const { id } = params;
    if (!id) return json({ error: "Session ID required" }, 400);

    const access = await verifyCoachAccess(auth.user.id, id);
    if (!access) return json({ error: "Access denied" }, 403);

    const db = getDb();

    const [row] = await db
      .select({
        id: sessionPlans.id,
        title: sessionPlans.title,
        status: sessionPlans.status,
        startedAt: sessionPlans.startedAt,
        scheduledDate: sessionPlans.scheduledDate,
        durationMinutes: sessionPlans.durationMinutes,
        segments: sessionPlans.segments,
        objectives: sessionPlans.objectives,
        focusSkillIds: sessionPlans.focusSkillIds,
        equipmentNeeded: sessionPlans.equipmentNeeded,
        preSessionNotes: sessionPlans.preSessionNotes,
        sequenceAttachmentId: sessionPlans.sequenceAttachmentId,
        teamName: teams.name,
        programType: programs.programType,
        sportId: programs.sportId,
        distributorFirstName: users.firstName,
        distributorEmail: users.email,
      })
      .from(sessionPlans)
      .innerJoin(teams, eq(sessionPlans.teamId, teams.id))
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .leftJoin(sequenceAttachments, eq(sessionPlans.sequenceAttachmentId, sequenceAttachments.id))
      .leftJoin(users, eq(sequenceAttachments.distributedBy, users.id))
      .where(eq(sessionPlans.id, id));

    if (!row) return json({ error: "Session not found" }, 404);

    // Resolve each segment's activity -> skill ids + equipment in one query.
    const segs = row.segments ?? [];
    const activityIds = [...new Set(segs.map((s) => s.activityId).filter((a): a is string => !!a))];
    const activityRows = activityIds.length
      ? await db
          .select({
            id: activities.id,
            skillsDeveloped: activities.skillsDeveloped,
            equipmentNeeded: activities.equipmentNeeded,
          })
          .from(activities)
          .where(inArray(activities.id, activityIds))
      : [];
    const activityById = new Map(activityRows.map((a) => [a.id, a]));

    const segments: LiveSegment[] = segs.map((s) => ({
      order: s.order,
      name: s.name,
      type: s.type,
      durationMinutes: s.durationMinutes,
      activityId: s.activityId,
      activityName: s.activityName,
      notes: s.notes,
      activitySkillIds: s.activityId
        ? (activityById.get(s.activityId)?.skillsDeveloped ?? [])
        : [],
    }));

    const equipment = deriveEquipment(
      row.equipmentNeeded,
      segs.map((s) => (s.activityId ? (activityById.get(s.activityId)?.equipmentNeeded ?? null) : null)),
    );

    // Prompt pool: during_practice prompts for this sport (or sport-agnostic),
    // org-or-global, matching the plan's skills or generic (skillId null).
    const planSkillIds = [
      ...new Set([...(row.focusSkillIds ?? []), ...segments.flatMap((s) => s.activitySkillIds)]),
    ];
    const promptRows = await db
      .select({
        id: coachPrompts.id,
        promptType: coachPrompts.promptType,
        content: coachPrompts.content,
        skillId: coachPrompts.skillId,
        priority: coachPrompts.priority,
      })
      .from(coachPrompts)
      .where(
        and(
          eq(coachPrompts.triggerContext, "during_practice"),
          or(isNull(coachPrompts.organizationId), eq(coachPrompts.organizationId, auth.organizationId)),
          or(isNull(coachPrompts.sportId), eq(coachPrompts.sportId, row.sportId)),
          planSkillIds.length > 0
            ? or(isNull(coachPrompts.skillId), inArray(coachPrompts.skillId, planSkillIds))
            : isNull(coachPrompts.skillId),
        ),
      )
      .orderBy(desc(coachPrompts.priority), asc(coachPrompts.id));
    const prompts = orderPromptPool(promptRows as LivePrompt[]);

    // Roster with any same-day practice attendance already recorded.
    const rosterRows = await db
      .select({
        rosterId: rosters.id,
        familyMemberId: familyMembers.id,
        firstName: familyMembers.firstName,
        lastName: familyMembers.lastName,
      })
      .from(rosters)
      .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .where(and(eq(rosters.teamId, access.teamId), eq(rosters.status, "active")))
      .orderBy(asc(familyMembers.lastName), asc(familyMembers.firstName));

    const dayStart = new Date(row.scheduledDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(row.scheduledDate);
    dayEnd.setHours(23, 59, 59, 999);
    const attendanceRows = await db
      .select({ rosterId: attendance.rosterId, status: attendance.status })
      .from(attendance)
      .where(
        and(
          eq(attendance.teamId, access.teamId),
          eq(attendance.eventType, "practice"),
          gte(attendance.eventDate, dayStart),
          lte(attendance.eventDate, dayEnd),
        ),
      );
    const attendanceByRoster = new Map(attendanceRows.map((r) => [r.rosterId, r.status]));

    // Glow/grow chips for the wrap-up seed (same resolution as glows GET).
    const skillSlugRows = planSkillIds.length
      ? await db
          .select({ slug: skills.slug })
          .from(skills)
          .where(inArray(skills.id, planSkillIds))
          .orderBy(asc(skills.slug))
      : [];
    const glowChips = getSessionChips({ skillSlugs: skillSlugRows.map((s) => s.slug) });

    const captureRows = await db
      .select({
        id: sessionCaptures.id,
        clientId: sessionCaptures.clientId,
        rosterId: sessionCaptures.rosterId,
        kind: sessionCaptures.kind,
        skillId: sessionCaptures.skillId,
        note: sessionCaptures.note,
        consumedAt: sessionCaptures.consumedAt,
      })
      .from(sessionCaptures)
      .where(eq(sessionCaptures.sessionPlanId, id))
      .orderBy(asc(sessionCaptures.createdAt));

    return json(
      {
        session: {
          id: row.id,
          title: row.title,
          status: row.status,
          startedAt: row.startedAt,
          scheduledDate: row.scheduledDate,
          durationMinutes: row.durationMinutes,
          objectives: row.objectives ?? [],
          focusSkillIds: row.focusSkillIds ?? [],
          preSessionNotes: row.preSessionNotes,
          prescribed: row.sequenceAttachmentId
            ? {
                attachmentId: row.sequenceAttachmentId,
                distributorFirstName:
                  row.distributorFirstName || row.distributorEmail?.split("@")[0] || null,
              }
            : null,
          groupNoun: groupNoun(row.programType),
          teamName: row.teamName,
        },
        segments,
        equipment,
        prompts,
        roster: rosterRows.map((r) => ({
          ...r,
          attendanceStatus: attendanceByRoster.get(r.rosterId) ?? null,
        })),
        glowChips,
        captures: captureRows,
      },
      200,
    );
  } catch (error) {
    console.error("Error building live session payload:", error);
    return json({ error: "Internal server error" }, 500);
  }
};
```

- [ ] **Step 4: Run to verify pass**

Same command as Step 2. Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/coach/sessions/ tests/api/coach/session-live.test.ts
git commit -m "feat(sessions): composite live payload endpoint"
```

---

### Task 6: `POST /api/coach/sessions/[id]/captures` — idempotent batch flush

**Files:**
- Create: `src/pages/api/coach/sessions/[id]/captures.ts`
- Test: `tests/api/coach/session-captures.test.ts`

**Interfaces:**
- Consumes: `FlushEnvelope` shape from Task 3 as the request body: `{ captures?: CaptureInput[], attendance?: [{rosterId, status}], consumedClientIds?: string[] }`.
- Produces: `201 { captures: [{ id, clientId }], attendanceUpdated: number, consumed: number }`. Idempotent: replaying the same envelope yields the same capture ids and no duplicate rows. Rosters not on the session's team → 400 whole-batch reject (nothing written). Attendance rows written with `eventType: "practice"`, `eventDate` = session's scheduledDate, `sessionPlanId` set, upserted on (rosterId, sessionPlanId).

- [ ] **Step 1: Write failing API test**

`tests/api/coach/session-captures.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sessionPlans, attendance } from "@/lib/db/schema";
import { sessionCaptures } from "@/lib/db/schema/session-lifecycle";
import {
  getCoachCookie, apiFetch, expectJson, resetCookies,
} from "../setup/test-helpers";

describe("POST /api/coach/sessions/[id]/captures", () => {
  let coachCookie: string;
  let sessionId: string;
  let rosterId: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    const playersJson = await expectJson(
      await apiFetch("/api/coach/players", { method: "GET", cookie: coachCookie }), 200);
    const teamId = playersJson.players[0].team.id;

    const created = await expectJson(
      await apiFetch("/api/coach/sessions", {
        method: "POST", cookie: coachCookie,
        body: JSON.stringify({
          teamId, title: "Captures test", scheduledDate: new Date().toISOString(),
          durationMinutes: 60, status: "in_progress",
          segments: [{ order: 0, name: "Main", type: "technical", durationMinutes: 60 }],
        }),
      }), 201);
    sessionId = created.session.id;

    const live = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}/live`, {
        method: "GET", cookie: coachCookie,
      }), 200);
    expect(live.roster.length).toBeGreaterThan(0);
    rosterId = live.roster[0].rosterId;
  });

  afterAll(async () => {
    if (sessionId) {
      await getDb().delete(sessionCaptures).where(eq(sessionCaptures.sessionPlanId, sessionId));
      await getDb().delete(attendance).where(eq(attendance.sessionPlanId, sessionId));
      await getDb().delete(sessionPlans).where(eq(sessionPlans.id, sessionId));
    }
    resetCookies();
  });

  it("writes captures + attendance; replaying the envelope is idempotent", async () => {
    const clientId = randomUUID();
    const envelope = {
      captures: [{ clientId, rosterId, kind: "glow", skillId: null, note: "great hustle" }],
      attendance: [{ rosterId, status: "present" }],
      consumedClientIds: [],
    };

    const first = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}/captures`, {
        method: "POST", cookie: coachCookie, body: JSON.stringify(envelope),
      }), 201);
    expect(first.captures).toHaveLength(1);
    expect(first.captures[0].clientId).toBe(clientId);
    expect(first.attendanceUpdated).toBe(1);

    const second = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}/captures`, {
        method: "POST", cookie: coachCookie, body: JSON.stringify(envelope),
      }), 201);
    expect(second.captures[0].id).toBe(first.captures[0].id); // same row, no dup

    const rows = await getDb()
      .select()
      .from(sessionCaptures)
      .where(eq(sessionCaptures.sessionPlanId, sessionId));
    expect(rows).toHaveLength(1);

    const attRows = await getDb()
      .select()
      .from(attendance)
      .where(eq(attendance.sessionPlanId, sessionId));
    expect(attRows).toHaveLength(1);
    expect(attRows[0].status).toBe("present");
  });

  it("consumedClientIds stamps consumedAt", async () => {
    const clientId = randomUUID();
    await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}/captures`, {
        method: "POST", cookie: coachCookie,
        body: JSON.stringify({
          captures: [{ clientId, rosterId, kind: "observation", note: "left foot" }],
        }),
      }), 201);
    const res = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}/captures`, {
        method: "POST", cookie: coachCookie,
        body: JSON.stringify({ consumedClientIds: [clientId] }),
      }), 201);
    expect(res.consumed).toBe(1);
  });

  it("rejects the whole batch when any roster is off-team (nothing written)", async () => {
    const res = await apiFetch(`/api/coach/sessions/${sessionId}/captures`, {
      method: "POST", cookie: coachCookie,
      body: JSON.stringify({
        captures: [
          { clientId: randomUUID(), rosterId, kind: "glow" },
          { clientId: randomUUID(), rosterId: "00000000-0000-4000-8000-000000000000", kind: "glow" },
        ],
      }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `CRON_SECRET=localdev TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run --config vitest.config.ts --project api tests/api/coach/session-captures.test.ts`
Expected: FAIL — 404 route not found.

- [ ] **Step 3: Implement `captures.ts`**

```typescript
/**
 * POST /api/coach/sessions/[id]/captures
 *
 * The single flush target for the field-mode offline queue: quick captures,
 * attendance marks, and capture-consumption stamps in one envelope, all
 * idempotent so the client can retry aggressively (coach session lifecycle
 * spec). Whole-batch validation before any write.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { sessionPlans, teams, rosters, attendance } from "@/lib/db/schema";
import { sessionCaptures } from "@/lib/db/schema/session-lifecycle";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireCoachPortalAccess } from "@/lib/auth";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function verifyCoachAccess(userId: string, sessionId: string) {
  const [session] = await getDb()
    .select({
      id: sessionPlans.id,
      teamId: sessionPlans.teamId,
      scheduledDate: sessionPlans.scheduledDate,
      coachUserId: teams.coachUserId,
      assistantCoachUserId: teams.assistantCoachUserId,
    })
    .from(sessionPlans)
    .innerJoin(teams, eq(sessionPlans.teamId, teams.id))
    .where(eq(sessionPlans.id, sessionId));
  if (!session) return null;
  if (session.coachUserId !== userId && session.assistantCoachUserId !== userId) return null;
  return session;
}

const envelopeSchema = z.object({
  captures: z
    .array(
      z.object({
        clientId: z.string().min(1).max(64),
        rosterId: z.string().uuid(),
        kind: z.enum(["glow", "observation"]),
        skillId: z.string().uuid().nullable().optional(),
        note: z.string().max(280).nullable().optional(),
      }),
    )
    .max(80)
    .default([]),
  attendance: z
    .array(
      z.object({
        rosterId: z.string().uuid(),
        status: z.enum(["present", "absent", "late", "excused"]),
      }),
    )
    .max(80)
    .default([]),
  consumedClientIds: z.array(z.string().min(1).max(64)).max(200).default([]),
});

export const POST: APIRoute = async (context) => {
  try {
    const { params, request } = context;
    const auth = await requireCoachPortalAccess(context);
    if (!auth.authorized) return auth.response;

    const { id } = params;
    if (!id) return json({ error: "Session ID required" }, 400);

    const access = await verifyCoachAccess(auth.user.id, id);
    if (!access) return json({ error: "Access denied" }, 403);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const validation = envelopeSchema.safeParse(body);
    if (!validation.success) {
      return json(
        { error: "Validation failed", details: validation.error.flatten().fieldErrors },
        400,
      );
    }
    const envelope = validation.data;

    // Whole-batch roster validation BEFORE any write.
    const referencedRosterIds = [
      ...new Set([
        ...envelope.captures.map((c) => c.rosterId),
        ...envelope.attendance.map((a) => a.rosterId),
      ]),
    ];
    if (referencedRosterIds.length > 0) {
      const onTeam = await getDb()
        .select({ id: rosters.id })
        .from(rosters)
        .where(and(inArray(rosters.id, referencedRosterIds), eq(rosters.teamId, access.teamId)));
      if (onTeam.length !== referencedRosterIds.length) {
        return json({ error: "One or more players are not on this session's roster" }, 400);
      }
    }

    const result = await getDb().transaction(async (tx) => {
      // Captures: insert-or-return-existing on (sessionPlanId, clientId).
      const captureResults: Array<{ id: string; clientId: string }> = [];
      for (const c of envelope.captures) {
        const inserted = await tx
          .insert(sessionCaptures)
          .values({
            sessionPlanId: id,
            rosterId: c.rosterId,
            kind: c.kind,
            skillId: c.skillId ?? null,
            note: c.note ?? null,
            clientId: c.clientId,
          })
          .onConflictDoNothing()
          .returning({ id: sessionCaptures.id });
        if (inserted.length > 0) {
          captureResults.push({ id: inserted[0].id, clientId: c.clientId });
        } else {
          const [existing] = await tx
            .select({ id: sessionCaptures.id })
            .from(sessionCaptures)
            .where(
              and(eq(sessionCaptures.sessionPlanId, id), eq(sessionCaptures.clientId, c.clientId)),
            );
          captureResults.push({ id: existing.id, clientId: c.clientId });
        }
      }

      // Attendance: upsert on (rosterId, sessionPlanId) — select-then-write
      // inside the transaction (no unique constraint on the pair; existing
      // tracker rows have null sessionPlanId and are untouched).
      let attendanceUpdated = 0;
      for (const a of envelope.attendance) {
        const [existing] = await tx
          .select({ id: attendance.id })
          .from(attendance)
          .where(and(eq(attendance.rosterId, a.rosterId), eq(attendance.sessionPlanId, id)));
        if (existing) {
          await tx.update(attendance).set({ status: a.status }).where(eq(attendance.id, existing.id));
        } else {
          await tx.insert(attendance).values({
            teamId: access.teamId,
            rosterId: a.rosterId,
            sessionPlanId: id,
            eventDate: access.scheduledDate,
            eventType: "practice",
            status: a.status,
            recordedByUserId: auth.user.id,
          });
        }
        attendanceUpdated += 1;
      }

      // Consumption: stamp consumedAt once (idempotent — already-stamped
      // rows are left alone so the first consumption time survives).
      let consumed = 0;
      if (envelope.consumedClientIds.length > 0) {
        const rows = await tx
          .update(sessionCaptures)
          .set({ consumedAt: new Date() })
          .where(
            and(
              eq(sessionCaptures.sessionPlanId, id),
              inArray(sessionCaptures.clientId, envelope.consumedClientIds),
            ),
          )
          .returning({ id: sessionCaptures.id });
        consumed = rows.length;
      }

      return { captures: captureResults, attendanceUpdated, consumed };
    });

    return json(result, 201);
  } catch (error) {
    console.error("Error flushing session captures:", error);
    return json({ error: "Internal server error" }, 500);
  }
};
```

Note: check `attendance.recordedByUserId` is the actual column name in `teams.ts` (visible at ~line 365) — adjust if it differs.

- [ ] **Step 4: Run to verify pass**

Same command as Step 2. Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/coach/sessions/ tests/api/coach/session-captures.test.ts
git commit -m "feat(sessions): idempotent captures/attendance/consume flush endpoint"
```

---

### Task 7: Route + island shell + setup surface

**Files:**
- Create: `src/pages/coach/practices/[id]/live.astro`
- Create: `src/components/coach/live/session-live.tsx`
- Create: `src/components/coach/live/setup-view.tsx`

**Interfaces:**
- Consumes: `GET .../live` (Task 5), `PUT .../[id]` transitions (Task 4), queue lib (Task 3), `LivePayload` (Task 2).
- Produces: `session-live.tsx` exports default `SessionLive({ sessionId }: { sessionId: string })`; internal context shape passed to surfaces: `{ payload: LivePayload; queue: QueueState; dispatch: (action) => void; flushNow: () => Promise<void>; offline: boolean; transition: (status) => Promise<void> }`. `setup-view.tsx` exports default `SetupView(props: SurfaceProps)` where `SurfaceProps = { payload, onStart: () => void }` (extended by later tasks — field mode and wrap-up receive the queue-wired props).

- [ ] **Step 1: Route page**

`src/pages/coach/practices/[id]/live.astro` (SSR, middleware-protected — no prerender flag):

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";
import CoachLayout from "@/components/coach/coach-layout"; // match the import used by practices/[id].astro — copy its exact frontmatter pattern
import SessionLive from "@/components/coach/live/session-live";

const { id } = Astro.params;
if (!id) return Astro.redirect("/coach/practices");
---

<BaseLayout title="Live Session">
  <SessionLive client:load sessionId={id} />
</BaseLayout>
```

**Copy the actual layout wrapper from `src/pages/coach/practices/[id].astro`** — whatever component/props it uses around its island, use the same (the exact shape wasn't pinned here; matching the sibling page is the requirement). The island itself renders full-bleed on mobile.

- [ ] **Step 2: Island shell**

`src/components/coach/live/session-live.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import type { LivePayload, AttendanceStatus, CaptureInput } from "@/lib/sessions/types";
import {
  emptyQueue, enqueueCapture, enqueueAttendance, enqueueConsume,
  buildEnvelope, markFlushed, serializeQueue, restoreQueue,
  type QueueState,
} from "@/lib/sessions/capture-queue";
import SetupView from "./setup-view";
import FieldMode from "./field-mode";
import WrapUp from "./wrap-up";

type Stage = "setup" | "field" | "wrapup" | "done" | "cancelled";

function stageFor(status: LivePayload["session"]["status"]): Stage {
  if (status === "cancelled") return "cancelled";
  if (status === "completed") return "done";
  if (status === "in_progress") return "field";
  return "setup";
}

const storageKey = (sessionId: string) => `session-live-queue:${sessionId}`;

export default function SessionLive({ sessionId }: { sessionId: string }) {
  useHydrationBeacon();

  const [payload, setPayload] = useState<LivePayload | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [stage, setStage] = useState<Stage>("setup");
  const [offline, setOffline] = useState(false);
  const queueRef = useRef<QueueState>(emptyQueue);
  const [, forceRender] = useState(0);
  const flushing = useRef(false);

  const persistQueue = useCallback(() => {
    try {
      sessionStorage.setItem(storageKey(sessionId), serializeQueue(queueRef.current));
    } catch {
      /* storage full/unavailable — in-memory queue still works */
    }
    forceRender((n) => n + 1);
  }, [sessionId]);

  const flushNow = useCallback(async () => {
    if (flushing.current) return;
    const envelope = buildEnvelope(queueRef.current);
    if (!envelope) return;
    flushing.current = true;
    try {
      const res = await fetch(`/api/coach/sessions/${sessionId}/captures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      });
      if (!res.ok) throw new Error(String(res.status));
      queueRef.current = markFlushed(queueRef.current, envelope);
      setOffline(false);
      persistQueue();
    } catch {
      setOffline(true);
    } finally {
      flushing.current = false;
    }
  }, [sessionId, persistQueue]);

  // Load-once payload + queue restore.
  useEffect(() => {
    queueRef.current = restoreQueue(sessionStorage.getItem(storageKey(sessionId)));
    let cancelled = false;
    fetch(`/api/coach/sessions/${sessionId}/live`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((p: LivePayload) => {
        if (cancelled) return;
        setPayload(p);
        setStage(stageFor(p.session.status));
        void flushNow(); // drain anything restored from a killed tab
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [sessionId, flushNow]);

  // Reconnect + backoff flush.
  useEffect(() => {
    const onOnline = () => void flushNow();
    window.addEventListener("online", onOnline);
    const interval = setInterval(() => void flushNow(), 20_000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [flushNow]);

  const capture = useCallback(
    (c: CaptureInput) => {
      queueRef.current = enqueueCapture(queueRef.current, c);
      persistQueue();
      void flushNow();
    },
    [persistQueue, flushNow],
  );

  const markAttendance = useCallback(
    (rosterId: string, status: AttendanceStatus) => {
      queueRef.current = enqueueAttendance(queueRef.current, rosterId, status);
      persistQueue();
      void flushNow();
    },
    [persistQueue, flushNow],
  );

  const consume = useCallback(
    (clientIds: string[]) => {
      queueRef.current = enqueueConsume(queueRef.current, clientIds);
      persistQueue();
      void flushNow();
    },
    [persistQueue, flushNow],
  );

  // Status transitions are optimistic: stage moves immediately, the PUT
  // retries in the background (server side is a retry-safe no-op).
  const transition = useCallback(
    async (status: "in_progress" | "completed", extra?: Record<string, unknown>) => {
      try {
        const res = await fetch(`/api/coach/sessions/${sessionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, ...extra }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setOffline(false);
        return true;
      } catch {
        setOffline(true);
        return false;
      }
    },
    [sessionId],
  );

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <ErrorBanner message="Couldn't load this session. Check your connection and try again." />
        <button
          className="mt-4 min-h-11 w-full rounded-lg border px-4 font-medium"
          onClick={() => location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }
  if (!payload) return <LoadingSkeleton />;

  const pendingCount =
    queueRef.current.captures.length + Object.keys(queueRef.current.attendance).length;

  return (
    <div className="mx-auto max-w-lg pb-24">
      {offline && (
        <div
          data-testid="offline-pill"
          className="sticky top-0 z-10 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900"
        >
          Offline — {pendingCount > 0 ? `${pendingCount} unsaved, ` : ""}will sync when back
        </div>
      )}
      {stage === "cancelled" && (
        <div className="p-6 text-center">
          <p className="text-lg font-medium">This session was cancelled.</p>
          <a href="/coach/practices" className="mt-4 inline-block min-h-11 underline">
            Back to practices
          </a>
        </div>
      )}
      {stage === "setup" && (
        <SetupView
          payload={payload}
          onStart={async () => {
            setStage("field");
            setPayload((p) =>
              p ? { ...p, session: { ...p.session, status: "in_progress", startedAt: p.session.startedAt ?? new Date().toISOString() } } : p,
            );
            await transition("in_progress");
          }}
        />
      )}
      {stage === "field" && (
        <FieldMode
          payload={payload}
          queue={queueRef.current}
          onCapture={capture}
          onAttendance={markAttendance}
          onEnd={() => setStage("wrapup")}
        />
      )}
      {(stage === "wrapup" || stage === "done") && (
        <WrapUp
          payload={payload}
          queue={queueRef.current}
          readOnly={stage === "done"}
          onAttendance={markAttendance}
          onConsume={consume}
          onFinish={async (reflection) => {
            await flushNow();
            const ok = await transition("completed", reflection);
            if (ok) setStage("done");
            return ok;
          }}
        />
      )}
    </div>
  );
}
```

(Task 8/9 create `FieldMode`/`WrapUp`; to keep this task green standalone, create placeholder files exporting minimal components with the exact prop signatures above that render `<div data-testid="field-mode" />` / `<div data-testid="wrap-up" />` — replaced in their own tasks.)

- [ ] **Step 3: Setup surface**

`src/components/coach/live/setup-view.tsx`:

```tsx
"use client";

import type { LivePayload } from "@/lib/sessions/types";

export default function SetupView({
  payload,
  onStart,
}: {
  payload: LivePayload;
  onStart: () => void;
}) {
  const { session, segments, equipment, roster } = payload;
  const absences = roster.filter(
    (r) => r.attendanceStatus === "absent" || r.attendanceStatus === "excused",
  );

  return (
    <div className="space-y-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">{session.title}</h1>
        <p className="text-sm text-muted-foreground">
          {session.teamName} · {session.durationMinutes} min
          {session.prescribed
            ? ` · Program plan · from ${session.prescribed.distributorFirstName ?? "your director"}`
            : ""}
        </p>
      </header>

      {session.objectives.length > 0 && (
        <section>
          <h2 className="mb-2 font-medium">Tonight's focus</h2>
          <ul className="list-disc pl-5 text-sm">
            {session.objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-medium">Plan</h2>
        <ol className="space-y-2" data-testid="setup-segments">
          {segments.map((s) => (
            <li key={s.order} className="flex items-baseline justify-between rounded-lg border p-3">
              <span>
                {s.name}
                {s.activityName ? ` — ${s.activityName}` : ""}
              </span>
              <span className="text-sm text-muted-foreground">{s.durationMinutes} min</span>
            </li>
          ))}
        </ol>
      </section>

      {equipment.length > 0 && (
        <section>
          <h2 className="mb-2 font-medium">Bring</h2>
          <ul className="space-y-1" data-testid="setup-equipment">
            {equipment.map((e) => (
              <li key={e} className="flex min-h-11 items-center gap-3">
                <input type="checkbox" className="size-5" id={`eq-${e}`} />
                <label htmlFor={`eq-${e}`}>{e}</label>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-medium">
          Your {payload.session.groupNoun} ({roster.length})
        </h2>
        {absences.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Out today: {absences.map((a) => a.firstName).join(", ")}
          </p>
        )}
      </section>

      {session.prescribed && (
        <p className="text-sm text-muted-foreground">
          Need to change something? You can adjust the plan on the{" "}
          <a className="underline" href={`/coach/practices/${session.id}`}>
            session page
          </a>
          . Changes show as "adapted" to your director — that's fine, you know
          your {payload.session.groupNoun}.
        </p>
      )}

      <button
        data-testid="start-session"
        onClick={onStart}
        className="fixed inset-x-4 bottom-4 min-h-14 max-w-lg rounded-xl bg-primary text-lg font-semibold text-primary-foreground mx-auto w-[calc(100%-2rem)]"
      >
        Start session
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Manual verify + typecheck**

Run: `npx tsc --noEmit` — Expected: 0 errors.
With the dev server up, sign in as `coach@test.aspiresports.com` / `TestCoach123!`, open an existing planned session's `/coach/practices/<id>/live` — setup renders; Start flips to the field-mode placeholder; reload lands back in field placeholder (status persisted).

- [ ] **Step 5: Commit**

```bash
git add src/pages/coach/practices/ src/components/coach/live/
git commit -m "feat(coach): live session route, staged island shell, setup surface"
```

---

### Task 8: Field mode surface

**Files:**
- Modify (replace placeholder): `src/components/coach/live/field-mode.tsx`

**Interfaces:**
- Consumes: `promptForSegment`, `segmentWindows`, `elapsedMinutes` (Tasks 2–3); props from Task 7: `{ payload, queue, onCapture(c: CaptureInput), onAttendance(rosterId, status), onEnd() }`.
- Produces: the complete field-mode UI. Test ids used by e2e: `field-mode`, `current-segment`, `advance-segment`, `prompt-card`, `cycle-prompt`, `player-chip-<rosterId>`, `capture-glow`, `capture-save`, `attendance-sheet`, `attendance-done`, `end-session`.

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { AttendanceStatus, CaptureInput, LivePayload } from "@/lib/sessions/types";
import type { QueueState } from "@/lib/sessions/capture-queue";
import { promptForSegment } from "@/lib/sessions/prompt-pool";
import { elapsedMinutes } from "@/lib/sessions/timer";

export default function FieldMode({
  payload,
  queue,
  onCapture,
  onAttendance,
  onEnd,
}: {
  payload: LivePayload;
  queue: QueueState;
  onCapture: (c: CaptureInput) => void;
  onAttendance: (rosterId: string, status: AttendanceStatus) => void;
  onEnd: () => void;
}) {
  const { session, segments, prompts, roster } = payload;
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [promptCycle, setPromptCycle] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [sheetRosterId, setSheetRosterId] = useState<string | null>(null);
  // Attendance sheet shows once on first entry unless every player already
  // has a recorded status (pre-marked or queued).
  const [showAttendance, setShowAttendance] = useState(() =>
    roster.some((r) => !r.attendanceStatus && !queue.attendance[r.rosterId]),
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const segment = segments[segmentIndex] ?? segments[segments.length - 1];
  const elapsed = session.startedAt ? elapsedMinutes(session.startedAt, now) : 0;
  const prompt = useMemo(
    () => (segment ? promptForSegment(prompts, segment, promptCycle) : null),
    [prompts, segment, promptCycle],
  );
  const next = segments[segmentIndex + 1] ?? null;
  const statusFor = (rosterId: string): AttendanceStatus | null =>
    queue.attendance[rosterId] ?? roster.find((r) => r.rosterId === rosterId)?.attendanceStatus ?? null;

  return (
    <div data-testid="field-mode" className="flex min-h-screen flex-col gap-4 p-4">
      <p className="text-sm text-muted-foreground">
        {session.title} · {Math.floor(elapsed)} min in
      </p>

      {segment && (
        <button
          data-testid="advance-segment"
          onClick={() => {
            setSegmentIndex((i) => Math.min(i + 1, segments.length - 1));
            setPromptCycle(0);
          }}
          className="rounded-2xl border-2 p-6 text-left"
        >
          <p data-testid="current-segment" className="text-2xl font-semibold">
            {segment.name}
            {segment.activityName ? ` — ${segment.activityName}` : ""}
          </p>
          <p className="mt-1 text-muted-foreground">
            {segment.durationMinutes} min
            {next ? ` · next: ${next.name}` : " · last block"}
          </p>
          {segment.notes && <p className="mt-2 text-sm">{segment.notes}</p>}
          <p className="mt-3 text-xs text-muted-foreground">Tap when you move on</p>
        </button>
      )}

      {prompt && (
        <button
          data-testid="prompt-card"
          onClick={() => setPromptCycle((c) => c + 1)}
          className="rounded-xl bg-muted p-4 text-left"
        >
          <p className="text-sm">{prompt.content}</p>
          <p data-testid="cycle-prompt" className="mt-2 text-xs text-muted-foreground">
            Tap for another
          </p>
        </button>
      )}

      <section className="mt-auto">
        <p className="mb-2 text-sm font-medium">Spot something good?</p>
        <div className="flex flex-wrap gap-2">
          {roster.map((r) => (
            <button
              key={r.rosterId}
              data-testid={`player-chip-${r.rosterId}`}
              onClick={() => setSheetRosterId(r.rosterId)}
              className={`min-h-11 rounded-full border px-4 ${
                statusFor(r.rosterId) === "absent" || statusFor(r.rosterId) === "excused"
                  ? "opacity-40"
                  : ""
              }`}
            >
              {r.firstName}
            </button>
          ))}
        </div>
      </section>

      <button
        data-testid="end-session"
        onClick={onEnd}
        className="min-h-14 rounded-xl border-2 border-primary font-semibold text-primary"
      >
        End session
      </button>

      {sheetRosterId && (
        <CaptureSheet
          player={roster.find((r) => r.rosterId === sheetRosterId)!}
          glowChips={payload.glowChips.glows}
          onSave={(c) => {
            onCapture(c);
            setSheetRosterId(null);
          }}
          onClose={() => setSheetRosterId(null)}
        />
      )}

      {showAttendance && (
        <AttendanceSheet
          roster={roster}
          statusFor={statusFor}
          onMark={onAttendance}
          onDone={() => setShowAttendance(false)}
        />
      )}
    </div>
  );
}

function CaptureSheet({
  player,
  glowChips,
  onSave,
  onClose,
}: {
  player: { rosterId: string; firstName: string };
  glowChips: string[];
  onSave: (c: CaptureInput) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const save = (kind: "glow" | "observation", noteText: string | null) =>
    onSave({
      clientId: crypto.randomUUID(),
      rosterId: player.rosterId,
      kind,
      skillId: null,
      note: noteText,
    });

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-background p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-lg font-semibold">{player.firstName}</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {glowChips.slice(0, 6).map((chip) => (
            <button
              key={chip}
              data-testid="capture-glow"
              onClick={() => save("glow", chip)}
              className="min-h-11 rounded-full border px-4"
            >
              {chip}
            </button>
          ))}
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Or a quick note…"
          maxLength={280}
          className="mb-3 min-h-11 w-full rounded-lg border px-3"
        />
        <button
          data-testid="capture-save"
          disabled={!note.trim()}
          onClick={() => save("observation", note.trim())}
          className="min-h-11 w-full rounded-lg bg-primary font-medium text-primary-foreground disabled:opacity-40"
        >
          Save note
        </button>
      </div>
    </div>
  );
}

function AttendanceSheet({
  roster,
  statusFor,
  onMark,
  onDone,
}: {
  roster: LivePayload["roster"];
  statusFor: (rosterId: string) => AttendanceStatus | null;
  onMark: (rosterId: string, status: AttendanceStatus) => void;
  onDone: () => void;
}) {
  return (
    <div data-testid="attendance-sheet" className="fixed inset-0 z-20 overflow-y-auto bg-background p-4">
      <h2 className="mb-1 text-xl font-semibold">Who's here?</h2>
      <p className="mb-4 text-sm text-muted-foreground">Everyone's marked present — tap to flip.</p>
      <ul className="space-y-2">
        {roster.map((r) => {
          const status = statusFor(r.rosterId) ?? "present";
          return (
            <li key={r.rosterId}>
              <button
                onClick={() => onMark(r.rosterId, status === "present" ? "absent" : "present")}
                className={`flex min-h-12 w-full items-center justify-between rounded-lg border px-4 ${
                  status === "present" ? "" : "bg-muted opacity-60"
                }`}
              >
                <span>
                  {r.firstName} {r.lastName}
                </span>
                <span className="text-sm">{status}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        data-testid="attendance-done"
        onClick={() => {
          // Default-present: persist a mark for anyone still untouched.
          for (const r of roster) if (!statusFor(r.rosterId)) onMark(r.rosterId, "present");
          onDone();
        }}
        className="mt-4 min-h-14 w-full rounded-xl bg-primary font-semibold text-primary-foreground"
      >
        Done
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + manual verify**

Run: `npx tsc --noEmit` — 0 errors. Manually: start a session → attendance sheet appears → mark all → tap a player → save a glow chip → check `session_captures` row exists (`npm run db:studio` or the captures endpoint test data). Kill the network in devtools → capture again → offline pill shows → restore network → pill clears.

- [ ] **Step 3: Commit**

```bash
git add src/components/coach/live/field-mode.tsx
git commit -m "feat(coach): field mode — run-of-show, prompts, quick capture, attendance"
```

---

### Task 9: Wrap-up stepper

**Files:**
- Modify (replace placeholder): `src/components/coach/live/wrap-up.tsx`

**Interfaces:**
- Consumes: props from Task 7: `{ payload, queue, readOnly, onAttendance, onConsume(clientIds), onFinish(reflection: { whatWorkedWell?: string; whatToImprove?: string }) => Promise<boolean> }`; existing `POST /api/coach/sessions/[id]/glows` for promotion (entries keyed by `familyMemberId` — map from capture `rosterId` via `payload.roster`).
- Produces: three-step stepper. Test ids: `wrapup-step-attendance`, `wrapup-step-glows`, `wrapup-step-reflection`, `wrapup-next`, `capture-promote-<clientId>`, `capture-keep-<clientId>`, `capture-discard-<clientId>`, `finish-session`, `wrapup-done`.

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { AttendanceStatus, LivePayload } from "@/lib/sessions/types";
import type { QueueState } from "@/lib/sessions/capture-queue";

type CaptureDecision = "promote" | "keep" | "discard";

export default function WrapUp({
  payload,
  queue,
  readOnly,
  onAttendance,
  onConsume,
  onFinish,
}: {
  payload: LivePayload;
  queue: QueueState;
  readOnly: boolean;
  onAttendance: (rosterId: string, status: AttendanceStatus) => void;
  onConsume: (clientIds: string[]) => void;
  onFinish: (reflection: { whatWorkedWell?: string; whatToImprove?: string }) => Promise<boolean>;
}) {
  const [step, setStep] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, CaptureDecision>>({});
  const [worked, setWorked] = useState("");
  const [improve, setImprove] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(readOnly);

  const rosterByRosterId = useMemo(
    () => new Map(payload.roster.map((r) => [r.rosterId, r])),
    [payload.roster],
  );
  // Pending captures = server-known unconsumed + still-queued ones.
  const captures = useMemo(() => {
    const server = payload.captures.filter((c) => !c.consumedAt);
    const queuedIds = new Set(queue.captures.map((c) => c.clientId));
    return [...server.filter((c) => !queuedIds.has(c.clientId)), ...queue.captures];
  }, [payload.captures, queue.captures]);

  if (finished) {
    return (
      <div data-testid="wrapup-done" className="p-6 text-center">
        <p className="text-2xl font-semibold">Session wrapped up 🎉</p>
        <p className="mt-2 text-muted-foreground">
          Glows are on their way to families.
        </p>
        <a href="/coach/practices" className="mt-6 inline-block min-h-11 underline">
          Back to practices
        </a>
      </div>
    );
  }

  const statusFor = (rosterId: string): AttendanceStatus =>
    queue.attendance[rosterId] ??
    rosterByRosterId.get(rosterId)?.attendanceStatus ??
    "present";

  const finish = async () => {
    setFinishing(true);
    try {
      // 1. Promote decided glows through the existing endpoint.
      const promote = captures.filter((c) => decisions[c.clientId] === "promote");
      if (promote.length > 0) {
        const entries = promote
          .map((c) => {
            const player = rosterByRosterId.get(c.rosterId);
            if (!player) return null;
            const isChip = c.kind === "glow" && c.note && payload.glowChips.glows.includes(c.note);
            return {
              familyMemberId: player.familyMemberId,
              glows: isChip ? [c.note] : [payload.glowChips.glows[0]],
              note: isChip ? undefined : (c.note ?? undefined),
            };
          })
          .filter(Boolean);
        if (entries.length > 0) {
          const res = await fetch(`/api/coach/sessions/${payload.session.id}/glows`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entries }),
          });
          if (!res.ok) throw new Error("glows failed");
        }
      }
      // 2. Consume every decided capture (promote/keep/discard all consume).
      const decided = captures.filter((c) => decisions[c.clientId]).map((c) => c.clientId);
      if (decided.length > 0) onConsume(decided);
      // 3. Complete + reflection.
      const ok = await onFinish({
        whatWorkedWell: worked.trim() || undefined,
        whatToImprove: improve.trim() || undefined,
      });
      if (!ok) {
        toast.error("No connection — everything's saved here. Try Finish again when you have signal.");
        return;
      }
      setFinished(true);
    } catch {
      toast.error("Couldn't finish just now — nothing was lost. Try again.");
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Wrap up</h1>
      <p className="text-sm text-muted-foreground">Step {step + 1} of 3</p>

      {step === 0 && (
        <section data-testid="wrapup-step-attendance">
          <h2 className="mb-2 font-medium">Who was here?</h2>
          <ul className="space-y-2">
            {payload.roster.map((r) => {
              const status = statusFor(r.rosterId);
              return (
                <li key={r.rosterId}>
                  <button
                    onClick={() =>
                      onAttendance(r.rosterId, status === "present" ? "absent" : "present")
                    }
                    className={`flex min-h-12 w-full items-center justify-between rounded-lg border px-4 ${
                      status === "present" ? "" : "bg-muted opacity-60"
                    }`}
                  >
                    <span>
                      {r.firstName} {r.lastName}
                    </span>
                    <span className="text-sm">{status}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {step === 1 && (
        <section data-testid="wrapup-step-glows">
          <h2 className="mb-2 font-medium">Your captures ({captures.length})</h2>
          {captures.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing captured — you can still share glows from the{" "}
              <a className="underline" href={`/coach/practices/${payload.session.id}/glows`}>
                glows page
              </a>{" "}
              after finishing.
            </p>
          )}
          <ul className="space-y-3">
            {captures.map((c) => {
              const player = rosterByRosterId.get(c.rosterId);
              const decision = decisions[c.clientId];
              return (
                <li key={c.clientId} className="rounded-lg border p-3">
                  <p className="font-medium">{player?.firstName ?? "Player"}</p>
                  <p className="text-sm">{c.note ?? c.kind}</p>
                  <div className="mt-2 flex gap-2">
                    {(
                      [
                        ["promote", "Share with family"],
                        ["keep", "Keep private"],
                        ["discard", "Discard"],
                      ] as const
                    ).map(([d, label]) => (
                      <button
                        key={d}
                        data-testid={`capture-${d}-${c.clientId}`}
                        onClick={() => setDecisions((prev) => ({ ...prev, [c.clientId]: d }))}
                        className={`min-h-11 rounded-full border px-3 text-sm ${
                          decision === d ? "bg-primary text-primary-foreground" : ""
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {step === 2 && (
        <section data-testid="wrapup-step-reflection" className="space-y-4">
          <div>
            <label className="mb-1 block font-medium" htmlFor="worked">
              What worked well? <span className="text-sm text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="worked"
              value={worked}
              onChange={(e) => setWorked(e.target.value)}
              rows={3}
              className="w-full rounded-lg border p-3"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium" htmlFor="improve">
              Anything to tweak next time?{" "}
              <span className="text-sm text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="improve"
              value={improve}
              onChange={(e) => setImprove(e.target.value)}
              rows={3}
              className="w-full rounded-lg border p-3"
            />
          </div>
        </section>
      )}

      {step < 2 ? (
        <button
          data-testid="wrapup-next"
          onClick={() => setStep((s) => s + 1)}
          className="min-h-14 w-full rounded-xl bg-primary font-semibold text-primary-foreground"
        >
          Next
        </button>
      ) : (
        <button
          data-testid="finish-session"
          disabled={finishing}
          onClick={finish}
          className="min-h-14 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
        >
          {finishing ? "Finishing…" : "Finish"}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + manual verify**

Run: `npx tsc --noEmit` — 0 errors. Manually walk setup → field → capture → end → wrap-up: promote a capture → finish → confirm a `coach_notes` glow row with `sessionPlanId` set, the capture's `consumedAt` stamped, and the session `completed`. Reload `/live` → read-only done state.

- [ ] **Step 3: Commit**

```bash
git add src/components/coach/live/wrap-up.tsx
git commit -m "feat(coach): wrap-up stepper — attendance, capture triage, reflection, finish"
```

---

### Task 10: Entry points on session detail + practices list

**Files:**
- Modify: `src/components/coach/session-detail.tsx`
- Modify: `src/components/coach/practices-overview.tsx`

**Interfaces:**
- Consumes: each component's existing session objects (both already carry `id` and `status`).
- Produces: a state-aware link-button to `/coach/practices/${id}/live` — label by status: `draft`/`planned` → "Set up session", `in_progress` → "Resume session", `completed` → nothing (detail page keeps its existing reflection view), `cancelled` → nothing. On the practices list, render it on today's/upcoming session cards where status is `planned` or `in_progress`.

- [ ] **Step 1: Add the button to both components**

Shared snippet (inline in each file — two call sites is below the extraction threshold; keep the markup identical):

```tsx
{(session.status === "planned" || session.status === "draft" || session.status === "in_progress") && (
  <a
    data-testid="live-session-link"
    href={`/coach/practices/${session.id}/live`}
    className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground"
  >
    {session.status === "in_progress" ? "Resume session" : "Set up session"}
  </a>
)}
```

Place it: in `session-detail.tsx` in the header action area (near the existing status controls); in `practices-overview.tsx` on each session card's action row. Match each file's existing markup idioms exactly (read the surrounding code first; these are the files' conventions, not this plan's).

- [ ] **Step 2: Typecheck + manual verify**

`npx tsc --noEmit` — 0 errors. Practices list shows "Set up session" on a planned session; after starting, it shows "Resume session".

- [ ] **Step 3: Commit**

```bash
git add src/components/coach/session-detail.tsx src/components/coach/practices-overview.tsx
git commit -m "feat(coach): state-aware live-session entry points"
```

---

### Task 11: E2E + full local gate

**Files:**
- Create: `tests/e2e/coach-session-lifecycle.spec.ts`

**Interfaces:**
- Consumes: every test id declared in Tasks 7–9; `signIn`/`waitForHydration` from `tests/utils/test-helpers`; coach account `coach@test.aspiresports.com` / `TestCoach123!`.

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../utils/test-helpers";

// Full coach journey: setup -> field -> capture -> wrap-up -> completed.
// Director-side delivery status is covered by the existing
// tests/api/admin/blueprint-delivery suite (completion is the only input
// this feature adds to it), so this spec stays coach-scoped.
test("coach runs a session end to end", async ({ page }) => {
  await signIn(page, "coach@test.aspiresports.com", "TestCoach123!");

  // Create tonight's session through the API with the page's cookies.
  const players = await page.request.get("/api/coach/players");
  const teamId = (await players.json()).players[0].team.id;
  const created = await page.request.post("/api/coach/sessions", {
    data: {
      teamId,
      title: "E2E lifecycle session",
      scheduledDate: new Date().toISOString(),
      durationMinutes: 45,
      status: "planned",
      segments: [
        { order: 0, name: "Warmup", type: "warmup", durationMinutes: 10 },
        { order: 1, name: "Small games", type: "game", durationMinutes: 35 },
      ],
    },
  });
  const sessionId = (await created.json()).session.id;

  // Setup.
  await page.goto(`/coach/practices/${sessionId}/live`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await expect(page.getByTestId("setup-segments")).toContainText("Warmup");
  await page.getByTestId("start-session").click();

  // Field mode: attendance sheet first.
  await expect(page.getByTestId("attendance-sheet")).toBeVisible();
  await page.getByTestId("attendance-done").click();
  await expect(page.getByTestId("current-segment")).toContainText("Warmup");
  await page.getByTestId("advance-segment").click();
  await expect(page.getByTestId("current-segment")).toContainText("Small games");

  // Quick capture on the first player.
  await page.locator('[data-testid^="player-chip-"]').first().click();
  await page.getByTestId("capture-glow").first().click();

  // End -> wrap-up.
  await page.getByTestId("end-session").click();
  await expect(page.getByTestId("wrapup-step-attendance")).toBeVisible();
  await page.getByTestId("wrapup-next").click();
  await expect(page.getByTestId("wrapup-step-glows")).toBeVisible();
  await page.locator('[data-testid^="capture-promote-"]').first().click();
  await page.getByTestId("wrapup-next").click();
  await page.getByTestId("finish-session").click();
  await expect(page.getByTestId("wrapup-done")).toBeVisible();

  // Reload lands in read-only done state.
  await page.goto(`/coach/practices/${sessionId}/live`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await expect(page.getByTestId("wrapup-done")).toBeVisible();
});
```

- [ ] **Step 2: Run the spec until stable**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- coach-session-lifecycle`
Expected: PASS. Repeat until **3 consecutive green runs** (this spec only gates post-merge via test-full — local greens are the gate).

- [ ] **Step 3: Full pre-push gate**

```bash
npm run db:seed:e2e
CRON_SECRET=localdev TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npm run test:api
PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test
./scripts/with-bws.sh npm run build
npx tsc --noEmit
```

Expected: all green / 0 errors. (Vitest unit project runs as part of `test:api`'s config or separately: `npx vitest run --config vitest.config.ts --project unit`.)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/coach-session-lifecycle.spec.ts
git commit -m "test(e2e): coach session lifecycle — setup, field, capture, wrap-up"
```

---

## Plan self-review notes (resolved inline)

- Spec coverage: setup (T7), field mode incl. prompts/capture/attendance (T8), wrap-up incl. promotion + consumption + reflection (T9), schema (T1), live payload (T5), flush endpoint (T6), transitions (T4), resilience libs (T2–T3), entry points (T10), tests (T4–T6, T11). Spec's e2e mentions asserting the director delivery strip — delegated to the existing `blueprint-delivery` API suite since completion status is this feature's only input to it; noted in the spec deviation comment in the e2e file.
- Type consistency: `CaptureInput`/`FlushEnvelope`/`LivePayload` defined once in Task 2/3 and imported everywhere; endpoint request/response shapes in Tasks 5–6 match them.
- Known verify-at-implementation points (flagged in tasks): exact layout wrapper in `live.astro` (copy sibling page), `attendance.recordedByUserId` column name, `sequenceAttachments.distributedBy` column name (used by the existing session GET — copy from there).
