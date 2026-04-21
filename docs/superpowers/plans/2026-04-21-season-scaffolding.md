# Season Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single "New Season" flow with three starting options (clone a prior season, bulk-create N teams, or empty) plus a season-level venue field, replacing the current bare create-season dialog at `/admin/seasons`.

**Architecture:** Schema gets one new column (`seasons.venueId`). API endpoint `POST /api/admin/seasons` is extended with optional `scaffold` and `venueId` fields, fully back-compat. Team-scaffolding logic lives in a new `src/lib/seasons/scaffold.ts` module with two narrow functions (`cloneSeasonTeams`, `bulkCreateTeams`), both transaction-aware. UI extends the existing dialog in `seasons-list.tsx` and adds a new `<SeasonScaffoldPicker>` component file.

**Tech Stack:** Astro 5 SSR, React 19, Drizzle ORM (postgres-js), Tailwind 4, Vitest for API tests, Playwright for E2E.

**Spec:** `docs/superpowers/specs/2026-04-21-season-scaffolding-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/db/schema/programs.ts` | Modify | Add `venueId` column to `seasons` table + import + relation |
| `src/lib/db/migrations/NNNN_*.sql` | Create (drizzle-kit) | Migration for the new column |
| `src/lib/seasons/scaffold.ts` | Create | `cloneSeasonTeams` and `bulkCreateTeams` helpers (transaction-aware) |
| `src/pages/api/admin/seasons.ts` | Modify | Extend POST handler with optional `scaffold` and `venueId` |
| `src/components/admin/season-scaffold-picker.tsx` | Create | Radio-style picker + conditional sub-forms (clone source dropdown, bulk count input) |
| `src/components/admin/seasons-list.tsx` | Modify | Add venue picker to form; mount `<SeasonScaffoldPicker>`; build scaffold field on submit |
| `tests/api/admin/seasons.test.ts` | Modify | Add scaffold + venue test cases (extends existing file) |
| `tests/seasons-scaffold.spec.ts` | Create | Playwright E2E for the clone path |

---

## Prerequisites

- Dev server NOT running yet (you'll start it before running tests).
- DATABASE_URL is set in `.env`.
- `npm install` has been run.

---

### Task 1: Add `venueId` column to `seasons` schema

**Files:**
- Modify: `src/lib/db/schema/programs.ts`
- Create (auto-generated): `src/lib/db/migrations/NNNN_*.sql`

- [ ] **Step 1: Add the import for `venues` to programs.ts**

In `src/lib/db/schema/programs.ts`, after the existing imports, add:

```ts
import { venues } from "./teams";
```

- [ ] **Step 2: Add the `venueId` column to the `seasons` table definition**

In the `seasons = pgTable(...)` block in `src/lib/db/schema/programs.ts`, add this column after the existing `ageGroupId` column (around line 63):

```ts
venueId: uuid("venue_id").references(() => venues.id, {
  onDelete: "set null",
}),
```

- [ ] **Step 3: Add a `venue` relation to `seasonsRelations`**

Update `seasonsRelations` (around line 97) to include venue:

```ts
export const seasonsRelations = relations(seasons, ({ one }) => ({
  program: one(programs, {
    fields: [seasons.programId],
    references: [programs.id],
  }),
  ageGroup: one(ageGroups, {
    fields: [seasons.ageGroupId],
    references: [ageGroups.id],
  }),
  venue: one(venues, {
    fields: [seasons.venueId],
    references: [venues.id],
  }),
}));
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: A new file appears in `src/lib/db/migrations/` named like `NNNN_<random>.sql` containing `ALTER TABLE "seasons" ADD COLUMN "venue_id" uuid;` plus the foreign key constraint.

- [ ] **Step 5: Apply the migration to the dev database**

Run: `npm run db:push`
Expected: Output confirms changes pushed; no errors. (If push prompts about data loss, abort and inspect — should not happen for an additive nullable column.)

- [ ] **Step 6: Sanity-check the column exists**

Run: `psql "$DATABASE_URL" -c "\d seasons" | grep venue_id`
Expected: One line showing `venue_id | uuid` (nullable).

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema/programs.ts src/lib/db/migrations/
git commit -m "feat(schema): add seasons.venueId for season-level venue assignment"
```

---

### Task 2: Create the scaffold helper module skeleton

**Files:**
- Create: `src/lib/seasons/scaffold.ts`

- [ ] **Step 1: Create the file with both function signatures + stubs**

Create `src/lib/seasons/scaffold.ts`:

```ts
import { eq } from "drizzle-orm";
import { teams, type Team } from "@/lib/db/schema";
import type { Database } from "@/lib/db";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function cloneSeasonTeams(
  tx: Tx,
  args: { sourceSeasonId: string; targetSeasonId: string }
): Promise<Team[]> {
  const sourceTeams = await tx
    .select()
    .from(teams)
    .where(eq(teams.seasonId, args.sourceSeasonId));

  if (sourceTeams.length === 0) return [];

  const inserted = await tx
    .insert(teams)
    .values(
      sourceTeams.map((t) => ({
        seasonId: args.targetSeasonId,
        name: t.name,
        color: t.color,
        coachUserId: t.coachUserId,
        assistantCoachUserId: t.assistantCoachUserId,
        maxRosterSize: t.maxRosterSize,
        division: t.division,
      }))
    )
    .returning();

  return inserted;
}

export async function bulkCreateTeams(
  tx: Tx,
  args: {
    targetSeasonId: string;
    count: number;
    programName: string;
    ageGroupName: string | null;
  }
): Promise<Team[]> {
  if (args.count <= 0) return [];

  const prefix = args.ageGroupName
    ? `${args.programName} ${args.ageGroupName}`
    : args.programName;

  const rows = Array.from({ length: args.count }, (_, i) => ({
    seasonId: args.targetSeasonId,
    name: `${prefix} Team ${i + 1}`,
  }));

  const inserted = await tx.insert(teams).values(rows).returning();
  return inserted;
}
```

- [ ] **Step 2: Type-check the file**

Run: `npx tsc --noEmit`
Expected: PASS, no errors. (If `Tx` typing doesn't resolve, inspect the Database type and adjust — the goal is `tx` matches the parameter passed to a `db.transaction(async (tx) => ...)` callback.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/seasons/scaffold.ts
git commit -m "feat(seasons): add scaffold helpers for clone and bulk-create"
```

---

### Task 3: Extend POST /api/admin/seasons with `venueId` and `scaffold` fields (back-compat first)

This task only updates the schema validation and threads the new fields through; the actual scaffold execution happens in subsequent tasks. The goal is that all existing season-creation tests continue to pass.

**Files:**
- Modify: `src/pages/api/admin/seasons.ts`

- [ ] **Step 1: Start the dev server in another terminal**

Run: `npm run dev`
Expected: Server listening on `localhost:4321`.

- [ ] **Step 2: Run the existing seasons API tests as a baseline**

Run: `npm run test:api -- tests/api/admin/seasons.test.ts`
Expected: All existing tests PASS (this is the back-compat baseline).

- [ ] **Step 3: Update the Zod schema to accept the new optional fields**

In `src/pages/api/admin/seasons.ts`, replace the `seasonSchema` definition (lines 13–28) with:

```ts
const scaffoldSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("empty") }),
  z.object({ type: z.literal("clone"), sourceSeasonId: z.string().uuid() }),
  z.object({ type: z.literal("bulk"), count: z.number().int().min(0).max(50) }),
]);

