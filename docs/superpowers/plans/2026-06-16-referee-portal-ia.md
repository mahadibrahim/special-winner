# Referee Portal IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the greenfield referee portal — refs see assigned matches, report results (score + structured incidents + notes), and see their pay.

**Architecture:** Mirror SP3/SP4 (registry portal + a layout mirroring `CoachLayout` + role-gated route). Adds the program's first schema change: a `gameIncidents` table + `games.refereeNotes` (one generated, committed Drizzle migration). The result-write endpoint is gated by the `gameOfficials` assignment.

**Tech Stack:** Astro 5 + React 19, Drizzle ORM (Postgres), Vitest. Spec: `docs/superpowers/specs/2026-06-16-referee-portal-ia-design.md`.

**Task order is dependency-first** so every TDD step goes green when run: schema/migration → badge types → query helpers → pay helper → nav/registry → layout → list pages → report endpoint → badge endpoint → match-report page → middleware + verify.

**⚠️ The migration (Task 1) is the new wrinkle:** after editing the schema you MUST run `npm run db:generate` and commit the generated SQL + `meta/` so CI's `db:migrate` passes. It runs offline (diffs schema files against the snapshot — no DB needed).

---

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `src/lib/db/schema/teams.ts` | Modify | add `gameIncidents` + `games.refereeNotes` |
| `src/lib/db/migrations/0051_*.sql` (+ `meta/`) | Create (generated) | additive migration |
| `src/lib/admin/nav-super-admin.ts` + `src/components/portal/portal-layout.tsx` | Modify | add `reportsOwed` badge key |
| `src/lib/referee/referee-queries.ts` | Create | `getRefereeAssignments`, `getReportsOwed`, `getRefereeMatchDetail` |
| `src/lib/referee/get-referee-pay.ts` | Create | `getRefereePay` |
| `src/lib/admin/nav-referee.ts` | Create | `REFEREE_NAV` |
| `src/lib/portal/registry.ts` | Modify | flip referee `available` + nav |
| `src/components/referee/referee-layout.tsx` | Create | portal chrome + badge fetch |
| `src/components/referee/{referee-matches,referee-pay,match-report}.tsx` | Create | the three surfaces |
| `src/pages/referee/{index,pay}.astro` + `matches/[gameId].astro` | Create | pages |
| `src/pages/api/referee/matches/[gameId]/report.ts` | Create | submit result + incidents |
| `src/pages/api/referee/nav-badges.ts` | Create | reports-owed count |
| `src/middleware.ts` | Modify | `/referee` ROUTE_RULES entry |
| `tests/unit/referee/*.test.ts` + `tests/unit/admin/nav-referee.test.ts` + `route-coverage.test.ts` | Create/Modify | coverage |

---

## Task 1: Schema + migration

**Files:**
- Modify: `src/lib/db/schema/teams.ts`
- Create (generated): `src/lib/db/migrations/0051_*.sql` + `meta/` updates

- [ ] **Step 1: Add the `refereeNotes` column to the `games` table**

In `src/lib/db/schema/teams.ts`, inside the `games` table column block, after `notes: text("notes"),` add:

```ts
    refereeNotes: text("referee_notes"),
```

- [ ] **Step 2: Add the incident enums + table after `gameOfficials`**

In `src/lib/db/schema/teams.ts`, immediately after the `gameOfficials` table definition (the block ending with its `]);`), add:

```ts
export const gameIncidentTypeEnum = pgEnum("game_incident_type", [
  "yellow_card",
  "red_card",
  "injury",
  "other",
]);
export const gameSideEnum = pgEnum("game_side", ["home", "away"]);

// Structured incidents logged by the assigned referee when reporting a match.
export const gameIncidents = pgTable(
  "game_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    reportedByUserId: uuid("reported_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: gameIncidentTypeEnum("type").notNull(),
    side: gameSideEnum("side").notNull(),
    player: varchar("player", { length: 120 }),
    minute: integer("minute"),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("game_incidents_game_idx").on(t.gameId)],
);
```

(All imports used — `pgEnum`, `pgTable`, `uuid`, `varchar`, `integer`, `text`, `timestamp`, `index` — are already imported at the top of the file.)

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: drizzle-kit creates `src/lib/db/migrations/0051_<random-name>.sql` and updates `src/lib/db/migrations/meta/`. It is non-interactive for additive changes.

- [ ] **Step 4: Inspect the generated SQL**

