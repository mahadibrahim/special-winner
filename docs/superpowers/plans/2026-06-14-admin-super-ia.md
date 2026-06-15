# Super-Admin `/admin` IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every orphaned super-admin page a real sidebar home, fix nav naming, and populate the inbox/refunds/attention badges — without changing any page internals.

**Architecture:** Rewrite the `SUPER_ADMIN_NAV` config (already consumed by the portal `admin` portal) into the approved group structure with all orphans + the three season-scoped pages placed. Add a `getNavBadges(orgId)` lib + a thin `/api/admin/nav-badges` route; `AdminLayout` fetches it client-side and feeds `PortalLayout`'s existing `badges` prop. Shrink the orphan-guard whitelist accordingly.

**Tech Stack:** Astro 5 SSR, React 19, Drizzle, Vitest, lucide-react.

**Branch:** `feat/admin-super-ia` (stacked on `docs/portal-ia-foundation`). Node 25 locally → use `npx tsc --noEmit` + `npx vitest`; `npm run build` is CI-only.

**Spec:** `docs/superpowers/specs/2026-06-14-admin-super-ia-design.md`.

---

## File Structure

- Modify: `src/lib/admin/nav-super-admin.ts` — rewrite `SUPER_ADMIN_NAV`.
- Modify: `src/lib/admin/nav-venue-manager.ts` — rename "Venue Day" → "Venue calendar".
- Create: `src/lib/admin/nav-badges.ts` — `getNavBadges(orgId)`.
- Create: `src/pages/api/admin/nav-badges.ts` — thin admin-gated route.
- Modify: `src/components/admin/admin-layout.tsx` — client badge fetch.
- Modify: `tests/unit/portal/route-coverage.test.ts` — shrink whitelist.
- Create: `tests/unit/admin/nav-super-admin.test.ts` — nav links resolve + orphans present.
- Create: `tests/unit/admin/nav-badges.test.ts` — count aggregation.

---

## Task 1: New super-admin nav structure + naming fixes

**Files:**
- Modify: `src/lib/admin/nav-super-admin.ts`
- Modify: `src/lib/admin/nav-venue-manager.ts`
- Test: `tests/unit/admin/nav-super-admin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin/nav-super-admin.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SUPER_ADMIN_NAV } from "@/lib/admin/nav-super-admin";

const PAGES = fileURLToPath(new URL("../../../src/pages", import.meta.url));
const hrefs = SUPER_ADMIN_NAV.flatMap((g) => g.items.map((i) => i.href));

/** A nav href resolves if src/pages<route>.astro or <route>/index.astro exists.
 *  `/messages` is an authed app route (not under /admin) — treated as known-good. */
function routeResolves(href: string): boolean {
  if (href === "/messages") return true;
  const a = path.join(PAGES, href.replace(/^\//, "") + ".astro");
  const b = path.join(PAGES, href.replace(/^\//, ""), "index.astro");
  return existsSync(a) || existsSync(b);
}

describe("SUPER_ADMIN_NAV", () => {
  it("every nav href resolves to a real page (no dead links)", () => {
    const dead = hrefs.filter((h) => !routeResolves(h));
    expect(dead).toEqual([]);
  });

  it("has no duplicate hrefs", () => {
    const dupes = hrefs.filter((h, i) => hrefs.indexOf(h) !== i);
    expect(dupes).toEqual([]);
  });

  it("surfaces the previously-orphaned routes", () => {
    for (const r of [
      "/admin/games",
      "/admin/teams",
      "/admin/registrations",
      "/admin/age-groups",
      "/admin/game-day/today",
      "/admin/broadcasts",
      "/admin/announcements",
      "/admin/re-registration-campaign",
      "/admin/media/shoots",
      "/admin/media/staff",
      "/admin/media/tag-queue",
      "/admin/reports",
    ]) {
      expect(hrefs).toContain(r);
    }
  });

  it("keeps the expected groups", () => {
    const groups = SUPER_ADMIN_NAV.map((g) => g.name);
    for (const g of ["Plan & Program", "Casual play", "Marketing", "People", "Money", "Media", "Setup", "Reports"]) {
      expect(groups).toContain(g);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/admin/nav-super-admin.test.ts`
