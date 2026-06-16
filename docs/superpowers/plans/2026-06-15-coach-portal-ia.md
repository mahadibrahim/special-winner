# Coach Portal IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the coach portal first-class — a grouped coach sidebar, a "My Teams" hub, a team-scoped unread-messages badge, and all 12 `/coach` pages on the portal chrome instead of the customer `BaseLayout`.

**Architecture:** Mirror SP2 (venue-manager portal). Coaches resolve to the existing `coach` portal in the registry; a new `nav-coach.ts` replaces the inline starter nav; a `CoachLayout` wraps `PortalLayout` and fetches a coach badge count (mirroring `AdminLayout`). Team data comes from the existing `getCoachTeamIds` pattern in `@/lib/auth/roles`.

**Tech Stack:** Astro 5 + React 19, Drizzle ORM, Vitest. Spec: `docs/superpowers/specs/2026-06-15-coach-portal-ia-design.md`.

**Task order is dependency-first** so every TDD step goes green when run: helper → layout → hub page → nav → badge → migrate → verify.

---

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `src/lib/coach/get-coach-teams.ts` | Create | A coach's teams (head or assistant) |
| `src/components/coach/coach-layout.tsx` | Create | Portal chrome + badge fetch |
| `src/components/coach/coach-teams.tsx` | Create | My Teams hub display |
| `src/pages/coach/teams.astro` | Create | My Teams hub page |
| `src/lib/admin/nav-coach.ts` | Create | Coach nav tree (`NavGroup[]`) |
| `src/lib/portal/registry.ts` | Modify | Import `COACH_NAV`, drop inline starter |
| `src/pages/api/coach/nav-badges.ts` | Create | Team-scoped unread-inbox count |
| `src/pages/coach/**` (12 pages) | Modify | `BaseLayout` → portal chrome |
| `tests/unit/coach/get-coach-teams.test.ts` | Create | Head/assistant membership |
| `tests/unit/admin/nav-coach.test.ts` | Create | Nav hrefs resolve; groups; badge |
| `tests/unit/coach/coach-nav-badges.test.ts` | Create | Team-scoped unread count |
| `tests/unit/portal/route-coverage.test.ts` | Modify | Coverage for the hub page |

---

## Task 1: `getCoachTeams` helper

**Files:**
- Create: `src/lib/coach/get-coach-teams.ts`
- Create: `tests/unit/coach/get-coach-teams.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/coach/get-coach-teams.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

// One row per team; playerCount comes back from the scalar subquery.
const rows = [
  { teamId: "t1", teamName: "U10 Red", playerCount: 8 },
  { teamId: "t2", teamName: "U12 Blue", playerCount: 11 },
];
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ orderBy: async () => rows }) }) }),
  }),
}));

import { getCoachTeams } from "@/lib/coach/get-coach-teams";

describe("getCoachTeams", () => {
  it("returns the coach's teams with player counts", async () => {
    expect(await getCoachTeams("u1")).toEqual(rows);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/coach/get-coach-teams.test.ts`
Expected: FAIL — cannot resolve `@/lib/coach/get-coach-teams`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/coach/get-coach-teams.ts`:

```ts
import { eq, or, asc, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teams, rosters } from "@/lib/db/schema/teams";

export type CoachTeam = {
  teamId: string;
  teamName: string;
  playerCount: number;
};

/**
 * Teams the user coaches — head OR assistant. Player count is a scalar subquery
 * over rosters so a team with no players yet still returns (count 0).
 */
export async function getCoachTeams(userId: string): Promise<CoachTeam[]> {
  const db = getDb();
  return db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      playerCount: sql<number>`(SELECT COUNT(*)::int FROM ${rosters} WHERE ${rosters.teamId} = ${teams.id})`,
    })
    .from(teams)
    .where(or(eq(teams.coachUserId, userId), eq(teams.assistantCoachUserId, userId)))
    .orderBy(asc(teams.name));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/coach/get-coach-teams.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach/get-coach-teams.ts tests/unit/coach/get-coach-teams.test.ts
git commit -m "feat(coach-ia): getCoachTeams helper (head or assistant)"
```

---

## Task 2: `CoachLayout` component

**Files:**
- Create: `src/components/coach/coach-layout.tsx`

Mirrors `src/components/admin/admin-layout.tsx` but for the fixed `coach` portal,
no venue picker, fetching `/api/coach/nav-badges`. (That endpoint lands in Task 4;
until then the fetch fails soft and no badge shows — that's fine.)

- [ ] **Step 1: Create the component**

Create `src/components/coach/coach-layout.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { PortalLayout, type PortalBadges, type Breadcrumb } from "@/components/portal/portal-layout"
import { getPortalById } from "@/lib/portal/resolve"