const seasonSchema = z.object({
  programId: z.string().uuid("Invalid program"),
  ageGroupId: z.string().uuid().optional().nullable(),
  venueId: z.string().uuid().optional().nullable(),
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  registrationOpens: z.string().optional().nullable(),
  registrationCloses: z.string().optional().nullable(),
  maxParticipants: z.number().int().positive().optional().nullable(),
  priceCents: z.number().int().min(0, "Price must be positive"),
  depositCents: z.number().int().min(0).optional().nullable(),
  allowDeposit: z.boolean().default(true),
  status: z.enum(["draft", "open", "closed", "active", "completed", "cancelled"]).default("draft"),
  scheduleNotes: z.string().optional().nullable(),
  scaffold: scaffoldSchema.optional(),
});
```

- [ ] **Step 4: Thread `venueId` through the existing POST insert**

In the same file, find the `await getDb().insert(seasons).values({...})` block in the POST handler (around line 110). Add `venueId: data.venueId || null,` after `ageGroupId: data.ageGroupId || null,`.

Also update the PUT handler's `.update(seasons).set({...})` block to include `venueId: validData.venueId || null,` in the same position.

- [ ] **Step 5: Re-run the existing tests to confirm back-compat**

Run: `npm run test:api -- tests/api/admin/seasons.test.ts`
Expected: All existing tests still PASS. (Existing tests don't send `venueId` or `scaffold`; they should continue working unchanged.)

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/admin/seasons.ts
git commit -m "feat(api): accept optional venueId and scaffold on POST /api/admin/seasons"
```

---

### Task 4: TDD — `scaffold.type === "empty"` path

The empty path is functionally identical to omitting `scaffold` entirely. We add a test to lock this behavior in.

**Files:**
- Modify: `tests/api/admin/seasons.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/api/admin/seasons.test.ts`, add this `describe` block after the existing `POST - Create season` block (around line 75):

```ts
describe("POST - Scaffold modes", () => {
  it("creates a season with scaffold.type=empty and zero teams (201)", async () => {
    const slug = testSlug("season-empty");
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        programId,
        name: "Empty Scaffold Season",
        slug,
        startDate: "2026-09-01",
        endDate: "2026-12-15",
        priceCents: 10000,
        scaffold: { type: "empty" },
      }),
    });

    const json = await expectJson(res, 201);
    expect(json.season).toBeDefined();
    expect(json.teams).toEqual([]);

    // Cleanup
    await apiFetch(`${ENDPOINT}?id=${json.season.id}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm run test:api -- tests/api/admin/seasons.test.ts -t "scaffold.type=empty"`
Expected: FAIL — current API doesn't return a `teams` array; assertion `expect(json.teams).toEqual([])` fails.

- [ ] **Step 3: Update the POST handler to include `teams: []` in the response**

In `src/pages/api/admin/seasons.ts`, change the success response in POST from:

```ts
return new Response(JSON.stringify({ season: newSeason }), { status: 201 });
```

to:

```ts
return new Response(JSON.stringify({ season: newSeason, teams: [] }), { status: 201 });
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm run test:api -- tests/api/admin/seasons.test.ts -t "scaffold.type=empty"`
Expected: PASS.

- [ ] **Step 5: Re-run all seasons tests to confirm no regressions**

Run: `npm run test:api -- tests/api/admin/seasons.test.ts`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/api/admin/seasons.test.ts src/pages/api/admin/seasons.ts
git commit -m "feat(api): include teams[] in season POST response"
```

---

### Task 5: TDD — `scaffold.type === "bulk"` path

**Files:**
- Modify: `tests/api/admin/seasons.test.ts`
- Modify: `src/pages/api/admin/seasons.ts`

- [ ] **Step 1: Write the failing test**

Add to the `POST - Scaffold modes` describe block in `tests/api/admin/seasons.test.ts`:

```ts
it("creates 4 teams with scaffold.type=bulk count=4 (201)", async () => {
  const slug = testSlug("season-bulk");

  // Look up the program name and (optional) age group for naming assertions
  const progRes = await apiFetch("/api/admin/programs", {
    method: "GET",
    cookie: adminCookie,
  });
  const progJson = await expectJson(progRes, 200);
  const program = progJson.programs.find((p: any) => p.id === programId);
  expect(program).toBeDefined();

  const res = await apiFetch(ENDPOINT, {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      programId,
      name: "Bulk Scaffold Season",
      slug,
      startDate: "2026-09-01",
      endDate: "2026-12-15",
      priceCents: 10000,
      scaffold: { type: "bulk", count: 4 },
    }),
  });

  const json = await expectJson(res, 201);
  expect(json.teams).toHaveLength(4);
  // Names match "{Program} Team {N}" when no ageGroup, else "{Program} {AgeGroup} Team {N}"
  json.teams.forEach((t: any, i: number) => {
    expect(t.name).toMatch(new RegExp(`Team ${i + 1}$`));
    expect(t.seasonId).toBe(json.season.id);
  });

  // Cleanup
  await apiFetch(`${ENDPOINT}?id=${json.season.id}`, {
    method: "DELETE",
    cookie: adminCookie,
  });
});

it("rejects scaffold.type=bulk with count > 50 (400)", async () => {
  const res = await apiFetch(ENDPOINT, {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      programId,
      name: "Too Many",
      slug: testSlug("season-toomany"),
      startDate: "2026-09-01",
      endDate: "2026-12-15",
      priceCents: 10000,
      scaffold: { type: "bulk", count: 51 },
    }),
  });

  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm run test:api -- tests/api/admin/seasons.test.ts -t "bulk"`
Expected: Both FAIL — bulk path not implemented yet (returns empty teams array, count cap not enforced beyond Zod max which would already give 400, but we'll verify).

(Note: the count > 50 test may already pass via Zod validation. That's fine — TDD is about confirming behavior, and it's already correct from Task 3.)

- [ ] **Step 3: Update POST handler to wrap insert in a transaction and run the bulk path**

In `src/pages/api/admin/seasons.ts`, replace the POST handler's success path (the block from `const data = result.data;` through `return new Response(...)`) with:

```ts
const data = result.data;

// Need program details for team name prefix
const [program] = await getDb()
  .select({ id: programs.id, name: programs.name })
  .from(programs)
  .where(eq(programs.id, data.programId))
  .limit(1);

if (!program) {
  return new Response(JSON.stringify({ error: "Program not found" }), { status: 400 });
}

let ageGroupName: string | null = null;
if (data.ageGroupId) {
  const [ag] = await getDb()
    .select({ name: ageGroups.name })
    .from(ageGroups)
    .where(eq(ageGroups.id, data.ageGroupId))
    .limit(1);
  ageGroupName = ag?.name ?? null;
}

const result2 = await getDb().transaction(async (tx) => {
  const [newSeason] = await tx
    .insert(seasons)
    .values({
      programId: data.programId,
      ageGroupId: data.ageGroupId || null,
      venueId: data.venueId || null,
      name: data.name,
      slug: data.slug,
      startDate: data.startDate,
      endDate: data.endDate,
      registrationOpens: data.registrationOpens ? new Date(data.registrationOpens) : null,
      registrationCloses: data.registrationCloses ? new Date(data.registrationCloses) : null,
      maxParticipants: data.maxParticipants || null,
      priceCents: data.priceCents,
      depositCents: data.depositCents || null,
      allowDeposit: data.allowDeposit,
      status: data.status,
      scheduleNotes: data.scheduleNotes || null,
    })
    .returning();

  const scaffold = data.scaffold ?? { type: "empty" as const };
  let createdTeams: typeof teams.$inferSelect[] = [];

  if (scaffold.type === "bulk") {
    createdTeams = await bulkCreateTeams(tx, {
      targetSeasonId: newSeason.id,
      count: scaffold.count,
      programName: program.name,
      ageGroupName,
    });
  }
  // clone path: handled in Task 6

  return { season: newSeason, teams: createdTeams };
});

return new Response(JSON.stringify(result2), { status: 201 });
```

Add the necessary imports at the top of the file:

```ts
import { teams } from "@/lib/db/schema";
import { bulkCreateTeams } from "@/lib/seasons/scaffold";
```

(`programs`, `ageGroups`, `seasons`, `eq` are already imported.)

- [ ] **Step 4: Run the bulk tests to confirm they pass**

Run: `npm run test:api -- tests/api/admin/seasons.test.ts -t "bulk"`
Expected: Both PASS.

- [ ] **Step 5: Re-run all seasons tests to confirm no regressions**

Run: `npm run test:api -- tests/api/admin/seasons.test.ts`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/api/admin/seasons.test.ts src/pages/api/admin/seasons.ts
git commit -m "feat(api): scaffold.type=bulk creates N auto-named teams in transaction"
```

---

### Task 6: TDD — `scaffold.type === "clone"` path

**Files:**
- Modify: `tests/api/admin/seasons.test.ts`
- Modify: `src/pages/api/admin/seasons.ts`

- [ ] **Step 1: Write the failing tests**

Add to the `POST - Scaffold modes` describe block:

```ts
it("clones teams from a source season (201)", async () => {
  // Arrange: create a source season and 3 teams in it
  const sourceSlug = testSlug("season-clone-src");
  const sourceRes = await apiFetch(ENDPOINT, {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      programId,
      name: "Clone Source Season",
      slug: sourceSlug,
      startDate: "2025-09-01",
      endDate: "2025-12-15",
      priceCents: 10000,
      scaffold: { type: "bulk", count: 3 },
    }),
  });
  const sourceJson = await expectJson(sourceRes, 201);
  const sourceTeamNames = sourceJson.teams.map((t: any) => t.name).sort();

  // Act: clone into a new season
  const cloneSlug = testSlug("season-clone-dst");
  const cloneRes = await apiFetch(ENDPOINT, {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      programId,
      name: "Clone Target Season",
      slug: cloneSlug,
      startDate: "2026-09-01",
      endDate: "2026-12-15",
      priceCents: 12000, // intentionally different — pricing comes from form, not clone
      scaffold: { type: "clone", sourceSeasonId: sourceJson.season.id },
    }),
  });

  const cloneJson = await expectJson(cloneRes, 201);
  expect(cloneJson.teams).toHaveLength(3);
  expect(cloneJson.teams.map((t: any) => t.name).sort()).toEqual(sourceTeamNames);
  expect(cloneJson.season.priceCents).toBe(12000);
  expect(cloneJson.season.status).toBe("draft");

  // Cleanup
  await apiFetch(`${ENDPOINT}?id=${cloneJson.season.id}`, {
    method: "DELETE",
    cookie: adminCookie,
  });
  await apiFetch(`${ENDPOINT}?id=${sourceJson.season.id}`, {
    method: "DELETE",
    cookie: adminCookie,
  });
});