Run: `cat src/lib/db/migrations/0051_*.sql`
Expected: it contains `CREATE TYPE "public"."game_incident_type" ...`, `CREATE TYPE "public"."game_side" ...`, `CREATE TABLE ... "game_incidents" ...`, and `ALTER TABLE "games" ADD COLUMN "referee_notes" text;`. No `DROP` of existing objects. If it includes anything destructive, STOP and report — do not commit.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema/teams.ts src/lib/db/migrations
git commit -m "feat(referee-ia): gameIncidents table + games.refereeNotes (migration)"
```

---

## Task 2: Badge type plumbing

**Files:**
- Modify: `src/lib/admin/nav-super-admin.ts`
- Modify: `src/components/portal/portal-layout.tsx`

- [ ] **Step 1: Extend the `NavItem.badgeKey` union**

In `src/lib/admin/nav-super-admin.ts`, change the `badgeKey?:` line to append `"reportsOwed"`. (On `main` the union is `"inbox" | "refundsPending" | "attention"`; coach added none new; so the result is:)

```ts
  badgeKey?: "inbox" | "refundsPending" | "attention" | "reportsOwed";
```

- [ ] **Step 2: Extend `PortalBadges`**

In `src/components/portal/portal-layout.tsx`, add to the `PortalBadges` type:

```ts
  reportsOwed?: number
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/admin/nav-super-admin.ts src/components/portal/portal-layout.tsx
git commit -m "feat(referee-ia): add reportsOwed badge key to nav/portal types"
```

---

## Task 3: Referee query helpers

**Files:**
- Create: `src/lib/referee/referee-queries.ts`
- Create: `tests/unit/referee/referee-queries.test.ts`

Three read helpers, all scoped to the ref's own `gameOfficials` assignments.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/referee/referee-queries.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

let assignmentRows: any[] = [];
let owedRows: any[] = [];
let detailRows: any[] = [];
let incidentRows: any[] = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    // getRefereeAssignments / getRefereeMatchDetail: select().from().innerJoin()...where()(.limit/.orderBy)
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            leftJoin: () => ({
              where: (..._a: any[]) => ({
                orderBy: async () => assignmentRows,
                limit: async () => detailRows,
              }),
            }),
          }),
          // getReportsOwed: select(count).from(gameOfficials).innerJoin(games).where()
          where: async () => owedRows,
        }),
      }),
    }),
  }),
}));

import { getRefereeAssignments, getReportsOwed } from "@/lib/referee/referee-queries";

describe("referee-queries", () => {
  beforeEach(() => { assignmentRows = []; owedRows = []; detailRows = []; incidentRows = []; });

  it("getRefereeAssignments returns the ref's matches with a reported flag", async () => {
    assignmentRows = [
      { gameId: "g1", scheduledAt: new Date("2026-07-01T18:00:00Z"), status: "scheduled", homeScore: null, awayScore: null, homeTeamName: "Red", awayTeamName: "Blue", position: "referee" },
      { gameId: "g2", scheduledAt: new Date("2026-06-01T18:00:00Z"), status: "completed", homeScore: 2, awayScore: 1, homeTeamName: "Red", awayTeamName: "Green", position: "referee" },
    ];
    const out = await getRefereeAssignments("u1");
    expect(out.map((m) => [m.gameId, m.reported])).toEqual([["g1", false], ["g2", true]]);
  });

  it("getReportsOwed counts past, not-completed assignments", async () => {
    owedRows = [{ count: 4 }];
    expect(await getReportsOwed("u1")).toBe(4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/referee/referee-queries.test.ts`
