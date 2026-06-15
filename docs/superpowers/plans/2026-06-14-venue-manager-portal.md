# Venue-Manager Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `location_admin` (venue-manager) portal first-class: role-aware badges + grouped nav, a venue rosters page, a venue operations-reports page, and venue-scoped casual-play (drop-ins/rentals).

**Architecture:** All venue queries scope through `getEffectiveLocationIds({userId,userRoles,activeLocationId}) → string[] | null` (null = super-admin = no filter). Venues belong to locations; drop-in sessions/rentals carry `venueId`; rosters reach location via team→season→program. Super-admin paths stay unfiltered (no behavior change).

**Tech Stack:** Astro 5 SSR, React 19, Drizzle, Vitest, lucide-react.

**Branch:** `feat/venue-manager-portal` (stack on `feat/admin-super-ia`). Node 25 → `npx tsc --noEmit` + `npx vitest`; `npm run build` is CI-only.

**Spec:** `docs/superpowers/specs/2026-06-14-venue-manager-portal-design.md`.

**Key existing primitives (verified):**
- `getEffectiveLocationIds(opts)` in `src/lib/admin/active-venue.ts` → `string[] | null`.
- `getLocationIdsForUser(userId)` in `src/lib/auth/location-scope.ts` → `string[]`.
- `getNavBadges(orgId)` in `src/lib/admin/nav-badges.ts` (SP1) → `{inbox,refundsPending,attention}`.
- `venues.locationId` (schema/teams), `conversations.assignedStaffId` (schema/conversations).
- rosters: `teamId → teams.seasonId → seasons.programId → programs.locationId`; roster row has `registrationId, jerseyNumber, position, status, notes`.

---

## Task 1 — Part A: role-aware badges + grouped venue nav

**Files:**
- Modify: `src/lib/admin/nav-badges.ts`
- Modify: `src/pages/api/admin/nav-badges.ts`
- Modify: `src/lib/admin/nav-venue-manager.ts`
- Test: `tests/unit/admin/nav-badges.test.ts` (extend), `tests/unit/admin/nav-venue-manager.test.ts` (new)

- [ ] **Step 1: Extend the badges test (TDD)**

Add a scoped-variant case to `tests/unit/admin/nav-badges.test.ts`. Append inside the existing `describe`:

```ts
  it("scoped variant: location-scoped refunds + assigned-inbox, no attention", async () => {
    // reset the shared mock counter used by the existing test
    const { getNavBadges } = await import("@/lib/admin/nav-badges");
    const b = await getNavBadges("org_1", { locationIds: ["loc_1"], userId: "u_1" });
    expect(b).toEqual({ refundsPending: 3, inbox: 5, attention: 0 });
  });
```

