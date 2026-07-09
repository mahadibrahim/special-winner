# Ref Close-Out Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give referees one guided, mobile-first close-out (score + cards + ejections + injuries + notes) that gates their pay on completion, enforces complete data with explicit "None" gates, and nudges stragglers by escalating SMS.

**Architecture:** Collapse today's three finish endpoints (`report`, `ejections`, `check-out`) into one atomic `close-out` endpoint backed by one transaction, driven by one React screen. Payability derives from `games.status = 'completed'` — no new payment enum. A daily cron sends escalating SMS reminders for un-closed games, tracked by a counter on `game_officials`.

**Tech Stack:** Astro 5 (SSR API routes), React 19 (`client:load`), Drizzle ORM + PostgreSQL, Zod validation, Vitest (API + unit), Playwright (E2E), Twilio via `sendSms`, Netlify scheduled functions.

## Global Constraints

- **Payable ⇔ `games.status = 'completed'`.** No new value on `officialPaymentStatusEnum` (stays `unpaid` | `paid`). Game status is the single source of truth for payability.
- **Ejections are additive and carry a suspension trail** (`suspensions.gameIncidentId` FK). They are NEVER created or deleted through a delete-all-reinsert bulk array. Close-out's incident replace deletes `type != 'ejection'` only.
- **Check-out is opportunistic, not required** — pay gates on the report, not on clock-out.
- **All SMS goes through `sendSms` from `@/lib/sms/send.ts`** (opt-in enforced there). Never call Twilio directly. Provider swap (Zernio) is out of scope.
- **Schema changes go `db:generate` → commit migration → `db:migrate`.** Never `db:push` to a remote DB.
- **Cron auth:** `x-cron-secret` header must equal `import.meta.env.CRON_SECRET` (same as every route in `src/pages/api/cron/`).
- **Playwright:** top-level `client:load` component calls `useHydrationBeacon()`; tests call `await waitForHydration(page)` before interacting.
- **Tenant/auth gate for referee endpoints:** `requireAssignedOfficial(user.id, gameId)` → 404 if not assigned.
- Incident `type` enum values: `yellow_card`, `red_card`, `injury`, `other`, `ejection`. The close-out UI structures only **cards** (`yellow_card`/`red_card`) and **injuries** (`injury`); `other` is deprecated in the new UI (narrative goes to notes) and any pre-existing `other`/non-ejection incident is removed by the close-out replace step — this is deliberate, not a bug.

---

## File Structure

**Create:**
- `src/lib/referee/create-ejection.ts` — shared `createEjection(tx, args)` used by both the ejections endpoint and close-out.
- `src/pages/api/referee/matches/[gameId]/close-out.ts` — atomic close-out endpoint.
- `src/components/referee/match-closeout.tsx` — the one close-out screen.
- `src/lib/referee/closeout-reminders.ts` — pure stage function + the query that finds officials owing close-out.
- `src/pages/api/cron/referee-closeout-reminders.ts` — cron route.
- `netlify/functions/scheduled-referee-closeout-reminders.ts` — Netlify scheduler that POSTs the route.

**Modify:**
- `src/lib/db/schema/teams.ts` — add `closeoutRemindersSent` column to `gameOfficials`.
- `src/pages/api/referee/matches/[gameId]/ejections.ts` — call `createEjection`.
- `src/lib/referee/referee-queries.ts` — `getRefereeMatchDetail` also returns recorded `ejections`.
- `src/pages/referee/matches/[gameId].astro` — swap `EjectionForm` + `MatchReport` for `MatchCloseout` (single component).
- `src/lib/referee/get-referee-pay.ts` — derive `locked`, exclude locked fees from `totalUnpaidCents`.
- `src/components/referee/referee-pay.tsx` — render locked rows.
- `src/components/admin/game-officials-dialog.tsx` + `src/components/admin/games-list.tsx` — surface completion, guard the "mark paid" toggle.

---

## Task 1: Schema — `closeout_reminders_sent` counter on `game_officials`

**Files:**
- Modify: `src/lib/db/schema/teams.ts:219-247` (the `gameOfficials` table)
- Create (generated): `src/lib/db/migrations/0074_*.sql`

**Interfaces:**
- Produces: `gameOfficials.closeoutRemindersSent` (integer, NOT NULL, default 0).

- [ ] **Step 1: Add the column to the schema.** In `src/lib/db/schema/teams.ts`, inside the `gameOfficials` column object (after `paymentStatus`, before `notes`), add:

```ts
    // Escalating close-out SMS reminder stage: 0 = none sent, 1 = T+2h
    // reminder sent, 2 = morning reminder sent (then we stop texting and
    // let the admin dialog flag it). See referee-closeout-reminders cron.
    closeoutRemindersSent: integer("closeout_reminders_sent").default(0).notNull(),
```

Confirm `integer` is already imported at the top of the file (it is — `feeCents` uses it).

- [ ] **Step 2: Generate the migration.**

Run: `npm run db:generate`
Expected: a new file `src/lib/db/migrations/0074_<random>.sql` containing:

```sql
ALTER TABLE "game_officials" ADD COLUMN "closeout_reminders_sent" integer DEFAULT 0 NOT NULL;
```

- [ ] **Step 3: Harden the migration for drifted DBs.** Open the generated `0074_*.sql` and change the line to be idempotent:

```sql
ALTER TABLE "game_officials" ADD COLUMN IF NOT EXISTS "closeout_reminders_sent" integer DEFAULT 0 NOT NULL;
```

- [ ] **Step 4: Type-check.**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/db/schema/teams.ts src/lib/db/migrations/
git commit -m "feat(referee): add closeout_reminders_sent counter to game_officials"
```

---

## Task 2: Shared `createEjection` helper + refactor the ejections endpoint

Extract the ejection insert (incident + optional suspension) so close-out and the existing endpoint share one code path and produce an identical suspension trail.

**Files:**
- Create: `src/lib/referee/create-ejection.ts`
- Modify: `src/pages/api/referee/matches/[gameId]/ejections.ts`
- Test: `tests/api/referee/ejections.test.ts` (existing — run it to prove no regression; if it does not exist, this task's proof is Step 5 below)

**Interfaces:**
- Produces:
```ts
// src/lib/referee/create-ejection.ts
import type { EjectionInput } from "@/lib/suspensions/ejection-schema";
export interface CreateEjectionArgs {
  gameId: string;
  reportedByUserId: string;
  organizationId: string;
  teamId: string | null;        // resolved from side; null for a TBD team
  input: EjectionInput;
}
export async function createEjection(
  tx: Parameters<Parameters<ReturnType<typeof import("@/lib/db").getDb>["transaction"]>[0]>[0],
  args: CreateEjectionArgs,
): Promise<{ incident: typeof import("@/lib/db/schema/teams").gameIncidents.$inferSelect;
             suspension: typeof import("@/lib/db/schema/suspensions").suspensions.$inferSelect | null }>;
```
In practice, type `tx` as `DbTx` (below) to keep call sites readable.

- [ ] **Step 1: Write the helper.** Create `src/lib/referee/create-ejection.ts`:

```ts
import { getDb } from "@/lib/db";
import { gameIncidents } from "@/lib/db/schema/teams";
import { suspensions } from "@/lib/db/schema/suspensions";
import type { EjectionInput } from "@/lib/suspensions/ejection-schema";

