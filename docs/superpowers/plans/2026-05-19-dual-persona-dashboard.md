# Dual-Persona Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the signed-in `/dashboard` into two sibling destinations — Family (parents) and My Play (adult league/pickup/tournament players) — on a shared shell with a four-section job-driven IA, plus a dedicated `/account` area.

**Architecture:** Astro pages + a shared `DashboardShell.astro` + React island sections, matching the existing `BaseLayout` + `client:visible` pattern. A thin `/dashboard` Astro page redirects by derived persona. Three new player-facing API endpoints expose `teams`/`games`/`standings` data that today only admin/coach endpoints can read.

**Tech Stack:** Astro 5, React 19, Drizzle ORM (PostgreSQL), Lucia auth, Tailwind 4, Vitest (API tests), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-05-19-dual-persona-dashboard-design.md`

**Branch:** `feat/dual-persona-dashboard` (already created; the spec is committed on it).

---

## Conventions for every task

- Player-facing API endpoints follow the pattern in `src/pages/api/dashboard/team-groups.ts`: `export const prerender = false`, `GET: APIRoute = async ({ locals }) => { if (!locals.user) return 401 }`.
- API tests follow `tests/api/dashboard/*.test.ts`: import `getParentCookie` / `getAdminCookie` / `apiFetch` / `expectJson` / `resetCookies` from `../setup/test-helpers`; clean up inserted rows in `afterAll`.
- Run API tests with the dev server up: `CRON_SECRET=dev TEST_BASE_URL=http://localhost:4321 npm run test:api -- <file>`.
- Commit after every task. One commit per task.
- After each task that touches `.ts`/`.tsx`/`.astro`, run `npx tsc --noEmit` — keep it at zero errors.

---

## Phase 1 — Data foundation

### Task 1: `getDashboardDestinations` persona helper

**Files:**
- Create: `src/lib/dashboard/persona.ts`
- Test: `tests/api/dashboard/persona.test.ts` — exercised through a temporary route is overkill; test the helper directly against the DB.

- [ ] **Step 1: Write the helper**

```typescript
// src/lib/dashboard/persona.ts
import { getDb } from "@/lib/db";
import { familyMembers } from "@/lib/db/schema/registrations";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { eq } from "drizzle-orm";

export interface DashboardDestinations {
  hasFamily: boolean;
  hasPlay: boolean;
}

/**
 * Derives which dashboard destinations a user has. Persona is never
 * stored — it is computed from family_members rows plus drop-in /
 * rental activity.
 */
export async function getDashboardDestinations(
  userId: string,
): Promise<DashboardDestinations> {
  const db = getDb();

  const [dependent] = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(eq(familyMembers.parentUserId, userId))
    .limit(1);

  const [self] = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(eq(familyMembers.selfUserId, userId))
    .limit(1);

  let hasPlay = !!self;
  if (!hasPlay) {
    const [booking] = await db
      .select({ id: dropInBookings.id })
      .from(dropInBookings)
      .where(eq(dropInBookings.userId, userId))
      .limit(1);
    hasPlay = !!booking;
  }
  if (!hasPlay) {
    const [rental] = await db
      .select({ id: fieldRentals.id })
      .from(fieldRentals)
      .where(eq(fieldRentals.userId, userId))
      .limit(1);
    hasPlay = !!rental;
  }

  return { hasFamily: !!dependent, hasPlay };
}
```

Confirm the `fieldRentals` import path and `userId` column name against `src/lib/db/schema/field-rentals.ts` before writing — adjust if the column differs.

- [ ] **Step 2: Write the test**

```typescript
// tests/api/dashboard/persona.test.ts
import { describe, it, expect } from "vitest";
import { getDashboardDestinations } from "@/lib/dashboard/persona";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { eq } from "drizzle-orm";