Expected: FAIL — cannot resolve `@/lib/referee/referee-queries`.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/referee/referee-queries.ts`:

```ts
import { and, eq, lt, ne, asc, sql, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";
import { games, gameOfficials, gameIncidents, teams } from "@/lib/db/schema/teams";

export type RefereeAssignment = {
  gameId: string;
  scheduledAt: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  position: string;
  reported: boolean;
};

/** The ref's assigned matches (newest scheduled first), each flagged reported. */
export async function getRefereeAssignments(userId: string): Promise<RefereeAssignment[]> {
  const db = getDb();
  const home = alias(teams, "home_team");
  const away = alias(teams, "away_team");
  const rows = await db
    .select({
      gameId: games.id,
      scheduledAt: games.scheduledAt,
      status: games.status,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      homeTeamName: home.name,
      awayTeamName: away.name,
      position: gameOfficials.position,
    })
    .from(gameOfficials)
    .innerJoin(games, eq(games.id, gameOfficials.gameId))
    .leftJoin(home, eq(home.id, games.homeTeamId))
    .leftJoin(away, eq(away.id, games.awayTeamId))
    .where(eq(gameOfficials.userId, userId))
    .orderBy(desc(games.scheduledAt));
  return rows.map((r) => ({ ...r, reported: r.status === "completed" }));
}

/** Count of past assigned games whose result is still owed (not completed). */
export async function getReportsOwed(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(gameOfficials)
    .innerJoin(games, eq(games.id, gameOfficials.gameId))
    .where(
      and(
        eq(gameOfficials.userId, userId),
        lt(games.scheduledAt, new Date()),
        ne(games.status, "completed"),
      ),
    );
  return row?.count ?? 0;
}

export type RefereeMatchDetail = {
  gameId: string;
  scheduledAt: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  refereeNotes: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  incidents: Array<{
    id: string;
    type: string;
    side: string;
    player: string | null;
    minute: number | null;
    description: string | null;
  }>;
};

/**
 * Full match detail for the report page, but ONLY if the caller is an assigned
 * official on the game. Returns null otherwise (the page 404s).
 */
export async function getRefereeMatchDetail(userId: string, gameId: string): Promise<RefereeMatchDetail | null> {
  const db = getDb();
  const home = alias(teams, "home_team");
  const away = alias(teams, "away_team");
  const [row] = await db
    .select({
      gameId: games.id,
      scheduledAt: games.scheduledAt,
      status: games.status,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      refereeNotes: games.refereeNotes,
      homeTeamName: home.name,
      awayTeamName: away.name,
    })
    .from(gameOfficials)
    .innerJoin(games, eq(games.id, gameOfficials.gameId))
    .leftJoin(home, eq(home.id, games.homeTeamId))
    .leftJoin(away, eq(away.id, games.awayTeamId))
    .where(and(eq(gameOfficials.userId, userId), eq(gameOfficials.gameId, gameId)))
    .limit(1);
  if (!row) return null;

  const incidents = await db
    .select({
      id: gameIncidents.id,
      type: gameIncidents.type,
      side: gameIncidents.side,
      player: gameIncidents.player,
      minute: gameIncidents.minute,
      description: gameIncidents.description,
    })
    .from(gameIncidents)
    .where(eq(gameIncidents.gameId, gameId))
    .orderBy(asc(gameIncidents.minute));
  return { ...row, incidents };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/referee/referee-queries.test.ts`
Expected: PASS (2 tests). (`getRefereeMatchDetail` is exercised by the report-page task; its DB shape is covered by tsc.)

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → exit 0.

```bash
git add src/lib/referee/referee-queries.ts tests/unit/referee/referee-queries.test.ts
git commit -m "feat(referee-ia): referee query helpers (assignments, reports-owed, match detail)"
```

---

## Task 4: `getRefereePay` helper

**Files:**
- Create: `src/lib/referee/get-referee-pay.ts`
- Create: `tests/unit/referee/get-referee-pay.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/referee/get-referee-pay.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

const rows = [
  { gameId: "g1", scheduledAt: new Date("2026-06-01T18:00:00Z"), homeTeamName: "Red", awayTeamName: "Blue", feeCents: 4000, paymentStatus: "paid" },
  { gameId: "g2", scheduledAt: new Date("2026-06-08T18:00:00Z"), homeTeamName: "Red", awayTeamName: "Green", feeCents: 4000, paymentStatus: "unpaid" },
  { gameId: "g3", scheduledAt: new Date("2026-06-15T18:00:00Z"), homeTeamName: "Blue", awayTeamName: "Green", feeCents: 3500, paymentStatus: "unpaid" },
];
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ innerJoin: () => ({ leftJoin: () => ({ leftJoin: () => ({ where: () => ({ orderBy: async () => rows }) }) }) }) }) }),
  }),
}));

import { getRefereePay } from "@/lib/referee/get-referee-pay";