(The existing mock returns 3 then 5 for the two count queries; the scoped path runs the same two count queries and sets `attention: 0` without calling `getAttentionFeed`.)

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/unit/admin/nav-badges.test.ts`
Expected: FAIL (scoped signature not supported; attention not 0).

- [ ] **Step 3: Generalize `getNavBadges`**

In `src/lib/admin/nav-badges.ts`, change the signature and branch the queries. Replace the function with:

```ts
import { sql, and, eq, isNull, gt, isNotNull, or, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { registrations } from "@/lib/db/schema/registrations";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { conversations } from "@/lib/db/schema/conversations";
import { getAttentionFeed } from "@/lib/admin/attention-feed";

export type NavBadges = {
  inbox: number;
  refundsPending: number;
  attention: number;
};

export type NavBadgeScope = { locationIds: string[]; userId: string };

/**
 * Sidebar badge counts.
 * - No scope (super-admin): org-wide counts + attention feed length.
 * - Scope (venue manager): refunds limited to scope.locationIds; inbox limited
 *   to conversations assigned to scope.userId; attention is 0 (the attention
 *   feed is a super-admin cross-org view, not shown on the venue Home).
 * Callers must fail-soft (the API route swallows errors).
 */
export async function getNavBadges(orgId: string, scope?: NavBadgeScope): Promise<NavBadges> {
  const db = getDb();

  // --- refundsPending ---
  const refundWhere = scope
    ? and(
        eq(registrations.refundStatus, "pending_approval"),
        eq(locations.organizationId, orgId),
        scope.locationIds.length > 0
          ? inArray(locations.id, scope.locationIds)
          : sql`false`, // no locations → no rows
      )
    : and(
        eq(registrations.refundStatus, "pending_approval"),
        eq(locations.organizationId, orgId),
      );

  const [refundRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(registrations)
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(refundWhere);

  // --- inbox ---
  const unread = or(
    isNull(conversations.lastOutboundAt),
    gt(conversations.lastInboundAt, conversations.lastOutboundAt),
  );
  const inboxWhere = scope
    ? and(
        eq(conversations.organizationId, orgId),
        eq(conversations.assignedStaffId, scope.userId),
        isNotNull(conversations.lastInboundAt),
        unread,
      )
    : and(eq(conversations.organizationId, orgId), isNotNull(conversations.lastInboundAt), unread);

  const [inboxRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversations)
    .where(inboxWhere);

  const attention = scope ? 0 : (await getAttentionFeed(orgId)).length;

  return {
    refundsPending: refundRow?.count ?? 0,
    inbox: inboxRow?.count ?? 0,
    attention,
  };
}
```

- [ ] **Step 4: Run badges test + tsc**

Run: `npx vitest run tests/unit/admin/nav-badges.test.ts && npx tsc --noEmit`
Expected: PASS (both cases); tsc clean. Verify schema import paths against reality if tsc complains.

- [ ] **Step 5: Make the endpoint role-aware**

In `src/pages/api/admin/nav-badges.ts`, replace the super-admin-only gate. New logic: any admin (super_admin OR location_admin) is allowed; super_admin gets org counts, location_admin gets scoped counts. Keep fail-soft.

```ts
import type { APIRoute } from "astro";
import { getNavBadges } from "@/lib/admin/nav-badges";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";

export const prerender = false;

const ZERO = { inbox: 0, refundsPending: 0, attention: 0 };
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const roles = (locals.userRoles ?? []).map((r) => r.name);
  const isAdmin = roles.includes("super_admin") || roles.includes("location_admin");
  if (!isAdmin) return json({ error: "Forbidden" }, 403);
  const orgId = locals.organization?.id;
  if (!orgId) return json(ZERO);

  try {
    if (roles.includes("super_admin")) {
      return json(await getNavBadges(orgId));
    }
    const locationIds = await getLocationIdsForUser(locals.user.id);
    return json(await getNavBadges(orgId, { locationIds, userId: locals.user.id }));
  } catch (err) {
    console.error("[nav-badges] failed", err);
    return json(ZERO);
  }
};
```

- [ ] **Step 6: Write the venue-nav test (TDD)**

Create `tests/unit/admin/nav-venue-manager.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { VENUE_MANAGER_NAV } from "@/lib/admin/nav-venue-manager";

const PAGES = fileURLToPath(new URL("../../../src/pages", import.meta.url));
const hrefs = VENUE_MANAGER_NAV.flatMap((g) => g.items.map((i) => i.href));

function resolves(href: string): boolean {
  if (href === "/messages") return true;
  return (
    existsSync(path.join(PAGES, href.replace(/^\//, "") + ".astro")) ||
    existsSync(path.join(PAGES, href.replace(/^\//, ""), "index.astro"))
  );
}

describe("VENUE_MANAGER_NAV", () => {
  it("every href resolves to a real page", () => {
    expect(hrefs.filter((h) => !resolves(h))).toEqual([]);
  });
  it("has labeled groups", () => {
    const names = VENUE_MANAGER_NAV.map((g) => g.name);
    for (const g of ["Front desk", "People", "Comms", "Requests"]) {
      expect(names).toContain(g);
    }
  });
  it("Refund requests carries the refundsPending badge", () => {
    const item = VENUE_MANAGER_NAV.flatMap((g) => g.items).find((i) => i.href === "/admin/refund-requests");
    expect(item?.badgeKey).toBe("refundsPending");
  });
});
```

- [ ] **Step 7: Rewrite `VENUE_MANAGER_NAV` with groups**

Replace `src/lib/admin/nav-venue-manager.ts` contents with (group labels added; Drop-ins/Rentals/Rosters/Reports come in Tasks 2–4):

```ts
import {
  Calendar,
  ClipboardCheck,
  UserPlus,
  Search,
  Inbox,
  Megaphone,
  ListOrdered,
  RefreshCcw,
} from "lucide-react";
import type { NavGroup } from "./nav-super-admin";

// Venue-manager sidebar. Every item's data is scoped to the manager's locations
// via getEffectiveLocationIds. Grouped for scanability; Casual play / Rosters /
// Reports items are added by sub-project-2 Tasks 2–4 as their pages land.
export const VENUE_MANAGER_NAV: NavGroup[] = [
  {
    name: "Front desk",
    items: [
      { name: "Venue calendar", href: "/admin/venue", icon: Calendar },
      { name: "Check-in", href: "/admin/venue/check-in", icon: ClipboardCheck },
      { name: "Walk-up reg", href: "/admin/venue/walk-up", icon: UserPlus },
    ],
  },
  {
    name: "People",
    items: [{ name: "Look up", href: "/admin/lookup", icon: Search }],
  },
  {
    name: "Comms",
    items: [
      { name: "Inbox", href: "/messages", icon: Inbox, badgeKey: "inbox" },
      { name: "Announcements", href: "/admin/announcements", icon: Megaphone },
      { name: "Waitlist", href: "/admin/waitlist", icon: ListOrdered },
    ],
  },
  {
    name: "Requests",
    items: [
      { name: "Refund requests", href: "/admin/refund-requests", icon: RefreshCcw, badgeKey: "refundsPending" },
    ],
  },
];
```

- [ ] **Step 8: Run tests + tsc**

Run: `npx vitest run tests/unit/admin/nav-venue-manager.test.ts tests/unit/admin/nav-badges.test.ts tests/unit/portal && npx tsc --noEmit`
Expected: all PASS (incl. the SP0 registry test, which keys on "Check-in" — still present). tsc clean.

- [ ] **Step 9: Commit**

```bash
git add src/lib/admin/nav-badges.ts src/pages/api/admin/nav-badges.ts src/lib/admin/nav-venue-manager.ts tests/unit/admin/nav-badges.test.ts tests/unit/admin/nav-venue-manager.test.ts
git commit -m "feat(venue-ia): role-aware nav badges + grouped venue sidebar"
```

---

## Task 2 — Part B: venue rosters page (read-only, scoped)

**Files:**
- Create: `src/lib/admin/venue-rosters.ts`
- Create: `src/pages/api/admin/venue/rosters.ts`
- Create: `src/components/admin/venue/venue-rosters.tsx`
- Create: `src/pages/admin/venue/rosters.astro`
- Modify: `src/lib/admin/nav-venue-manager.ts` (add Rosters to People group)
- Test: `tests/unit/admin/venue-rosters.test.ts`

- [ ] **Step 1: Write the lib test (TDD)**

Create `tests/unit/admin/venue-rosters.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

const rows = [
  { teamId: "t1", teamName: "Red", playerName: "Ada L", status: "active", jerseyNumber: "7" },
  { teamId: "t1", teamName: "Red", playerName: "Bo K", status: "active", jerseyNumber: "9" },
  { teamId: "t2", teamName: "Blue", playerName: "Cy M", status: "active", jerseyNumber: null },
];
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ innerJoin: () => ({ innerJoin: () => ({ innerJoin: () => ({ innerJoin: () => ({ where: () => ({ orderBy: async () => rows }) }) }) }) }) }) }),
  }),
}));

