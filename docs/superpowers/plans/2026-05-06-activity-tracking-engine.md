# Activity Tracking Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the runtime that turns the static activity catalog into a live operating system — per-game completion records, computed expected-completion timestamps, reminder + handoff dispatch, artifact submission UIs, and an overdue dashboard.

**Architecture:** New `src/lib/activity-tracking/` module containing pure functions (DSL parser, tag derivation, stage computation, handoff, dispatch) plus thin API endpoints and React components. Catalog tooling moves from `scripts/` to `src/lib/ops-catalog/` so it's runtime-accessible. Bootstrap fires on game INSERT; a Netlify Scheduled Function ticks every 5 minutes. The existing messaging gateway handles email/Telegram/SMS dispatch.

**Tech Stack:** TypeScript, Drizzle ORM, Astro 5, React 19, Vitest, Netlify Scheduled Functions, existing Resend/Twilio/Telegram integrations.

**Reference:** Spec at `docs/superpowers/specs/2026-05-06-activity-tracking-engine-design.md`. This plan implements all sections of that spec.

**Worktree note:** This plan has 35 tasks. Continue working on the existing `worktree-feat+ops-catalog-impl` worktree (catalog work is already there as foundation; tracking engine builds on top).

---

## File structure (the whole picture)

### Schema + migration
- Modify `src/lib/db/schema/teams.ts` — add `owned`, `concessions`, `parking_managed` to venues
- Create `src/lib/db/schema/activity-tracking.ts` — `activityCompletions`, `checklistSubmissions`, `formSubmissions`, `signatureSubmissions`, `venueRoleAssignments`
- Generated `src/lib/db/migrations/NNNN_activity_tracking.sql`

### Catalog runtime move
- Move `scripts/ops-catalog/{loader,validator,types,views}` → `src/lib/ops-catalog/{loader,validator,types,views}`
- Replace `scripts/ops-catalog/index.ts` with a thin shim that imports from `src/lib/ops-catalog/`
- Update import paths in `tests/unit/ops-catalog/`

### Tracking engine module
- `src/lib/activity-tracking/index.ts` — public exports
- `src/lib/activity-tracking/dsl.ts` — `computeExpectedAt(dsl, game)`
- `src/lib/activity-tracking/derive-tag-context.ts`
- `src/lib/activity-tracking/filter.ts` — `filterActivitiesByContext` (shared with ops-catalog views)
- `src/lib/activity-tracking/catalog-cache.ts` — `getCatalog()` with in-process cache
- `src/lib/activity-tracking/bootstrap.ts`
- `src/lib/activity-tracking/lifecycle.ts` — reschedule + cancel
- `src/lib/activity-tracking/stage.ts`
- `src/lib/activity-tracking/handoff.ts`
- `src/lib/activity-tracking/dispatch.ts`
- `src/lib/activity-tracking/resolve-recipients.ts`
- `src/lib/activity-tracking/tick.ts`
- `src/lib/activity-tracking/counter-autocomplete.ts`
- `src/lib/activity-tracking/mark-complete.ts`
- `src/lib/activity-tracking/messages/{pre-reminder,overdue-alert,escalation,final-escalation}.ts`
- `src/lib/activity-tracking/messages/types.ts`

### Scheduler + endpoints
- `netlify/functions/scheduled-activity-tracker-tick.ts`
- `src/pages/api/cron/tick-activity-tracker.ts`
- `src/pages/api/admin/activity-completions/[id]/submit.ts`
- `src/pages/api/admin/activity-completions/[id]/cancel.ts`
- `src/pages/api/admin/activity-completions/[id]/reassign.ts`
- `src/pages/api/admin/venues/[id]/role-assignments.ts`

### Existing wiring
- `src/pages/api/admin/games/index.ts` — wrap POST with bootstrap
- `src/pages/api/admin/games/[id].ts` — wrap PUT (reschedule) and status changes (cancel/postpone)
- `src/lib/messaging/broadcast.ts` (cancellation broadcast path) — call `markCompleteBySystemEvent` after broadcast

### Admin UIs
- `src/pages/admin/game-day/today.astro`
- `src/components/admin/game-day/activity-tracking-dashboard.tsx`
- `src/pages/admin/activity-completions/[id].astro`
- `src/components/admin/activity-completions/page.tsx` — branching renderer
- `src/components/admin/activity-completions/{checklist,form,signature,photo-upload}-renderer.tsx`
- `src/components/admin/activity-completions/{counter,system-event,external-ack}-readback.tsx`
- `src/pages/admin/venues/[id]/staff.astro`
- `src/components/admin/venues/role-assignments-list.tsx`

### Tests
- `tests/unit/activity-tracking/{dsl,derive-tag-context,stage,handoff,filter,channel-select}.test.ts`
- `tests/unit/activity-tracking/messages/*.test.ts`
- `tests/api/activity-tracking/{bootstrap,reschedule,cancel,tick,submit-checklist,submit-form,submit-signature,counter-autocomplete}.test.ts`
- `tests/utils/activity-tracking-helpers.ts`

---

## Phase A: Foundation (5 tasks)

### Task 1: Move `ops-catalog` from `scripts/` to `src/lib/`

The catalog tooling needs to be runtime-accessible (the tracking engine reads activity definitions live). Move the existing files; keep the CLI as a thin shim.

**Files:**
- Move (git mv): `scripts/ops-catalog/{loader.ts,validator.ts}` → `src/lib/ops-catalog/`
- Move: `scripts/ops-catalog/types/` → `src/lib/ops-catalog/types/`
- Move: `scripts/ops-catalog/views/` → `src/lib/ops-catalog/views/`
- Modify: `scripts/ops-catalog/index.ts` — replace with thin shim
- Modify: import paths in `tests/unit/ops-catalog/**/*.ts`

- [ ] **Step 1: Move source files preserving git history**

```bash
cd /Users/mahadibrahim/Documents/Coding/aspire-sports/.claude/worktrees/feat+ops-catalog-impl
mkdir -p src/lib/ops-catalog
git mv scripts/ops-catalog/loader.ts src/lib/ops-catalog/loader.ts
git mv scripts/ops-catalog/validator.ts src/lib/ops-catalog/validator.ts
git mv scripts/ops-catalog/types src/lib/ops-catalog/types
git mv scripts/ops-catalog/views src/lib/ops-catalog/views
```

- [ ] **Step 2: Update internal imports inside moved files**

Inside `src/lib/ops-catalog/loader.ts`, `validator.ts`, `views/*.ts`, and `types/*.ts`, all relative imports between these files (`./types/activity`, `../loader`, etc.) keep working as-is since the relative structure is preserved. No change needed unless any import uses `..` to escape the moved dir. Grep:

```bash
grep -rE "import .* from ['\"]\.\./\.\./" src/lib/ops-catalog/
```

If any matches, fix them. (The CLI's old `process.cwd()`-based path lookups stay in the shim, not in the moved files.)

- [ ] **Step 3: Replace `scripts/ops-catalog/index.ts` with shim**

```typescript
#!/usr/bin/env tsx
// Thin CLI shim — all runtime logic now lives in src/lib/ops-catalog/.
// This file is invoked via `npm run catalog:validate` and `npm run catalog:render`.

import path from "node:path";
import { promises as fs } from "node:fs";
import { loadCatalog } from "../../src/lib/ops-catalog/loader";
import { validateCatalog } from "../../src/lib/ops-catalog/validator";
import { generateAllRoleManuals } from "../../src/lib/ops-catalog/views/role-manual";
import { generateAutomationBacklog } from "../../src/lib/ops-catalog/views/automation-backlog";
import { renderRunbook } from "../../src/lib/ops-catalog/views/runbook";
import { renderRaciMatrix } from "../../src/lib/ops-catalog/views/raci-matrix";
import { renderSportAddendum } from "../../src/lib/ops-catalog/views/sport-addendum";

const CATALOG_DIR = path.join(process.cwd(), "docs/operations/catalog");
const ARTIFACTS_DIR = path.join(process.cwd(), "docs/operations/artifacts");

const command = process.argv[2];

const commands: Record<string, () => Promise<number>> = {
  validate: async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const result = validateCatalog(catalog);
    for (const w of result.warnings) console.warn(`[warn] ${w.source}: ${w.message}`);
    for (const e of result.errors) console.error(`[error] ${e.source}: ${e.message}`);
    if (result.errors.length > 0) {
      console.error(`Validation failed: ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
      return 1;
    }
    console.log(`Validation passed: ${result.warnings.length} warning(s)`);
    return 0;
  },
  render: async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const v = validateCatalog(catalog);
    if (v.errors.length > 0) {
      for (const e of v.errors) console.error(`[error] ${e.source}: ${e.message}`);
      return 1;
    }
    const args = process.argv.slice(3);
    const viewIdx = args.findIndex(a => a === "--view");
    const view = viewIdx >= 0 ? args[viewIdx + 1] : null;

    if (!view) {
      const manuals = generateAllRoleManuals(catalog);
      await fs.mkdir(path.join(ARTIFACTS_DIR, "manuals"), { recursive: true });
      for (const [roleId, md] of Object.entries(manuals)) {
        await fs.writeFile(path.join(ARTIFACTS_DIR, "manuals", `${roleId}.md`), md);
      }
      const backlog = generateAutomationBacklog(catalog);
      await fs.writeFile(path.join(ARTIFACTS_DIR, "automation-backlog.json"), JSON.stringify(backlog, null, 2) + "\n");
      console.log(`Rendered ${Object.keys(manuals).length} role manuals + automation-backlog.json`);
      return 0;
    }

    if (view === "raci-matrix") {
      const csv = renderRaciMatrix(catalog);
      await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
      await fs.writeFile(path.join(ARTIFACTS_DIR, "raci-matrix.csv"), csv);
      console.log("Wrote raci-matrix.csv");
      return 0;
    }
    if (view === "sport-addendum") {
      const sportIdx = args.findIndex(a => a === "--sport");
      const sport = sportIdx >= 0 ? args[sportIdx + 1] : null;
      if (!sport) { console.error("--sport required"); return 1; }
      const md = renderSportAddendum(catalog, sport);
      const out = path.join(ARTIFACTS_DIR, "addendums", `${sport.replace(":", "_")}.md`);
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, md);
      console.log(`Wrote addendum for ${sport}`);
      return 0;
    }
    if (view === "runbook") {
      const venueIdx = args.findIndex(a => a === "--venue");
      const dateIdx = args.findIndex(a => a === "--date");
      const venue = venueIdx >= 0 ? args[venueIdx + 1] : "default";
      const date = dateIdx >= 0 ? args[dateIdx + 1] : new Date().toISOString().slice(0, 10);
      const md = renderRunbook(catalog, {
        venue_id: venue, event_date: date,
        sport_tags: [], venue_tags: [], format_tags: [], audience_tags: [],
      });
      const out = path.join(ARTIFACTS_DIR, "runbooks", venue, `${date}.md`);
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, md);
      console.log(`Wrote runbook ${venue}/${date}`);
      return 0;
    }
    console.error(`Unknown view: ${view}`);
    return 1;
  },
};

async function main() {
  if (!command || !commands[command]) {
    console.error(`Usage: ops-catalog <validate|render> [options]`);
    process.exit(1);
  }
  const code = await commands[command]();
  process.exit(code);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 4: Update test imports**

```bash
# Update import paths in all test files
find tests/unit/ops-catalog -name "*.ts" -exec sed -i '' 's|../../scripts/ops-catalog|../../src/lib/ops-catalog|g; s|../../../scripts/ops-catalog|../../../src/lib/ops-catalog|g' {} \;
```

Then verify each test file's imports look right with a grep:

```bash
grep -r "from.*ops-catalog" tests/unit/ops-catalog/
```

Should reference `src/lib/ops-catalog/...` paths only.

- [ ] **Step 5: Run tests + validator**

```bash
npx vitest run tests/unit/ops-catalog/
npm run catalog:validate
npm run catalog:render
```

Expected: 42/42 tests pass; validator clean; render produces same artifacts (no diff).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(ops-catalog): move from scripts/ to src/lib/ for runtime access"
```

---

### Task 2: Drizzle schema for activity tracking

**Files:**
- Modify: `src/lib/db/schema/teams.ts` — add 3 columns to `venues` table
- Create: `src/lib/db/schema/activity-tracking.ts` — 5 new tables
- Modify: `src/lib/db/schema/index.ts` (or wherever the schemas are aggregated) — export new tables

- [ ] **Step 1: Add venue columns**

Find the existing `venues` table definition in `src/lib/db/schema/teams.ts`. After the existing `indoor` boolean, add:

```typescript
owned: boolean("owned").notNull().default(false),
concessions: boolean("concessions").notNull().default(false),
parkingManaged: boolean("parking_managed").notNull().default(false),
```

- [ ] **Step 2: Create the activity tracking schema file**

```typescript
// src/lib/db/schema/activity-tracking.ts
import { pgTable, pgEnum, uuid, text, timestamp, jsonb, varchar, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { games, venues } from "./teams";
import { users } from "./users";
import { media } from "./media";  // NB: confirm filename for media schema

export const activityCompletionStatusEnum = pgEnum("activity_completion_status", [
  "pending",
  "in_progress",
  "overdue",
  "completed",
  "canceled",
  "skipped_by_handoff",
]);

export const activityCompletions = pgTable(
  "activity_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    activityId: text("activity_id").notNull(),                                  // 'act.<id>' catalog ref
    expectedAt: timestamp("expected_at", { withTimezone: true }).notNull(),
    status: activityCompletionStatusEnum("status").notNull().default("pending"),
    currentResponsibleRole: text("current_responsible_role").notNull(),
    responsibleHistory: jsonb("responsible_history").notNull().default([]),     // [{role, assigned_at, reason}]
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByUserId: uuid("completed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    checklistSubmissionId: uuid("checklist_submission_id"),
    formSubmissionId: uuid("form_submission_id"),
    signatureSubmissionId: uuid("signature_submission_id"),
    photoId: uuid("photo_id").references(() => media.id, { onDelete: "set null" }),
    remindersFired: jsonb("reminders_fired").notNull().default([]),             // [{stage, fired_at, channel, recipient_user_id, delivery_status, error?}]
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    gameActivityUnique: uniqueIndex("activity_completions_game_activity_unique").on(table.gameId, table.activityId),
    dueIdx: index("activity_completions_due_idx").on(table.organizationId, table.expectedAt),
    gameIdx: index("activity_completions_game_idx").on(table.gameId),
  })
);

export const checklistSubmissions = pgTable("checklist_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  completionId: uuid("completion_id").notNull().references(() => activityCompletions.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  submittedByUserId: uuid("submitted_by_user_id").notNull().references(() => users.id),
  items: jsonb("items").notNull(),
});