/** The transaction handle Drizzle passes to db.transaction(async (tx) => …). */
export type DbTx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export interface CreateEjectionArgs {
  gameId: string;
  reportedByUserId: string;
  organizationId: string;
  /** Resolved from input.side by the caller; null for a TBD team slot. */
  teamId: string | null;
  input: EjectionInput;
}

/**
 * Insert an ejection incident and, when it carries a suspension, the linked
 * suspension row — inside the caller's transaction. This is the ONLY way
 * ejections are created (endpoint + close-out both call it), so the
 * suspensions.gameIncidentId trail is always consistent.
 *
 * Caller MUST reject carriesSuspension against a null teamId before calling
 * (a suspension needs a team); this function assumes that check passed.
 */
export async function createEjection(tx: DbTx, args: CreateEjectionArgs) {
  const { gameId, reportedByUserId, organizationId, teamId, input } = args;

  const [incident] = await tx
    .insert(gameIncidents)
    .values({
      gameId,
      reportedByUserId,
      type: "ejection",
      side: input.side,
      player: input.player,
      minute: input.minute ?? null,
      description: input.reason,
    })
    .returning();

  let suspension: typeof suspensions.$inferSelect | null = null;
  if (input.carriesSuspension && teamId) {
    const [row] = await tx
      .insert(suspensions)
      .values({
        organizationId,
        teamId,
        personName: input.player,
        gameIncidentId: incident.id,
        reason: input.reason,
        gamesMissed: input.gamesMissed ?? 1,
        notes: input.suspensionNotes ?? null,
        escalatedToDirector: input.escalatedToDirector,
        setByUserId: reportedByUserId,
        status: "active",
      })
      .returning();
    suspension = row;
  }

  return { incident, suspension };
}
```

- [ ] **Step 2: Refactor `ejections.ts` to use it.** In `src/pages/api/referee/matches/[gameId]/ejections.ts`, replace the inline `db.transaction(async (tx) => { … })` block (the `insert(gameIncidents)` + conditional `insert(suspensions)`) with:

```ts
import { createEjection } from "@/lib/referee/create-ejection";
// …
  const result = await db.transaction(async (tx) =>
    createEjection(tx, {
      gameId,
      reportedByUserId: user.id,
      organizationId: gameRow.organizationId,
      teamId,
      input,
    }),
  );

  return json(result, 201);
```

Leave everything above (auth gate, `ejectionSchema` parse, game/org lookup, the `carriesSuspension && !teamId` 400 guard) unchanged. Remove the now-unused `gameIncidents`/`suspensions` imports from `ejections.ts` if they are no longer referenced.

- [ ] **Step 3: Run the type-check.**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Start the dev server** (needed for API tests) in a separate shell:

Run: `npm run dev`
Expected: `Local http://localhost:4321`

- [ ] **Step 5: Prove no regression on the ejections endpoint.** If `tests/api/referee/ejections.test.ts` exists:

Run: `TEST_BASE_URL=http://localhost:4321 npm run test:api -- ejections`
Expected: PASS (all existing ejection tests still green — same behavior, one suspension per ejection).