import { getVenueRosters } from "@/lib/admin/venue-rosters";

describe("getVenueRosters", () => {
  it("groups players by team", async () => {
    const teams = await getVenueRosters(["loc_1"]);
    expect(teams).toEqual([
      { teamId: "t1", teamName: "Red", players: [
        { playerName: "Ada L", status: "active", jerseyNumber: "7" },
        { playerName: "Bo K", status: "active", jerseyNumber: "9" },
      ]},
      { teamId: "t2", teamName: "Blue", players: [
        { playerName: "Cy M", status: "active", jerseyNumber: null },
      ]},
    ]);
  });

  it("returns [] for no locations", async () => {
    expect(await getVenueRosters([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/unit/admin/venue-rosters.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement the lib**

Create `src/lib/admin/venue-rosters.ts`:

```ts
import { and, eq, inArray, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { rosters, teams } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";

export type VenueRosterPlayer = {
  playerName: string;
  status: string;
  jerseyNumber: string | null;
};
export type VenueRosterTeam = {
  teamId: string;
  teamName: string;
  players: VenueRosterPlayer[];
};

/**
 * Read-only roster reference for a venue manager: every team (with players)
 * whose season→program→location is in `locationIds`. Empty input → []. Editing
 * lives in the super-admin team detail, not here.
 */
export async function getVenueRosters(locationIds: string[]): Promise<VenueRosterTeam[]> {
  if (locationIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      playerName: familyMembers.firstName, // combined below
      lastName: familyMembers.lastName,
      status: rosters.status,
      jerseyNumber: rosters.jerseyNumber,
    })
    .from(rosters)
    .innerJoin(teams, eq(rosters.teamId, teams.id))
    .innerJoin(seasons, eq(teams.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
    .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
    .where(inArray(programs.locationId, locationIds))
    .orderBy(asc(teams.name), asc(familyMembers.lastName));

  const byTeam = new Map<string, VenueRosterTeam>();
  for (const r of rows) {
    let t = byTeam.get(r.teamId);
    if (!t) {
      t = { teamId: r.teamId, teamName: r.teamName, players: [] };
      byTeam.set(r.teamId, t);
    }
    const name = `${r.playerName ?? ""} ${r.lastName ?? ""}`.trim();
    t.players.push({ playerName: name, status: r.status, jerseyNumber: r.jerseyNumber });
  }
  return [...byTeam.values()];
}
```

NOTE: verify the join columns against the actual schema before finalizing — run `grep -nE "familyMemberId|firstName|lastName" src/lib/db/schema/registrations.ts`. If `registrations` links to a person via a different column (e.g. `familyMemberId`), adjust. The test mocks db, so it passes regardless; tsc + the column names are what must be correct. Adjust the `select` to real columns and keep the grouping logic. The test asserts a single combined `playerName` — to satisfy it exactly, the test mock returns `playerName` already combined and no `lastName`; keep the grouping logic tolerant (`${first} ${last}`.trim() with the mock's `lastName` undefined yields just the mock's playerName). Confirm the test still passes after wiring real columns.

- [ ] **Step 4: Run lib test + tsc**

Run: `npx vitest run tests/unit/admin/venue-rosters.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: API route**

Create `src/pages/api/admin/venue/rosters.ts`:

```ts
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { locations } from "@/lib/db/schema/organizations";
import { getEffectiveLocationIds } from "@/lib/admin/active-venue";
import { getVenueRosters } from "@/lib/admin/venue-rosters";

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** Every location id in the org (used to materialize the super-admin "all" case). */
async function allOrgLocationIds(orgId: string | undefined): Promise<string[]> {
  if (!orgId) return [];
  const rows = await getDb()
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.organizationId, orgId));
  return rows.map((r) => r.id);
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const roles = (locals.userRoles ?? []).map((r) => r.name);
  if (!roles.includes("super_admin") && !roles.includes("location_admin")) {
    return json({ error: "Forbidden" }, 403);
  }

  // null = super-admin (all locations) → materialize to every org location id.
  const scoped = await getEffectiveLocationIds({
    userId: locals.user.id,
    userRoles: locals.userRoles ?? [],
    activeLocationId: locals.activeLocationId ?? null,
  });
  const ids = scoped ?? (await allOrgLocationIds(locals.organization?.id));
  return json({ teams: await getVenueRosters(ids) });
};
```

- [ ] **Step 6: Component + page**

Create `src/components/admin/venue/venue-rosters.tsx` — a `"use client"` React component that fetches `/api/admin/venue/rosters` on mount, renders a `LoadingSkeleton` while loading, an `EmptyState` ("No teams at your venue yet") when `teams` is empty, and otherwise a card per team with a simple player table (name, jersey, status). Call `useHydrationBeacon()`. Follow the styling of an existing admin list component (read `src/components/admin/teams-list.tsx` for the card/table idiom and the shared `@/components/ui/empty-state` / `@/components/ui/loading-skeleton` imports).

Create `src/pages/admin/venue/rosters.astro` mirroring `src/pages/admin/venue/check-in/index.astro`'s frontmatter pattern (SSR, `getPrimaryRoleName`, `resolveVenueLabel`, wrap in `BaseLayout navigation={false} footer={false}` → `AdminLayout role={primaryRole} currentPath="/admin/venue/rosters" venueLabel={...} user={...}`), rendering `<VenueRosters client:load />`.

- [ ] **Step 7: Add Rosters to the venue nav**

In `src/lib/admin/nav-venue-manager.ts`, add to the "People" group items:
```ts
      { name: "Rosters", href: "/admin/venue/rosters", icon: ClipboardList },
```
Add `ClipboardList` to the lucide import.

- [ ] **Step 8: Run tests + tsc**

Run: `npx vitest run tests/unit/admin tests/unit/portal && npx tsc --noEmit`
Expected: PASS (the venue-nav test now sees `/admin/venue/rosters` resolve since the page exists); orphan-guard still green (the new page is nav-covered). tsc clean.

- [ ] **Step 9: Commit**

```bash
git add src/lib/admin/venue-rosters.ts src/pages/api/admin/venue/rosters.ts src/components/admin/venue/venue-rosters.tsx src/pages/admin/venue/rosters.astro src/lib/admin/nav-venue-manager.ts tests/unit/admin/venue-rosters.test.ts
git commit -m "feat(venue-ia): venue rosters reference page (location-scoped, read-only)"
```

---

## Task 3 — Part C: venue reports page (operations, scoped)

**Files:**
- Create: `src/lib/admin/venue-reports.ts`
- Create: `src/pages/api/admin/venue/reports.ts`
- Create: `src/components/admin/venue/venue-reports.tsx`
- Create: `src/pages/admin/venue/reports.astro`
- Modify: `src/lib/admin/nav-venue-manager.ts` (add Reports group)
- Test: `tests/unit/admin/venue-reports.test.ts`

CONTEXT: operations metrics come from `drop_in_bookings` (schema `@/lib/db/schema/drop-in`): `status` (`confirmed`/`no_show`/...), `source` (`walk_up`/`online_booking`), `checkedInAt`, joined to `drop_in_sessions.venueId → venues.locationId`, filtered by `startsAt` within the period. Read the drop-in schema first (`grep -nE "status|source|checkedInAt|venueId|startsAt|capacity" src/lib/db/schema/drop-in.ts`).

- [ ] **Step 1: Write the lib test (TDD)**

Create `tests/unit/admin/venue-reports.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

// One aggregate row per metric query. getVenueReports runs 1 grouped query.
const agg = [{ checkedIn: 12, walkUps: 4, noShows: 2, booked: 18, capacity: 24 }];
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ innerJoin: () => ({ innerJoin: () => ({ where: async () => agg }) }) }) }),
  }),
}));