Expected: FAIL (orphan routes not yet in nav; group names differ).

- [ ] **Step 3: Rewrite `SUPER_ADMIN_NAV`**

Replace the entire contents of `src/lib/admin/nav-super-admin.ts` with:

```ts
// src/lib/admin/nav-super-admin.ts
import {
  Home,
  Inbox,
  CalendarDays,
  Calendar,
  Dumbbell,
  Trophy,
  Shield,
  ClipboardList,
  Baby,
  Activity,
  Zap,
  TrendingDown,
  Key,
  Gem,
  Send,
  Radio,
  Megaphone,
  RefreshCcw,
  Search,
  Users,
  CreditCard,
  Tag,
  ShoppingBag,
  Camera,
  UserCog,
  Tags,
  MapPin,
  Palette,
  BookOpen,
  ShieldCheck,
  Settings,
  LayoutDashboard,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  badgeKey?: "inbox" | "refundsPending" | "attention";
};

export type NavGroup = {
  name: string | null; // null = ungrouped top section
  items: NavItem[];
};

export const SUPER_ADMIN_NAV: NavGroup[] = [
  {
    name: null,
    items: [
      { name: "Home", href: "/admin", icon: Home, badgeKey: "attention" },
      { name: "Inbox", href: "/messages", icon: Inbox, badgeKey: "inbox" },
    ],
  },
  {
    name: "Plan & Program",
    items: [
      { name: "Venue calendar", href: "/admin/venue", icon: CalendarDays },
      { name: "Seasons", href: "/admin/seasons", icon: Calendar },
      { name: "Programs", href: "/admin/programs", icon: Dumbbell },
      { name: "Games", href: "/admin/games", icon: Trophy },
      { name: "Teams", href: "/admin/teams", icon: Shield },
      { name: "Registrations", href: "/admin/registrations", icon: ClipboardList },
      { name: "Age groups", href: "/admin/age-groups", icon: Baby },
      { name: "Game day", href: "/admin/game-day/today", icon: Activity },
    ],
  },
  {
    name: "Casual play",
    items: [
      { name: "Drop-ins", href: "/admin/dropins", icon: Zap },
      { name: "Drop League", href: "/admin/drop-league", icon: TrendingDown },
      { name: "Rentals", href: "/admin/rentals", icon: Key },
      { name: "Memberships", href: "/admin/memberships", icon: Gem },
    ],
  },
  {
    name: "Marketing",
    items: [
      { name: "Campaigns", href: "/admin/campaigns", icon: Send },
      { name: "Broadcasts", href: "/admin/broadcasts", icon: Radio },
      { name: "Announcements", href: "/admin/announcements", icon: Megaphone },
      { name: "Re-registration", href: "/admin/re-registration-campaign", icon: RefreshCcw },
    ],
  },
  {
    name: "People",
    items: [
      { name: "Look up", href: "/admin/lookup", icon: Search },
      { name: "Users & staff", href: "/admin/users", icon: Users },
    ],
  },
  {
    name: "Money",
    items: [
      { name: "Refunds", href: "/admin/refunds", icon: RefreshCcw, badgeKey: "refundsPending" },
      { name: "Payments", href: "/admin/payments", icon: CreditCard },
      { name: "Discount codes", href: "/admin/discount-codes", icon: Tag },
      { name: "Gear", href: "/admin/gear", icon: ShoppingBag },
    ],
  },
  {
    name: "Media",
    items: [
      { name: "Shoots", href: "/admin/media/shoots", icon: Camera },
      { name: "Media staff", href: "/admin/media/staff", icon: UserCog },
      { name: "Tag queue", href: "/admin/media/tag-queue", icon: Tags },
    ],
  },
  {
    name: "Setup",
    items: [
      { name: "Locations & spaces", href: "/admin/locations", icon: MapPin },
      { name: "Branding", href: "/admin/branding", icon: Palette },
      { name: "Curriculum", href: "/admin/curriculum", icon: BookOpen },
      { name: "Compliance", href: "/admin/compliance", icon: ShieldCheck },
      { name: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
  {
    name: "Reports",
    items: [
      { name: "Overview", href: "/admin/reports", icon: LayoutDashboard },
      { name: "Revenue", href: "/admin/reports/revenue", icon: BarChart3 },
      { name: "Registration trends", href: "/admin/reports/registrations", icon: BarChart3 },
    ],
  },
];
```