it("rejects clone from a different program (400)", async () => {
  // Find a second program if available; skip otherwise
  const progsRes = await apiFetch("/api/admin/programs", {
    method: "GET",
    cookie: adminCookie,
  });
  const progsJson = await expectJson(progsRes, 200);
  const otherProgram = progsJson.programs.find((p: any) => p.id !== programId);
  if (!otherProgram) {
    console.warn("Skipping cross-program clone test: only one program seeded");
    return;
  }

  // Create a source season under the other program
  const sourceRes = await apiFetch(ENDPOINT, {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      programId: otherProgram.id,
      name: "Other Program Source",
      slug: testSlug("other-prog-src"),
      startDate: "2025-09-01",
      endDate: "2025-12-15",
      priceCents: 10000,
      scaffold: { type: "bulk", count: 2 },
    }),
  });
  const sourceJson = await expectJson(sourceRes, 201);

  // Try to clone into our program — should 400
  const res = await apiFetch(ENDPOINT, {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      programId, // different from sourceJson.season's program
      name: "Cross Program Clone",
      slug: testSlug("cross-prog-clone"),
      startDate: "2026-09-01",
      endDate: "2026-12-15",
      priceCents: 10000,
      scaffold: { type: "clone", sourceSeasonId: sourceJson.season.id },
    }),
  });

  expect(res.status).toBe(400);

  // Cleanup
  await apiFetch(`${ENDPOINT}?id=${sourceJson.season.id}`, {
    method: "DELETE",
    cookie: adminCookie,
  });
});
```

- [ ] **Step 2: Run the clone tests to confirm they fail**

Run: `npm run test:api -- tests/api/admin/seasons.test.ts -t "clone"`
Expected: First test FAILS (no clone path → returns empty teams). Second test FAILS or passes by accident (clone path is a no-op currently); we want it to explicitly 400.

- [ ] **Step 3: Implement the clone path with cross-program validation**

In `src/pages/api/admin/seasons.ts`, in the POST handler's transaction block, find the `// clone path: handled in Task 6` comment and replace it with:

```ts
if (scaffold.type === "clone") {
  // Validate source belongs to the same program
  const [source] = await tx
    .select({ id: seasons.id, programId: seasons.programId })
    .from(seasons)
    .where(eq(seasons.id, scaffold.sourceSeasonId))
    .limit(1);

  if (!source) {
    throw new ScaffoldError(400, "Source season not found");
  }
  if (source.programId !== data.programId) {
    throw new ScaffoldError(400, "Source season belongs to a different program");
  }

  createdTeams = await cloneSeasonTeams(tx, {
    sourceSeasonId: scaffold.sourceSeasonId,
    targetSeasonId: newSeason.id,
  });
}
```

Add this near the top of the file (above the POST handler):

```ts
class ScaffoldError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
```

Update the imports to include `cloneSeasonTeams`:

```ts
import { bulkCreateTeams, cloneSeasonTeams } from "@/lib/seasons/scaffold";
```

Wrap the entire POST try/catch to translate `ScaffoldError` into proper HTTP responses. Update the catch block at the bottom of POST:

```ts
} catch (error: any) {
  console.error("Error creating season:", error);
  if (error instanceof ScaffoldError) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.status });
  }
  if (getDbErrorCode(error) === "23505") {
    return new Response(JSON.stringify({ error: "A season with this slug already exists for this program" }), { status: 409 });
  }
  return new Response(JSON.stringify({ error: "Failed to create season" }), { status: 500 });
}
```

- [ ] **Step 4: Run the clone tests to confirm they pass**

Run: `npm run test:api -- tests/api/admin/seasons.test.ts -t "clone"`
Expected: Both PASS.

- [ ] **Step 5: Re-run all seasons tests to confirm no regressions**