import { getVenueReports } from "@/lib/admin/venue-reports";

describe("getVenueReports", () => {
  it("returns operational metrics with fill rate", async () => {
    const r = await getVenueReports(["loc_1"], "today", new Date("2026-06-14T12:00:00Z"));
    expect(r).toEqual({ checkedIn: 12, walkUps: 4, noShows: 2, booked: 18, capacity: 24, fillRate: 0.75 });
  });

  it("zeroes out for no locations", async () => {
    const r = await getVenueReports([], "today", new Date("2026-06-14T12:00:00Z"));
    expect(r).toEqual({ checkedIn: 0, walkUps: 0, noShows: 0, booked: 0, capacity: 0, fillRate: 0 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/unit/admin/venue-reports.test.ts` → FAIL.

- [ ] **Step 3: Implement the lib**

Create `src/lib/admin/venue-reports.ts`. It computes the date window for `period` (`today` = the given `now`'s UTC day; `week` = last 7 days through `now`), runs ONE aggregate query over `drop_in_bookings` joined `drop_in_sessions` joined `venues`, filtered by `venues.locationId IN locationIds` and `drop_in_sessions.startsAt` in window, and derives `fillRate = capacity > 0 ? booked / capacity : 0`. Return zeros (no query) when `locationIds` is empty.

```ts
import { sql, and, inArray, gte, lte, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";

export type VenueReport = {
  checkedIn: number;
  walkUps: number;
  noShows: number;
  booked: number;
  capacity: number;
  fillRate: number;
};

const ZERO: VenueReport = { checkedIn: 0, walkUps: 0, noShows: 0, booked: 0, capacity: 0, fillRate: 0 };

export async function getVenueReports(
  locationIds: string[],
  period: "today" | "week",
  now: Date,
): Promise<VenueReport> {
  if (locationIds.length === 0) return ZERO;
  const db = getDb();

  const end = now;
  const start = new Date(now);
  if (period === "today") {
    start.setUTCHours(0, 0, 0, 0);
  } else {
    start.setUTCDate(start.getUTCDate() - 7);
  }

  const [row] = await db
    .select({
      checkedIn: sql<number>`count(*) filter (where ${dropInBookings.checkedInAt} is not null)::int`,
      walkUps: sql<number>`count(*) filter (where ${dropInBookings.source} = 'walk_up')::int`,
      noShows: sql<number>`count(*) filter (where ${dropInBookings.status} = 'no_show')::int`,
      booked: sql<number>`count(*) filter (where ${dropInBookings.status} = 'confirmed')::int`,
      capacity: sql<number>`coalesce(sum(distinct ${dropInSessions.capacity}), 0)::int`,
    })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInBookings.sessionId, dropInSessions.id))
    .innerJoin(venues, eq(dropInSessions.venueId, venues.id))
    .where(
      and(
        inArray(venues.locationId, locationIds),
        gte(dropInSessions.startsAt, start),
        lte(dropInSessions.startsAt, end),
      ),
    );

  const booked = row?.booked ?? 0;
  const capacity = row?.capacity ?? 0;
  return {
    checkedIn: row?.checkedIn ?? 0,
    walkUps: row?.walkUps ?? 0,
    noShows: row?.noShows ?? 0,
    booked,
    capacity,
    fillRate: capacity > 0 ? booked / capacity : 0,
  };
}
```

NOTE: `sum(distinct capacity)` is a rough capacity proxy (sums distinct session capacities). If the drop-in schema exposes a cleaner per-session capacity, the implementer may refine, but keep the return shape. Verify enum string values (`'walk_up'`, `'no_show'`, `'confirmed'`) against `src/lib/db/schema/drop-in.ts` and correct if different. The test mocks db, so it stays green; correctness is in the column/enum names (tsc + manual check).

- [ ] **Step 4: Run test + tsc** → PASS, clean.

- [ ] **Step 5: API route**

Create `src/pages/api/admin/venue/reports.ts` — same auth + `getEffectiveLocationIds` + `allOrgLocationIds(null→all)` pattern as the rosters route (Task 2 Step 5). Read `period` from `url.searchParams` (`"week"` if `=week`, else `"today"`). Call `getVenueReports(ids, period, new Date())`. Return `{ report }`.

- [ ] **Step 6: Component + page**

Create `src/components/admin/venue/venue-reports.tsx` — `"use client"`, `useHydrationBeacon()`, a today/week toggle (two buttons; click-driven, not keyboard, per Playwright conventions), fetches `/api/admin/venue/reports?period=...`, renders a small stat-card grid (Checked in, Walk-ups, No-shows, Booked, Fill rate as %). Use shared `LoadingSkeleton`/`ErrorBanner`. Mirror an existing report component (`src/components/admin/revenue-report.tsx`) for the stat-card idiom.

Create `src/pages/admin/venue/reports.astro` mirroring the rosters page frontmatter, `currentPath="/admin/venue/reports"`, render `<VenueReports client:load />`.

- [ ] **Step 7: Add Reports group to venue nav**

In `src/lib/admin/nav-venue-manager.ts`, append a group:
```ts
  {
    name: "Reports",
    items: [{ name: "Reports", href: "/admin/venue/reports", icon: BarChart3 }],
  },
```
Add `BarChart3` to the import.

- [ ] **Step 8: Run tests + tsc** → all PASS, clean. (Venue-nav test sees the new page resolve; add `"Reports"` to that test's expected groups list.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/admin/venue-reports.ts src/pages/api/admin/venue/reports.ts src/components/admin/venue/venue-reports.tsx src/pages/admin/venue/reports.astro src/lib/admin/nav-venue-manager.ts tests/unit/admin/venue-reports.test.ts tests/unit/admin/nav-venue-manager.test.ts
git commit -m "feat(venue-ia): venue operations reports page (today/week, scoped)"
```

---

## Task 4 — Part D: venue-scoped casual-play

**Files:**
- Modify: `src/pages/api/admin/dropin/sessions/index.ts` (GET scope filter)
- Modify: `src/pages/api/admin/rentals/index.ts` (GET scope filter)
- Modify: `src/lib/admin/nav-venue-manager.ts` (add Casual play group)
- Test: `tests/unit/admin/casual-play-scope.test.ts` (scope helper)
- Audit: write endpoints under `dropin/` and `rentals/`

- [ ] **Step 1: Extract + test a shared scope helper (TDD)**

Create `src/lib/admin/location-scope-filter.ts`:

```ts
import { inArray, sql, type SQL } from "drizzle-orm";
import { venues } from "@/lib/db/schema/teams";

/**
 * Returns a Drizzle condition that limits a venue-joined query to the caller's
 * locations. `null` (super-admin) → undefined (no filter). Empty array → a
 * `false` condition (no rows), never "all rows".
 */
export function venueLocationCondition(locationIds: string[] | null): SQL | undefined {
  if (locationIds === null) return undefined;
  if (locationIds.length === 0) return sql`false`;
  return inArray(venues.locationId, locationIds);
}
```

Create `tests/unit/admin/casual-play-scope.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { venueLocationCondition } from "@/lib/admin/location-scope-filter";

describe("venueLocationCondition", () => {
  it("super-admin (null) → no filter", () => {
    expect(venueLocationCondition(null)).toBeUndefined();
  });
  it("empty locations → a defined (false) condition, not undefined", () => {
    expect(venueLocationCondition([])).toBeDefined();
  });
  it("locations → a defined condition", () => {
    expect(venueLocationCondition(["loc_1"])).toBeDefined();
  });
});
```

Run: `npx vitest run tests/unit/admin/casual-play-scope.test.ts && npx tsc --noEmit` → PASS, clean.

- [ ] **Step 2: Scope the drop-in sessions GET**

Read `src/pages/api/admin/dropin/sessions/index.ts`. The GET already `leftJoin`/selects `venues`. Add, after resolving orgId:

```ts
import { getEffectiveLocationIds } from "@/lib/admin/active-venue";
import { venueLocationCondition } from "@/lib/admin/location-scope-filter";
// ...
const locIds = await getEffectiveLocationIds({
  userId: context.locals.user!.id,
  userRoles: context.locals.userRoles ?? [],
  activeLocationId: context.locals.activeLocationId ?? null,
});
const scopeCond = venueLocationCondition(locIds);
```

Then add `scopeCond` into the GET's `where(and(... , scopeCond))` (Drizzle `and(...)` ignores `undefined`, so super-admin is unaffected). If the query uses `leftJoin(venues, ...)`, change it to `innerJoin` ONLY when `scopeCond` is set is unnecessary — `leftJoin` + a `venues.locationId` condition still filters correctly for rows with a venue (sessions always have a `venueId`, NOT NULL per schema), so leaving `leftJoin` is fine. Confirm `dropInSessions.venueId` is NOT NULL (schema shows it is) so no rows are wrongly dropped.

- [ ] **Step 3: Scope the rentals GET**

Read `src/pages/api/admin/rentals/index.ts`. It builds a `conditions` array and `leftJoin(venues,...)`. Add the same `getEffectiveLocationIds` + `venueLocationCondition`, then `if (scopeCond) conditions.push(scopeCond);`. `field_rentals.venueId` is NOT NULL (schema), so the leftJoin filter is safe.

- [ ] **Step 4: Add Casual play group to venue nav**

In `src/lib/admin/nav-venue-manager.ts`, add a group after "Front desk":
```ts
  {
    name: "Casual play",
    items: [
      { name: "Drop-ins", href: "/admin/dropins", icon: Zap },
      { name: "Rentals", href: "/admin/rentals", icon: Key },
    ],
  },
```
Add `Zap, Key` to the import. (Both pages already exist, so the venue-nav resolve test stays green.)

- [ ] **Step 5: Write-endpoint location audit**

Audit the mutation endpoints a venue manager can now reach via the casual-play nav:
- `src/pages/api/admin/dropin/sessions/[id]/*.ts` (cancel, attendance, walk-up, repeat, edit via PUT on index)
- `src/pages/api/admin/rentals/[id].ts`, `rentals/[id]/refund.ts`, `rentals/index.ts` POST

For each, confirm it enforces that the target venue's location ∈ the caller's locations (not merely org ownership). Many already call `requireSameOrgVenue` — that checks ORG, not LOCATION. For a non-super-admin caller, add a location check: resolve `getLocationIdsForUser(user.id)` and verify the target venue's `locationId` is in it (super-admin bypasses). Run: `grep -rnE "requireSameOrgVenue|getLocationIdsForUser" src/pages/api/admin/dropin src/pages/api/admin/rentals` to inventory.

**SCOPE GUARD (from the spec):** if more than ~2 write endpoints need a new location check, STOP and report `DONE_WITH_CONCERNS` — the list-scoping + nav (Steps 1–4) ship in this task; the write hardening splits to a follow-up (SP2b). Do not silently leave a gap: if you defer, add a one-line `// TODO(SP2b): location-scope write` at each unguarded endpoint and report the list.

- [ ] **Step 6: Run tests + tsc**

Run: `npx vitest run tests/unit/admin tests/unit/portal && npx tsc --noEmit`
Expected: all PASS; tsc clean. Orphan-guard still green (drop-ins/rentals already nav-covered).

- [ ] **Step 7: Commit**

```bash
git add -p   # review hunks; do NOT git add -A
git commit -m "feat(venue-ia): venue-scoped drop-ins + rentals in the venue nav"
```
(Use `git add` with explicit paths, never `-A`.)

---

## Task 5 — Full verification + push

- [ ] **Step 1:** `npx vitest run tests/unit/admin tests/unit/portal` → all PASS.
- [ ] **Step 2:** `npx tsc --noEmit` → zero errors.
- [ ] **Step 3:** `npx vitest run tests/unit` → only the known inherited `membership-event-routing` failure (fixed on the separate `fix/stripe-routing-test-drop-handlers` branch); confirm nothing else regressed.
- [ ] **Step 4:** `git push -u origin feat/venue-manager-portal`. Open a PR stacked on `feat/admin-super-ia`. Wait for CI green (after the upstream branches merge).

---

## Self-Review notes (addressed during authoring)

- **Spec coverage:** Part A (Task 1: badges scope + role-aware endpoint + grouped nav), Part B (Task 2: rosters), Part C (Task 3: reports), Part D (Task 4: list scoping + nav + write audit). Verification (Task 5).
- **Super-admin safety:** every scope filter is behind `locationIds === null ? undefined`, so `and(...)` drops it for super-admin — no behavior change. Empty-array → `false` condition (no cross-tenant "all rows" leak).
- **Known sharp edges flagged inline:** real schema column/enum names must be verified (rosters person-link, drop-in enum strings); `git add -A` explicitly forbidden in Task 4.
- **Scope guard:** Part D write-hardening can split to SP2b if it balloons (Task 4 Step 5).