describe("getDashboardDestinations", () => {
  it("returns neither for a user with no family members or activity", async () => {
    const [u] = await getDb().insert(users).values({
      email: `persona-none-${Date.now()}@test.aspiresports.com`,
      firstName: "None", lastName: "Persona", emailVerified: false,
    }).returning();
    const result = await getDashboardDestinations(u.id);
    expect(result).toEqual({ hasFamily: false, hasPlay: false });
    await getDb().delete(users).where(eq(users.id, u.id));
  });

  it("returns hasFamily for a user with a dependent", async () => {
    const [u] = await getDb().insert(users).values({
      email: `persona-parent-${Date.now()}@test.aspiresports.com`,
      firstName: "Parent", lastName: "Persona", emailVerified: false,
    }).returning();
    const [fm] = await getDb().insert(familyMembers).values({
      parentUserId: u.id, firstName: "Kid", lastName: "Persona", birthDate: "2016-01-01",
    }).returning();
    const result = await getDashboardDestinations(u.id);
    expect(result.hasFamily).toBe(true);
    expect(result.hasPlay).toBe(false);
    await getDb().delete(familyMembers).where(eq(familyMembers.id, fm.id));
    await getDb().delete(users).where(eq(users.id, u.id));
  });

  it("returns hasPlay for a user with a self family member", async () => {
    const [u] = await getDb().insert(users).values({
      email: `persona-player-${Date.now()}@test.aspiresports.com`,
      firstName: "Player", lastName: "Persona", emailVerified: false,
    }).returning();
    const [fm] = await getDb().insert(familyMembers).values({
      selfUserId: u.id, firstName: "Player", lastName: "Persona", birthDate: "1992-01-01",
    }).returning();
    const result = await getDashboardDestinations(u.id);
    expect(result.hasFamily).toBe(false);
    expect(result.hasPlay).toBe(true);
    await getDb().delete(familyMembers).where(eq(familyMembers.id, fm.id));
    await getDb().delete(users).where(eq(users.id, u.id));
  });
});
```

- [ ] **Step 3: Run the test** — `CRON_SECRET=dev TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/dashboard/persona.test.ts`. Expected: 3 pass.

- [ ] **Step 4: `npx tsc --noEmit`** — zero errors.

- [ ] **Step 5: Commit** — `git add src/lib/dashboard/persona.ts tests/api/dashboard/persona.test.ts && git commit -m "feat(dashboard): getDashboardDestinations persona helper"`

---

### Task 2: `getPlayerTeamIds` helper + `GET /api/dashboard/play/teams`

Returns the signed-in user's teams, derived from their **self** family member → `registrations` → `rosters` → `teams`, with win/loss record from `standings`. Task 2 also creates the `getPlayerTeamIds` helper that Tasks 3 and 4 reuse.

**Files:**
- Create: `src/lib/dashboard/play-teams.ts`
- Create: `src/pages/api/dashboard/play/teams.ts`
- Test: `tests/api/dashboard/play-teams.test.ts`

- [ ] **Step 1: Write the shared helper**

```typescript
// src/lib/dashboard/play-teams.ts
import { getDb } from "@/lib/db";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { rosters } from "@/lib/db/schema/teams";
import { eq, inArray } from "drizzle-orm";

/**
 * Team ids the user plays on: their self family members → registrations
 * → roster spots → teams. Returns [] for a user who is not on any team.
 */
export async function getPlayerTeamIds(userId: string): Promise<string[]> {
  const db = getDb();
  const selves = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(eq(familyMembers.selfUserId, userId));
  if (selves.length === 0) return [];

  const regs = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(inArray(registrations.familyMemberId, selves.map((s) => s.id)));
  if (regs.length === 0) return [];

  const rosterRows = await db
    .select({ teamId: rosters.teamId })
    .from(rosters)
    .where(inArray(rosters.registrationId, regs.map((r) => r.id)));
  return [...new Set(rosterRows.map((r) => r.teamId))];
}
```

- [ ] **Step 2: Write the failing test** (this is the template — Tasks 3 and 4 mirror it)

```typescript
// tests/api/dashboard/play-teams.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { getParentCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