export const formSubmissions = pgTable("form_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  completionId: uuid("completion_id").notNull().references(() => activityCompletions.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  submittedByUserId: uuid("submitted_by_user_id").notNull().references(() => users.id),
  fields: jsonb("fields").notNull(),
});

export const signatureSubmissions = pgTable("signature_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  completionId: uuid("completion_id").notNull().references(() => activityCompletions.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  signedByUserId: uuid("signed_by_user_id").notNull().references(() => users.id),
  typedName: text("typed_name").notNull(),
  signedRole: text("signed_role").notNull(),
});

export const venueRoleAssignments = pgTable(
  "venue_role_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "cascade" }),
    roleId: text("role_id").notNull(),                                          // 'role.<id>'
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),             // null = active
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    activeUnique: uniqueIndex("venue_role_active_idx")
      .on(table.venueId, table.roleId, table.userId)
      .where(sql`effective_to IS NULL`),
    lookupIdx: index("venue_role_lookup_idx").on(table.venueId, table.roleId, table.effectiveFrom, table.effectiveTo),
  })
);

// Relations
export const activityCompletionsRelations = relations(activityCompletions, ({ one }) => ({
  game: one(games, { fields: [activityCompletions.gameId], references: [games.id] }),
  organization: one(organizations, { fields: [activityCompletions.organizationId], references: [organizations.id] }),
  completedByUser: one(users, { fields: [activityCompletions.completedByUserId], references: [users.id] }),
}));
```

(Note: import `sql` from `drizzle-orm` for the partial unique index. Also confirm the path for the `media` schema file — adjust import accordingly.)

- [ ] **Step 3: Generate migration**

```bash
npm run db:generate
```

Review the generated SQL in `src/lib/db/migrations/NNNN_*.sql`. Confirm:
- All 5 new tables created
- 3 new columns on `venues`
- New enum type `activity_completion_status`
- Indexes including the partial unique on `venue_role_assignments`

If the partial unique index isn't generated correctly (Drizzle sometimes lags on `WHERE` clauses in unique indexes), add it manually to the SQL file:

```sql
CREATE UNIQUE INDEX venue_role_active_idx
  ON venue_role_assignments (venue_id, role_id, user_id)
  WHERE effective_to IS NULL;
```

- [ ] **Step 4: Push to staging DB and verify**

```bash
npm run db:push
```

Then verify the schema is good by hitting `npm run db:studio` and inspecting the new tables.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema/teams.ts src/lib/db/schema/activity-tracking.ts src/lib/db/migrations/
git commit -m "feat(activity-tracking): schema for completions, submissions, venue role assignments"
```

---

### Task 3: DSL parser (`computeExpectedAt`)

**Files:**
- Create: `src/lib/activity-tracking/dsl.ts`
- Test: `tests/unit/activity-tracking/dsl.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/activity-tracking/dsl.test.ts
import { describe, it, expect } from "vitest";
import { computeExpectedAt } from "../../../src/lib/activity-tracking/dsl";

const game = {
  scheduledAt: new Date("2026-06-03T18:00:00Z"),  // Wed Jun 3 6pm UTC kickoff
  durationMin: null as number | null,
};
const orgTz = "America/New_York";

describe("computeExpectedAt", () => {
  it("parses T-90min as 90 minutes before scheduledAt", () => {
    expect(computeExpectedAt("T-90min", game, orgTz)).toEqual(new Date("2026-06-03T16:30:00Z"));
  });
  it("parses T+5min as 5 minutes after scheduledAt", () => {
    expect(computeExpectedAt("T+5min", game, orgTz)).toEqual(new Date("2026-06-03T18:05:00Z"));
  });
  it("parses T-72h as 72 hours before scheduledAt", () => {
    expect(computeExpectedAt("T-72h", game, orgTz)).toEqual(new Date("2026-05-31T18:00:00Z"));
  });
  it("parses T+24h as 24 hours after scheduledAt", () => {
    expect(computeExpectedAt("T+24h", game, orgTz)).toEqual(new Date("2026-06-04T18:00:00Z"));
  });
  it("parses HH:MM as that day's local time in org tz", () => {
    // 21:00 in America/New_York on 2026-06-03 = 01:00 UTC on 2026-06-04 (EDT, UTC-4)
    expect(computeExpectedAt("21:00", game, orgTz)).toEqual(new Date("2026-06-04T01:00:00Z"));
  });
  it("parses phase_end heuristics", () => {
    // pre_game phase_end = T-0 (kickoff)
    expect(computeExpectedAt("phase_end", game, orgTz, "pre_game")).toEqual(game.scheduledAt);
    // post_game phase_end = T+30min
    expect(computeExpectedAt("phase_end", game, orgTz, "post_game")).toEqual(new Date("2026-06-03T18:30:00Z"));
    // post_day phase_end = T+72h
    expect(computeExpectedAt("phase_end", game, orgTz, "post_day")).toEqual(new Date("2026-06-06T18:00:00Z"));
  });
  it("returns null for trigger+Nmin (deferred bootstrap)", () => {
    expect(computeExpectedAt("trigger+5min", game, orgTz)).toBeNull();
  });
  it("throws for unparseable DSL", () => {
    expect(() => computeExpectedAt("not-a-real-form", game, orgTz)).toThrow();
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
npx vitest run tests/unit/activity-tracking/dsl.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/activity-tracking/dsl.ts
const PHASE_END_OFFSETS: Record<string, { kind: "minutes" | "hours" | "kickoff"; offset?: number }> = {
  pre_day:     { kind: "hours", offset: -2 },
  day_setup:   { kind: "hours", offset: -2 },
  pre_game:    { kind: "kickoff" },
  in_game:     { kind: "minutes", offset: 90 },
  post_game:   { kind: "minutes", offset: 30 },
  end_of_day:  { kind: "hours", offset: 8 },
  post_day:    { kind: "hours", offset: 72 },
};

const PHASE_START_OFFSETS: Record<string, { kind: "minutes" | "hours" | "kickoff"; offset?: number }> = {
  pre_day:     { kind: "hours", offset: -12 },
  day_setup:   { kind: "hours", offset: -12 },
  pre_game:    { kind: "hours", offset: -2 },
  in_game:     { kind: "kickoff" },
  post_game:   { kind: "kickoff" },
  end_of_day:  { kind: "kickoff" },
  post_day:    { kind: "hours", offset: 24 },
};

export function computeExpectedAt(
  dsl: string,
  game: { scheduledAt: Date; durationMin?: number | null },
  orgTimezone: string,
  phase?: string
): Date | null {
  // T±Nmin / T±Nh
  const tMatch = dsl.match(/^T([+-])(\d+)(min|h)$/);
  if (tMatch) {
    const sign = tMatch[1] === "+" ? 1 : -1;
    const n = parseInt(tMatch[2], 10);
    const unit = tMatch[3];
    const ms = unit === "min" ? n * 60 * 1000 : n * 60 * 60 * 1000;
    return new Date(game.scheduledAt.getTime() + sign * ms);
  }

  // trigger+Nmin → deferred to runtime
  if (dsl.startsWith("trigger")) return null;

  // phase_start / phase_end
  if (dsl === "phase_start" || dsl === "phase_end") {
    if (!phase) throw new Error(`computeExpectedAt: phase required for ${dsl}`);
    const offsets = dsl === "phase_end" ? PHASE_END_OFFSETS : PHASE_START_OFFSETS;
    const cfg = offsets[phase];
    if (!cfg) throw new Error(`computeExpectedAt: unknown phase ${phase}`);
    if (cfg.kind === "kickoff") return new Date(game.scheduledAt.getTime());
    const ms = cfg.kind === "minutes"
      ? (cfg.offset ?? 0) * 60 * 1000
      : (cfg.offset ?? 0) * 60 * 60 * 1000;
    return new Date(game.scheduledAt.getTime() + ms);
  }

  // HH:MM (absolute time-of-day in org timezone)
  const hmMatch = dsl.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) {
    const hh = parseInt(hmMatch[1], 10);
    const mm = parseInt(hmMatch[2], 10);
    return computeAbsoluteTimeInTz(game.scheduledAt, hh, mm, orgTimezone);
  }

  throw new Error(`computeExpectedAt: unparseable DSL '${dsl}'`);
}

function computeAbsoluteTimeInTz(referenceDate: Date, hh: number, mm: number, tz: string): Date {
  // Get the calendar date in the target timezone, then construct HH:MM in that tz.
  // Uses Intl.DateTimeFormat to extract the y/m/d in tz, then converts back to UTC.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = fmt.formatToParts(referenceDate).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const localISO = `${parts.year}-${parts.month}-${parts.day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
  // Convert local ISO in tz back to UTC by checking the offset at that wall time
  const asUTC = new Date(localISO + "Z");
  const tzOffsetMs = computeTzOffsetMs(asUTC, tz);
  return new Date(asUTC.getTime() - tzOffsetMs);
}

function computeTzOffsetMs(at: Date, tz: string): number {
  // Returns the offset in ms such that: utcDate = localDate - offset
  const localFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = localFmt.formatToParts(at).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const localTimestamp = Date.UTC(
    parseInt(parts.year, 10),
    parseInt(parts.month, 10) - 1,
    parseInt(parts.day, 10),
    parseInt(parts.hour, 10),
    parseInt(parts.minute, 10),
    parseInt(parts.second, 10)
  );
  return localTimestamp - at.getTime();
}
```

- [ ] **Step 4: Verify pass**

```bash
npx vitest run tests/unit/activity-tracking/dsl.test.ts
```
Expected: 8/8 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/activity-tracking/dsl.ts tests/unit/activity-tracking/dsl.test.ts
git commit -m "feat(activity-tracking): expected_completion DSL parser"
```

---

### Task 4: Tag context derivation + filter

**Files:**
- Create: `src/lib/activity-tracking/derive-tag-context.ts`
- Create: `src/lib/activity-tracking/filter.ts`
- Test: `tests/unit/activity-tracking/derive-tag-context.test.ts`
- Test: `tests/unit/activity-tracking/filter.test.ts`

- [ ] **Step 1: Write failing tests for derive**

```typescript
// tests/unit/activity-tracking/derive-tag-context.test.ts
import { describe, it, expect } from "vitest";
import { deriveTagContext } from "../../../src/lib/activity-tracking/derive-tag-context";

const baseInput = {
  venue: { indoor: false, owned: true, concessions: false, parkingManaged: false },
  program: { programType: "league", audienceType: "parents", sport: { slug: "soccer" } },
};

describe("deriveTagContext", () => {
  it("composes outdoor:soccer for outdoor venue + soccer program", () => {
    expect(deriveTagContext(baseInput).sport_tags).toEqual(["outdoor:soccer"]);
  });
  it("composes indoor:soccer for indoor venue", () => {
    const ctx = deriveTagContext({ ...baseInput, venue: { ...baseInput.venue, indoor: true } });
    expect(ctx.sport_tags).toEqual(["indoor:soccer"]);
  });
  it("includes outdoor + owned in venue_tags when both set", () => {
    expect(deriveTagContext(baseInput).venue_tags).toContain("outdoor");
    expect(deriveTagContext(baseInput).venue_tags).toContain("owned");
  });
  it("includes rented when owned=false", () => {
    const ctx = deriveTagContext({ ...baseInput, venue: { ...baseInput.venue, owned: false } });
    expect(ctx.venue_tags).toContain("rented");
    expect(ctx.venue_tags).not.toContain("owned");
  });
  it("includes concessions only when venue.concessions=true", () => {
    const without = deriveTagContext(baseInput).venue_tags;
    const withC = deriveTagContext({ ...baseInput, venue: { ...baseInput.venue, concessions: true } }).venue_tags;
    expect(without).not.toContain("concessions");
    expect(withC).toContain("concessions");
  });
  it("maps audienceType=parents to youth", () => {
    expect(deriveTagContext(baseInput).audience_tags).toEqual(["youth"]);
  });
  it("maps audienceType=players to adult", () => {
    const ctx = deriveTagContext({ ...baseInput, program: { ...baseInput.program, audienceType: "players" } });
    expect(ctx.audience_tags).toEqual(["adult"]);
  });
  it("uses programType for format_tags", () => {
    expect(deriveTagContext(baseInput).format_tags).toEqual(["league"]);
  });
});
```