ICON NOTE: every icon is imported from `lucide-react`. `npx tsc --noEmit` (Step 5) will fail on any name that doesn't exist in the installed version. Known-good fallbacks if one errors: `Baby`→`Cake`→`Users`; `Trophy`→`Flag`; `Shield`→`Users`; `Radio`→`Megaphone`; `UserCog`→`Users`; `Tags`→`Tag`; `Activity`→`Zap`; `LayoutDashboard`→`BarChart3`. Swap and re-run until tsc is clean.

- [ ] **Step 4: Rename the venue-manager "Venue Day" label**

In `src/lib/admin/nav-venue-manager.ts`, change the nav item label `"Venue Day"` to `"Venue calendar"` (the `href` stays `/admin/venue`). This unifies the name for the shared route. (Note: the orphan-guard and the new nav test don't assert this label; it's a consistency fix.)

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run tests/unit/admin/nav-super-admin.test.ts && npx tsc --noEmit`
Expected: 4 tests PASS; tsc clean. Resolve any icon import errors per the ICON NOTE.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin/nav-super-admin.ts src/lib/admin/nav-venue-manager.ts tests/unit/admin/nav-super-admin.test.ts
git commit -m "feat(admin-ia): new super-admin nav structure, all orphans placed"
```

---

## Task 2: `getNavBadges` lib

**Files:**
- Create: `src/lib/admin/nav-badges.ts`
- Test: `tests/unit/admin/nav-badges.test.ts`

CONTEXT: `getAttentionFeed(orgId)` (in `src/lib/admin/attention-feed.ts`) returns `AttentionItem[]`. The `conversations` table has columns `organizationId`, `lastInboundAt`, `lastOutboundAt`. Pending refunds = `registrations.refundStatus = 'pending_approval'`, org-scoped via `seasons → programs → locations.organizationId`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin/nav-badges.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

// Two count queries: refunds, then inbox (in that call order in getNavBadges).
const counts = [{ count: 3 }, { count: 5 }];
let call = 0;
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({ innerJoin: () => ({ innerJoin: () => ({ where: async () => [counts[call++]] }) }) }),
        where: async () => [counts[call++]],
      }),
    }),
  }),
}));

vi.mock("@/lib/admin/attention-feed", () => ({
  getAttentionFeed: vi.fn(async () => [{ id: "a" }, { id: "b" }]),
}));

import { getNavBadges } from "@/lib/admin/nav-badges";