describe("GET /api/dashboard/play/teams", () => {
  let cookie: string;
  beforeAll(async () => { cookie = await getParentCookie(); });

  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch("/api/dashboard/play/teams");
    expect(res.status).toBe(401);
  });

  it("returns a teams array for an authenticated user", async () => {
    const res = await apiFetch("/api/dashboard/play/teams", { cookie });
    const body = await expectJson(res, 200);
    expect(Array.isArray(body.teams)).toBe(true);
  });

  afterAll(() => resetCookies());
});
```

Note: `getParentCookie` is used only to exercise the authenticated path — the endpoint is user-scoped, so any signed-in account returns a (possibly empty) array. If `seed-e2e-tests.ts` seeds a self-registered player on a team, add an assertion that `body.teams[0].record` has `wins`/`losses`/`ties`.

- [ ] **Step 3: Run test, verify it fails** — `CRON_SECRET=dev TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/dashboard/play-teams.test.ts`. Expected: 401 test passes, the array test fails (route 404s).

- [ ] **Step 4: Implement the endpoint**

```typescript
// src/pages/api/dashboard/play/teams.ts
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { teams, standings } from "@/lib/db/schema/teams";
import { inArray } from "drizzle-orm";
import { getPlayerTeamIds } from "@/lib/dashboard/play-teams";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const db = getDb();
  const teamIds = await getPlayerTeamIds(locals.user.id);
  if (teamIds.length === 0) return json({ teams: [] });

  const teamRows = await db
    .select({
      id: teams.id, name: teams.name, color: teams.color,
      seasonId: teams.seasonId, division: teams.division,
    })
    .from(teams)
    .where(inArray(teams.id, teamIds));

  const standingRows = await db
    .select({
      teamId: standings.teamId, wins: standings.wins,
      losses: standings.losses, ties: standings.ties,
    })
    .from(standings)
    .where(inArray(standings.teamId, teamIds));
  const standingByTeam = new Map(standingRows.map((s) => [s.teamId, s]));

  const result = teamRows.map((t) => ({
    ...t,
    record: standingByTeam.get(t.id) ?? { wins: 0, losses: 0, ties: 0 },
  }));
  return json({ teams: result });
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 5: Run test, verify pass.**
- [ ] **Step 6: `npx tsc --noEmit`, then commit** — `git add src/lib/dashboard/play-teams.ts src/pages/api/dashboard/play/teams.ts tests/api/dashboard/play-teams.test.ts && git commit -m "feat(dashboard): player teams endpoint + getPlayerTeamIds helper"`

---

### Task 3: `GET /api/dashboard/play/games`

Upcoming games for the player's teams (reuses the team-derivation from Task 2).

**Files:**
- Create: `src/pages/api/dashboard/play/games.ts`
- Test: `tests/api/dashboard/play-games.test.ts`

- [ ] **Step 1: Failing test** — mirror Task 2's test file structure exactly; assert 401 unauthenticated and that an authenticated user gets `{ games: [...] }` (an array). File: `tests/api/dashboard/play-games.test.ts`.

- [ ] **Step 2: Run, verify fails.**

- [ ] **Step 3: Implement.** Import `getPlayerTeamIds` from `@/lib/dashboard/play-teams` (created in Task 2). Then:

```typescript
// core query in src/pages/api/dashboard/play/games.ts
import { games, teams } from "@/lib/db/schema/teams";
import { and, or, gte, inArray, asc } from "drizzle-orm";

const upcoming = await db
  .select({
    id: games.id, scheduledAt: games.scheduledAt, status: games.status,
    homeTeamId: games.homeTeamId, awayTeamId: games.awayTeamId,
    venueId: games.venueId, fieldNumber: games.fieldNumber,
  })
  .from(games)
  .where(
    and(
      gte(games.scheduledAt, new Date()),
      or(inArray(games.homeTeamId, teamIds), inArray(games.awayTeamId, teamIds)),
    ),
  )
  .orderBy(asc(games.scheduledAt))
  .limit(20);
```