- [ ] **Step 2: Implement derive**

```typescript
// src/lib/activity-tracking/derive-tag-context.ts
export interface TagContextInput {
  venue: {
    indoor: boolean;
    owned: boolean;
    concessions: boolean;
    parkingManaged: boolean;
  };
  program: {
    programType: string;
    audienceType: string;
    sport: { slug: string };
  };
}

export interface TagContext {
  sport_tags: string[];
  venue_tags: string[];
  format_tags: string[];
  audience_tags: ("youth" | "adult" | "mixed")[];
}

export function deriveTagContext(input: TagContextInput): TagContext {
  const indoorOutdoor = input.venue.indoor ? "indoor" : "outdoor";

  return {
    sport_tags: [`${indoorOutdoor}:${input.program.sport.slug}`],
    venue_tags: [
      indoorOutdoor,
      input.venue.owned ? "owned" : "rented",
      ...(input.venue.concessions ? ["concessions"] : []),
      ...(input.venue.parkingManaged ? ["parking_managed"] : []),
    ],
    format_tags: [input.program.programType],
    audience_tags: [input.program.audienceType === "parents" ? "youth" : "adult"],
  };
}
```

- [ ] **Step 3: Write failing tests for filter**

```typescript
// tests/unit/activity-tracking/filter.test.ts
import { describe, it, expect } from "vitest";
import { filterActivitiesByContext } from "../../../src/lib/activity-tracking/filter";

const ctx = {
  sport_tags: ["outdoor:soccer"],
  venue_tags: ["outdoor", "owned"],
  format_tags: ["league"],
  audience_tags: ["youth" as const],
};

const baseActivity = {
  id: "act.x",
  sport_tags: [],
  venue_tags: [],
  format_tags: [],
  audience_tags: [],
};

describe("filterActivitiesByContext", () => {
  it("includes activities with no tag constraints (apply to all)", () => {
    expect(filterActivitiesByContext([baseActivity], ctx)).toHaveLength(1);
  });
  it("includes activities whose sport_tag matches (OR within dim)", () => {
    const a = { ...baseActivity, sport_tags: ["outdoor:soccer", "outdoor:flag_football"] };
    expect(filterActivitiesByContext([a], ctx)).toHaveLength(1);
  });
  it("excludes activities whose sport_tag doesn't match", () => {
    const a = { ...baseActivity, sport_tags: ["indoor:basketball"] };
    expect(filterActivitiesByContext([a], ctx)).toHaveLength(0);
  });
  it("AND across dimensions: must match every populated dimension", () => {
    const a = { ...baseActivity, sport_tags: ["outdoor:soccer"], venue_tags: ["indoor"] };
    expect(filterActivitiesByContext([a], ctx)).toHaveLength(0);  // sport matches, but venue doesn't
  });
  it("includes when audience_tag matches youth", () => {
    const a = { ...baseActivity, audience_tags: ["youth"] };
    expect(filterActivitiesByContext([a], ctx)).toHaveLength(1);
  });
  it("excludes when audience_tag is adult-only", () => {
    const a = { ...baseActivity, audience_tags: ["adult"] };
    expect(filterActivitiesByContext([a], ctx)).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Implement filter**

```typescript
// src/lib/activity-tracking/filter.ts
import type { TagContext } from "./derive-tag-context";

export interface ActivityTags {
  id: string;
  sport_tags: string[];
  venue_tags: string[];
  format_tags: string[];
  audience_tags: string[];
}

function dimensionMatches(activityDim: string[], contextDim: string[]): boolean {
  if (activityDim.length === 0) return true;            // no constraint
  return activityDim.some((tag) => contextDim.includes(tag));
}

export function filterActivitiesByContext<T extends ActivityTags>(activities: T[], ctx: TagContext): T[] {
  return activities.filter(
    (a) =>
      dimensionMatches(a.sport_tags, ctx.sport_tags) &&
      dimensionMatches(a.venue_tags, ctx.venue_tags) &&
      dimensionMatches(a.format_tags, ctx.format_tags) &&
      dimensionMatches(a.audience_tags, ctx.audience_tags)
  );
}
```

- [ ] **Step 5: Run tests, verify pass, commit**

```bash
npx vitest run tests/unit/activity-tracking/{derive-tag-context,filter}.test.ts
```
Expected: 8 + 6 = 14 pass.

```bash
git add src/lib/activity-tracking/{derive-tag-context,filter}.ts tests/unit/activity-tracking/{derive-tag-context,filter}.test.ts
git commit -m "feat(activity-tracking): tag context derivation + activity filter"
```

---

### Task 5: Catalog access cache

**Files:**
- Create: `src/lib/activity-tracking/catalog-cache.ts`
- Test: `tests/unit/activity-tracking/catalog-cache.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/activity-tracking/catalog-cache.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { getCatalog, _resetCatalogCacheForTests } from "../../../src/lib/activity-tracking/catalog-cache";