Run: `npm run test:api -- tests/api/admin/seasons.test.ts`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/api/admin/seasons.test.ts src/pages/api/admin/seasons.ts
git commit -m "feat(api): scaffold.type=clone copies teams from source season"
```

---

### Task 7: TDD — venue cross-location validation

**Files:**
- Modify: `tests/api/admin/seasons.test.ts`
- Modify: `src/pages/api/admin/seasons.ts`

- [ ] **Step 1: Write the failing test**

Add a new describe block to `tests/api/admin/seasons.test.ts`:

```ts
describe("POST - Venue validation", () => {
  it("rejects venue belonging to a different location than the program (400)", async () => {
    // Arrange: find a venue NOT in the program's location
    // First find the program's location
    const progsRes = await apiFetch("/api/admin/programs", {
      method: "GET",
      cookie: adminCookie,
    });
    const progsJson = await expectJson(progsRes, 200);
    const program = progsJson.programs.find((p: any) => p.id === programId);
    expect(program).toBeDefined();
    const programLocationId = program.location.id;

    // Find a venue at a different location, or skip if none exists
    const venuesRes = await apiFetch("/api/admin/venues", {
      method: "GET",
      cookie: adminCookie,
    });
    const venuesJson = await expectJson(venuesRes, 200);
    const otherVenue = venuesJson.venues?.find(
      (v: any) => v.locationId !== programLocationId
    );
    if (!otherVenue) {
      console.warn("Skipping cross-location venue test: only one location seeded");
      return;
    }

    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        programId,
        name: "Bad Venue Season",
        slug: testSlug("bad-venue"),
        startDate: "2026-09-01",
        endDate: "2026-12-15",
        priceCents: 10000,
        venueId: otherVenue.id,
        scaffold: { type: "empty" },
      }),
    });

    expect(res.status).toBe(400);

    // Verify no season row was created (rollback)
    const listRes = await apiFetch(ENDPOINT, { method: "GET", cookie: adminCookie });
    const listJson = await expectJson(listRes, 200);
    const found = listJson.seasons.find((s: any) => s.name === "Bad Venue Season");
    expect(found).toBeUndefined();
  });

  it("accepts venue belonging to the program's location (201)", async () => {
    const progsRes = await apiFetch("/api/admin/programs", {
      method: "GET",
      cookie: adminCookie,
    });
    const progsJson = await expectJson(progsRes, 200);
    const program = progsJson.programs.find((p: any) => p.id === programId);
    const programLocationId = program.location.id;

    const venuesRes = await apiFetch("/api/admin/venues", {
      method: "GET",
      cookie: adminCookie,
    });
    const venuesJson = await expectJson(venuesRes, 200);
    const matchingVenue = venuesJson.venues?.find(
      (v: any) => v.locationId === programLocationId
    );
    if (!matchingVenue) {
      console.warn("Skipping matching-location venue test: no venue seeded for program's location");
      return;
    }

    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        programId,
        name: "Good Venue Season",
        slug: testSlug("good-venue"),
        startDate: "2026-09-01",
        endDate: "2026-12-15",
        priceCents: 10000,
        venueId: matchingVenue.id,
        scaffold: { type: "empty" },
      }),
    });

    const json = await expectJson(res, 201);
    expect(json.season.venueId).toBe(matchingVenue.id);

    // Cleanup
    await apiFetch(`${ENDPOINT}?id=${json.season.id}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
  });
});
```

- [ ] **Step 2: Run the venue tests to confirm they fail**

Run: `npm run test:api -- tests/api/admin/seasons.test.ts -t "Venue validation"`
Expected: First test FAILS — bad venue is currently accepted because no validation exists.

- [ ] **Step 3: Implement the validation inside the transaction**

In `src/pages/api/admin/seasons.ts`, inside the POST handler's transaction block, immediately after the `[newSeason]` insert (before the scaffold dispatch), add:

```ts
if (data.venueId) {
  const [venue] = await tx
    .select({ locationId: venues.locationId })
    .from(venues)
    .where(eq(venues.id, data.venueId))
    .limit(1);

  if (!venue) {
    throw new ScaffoldError(400, "Venue not found");
  }
  if (venue.locationId !== program.locationId) {
    throw new ScaffoldError(400, "Venue does not belong to the program's location");
  }
}
```

Add `venues` to the imports:

```ts
import { teams, venues } from "@/lib/db/schema";
```

The earlier `program` lookup (Task 5, Step 3) only selected `{ id, name }`. Update it to also select `locationId`:

```ts
const [program] = await getDb()
  .select({ id: programs.id, name: programs.name, locationId: programs.locationId })
  .from(programs)
  .where(eq(programs.id, data.programId))
  .limit(1);
```

- [ ] **Step 4: Run the venue tests to confirm they pass**

Run: `npm run test:api -- tests/api/admin/seasons.test.ts -t "Venue validation"`
Expected: Both PASS (or `console.warn` skips if test data lacks the needed venues).

- [ ] **Step 5: Run the full seasons test file to verify no regressions**

Run: `npm run test:api -- tests/api/admin/seasons.test.ts`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/api/admin/seasons.test.ts src/pages/api/admin/seasons.ts
git commit -m "feat(api): validate venue belongs to program's location, rollback on mismatch"
```

---

### Task 8: Build the SeasonScaffoldPicker component

This component is pure UI — no network calls. It receives prior seasons as a prop and reports the user's selection back through an `onChange` callback. The parent dialog wires it up.

**Files:**
- Create: `src/components/admin/season-scaffold-picker.tsx`

- [ ] **Step 1: Create the component file**

```tsx
"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type ScaffoldChoice =
  | { type: "empty" }
  | { type: "clone"; sourceSeasonId: string }
  | { type: "bulk"; count: number }

interface PriorSeason {
  id: string
  name: string
  startDate: string
}

interface Props {
  priorSeasons: PriorSeason[]
  value: ScaffoldChoice
  onChange: (choice: ScaffoldChoice) => void
  /** Called whenever a clone source is selected, so the parent can pre-fill form fields. */
  onCloneSourceSelected?: (sourceSeasonId: string) => void
}

export function SeasonScaffoldPicker({
  priorSeasons,
  value,
  onChange,
  onCloneSourceSelected,
}: Props) {
  const [bulkCount, setBulkCount] = useState(value.type === "bulk" ? value.count : 0)

  // When prior seasons load, default to "clone" if any exist
  useEffect(() => {
    if (priorSeasons.length > 0 && value.type === "empty") {
      const newest = priorSeasons[0]
      onChange({ type: "clone", sourceSeasonId: newest.id })
      onCloneSourceSelected?.(newest.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priorSeasons.length])

  return (
    <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
      <Label className="text-sm font-semibold">Starting structure</Label>

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="scaffold-mode"
            checked={value.type === "clone"}
            disabled={priorSeasons.length === 0}
            onChange={() => {
              if (priorSeasons.length > 0) {
                const id = priorSeasons[0].id
                onChange({ type: "clone", sourceSeasonId: id })
                onCloneSourceSelected?.(id)
              }
            }}
          />
          <span className={priorSeasons.length === 0 ? "text-muted-foreground" : ""}>
            Clone from a previous season
            {priorSeasons.length === 0 && " (none available)"}
          </span>
        </label>

        {value.type === "clone" && (
          <div className="ml-6 space-y-2">
            <Select
              value={value.sourceSeasonId}
              onValueChange={(id) => {
                onChange({ type: "clone", sourceSeasonId: id })
                onCloneSourceSelected?.(id)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorSeasons.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.startDate})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="scaffold-mode"
            checked={value.type === "bulk"}
            onChange={() => onChange({ type: "bulk", count: bulkCount })}
          />
          <span>Bulk-create teams</span>
        </label>

        {value.type === "bulk" && (
          <div className="ml-6 space-y-2">
            <Label htmlFor="bulk-count" className="text-sm">How many teams?</Label>
            <Input
              id="bulk-count"
              type="number"
              min={0}
              max={50}
              value={bulkCount}
              onChange={(e) => {
                const n = parseInt(e.target.value || "0", 10)
                setBulkCount(n)
                onChange({ type: "bulk", count: n })
              }}
              className="w-32"
            />
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="scaffold-mode"
            checked={value.type === "empty"}
            onChange={() => onChange({ type: "empty" })}
          />
          <span>Empty season (no teams)</span>
        </label>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/season-scaffold-picker.tsx
git commit -m "feat(admin): add SeasonScaffoldPicker component"
```

---

### Task 9: Wire the SeasonScaffoldPicker and venue picker into seasons-list dialog

**Files:**
- Modify: `src/components/admin/seasons-list.tsx`

- [ ] **Step 1: Add the new state, types, and venue fetching**

In `src/components/admin/seasons-list.tsx`, add the import and types after the existing imports:

```tsx
import { SeasonScaffoldPicker, type ScaffoldChoice } from "./season-scaffold-picker"

interface Venue {
  id: string
  name: string
  locationId: string
}
```

Add `venueId` to the existing `Season` interface (around line 21):

```tsx
venueId: string | null
```

Update the `formData` initial state and useState to include the new fields. Replace the `useState({...})` block at line 71 with:

```tsx
const [venues, setVenues] = useState<Venue[]>([])
const [scaffold, setScaffold] = useState<ScaffoldChoice>({ type: "empty" })
const [formData, setFormData] = useState({
  programId: "",
  ageGroupId: "",
  venueId: "",
  name: "",
  slug: "",
  startDate: "",
  endDate: "",
  maxParticipants: "",
  priceCents: "",
  depositCents: "",
  allowDeposit: true,
  status: "draft",
  scheduleNotes: "",
})
```

- [ ] **Step 2: Fetch venues alongside other data**

Update the `fetchData` function (around line 90) to also fetch venues:

```tsx
async function fetchData() {
  try {
    const [seasonsRes, programsRes, ageGroupsRes, venuesRes] = await Promise.all([
      fetch("/api/admin/seasons"),
      fetch("/api/admin/programs"),
      fetch("/api/admin/age-groups"),
      fetch("/api/admin/venues"),
    ])

    if (!seasonsRes.ok || !programsRes.ok || !ageGroupsRes.ok || !venuesRes.ok) {
      throw new Error("Failed to fetch data")
    }

    const [seasonsData, programsData, ageGroupsData, venuesData] = await Promise.all([
      seasonsRes.json(),
      programsRes.json(),
      ageGroupsRes.json(),
      venuesRes.json(),
    ])

    setSeasons(seasonsData.seasons)
    setPrograms(programsData.programs)
    setAgeGroups(ageGroupsData.ageGroups)
    setVenues(venuesData.venues || [])
  } catch (err) {
    setError("Failed to load data")
    console.error(err)
  } finally {
    setIsLoading(false)
  }
}
```

- [ ] **Step 3: Reset scaffold and venueId when opening the dialogs**

Update `openCreateDialog` (around line 119) — add `venueId: ""` to formData and reset scaffold:

```tsx
function openCreateDialog() {
  setEditingSeason(null)
  const today = new Date().toISOString().split("T")[0]
  setFormData({
    programId: programs[0]?.id || "",
    ageGroupId: "",
    venueId: "",
    name: "",
    slug: "",
    startDate: today,
    endDate: today,
    maxParticipants: "",
    priceCents: "",
    depositCents: "",
    allowDeposit: true,
    status: "draft",
    scheduleNotes: "",
  })
  setScaffold({ type: "empty" })
  setIsDialogOpen(true)
}
```

Update `openEditDialog` (around line 139) similarly to include `venueId: season.venueId || ""` and reset scaffold (scaffold doesn't apply to edits but reset for cleanliness):

```tsx
function openEditDialog(season: Season) {
  setEditingSeason(season)
  setFormData({
    programId: season.program.id,
    ageGroupId: season.ageGroup?.id || "",
    venueId: season.venueId || "",
    name: season.name,
    slug: season.slug,
    startDate: season.startDate,
    endDate: season.endDate,
    maxParticipants: season.maxParticipants?.toString() || "",
    priceCents: (season.priceCents / 100).toString(),
    depositCents: season.depositCents ? (season.depositCents / 100).toString() : "",
    allowDeposit: season.allowDeposit,
    status: season.status,
    scheduleNotes: season.scheduleNotes || "",
  })
  setScaffold({ type: "empty" })
  setIsDialogOpen(true)
}
```

- [ ] **Step 4: Add the clone-source pre-fill handler**

Add this handler function inside the component (just above `handleSubmit`):

```tsx
function handleCloneSourceSelected(sourceSeasonId: string) {
  const source = seasons.find((s) => s.id === sourceSeasonId)
  if (!source) return
  setFormData((prev) => ({
    ...prev,
    ageGroupId: source.ageGroup?.id || "",
    venueId: source.venueId || "",
    maxParticipants: source.maxParticipants?.toString() || "",
    priceCents: (source.priceCents / 100).toString(),
    depositCents: source.depositCents ? (source.depositCents / 100).toString() : "",
    allowDeposit: source.allowDeposit,
    scheduleNotes: source.scheduleNotes || "",
  }))
}
```

- [ ] **Step 5: Update handleSubmit to include scaffold and venueId**

Modify the `body` constructed in `handleSubmit` (around line 173) to include the new fields:

```tsx
const body = {
  ...(editingSeason ? { id: editingSeason.id } : {}),
  programId: formData.programId,
  ageGroupId: formData.ageGroupId || null,
  venueId: formData.venueId || null,
  name: formData.name,
  slug: formData.slug,
  startDate: formData.startDate,
  endDate: formData.endDate,
  maxParticipants: formData.maxParticipants ? parseInt(formData.maxParticipants) : null,
  priceCents: Math.round(parseFloat(formData.priceCents || "0") * 100),
  depositCents: formData.depositCents ? Math.round(parseFloat(formData.depositCents) * 100) : null,
  allowDeposit: formData.allowDeposit,
  status: formData.status,
  scheduleNotes: formData.scheduleNotes || null,
  ...(editingSeason ? {} : { scaffold }),
}
```

- [ ] **Step 6: Compute prior seasons for the picker (memoized in render)**

Inside the component, near the other derived values, add:

```tsx
const priorSeasons = formData.programId
  ? seasons
      .filter((s) => s.program.id === formData.programId)
      .map((s) => ({ id: s.id, name: s.name, startDate: s.startDate }))
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
  : []

const venuesForProgram = (() => {
  const program = programs.find((p) => p.id === formData.programId)
  // Programs don't expose locationId in the current API; just show all venues for now
  // (Server-side validation in Task 7 enforces correctness.)
  return venues
})()
```

- [ ] **Step 7: Render the picker and the venue field in the dialog**

Inside the `<form onSubmit={handleSubmit}>` block, immediately after the error banner and before the `<div className="space-y-4">` that holds form fields, render the picker (only for create mode):

```tsx
{!editingSeason && (
  <div className="mb-4">
    <SeasonScaffoldPicker
      priorSeasons={priorSeasons}
      value={scaffold}
      onChange={setScaffold}
      onCloneSourceSelected={handleCloneSourceSelected}
    />
  </div>
)}
```

Add the venue picker inside the `<div className="space-y-4">` block, right after the existing Age Group picker:

```tsx
<div className="space-y-2">
  <Label>Venue</Label>
  <Select
    value={formData.venueId}
    onValueChange={(v) => setFormData((prev) => ({ ...prev, venueId: v }))}
  >
    <SelectTrigger>
      <SelectValue placeholder="Select venue (optional)" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="">No venue assigned</SelectItem>
      {venuesForProgram.map((v) => (
        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Smoke-test in the browser**

In the dev server (already running), open `http://localhost:4321/admin/seasons` (sign in as admin if needed: `admin@test.aspiresports.com` / `TestAdmin123!`).

Click "Add Season". Verify:
1. The "Starting structure" picker appears at the top with three radio options.
2. If prior seasons exist for the default program, "Clone from previous" is preselected and a season dropdown appears.
3. Switching to "Bulk-create teams" reveals the count input.
4. Switching to "Empty" hides both sub-forms.
5. The Venue dropdown appears in the main form.
6. Selecting a clone source pre-fills price, deposit, max spots.
7. Submitting with each mode creates a season; verify in the list.

If anything is broken, fix and re-test before commit.

- [ ] **Step 10: Commit**

```bash
git add src/components/admin/seasons-list.tsx
git commit -m "feat(admin): wire scaffold picker and venue picker into seasons dialog"
```

---

### Task 10: E2E Playwright test for the clone path

**Files:**
- Create: `tests/seasons-scaffold.spec.ts`

- [ ] **Step 1: Look at an existing Playwright test to match conventions**

Run: `head -40 tests/admin-dashboard.spec.ts`
Note the test setup pattern (login, navigation, selectors). Reuse this style.

- [ ] **Step 2: Write the E2E test**

Create `tests/seasons-scaffold.spec.ts`:

```ts
import { test, expect } from "@playwright/test"

test.describe("Season scaffolding", () => {
  test.beforeEach(async ({ page }) => {
    // Sign in as admin
    await page.goto("/signin")
    await page.fill('input[name="email"]', "admin@test.aspiresports.com")
    await page.fill('input[name="password"]', "TestAdmin123!")
    await page.click('button[type="submit"]')
    await page.waitForURL("**/admin", { timeout: 10000 })
  })

  test("clones teams from a prior season via the New Season dialog", async ({ page }) => {
    await page.goto("/admin/seasons")

    // First create a source season via API to ensure we have something to clone
    const sourceName = `E2E Source ${Date.now()}`
    const sourceSlug = `e2e-source-${Date.now()}`

    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")

    // Get a program to attach to
    const progsRes = await page.request.get("/api/admin/programs", {
      headers: { Cookie: cookieHeader },
    })
    const progsJson = await progsRes.json()
    const programId = progsJson.programs[0].id

    // Create source season with 3 teams
    const sourceRes = await page.request.post("/api/admin/seasons", {
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      data: {
        programId,
        name: sourceName,
        slug: sourceSlug,
        startDate: "2025-09-01",
        endDate: "2025-12-15",
        priceCents: 10000,
        scaffold: { type: "bulk", count: 3 },
      },
    })
    expect(sourceRes.status()).toBe(201)
    const sourceJson = await sourceRes.json()

    try {
      // Reload the page so the new source season appears in the dropdown
      await page.reload()

      // Open New Season dialog
      await page.click('button:has-text("Add Season")')

      // The "Starting structure" picker should be present
      await expect(page.getByText("Starting structure")).toBeVisible()

      // "Clone from a previous season" should be the default selection
      const cloneRadio = page.locator('input[type="radio"]').nth(0)
      await expect(cloneRadio).toBeChecked()

      // Fill in required fields (clone source dropdown should already point to the newest)
      const targetName = `E2E Target ${Date.now()}`
      const targetSlug = `e2e-target-${Date.now()}`
      await page.fill('input[id="name"]', targetName)
      await page.fill('input[id="slug"]', targetSlug)
      await page.fill('input[id="startDate"]', "2026-09-01")
      await page.fill('input[id="endDate"]', "2026-12-15")
      // Price gets pre-filled from source; verify
      await expect(page.locator('input[id="priceCents"]')).toHaveValue("100")

      // Submit
      await page.click('button[type="submit"]:has-text("Add Season")')

      // Wait for dialog to close and list to refresh
      await expect(page.getByRole("heading", { name: targetName })).toBeVisible({ timeout: 5000 })

      // Cross-check via API: the new season should have 3 teams
      const listRes = await page.request.get("/api/admin/seasons", {
        headers: { Cookie: cookieHeader },
      })
      const listJson = await listRes.json()
      const newSeason = listJson.seasons.find((s: any) => s.name === targetName)
      expect(newSeason).toBeDefined()

      const teamsRes = await page.request.get(
        `/api/admin/teams?seasonId=${newSeason.id}`,
        { headers: { Cookie: cookieHeader } }
      )
      const teamsJson = await teamsRes.json()
      expect(teamsJson.teams).toHaveLength(3)

      // Cleanup: delete target
      await page.request.delete(`/api/admin/seasons?id=${newSeason.id}`, {
        headers: { Cookie: cookieHeader },
      })
    } finally {
      // Cleanup: delete source
      await page.request.delete(`/api/admin/seasons?id=${sourceJson.season.id}`, {
        headers: { Cookie: cookieHeader },
      })
    }
  })
})
```

- [ ] **Step 3: Run the test**

Run: `npx playwright test tests/seasons-scaffold.spec.ts`
Expected: PASS. (If it fails on selector mismatches, inspect with `npx playwright test --headed` and adjust selectors. The dev server must be running, or Playwright config must auto-start it.)

- [ ] **Step 4: Commit**

```bash
git add tests/seasons-scaffold.spec.ts
git commit -m "test(e2e): cover clone-from-previous flow end-to-end"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run the complete API test suite for seasons**

Run: `npm run test:api -- tests/api/admin/seasons.test.ts`
Expected: All tests PASS, including back-compat, empty, bulk, clone, and venue cases.

- [ ] **Step 2: Run a broader API test sweep to catch regressions in adjacent files**

Run: `npm run test:api -- tests/api/admin/teams.test.ts tests/api/admin/programs.test.ts tests/api/public/seasons.test.ts`
Expected: All PASS. (These touch the same schema area.)

- [ ] **Step 3: Type-check everything**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 4: Manual smoke test in browser — all three modes**

In the running dev server, at `http://localhost:4321/admin/seasons`:

1. Create a season using **bulk-create** with 3 teams. Confirm 3 auto-named teams appear after redirect.
2. Create a season using **clone** from the one you just made. Confirm 3 teams with matching names.
3. Create a season using **empty** mode. Confirm zero teams.
4. Try to clone with venue from a different location (if you have one) — confirm error toast.

If anything is wrong, fix and re-verify before declaring complete.

- [ ] **Step 5: Final commit if any cleanup was needed during smoke test**

```bash
git status
# If clean, no commit needed.
# If files changed, commit with a descriptive message.
```

---

## Self-Review Notes (filled in during plan-write)

- **Spec coverage:** All spec sections map to tasks. Schema → Task 1. Helper module → Task 2. Three scaffold paths → Tasks 4/5/6. Venue validation → Task 7. UI picker → Tasks 8/9. E2E → Task 10. Verification → Task 11.
- **Spec corrections during planning:** The spec referred to `tests/api/seasons.test.ts`; the actual path is `tests/api/admin/seasons.test.ts`. The plan uses the correct path. Also: there's no `GET /api/admin/venues?locationId=` filter endpoint as the spec speculated; the plan uses the existing `GET /api/admin/venues` and filters/validates client-side + server-side. If `/api/admin/venues` doesn't return `locationId`, Task 9 Step 1 will need a tweak — flag if you hit this.
- **Risk:** Tests assume seed data has at least one program and one venue. If the test database lacks these, tests will fail at setup. The existing seasons tests already make this assumption (line 28: `expect(json.programs.length).toBeGreaterThan(0)`), so we're consistent. The cross-program and cross-location tests gracefully skip with `console.warn` when test data is insufficient.
- **TDD ordering:** Each scaffold mode gets its own TDD cycle (test → impl → pass). Schema and helper module are non-TDD scaffolding because they're definitional (no behavior to test in isolation here that wouldn't be redundant with the API tests).