Resolve opponent team names with one `inArray` lookup on `teams` (do not query per game — N+1). Return each game with `{ ...game, opponentName, isHome }`.

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: tsc, commit** — `git commit -m "feat(dashboard): player upcoming-games endpoint"`

---

### Task 4: `GET /api/dashboard/play/standings`

Division standings for the seasons the player's teams are in.

**Files:**
- Create: `src/pages/api/dashboard/play/standings.ts`
- Test: `tests/api/dashboard/play-standings.test.ts`

- [ ] **Step 1: Failing test** — mirror Task 2's test file structure exactly; assert 401 unauthenticated and that an authenticated user gets `{ standings: [...] }` (an array). File: `tests/api/dashboard/play-standings.test.ts`.
- [ ] **Step 2: Run, verify fails.**
- [ ] **Step 3: Implement** — import `getPlayerTeamIds` from `@/lib/dashboard/play-teams` → look up `teams.seasonId` for those team ids → select all `standings` rows for those season ids, join `teams` for the team name, order by `wins` desc then `losses` asc. Return `{ standings: [{ seasonId, teamId, teamName, wins, losses, ties, gamesPlayed }] }`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: tsc, commit** — `git commit -m "feat(dashboard): player standings endpoint"`

---

## Phase 2 — Shell & routing

### Task 5: Shared shell primitives

**Files:**
- Create: `src/components/dashboard/shell/DashboardShell.astro`
- Create: `src/components/dashboard/shell/DashboardSection.tsx`
- Create: `src/components/dashboard/shell/DestinationTabs.tsx`

- [ ] **Step 1: `DashboardSection.tsx`** — a presentational React wrapper: props `{ index: number; title: string; accent?: "default" | "attention" | "explore"; children: ReactNode }`. Renders a labeled section (`<section>` + a heading styled from the IA mock — small uppercase label `{index} · {title}`, accent color for `attention` orange / `explore` green). No data fetching.

- [ ] **Step 2: `DestinationTabs.tsx`** — props `{ active: "family" | "play"; hasFamily: boolean; hasPlay: boolean }`. Renders nothing if the user has only one destination. If both, renders two `<a>` tabs (`/dashboard/family`, `/dashboard/play`) styled per nav-placement Option A (tabs under the header, active tab filled). Plain anchors — full navigation, no client routing.

- [ ] **Step 3: `DashboardShell.astro`** — props `{ user; greeting; active: "family" | "play"; hasFamily; hasPlay }`. Renders the header (greeting + name + avatar — **no fake "online" status dot**, drop the decorative ring), mounts `<DestinationTabs client:load .../>`, and exposes a `<slot />` for the section grid. Extends nothing — it is included inside pages that already use `BaseLayout`.

- [ ] **Step 4: `npx tsc --noEmit`** — zero errors.
- [ ] **Step 5: Commit** — `git commit -m "feat(dashboard): shared shell, section, and destination-tabs primitives"`

---

### Task 6: `/dashboard` redirector + cookie helper

**Files:**
- Create: `src/lib/dashboard/last-visited.ts`
- Modify: `src/pages/dashboard/index.astro` (replace its entire contents)

- [ ] **Step 1: Cookie helper**

```typescript
// src/lib/dashboard/last-visited.ts
import type { AstroCookies } from "astro";

const COOKIE = "aspire_dash";

export function readLastVisited(cookies: AstroCookies): "family" | "play" | null {
  const v = cookies.get(COOKIE)?.value;
  return v === "family" || v === "play" ? v : null;
}

export function writeLastVisited(cookies: AstroCookies, value: "family" | "play"): void {
  cookies.set(COOKIE, value, {
    path: "/", httpOnly: true, sameSite: "lax",
    maxAge: 60 * 60 * 24 * 180, // 180 days
  });
}
```