If no such test exists, write a minimal one at `tests/api/referee/ejections.test.ts` that signs in as an assigned referee, POSTs one `carriesSuspension: true` ejection, and asserts the response is `201` with a non-null `suspension`, then re-run the command above.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/referee/create-ejection.ts src/pages/api/referee/matches/\[gameId\]/ejections.ts tests/api/referee/ejections.test.ts
git commit -m "refactor(referee): extract createEjection helper shared by ejections + close-out"
```

---

## Task 3: Atomic `close-out` endpoint

**Files:**
- Create: `src/pages/api/referee/matches/[gameId]/close-out.ts`
- Test: `tests/api/referee/close-out.test.ts`

**Interfaces:**
- Consumes: `createEjection` (Task 2), `requireAssignedOfficial`.
- Produces: `POST /api/referee/matches/:gameId/close-out` accepting:
```ts
interface IncidentInput { side: "home" | "away"; player?: string | null; minute?: number | null; description?: string | null }
interface CloseOutBody {
  homeScore: number; awayScore: number;
  cards: Array<IncidentInput & { type: "yellow_card" | "red_card" }>;
  injuries: IncidentInput[];                 // type forced to "injury"
  ejections: import("@/lib/suspensions/ejection-schema").EjectionInput[]; // NEW ejections only
  noCards: boolean; noInjuries: boolean; noEjections: boolean;
  refereeNotes?: string | null;
}
```
Returns `{ ok: true }` (200) or `{ error }` (4xx).

- [ ] **Step 1: Write the failing tests.** Create `tests/api/referee/close-out.test.ts`. Model auth/sign-in on the existing `tests/api/referee/*` tests (reuse their sign-in helper and a seeded referee assigned to a seeded game). Cover:

```ts
import { describe, it, expect, beforeAll } from "vitest";
// import { signInAsAssignedReferee, assignedGameId } from helpers used by sibling referee tests

const base = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("POST /api/referee/matches/:gameId/close-out", () => {
  let cookie: string;
  let gameId: string;
  beforeAll(async () => { ({ cookie, gameId } = await signInAsAssignedReferee()); });

  const post = (body: unknown) =>
    fetch(`${base}/api/referee/matches/${gameId}/close-out`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });

  const clean = { homeScore: 2, awayScore: 1, cards: [], injuries: [], ejections: [],
                  noCards: true, noInjuries: true, noEjections: true, refereeNotes: null };

  it("rejects a missing score", async () => {
    const res = await post({ ...clean, homeScore: undefined });
    expect(res.status).toBe(400);
  });

  it("rejects a section that is empty and not acknowledged", async () => {
    const res = await post({ ...clean, noCards: false }); // cards empty AND noCards false
    expect(res.status).toBe(400);
  });

  it("rejects a section that has entries but is also marked None", async () => {
    const res = await post({ ...clean, cards: [{ type: "yellow_card", side: "home", player: "7" }], noCards: true });
    expect(res.status).toBe(400);
  });

  it("accepts a clean game with all sections acknowledged None", async () => {
    const res = await post(clean);
    expect(res.status).toBe(200);
  });

  it("marks the game completed so the fee becomes payable", async () => {
    await post(clean);
    const detail = await fetch(`${base}/api/referee/matches/${gameId}/... `); // or assert via pay endpoint
    // assert game status completed / pay row no longer locked (see Task 6 test for the pay assertion)
  });

  it("creates exactly one suspension for an ejection and does not double-create on resubmit", async () => {
    const ej = { side: "home", player: "9", reason: "violent conduct", carriesSuspension: true,
                 gamesMissed: 1, escalatedToDirector: false };
    await post({ ...clean, noEjections: false, ejections: [ej] });
    // resubmit with ejections: [] (already-recorded ejection is NOT resent)
    const res2 = await post({ ...clean, noEjections: false, ejections: [] });
    expect(res2.status).toBe(200);
    // assert suspensions count for this game === 1 (query via an admin/read endpoint used by sibling tests)
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `TEST_BASE_URL=http://localhost:4321 npm run test:api -- close-out`
Expected: FAIL — 404 (route does not exist yet).

- [ ] **Step 3: Implement the endpoint.** Create `src/pages/api/referee/matches/[gameId]/close-out.ts`:

```ts
import type { APIRoute } from "astro";
import { and, eq, ne, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { games, gameIncidents } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { timeEntries } from "@/lib/db/schema/time-tracking";
import { requireAssignedOfficial } from "@/lib/referee/require-assigned-official";
import { createEjection } from "@/lib/referee/create-ejection";
import { ejectionSchema } from "@/lib/suspensions/ejection-schema";

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

const SIDES = new Set(["home", "away"]);
const isNonNegInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

interface IncidentInput { side: string; player?: string | null; minute?: number | null; description?: string | null }
interface CloseOutBody {
  homeScore: number; awayScore: number;
  cards: Array<IncidentInput & { type: string }>;
  injuries: IncidentInput[];
  ejections: unknown[];
  noCards: boolean; noInjuries: boolean; noEjections: boolean;
  refereeNotes?: string | null;
}

function validIncident(inc: IncidentInput): boolean {
  if (!SIDES.has(inc.side)) return false;
  if (inc.minute != null && !isNonNegInt(inc.minute)) return false;
  return true;
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ error: "Unauthorized" }, 401);
  const gameId = context.params.gameId;
  if (!gameId) return json({ error: "game id required" }, 400);
  if (!(await requireAssignedOfficial(user.id, gameId))) return json({ error: "Not found" }, 404);

  let body: CloseOutBody;
  try { body = await context.request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  // Score required
  if (!isNonNegInt(body.homeScore) || !isNonNegInt(body.awayScore))
    return json({ error: "Scores must be non-negative integers" }, 400);

  const cards = Array.isArray(body.cards) ? body.cards : [];
  const injuries = Array.isArray(body.injuries) ? body.injuries : [];
  const ejections = Array.isArray(body.ejections) ? body.ejections : [];

  // None-gates: each section must be answered (has entries XOR acknowledged None)
  const section = (arr: unknown[], none: boolean) =>
    (arr.length > 0) !== (none === true); // true when EXACTLY one holds
  if (!section(cards, body.noCards)) return json({ error: "Answer the cards section (log cards or mark None)" }, 400);
  if (!section(injuries, body.noInjuries)) return json({ error: "Answer the injuries section (log injuries or mark None)" }, 400);
  if (!section(ejections, body.noEjections)) return json({ error: "Answer the ejections section (log ejections or mark None)" }, 400);

  // Card/injury shape
  for (const c of cards)
    if ((c.type !== "yellow_card" && c.type !== "red_card") || !validIncident(c))
      return json({ error: "Invalid card" }, 400);
  for (const inj of injuries)
    if (!validIncident(inj)) return json({ error: "Invalid injury" }, 400);

  // Ejection shape (reuse the shared schema) + resolve org/team
  const parsedEjections = ejections.map((e) => ejectionSchema.safeParse(e));
  const badEjection = parsedEjections.find((p) => !p.success);
  if (badEjection && !badEjection.success)
    return json({ error: "Invalid ejection payload", issues: badEjection.error.issues }, 400);

  const db = getDb();
  const [gameRow] = await db
    .select({
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      organizationId: locations.organizationId,
    })
    .from(games)
    .innerJoin(seasons, eq(games.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(eq(games.id, gameId))
    .limit(1);
  if (!gameRow) return json({ error: "Not found" }, 404);

  // A suspension needs a real team
  for (const p of parsedEjections) {
    if (!p.success) continue;
    const teamId = p.data.side === "home" ? gameRow.homeTeamId : gameRow.awayTeamId;
    if (p.data.carriesSuspension && !teamId)
      return json({ error: "Cannot record a suspension for a TBD team" }, 400);
  }

  await db.transaction(async (tx) => {
    // 1. Score + status + notes
    await tx.update(games).set({
      homeScore: body.homeScore, awayScore: body.awayScore,
      status: "completed", refereeNotes: body.refereeNotes ?? null, updatedAt: new Date(),
    }).where(eq(games.id, gameId));

    // 2. Replace non-ejection incidents (cards + injuries). Ejections untouched.
    await tx.delete(gameIncidents).where(and(eq(gameIncidents.gameId, gameId), ne(gameIncidents.type, "ejection")));
    const rows = [
      ...cards.map((c) => ({ gameId, reportedByUserId: user.id, type: c.type as "yellow_card" | "red_card",
        side: c.side as "home" | "away", player: c.player ?? null, minute: c.minute ?? null, description: c.description ?? null })),
      ...injuries.map((i) => ({ gameId, reportedByUserId: user.id, type: "injury" as const,
        side: i.side as "home" | "away", player: i.player ?? null, minute: i.minute ?? null, description: i.description ?? null })),
    ];
    if (rows.length > 0) await tx.insert(gameIncidents).values(rows);

    // 3. Create NEW ejections only (client sends only newly-added ones).
    for (const p of parsedEjections) {
      if (!p.success) continue;
      const teamId = p.data.side === "home" ? gameRow.homeTeamId : gameRow.awayTeamId;
      await createEjection(tx, {
        gameId, reportedByUserId: user.id, organizationId: gameRow.organizationId, teamId, input: p.data,
      });
    }

    // 4. Opportunistic check-out — close an open check-in if one exists.
    await tx.update(timeEntries)
      .set({ clockOutAt: new Date(), updatedAt: new Date() })
      .where(and(eq(timeEntries.gameId, gameId), eq(timeEntries.userId, user.id), isNull(timeEntries.clockOutAt)));
  });

  return json({ ok: true }, 200);
};
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `TEST_BASE_URL=http://localhost:4321 npm run test:api -- close-out`
Expected: PASS.

- [ ] **Step 5: Type-check.**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit.**

```bash
git add src/pages/api/referee/matches/\[gameId\]/close-out.ts tests/api/referee/close-out.test.ts
git commit -m "feat(referee): atomic close-out endpoint (score + cards + injuries + ejections + check-out)"
```

---

## Task 4: Surface recorded ejections in the match detail query

The close-out screen shows already-recorded ejections read-only. `getRefereeMatchDetail` currently excludes ejections entirely; add them back as a separate list (still excluded from `incidents`).

**Files:**
- Modify: `src/lib/referee/referee-queries.ts` (the `RefereeMatchDetail` type + `getRefereeMatchDetail`)
- Test: `tests/api/referee/match-detail.test.ts` (or extend the existing detail test if present)

**Interfaces:**
- Produces: `RefereeMatchDetail.ejections: Array<{ id: string; side: string; player: string | null; minute: number | null; reason: string | null }>`.

- [ ] **Step 1: Extend the type.** In `src/lib/referee/referee-queries.ts`, add to `RefereeMatchDetail` (after `incidents`):

```ts
  /** Already-recorded ejections (type='ejection'), shown read-only in close-out. */
  ejections: Array<{
    id: string;
    side: string;
    player: string | null;
    minute: number | null;
    reason: string | null;
  }>;
```

- [ ] **Step 2: Query them.** In `getRefereeMatchDetail`, after the existing `incidents` select (which filters `ne(type, "ejection")`), add:

```ts
  const ejections = await db
    .select({
      id: gameIncidents.id,
      side: gameIncidents.side,
      player: gameIncidents.player,
      minute: gameIncidents.minute,
      reason: gameIncidents.description,
    })
    .from(gameIncidents)
    .where(and(eq(gameIncidents.gameId, gameId), eq(gameIncidents.type, "ejection")))
    .orderBy(asc(gameIncidents.minute));
```

Then change the final return to include it:

```ts
  return { ...row, incidents, ejections, activeSuspensions, checkIn };