describe("catalog-cache", () => {
  beforeEach(() => _resetCatalogCacheForTests());

  it("returns the catalog on first call", async () => {
    const c = await getCatalog();
    expect(c.activities.length).toBeGreaterThan(0);
    expect(c.roles.length).toBeGreaterThan(0);
  });

  it("returns the same instance on repeated calls (cached)", async () => {
    const a = await getCatalog();
    const b = await getCatalog();
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/activity-tracking/catalog-cache.ts
import path from "node:path";
import { loadCatalog, type Catalog } from "../ops-catalog/loader";

const CATALOG_DIR = path.join(process.cwd(), "docs/operations/catalog");
let _cache: Promise<Catalog> | null = null;

export async function getCatalog(): Promise<Catalog> {
  if (!_cache) _cache = loadCatalog(CATALOG_DIR);
  return _cache;
}

export async function getActivityFromCatalog(activityId: string) {
  const catalog = await getCatalog();
  return catalog.activities.find((a) => a.id === activityId) ?? null;
}

export async function getArtifactTemplate(templateId: string) {
  const catalog = await getCatalog();
  return catalog.artifacts.find((a) => a.id === templateId) ?? null;
}

export async function getRole(roleId: string) {
  const catalog = await getCatalog();
  return catalog.roles.find((r) => r.id === roleId) ?? null;
}

// For tests only — not for production code paths.
export function _resetCatalogCacheForTests() {
  _cache = null;
}
```

- [ ] **Step 3: Verify + commit**

```bash
npx vitest run tests/unit/activity-tracking/catalog-cache.test.ts
git add src/lib/activity-tracking/catalog-cache.ts tests/unit/activity-tracking/catalog-cache.test.ts
git commit -m "feat(activity-tracking): catalog access layer with in-process cache"
```

---

## Phase B: Bootstrap + lifecycle (4 tasks)

### Task 6: `bootstrapActivityCompletions`

**Files:**
- Create: `src/lib/activity-tracking/bootstrap.ts`
- Create: `tests/utils/activity-tracking-helpers.ts`
- Test: `tests/api/activity-tracking/bootstrap.test.ts`

- [ ] **Step 1: Write `tests/utils/activity-tracking-helpers.ts`**

```typescript
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema/organizations";
import { sports, ageGroups } from "@/lib/db/schema/sports";
import { programs, seasons } from "@/lib/db/schema/programs";
import { teams, games, venues } from "@/lib/db/schema/teams";

export async function createTestGameContext(opts: {
  indoor?: boolean; owned?: boolean; concessions?: boolean; parkingManaged?: boolean;
  programType?: "league" | "camp" | "clinic" | "tournament";
  audienceType?: "parents" | "players";
  sportSlug?: string;
  scheduledAt?: Date;
}) {
  const db = getDb();
  const [org] = await db.insert(organizations).values({ name: `T${Date.now()}`, slug: `t-${Date.now()}`, timezone: "America/New_York" }).returning();
  const [sport] = await db.insert(sports).values({ organizationId: org.id, name: opts.sportSlug ?? "soccer", slug: opts.sportSlug ?? "soccer" }).returning();
  const [program] = await db.insert(programs).values({
    organizationId: org.id, name: "Test Program", sportId: sport.id,
    programType: opts.programType ?? "league", audienceType: opts.audienceType ?? "parents",
  }).returning();
  const [ageGroup] = await db.insert(ageGroups).values({ organizationId: org.id, name: "U10" }).returning();
  const [season] = await db.insert(seasons).values({
    organizationId: org.id, programId: program.id, name: "Spring 2026",
    startDate: new Date(), endDate: new Date(Date.now() + 60 * 86400 * 1000), ageGroupId: ageGroup.id,
  }).returning();
  const [venue] = await db.insert(venues).values({
    organizationId: org.id, name: "Test Venue",
    indoor: opts.indoor ?? false, owned: opts.owned ?? false,
    concessions: opts.concessions ?? false, parkingManaged: opts.parkingManaged ?? false,
  }).returning();
  const [home] = await db.insert(teams).values({ organizationId: org.id, seasonId: season.id, name: "Home" }).returning();
  const [away] = await db.insert(teams).values({ organizationId: org.id, seasonId: season.id, name: "Away" }).returning();
  const [game] = await db.insert(games).values({
    organizationId: org.id, seasonId: season.id, homeTeamId: home.id, awayTeamId: away.id,
    venueId: venue.id, scheduledAt: opts.scheduledAt ?? new Date("2026-06-03T18:00:00Z"), status: "scheduled",
  }).returning();
  return { organizationId: org.id, venueId: venue.id, programId: program.id, seasonId: season.id, gameId: game.id };
}
```

(Note: confirm exact column names/required fields on each schema by reading the actual files; adjust required fields if any are missing here.)

- [ ] **Step 2: Implement `bootstrap.ts`**

```typescript
// src/lib/activity-tracking/bootstrap.ts
import { getDb } from "@/lib/db";
import { games, venues } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { sports } from "@/lib/db/schema/sports";
import { organizations } from "@/lib/db/schema/organizations";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { eq } from "drizzle-orm";
import { getCatalog } from "./catalog-cache";
import { deriveTagContext } from "./derive-tag-context";
import { filterActivitiesByContext } from "./filter";
import { computeExpectedAt } from "./dsl";

export async function bootstrapActivityCompletions(gameId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ game: games, venue: venues, season: seasons, program: programs, sport: sports, org: organizations })
    .from(games)
    .leftJoin(venues, eq(games.venueId, venues.id))
    .leftJoin(seasons, eq(games.seasonId, seasons.id))
    .leftJoin(programs, eq(seasons.programId, programs.id))
    .leftJoin(sports, eq(programs.sportId, sports.id))
    .leftJoin(organizations, eq(games.organizationId, organizations.id))
    .where(eq(games.id, gameId))
    .limit(1);

  if (!row?.game || !row.venue || !row.season || !row.program || !row.sport) {
    throw new Error(`Game ${gameId} missing required relations for bootstrap`);
  }

  const tagContext = deriveTagContext({
    venue: {
      indoor: row.venue.indoor ?? false,
      owned: row.venue.owned ?? false,
      concessions: row.venue.concessions ?? false,
      parkingManaged: row.venue.parkingManaged ?? false,
    },
    program: {
      programType: row.program.programType,
      audienceType: row.program.audienceType,
      sport: { slug: row.sport.slug },
    },
  });

  const catalog = await getCatalog();
  const matching = filterActivitiesByContext(catalog.activities, tagContext);
  const orgTz = row.org?.timezone ?? "America/New_York";

  const inserts = matching.map((activity) => {
    const expectedAt = computeExpectedAt(
      activity.expected_completion,
      { scheduledAt: row.game.scheduledAt },
      orgTz,
      activity.phase
    );
    return {
      organizationId: row.game.organizationId,
      gameId: row.game.id,
      activityId: activity.id,
      expectedAt: expectedAt ?? row.game.scheduledAt,  // trigger+ DSL gets kickoff as fallback
      status: "pending" as const,
      currentResponsibleRole: activity.raci.accountable,
      responsibleHistory: [{ role: activity.raci.accountable, assigned_at: new Date().toISOString(), reason: "bootstrap" }],
    };
  });

  if (inserts.length > 0) {
    await db.insert(activityCompletions).values(inserts).onConflictDoNothing();
  }
}
```

- [ ] **Step 3: Write integration test**

```typescript
// tests/api/activity-tracking/bootstrap.test.ts
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";

describe("bootstrapActivityCompletions", () => {
  it("creates rows matching tag context (outdoor youth soccer league)", async () => {
    const ctx = await createTestGameContext({ indoor: false, owned: true, programType: "league", audienceType: "parents", sportSlug: "soccer" });
    await bootstrapActivityCompletions(ctx.gameId);
    const rows = await getDb().select().from(activityCompletions).where(eq(activityCompletions.gameId, ctx.gameId));
    expect(rows.length).toBeGreaterThan(40);
    expect(rows.some(r => r.activityId === "act.rainout_decision")).toBe(true);
    expect(rows.some(r => r.activityId === "act.cash_concession_reconcile")).toBe(false);  // no concessions
    expect(rows.some(r => r.activityId === "act.flag_field_line_check")).toBe(false);      // wrong sport
  });

  it("includes concessions activities when venue.concessions=true", async () => {
    const ctx = await createTestGameContext({ concessions: true });
    await bootstrapActivityCompletions(ctx.gameId);
    const rows = await getDb().select().from(activityCompletions).where(eq(activityCompletions.gameId, ctx.gameId));
    expect(rows.some(r => r.activityId === "act.concession_setup")).toBe(true);
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
npm run dev &
sleep 3
TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/activity-tracking/bootstrap.test.ts
kill %1
git add src/lib/activity-tracking/bootstrap.ts tests/utils/activity-tracking-helpers.ts tests/api/activity-tracking/bootstrap.test.ts
git commit -m "feat(activity-tracking): bootstrap completions on game creation"
```

---

### Task 7: Wire bootstrap into game-creation endpoint

**Files:** Modify the existing `POST /api/admin/games` handler.

- [ ] **Step 1: Locate handler**

```bash
grep -rEn "export const POST" src/pages/api/admin/games/ | head -3
```

- [ ] **Step 2: Add post-insert bootstrap call**

After the successful INSERT and before the return, insert:

```typescript
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";

// After inserting newGame:
try {
  await bootstrapActivityCompletions(newGame.id);
} catch (err) {
  console.error("[bootstrap] failed for game", newGame.id, err);
  // Don't fail the request — admins can manually re-bootstrap if needed
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/admin/games/
git commit -m "feat(activity-tracking): wire bootstrap into game-creation endpoint"
```

---

### Task 8: `rescheduleActivityCompletions` + `cancelActivityCompletions` + wire

**Files:**
- Create: `src/lib/activity-tracking/lifecycle.ts`
- Test: `tests/api/activity-tracking/reschedule.test.ts`, `tests/api/activity-tracking/cancel.test.ts`
- Modify: `PUT /api/admin/games/[id]` endpoint

- [ ] **Step 1: Implement lifecycle**

```typescript
// src/lib/activity-tracking/lifecycle.ts
import { getDb } from "@/lib/db";
import { games } from "@/lib/db/schema/teams";
import { organizations } from "@/lib/db/schema/organizations";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { and, eq, inArray } from "drizzle-orm";
import { getCatalog } from "./catalog-cache";
import { computeExpectedAt } from "./dsl";

export async function rescheduleActivityCompletions(gameId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ game: games, org: organizations })
    .from(games)
    .leftJoin(organizations, eq(games.organizationId, organizations.id))
    .where(eq(games.id, gameId))
    .limit(1);
  if (!row?.game) throw new Error(`Game ${gameId} not found`);
  const orgTz = row.org?.timezone ?? "America/New_York";

  const catalog = await getCatalog();
  const completions = await db
    .select()
    .from(activityCompletions)
    .where(and(
      eq(activityCompletions.gameId, gameId),
      inArray(activityCompletions.status, ["pending", "in_progress", "overdue"])
    ));

  for (const c of completions) {
    const activity = catalog.activities.find((a) => a.id === c.activityId);
    if (!activity) continue;
    const newAt = computeExpectedAt(activity.expected_completion, { scheduledAt: row.game.scheduledAt }, orgTz, activity.phase);
    await db
      .update(activityCompletions)
      .set({
        expectedAt: newAt ?? row.game.scheduledAt,
        status: c.status === "overdue" ? "pending" : c.status,
        remindersFired: [],
        updatedAt: new Date(),
      })
      .where(eq(activityCompletions.id, c.id));
  }
}

export async function cancelActivityCompletions(gameId: string): Promise<void> {
  const db = getDb();
  await db
    .update(activityCompletions)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(and(
      eq(activityCompletions.gameId, gameId),
      inArray(activityCompletions.status, ["pending", "in_progress", "overdue"])
    ));
}
```

- [ ] **Step 2: Wire into game update endpoint**

In `src/pages/api/admin/games/[id].ts` (PUT handler), after successful UPDATE:

```typescript
import { rescheduleActivityCompletions, cancelActivityCompletions } from "@/lib/activity-tracking/lifecycle";

// If scheduledAt changed:
if (oldGame.scheduledAt.getTime() !== newGame.scheduledAt.getTime()) {
  await rescheduleActivityCompletions(newGame.id).catch(err => console.error("[reschedule]", err));
}

// If status flipped to cancelled or postponed:
if (newGame.status !== oldGame.status && (newGame.status === "cancelled" || newGame.status === "postponed")) {
  await cancelActivityCompletions(newGame.id).catch(err => console.error("[cancel]", err));
}
```

- [ ] **Step 3: Write tests**

```typescript
// tests/api/activity-tracking/reschedule.test.ts
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { games } from "@/lib/db/schema/teams";
import { eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { rescheduleActivityCompletions } from "@/lib/activity-tracking/lifecycle";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";

describe("rescheduleActivityCompletions", () => {
  it("recomputes expected_at when scheduledAt changes", async () => {
    const ctx = await createTestGameContext({ scheduledAt: new Date("2026-06-03T18:00:00Z") });
    await bootstrapActivityCompletions(ctx.gameId);
    const before = await getDb().select().from(activityCompletions).where(eq(activityCompletions.gameId, ctx.gameId));
    const rb = before.find(r => r.activityId === "act.rainout_decision")!;

    await getDb().update(games).set({ scheduledAt: new Date("2026-06-03T20:00:00Z") }).where(eq(games.id, ctx.gameId));
    await rescheduleActivityCompletions(ctx.gameId);

    const after = await getDb().select().from(activityCompletions).where(eq(activityCompletions.gameId, ctx.gameId));
    const ra = after.find(r => r.activityId === "act.rainout_decision")!;
    expect(ra.expectedAt.getTime() - rb.expectedAt.getTime()).toBe(2 * 60 * 60 * 1000);
  });

  it("resets overdue → pending and clears reminders_fired", async () => {
    const ctx = await createTestGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);
    await getDb().update(activityCompletions)
      .set({ status: "overdue", remindersFired: [{ stage: "overdue_alert" }] })
      .where(eq(activityCompletions.gameId, ctx.gameId));
    await rescheduleActivityCompletions(ctx.gameId);
    const rows = await getDb().select().from(activityCompletions).where(eq(activityCompletions.gameId, ctx.gameId));
    expect(rows.every(r => r.status === "pending")).toBe(true);
    expect(rows.every(r => Array.isArray(r.remindersFired) && (r.remindersFired as any[]).length === 0)).toBe(true);
  });

  it("does not touch completed rows", async () => {
    const ctx = await createTestGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);
    await getDb().update(activityCompletions).set({ status: "completed", completedAt: new Date() }).where(eq(activityCompletions.gameId, ctx.gameId));
    await rescheduleActivityCompletions(ctx.gameId);
    const rows = await getDb().select().from(activityCompletions).where(eq(activityCompletions.gameId, ctx.gameId));
    expect(rows.every(r => r.status === "completed")).toBe(true);
  });
});
```

```typescript
// tests/api/activity-tracking/cancel.test.ts
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { cancelActivityCompletions } from "@/lib/activity-tracking/lifecycle";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";

describe("cancelActivityCompletions", () => {
  it("flips pending/overdue rows to canceled, preserves completed rows", async () => {
    const ctx = await createTestGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);
    const rows = await getDb().select().from(activityCompletions).where(eq(activityCompletions.gameId, ctx.gameId));
    const target = rows[0];
    await getDb().update(activityCompletions).set({ status: "completed", completedAt: new Date() }).where(eq(activityCompletions.id, target.id));
    await cancelActivityCompletions(ctx.gameId);
    const after = await getDb().select().from(activityCompletions).where(eq(activityCompletions.gameId, ctx.gameId));
    expect(after.find(r => r.id === target.id)?.status).toBe("completed");
    expect(after.filter(r => r.id !== target.id).every(r => r.status === "canceled")).toBe(true);
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
npm run dev &
sleep 3
TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/activity-tracking/reschedule.test.ts tests/api/activity-tracking/cancel.test.ts
kill %1
git add src/lib/activity-tracking/lifecycle.ts src/pages/api/admin/games/ tests/api/activity-tracking/{reschedule,cancel}.test.ts
git commit -m "feat(activity-tracking): reschedule + cancel lifecycle"
```

---

## Phase C: Cron tick + dispatch (6 tasks)

### Task 9: Stage computation

**Files:**
- Create: `src/lib/activity-tracking/stage.ts`
- Test: `tests/unit/activity-tracking/stage.test.ts`

- [ ] **Step 1: Test**

```typescript
import { describe, it, expect } from "vitest";
import { computeStage } from "../../../src/lib/activity-tracking/stage";

const expectedAt = new Date("2026-06-03T18:00:00Z");

describe("computeStage", () => {
  it("returns null when before pre-reminder window", () => {
    expect(computeStage(new Date("2026-06-03T17:30:00Z"), expectedAt)).toBeNull();
  });
  it("returns pre_reminder 15min before expectedAt", () => {
    expect(computeStage(new Date("2026-06-03T17:50:00Z"), expectedAt)).toBe("pre_reminder");
  });
  it("returns overdue_alert 15min after expectedAt", () => {
    expect(computeStage(new Date("2026-06-03T18:20:00Z"), expectedAt)).toBe("overdue_alert");
  });
  it("returns escalation 60min after expectedAt", () => {
    expect(computeStage(new Date("2026-06-03T19:10:00Z"), expectedAt)).toBe("escalation");
  });
  it("returns final_escalation 120min after expectedAt", () => {
    expect(computeStage(new Date("2026-06-03T20:10:00Z"), expectedAt)).toBe("final_escalation");
  });
  it("respects per-activity reminder_policy override", () => {
    const policy = { pre_reminder_minutes: 60, overdue_alert_minutes: 5, escalation_minutes: 30 };
    // 30min before → pre_reminder
    expect(computeStage(new Date("2026-06-03T17:30:00Z"), expectedAt, policy)).toBe("pre_reminder");
    // 10min after → overdue_alert (since overdue_alert_minutes=5)
    expect(computeStage(new Date("2026-06-03T18:10:00Z"), expectedAt, policy)).toBe("overdue_alert");
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/activity-tracking/stage.ts
export type Stage = "pre_reminder" | "overdue_alert" | "escalation" | "final_escalation";

export interface ReminderPolicy {
  pre_reminder_minutes?: number;
  overdue_alert_minutes?: number;
  escalation_minutes?: number;
}

export function computeStage(now: Date, expectedAt: Date, policy?: ReminderPolicy): Stage | null {
  const preMin = policy?.pre_reminder_minutes ?? 15;
  const overMin = policy?.overdue_alert_minutes ?? 15;
  const escMin = policy?.escalation_minutes ?? 60;
  const finalMin = escMin + 60;

  const ms = (m: number) => m * 60 * 1000;
  const t = now.getTime();
  const e = expectedAt.getTime();

  if (t >= e + ms(finalMin)) return "final_escalation";
  if (t >= e + ms(escMin))   return "escalation";
  if (t >= e + ms(overMin))  return "overdue_alert";
  if (t >= e - ms(preMin))   return "pre_reminder";
  return null;
}

export function stageAlreadyFired(remindersFired: any[], stage: Stage): boolean {
  return remindersFired.some((r) => r.stage === stage);
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run tests/unit/activity-tracking/stage.test.ts
git add src/lib/activity-tracking/stage.ts tests/unit/activity-tracking/stage.test.ts
git commit -m "feat(activity-tracking): stage computation + already-fired check"
```

---

### Task 10: Handoff logic

**Files:**
- Create: `src/lib/activity-tracking/handoff.ts`
- Test: `tests/unit/activity-tracking/handoff.test.ts`

- [ ] **Step 1: Test**

```typescript
import { describe, it, expect } from "vitest";
import { computeHandoffTarget, parseEscalationTarget } from "../../../src/lib/activity-tracking/handoff";

const activity = {
  raci: { accountable: "role.venue_manager" },
  escalation_path: "If venue manager unreachable, escalate to role.director",
};

describe("computeHandoffTarget", () => {
  it("overdue_alert → activity.raci.accountable", () => {
    expect(computeHandoffTarget(activity, "overdue_alert")).toBe("role.venue_manager");
  });
  it("escalation → role mentioned in escalation_path", () => {
    expect(computeHandoffTarget(activity, "escalation")).toBe("role.director");
  });
  it("final_escalation → role.director", () => {
    expect(computeHandoffTarget(activity, "final_escalation")).toBe("role.director");
  });
  it("pre_reminder → null (no handoff)", () => {
    expect(computeHandoffTarget(activity, "pre_reminder")).toBeNull();
  });
});

describe("parseEscalationTarget", () => {
  it("extracts role.<id> mentioned in text", () => {
    expect(parseEscalationTarget("escalate to role.director one level up")).toBe("role.director");
  });
  it("returns null when no role.<id> present", () => {
    expect(parseEscalationTarget("escalate to the manager")).toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/activity-tracking/handoff.ts
import type { Stage } from "./stage";

export function parseEscalationTarget(text: string): string | null {
  const match = text.match(/role\.[a-z][a-z0-9_]*/);
  return match ? match[0] : null;
}

export function computeHandoffTarget(
  activity: { raci: { accountable: string }; escalation_path: string },
  stage: Stage
): string | null {
  if (stage === "pre_reminder") return null;
  if (stage === "overdue_alert") return activity.raci.accountable;
  if (stage === "escalation") return parseEscalationTarget(activity.escalation_path) ?? "role.venue_manager";
  if (stage === "final_escalation") return "role.director";
  return null;
}
```

- [ ] **Step 3: Commit**

```bash
npx vitest run tests/unit/activity-tracking/handoff.test.ts
git add src/lib/activity-tracking/handoff.ts tests/unit/activity-tracking/handoff.test.ts
git commit -m "feat(activity-tracking): handoff target computation"
```

---

### Task 11: Recipient resolution

**Files:**
- Create: `src/lib/activity-tracking/resolve-recipients.ts`
- Test: `tests/api/activity-tracking/resolve-recipients.test.ts`

- [ ] **Step 1: Test (uses real DB since it queries venue_role_assignments)**

```typescript
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { venueRoleAssignments } from "@/lib/db/schema/activity-tracking";
import { users } from "@/lib/db/schema/users";
import { resolveRecipientsForRole } from "@/lib/activity-tracking/resolve-recipients";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";

describe("resolveRecipientsForRole", () => {
  it("returns users currently assigned to (venue, role)", async () => {
    const ctx = await createTestGameContext({});
    const [u] = await getDb().insert(users).values({
      email: `vm-${Date.now()}@test.com`, role: "admin", organizationId: ctx.organizationId,
      messagingPrimaryChannel: "email",
    }).returning();
    await getDb().insert(venueRoleAssignments).values({
      organizationId: ctx.organizationId, venueId: ctx.venueId, roleId: "role.venue_manager", userId: u.id,
    });
    const recipients = await resolveRecipientsForRole(ctx.venueId, "role.venue_manager");
    expect(recipients.map(r => r.id)).toContain(u.id);
  });

  it("excludes assignments past effective_to", async () => {
    const ctx = await createTestGameContext({});
    const [u] = await getDb().insert(users).values({ email: `e-${Date.now()}@t.com`, role: "admin", organizationId: ctx.organizationId }).returning();
    await getDb().insert(venueRoleAssignments).values({
      organizationId: ctx.organizationId, venueId: ctx.venueId, roleId: "role.facilities", userId: u.id,
      effectiveFrom: new Date(Date.now() - 86400_000 * 2),
      effectiveTo: new Date(Date.now() - 86400_000),
    });
    const recipients = await resolveRecipientsForRole(ctx.venueId, "role.facilities");
    expect(recipients.map(r => r.id)).not.toContain(u.id);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/activity-tracking/resolve-recipients.ts
import { getDb } from "@/lib/db";
import { venueRoleAssignments } from "@/lib/db/schema/activity-tracking";
import { users } from "@/lib/db/schema/users";
import { and, eq, isNull, lte, or, gt } from "drizzle-orm";

export interface Recipient {
  id: string;
  email: string | null;
  phone: string | null;
  telegramChatId: string | null;
  messagingPrimaryChannel: string | null;
  messagingFallbackChannel: string | null;
}

export async function resolveRecipientsForRole(venueId: string, roleId: string, at: Date = new Date()): Promise<Recipient[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      telegramChatId: users.telegramChatId,
      messagingPrimaryChannel: users.messagingPrimaryChannel,
      messagingFallbackChannel: users.messagingFallbackChannel,
    })
    .from(venueRoleAssignments)
    .innerJoin(users, eq(venueRoleAssignments.userId, users.id))
    .where(and(
      eq(venueRoleAssignments.venueId, venueId),
      eq(venueRoleAssignments.roleId, roleId),
      lte(venueRoleAssignments.effectiveFrom, at),
      or(isNull(venueRoleAssignments.effectiveTo), gt(venueRoleAssignments.effectiveTo, at))
    ));
  return rows;
}
```

- [ ] **Step 3: Commit**

```bash
npm run dev &
sleep 3
TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/activity-tracking/resolve-recipients.test.ts
kill %1
git add src/lib/activity-tracking/resolve-recipients.ts tests/api/activity-tracking/resolve-recipients.test.ts
git commit -m "feat(activity-tracking): venue_role_assignments-backed recipient resolution"
```

---

### Task 12: Message templates (4 stages)

**Files:**
- Create: `src/lib/activity-tracking/messages/types.ts`
- Create: `src/lib/activity-tracking/messages/{pre-reminder,overdue-alert,escalation,final-escalation}.ts`
- Test: `tests/unit/activity-tracking/messages/{pre-reminder,overdue-alert,escalation,final-escalation}.test.ts`

- [ ] **Step 1: Types**

```typescript
// src/lib/activity-tracking/messages/types.ts
export interface MessageVariants {
  sms:      { body: string };
  email:    { subject: string; html: string; text: string };
  telegram: { body: string; parse_mode: "HTML" };
}

export interface RenderContext {
  activity: { id: string; name: string; description: string };
  completion: { id: string; expectedAt: Date };
  game: { id: string; scheduledAt: Date };
  venue: { id: string; name: string; timezone?: string };
  recipient: { id: string; email: string | null };
  publicAppUrl: string;
}

export function fullLink(ctx: RenderContext): string {
  return `${ctx.publicAppUrl}/admin/activity-completions/${ctx.completion.id}`;
}

export function formatTime(d: Date, tz?: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz ?? "America/New_York", dateStyle: "short", timeStyle: "short" }).format(d);
}
```

- [ ] **Step 2: Implement four templates** (following the pattern from spec §7)

```typescript
// src/lib/activity-tracking/messages/overdue-alert.ts
import { type MessageVariants, type RenderContext, fullLink, formatTime } from "./types";

export function renderOverdueAlert(ctx: RenderContext): MessageVariants {
  const minsLate = Math.round((Date.now() - ctx.completion.expectedAt.getTime()) / 60000);
  const subject = `[${ctx.venue.name}] ${ctx.activity.name} is ${minsLate}m overdue`;
  const link = fullLink(ctx);
  return {
    sms: { body: `[Aspire] ${ctx.activity.name} overdue ${minsLate}m at ${ctx.venue.name}. Open: ${link}` },
    email: {
      subject,
      html: `<h2>${subject}</h2><p>${ctx.activity.description}</p><p>Expected by: ${formatTime(ctx.completion.expectedAt, ctx.venue.timezone)}</p><p><a href="${link}">Open the activity →</a></p>`,
      text: `${subject}\n\nExpected by ${formatTime(ctx.completion.expectedAt, ctx.venue.timezone)}.\nOpen: ${link}`,
    },
    telegram: {
      body: `<b>${ctx.activity.name}</b> is ${minsLate}m overdue at ${ctx.venue.name}.\n<a href="${link}">Open the activity →</a>`,
      parse_mode: "HTML",
    },
  };
}
```

(Apply the same pattern for `pre-reminder.ts`, `escalation.ts`, `final-escalation.ts` — same shape, different copy. For `pre-reminder` the SMS says "due in 15 min", for `escalation` it says "escalating to <role>", for `final_escalation` it says "Director notified — please intervene".)

- [ ] **Step 3: Tests for each**

```typescript
// tests/unit/activity-tracking/messages/overdue-alert.test.ts
import { describe, it, expect } from "vitest";
import { renderOverdueAlert } from "../../../../src/lib/activity-tracking/messages/overdue-alert";

const ctx = {
  activity: { id: "act.x", name: "Test Activity", description: "x" },
  completion: { id: "c1", expectedAt: new Date(Date.now() - 30 * 60 * 1000) },
  game: { id: "g1", scheduledAt: new Date() },
  venue: { id: "v1", name: "Test Venue", timezone: "America/New_York" },
  recipient: { id: "u1", email: "test@t.com" },
  publicAppUrl: "https://app.example.com",
};

describe("renderOverdueAlert", () => {
  it("computes minutes-late and includes in SMS body", () => {
    const v = renderOverdueAlert(ctx);
    expect(v.sms.body).toContain("30m");
    expect(v.sms.body).toContain("Test Activity");
    expect(v.sms.body).toContain("Test Venue");
  });
  it("email subject includes venue + minutes-late", () => {
    const v = renderOverdueAlert(ctx);
    expect(v.email.subject).toContain("Test Venue");
    expect(v.email.subject).toContain("30m overdue");
  });
  it("telegram body includes link to completion", () => {
    const v = renderOverdueAlert(ctx);
    expect(v.telegram.body).toContain("/admin/activity-completions/c1");
  });
});
```

(Equivalent tests for the other 3 templates.)

- [ ] **Step 4: Commit**

```bash
npx vitest run tests/unit/activity-tracking/messages/
git add src/lib/activity-tracking/messages/ tests/unit/activity-tracking/messages/
git commit -m "feat(activity-tracking): message templates per stage"
```

---

### Task 13: Dispatch + worker channel selection

**Files:**
- Create: `src/lib/activity-tracking/dispatch.ts`
- Test: `tests/unit/activity-tracking/channel-select.test.ts`

- [ ] **Step 1: Test channel selection**

```typescript
// tests/unit/activity-tracking/channel-select.test.ts
import { describe, it, expect } from "vitest";
import { workerChannelsConfigured } from "../../../src/lib/activity-tracking/dispatch";

describe("workerChannelsConfigured", () => {
  it("returns email + telegram + sms for fully-configured worker", () => {
    expect(workerChannelsConfigured({ email: "x@t.com", telegramChatId: "tc1", phone: "+15551234567" }).sort())
      .toEqual(["email", "sms", "telegram"]);
  });
  it("excludes telegram when telegramChatId null", () => {
    expect(workerChannelsConfigured({ email: "x@t.com", telegramChatId: null, phone: "+1555" }))
      .not.toContain("telegram");
  });
  it("excludes sms when phone null", () => {
    expect(workerChannelsConfigured({ email: "x@t.com", telegramChatId: null, phone: null }))
      .toEqual(["email"]);
  });
});
```

- [ ] **Step 2: Implement dispatch**

```typescript
// src/lib/activity-tracking/dispatch.ts
import type { Stage } from "./stage";
import type { Recipient } from "./resolve-recipients";
import type { MessageVariants, RenderContext } from "./messages/types";
import { renderPreReminder } from "./messages/pre-reminder";
import { renderOverdueAlert } from "./messages/overdue-alert";
import { renderEscalation } from "./messages/escalation";
import { renderFinalEscalation } from "./messages/final-escalation";
import { sendSms } from "@/lib/sms/send";
import { sendEmail } from "@/lib/email/send";
import { sendTelegramToParent } from "@/lib/telegram/send";  // confirm path

export type Channel = "email" | "telegram" | "sms";

export function workerChannelsConfigured(user: { email: string | null; telegramChatId: string | null; phone: string | null }): Channel[] {
  const channels: Channel[] = [];
  if (user.email) channels.push("email");
  if (user.telegramChatId) channels.push("telegram");
  if (user.phone) channels.push("sms");
  return channels;
}

const RENDERERS: Record<Stage, (ctx: RenderContext) => MessageVariants> = {
  pre_reminder: renderPreReminder,
  overdue_alert: renderOverdueAlert,
  escalation: renderEscalation,
  final_escalation: renderFinalEscalation,
};

export interface DispatchResult {
  stage: Stage;
  channel: Channel;
  recipient_user_id: string;
  fired_at: string;
  delivery_status: "sent" | "failed";
  error?: string;
}

export async function dispatchReminders(
  stage: Stage,
  recipients: Recipient[],
  ctx: Omit<RenderContext, "recipient">,
  organizationId: string
): Promise<DispatchResult[]> {
  const results: DispatchResult[] = [];
  const renderer = RENDERERS[stage];
  for (const user of recipients) {
    const variants = renderer({ ...ctx, recipient: { id: user.id, email: user.email } });
    const channels = workerChannelsConfigured(user);
    for (const channel of channels) {
      const fired_at = new Date().toISOString();
      try {
        if (channel === "email" && user.email) {
          await sendEmail({ to: user.email, subject: variants.email.subject, html: variants.email.html, text: variants.email.text });
        } else if (channel === "sms" && user.phone) {
          await sendSms({ to: user.phone, body: variants.sms.body, organizationId, bypassOptInCheck: true });
        } else if (channel === "telegram" && user.telegramChatId) {
          // Confirm function signature; may be sendTelegramRaw or similar for non-parent recipients
          await sendTelegramToParent(user.id, variants.telegram.body);
        }
        results.push({ stage, channel, recipient_user_id: user.id, fired_at, delivery_status: "sent" });
      } catch (err) {
        results.push({ stage, channel, recipient_user_id: user.id, fired_at, delivery_status: "failed", error: String(err) });
      }
    }
  }
  return results;
}
```

(Note: `sendTelegramToParent` is parent-targeted; for staff with `telegramChatId`, may need `sendTelegramRaw(chatId, body, parse_mode)` or similar. Inspect existing telegram module and adapt; this is the kind of integration discovery that may need a small refactor of telegram/send.ts to expose a non-parent send function.)

- [ ] **Step 3: Commit**

```bash
npx vitest run tests/unit/activity-tracking/channel-select.test.ts
git add src/lib/activity-tracking/dispatch.ts tests/unit/activity-tracking/channel-select.test.ts
git commit -m "feat(activity-tracking): dispatch + worker channel selection"
```

---

### Task 14: `runActivityTrackerTick` orchestrator

**Files:**
- Create: `src/lib/activity-tracking/tick.ts`
- Test: `tests/api/activity-tracking/tick.test.ts`

- [ ] **Step 1: Implement**

```typescript
// src/lib/activity-tracking/tick.ts
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { games, venues } from "@/lib/db/schema/teams";
import { organizations } from "@/lib/db/schema/organizations";
import { and, eq, inArray, lte } from "drizzle-orm";
import { addMinutes } from "date-fns";  // confirm date-fns is available; otherwise hand-roll
import { getCatalog } from "./catalog-cache";
import { computeStage, stageAlreadyFired } from "./stage";
import { computeHandoffTarget } from "./handoff";
import { resolveRecipientsForRole } from "./resolve-recipients";
import { dispatchReminders, type DispatchResult } from "./dispatch";

export interface TickResult { processed: number; fired: number; errors: number; }

export async function runActivityTrackerTick(now: Date = new Date()): Promise<TickResult> {
  const db = getDb();
  const result: TickResult = { processed: 0, fired: 0, errors: 0 };

  // pull rows due now or due in next 15min for pre-reminder
  const due = await db
    .select()
    .from(activityCompletions)
    .where(and(
      inArray(activityCompletions.status, ["pending", "in_progress", "overdue"]),
      lte(activityCompletions.expectedAt, addMinutes(now, 15)),
    ));

  const catalog = await getCatalog();
  const publicAppUrl = process.env.PUBLIC_APP_URL ?? "https://app.example.com";

  for (const c of due) {
    try {
      const activity = catalog.activities.find((a) => a.id === c.activityId);
      if (!activity) continue;

      const stage = computeStage(now, c.expectedAt, activity.reminder_policy);
      if (!stage) continue;
      if (stageAlreadyFired(c.remindersFired as any[], stage)) continue;

      // Handoff
      const handoffTarget = computeHandoffTarget(activity, stage);
      let currentResponsibleRole = c.currentResponsibleRole;
      if (handoffTarget && handoffTarget !== currentResponsibleRole) {
        currentResponsibleRole = handoffTarget;
        const newHistory = [...(c.responsibleHistory as any[]), { role: handoffTarget, assigned_at: now.toISOString(), reason: `handoff_${stage}` }];
        await db.update(activityCompletions)
          .set({ currentResponsibleRole, responsibleHistory: newHistory, updatedAt: now })
          .where(eq(activityCompletions.id, c.id));
      }

      // Status flip on first overdue transition
      if (stage === "overdue_alert" && c.status === "pending") {
        await db.update(activityCompletions).set({ status: "overdue", updatedAt: now }).where(eq(activityCompletions.id, c.id));
      }

      // Resolve recipients + dispatch
      const [gameRow] = await db.select({ game: games, venue: venues, org: organizations })
        .from(games)
        .leftJoin(venues, eq(games.venueId, venues.id))
        .leftJoin(organizations, eq(games.organizationId, organizations.id))
        .where(eq(games.id, c.gameId))
        .limit(1);
      if (!gameRow?.game || !gameRow.venue) continue;

      const recipients = await resolveRecipientsForRole(gameRow.venue.id, currentResponsibleRole, now);
      if (recipients.length === 0) continue;

      const dispatched = await dispatchReminders(
        stage,
        recipients,
        {
          activity: { id: activity.id, name: activity.name, description: activity.description },
          completion: { id: c.id, expectedAt: c.expectedAt },
          game: { id: gameRow.game.id, scheduledAt: gameRow.game.scheduledAt },
          venue: { id: gameRow.venue.id, name: gameRow.venue.name, timezone: gameRow.org?.timezone ?? "America/New_York" },
          publicAppUrl,
        },
        c.organizationId
      );

      const newFired = [...(c.remindersFired as any[]), ...dispatched];
      await db.update(activityCompletions)
        .set({ remindersFired: newFired, updatedAt: now })
        .where(eq(activityCompletions.id, c.id));

      result.fired += dispatched.length;
    } catch (err) {
      result.errors++;
      console.error("[tracker-tick]", c.id, err);
    }
    result.processed++;
  }

  return result;
}
```

(If `date-fns` isn't already in `package.json`, replace `addMinutes(now, 15)` with `new Date(now.getTime() + 15 * 60 * 1000)`.)

- [ ] **Step 2: Integration test**

```typescript
// tests/api/activity-tracking/tick.test.ts
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { activityCompletions, venueRoleAssignments } from "@/lib/db/schema/activity-tracking";
import { users } from "@/lib/db/schema/users";
import { eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { runActivityTrackerTick } from "@/lib/activity-tracking/tick";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";

describe("runActivityTrackerTick", () => {
  it("fires pre-reminder for completion expiring soon", async () => {
    const ctx = await createTestGameContext({});
    await bootstrapActivityCompletions(ctx.gameId);

    // Create a venue manager user assigned to the venue
    const [vm] = await getDb().insert(users).values({
      email: `vm-${Date.now()}@t.com`, role: "admin", organizationId: ctx.organizationId,
    }).returning();
    await getDb().insert(venueRoleAssignments).values({
      organizationId: ctx.organizationId, venueId: ctx.venueId, roleId: "role.venue_manager", userId: vm.id,
    });

    // Adjust one completion's expectedAt to be 10min from now (within pre-reminder window)
    const rows = await getDb().select().from(activityCompletions).where(eq(activityCompletions.gameId, ctx.gameId));
    const target = rows.find(r => r.currentResponsibleRole === "role.venue_manager")!;
    const tenMinFromNow = new Date(Date.now() + 10 * 60 * 1000);
    await getDb().update(activityCompletions).set({ expectedAt: tenMinFromNow }).where(eq(activityCompletions.id, target.id));

    // Run tick
    const result = await runActivityTrackerTick();
    expect(result.fired).toBeGreaterThan(0);

    // Verify reminders_fired entry was appended
    const after = await getDb().select().from(activityCompletions).where(eq(activityCompletions.id, target.id));
    expect((after[0].remindersFired as any[]).length).toBeGreaterThan(0);
  });

  it("is idempotent — re-running does not double-fire", async () => {
    // similar setup; run tick twice; assert reminders_fired count stable
  });
});
```

- [ ] **Step 3: Commit**

```bash
npm run dev &
sleep 3
TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/activity-tracking/tick.test.ts
kill %1
git add src/lib/activity-tracking/tick.ts tests/api/activity-tracking/tick.test.ts
git commit -m "feat(activity-tracking): cron tick orchestrator with handoff + dispatch"
```

---

### Task 15: Netlify Scheduled Function + manual cron endpoint

**Files:**
- Create: `netlify/functions/scheduled-activity-tracker-tick.ts`
- Create: `src/pages/api/cron/tick-activity-tracker.ts`

- [ ] **Step 1: Manual endpoint**

```typescript
// src/pages/api/cron/tick-activity-tracker.ts
import type { APIRoute } from "astro";
import { runActivityTrackerTick } from "@/lib/activity-tracking/tick";

export const POST: APIRoute = async ({ request }) => {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const result = await runActivityTrackerTick();
  return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
};
```

- [ ] **Step 2: Scheduled Function**

```typescript
// netlify/functions/scheduled-activity-tracker-tick.ts
import { schedule } from "@netlify/functions";
import { runActivityTrackerTick } from "../../src/lib/activity-tracking/tick";

export const handler = schedule("*/5 * * * *", async () => {
  try {
    const result = await runActivityTrackerTick();
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error("[scheduled-activity-tracker-tick]", err);
    return { statusCode: 500, body: String(err) };
  }
});
```

If the project doesn't yet declare `[functions]` config in `netlify.toml`, add:

```toml
[functions]
  directory = "netlify/functions"
```

- [ ] **Step 3: Test the manual endpoint with the existing pattern**

```typescript
// tests/api/activity-tracking/tick-endpoint.test.ts
describe("POST /api/cron/tick-activity-tracker", () => {
  it("requires x-cron-secret", async () => {
    const r = await fetch(`${process.env.TEST_BASE_URL}/api/cron/tick-activity-tracker`, { method: "POST" });
    expect(r.status).toBe(401);
  });
  it("runs tick when secret matches", async () => {
    const r = await fetch(`${process.env.TEST_BASE_URL}/api/cron/tick-activity-tracker`, {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET! },
    });
    expect(r.status).toBe(200);
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/ src/pages/api/cron/tick-activity-tracker.ts tests/api/activity-tracking/tick-endpoint.test.ts netlify.toml
git commit -m "feat(activity-tracking): netlify scheduled function + manual cron endpoint"
```

---

## Phase D: Counter auto-complete + system events + external acks (3 tasks)

### Task 16: Counter auto-complete

**Files:**
- Create: `src/lib/activity-tracking/counter-autocomplete.ts`
- Test: `tests/api/activity-tracking/counter-autocomplete.test.ts`

- [ ] **Step 1: Implement**

```typescript
// src/lib/activity-tracking/counter-autocomplete.ts
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { and, eq, inArray, lte } from "drizzle-orm";
import { getCatalog } from "./catalog-cache";

type CounterSource = (gameId: string) => Promise<number>;

const counterSources: Record<string, CounterSource> = {
  // Stub adapters — replace with real queries as the underlying tables ship.
  "counter.walk_on_registrations": async (_gameId) => 0,
  "counter.live_scores":           async (_gameId) => 0,
  "counter.photos_uploaded":       async (_gameId) => 0,
  "counter.photos_published":      async (_gameId) => 0,
};

export async function runCounterAutoComplete(now: Date = new Date()): Promise<{ completed: number; overdue: number }> {
  const db = getDb();
  const stats = { completed: 0, overdue: 0 };
  const catalog = await getCatalog();

  const candidates = await db
    .select()
    .from(activityCompletions)
    .where(and(
      lte(activityCompletions.expectedAt, now),
      inArray(activityCompletions.status, ["pending", "in_progress"]),
    ));

  for (const c of candidates) {
    const activity = catalog.activities.find((a) => a.id === c.activityId);
    if (!activity || activity.tracking_method !== "counter_increment") continue;

    const counterId = (activity.tracking_artifact as any).counter as string;
    const minCount = (activity.tracking_artifact as any).min_count as number;
    const source = counterSources[counterId];
    if (!source) {
      console.warn(`[counter-autocomplete] no source for ${counterId}`);
      continue;
    }

    const count = await source(c.gameId);
    if (count >= minCount) {
      await db.update(activityCompletions)
        .set({ status: "completed", completedAt: now, updatedAt: now })
        .where(eq(activityCompletions.id, c.id));
      stats.completed++;
    }
    // count < minCount → falls through to main tick which marks overdue
  }
  return stats;
}
```

- [ ] **Step 2: Wire into the main tick** — call `runCounterAutoComplete(now)` at the end of `runActivityTrackerTick`.

- [ ] **Step 3: Test + commit**

```typescript
// tests/api/activity-tracking/counter-autocomplete.test.ts
// Stub one of the counter sources via a temporary monkey-patch or refactor counterSources to accept overrides;
// or use a dependency-injection variant: export a setCounterSources fn for tests.
```

```bash
git add src/lib/activity-tracking/counter-autocomplete.ts src/lib/activity-tracking/tick.ts tests/api/activity-tracking/counter-autocomplete.test.ts
git commit -m "feat(activity-tracking): counter auto-complete pass"
```

---

### Task 17: `markCompleteBySystemEvent` + integration with broadcast code

**Files:**
- Create: `src/lib/activity-tracking/mark-complete.ts`
- Modify: `src/lib/messaging/broadcast.ts` (or wherever cancellation broadcast lives)

- [ ] **Step 1: Implement helpers**

```typescript
// src/lib/activity-tracking/mark-complete.ts
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { and, eq, inArray } from "drizzle-orm";
import { getCatalog } from "./catalog-cache";

export async function markCompleteBySystemEvent(gameId: string, eventType: string): Promise<number> {
  const db = getDb();
  const catalog = await getCatalog();
  const activitiesUsingEvent = catalog.activities.filter(
    (a) => a.tracking_method === "system_event" && (a.tracking_artifact as any).event_type === eventType
  );
  if (activitiesUsingEvent.length === 0) return 0;
  const activityIds = activitiesUsingEvent.map((a) => a.id);
  const result = await db.update(activityCompletions)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(activityCompletions.gameId, gameId),
      inArray(activityCompletions.activityId, activityIds),
      inArray(activityCompletions.status, ["pending", "in_progress", "overdue"])
    ))
    .returning();
  return result.length;
}

export async function markComplete(completionId: string, opts: { byUserId?: string }): Promise<void> {
  const db = getDb();
  await db.update(activityCompletions)
    .set({
      status: "completed",
      completedAt: new Date(),
      completedByUserId: opts.byUserId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(activityCompletions.id, completionId));
}
```

- [ ] **Step 2: Wire into existing broadcast code**

Find the cancellation broadcast function in `src/lib/messaging/` (likely `broadcast.ts` or similar). After the broadcast successfully sends:

```typescript
import { markCompleteBySystemEvent } from "@/lib/activity-tracking/mark-complete";

// after broadcast sent:
await markCompleteBySystemEvent(gameId, "evt.cancellation_broadcast_sent").catch(err => console.error("[mark-complete]", err));
```

- [ ] **Step 3: Test + commit**

```typescript
// tests/api/activity-tracking/system-event-completion.test.ts
import { markCompleteBySystemEvent } from "@/lib/activity-tracking/mark-complete";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";

it("marks the matching activity complete when system event fires", async () => {
  const ctx = await createTestGameContext({});
  await bootstrapActivityCompletions(ctx.gameId);
  const n = await markCompleteBySystemEvent(ctx.gameId, "evt.cancellation_broadcast_sent");
  expect(n).toBe(1);

  const rows = await getDb().select().from(activityCompletions)
    .where(and(eq(activityCompletions.gameId, ctx.gameId), eq(activityCompletions.activityId, "act.cancellation_broadcast")));
  expect(rows[0].status).toBe("completed");
});
```

```bash
git add src/lib/activity-tracking/mark-complete.ts src/lib/messaging/broadcast.ts tests/api/activity-tracking/system-event-completion.test.ts
git commit -m "feat(activity-tracking): markCompleteBySystemEvent + cancellation-broadcast wiring"
```

---

## Phase E: Activity completion submit endpoints + renderers (8 tasks)

### Task 18: Catalog API endpoints (read-only)

**Files:**
- Create: `src/pages/api/catalog/activities/[id].ts`
- Create: `src/pages/api/catalog/artifacts/[id].ts`

These let the React renderer pages fetch activity + template definitions on the client.

- [ ] **Step 1: Implement**

```typescript
// src/pages/api/catalog/activities/[id].ts
import type { APIRoute } from "astro";
import { getActivityFromCatalog } from "@/lib/activity-tracking/catalog-cache";

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const activity = await getActivityFromCatalog(params.id!);
  if (!activity) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  return new Response(JSON.stringify(activity), { status: 200, headers: { "content-type": "application/json" } });
};
```

```typescript
// src/pages/api/catalog/artifacts/[id].ts
import type { APIRoute } from "astro";
import { getArtifactTemplate } from "@/lib/activity-tracking/catalog-cache";

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const tpl = await getArtifactTemplate(params.id!);
  if (!tpl) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  return new Response(JSON.stringify(tpl), { status: 200, headers: { "content-type": "application/json" } });
};
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/catalog/
git commit -m "feat(activity-tracking): catalog read API for activities + artifacts"
```

---

### Task 19: Activity completion routing page

**Files:**
- Create: `src/pages/admin/activity-completions/[id].astro`
- Create: `src/components/admin/activity-completions/page.tsx`

- [ ] **Step 1: Astro shell**

```astro
---
// src/pages/admin/activity-completions/[id].astro
import BaseLayout from "@/layouts/BaseLayout.astro";
import { ActivityCompletionPage } from "@/components/admin/activity-completions/page";

const { id } = Astro.params;
---
<BaseLayout title="Activity">
  <ActivityCompletionPage client:load completionId={id!} />
</BaseLayout>
```

- [ ] **Step 2: Branching component shell**

```typescript
// src/components/admin/activity-completions/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ChecklistRenderer } from "./checklist-renderer";
import { FormRenderer } from "./form-renderer";
import { SignatureRenderer } from "./signature-renderer";
import { PhotoUploadRenderer } from "./photo-upload-renderer";
import { CounterReadback } from "./counter-readback";
import { SystemEventReadback } from "./system-event-readback";
import { ExternalAckReadback } from "./external-ack-readback";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";

export function ActivityCompletionPage({ completionId }: { completionId: string }) {
  useHydrationBeacon();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cRes = await fetch(`/api/admin/activity-completions/${completionId}`);
        if (!cRes.ok) throw new Error(`Failed to load completion (${cRes.status})`);
        const completion = await cRes.json();
        const aRes = await fetch(`/api/catalog/activities/${completion.activityId}`);
        const activity = await aRes.json();
        let template = null;
        if (["checklist", "form", "signature"].includes(activity.tracking_method)) {
          const tplId = activity.tracking_artifact.template_id;
          const tRes = await fetch(`/api/catalog/artifacts/${tplId}`);
          template = await tRes.json();
        }
        setData({ completion, activity, template });
      } catch (e: any) { setError(e.message); }
    })();
  }, [completionId]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <LoadingSkeleton />;
  const { completion, activity, template } = data;

  switch (activity.tracking_method) {
    case "checklist":
      return <ChecklistRenderer completion={completion} activity={activity} template={template} />;
    case "form":
      return <FormRenderer completion={completion} activity={activity} template={template} />;
    case "signature":
      return <SignatureRenderer completion={completion} activity={activity} template={template} />;
    case "photo_upload":
      return <PhotoUploadRenderer completion={completion} activity={activity} />;
    case "counter_increment":
      return <CounterReadback completion={completion} activity={activity} />;
    case "system_event":
      return <SystemEventReadback completion={completion} activity={activity} />;
    case "external_acknowledgment":
      return <ExternalAckReadback completion={completion} activity={activity} />;
    default:
      return <ErrorBanner message={`Unknown tracking_method: ${activity.tracking_method}`} />;
  }
}
```

- [ ] **Step 3: GET endpoint for a completion**

```typescript
// src/pages/api/admin/activity-completions/[id].ts
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { eq } from "drizzle-orm";
import { requireSameOrgForCompletion } from "@/lib/auth/require-resource-ownership";  // see existing helpers

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const [row] = await getDb().select().from(activityCompletions).where(eq(activityCompletions.id, params.id!)).limit(1);
  if (!row) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  // Verify same-org
  const ok = await requireSameOrgForCompletion(locals.user, row);
  if (!ok) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  return new Response(JSON.stringify(row), { status: 200, headers: { "content-type": "application/json" } });
};
```

(Adapt `requireSameOrgForCompletion` to existing helper patterns; may need a small new helper.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/activity-completions/ src/components/admin/activity-completions/page.tsx src/pages/api/admin/activity-completions/[id].ts
git commit -m "feat(activity-tracking): completion routing page + branching renderer shell"
```

---

### Task 20: ChecklistRenderer + submit endpoint

**Files:**
- Create: `src/components/admin/activity-completions/checklist-renderer.tsx`
- Create: `src/pages/api/admin/activity-completions/[id]/submit.ts`
- Test: `tests/api/activity-tracking/submit-checklist.test.ts`

- [ ] **Step 1: Renderer**

```typescript
// src/components/admin/activity-completions/checklist-renderer.tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";

export function ChecklistRenderer({ completion, activity, template }: any) {
  const [items, setItems] = useState<Record<string, { checked: boolean; note?: string }>>(
    Object.fromEntries(template.items.map((i: any) => [i.id, { checked: false, note: "" }]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const allChecked = template.items.every((i: any) => items[i.id]?.checked);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const payload = { items: template.items.map((i: any) => ({ item_id: i.id, checked: items[i.id]?.checked ?? false, note: items[i.id]?.note })) };
      const res = await fetch(`/api/admin/activity-completions/${completion.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Submit failed (${res.status})`);
      window.location.reload();
    } catch (e: any) { setErr(e.message); } finally { setSubmitting(false); }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold">{activity.name}</h1>
      <p className="text-muted-foreground mb-6">{activity.description}</p>
      {err && <ErrorBanner message={err} />}
      <ul className="space-y-3">
        {template.items.map((item: any) => (
          <li key={item.id} className="flex items-start gap-3 p-3 border rounded">
            <input
              type="checkbox"
              checked={items[item.id]?.checked ?? false}
              onChange={(e) => setItems({ ...items, [item.id]: { ...items[item.id], checked: e.target.checked } })}
            />
            <div className="flex-1">
              <div>{item.label}</div>
              <input
                type="text"
                placeholder="Note (optional)"
                className="mt-1 w-full text-sm border-b focus:outline-none"
                value={items[item.id]?.note ?? ""}
                onChange={(e) => setItems({ ...items, [item.id]: { ...items[item.id], note: e.target.value } })}
              />
            </div>
          </li>
        ))}
      </ul>
      <Button onClick={submit} disabled={!allChecked || submitting} className="mt-6">
        {submitting ? "Submitting..." : "Submit"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Submit endpoint**

```typescript
// src/pages/api/admin/activity-completions/[id]/submit.ts
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { activityCompletions, checklistSubmissions, formSubmissions, signatureSubmissions } from "@/lib/db/schema/activity-tracking";
import { eq, and, ne } from "drizzle-orm";
import { getActivityFromCatalog } from "@/lib/activity-tracking/catalog-cache";

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const completionId = params.id!;
  const body = await request.json();

  const db = getDb();
  const [completion] = await db.select().from(activityCompletions).where(eq(activityCompletions.id, completionId)).limit(1);
  if (!completion) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  if (completion.organizationId !== locals.user.organizationId) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }
  if (completion.status === "completed") {
    return new Response(JSON.stringify({ error: "Already completed" }), { status: 409 });
  }

  const activity = await getActivityFromCatalog(completion.activityId);
  if (!activity) return new Response(JSON.stringify({ error: "Activity not in catalog" }), { status: 410 });

  let evidenceFKs: any = {};
  if (activity.tracking_method === "checklist") {
    if (!Array.isArray(body.items)) return new Response(JSON.stringify({ error: "items required" }), { status: 400 });
    const [sub] = await db.insert(checklistSubmissions).values({
      completionId, templateId: (activity.tracking_artifact as any).template_id,
      submittedByUserId: locals.user.id, items: body.items,
    }).returning();
    evidenceFKs = { checklistSubmissionId: sub.id };
  } else if (activity.tracking_method === "form") {
    if (!body.fields || typeof body.fields !== "object") return new Response(JSON.stringify({ error: "fields required" }), { status: 400 });
    const [sub] = await db.insert(formSubmissions).values({
      completionId, templateId: (activity.tracking_artifact as any).template_id,
      submittedByUserId: locals.user.id, fields: body.fields,
    }).returning();
    evidenceFKs = { formSubmissionId: sub.id };
  } else if (activity.tracking_method === "signature") {
    if (!body.typed_name || body.typed_name.length < 3) return new Response(JSON.stringify({ error: "typed_name required" }), { status: 400 });
    const requiredRole = (activity.tracking_artifact as any).required_role;
    // TODO: verify user is currently in the required role at this venue (Task 18 prerequisite — venue_role_assignments lookup)
    const [sub] = await db.insert(signatureSubmissions).values({
      completionId, templateId: (activity.tracking_artifact as any).template_id,
      signedByUserId: locals.user.id, typedName: body.typed_name, signedRole: requiredRole,
    }).returning();
    evidenceFKs = { signatureSubmissionId: sub.id };
  } else if (activity.tracking_method === "photo_upload") {
    if (!body.media_id) return new Response(JSON.stringify({ error: "media_id required" }), { status: 400 });
    evidenceFKs = { photoId: body.media_id };
  } else {
    return new Response(JSON.stringify({ error: `Cannot submit method ${activity.tracking_method} via this endpoint` }), { status: 400 });
  }

  const updated = await db.update(activityCompletions)
    .set({ status: "completed", completedAt: new Date(), completedByUserId: locals.user.id, ...evidenceFKs, updatedAt: new Date() })
    .where(and(eq(activityCompletions.id, completionId), ne(activityCompletions.status, "completed")))
    .returning();

  if (updated.length === 0) {
    return new Response(JSON.stringify({ error: "Already completed (race)" }), { status: 409 });
  }
  return new Response(JSON.stringify(updated[0]), { status: 200 });
};
```

- [ ] **Step 3: Test + commit**

```typescript
// tests/api/activity-tracking/submit-checklist.test.ts
it("submits a checklist and marks the completion completed", async () => {
  const ctx = await createTestGameContext({});
  await bootstrapActivityCompletions(ctx.gameId);
  const rows = await getDb().select().from(activityCompletions).where(eq(activityCompletions.gameId, ctx.gameId));
  const checklistRow = rows.find(r => r.activityId === "act.facility_unlock")!;  // checklist activity

  const adminCookie = await signInAsAdmin();
  const res = await fetch(`${process.env.TEST_BASE_URL}/api/admin/activity-completions/${checklistRow.id}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ items: [{ item_id: "pending_authorship", checked: true }] }),
  });
  expect(res.status).toBe(200);

  const after = await getDb().select().from(activityCompletions).where(eq(activityCompletions.id, checklistRow.id));
  expect(after[0].status).toBe("completed");
  expect(after[0].checklistSubmissionId).not.toBeNull();
});

it("returns 409 on second submit", async () => {
  // submit twice; assert second returns 409
});
```

```bash
git add src/components/admin/activity-completions/checklist-renderer.tsx src/pages/api/admin/activity-completions/[id]/submit.ts tests/api/activity-tracking/submit-checklist.test.ts
git commit -m "feat(activity-tracking): checklist renderer + submit endpoint"
```

---

### Task 21: FormRenderer

**Files:**
- Create: `src/components/admin/activity-completions/form-renderer.tsx`
- Test: `tests/api/activity-tracking/submit-form.test.ts`

The submit endpoint already handles forms (Task 20). This task adds the React UI.

- [ ] **Step 1: Component**

```typescript
// src/components/admin/activity-completions/form-renderer.tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";

export function FormRenderer({ completion, activity, template }: any) {
  const [fields, setFields] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setField(id: string, value: any) {
    setFields({ ...fields, [id]: value });
  }

  function isValid() {
    return template.fields.every((f: any) => !f.required || (fields[f.id] !== undefined && fields[f.id] !== ""));
  }

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/activity-completions/${completion.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) throw new Error(`Submit failed (${res.status})`);
      window.location.reload();
    } catch (e: any) { setErr(e.message); } finally { setSubmitting(false); }
  }

  function renderField(f: any) {
    const v = fields[f.id] ?? "";
    if (f.type === "long_text")
      return <textarea className="w-full border rounded p-2" rows={4} value={v} onChange={(e) => setField(f.id, e.target.value)} />;
    if (f.type === "enum")
      return (
        <select className="w-full border rounded p-2" value={v} onChange={(e) => setField(f.id, e.target.value)}>
          <option value="">— select —</option>
          {f.options.map((o: string) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    if (f.type === "boolean")
      return <input type="checkbox" checked={!!v} onChange={(e) => setField(f.id, e.target.checked)} />;
    if (f.type === "number")
      return <input type="number" className="w-full border rounded p-2" value={v} onChange={(e) => setField(f.id, e.target.valueAsNumber)} />;
    if (f.type === "date")
      return <input type="date" className="w-full border rounded p-2" value={v} onChange={(e) => setField(f.id, e.target.value)} />;
    return <input type="text" className="w-full border rounded p-2" value={v} onChange={(e) => setField(f.id, e.target.value)} />;
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold">{activity.name}</h1>
      <p className="text-muted-foreground mb-6">{activity.description}</p>
      {err && <ErrorBanner message={err} />}
      <div className="space-y-4">
        {template.fields.map((f: any) => (
          <div key={f.id}>
            <label className="block text-sm font-medium mb-1">{f.label}{f.required && " *"}</label>
            {renderField(f)}
          </div>
        ))}
      </div>
      <Button onClick={submit} disabled={!isValid() || submitting} className="mt-6">
        {submitting ? "Submitting..." : "Submit"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/activity-completions/form-renderer.tsx tests/api/activity-tracking/submit-form.test.ts
git commit -m "feat(activity-tracking): form renderer"
```

---

### Task 22: SignatureRenderer

**Files:**
- Create: `src/components/admin/activity-completions/signature-renderer.tsx`
- Test: `tests/api/activity-tracking/submit-signature.test.ts`

```typescript
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";

export function SignatureRenderer({ completion, activity, template }: any) {
  const [typedName, setTypedName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (typedName.length < 3) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/activity-completions/${completion.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typed_name: typedName }),
      });
      if (!res.ok) throw new Error(`Submit failed (${res.status})`);
      window.location.reload();
    } catch (e: any) { setErr(e.message); } finally { setSubmitting(false); }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold">{activity.name}</h1>
      <p className="text-muted-foreground mb-6">{activity.description}</p>
      {err && <ErrorBanner message={err} />}
      <div className="border rounded p-4 mb-4 bg-muted">{template.prompt}</div>
      <label className="block text-sm font-medium mb-1">Type your full name to sign</label>
      <input
        type="text"
        className="w-full border rounded p-2"
        value={typedName}
        onChange={(e) => setTypedName(e.target.value)}
      />
      <Button onClick={submit} disabled={typedName.length < 3 || submitting} className="mt-6">
        {submitting ? "Signing..." : "Sign"}
      </Button>
    </div>
  );
}
```

```bash
git add src/components/admin/activity-completions/signature-renderer.tsx tests/api/activity-tracking/submit-signature.test.ts
git commit -m "feat(activity-tracking): signature renderer"
```

---

### Task 23: PhotoUploadRenderer

**Files:**
- Create: `src/components/admin/activity-completions/photo-upload-renderer.tsx`

This reuses the existing media upload infrastructure (Media Phase 2). Confirm the component path and adapt.

```typescript
"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function PhotoUploadRenderer({ completion, activity }: any) {
  const mediaKind = activity.tracking_artifact.media_kind;
  const [existing, setExisting] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/media?kind=${mediaKind}&gameId=${completion.gameId}`).then((r) => r.json()).then(setExisting);
  }, [mediaKind, completion.gameId]);

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    const res = await fetch(`/api/admin/activity-completions/${completion.id}/submit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_id: selected }),
    });
    if (res.ok) window.location.reload();
    setSubmitting(false);
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold">{activity.name}</h1>
      <p className="text-muted-foreground mb-6">{activity.description}</p>
      <div className="grid grid-cols-3 gap-3">
        {existing.map((m: any) => (
          <button
            key={m.id}
            onClick={() => setSelected(m.id)}
            className={`border-2 rounded ${selected === m.id ? "border-blue-500" : "border-transparent"}`}
          >
            <img src={m.thumbnailUrl} alt="" className="w-full" />
          </button>
        ))}
      </div>
      <Button onClick={submit} disabled={!selected || submitting} className="mt-6">
        {submitting ? "Submitting..." : "Use this photo"}
      </Button>
      {/* TODO: add upload-new affordance using existing media upload component */}
    </div>
  );
}
```

```bash
git add src/components/admin/activity-completions/photo-upload-renderer.tsx
git commit -m "feat(activity-tracking): photo upload renderer (existing-media selection)"
```

---

### Task 24: Counter / SystemEvent / ExternalAck readbacks

**Files:**
- Create: `src/components/admin/activity-completions/{counter-readback,system-event-readback,external-ack-readback}.tsx`

Three read-only components showing current state.

```typescript
// counter-readback.tsx
export function CounterReadback({ completion, activity }: any) {
  // Fetch underlying count via /api/admin/counters/<counter_id>?gameId=<id>
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold">{activity.name}</h1>
      <p className="text-muted-foreground mb-6">{activity.description}</p>
      <p>Status: <strong>{completion.status}</strong></p>
      <p className="mt-4 text-sm">This activity auto-completes at {new Date(completion.expectedAt).toLocaleString()} based on the underlying count.</p>
    </div>
  );
}
```

(Similar shells for SystemEventReadback and ExternalAckReadback.)

```bash
git add src/components/admin/activity-completions/{counter,system-event,external-ack}-readback.tsx
git commit -m "feat(activity-tracking): readback components for counter/system_event/external_ack"
```

---

### Task 25: Cancel + reassign endpoints

**Files:**
- Create: `src/pages/api/admin/activity-completions/[id]/cancel.ts`
- Create: `src/pages/api/admin/activity-completions/[id]/reassign.ts`

```typescript
// cancel.ts
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { eq } from "drizzle-orm";

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const body = await request.json();
  if (!body.reason) return new Response(JSON.stringify({ error: "reason required" }), { status: 400 });
  await getDb().update(activityCompletions)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(activityCompletions.id, params.id!));
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
```

```typescript
// reassign.ts — appends to responsible_history and updates current_responsible_role
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { eq } from "drizzle-orm";

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const body = await request.json();
  if (!body.role || !body.reason) return new Response(JSON.stringify({ error: "role + reason required" }), { status: 400 });

  const [c] = await getDb().select().from(activityCompletions).where(eq(activityCompletions.id, params.id!)).limit(1);
  if (!c) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  const newHistory = [...(c.responsibleHistory as any[]), { role: body.role, assigned_at: new Date().toISOString(), reason: `manual: ${body.reason}` }];
  await getDb().update(activityCompletions)
    .set({ currentResponsibleRole: body.role, responsibleHistory: newHistory, updatedAt: new Date() })
    .where(eq(activityCompletions.id, params.id!));
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
```

```bash
git add src/pages/api/admin/activity-completions/[id]/{cancel,reassign}.ts
git commit -m "feat(activity-tracking): cancel + reassign admin endpoints"
```

---

## Phase F: Dashboard + venue admin (5 tasks)

### Task 26: Venue role assignments admin UI

**Files:**
- Create: `src/pages/admin/venues/[id]/staff.astro`
- Create: `src/components/admin/venues/role-assignments-list.tsx`
- Create: `src/pages/api/admin/venues/[id]/role-assignments.ts` (GET + POST)
- Create: `src/pages/api/admin/venues/[id]/role-assignments/[assignmentId].ts` (PATCH end-effective)

The page shows current assignments for a venue, lets admins add new ones (pick a user + role) and end existing ones (set effective_to = now).

Code pattern follows `games-list.tsx` style (cards with create/edit modals). Specifics:
- GET endpoint: returns active assignments joined with users
- POST endpoint: creates a new assignment
- PATCH endpoint: sets `effective_to = now` (ends an active assignment)

```bash
git add src/pages/admin/venues/[id]/staff.astro src/components/admin/venues/role-assignments-list.tsx src/pages/api/admin/venues/[id]/role-assignments*
git commit -m "feat(activity-tracking): venue role assignments admin UI"
```

---

### Task 27: Venue columns admin UI

**Files:** Modify the existing venue create/edit form.

- [ ] **Step 1: Find existing venue form**

```bash
grep -rln "venue" src/components/admin/ | grep -i "form\|list" | head
```

- [ ] **Step 2: Add three checkboxes** for `owned`, `concessions`, `parking_managed`. Wire to existing venue create/update endpoints.

```bash
git add src/components/admin/
git commit -m "feat(activity-tracking): venue owned/concessions/parking_managed admin UI"
```

---

### Task 28: Today dashboard page

**Files:**
- Create: `src/pages/admin/game-day/today.astro`
- Create: `src/components/admin/game-day/activity-tracking-dashboard.tsx`
- Create: `src/pages/api/admin/activity-completions/today.ts` (GET)

- [ ] **Step 1: Endpoint**

```typescript
// src/pages/api/admin/activity-completions/today.ts
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { games, venues } from "@/lib/db/schema/teams";
import { and, between, eq } from "drizzle-orm";

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const today = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00.000Z`);
  const end = new Date(`${today}T23:59:59.999Z`);

  const rows = await getDb()
    .select({
      completion: activityCompletions,
      gameScheduledAt: games.scheduledAt,
      venueName: venues.name,
    })
    .from(activityCompletions)
    .innerJoin(games, eq(activityCompletions.gameId, games.id))
    .innerJoin(venues, eq(games.venueId, venues.id))
    .where(and(
      eq(activityCompletions.organizationId, locals.user.organizationId),
      between(games.scheduledAt, start, end)
    ));

  return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
};
```

- [ ] **Step 2: Astro shell + React component**

```astro
---
// src/pages/admin/game-day/today.astro
import BaseLayout from "@/layouts/BaseLayout.astro";
import { ActivityTrackingDashboard } from "@/components/admin/game-day/activity-tracking-dashboard";
---
<BaseLayout title="Today">
  <ActivityTrackingDashboard client:load />
</BaseLayout>
```

```typescript
// src/components/admin/game-day/activity-tracking-dashboard.tsx
"use client";
import { useEffect, useState } from "react";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

export function ActivityTrackingDashboard() {
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/activity-completions/today").then((r) => r.json()).then(setRows);
  }, []);

  if (!rows) return <LoadingSkeleton />;

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Today's activities</h1>
      <table className="w-full">
        <thead>
          <tr className="text-left border-b">
            <th>Status</th><th>Activity</th><th>Game / Venue</th><th>Expected</th><th>Responsible</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.completion.id} className="border-b">
              <td><StatusBadge status={r.completion.status} /></td>
              <td>{r.completion.activityId}</td>
              <td>{r.venueName}</td>
              <td>{new Date(r.completion.expectedAt).toLocaleString()}</td>
              <td>{r.completion.currentResponsibleRole}</td>
              <td><a href={`/admin/activity-completions/${r.completion.id}`} className="text-blue-600">Open →</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-200", in_progress: "bg-blue-200", overdue: "bg-yellow-200",
    completed: "bg-green-200", canceled: "bg-red-200", skipped_by_handoff: "bg-purple-200",
  };
  return <span className={`px-2 py-1 rounded text-xs ${colors[status] ?? "bg-gray-200"}`}>{status}</span>;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/game-day/today.astro src/components/admin/game-day/activity-tracking-dashboard.tsx src/pages/api/admin/activity-completions/today.ts
git commit -m "feat(activity-tracking): today dashboard"
```

---

### Task 29: Dashboard filters + tabs

**Files:** Modify `src/components/admin/game-day/activity-tracking-dashboard.tsx`

Add UI for: date range picker (with today/yesterday/last 7 days/this week/custom presets), venue multi-select, phase multi-select, status multi-select, role-responsible multi-select, activity type-ahead search. Tabs: "By time" (default flat table) and "By phase" (grouped per phase header).

This is mostly UI state management; uses existing shadcn/ui primitives. Adapt the existing `games-list.tsx` filter pattern.

```bash
git add src/components/admin/game-day/activity-tracking-dashboard.tsx
git commit -m "feat(activity-tracking): dashboard filters + by-phase tab"
```

---

### Task 30: Mobile layout

Modify the dashboard component to render as stacked cards below `md` breakpoint, with filters in a top sheet/drawer.

```bash
git add src/components/admin/game-day/activity-tracking-dashboard.tsx
git commit -m "feat(activity-tracking): mobile cards layout for dashboard"
```

---

## Phase G: Final integration + verification (2 tasks)

### Task 31: Full-flow integration test

**Files:**
- Test: `tests/api/activity-tracking/full-flow.test.ts`

End-to-end at the API level:
1. Create test game context
2. Bootstrap completions (assert N rows)
3. Reschedule the game (assert expected_at moved)
4. Submit a checklist artifact (assert status=completed, evidence row created)
5. Cancel the game (assert remaining pending rows canceled, completed row preserved)

```bash
git add tests/api/activity-tracking/full-flow.test.ts
git commit -m "test(activity-tracking): full-flow integration test"
```

---

### Task 32: Self-review against spec

- [ ] Walk through spec sections §4 through §11 and verify each requirement has a test or implementation pointer
- [ ] Run full test suite: `npx vitest run tests/unit/activity-tracking/ tests/api/activity-tracking/ tests/unit/ops-catalog/`
- [ ] Run validator + render: `npm run catalog:validate && npm run catalog:render`
- [ ] Confirm `git status` clean
- [ ] If gaps found, file additional small commits

---

## What's NOT in this plan (deferred)

- Catalog migration tooling (auto-rebootstrap on additive catalog edits)
- Per-org template overrides
- Localization
- E2E (Playwright) tests for the renderer pages — defer to follow-up after UI stabilizes
- Per-feature platform features (cancellation broadcast, score entry, standings engine, etc.) — Plan 4+
- Real artifact content (checklist items, form fields, signature prompts) — operator authorship, ongoing follow-up PRs
- Real SOP body content — operator authorship, ongoing follow-up PRs
- Phone notification template short-link redirect (currently uses full URL in SMS — fine for MVP)
- `trigger+Nmin` DSL form — bootstraps with kickoff fallback; full implementation deferred to a dependency-tracking plan