- [ ] **Step 2: Replace `src/pages/dashboard/index.astro`** with a redirector — no UI:

```astro
---
import { getDashboardDestinations } from "@/lib/dashboard/persona";
import { readLastVisited } from "@/lib/dashboard/last-visited";

const user = Astro.locals.user!; // middleware guarantees auth on /dashboard
const { hasFamily, hasPlay } = await getDashboardDestinations(user.id);

let target = "/dashboard/start";
if (hasFamily && hasPlay) {
  target = `/dashboard/${readLastVisited(Astro.cookies) ?? "family"}`;
} else if (hasFamily) {
  target = "/dashboard/family";
} else if (hasPlay) {
  target = "/dashboard/play";
}
return Astro.redirect(target, 302);
---
```

- [ ] **Step 3: `npx tsc --noEmit`** — zero errors.
- [ ] **Step 4: Manual check** — `npm run dev`, sign in as the parent test account, hit `/dashboard`, confirm a 302 to `/dashboard/family` (will 404 until Task 8 — that is expected).
- [ ] **Step 5: Commit** — `git commit -m "feat(dashboard): /dashboard persona redirector + last-visited cookie"`

---

### Task 7: `/dashboard/start` get-started page

**Files:**
- Create: `src/pages/dashboard/start.astro`