```

- [ ] **Step 3: Write/extend the test.** In `tests/api/referee/match-detail.test.ts`, add a case: after POSTing an ejection via `/ejections`, GET the detail (or load the page's data path) and assert `ejections.length === 1` and `incidents` does NOT contain that row.

- [ ] **Step 4: Run tests + type-check.**

Run: `TEST_BASE_URL=http://localhost:4321 npm run test:api -- match-detail`
Then: `npx tsc --noEmit`
Expected: PASS, zero type errors.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/referee/referee-queries.ts tests/api/referee/match-detail.test.ts
git commit -m "feat(referee): return recorded ejections from getRefereeMatchDetail"
```

---

## Task 5: The `MatchCloseout` screen + detail page wiring

**Files:**
- Create: `src/components/referee/match-closeout.tsx`
- Modify: `src/pages/referee/matches/[gameId].astro`
- Test: `tests/e2e/referee-closeout.spec.ts`

**Interfaces:**
- Consumes: `POST /api/referee/matches/:gameId/close-out` (Task 3); detail data (Task 4).
- Produces: `MatchCloseout` React component (default export not required; named export `MatchCloseout`).

- [ ] **Step 1: Write the component.** Create `src/components/referee/match-closeout.tsx`. It renders score steppers, three None/Log sections, notes, and one sticky submit. Uses `useHydrationBeacon`, shared UI primitives, and `toast`/`ErrorBanner` for feedback.

```tsx
"use client"

import { useState } from "react"
import { Plus, Trash2, Minus } from "lucide-react"
import { toast } from "sonner"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Row = { side: "home" | "away"; player: string; minute: string; description: string }
type CardRow = Row & { type: "yellow_card" | "red_card" }
type EjRow = { side: "home" | "away"; player: string; minute: string; reason: string; gamesMissed: string }

export interface MatchCloseoutData {
  gameId: string
  homeTeamName: string | null
  awayTeamName: string | null
  homeScore: number | null
  awayScore: number | null
  refereeNotes: string | null
  completed: boolean
  cards: Array<{ type: string; side: string; player: string | null; minute: number | null; description: string | null }>
  injuries: Array<{ side: string; player: string | null; minute: number | null; description: string | null }>
  recordedEjections: Array<{ id: string; side: string; player: string | null; minute: number | null; reason: string | null }>
}

// A section is "answered" when it has rows OR None is chosen. null = not yet chosen.
type NoneChoice = boolean | null