interface CoachLayoutProps {
  children: React.ReactNode
  currentPath: string
  /** True when the signed-in user has more than one portal. */
  multiPortal?: boolean
  breadcrumbs?: Breadcrumb[]
  user: {
    firstName: string | null
    lastName: string | null
    email: string
  } | null
}

/**
 * Portal chrome for the /coach tree. Fetches the unread-inbox badge once on
 * mount from /api/coach/nav-badges (fail-soft), mirroring AdminLayout.
 */
export function CoachLayout({ children, currentPath, multiPortal = false, breadcrumbs, user }: CoachLayoutProps) {
  const portal = getPortalById("coach")!

  const [fetched, setFetched] = useState<PortalBadges | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch("/api/coach/nav-badges")
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
      subtitle="Coach"
      roleLabel="Coach"
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
Expected: exit 0. If `PortalLayout` requires a prop not passed here, add it — compare against `admin-layout.tsx`'s call; the only intentional omissions are `showVenuePicker` and `venueLabel`.

- [ ] **Step 3: Commit**

```bash
git add src/components/coach/coach-layout.tsx
git commit -m "feat(coach-ia): CoachLayout portal chrome + badge fetch"
```

---

## Task 3: My Teams hub page

**Files:**
- Create: `src/components/coach/coach-teams.tsx`
- Create: `src/pages/coach/teams.astro`

- [ ] **Step 1: Create the display component**

Create `src/components/coach/coach-teams.tsx`:

```tsx
"use client"

import { Users, ClipboardList, ClipboardCheck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"

export interface CoachTeam {
  teamId: string
  teamName: string
  playerCount: number
}

export function CoachTeams({ teams }: { teams: CoachTeam[] }) {
  if (teams.length === 0) {
    return (
      <EmptyState
        title="No teams assigned yet"
        description="Once you're assigned as a head or assistant coach, your teams show up here."
        icon={<Users className="h-10 w-10" />}
      />
    )
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My Teams</h1>
        <p className="text-muted-foreground mt-1">Pick a team to manage its roster and attendance.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((t) => (
          <Card key={t.teamId}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg">{t.teamName}</CardTitle>
              <Badge variant="outline">{t.playerCount} players</Badge>
            </CardHeader>
            <CardContent className="flex gap-4 pt-2">
              <a
                href={`/coach/roster/${t.teamId}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <ClipboardList className="h-4 w-4" /> Roster
              </a>
              <a
                href={`/coach/attendance/${t.teamId}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <ClipboardCheck className="h-4 w-4" /> Attendance
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

(Confirm `EmptyState`, `Card*`, and `Badge` import paths match those used in `src/components/admin/venue/venue-rosters.tsx`, which renders the same primitives.)

- [ ] **Step 2: Create the page (data fetched server-side, passed as a prop)**

Create `src/pages/coach/teams.astro`:

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import { CoachLayout } from '@/components/coach/coach-layout';
import { CoachTeams } from '@/components/coach/coach-teams';
import { getCoachTeams } from '@/lib/coach/get-coach-teams';

export const prerender = false;

// Middleware guarantees the coach role for /coach/**
const user = Astro.locals.user!;
const teams = await getCoachTeams(user.id);
---

<BaseLayout title="My Teams — Coach — Aspire Sports" navigation={false} footer={false}>
  <CoachLayout
    client:load
    currentPath="/coach/teams"
    user={{ firstName: user.firstName, lastName: user.lastName, email: user.email }}
  >
    <CoachTeams client:load teams={teams} />
  </CoachLayout>
</BaseLayout>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (`getCoachTeams`'s `CoachTeam` and the component's `CoachTeam` are structurally identical; the prop pass typechecks.)

- [ ] **Step 4: Commit**

```bash
git add src/components/coach/coach-teams.tsx src/pages/coach/teams.astro
git commit -m "feat(coach-ia): My Teams hub page"
```

---

## Task 4: Coach nav (`nav-coach.ts`) + registry wiring

**Files:**
- Create: `src/lib/admin/nav-coach.ts`
- Create: `tests/unit/admin/nav-coach.test.ts`
- Modify: `src/lib/portal/registry.ts`

All coach pages the nav points to now exist (`/coach/teams` landed in Task 3), so
the resolve test goes fully green here.

- [ ] **Step 1: Write the failing nav test**

Create `tests/unit/admin/nav-coach.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { COACH_NAV } from "@/lib/admin/nav-coach";

const PAGES = fileURLToPath(new URL("../../../src/pages", import.meta.url));
const hrefs = COACH_NAV.flatMap((g) => g.items.map((i) => i.href));

function resolves(href: string): boolean {
  if (href === "/messages") return true;
  return (
    existsSync(path.join(PAGES, href.replace(/^\//, "") + ".astro")) ||
    existsSync(path.join(PAGES, href.replace(/^\//, ""), "index.astro"))
  );
}

describe("COACH_NAV", () => {
  it("every href resolves to a real page", () => {
    expect(hrefs.filter((h) => !resolves(h))).toEqual([]);
  });
  it("has labeled groups", () => {
    const names = COACH_NAV.map((g) => g.name);
    for (const g of ["Teams", "Coaching", "Season", "Comms"]) {
      expect(names).toContain(g);
    }
  });
  it("Messages carries the inbox badge", () => {
    const item = COACH_NAV.flatMap((g) => g.items).find((i) => i.href === "/coach/messages");
    expect(item?.badgeKey).toBe("inbox");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/admin/nav-coach.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin/nav-coach`.

- [ ] **Step 3: Create `nav-coach.ts`**

Create `src/lib/admin/nav-coach.ts`:

```ts
import {
  Home,
  Users,
  GraduationCap,
  ClipboardList,
  BookOpen,
  Calendar,
  BarChart3,
  Inbox,
} from "lucide-react";
import type { NavGroup } from "./nav-super-admin";

// Coach sidebar. Hybrid IA: team-scoped work (roster/attendance/assess) funnels
// through "My Teams"; global tools stay flat. The team-scoped + player-scoped
// pages are dynamic drill-ins reached from My Teams, so they are not nav items.
export const COACH_NAV: NavGroup[] = [
  {
    name: null,
    items: [{ name: "Home", href: "/coach", icon: Home }],
  },
  {
    name: "Teams",
    items: [{ name: "My Teams", href: "/coach/teams", icon: Users }],
  },
  {
    name: "Coaching",
    items: [
      { name: "Practices", href: "/coach/practices", icon: GraduationCap },
      { name: "Assessments", href: "/coach/assessments", icon: ClipboardList },
      { name: "Resources", href: "/coach/resources", icon: BookOpen },
    ],
  },
  {
    name: "Season",
    items: [
      { name: "Schedule", href: "/coach/schedule", icon: Calendar },
      { name: "Standings", href: "/coach/standings", icon: BarChart3 },
    ],
  },
  {
    name: "Comms",
    items: [{ name: "Messages", href: "/coach/messages", icon: Inbox, badgeKey: "inbox" }],
  },
];
```

- [ ] **Step 4: Wire the registry to use it**

In `src/lib/portal/registry.ts`: delete the inline `const COACH_NAV: NavGroup[] = [ ... ];` block (Home/Schedule/Practices/Assessments/Standings/Resources/Messages) and add `import { COACH_NAV } from "@/lib/admin/nav-coach";` beside the `VENUE_MANAGER_NAV` import. The `coach` entry in `PORTALS` already references `COACH_NAV`. Then remove any icon imports at the top of `registry.ts` that are now unreferenced — check each (`GraduationCap`, `ClipboardList`, `Calendar`, `BarChart3`, `Inbox`) against `MEDIA_NAV` and the `PORTALS` array before deleting; `tsc` in Step 6 will catch a miss.

- [ ] **Step 5: Run the nav test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/admin/nav-coach.test.ts`
Expected: PASS (3 tests) — every href, including `/coach/teams`, resolves.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin/nav-coach.ts src/lib/portal/registry.ts tests/unit/admin/nav-coach.test.ts
git commit -m "feat(coach-ia): grouped coach nav, wired into the portal registry"
```

---

## Task 5: Coach nav-badges endpoint

**Files:**
- Create: `src/pages/api/coach/nav-badges.ts`
- Create: `tests/unit/coach/coach-nav-badges.test.ts`

Reuses `getCoachTeamIds` from `@/lib/auth/roles` and the coach-inbox scoping
(rosters → registrations → familyMembers → `parentUserId`) used in
`src/pages/api/messaging/conversations/index.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/coach/coach-nav-badges.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

let teamIds: string[] = [];
let parentRows: Array<{ parentUserId: string | null }> = [];
let unreadCount = 0;

vi.mock("@/lib/auth/roles", () => ({
  getCoachTeamIds: async () => teamIds,
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
  beforeEach(() => { teamIds = []; parentRows = []; unreadCount = 0; });

  it("returns 0 when the coach has no teams", async () => {
    teamIds = [];
    const res = await GET(ctx());
    expect(await res.json()).toEqual({ inbox: 0 });
  });

  it("counts unread conversations for parents on the coach's teams", async () => {
    teamIds = ["t1"];
    parentRows = [{ parentUserId: "p1" }, { parentUserId: "p2" }];
    unreadCount = 3;
    const res = await GET(ctx());
    expect(await res.json()).toEqual({ inbox: 3 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/coach/coach-nav-badges.test.ts`
Expected: FAIL — cannot resolve `@/pages/api/coach/nav-badges`.

- [ ] **Step 3: Implement the endpoint**

Create `src/pages/api/coach/nav-badges.ts`:

```ts
import type { APIRoute } from "astro";
import { and, eq, inArray, isNull, isNotNull, gt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema/conversations";
import { rosters } from "@/lib/db/schema/teams";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import { getCoachTeamIds } from "@/lib/auth/roles";

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// Unread-inbox count for the coach's team-scoped inbox. Fail-soft: any error
// returns { inbox: 0 } so the sidebar never breaks on a badge fetch.
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  try {
    const teamIds = await getCoachTeamIds(locals.user.id);
    if (teamIds.length === 0) return json({ inbox: 0 });

    const db = getDb();
    const parents = await db
      .selectDistinct({ parentUserId: familyMembers.parentUserId })
      .from(rosters)
      .innerJoin(registrations, eq(registrations.id, rosters.registrationId))
      .innerJoin(familyMembers, eq(familyMembers.id, registrations.familyMemberId))
      .where(inArray(rosters.teamId, teamIds));
    const parentIds = parents.map((p) => p.parentUserId).filter((x): x is string => !!x);
    if (parentIds.length === 0) return json({ inbox: 0 });

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
    return json({ inbox: row?.count ?? 0 });
  } catch {
    return json({ inbox: 0 });
  }
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/coach/coach-nav-badges.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/coach/nav-badges.ts tests/unit/coach/coach-nav-badges.test.ts
git commit -m "feat(coach-ia): team-scoped unread-inbox badge endpoint"
```

---

## Task 6: Migrate the 12 coach pages onto portal chrome

**Files (Modify):** every `.astro` under `src/pages/coach/` —
`index.astro`, `schedule.astro`, `standings.astro`, `messages.astro`,
`resources.astro`, `assessments.astro`, `practices/index.astro`,
`practices/new.astro`, `practices/[id].astro`, `roster/[teamId].astro`,
`attendance/[teamId].astro`, `assess/[playerId].astro`. (`teams.astro` from Task 3 is already on the portal chrome.)

**The transformation (apply to each page):**
1. Keep the frontmatter's component imports and data fetching, and `const user = Astro.locals.user!;`.
2. Add `import { CoachLayout } from '@/components/coach/coach-layout';` (keep the `BaseLayout` import).
3. Replace the page's outer `<BaseLayout title="...">…</BaseLayout>` and its bespoke `<main>` / breadcrumb / container markup with:

```astro
<BaseLayout title="<existing title>" navigation={false} footer={false}>
  <CoachLayout
    client:load
    currentPath="<the page's nav prefix>"
    user={{ firstName: user.firstName, lastName: user.lastName, email: user.email }}
  >
    <!-- the page's existing inner content component(s), unchanged -->
  </CoachLayout>
</BaseLayout>
```

4. `currentPath` is the static prefix the nav highlights — `/coach`, `/coach/schedule`, `/coach/standings`, `/coach/messages`, `/coach/resources`, `/coach/assessments`, `/coach/practices` (for all three practices pages), `/coach/roster`, `/coach/attendance`, `/coach/assess`. (PortalLayout active-state matches by prefix; confirm against `src/lib/portal/active-state.ts`.)
5. Drop in-page breadcrumb `<nav>` blocks. For the drill-in pages (`roster/[teamId]`, `attendance/[teamId]`, `assess/[playerId]`) pass a breadcrumb back to the hub via the `breadcrumbs` prop, e.g. `breadcrumbs={[{ label: "My Teams", href: "/coach/teams" }]}` (match the `Breadcrumb` type exported from `portal-layout.tsx`).
6. Ensure `export const prerender = false;` is present (these pages read `Astro.locals.user`).

- [ ] **Step 1: Migrate the four simple global pages**

Apply the transformation to `schedule.astro`, `standings.astro`, `resources.astro`, `assessments.astro` (each renders a single `client:load` component — e.g. `schedule.astro`'s `<CoachSchedule client:load />`).

- [ ] **Step 2: Migrate `index.astro` (dashboard home)**

`currentPath="/coach"`. The bespoke header / quick-actions markup is page content — it moves inside `<CoachLayout>` unchanged; only the `<BaseLayout>` wrapper switches to `navigation={false} footer={false}` and the outer `<main>` container is dropped (PortalLayout provides it).

- [ ] **Step 3: Migrate `messages.astro`**

`currentPath="/coach/messages"`.

- [ ] **Step 4: Migrate the practices pages**

`practices/index.astro`, `practices/new.astro`, `practices/[id].astro` — all `currentPath="/coach/practices"`.

- [ ] **Step 5: Migrate the team/player drill-in pages**

`roster/[teamId].astro` (`/coach/roster`), `attendance/[teamId].astro` (`/coach/attendance`), `assess/[playerId].astro` (`/coach/assess`), each with the My Teams breadcrumb from the recipe.

- [ ] **Step 6: Verify every coach page is on the portal chrome**

Run: `grep -rL "CoachLayout" src/pages/coach --include=*.astro`
Expected: no output.

Run: `grep -rl "navigation={false}" src/pages/coach --include=*.astro | wc -l`
Expected: `13` (12 migrated + `teams.astro`).

- [ ] **Step 7: Typecheck + build**

Run: `npx tsc --noEmit` → exit 0.
Run: `npm run build` → succeeds. (All coach pages are `prerender = false`, so the build won't execute their `Astro.locals` reads.)

- [ ] **Step 8: Commit**

```bash
git add src/pages/coach
git commit -m "feat(coach-ia): migrate /coach pages onto portal chrome"
```

---

## Task 7: Orphan-guard + full verification

**Files:**
- Modify: `tests/unit/portal/route-coverage.test.ts`

- [ ] **Step 1: Update the orphan-guard whitelist comment**

In `tests/unit/portal/route-coverage.test.ts`, the `CONTEXTUAL_ROUTES` set has:

```ts
  // TODO(sub-project 3): coach sub-pages to be placed in coach nav redesign.
  "/coach/practices/new",      // reached from /coach/practices (new practice form)
```

Drop the TODO now that SP3 is done (keep the entry — `/coach/practices/new` is genuinely contextual, reached from the practices list):

```ts
  // Reached from /coach/practices (new practice form) — contextual.
  "/coach/practices/new",
```

No other coach entries are needed: `/coach`, `/coach/teams`, `/coach/schedule`, `/coach/standings`, `/coach/messages`, `/coach/resources`, `/coach/assessments`, `/coach/practices` are all in `COACH_NAV`; `roster/[teamId]`, `attendance/[teamId]`, `assess/[playerId]`, `practices/[id]` are dynamic (auto-skipped by the guard's `isDynamic`).

- [ ] **Step 2: Run the orphan-guard**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/portal/route-coverage.test.ts`
Expected: PASS.

- [ ] **Step 3: Run the full unit suite**

Run: `npx vitest run --config vitest.config.ts --project unit`
Expected: all new coach tests pass; the only failures are the known pre-existing `stripe/membership-event-routing` ones (baseline — unrelated).

- [ ] **Step 4: Final typecheck + build**

Run: `npx tsc --noEmit` → exit 0.
Run: `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/portal/route-coverage.test.ts
git commit -m "test(coach-ia): orphan-guard covers the coach portal"
```

---

## Done criteria

- A signed-in coach sees the portal sidebar (grouped nav) instead of the customer top nav, on every `/coach` page.
- My Teams lists the coach's teams (head or assistant) with player counts and links to each team's roster/attendance.
- The Messages nav item shows an unread count scoped to the coach's teams.
- `tsc` clean, unit suite green (modulo pre-existing stripe failures), build succeeds, orphan-guard passes.
- Super-admin and venue-manager portals are byte-unchanged.