- [ ] **Step 1: Build the page** — extends `BaseLayout`. Two cards: "Register a child for youth programs" → `/programs?audience=parents` (confirm the catalog's audience query param), and "Join an adult league or pickup" → `/programs?audience=adults`. Evergreen copy — no season/date references. Use the existing card styling from `dashboard/index.astro`'s "How we coach" card as the visual reference.
- [ ] **Step 2: `npx tsc --noEmit` + `npm run build`** — confirms no SSR/prerender mistake. This page is SSR (reads `Astro.locals.user`); do **not** add `prerender`.
- [ ] **Step 3: Commit** — `git commit -m "feat(dashboard): get-started screen for zero-data users"`

---

## Phase 3 — Family dashboard

### Task 8: `/dashboard/family` — rework into the four-section IA

**Files:**
- Create: `src/pages/dashboard/family.astro`

The current `dashboard/index.astro` content (pre-Task-6) is the source material. Re-home its sections into the four-section IA on the shell. **Reuse the existing components unchanged** — only the composition changes.

- [ ] **Step 1: Build `family.astro`** — extends `BaseLayout`; computes `greeting` and `getDashboardDestinations`; renders `<DashboardShell active="family" ...>`; calls `writeLastVisited(Astro.cookies, "family")`. Inside the slot, four `<DashboardSection>` blocks:
  - **1 · Needs your attention** — `EmailVerificationBanner`, phone-verification banner, `TelegramConnectBanner`, `PaymentSuccessBanner`, and the redirect-error banner. Render the section only if at least one banner is active (pass a computed boolean).
  - **2 · What's coming up** — `UpcomingEvents`.
  - **3 · What you're part of** — `ChildrenOverview`, `CoachNotes`, `TeamGroupsPanel`.
  - **4 · Explore** — the "How we coach" card, the external-store card, and a "Register for a season" link. Always shown.
- [ ] **Step 2: Drop `PaymentsSummary` into section 3** (membership) and the "Need Help?" card into the footer or section 4 — keep all current content reachable; nothing is deleted.
- [ ] **Step 3: `npx tsc --noEmit` + `npm run build`.**
- [ ] **Step 4: Manual check** — sign in as parent, `/dashboard` redirects to `/dashboard/family`, all four sections render, section 1 hides when no banners are active.
- [ ] **Step 5: Commit** — `git commit -m "feat(dashboard): Family dashboard on the four-section IA"`

---

## Phase 4 — My Play dashboard

### Task 9: My Play section components

**Files:**
- Create: `src/components/dashboard/play/PlayAttention.tsx`
- Create: `src/components/dashboard/play/PlayUpcoming.tsx`
- Create: `src/components/dashboard/play/PlayMembership.tsx`
- Create: `src/components/dashboard/play/PlayExplore.tsx`

Each is a `client:visible` React island. Each owns its own loading (`LoadingSkeleton`), error (`ErrorBanner`), and empty (`EmptyState`) handling — mirror the structure of `src/components/dashboard/MyDropInBookings.tsx`.

- [ ] **Step 1: `PlayUpcoming.tsx`** — fetches `/api/dashboard/play/games`; the first/soonest game renders as a prominent "Next game" card (opponent, date/time, venue); remaining games as a compact list. Also fetch `/api/dropin/bookings` and show upcoming pickup sessions beside it. Empty state: "No games scheduled yet."
- [ ] **Step 2: `PlayMembership.tsx`** — fetches `/api/dashboard/play/teams` and `/api/dashboard/play/standings`; renders each team (name, record `3W-1L`, link to roster) and a compact standings table. Also list the player's own active registrations from `/api/registrations` (self-scoped) and tournament entries. Empty state: "You're not on a team yet — browse adult leagues."
- [ ] **Step 3: `PlayAttention.tsx`** — fetches `/api/dropin/bookings` and `/api/rentals/bookings`; surfaces expiring holds and available check-ins; fetches `/api/payments/history` (or the balance source the parent dashboard uses) for outstanding balances. Renders nothing (returns `null`) when there is nothing pending — the parent page checks this.
- [ ] **Step 4: `PlayExplore.tsx`** — static cards: "Browse adult leagues", "Book a field", and the cross-program nudge "Kids' camp at Worthington" → `/programs?audience=parents`. No fetch.
- [ ] **Step 5: `npx tsc --noEmit`.**
- [ ] **Step 6: Commit** — `git commit -m "feat(dashboard): My Play section components"`

---

### Task 10: `/dashboard/play` page

**Files:**
- Create: `src/pages/dashboard/play.astro`

- [ ] **Step 1: Build `play.astro`** — same shape as `family.astro`: `BaseLayout` → `getDashboardDestinations` → `writeLastVisited(Astro.cookies, "play")` → `<DashboardShell active="play" ...>` with four `<DashboardSection>` blocks wrapping `PlayAttention` / `PlayUpcoming` / `PlayMembership` / `PlayExplore` (`client:visible`). Relocate `MyDropInBookings` and `MyFieldRentals` into section 3 alongside `PlayMembership`. SSR — no `prerender`.
- [ ] **Step 2: `npx tsc --noEmit` + `npm run build`.**
- [ ] **Step 3: Manual check** — sign in as the player test account; `/dashboard` redirects to `/dashboard/play`; all four sections render; empty states show for clusters with no data.
- [ ] **Step 4: Commit** — `git commit -m "feat(dashboard): My Play dashboard page"`

---

## Phase 5 — Account area

### Task 11: `/account` settings pages

**Files:**
- Create: `src/pages/account/index.astro` (redirects to `/account/profile`)
- Create: `src/pages/account/profile.astro`, `notifications.astro`, `security.astro`, `consents.astro`
- Modify: `src/middleware.ts` — add `/account` to the auth-required route prefixes (mirror the `/dashboard` rule)

- [ ] **Step 1: Add `/account` to middleware** auth gate — same treatment as `/dashboard` in `src/middleware.ts`.
- [ ] **Step 2: Build the four pages**, each `BaseLayout` + a shared `AccountShell` (a small left-nav listing the five account sections — create `src/components/account/AccountShell.astro`). Each page mounts the existing component unchanged: `profile-settings`, `notification-settings` + `messaging-settings`, `password-change`, `manage-consent`.
- [ ] **Step 3: `npx tsc --noEmit` + `npm run build`.**
- [ ] **Step 4: Commit** — `git commit -m "feat(account): profile, notifications, security, consents pages"`

---

### Task 12: `/account/invoices`

**Files:**
- Create: `src/pages/account/invoices.astro`

- [ ] **Step 1: Build the page** — `BaseLayout` + `AccountShell`, mounts `payment-history` and `payments-summary` (existing components). Outstanding-balance items link here from dashboard section 1.
- [ ] **Step 2: Leave the old `/dashboard/payments` route** as a 301-style `Astro.redirect("/account/invoices")` so existing links/bookmarks survive.
- [ ] **Step 3: `npx tsc --noEmit` + `npm run build`, commit** — `git commit -m "feat(account): invoices page"`

---

## Phase 6 — Navigation & end-to-end

### Task 13: Avatar dropdown menu

**Files:**
- Modify: `src/components/navigation.tsx`

- [ ] **Step 1: Replace the bare avatar circle** (for signed-in users) with a dropdown: clicking the avatar opens a small menu — **Account** (`/account`), **Sign out**. Keep the existing single `Dashboard` link in the nav. Use the existing dropdown primitive if the repo has one (`src/components/ui/`); otherwise a minimal `useState` toggle with an outside-click close.
- [ ] **Step 2: `npx tsc --noEmit`.**
- [ ] **Step 3: Manual check** — avatar opens the menu; Account and Sign out both work.
- [ ] **Step 4: Commit** — `git commit -m "feat(nav): account dropdown on the avatar"`

---

### Task 14: E2E persona-routing spec

**Files:**
- Create: `tests/e2e/dashboard-persona.spec.ts`

- [ ] **Step 1: Write the spec** — use the seeded test accounts and `signIn` / `waitForHydration` helpers from `tests/utils/test-helpers.ts`. Cases:
  - parent account → `/dashboard` lands on `/dashboard/family`; the four section headings are visible; no destination tabs.
  - player account → `/dashboard` lands on `/dashboard/play`; "Next game" visible; no tabs.
  - a both-account (seed one in `seed-e2e-tests.ts` if none exists — a user with a dependent and a self family member) → tabs render; visiting `/dashboard/play` then `/dashboard` returns to `/dashboard/play` (cookie remembered).
  - a fresh account with no family members → `/dashboard` lands on `/dashboard/start`.
- [ ] **Step 2: Run** — `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- dashboard-persona`. All pass.
- [ ] **Step 3: Commit** — `git commit -m "test(e2e): dashboard persona routing"`

---

### Task 15: Pre-push verification

- [ ] **Step 1: Re-seed** — `npm run db:seed:e2e`.
- [ ] **Step 2: API tests** — `CRON_SECRET=dev TEST_BASE_URL=http://localhost:4321 npm run test:api`. All pass.
- [ ] **Step 3: E2E** — `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test`. All pass.
- [ ] **Step 4: Build + types** — `npm run build` and `npx tsc --noEmit`. Clean.
- [ ] **Step 5: Push the branch and open a PR** for `feat/dual-persona-dashboard`. CI must be green before the work is considered done.

---

## Notes for the implementer

- **No new migration.** Every table used (`familyMembers`, `registrations`, `rosters`, `teams`, `games`, `standings`, `dropInBookings`, `fieldRentals`) already exists.
- **Reuse, don't rebuild.** Phases 3 and 5 are composition — the existing dashboard components move into the new structure unchanged. The only genuinely new UI is the four `Play*` section components and the shell primitives.
- **Tournaments v1** = tournament-type programs the player is in, surfaced via the games endpoint. No bracket. Do not build a bracket.
- **Section header wording** ("Needs your attention", "What's coming up", "What you're part of", "Explore") is final unless the founder revises it — keep it evergreen, no dates.