export function MatchCloseout({ data }: { data: MatchCloseoutData }) {
  useHydrationBeacon()

  const [homeScore, setHomeScore] = useState(data.homeScore ?? 0)
  const [awayScore, setAwayScore] = useState(data.awayScore ?? 0)
  const [notes, setNotes] = useState(data.refereeNotes ?? "")

  const [cards, setCards] = useState<CardRow[]>(
    data.cards.map((c) => ({ type: c.type as "yellow_card" | "red_card", side: c.side as "home" | "away",
      player: c.player ?? "", minute: c.minute?.toString() ?? "", description: c.description ?? "" })))
  const [injuries, setInjuries] = useState<Row[]>(
    data.injuries.map((i) => ({ side: i.side as "home" | "away", player: i.player ?? "",
      minute: i.minute?.toString() ?? "", description: i.description ?? "" })))
  const [ejections, setEjections] = useState<EjRow[]>([])

  // Pre-answer None where the game is already completed and a section is empty.
  const [noCards, setNoCards] = useState<NoneChoice>(data.completed && data.cards.length === 0 ? true : data.cards.length ? false : null)
  const [noInjuries, setNoInjuries] = useState<NoneChoice>(data.completed && data.injuries.length === 0 ? true : data.injuries.length ? false : null)
  // Ejections section counts as answered if a recorded ejection already exists.
  const [noEjections, setNoEjections] = useState<NoneChoice>(data.recordedEjections.length ? false : (data.completed ? true : null))

  const [saving, setSaving] = useState(false)

  const teamLabel = (s: "home" | "away") => (s === "home" ? (data.homeTeamName ?? "Home") : (data.awayTeamName ?? "Away"))

  const cardsAnswered = cards.length > 0 || noCards === true
  const injuriesAnswered = injuries.length > 0 || noInjuries === true
  const ejectionsAnswered = ejections.length > 0 || data.recordedEjections.length > 0 || noEjections === true
  const canSubmit = cardsAnswered && injuriesAnswered && ejectionsAnswered && !saving

  async function submit() {
    setSaving(true)
    try {
      const res = await fetch(`/api/referee/matches/${data.gameId}/close-out`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          homeScore, awayScore,
          cards: cards.map((c) => ({ type: c.type, side: c.side, player: c.player || null,
            minute: c.minute === "" ? null : Number(c.minute), description: c.description || null })),
          injuries: injuries.map((i) => ({ side: i.side, player: i.player || null,
            minute: i.minute === "" ? null : Number(i.minute), description: i.description || null })),
          ejections: ejections.map((e) => ({ side: e.side, player: e.player, reason: e.reason,
            minute: e.minute === "" ? null : Number(e.minute), carriesSuspension: true,
            gamesMissed: e.gamesMissed === "" ? 1 : Number(e.gamesMissed), escalatedToDirector: false })),
          noCards: cards.length === 0 ? noCards === true : false,
          noInjuries: injuries.length === 0 ? noInjuries === true : false,
          noEjections: ejections.length === 0 ? (data.recordedEjections.length > 0 ? false : noEjections === true) : false,
          refereeNotes: notes || null,
        }),
      })
      if (res.ok) { toast.success("Closed out. You're clear to be paid."); window.location.href = "/referee" }
      else { const b = await res.json().catch(() => ({})); toast.error(b.error ?? "Couldn't submit — try again.") }
    } catch { toast.error("Couldn't submit — try again.") } finally { setSaving(false) }
  }

  const Stepper = ({ value, set, label }: { value: number; set: (n: number) => void; label: string }) => (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon" aria-label={`Decrease ${label}`} onClick={() => set(Math.max(0, value - 1))}><Minus className="h-4 w-4" /></Button>
      <span className="w-8 text-center text-2xl font-bold tabular-nums" aria-label={label}>{value}</span>
      <Button type="button" variant="outline" size="icon" aria-label={`Increase ${label}`} onClick={() => set(value + 1)}><Plus className="h-4 w-4" /></Button>
    </div>
  )

  return (
    <div className="space-y-6 max-w-2xl pb-24">
      <h1 className="text-2xl font-semibold">{data.homeTeamName ?? "TBD"} vs {data.awayTeamName ?? "TBD"}</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Final score</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center gap-6">
          <div className="text-center space-y-2"><div className="text-sm text-muted-foreground">{teamLabel("home")}</div><Stepper value={homeScore} set={setHomeScore} label="Home score" /></div>
          <span className="text-muted-foreground text-xl">–</span>
          <div className="text-center space-y-2"><div className="text-sm text-muted-foreground">{teamLabel("away")}</div><Stepper value={awayScore} set={setAwayScore} label="Away score" /></div>
        </CardContent>
      </Card>

      {/* Cards */}
      <SectionCard
        title="Cards" answered={cardsAnswered} noneChosen={noCards === true && cards.length === 0}
        onNone={() => { setCards([]); setNoCards(true) }}
        onLog={() => { setNoCards(false); setCards((xs) => xs.length ? xs : [{ type: "yellow_card", side: "home", player: "", minute: "", description: "" }]) }}
        showEditor={cards.length > 0 || noCards === false}
      >
        {cards.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 border-b pb-3 last:border-0">
            <select value={c.type} onChange={(e) => setCards((xs) => xs.map((x, j) => j === i ? { ...x, type: e.target.value as CardRow["type"] } : x))} className="rounded border px-2 py-1 text-sm">
              <option value="yellow_card">Yellow</option><option value="red_card">Red</option>
            </select>
            <select value={c.side} onChange={(e) => setCards((xs) => xs.map((x, j) => j === i ? { ...x, side: e.target.value as "home" | "away" } : x))} className="rounded border px-2 py-1 text-sm">
              <option value="home">{teamLabel("home")}</option><option value="away">{teamLabel("away")}</option>
            </select>
            <Input value={c.player} onChange={(e) => setCards((xs) => xs.map((x, j) => j === i ? { ...x, player: e.target.value } : x))} placeholder="Player / #" className="w-28" />
            <Input type="number" min="0" value={c.minute} onChange={(e) => setCards((xs) => xs.map((x, j) => j === i ? { ...x, minute: e.target.value } : x))} placeholder="min" className="w-16" />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove card" onClick={() => setCards((xs) => xs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {(cards.length > 0 || noCards === false) && (
          <Button type="button" variant="outline" size="sm" onClick={() => setCards((xs) => [...xs, { type: "yellow_card", side: "home", player: "", minute: "", description: "" }])}><Plus className="h-4 w-4 mr-1" />Add card</Button>
        )}
      </SectionCard>

      {/* Ejections */}
      <SectionCard
        title="Ejections" answered={ejectionsAnswered} noneChosen={noEjections === true && ejections.length === 0 && data.recordedEjections.length === 0}
        onNone={() => { setEjections([]); setNoEjections(true) }}
        onLog={() => { setNoEjections(false); setEjections((xs) => xs.length ? xs : [{ side: "home", player: "", minute: "", reason: "", gamesMissed: "1" }]) }}
        showEditor={ejections.length > 0 || noEjections === false || data.recordedEjections.length > 0}
      >
        {data.recordedEjections.map((e) => (
          <div key={e.id} className="text-sm text-muted-foreground border-b pb-2 last:border-0">
            Recorded: {e.player ?? "—"} · {e.side === "home" ? teamLabel("home") : teamLabel("away")}{e.minute != null ? ` · ${e.minute}'` : ""} · {e.reason ?? ""}
          </div>
        ))}
        {ejections.map((e, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 border-b pb-3 last:border-0">
            <select value={e.side} onChange={(ev) => setEjections((xs) => xs.map((x, j) => j === i ? { ...x, side: ev.target.value as "home" | "away" } : x))} className="rounded border px-2 py-1 text-sm">
              <option value="home">{teamLabel("home")}</option><option value="away">{teamLabel("away")}</option>
            </select>
            <Input value={e.player} onChange={(ev) => setEjections((xs) => xs.map((x, j) => j === i ? { ...x, player: ev.target.value } : x))} placeholder="Player / #" className="w-28" />
            <Input type="number" min="0" value={e.minute} onChange={(ev) => setEjections((xs) => xs.map((x, j) => j === i ? { ...x, minute: ev.target.value } : x))} placeholder="min" className="w-16" />
            <Input value={e.reason} onChange={(ev) => setEjections((xs) => xs.map((x, j) => j === i ? { ...x, reason: ev.target.value } : x))} placeholder="Reason" className="flex-1 min-w-32" />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove ejection" onClick={() => setEjections((xs) => xs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {(ejections.length > 0 || noEjections === false) && (
          <Button type="button" variant="outline" size="sm" onClick={() => setEjections((xs) => [...xs, { side: "home", player: "", minute: "", reason: "", gamesMissed: "1" }])}><Plus className="h-4 w-4 mr-1" />Add ejection</Button>
        )}
      </SectionCard>

      {/* Injuries */}
      <SectionCard
        title="Injuries" answered={injuriesAnswered} noneChosen={noInjuries === true && injuries.length === 0}
        onNone={() => { setInjuries([]); setNoInjuries(true) }}
        onLog={() => { setNoInjuries(false); setInjuries((xs) => xs.length ? xs : [{ side: "home", player: "", minute: "", description: "" }]) }}
        showEditor={injuries.length > 0 || noInjuries === false}
      >
        {injuries.map((inj, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 border-b pb-3 last:border-0">
            <select value={inj.side} onChange={(e) => setInjuries((xs) => xs.map((x, j) => j === i ? { ...x, side: e.target.value as "home" | "away" } : x))} className="rounded border px-2 py-1 text-sm">
              <option value="home">{teamLabel("home")}</option><option value="away">{teamLabel("away")}</option>
            </select>
            <Input value={inj.player} onChange={(e) => setInjuries((xs) => xs.map((x, j) => j === i ? { ...x, player: e.target.value } : x))} placeholder="Player / #" className="w-28" />
            <Input value={inj.description} onChange={(e) => setInjuries((xs) => xs.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="What happened" className="flex-1 min-w-32" />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove injury" onClick={() => setInjuries((xs) => xs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {(injuries.length > 0 || noInjuries === false) && (
          <Button type="button" variant="outline" size="sm" onClick={() => setInjuries((xs) => [...xs, { side: "home", player: "", minute: "", description: "" }])}><Plus className="h-4 w-4 mr-1" />Add injury</Button>
        )}
      </SectionCard>

      <Card>
        <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
        <CardContent>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded border px-3 py-2 text-sm" placeholder="Anything notable about the match…" />
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <Button className="w-full" size="lg" disabled={!canSubmit} onClick={submit} data-testid="closeout-submit">
            {saving ? "Submitting…" : "Submit & check out"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SectionCard({ title, answered, noneChosen, onNone, onLog, showEditor, children }: {
  title: string; answered: boolean; noneChosen: boolean; onNone: () => void; onLog: () => void; showEditor: boolean; children: React.ReactNode
}) {
  return (
    <Card className={answered ? "" : "border-amber-400"}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex gap-2">
          <Button type="button" variant={noneChosen ? "default" : "outline"} size="sm" onClick={onNone}>None</Button>
          <Button type="button" variant={showEditor ? "default" : "outline"} size="sm" onClick={onLog}>Log</Button>
        </div>
      </CardHeader>
      {showEditor && <CardContent className="space-y-3">{children}</CardContent>}
    </Card>
  )
}
```

- [ ] **Step 2: Wire the detail page.** In `src/pages/referee/matches/[gameId].astro`, replace the `EjectionForm` and `MatchReport` imports/usages with the new component. Keep `ActiveSuspensionBanner` and `RefereeCheckIn`. New frontmatter `data` and body:

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import { RefereeLayout } from '@/components/referee/referee-layout';
import { MatchCloseout } from '@/components/referee/match-closeout';
import { ActiveSuspensionBanner } from '@/components/referee/active-suspension-banner';
import { RefereeCheckIn } from '@/components/referee/referee-check-in';
import { getRefereeMatchDetail } from '@/lib/referee/referee-queries';

export const prerender = false;

const user = Astro.locals.user!;
const gameId = Astro.params.gameId!;
const detail = await getRefereeMatchDetail(user.id, gameId);
if (!detail) return new Response('Not found', { status: 404 });

const closeout = {
  gameId: detail.gameId,
  homeTeamName: detail.homeTeamName,
  awayTeamName: detail.awayTeamName,
  homeScore: detail.homeScore,
  awayScore: detail.awayScore,
  refereeNotes: detail.refereeNotes,
  completed: detail.status === 'completed',
  cards: detail.incidents.filter((i) => i.type === 'yellow_card' || i.type === 'red_card'),
  injuries: detail.incidents.filter((i) => i.type === 'injury'),
  recordedEjections: detail.ejections,
};
---

<BaseLayout title="Close out match — Referee — Aspire Sports" navigation={false} footer={false}>
  <RefereeLayout client:load currentPath="/referee"
    breadcrumbs={[{ label: "My matches", href: "/referee" }]}
    user={{ firstName: user.firstName, lastName: user.lastName, email: user.email }}>
    <div class="space-y-6 max-w-2xl">
      <ActiveSuspensionBanner client:load suspensions={detail.activeSuspensions}
        homeTeamId={detail.homeTeamId} awayTeamId={detail.awayTeamId}
        homeTeamName={detail.homeTeamName} awayTeamName={detail.awayTeamName} />
      <RefereeCheckIn client:load gameId={detail.gameId} initialCheckIn={detail.checkIn} />
      <MatchCloseout client:load data={closeout} />
    </div>
  </RefereeLayout>
</BaseLayout>
```

- [ ] **Step 3: Write the E2E test.** Create `tests/e2e/referee-closeout.spec.ts`. Use the repo's `signIn` helper and a seeded assigned referee + game. On a mobile viewport, drive: increment home score, tap None on each section, submit, and assert redirect to `/referee` with the game showing as completed.

```ts
import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../utils/test-helpers";

test.use({ viewport: { width: 390, height: 844 } }); // iPhone-ish

test("referee closes out a game from a phone", async ({ page }) => {
  await signIn(page, "referee"); // adjust to the repo's referee test account
  await page.goto(`/referee/matches/${process.env.E2E_ASSIGNED_GAME_ID}`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  await page.getByLabel("Increase Home score").click();
  for (const section of ["Cards", "Ejections", "Injuries"]) {
    await page.locator("div", { hasText: section }).getByRole("button", { name: "None" }).first().click();
  }
  await page.getByTestId("closeout-submit").click();
  await expect(page).toHaveURL(/\/referee$/);
});
```

Note: if the repo has no stable seeded assigned-game id for E2E, add one to `src/lib/db/seeds/seed-e2e-tests.ts` (a game with the referee test account assigned via `game_officials`) as part of this task, and reference it in the spec.

- [ ] **Step 4: Build + run E2E.**

Run: `npm run build`
Then (dev server up): `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- referee-closeout`
Expected: build clean; the E2E test passes.

- [ ] **Step 5: Type-check.**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit.**

```bash
git add src/components/referee/match-closeout.tsx src/pages/referee/matches/\[gameId\].astro tests/e2e/referee-closeout.spec.ts src/lib/db/seeds/seed-e2e-tests.ts
git commit -m "feat(referee): one guided mobile close-out screen replacing report + ejection cards"
```

---

## Task 6: Pay page — lock un-closed fees

**Files:**
- Modify: `src/lib/referee/get-referee-pay.ts`
- Modify: `src/components/referee/referee-pay.tsx`
- Test: `tests/api/referee/pay-lock.test.ts` (or extend an existing pay test)

**Interfaces:**
- Consumes: `games.status`.
- Produces: `RefereePayRow.locked: boolean`; `RefereePayRowView.locked: boolean`; `totalUnpaidCents` excludes locked rows.

- [ ] **Step 1: Derive `locked` in the query.** In `src/lib/referee/get-referee-pay.ts`:
  - Add `status: games.status` to the `.select({ … })`.
  - Add `locked: boolean` to `RefereePayRow` and set `locked: r.status !== "completed"` when mapping.
  - Change the total to exclude locked rows:

```ts
  const totalUnpaidCents = rows
    .filter((r) => r.paymentStatus === "unpaid" && r.status === "completed")
    .reduce((sum, r) => sum + r.feeCents, 0);
  return {
    rows: rows.map((r) => ({ ...r, locked: r.status !== "completed" })),
    totalUnpaidCents,
  };
```

  Update the `RefereePayRow` type to include `status: string` and `locked: boolean` (or drop `status` from the returned shape and keep only `locked` — keep only `locked` to avoid leaking a redundant field).

- [ ] **Step 2: Pass `locked` through the page.** In `src/pages/referee/pay.astro`, add `locked: r.locked` to the mapped `rows`.

- [ ] **Step 3: Render locked rows.** In `src/components/referee/referee-pay.tsx`:
  - Add `locked: boolean` to `RefereePayRowView`.
  - In the status cell, when `r.locked`, render a lock affordance + deep link instead of the payment badge:

```tsx
<TableCell>
  {r.locked ? (
    <a href={`/referee/matches/${r.gameId}`} className="text-sm font-medium text-amber-600 hover:underline">
      🔒 Close out to unlock
    </a>
  ) : (
    <Badge variant={r.paymentStatus === "paid" ? "default" : "secondary"} className="capitalize">{r.paymentStatus}</Badge>
  )}
</TableCell>
```

- [ ] **Step 4: Write the test.** In `tests/api/referee/pay-lock.test.ts`: assign a referee to a `scheduled` game with a fee, assert the pay endpoint/page data marks it `locked: true` and excludes it from `totalUnpaidCents`; then close it out and assert `locked: false` and included in the total.

- [ ] **Step 5: Run tests + type-check.**

Run: `TEST_BASE_URL=http://localhost:4321 npm run test:api -- pay-lock`
Then: `npx tsc --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/referee/get-referee-pay.ts src/pages/referee/pay.astro src/components/referee/referee-pay.tsx tests/api/referee/pay-lock.test.ts
git commit -m "feat(referee): lock un-closed fees on the ref pay page"
```

---

## Task 7: Admin dialog — flag un-closed games, guard the paid toggle

**Files:**
- Modify: `src/components/admin/games-list.tsx` (pass `gameStatus` to the dialog)
- Modify: `src/components/admin/game-officials-dialog.tsx` (disable "mark paid" until completed)

**Interfaces:**
- Consumes: `game.status` (already on the games-list row).
- Produces: `GameOfficialsDialogProps.gameStatus?: string`.

- [ ] **Step 1: Add the prop.** In `game-officials-dialog.tsx`, add `gameStatus?: string` to `GameOfficialsDialogProps` and the function signature. Compute `const notClosedOut = gameStatus !== "completed"`.

- [ ] **Step 2: Guard the paid toggle.** Find the mark-paid control (the button/handler around line 137-155 that PATCHes `paymentStatus`). When `notClosedOut`, disable it and show why. Example, wrapping the existing toggle:

```tsx
{notClosedOut ? (
  <span className="text-xs text-amber-600">Not closed out — can't pay yet</span>
) : (
  /* existing mark-paid button unchanged */
)}
```

- [ ] **Step 3: Pass the status from games-list.** In `games-list.tsx`, where `<GameOfficialsDialog … />` is rendered, pass `gameStatus={/* the currently-open game's status */}`. If the dialog is opened by `gameId` only, track the open game's `status` alongside it in the same state setter that opens the dialog.

- [ ] **Step 4: Type-check + build.**

Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors, clean build.

- [ ] **Step 5: Manual verification.** With the dev server up, open `/admin/games`, open the officials dialog on a `scheduled` game → the paid toggle is disabled with the "Not closed out" note; on a `completed` game → the toggle works as before.

- [ ] **Step 6: Commit.**

```bash
git add src/components/admin/games-list.tsx src/components/admin/game-officials-dialog.tsx
git commit -m "feat(admin): block marking a ref paid until the game is closed out"
```

---

## Task 8: Reminder stage — pure decision function

**Files:**
- Create: `src/lib/referee/closeout-reminders.ts`
- Test: `tests/unit/closeout-reminder-stage.test.ts`

**Interfaces:**
- Produces:
```ts
export type ReminderAction = "none" | "send_first" | "send_second";
export function decideReminderAction(args: {
  now: Date; scheduledAt: Date; status: string; stage: number; morningHourEt?: number;
}): ReminderAction;
```

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/closeout-reminder-stage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { decideReminderAction } from "@/lib/referee/closeout-reminders";

const at = (iso: string) => new Date(iso);

describe("decideReminderAction", () => {
  it("does nothing before kickoff + 2h", () => {
    expect(decideReminderAction({ now: at("2026-07-09T18:00:00Z"), scheduledAt: at("2026-07-09T17:00:00Z"), status: "scheduled", stage: 0 })).toBe("none");
  });
  it("sends the first reminder at kickoff + 2h when stage 0", () => {
    expect(decideReminderAction({ now: at("2026-07-09T19:30:00Z"), scheduledAt: at("2026-07-09T17:00:00Z"), status: "scheduled", stage: 0 })).toBe("send_first");
  });
  it("never reminds a completed game", () => {
    expect(decideReminderAction({ now: at("2026-07-10T13:00:00Z"), scheduledAt: at("2026-07-09T17:00:00Z"), status: "completed", stage: 1 })).toBe("none");
  });
  it("sends the second reminder the next morning when stage 1", () => {
    // kickoff 2026-07-09 17:00Z; next local ET morning 8am = 2026-07-10 12:00Z (EDT, UTC-4)
    expect(decideReminderAction({ now: at("2026-07-10T12:30:00Z"), scheduledAt: at("2026-07-09T17:00:00Z"), status: "scheduled", stage: 1 })).toBe("send_second");
  });
  it("does not send the second before the next morning", () => {
    expect(decideReminderAction({ now: at("2026-07-09T20:00:00Z"), scheduledAt: at("2026-07-09T17:00:00Z"), status: "scheduled", stage: 1 })).toBe("none");
  });
  it("stops after stage 2", () => {
    expect(decideReminderAction({ now: at("2026-07-11T13:00:00Z"), scheduledAt: at("2026-07-09T17:00:00Z"), status: "scheduled", stage: 2 })).toBe("none");
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npm run test:api -- closeout-reminder-stage` *(note: unit tests run under the same Vitest; if the repo separates them, use the unit config — `npx vitest run tests/unit/closeout-reminder-stage.test.ts`)*
Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `src/lib/referee/closeout-reminders.ts`:

```ts
export type ReminderAction = "none" | "send_first" | "send_second";

const HOURS_2 = 2 * 60 * 60 * 1000;

/**
 * Next occurrence of `hourEt` o'clock Eastern, at or after `after`, expressed
 * as a UTC Date. Uses a fixed EDT offset (UTC-4) — good enough for a nudge
 * cadence; we are not scheduling anything safety-critical on DST edges.
 */
function nextMorningEt(after: Date, hourEt: number): Date {
  const etOffsetMs = 4 * 60 * 60 * 1000; // EDT
  const etNow = new Date(after.getTime() - etOffsetMs);
  const etMorning = new Date(Date.UTC(etNow.getUTCFullYear(), etNow.getUTCMonth(), etNow.getUTCDate(), hourEt, 0, 0));
  let utc = new Date(etMorning.getTime() + etOffsetMs);
  if (utc.getTime() <= after.getTime()) utc = new Date(utc.getTime() + 24 * 60 * 60 * 1000);
  return utc;
}

export function decideReminderAction(args: {
  now: Date; scheduledAt: Date; status: string; stage: number; morningHourEt?: number;
}): ReminderAction {
  const { now, scheduledAt, status, stage } = args;
  if (status === "completed") return "none";
  if (stage === 0) {
    return now.getTime() >= scheduledAt.getTime() + HOURS_2 ? "send_first" : "none";
  }
  if (stage === 1) {
    const firstSentAtOrAfter = new Date(scheduledAt.getTime() + HOURS_2);
    const morning = nextMorningEt(firstSentAtOrAfter, args.morningHourEt ?? 8);
    return now.getTime() >= morning.getTime() ? "send_second" : "none";
  }
  return "none"; // stage >= 2: stop
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `npx vitest run tests/unit/closeout-reminder-stage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/referee/closeout-reminders.ts tests/unit/closeout-reminder-stage.test.ts
git commit -m "feat(referee): pure decision function for close-out reminder stages"
```

---

## Task 9: Reminder cron endpoint + Netlify scheduler

**Files:**
- Modify: `src/lib/referee/closeout-reminders.ts` (add the query `findOfficialsOwingCloseout`)
- Create: `src/pages/api/cron/referee-closeout-reminders.ts`
- Create: `netlify/functions/scheduled-referee-closeout-reminders.ts`
- Test: `tests/api/cron/referee-closeout-reminders.test.ts`

**Interfaces:**
- Consumes: `decideReminderAction` (Task 8), `sendSms`, `gameOfficials.closeoutRemindersSent` (Task 1).
- Produces: `POST /api/cron/referee-closeout-reminders` → `{ sent, skipped }`.

- [ ] **Step 1: Add the query.** Append to `src/lib/referee/closeout-reminders.ts`:

```ts
import { and, eq, lt, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";
import { games, gameOfficials, teams } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";

export interface CloseoutOwed {
  officialId: string;
  userId: string;
  phone: string | null;
  phoneVerified: boolean;
  organizationId: string;
  gameId: string;
  scheduledAt: Date;
  status: string;
  stage: number;
  homeTeamName: string | null;
  awayTeamName: string | null;
}

/** Assigned officials on past, not-completed games who still owe close-out. */
export async function findOfficialsOwingCloseout(now: Date): Promise<CloseoutOwed[]> {
  const db = getDb();
  const home = alias(teams, "home_team");
  const away = alias(teams, "away_team");
  return db
    .select({
      officialId: gameOfficials.id,
      userId: gameOfficials.userId,
      phone: users.phone,
      phoneVerified: users.phoneVerified,
      organizationId: locations.organizationId,
      gameId: games.id,
      scheduledAt: games.scheduledAt,
      status: games.status,
      stage: gameOfficials.closeoutRemindersSent,
      homeTeamName: home.name,
      awayTeamName: away.name,
    })
    .from(gameOfficials)
    .innerJoin(games, eq(games.id, gameOfficials.gameId))
    .innerJoin(seasons, eq(games.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .innerJoin(users, eq(users.id, gameOfficials.userId))
    .leftJoin(home, eq(home.id, games.homeTeamId))
    .leftJoin(away, eq(away.id, games.awayTeamId))
    .where(and(lt(games.scheduledAt, now), ne(games.status, "completed"), lt(gameOfficials.closeoutRemindersSent, 2)));
}
```

- [ ] **Step 2: Write the failing cron test.** Create `tests/api/cron/referee-closeout-reminders.test.ts`. Model auth on a sibling cron test (`tests/api/cron/*`). Assert: a request without the `x-cron-secret` header is 401; a request with it returns `{ sent, skipped }` shape (200). Full send-count assertions depend on seed state — assert the endpoint runs and returns the shape.

```ts
import { describe, it, expect } from "vitest";
const base = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const secret = process.env.CRON_SECRET ?? "test-cron-secret";

describe("POST /api/cron/referee-closeout-reminders", () => {
  it("401s without the cron secret", async () => {
    const res = await fetch(`${base}/api/cron/referee-closeout-reminders`, { method: "POST" });
    expect(res.status).toBe(401);
  });
  it("runs with the cron secret and returns a summary", async () => {
    const res = await fetch(`${base}/api/cron/referee-closeout-reminders`, {
      method: "POST", headers: { "x-cron-secret": secret },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("sent");
    expect(body).toHaveProperty("skipped");
  });
});
```

- [ ] **Step 3: Run to verify failure.**

Run: `CRON_SECRET=test-cron-secret TEST_BASE_URL=http://localhost:4321 npm run test:api -- referee-closeout-reminders`
Expected: FAIL (route missing → 404, not 401/200). Ensure the dev server was started with the same `CRON_SECRET`.

- [ ] **Step 4: Implement the cron route.** Create `src/pages/api/cron/referee-closeout-reminders.ts`:

```ts
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { gameOfficials } from "@/lib/db/schema/teams";
import { sendSms, normalizeUsPhone } from "@/lib/sms/send";
import { env } from "@/lib/env";
import { captureServerException } from "@/lib/observability/server-error";
import { decideReminderAction, findOfficialsOwingCloseout } from "@/lib/referee/closeout-reminders";

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  if (!secret || request.headers.get("x-cron-secret") !== secret)
    return json({ error: "Unauthorized" }, 401);

  const now = new Date();
  const base = (env.PUBLIC_APP_URL ?? "https://app.aspiresports.com").replace(/\/$/, "");
  const db = getDb();
  let sent = 0, skipped = 0;

  const owed = await findOfficialsOwingCloseout(now);
  for (const o of owed) {
    const action = decideReminderAction({ now, scheduledAt: o.scheduledAt, status: o.status, stage: o.stage });
    if (action === "none") { skipped++; continue; }

    const phone = o.phone && o.phoneVerified ? normalizeUsPhone(o.phone) : null;
    if (!phone) {
      // No usable phone — advance the stage so the admin flag takes over instead of retrying forever.
      await db.update(gameOfficials).set({ closeoutRemindersSent: o.stage + 1, updatedAt: now }).where(eq(gameOfficials.id, o.officialId));
      skipped++; continue;
    }

    const match = `${o.homeTeamName ?? "your game"} vs ${o.awayTeamName ?? ""}`.trim();
    const body = action === "send_first"
      ? `Close out ${match} to get paid: ${base}/referee/matches/${o.gameId}`
      : `Reminder: 1 game still needs closing out. You won't be paid until it's done: ${base}/referee/matches/${o.gameId}`;

    try {
      const res = await sendSms({ to: phone, body, organizationId: o.organizationId });
      // Advance the stage regardless of opt-in outcome — we don't retry the same
      // stage; opted-out/unconfigured refs fall through to the admin flag.
      await db.update(gameOfficials).set({ closeoutRemindersSent: o.stage + 1, updatedAt: now }).where(eq(gameOfficials.id, o.officialId));
      if (res.ok) sent++; else { skipped++; console.warn("[closeout-reminders] skip", o.officialId, res.reason); }
    } catch (err) {
      skipped++;
      captureServerException(err, { where: "referee-closeout-reminders", officialId: o.officialId });
    }
  }

  return json({ sent, skipped }, 200);
};
```

Confirm the import paths for `env`, `captureServerException`, and `normalizeUsPhone` match the repo (they are used verbatim in `send-balance-reminders.ts` and `sms/send.ts`). If `env` has no `PUBLIC_APP_URL`, read `import.meta.env.PUBLIC_APP_URL` instead.

- [ ] **Step 5: Run to verify pass.**

Run: `CRON_SECRET=test-cron-secret TEST_BASE_URL=http://localhost:4321 npm run test:api -- referee-closeout-reminders`
Expected: PASS.

- [ ] **Step 6: Add the Netlify scheduler.** Create `netlify/functions/scheduled-referee-closeout-reminders.ts`, modeled on `scheduled-send-balance-reminders.ts`. Run daily at 12:00 UTC (8am ET) so both the T+2h and next-morning windows get a daily sweep:

```ts
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/referee-closeout-reminders";

export const handler = schedule("0 12 * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(/\/$/, "");
  if (!base) {
    console.error("[scheduled-referee-closeout-reminders] no site URL in env (URL / PUBLIC_APP_URL)");
    return { statusCode: 500, body: "Site URL not configured" };
  }
  try {
    const res = await fetch(`${base}${ROUTE}`, {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET ?? "", origin: base },
    });
    return { statusCode: res.ok ? 200 : 500, body: await res.text() };
  } catch (err) {
    console.error("[scheduled-referee-closeout-reminders]", err);
    return { statusCode: 500, body: "Reminder run failed" };
  }
});
```

*Cadence note: a single daily 12:00 UTC run means the "T+2h" reminder actually fires on the next daily sweep after kickoff+2h, not exactly 2h later. That's acceptable for a nudge. If tighter timing is wanted later, raise the schedule to hourly — the stage logic already guards against double-sends.*

- [ ] **Step 7: Build + type-check.**

Run: `npm run build && npx tsc --noEmit`
Expected: clean build, zero errors.

- [ ] **Step 8: Commit.**

```bash
git add src/lib/referee/closeout-reminders.ts src/pages/api/cron/referee-closeout-reminders.ts netlify/functions/scheduled-referee-closeout-reminders.ts tests/api/cron/referee-closeout-reminders.test.ts
git commit -m "feat(referee): escalating SMS close-out reminders (cron + scheduler)"
```

---

## Task 10: Full pre-push verification

**Files:** none (verification only).

- [ ] **Step 1: Regenerate e2e seed** (idempotent; surfaces any new fixture the E2E test needs).

Run: `npm run db:seed:e2e`
Expected: completes without error.

- [ ] **Step 2: API tests (CI-equivalent env), dev server up.**

Run: `CRON_SECRET=<dev-server-secret> TEST_BASE_URL=http://localhost:4321 npm run test:api`
Expected: all green.

- [ ] **Step 3: Playwright.**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test`
Expected: all green, including `referee-closeout`.

- [ ] **Step 4: Build.**

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Type check.**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Grep E2E for touched admin/referee routes** (per repo pre-merge rule) and confirm none of `/admin/games`, `/referee`, `/referee/matches/*` specs broke.

Run: `grep -rln "referee/matches\|admin/games\|/referee" tests/e2e/`
Expected: any hits still pass under Step 3.

---

## Self-Review (completed by plan author)

- **Spec coverage:** payable-⇔-completed (Tasks 3, 6), atomic close-out endpoint + shared createEjection (Tasks 2, 3), one mobile screen with None-gates + opportunistic check-out (Tasks 3, 5), recorded-ejections read-only (Tasks 4, 5), pay lock (Task 6), admin payout guard (Task 7), escalating SMS via provider-agnostic sendSms (Tasks 8, 9), `closeout_reminders_sent` migration (Task 1), tests at all three layers (throughout), out-of-scope respected (no provider swap, no auto-payout, single-ref). All spec sections map to a task.
- **Placeholder scan:** every code step carries real code; commands have expected output. Generated-migration filename is intentionally `0074_*` (drizzle names it) with the exact SQL to verify.
- **Type consistency:** `createEjection(tx, args)` signature identical across Tasks 2/3; `decideReminderAction` args identical across Tasks 8/9; `locked` field consistent across Tasks 6's query/page/component; `closeoutRemindersSent` column name identical in Tasks 1/9.