describe("getNavBadges", () => {
  it("returns inbox, refundsPending, and attention counts", async () => {
    const b = await getNavBadges("org_1");
    expect(b).toEqual({ refundsPending: 3, inbox: 5, attention: 2 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/admin/nav-badges.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin/nav-badges`.

- [ ] **Step 3: Implement**

Create `src/lib/admin/nav-badges.ts`:

```ts
import { sql, and, eq, isNull, gt, isNotNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { registrations, seasons, programs } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { conversations } from "@/lib/db/schema/conversations";
import { getAttentionFeed } from "@/lib/admin/attention-feed";

export type NavBadges = {
  inbox: number;
  refundsPending: number;
  attention: number;
};

/**
 * Counts for the admin sidebar notification badges. Each is org-scoped and
 * cheap. Fail-soft callers: a thrown error should degrade to no badges, not a
 * broken layout (the API route swallows errors).
 */
export async function getNavBadges(orgId: string): Promise<NavBadges> {
  const db = getDb();

  // Pending refund requests (same scoping as the attention feed's refund item).
  const [refundRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(registrations)
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(
      and(
        eq(registrations.refundStatus, "pending_approval"),
        eq(locations.organizationId, orgId),
      ),
    );

  // Conversations with an unread inbound message (no later outbound).
  const [inboxRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, orgId),
        isNotNull(conversations.lastInboundAt),
        or(
          isNull(conversations.lastOutboundAt),
          gt(conversations.lastInboundAt, conversations.lastOutboundAt),
        ),
      ),
    );

  const attention = (await getAttentionFeed(orgId)).length;

  return {
    refundsPending: refundRow?.count ?? 0,
    inbox: inboxRow?.count ?? 0,
    attention,
  };
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run tests/unit/admin/nav-badges.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean. (If the import path for `registrations`/`seasons`/`programs`/`locations`/`conversations` differs, fix to match the actual schema module exports — verify with `grep -rn "export const registrations\|export const conversations\|export const locations" src/lib/db/schema/`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/nav-badges.ts tests/unit/admin/nav-badges.test.ts
git commit -m "feat(admin-ia): getNavBadges count aggregation"
```

---

## Task 3: `/api/admin/nav-badges` route

**Files:**
- Create: `src/pages/api/admin/nav-badges.ts`

CONTEXT: admin API routes check `locals.user` + admin role and read `locals.organization.id`. Follow the existing pattern in `src/pages/api/admin/attention/index.ts` (read it first for the exact auth/org-resolution boilerplate this repo uses).

- [ ] **Step 1: Read the reference endpoint**

Run: `sed -n '1,40p' src/pages/api/admin/attention/index.ts`
Mirror its auth + org-id resolution exactly.

- [ ] **Step 2: Implement the route**

Create `src/pages/api/admin/nav-badges.ts`:

```ts
import type { APIRoute } from "astro";
import { getNavBadges } from "@/lib/admin/nav-badges";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || !locals.isAdmin) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const orgId = locals.organization?.id;
  if (!orgId) {
    return new Response(JSON.stringify({ inbox: 0, refundsPending: 0, attention: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    const badges = await getNavBadges(orgId);
    return new Response(JSON.stringify(badges), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("[nav-badges] failed", err);
    // Fail-soft: zeros, never a 500 that the layout would have to handle.
    return new Response(JSON.stringify({ inbox: 0, refundsPending: 0, attention: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
};
```

NOTE: confirm `locals.isAdmin` is the right gate (it's set in middleware and covers super_admin + location_admin). If the reference endpoint uses a different check (e.g. `locals.userRoles`), match that instead.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/admin/nav-badges.ts
git commit -m "feat(admin-ia): /api/admin/nav-badges route"
```

---

## Task 4: AdminLayout fetches badges client-side

**Files:**
- Modify: `src/components/admin/admin-layout.tsx`

- [ ] **Step 1: Add the client fetch**

Replace the contents of `src/components/admin/admin-layout.tsx` with (adds `useEffect`/`useState` badge fetch; merges fetched counts over any passed `badges` prop):

```tsx
"use client"

import { useEffect, useState } from "react"
import { PortalLayout, type PortalBadges, type Breadcrumb } from "@/components/portal/portal-layout"
import { getPortalById } from "@/lib/portal/resolve"

interface AdminLayoutProps {
  children: React.ReactNode
  currentPath: string
  role: string
  venueLabel?: string
  /** True when the signed-in user has more than one portal. */
  multiPortal?: boolean
  badges?: PortalBadges
  breadcrumbs?: Breadcrumb[]
  user: {
    firstName: string | null
    lastName: string | null
    email: string
  } | null
}

/**
 * Thin compatibility wrapper over PortalLayout for the /admin tree. super_admin
 * resolves to the `admin` portal; every other admin-tier role resolves to the
 * narrower `venue` portal (the safe default for any non-super-admin role).
 *
 * Notification badge counts are fetched once on mount from /api/admin/nav-badges
 * (fail-soft) so every admin page shows live counts without per-page plumbing.
 */
export function AdminLayout({
  children,
  currentPath,
  role,
  venueLabel,
  multiPortal = false,
  badges,
  breadcrumbs,
  user,
}: AdminLayoutProps) {
  const isSuperAdmin = role === "super_admin"
  const portal = getPortalById(isSuperAdmin ? "admin" : "venue")!
  const subtitle = isSuperAdmin ? "Super-admin" : (venueLabel ?? "Venue")
  const roleLabel = isSuperAdmin ? "Super-admin" : "Venue manager"

  const [fetched, setFetched] = useState<PortalBadges | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/nav-badges")
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

  const mergedBadges: PortalBadges | undefined = fetched ?? badges

  return (
    <PortalLayout
      currentPath={currentPath}
      navGroups={portal.nav}
      homeHref={portal.homeHref}
      subtitle={subtitle}
      roleLabel={roleLabel}
      showPortalSwitch={multiPortal}
      showVenuePicker
      badges={mergedBadges}
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
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/admin-layout.tsx
git commit -m "feat(admin-ia): AdminLayout populates nav badges client-side"
```

---

## Task 5: Shrink the orphan-guard whitelist

**Files:**
- Modify: `tests/unit/portal/route-coverage.test.ts`

- [ ] **Step 1: Remove now-navigated routes from `CONTEXTUAL_ROUTES`**

Delete these entries from the `CONTEXTUAL_ROUTES` set (they are now in `SUPER_ADMIN_NAV`, so the guard finds them via `navHrefs`):
`/admin/games`, `/admin/teams`, `/admin/registrations`, `/admin/age-groups`,
`/admin/game-day/today`, `/admin/broadcasts`, `/admin/re-registration-campaign`,
`/admin/reports`, `/admin/media/shoots`, `/admin/media/staff`, `/admin/media/tag-queue`.

Keep `/admin/sports` (a `/admin/programs` tab, reached contextually), all `/new` and rate-card sub-pages, redirect stubs, and `/admin/organizations`, `/admin/unauthorized`.

- [ ] **Step 2: Run the guard — confirm still green AND still honest**

Run: `npx vitest run tests/unit/portal/route-coverage.test.ts`
Expected: PASS. If it now FAILS listing a route, that route's page exists but isn't in nav and wasn't kept in the whitelist — re-add it with a reason, or (if it's genuinely a new orphan) leave it for triage. Do not broaden the heuristics.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/portal/route-coverage.test.ts
git commit -m "test(admin-ia): shrink orphan whitelist as routes get nav homes"
```

---

## Task 6: Full verification

**Files:** none.

- [ ] **Step 1: Targeted suites**

Run: `npx vitest run tests/unit/admin tests/unit/portal`
Expected: all PASS (new nav + nav-badges + orphan-guard + existing admin tests).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Regression sweep**

Run: `npx vitest run tests/unit`
Expected: no regressions. (The pre-existing `membership-event-routing` failure is fixed on a separate branch; if this branch was created before that merged, that file may still fail here — confirm it's the ONLY failure and that it's the known inherited one, not something this work caused.)

- [ ] **Step 4: Push**

```bash
git push -u origin feat/admin-super-ia
```
Open a PR stacked on `docs/portal-ia-foundation` (or onto `main` once the foundation merges). Wait for CI green.

---

## Self-Review notes (addressed during authoring)

- **Spec coverage:** new nav structure + all orphans placed (Task 1), naming fixes (Task 1: venue label, locations label already in nav rewrite), badges lib + route + wiring (Tasks 2–4), whitelist shrink (Task 5). The "Spaces" page tab is already labeled "Spaces" — only the nav label needed changing, done in Task 1's rewrite ("Locations & spaces").
- **Already-global pages:** registrations/teams/games render cross-season today — Task 1 only adds nav entries, no page changes (verified during planning).
- **Badge wiring altitude:** fetch lives in `AdminLayout` (admin-specific), `PortalLayout` stays generic/prop-driven (foundation untouched).
- **Honest guard:** Task 5 only removes routes that genuinely gained nav homes; heuristics unchanged; non-vacuousness preserved.