describe("getRefereePay", () => {
  it("returns the rows and the total unpaid", async () => {
    const out = await getRefereePay("u1");
    expect(out.rows).toEqual(rows);
    expect(out.totalUnpaidCents).toBe(7500); // 4000 + 3500
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/referee/get-referee-pay.test.ts`
Expected: FAIL — cannot resolve `@/lib/referee/get-referee-pay`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/referee/get-referee-pay.ts`:

```ts
import { eq, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";
import { games, gameOfficials, teams } from "@/lib/db/schema/teams";

export type RefereePayRow = {
  gameId: string;
  scheduledAt: Date;
  homeTeamName: string | null;
  awayTeamName: string | null;
  feeCents: number;
  paymentStatus: string;
};

/** The ref's assignments with pay + a computed total unpaid (in cents). */
export async function getRefereePay(userId: string): Promise<{ rows: RefereePayRow[]; totalUnpaidCents: number }> {
  const db = getDb();
  const home = alias(teams, "home_team");
  const away = alias(teams, "away_team");
  const rows = await db
    .select({
      gameId: games.id,
      scheduledAt: games.scheduledAt,
      homeTeamName: home.name,
      awayTeamName: away.name,
      feeCents: gameOfficials.feeCents,
      paymentStatus: gameOfficials.paymentStatus,
    })
    .from(gameOfficials)
    .innerJoin(games, eq(games.id, gameOfficials.gameId))
    .leftJoin(home, eq(home.id, games.homeTeamId))
    .leftJoin(away, eq(away.id, games.awayTeamId))
    .where(eq(gameOfficials.userId, userId))
    .orderBy(desc(games.scheduledAt));
  const totalUnpaidCents = rows
    .filter((r) => r.paymentStatus === "unpaid")
    .reduce((sum, r) => sum + r.feeCents, 0);
  return { rows, totalUnpaidCents };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/referee/get-referee-pay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/referee/get-referee-pay.ts tests/unit/referee/get-referee-pay.test.ts
git commit -m "feat(referee-ia): getRefereePay helper (rows + total unpaid)"
```

---

## Task 5: `nav-referee.ts` + registry flip

**Files:**
- Create: `src/lib/admin/nav-referee.ts`
- Create: `tests/unit/admin/nav-referee.test.ts`
- Modify: `src/lib/portal/registry.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin/nav-referee.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { REFEREE_NAV } from "@/lib/admin/nav-referee";

const hrefs = REFEREE_NAV.flatMap((g) => g.items.map((i) => i.href));

describe("REFEREE_NAV", () => {
  it("has My matches and Pay", () => {
    expect(hrefs).toContain("/referee");
    expect(hrefs).toContain("/referee/pay");
  });
  it("My matches carries the reportsOwed badge", () => {
    const item = REFEREE_NAV.flatMap((g) => g.items).find((i) => i.href === "/referee");
    expect(item?.badgeKey).toBe("reportsOwed");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/admin/nav-referee.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin/nav-referee`.

- [ ] **Step 3: Create `nav-referee.ts`**

Create `src/lib/admin/nav-referee.ts`:

```ts
import { ClipboardList, Wallet } from "lucide-react";
import type { NavGroup } from "./nav-super-admin";

export const REFEREE_NAV: NavGroup[] = [
  {
    name: null,
    items: [
      { name: "My matches", href: "/referee", icon: ClipboardList, badgeKey: "reportsOwed" },
      { name: "Pay", href: "/referee/pay", icon: Wallet },
    ],
  },
];
```

- [ ] **Step 4: Flip the registry referee portal**

In `src/lib/portal/registry.ts`: add `import { REFEREE_NAV } from "@/lib/admin/nav-referee";` beside the other nav imports. In the `referee` entry of `PORTALS`, change `available: false` → `available: true` and `nav: []` → `nav: REFEREE_NAV`.

- [ ] **Step 5: Run the nav test + typecheck**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/admin/nav-referee.test.ts` → PASS (2 tests).
Run: `npx tsc --noEmit` → exit 0.
(The `/referee` + `/referee/pay` pages land in Task 7; the orphan-guard verifies nav→page coverage in Task 11.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin/nav-referee.ts src/lib/portal/registry.ts tests/unit/admin/nav-referee.test.ts
git commit -m "feat(referee-ia): referee nav + flip the registry portal to available"
```

---

## Task 6: `RefereeLayout` component

**Files:**
- Create: `src/components/referee/referee-layout.tsx`

Mirrors `src/components/coach/coach-layout.tsx` (fixed portal, static nav, badge fetch), pointed at the `referee` portal and `/api/referee/nav-badges` (that endpoint lands in Task 9; the fetch fails soft until then).

- [ ] **Step 1: Create the component**

Create `src/components/referee/referee-layout.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { PortalLayout, type PortalBadges, type Breadcrumb } from "@/components/portal/portal-layout"
import { getPortalById } from "@/lib/portal/resolve"

interface RefereeLayoutProps {
  children: React.ReactNode
  currentPath: string
  multiPortal?: boolean
  breadcrumbs?: Breadcrumb[]
  user: {
    firstName: string | null
    lastName: string | null
    email: string
  } | null
}

/**
 * Portal chrome for the /referee tree. Fetches the reports-owed badge once on
 * mount (fail-soft), mirroring CoachLayout.
 */
export function RefereeLayout({ children, currentPath, multiPortal = false, breadcrumbs, user }: RefereeLayoutProps) {
  const portal = getPortalById("referee")!

  const [fetched, setFetched] = useState<PortalBadges | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch("/api/referee/nav-badges")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setFetched(data as PortalBadges)
      })
      .catch(() => {
        /* fail-soft: no badges */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <PortalLayout
      currentPath={currentPath}
      navGroups={portal.nav}
      homeHref={portal.homeHref}
      subtitle="Referee"
      roleLabel="Referee"
      showPortalSwitch={multiPortal}
      badges={fetched ?? undefined}
      breadcrumbs={breadcrumbs}
      user={user}
    >
      {children}
    </PortalLayout>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (If a `PortalLayout` prop is required, compare to `src/components/coach/coach-layout.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/referee/referee-layout.tsx
git commit -m "feat(referee-ia): RefereeLayout portal chrome + badge fetch"
```

---

## Task 7: My matches + Pay pages

**Files:**
- Create: `src/components/referee/referee-matches.tsx`
- Create: `src/components/referee/referee-pay.tsx`
- Create: `src/pages/referee/index.astro`
- Create: `src/pages/referee/pay.astro`

- [ ] **Step 1: Create the My-matches component**

Create `src/components/referee/referee-matches.tsx`:

```tsx
"use client"

import { ClipboardList } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"

export interface RefereeMatch {
  gameId: string
  scheduledAt: string
  homeTeamName: string | null
  awayTeamName: string | null
  homeScore: number | null
  awayScore: number | null
  reported: boolean
}

export function RefereeMatches({ matches }: { matches: RefereeMatch[] }) {
  if (matches.length === 0) {
    return (
      <EmptyState
        title="No assigned matches yet"
        description="Matches you're assigned to officiate will appear here."
        icon={<ClipboardList className="h-10 w-10" />}
      />
    )
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My matches</h1>
        <p className="text-muted-foreground mt-1">Report the result for each match you officiate.</p>
      </div>
      <div className="space-y-3">
        {matches.map((m) => (
          <a key={m.gameId} href={`/referee/matches/${m.gameId}`} className="block">
            <Card className="transition-colors hover:border-primary">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">
                  {m.homeTeamName ?? "TBD"} vs {m.awayTeamName ?? "TBD"}
                </CardTitle>
                <Badge variant={m.reported ? "default" : "secondary"}>
                  {m.reported ? `${m.homeScore}–${m.awayScore}` : "Report due"}
                </Badge>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground">
                {new Date(m.scheduledAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </CardContent>
            </Card>
          </a>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the Pay component**

Create `src/components/referee/referee-pay.tsx`:

```tsx
"use client"

import { Wallet } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"

export interface RefereePayRowView {
  gameId: string
  scheduledAt: string
  homeTeamName: string | null
  awayTeamName: string | null
  feeCents: number
  paymentStatus: string
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`

export function RefereePay({ rows, totalUnpaidCents }: { rows: RefereePayRowView[]; totalUnpaidCents: number }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No pay yet"
        description="Fees for matches you officiate will appear here."
        icon={<Wallet className="h-10 w-10" />}
      />
    )
  }
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pay</h1>
          <p className="text-muted-foreground mt-1">Fees for your assigned matches.</p>
        </div>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium">Total unpaid</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{usd(totalUnpaidCents)}</CardContent>
        </Card>
      </div>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Match</TableHead><TableHead>Date</TableHead><TableHead>Fee</TableHead><TableHead>Status</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.gameId}>
              <TableCell>{r.homeTeamName ?? "TBD"} vs {r.awayTeamName ?? "TBD"}</TableCell>
              <TableCell className="text-muted-foreground">{new Date(r.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
              <TableCell>{usd(r.feeCents)}</TableCell>
              <TableCell><Badge variant={r.paymentStatus === "paid" ? "default" : "secondary"} className="capitalize">{r.paymentStatus}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 3: Create the pages**

Create `src/pages/referee/index.astro`:

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import { RefereeLayout } from '@/components/referee/referee-layout';
import { RefereeMatches } from '@/components/referee/referee-matches';
import { getRefereeAssignments } from '@/lib/referee/referee-queries';

export const prerender = false;

const user = Astro.locals.user!;
const assignments = await getRefereeAssignments(user.id);
const matches = assignments.map((m) => ({
  gameId: m.gameId,
  scheduledAt: m.scheduledAt.toISOString(),
  homeTeamName: m.homeTeamName,
  awayTeamName: m.awayTeamName,
  homeScore: m.homeScore,
  awayScore: m.awayScore,
  reported: m.reported,
}));
---

<BaseLayout title="My Matches — Referee — Aspire Sports" navigation={false} footer={false}>
  <RefereeLayout client:load currentPath="/referee" user={{ firstName: user.firstName, lastName: user.lastName, email: user.email }}>
    <RefereeMatches client:load matches={matches} />
  </RefereeLayout>
</BaseLayout>
```

Create `src/pages/referee/pay.astro`:

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import { RefereeLayout } from '@/components/referee/referee-layout';
import { RefereePay } from '@/components/referee/referee-pay';
import { getRefereePay } from '@/lib/referee/get-referee-pay';

export const prerender = false;

const user = Astro.locals.user!;
const pay = await getRefereePay(user.id);
const rows = pay.rows.map((r) => ({
  gameId: r.gameId,
  scheduledAt: r.scheduledAt.toISOString(),
  homeTeamName: r.homeTeamName,
  awayTeamName: r.awayTeamName,
  feeCents: r.feeCents,
  paymentStatus: r.paymentStatus,
}));
---

<BaseLayout title="Pay — Referee — Aspire Sports" navigation={false} footer={false}>
  <RefereeLayout client:load currentPath="/referee/pay" user={{ firstName: user.firstName, lastName: user.lastName, email: user.email }}>
    <RefereePay client:load rows={rows} totalUnpaidCents={pay.totalUnpaidCents} />
  </RefereeLayout>
</BaseLayout>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (Confirm `EmptyState` / `Card*` / `Table*` / `Badge` import paths match `src/components/admin/venue/venue-rosters.tsx`.)

- [ ] **Step 5: Run the nav test (hrefs now resolve)**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/admin/nav-referee.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/referee/referee-matches.tsx src/components/referee/referee-pay.tsx src/pages/referee/index.astro src/pages/referee/pay.astro
git commit -m "feat(referee-ia): My matches + Pay pages"
```

---

## Task 8: Report endpoint

**Files:**
- Create: `src/pages/api/referee/matches/[gameId]/report.ts`
- Create: `tests/unit/referee/report-endpoint.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/referee/report-endpoint.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

let assignment: { id: string } | undefined;
let txCalls: string[] = [];

const txMock = {
  update: () => ({ set: () => ({ where: async () => { txCalls.push("update"); } }) }),
  delete: () => ({ where: async () => { txCalls.push("delete"); } }),
  insert: () => ({ values: async () => { txCalls.push("insert"); } }),
};

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (assignment ? [assignment] : []) }) }) }),
    transaction: async (fn: (tx: typeof txMock) => Promise<void>) => { await fn(txMock); },
  }),
}));

import { POST } from "@/pages/api/referee/matches/[gameId]/report";

const ctx = (body: unknown, gameId = "g1") =>
  ({
    locals: { user: { id: "u1" } },
    params: { gameId },
    request: { json: async () => body },
  }) as never;

const validBody = { homeScore: 2, awayScore: 1, refereeNotes: "clean game", incidents: [{ type: "yellow_card", side: "home", player: "#7", minute: 65 }] };

describe("POST referee report", () => {
  beforeEach(() => { assignment = { id: "a1" }; txCalls = []; });

  it("401 when unauthenticated", async () => {
    const res = await POST({ ...ctx(validBody), locals: {} } as never);
    expect(res.status).toBe(401);
  });

  it("404 when the ref is not an assigned official", async () => {
    assignment = undefined;
    const res = await POST(ctx(validBody));
    expect(res.status).toBe(404);
  });

  it("400 on a negative score", async () => {
    const res = await POST(ctx({ ...validBody, homeScore: -1 }));
    expect(res.status).toBe(400);
  });

  it("400 on an unknown incident type", async () => {
    const res = await POST(ctx({ ...validBody, incidents: [{ type: "goal", side: "home" }] }));
    expect(res.status).toBe(400);
  });

  it("200 on a valid report, replacing incidents", async () => {
    const res = await POST(ctx(validBody));
    expect(res.status).toBe(200);
    // update game, delete old incidents, insert new
    expect(txCalls).toEqual(["update", "delete", "insert"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/referee/report-endpoint.test.ts`
Expected: FAIL — cannot resolve the endpoint module.

- [ ] **Step 3: Implement the endpoint**

Create `src/pages/api/referee/matches/[gameId]/report.ts`:

```ts
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { games, gameOfficials, gameIncidents } from "@/lib/db/schema/teams";

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

const INCIDENT_TYPES = new Set(["yellow_card", "red_card", "injury", "other"]);
const SIDES = new Set(["home", "away"]);

interface IncidentInput {
  type: string;
  side: string;
  player?: string | null;
  minute?: number | null;
  description?: string | null;
}
interface ReportBody {
  homeScore: number;
  awayScore: number;
  refereeNotes?: string | null;
  incidents?: IncidentInput[];
}

const isNonNegInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ error: "Unauthorized" }, 401);
  const gameId = context.params.gameId;
  if (!gameId) return json({ error: "game id required" }, 400);

  const db = getDb();
  // Authoritative gate: caller must be an assigned official on this game.
  const [assignment] = await db
    .select({ id: gameOfficials.id })
    .from(gameOfficials)
    .where(and(eq(gameOfficials.gameId, gameId), eq(gameOfficials.userId, user.id)))
    .limit(1);
  if (!assignment) return json({ error: "Not found" }, 404);

  let body: ReportBody;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!isNonNegInt(body.homeScore) || !isNonNegInt(body.awayScore)) {
    return json({ error: "Scores must be non-negative integers" }, 400);
  }
  const incidents = Array.isArray(body.incidents) ? body.incidents : [];
  for (const inc of incidents) {
    if (!INCIDENT_TYPES.has(inc.type) || !SIDES.has(inc.side)) {
      return json({ error: "Invalid incident type or side" }, 400);
    }
    if (inc.minute != null && !isNonNegInt(inc.minute)) {
      return json({ error: "Incident minute must be a non-negative integer" }, 400);
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(games)
      .set({
        homeScore: body.homeScore,
        awayScore: body.awayScore,
        status: "completed",
        refereeNotes: body.refereeNotes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(games.id, gameId));
    // Replace the game's incidents (single-ref MVP: all incidents are this ref's).
    await tx.delete(gameIncidents).where(eq(gameIncidents.gameId, gameId));
    if (incidents.length > 0) {
      await tx.insert(gameIncidents).values(
        incidents.map((inc) => ({
          gameId,
          reportedByUserId: user.id,
          type: inc.type as "yellow_card" | "red_card" | "injury" | "other",
          side: inc.side as "home" | "away",
          player: inc.player ?? null,
          minute: inc.minute ?? null,
          description: inc.description ?? null,
        })),
      );
    }
  });

  return json({ ok: true }, 200);
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/referee/report-endpoint.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/referee/matches tests/unit/referee/report-endpoint.test.ts
git commit -m "feat(referee-ia): match report endpoint (assignment-gated, replaces incidents)"
```

---

## Task 9: Badge endpoint

**Files:**
- Create: `src/pages/api/referee/nav-badges.ts`
- Create: `tests/unit/referee/referee-nav-badges.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/referee/referee-nav-badges.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

let owed = 0;
vi.mock("@/lib/referee/referee-queries", () => ({
  getReportsOwed: async () => owed,
}));

import { GET } from "@/pages/api/referee/nav-badges";

const ctx = () => ({ locals: { user: { id: "u1" } } }) as never;

describe("GET /api/referee/nav-badges", () => {
  beforeEach(() => { owed = 0; });

  it("returns the reports-owed count", async () => {
    owed = 3;
    const res = await GET(ctx());
    expect(await res.json()).toEqual({ reportsOwed: 3 });
  });

  it("401 when unauthenticated", async () => {
    const res = await GET({ locals: {} } as never);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/referee/referee-nav-badges.test.ts`
Expected: FAIL — cannot resolve the endpoint module.

- [ ] **Step 3: Implement the endpoint**

Create `src/pages/api/referee/nav-badges.ts`:

```ts
import type { APIRoute } from "astro";
import { getReportsOwed } from "@/lib/referee/referee-queries";

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// Reports-owed count for the referee sidebar badge. Fail-soft: 0 on error.
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  try {
    return json({ reportsOwed: await getReportsOwed(locals.user.id) });
  } catch {
    return json({ reportsOwed: 0 });
  }
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/referee/referee-nav-badges.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/referee/nav-badges.ts tests/unit/referee/referee-nav-badges.test.ts
git commit -m "feat(referee-ia): reports-owed badge endpoint"
```

---

## Task 10: Match report page

**Files:**
- Create: `src/components/referee/match-report.tsx`
- Create: `src/pages/referee/matches/[gameId].astro`

- [ ] **Step 1: Create the MatchReport component**

Create `src/components/referee/match-report.tsx`:

```tsx
"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Incident = { type: string; side: string; player: string; minute: string; description: string }

export interface MatchReportData {
  gameId: string
  homeTeamName: string | null
  awayTeamName: string | null
  homeScore: number | null
  awayScore: number | null
  refereeNotes: string | null
  incidents: Array<{ type: string; side: string; player: string | null; minute: number | null; description: string | null }>
}

const TYPES = ["yellow_card", "red_card", "injury", "other"]

export function MatchReport({ data }: { data: MatchReportData }) {
  const [homeScore, setHomeScore] = useState(data.homeScore?.toString() ?? "")
  const [awayScore, setAwayScore] = useState(data.awayScore?.toString() ?? "")
  const [refereeNotes, setRefereeNotes] = useState(data.refereeNotes ?? "")
  const [incidents, setIncidents] = useState<Incident[]>(
    data.incidents.map((i) => ({ type: i.type, side: i.side, player: i.player ?? "", minute: i.minute?.toString() ?? "", description: i.description ?? "" })),
  )
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")

  const addIncident = () => setIncidents((xs) => [...xs, { type: "yellow_card", side: "home", player: "", minute: "", description: "" }])
  const removeIncident = (i: number) => setIncidents((xs) => xs.filter((_, j) => j !== i))
  const setIncident = (i: number, k: keyof Incident, v: string) => setIncidents((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  async function submit() {
    setStatus("saving")
    try {
      const res = await fetch(`/api/referee/matches/${data.gameId}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          homeScore: Number(homeScore),
          awayScore: Number(awayScore),
          refereeNotes: refereeNotes || null,
          incidents: incidents.map((x) => ({
            type: x.type, side: x.side,
            player: x.player || null,
            minute: x.minute === "" ? null : Number(x.minute),
            description: x.description || null,
          })),
        }),
      })
      setStatus(res.ok ? "saved" : "error")
    } catch {
      setStatus("error")
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">{data.homeTeamName ?? "TBD"} vs {data.awayTeamName ?? "TBD"}</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Final score</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-3">
          <Input type="number" min="0" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} className="w-20" aria-label="Home score" />
          <span className="text-muted-foreground">–</span>
          <Input type="number" min="0" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} className="w-20" aria-label="Away score" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Incidents</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addIncident}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {incidents.length === 0 && <p className="text-sm text-muted-foreground">No incidents logged.</p>}
          {incidents.map((inc, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 border-b pb-3 last:border-0">
              <select value={inc.type} onChange={(e) => setIncident(i, "type", e.target.value)} className="rounded border px-2 py-1 text-sm capitalize">
                {TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
              <select value={inc.side} onChange={(e) => setIncident(i, "side", e.target.value)} className="rounded border px-2 py-1 text-sm">
                <option value="home">{data.homeTeamName ?? "Home"}</option>
                <option value="away">{data.awayTeamName ?? "Away"}</option>
              </select>
              <Input value={inc.player} onChange={(e) => setIncident(i, "player", e.target.value)} placeholder="Player / #" className="w-28" />
              <Input type="number" min="0" value={inc.minute} onChange={(e) => setIncident(i, "minute", e.target.value)} placeholder="min" className="w-16" />
              <Input value={inc.description} onChange={(e) => setIncident(i, "description", e.target.value)} placeholder="Notes" className="flex-1 min-w-32" />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeIncident(i)} aria-label="Remove incident"><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Match notes</CardTitle></CardHeader>
        <CardContent>
          <textarea value={refereeNotes} onChange={(e) => setRefereeNotes(e.target.value)} rows={3} className="w-full rounded border px-3 py-2 text-sm" placeholder="Anything notable about the match…" />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Submit report"}</Button>
        {status === "saved" && <span className="text-sm text-green-600">Saved.</span>}
        {status === "error" && <span className="text-sm text-destructive">Couldn’t save — try again.</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the page (loads detail, 404s if not assigned)**

Create `src/pages/referee/matches/[gameId].astro`:

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import { RefereeLayout } from '@/components/referee/referee-layout';
import { MatchReport } from '@/components/referee/match-report';
import { getRefereeMatchDetail } from '@/lib/referee/referee-queries';

export const prerender = false;

const user = Astro.locals.user!;
const gameId = Astro.params.gameId!;
const detail = await getRefereeMatchDetail(user.id, gameId);
if (!detail) {
  return new Response('Not found', { status: 404 });
}
const data = {
  gameId: detail.gameId,
  homeTeamName: detail.homeTeamName,
  awayTeamName: detail.awayTeamName,
  homeScore: detail.homeScore,
  awayScore: detail.awayScore,
  refereeNotes: detail.refereeNotes,
  incidents: detail.incidents,
};
---

<BaseLayout title="Match Report — Referee — Aspire Sports" navigation={false} footer={false}>
  <RefereeLayout
    client:load
    currentPath="/referee"
    breadcrumbs={[{ label: "My matches", href: "/referee" }]}
    user={{ firstName: user.firstName, lastName: user.lastName, email: user.email }}
  >
    <MatchReport client:load data={data} />
  </RefereeLayout>
</BaseLayout>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (Confirm `Button` / `Input` import paths exist under `src/components/ui/`; if `Input` is named differently, align — grep `src/components/ui` for the text-input primitive.)

- [ ] **Step 4: Commit**

```bash
git add src/components/referee/match-report.tsx src/pages/referee/matches
git commit -m "feat(referee-ia): match report page (score + incidents + notes)"
```

---

## Task 11: Middleware rule + orphan-guard + full verification

**Files:**
- Modify: `src/middleware.ts`
- Modify (if needed): `tests/unit/portal/route-coverage.test.ts`

- [ ] **Step 1: Add the `/referee` route rule**

In `src/middleware.ts`, in the `ROUTE_RULES` array, after the `/coach` rule add:

```ts
  // Referee portal — referees AND super admins may access.
  { kind: "role", pattern: /^\/referee(\/|$)/, roles: ["referee", "super_admin"] },
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 3: Run the orphan-guard**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/portal/route-coverage.test.ts`
Expected: PASS. `/referee` + `/referee/pay` are in `REFEREE_NAV` (covered); `matches/[gameId]` is dynamic (auto-skipped). The guard walks `PORTAL_DIRS` which already includes `referee`. If it flags anything, confirm `REFEREE_NAV` hrefs match the page routes; do NOT add `/referee/*` to `CONTEXTUAL_ROUTES` unless genuinely contextual.

- [ ] **Step 4: Run the full unit suite**

Run: `npx vitest run --config vitest.config.ts --project unit`
Expected: all new referee tests pass; no NEW failures. The only failing file should be the pre-existing DB-dependent `soccerone/venues.test.ts`. Report exact counts.

- [ ] **Step 5: Final typecheck**

Run: `npx tsc --noEmit` → exit 0.
(Do NOT run `npm run build` — no DB in this worktree; the controller runs the DB-injected build, which also exercises the new migration.)

- [ ] **Step 6: Commit**

```bash
git add src/middleware.ts tests/unit/portal/route-coverage.test.ts
git commit -m "feat(referee-ia): gate /referee in middleware; orphan-guard covers the portal"
```

---

## Done criteria

- A signed-in referee sees the portal sidebar with **My matches** (their assignments) and **Pay**, plus a reports-owed badge.
- Opening a match → the report page (score + structured incidents + notes); submitting writes the game result (status → completed) and replaces the game's incidents — gated to the assigned official (a non-assigned user gets 404).
- Pay shows each assignment's fee + status + total unpaid.
- The migration is generated + committed (CI's `db:migrate` applies it).
- `tsc` clean, unit suite green (modulo the pre-existing DB-dependent file), build succeeds, orphan-guard passes.
- Super-admin / venue / coach / media portals are byte-unchanged.
