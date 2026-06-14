# Portal Nav Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared role-scoped portal nav system — one `PortalLayout`, one portal registry, a multi-role landing hub, and an enforced orphan-guard test — and migrate `/admin` onto it.

**Architecture:** A `Portal` registry defines five role-scoped portals (`admin`, `venue`, `coach`, `media`, `referee`). Pure resolver functions map a user's roles to their portals and post-login destination. A generalized `PortalLayout` renders the chrome from a portal config (carrying forward the existing navy `AdminLayout` design, now with badges and breadcrumbs). A `/portal` hub routes multi-role users; single-role users skip straight in. A unit test fails CI if any portal page is unreachable from nav.

**Tech Stack:** Astro 5 (SSR), React 19, TypeScript, Vitest (unit), Tailwind, lucide-react icons, Drizzle (roles).

**Scope note:** This is Sub-project 0 of the admin/kiosk IA program (spec: `docs/superpowers/specs/2026-06-14-portal-nav-foundation-design.md`). It builds the *system* and proves it on `/admin`. Migrating `/coach` and `/media` pages off `BaseLayout`, fixing nav *content/naming*, populating badge *data*, and building referee *pages* are later sub-projects.

---

## File Structure

**New files:**
- `src/lib/portal/registry.ts` — `Portal` type + `PORTALS` array (assembles existing admin/venue nav, adds coach/media starter nav, referee placeholder).
- `src/lib/portal/active-state.ts` — `isNavItemActive(currentPath, href)` pure helper.
- `src/lib/portal/resolve.ts` — `resolvePortalsForUser`, `resolvePostLoginTarget`, `getPortalById`.
- `src/components/portal/portal-layout.tsx` — generalized portal chrome.
- `src/pages/portal/index.astro` — the landing hub.
- `tests/unit/portal/active-state.test.ts`
- `tests/unit/portal/resolve.test.ts`
- `tests/unit/portal/registry.test.ts`
- `tests/unit/portal/route-coverage.test.ts` — orphan guard.

**Modified files:**
- `src/lib/auth/roles.ts` — add `referee` to `RoleName`.
- `src/lib/auth/primary-role.ts` — add `referee` to `PRECEDENCE`.
- `src/lib/auth/magic-link-destination.ts` — login case → `resolvePostLoginTarget`.
- `src/pages/m/[token].ts` — pass role names instead of `isAdminRole`.
- `tests/unit/auth/magic-link-destination.test.ts` — update for new login behavior.
- `src/components/admin/admin-layout.tsx` — becomes a thin wrapper over `PortalLayout`.
- `src/middleware.ts` — add an authed rule for `/portal`.

**Unchanged (reused):** `src/lib/admin/nav-super-admin.ts`, `nav-venue-manager.ts`, `sidebar-for-role.ts` and their test stay as-is; the registry imports their nav arrays so existing behavior and tests are preserved.

---

## Task 1: Add `referee` to the role type and precedence

The DB enum (`src/lib/db/schema/users.ts`) already has `referee`, but `RoleName` (`roles.ts`) and the `getPrimaryRoleName` precedence list omit it. Fix that first so portal resolution can reference it.

**Files:**
- Modify: `src/lib/auth/roles.ts:7-14`
- Modify: `src/lib/auth/primary-role.ts:20-28,32`

- [ ] **Step 1: Add `referee` to the `RoleName` union**

In `src/lib/auth/roles.ts`, change the type (lines 7-14) to:

```ts
export type RoleName =
  | "super_admin"
  | "location_admin"
  | "coach"
  | "parent"
  | "player"
  | "media_staff"
  | "media_editor"
  | "referee";
```

- [ ] **Step 2: Add `referee` to the precedence list**

In `src/lib/auth/primary-role.ts`, update `PRECEDENCE` (lines 20-28) — referee sits below coach (least-privileged staff role, above player/parent):

```ts
const PRECEDENCE: RoleName[] = [
  "super_admin",
  "location_admin",
  "media_editor",
  "media_staff",
  "coach",
  "referee",
  "player",
  "parent",
];
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors (a clean baseline per CLAUDE.md).

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/roles.ts src/lib/auth/primary-role.ts
git commit -m "feat(portal): add referee to RoleName + primary-role precedence"
```

---

## Task 2: `active-state` pure helper

Extract and harden the active-nav matching currently inlined in `admin-layout.tsx:93-95`.

**Files:**
- Create: `src/lib/portal/active-state.ts`
- Test: `tests/unit/portal/active-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/portal/active-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isNavItemActive } from "@/lib/portal/active-state";

describe("isNavItemActive", () => {
  it("matches an exact path", () => {
    expect(isNavItemActive("/admin/seasons", "/admin/seasons")).toBe(true);
  });

  it("matches a nested path under the item href", () => {
    expect(isNavItemActive("/admin/seasons/123", "/admin/seasons")).toBe(true);
  });

  it("does not treat /admin home as active for every /admin/* route", () => {
    expect(isNavItemActive("/admin/seasons", "/admin")).toBe(false);
  });

  it("matches /admin home only on exact /admin", () => {
    expect(isNavItemActive("/admin", "/admin")).toBe(true);
  });

  it("does not match a sibling prefix", () => {
    expect(isNavItemActive("/admin/seasonal", "/admin/seasons")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/portal/active-state.test.ts`
Expected: FAIL — cannot resolve `@/lib/portal/active-state`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/portal/active-state.ts`:

```ts
/**
 * True when the nav item at `href` should render as the active item for the
 * current path. Exact match always wins; a nested route (e.g. /admin/seasons/1)
 * activates its parent item (/admin/seasons). The bare "/admin" home is special-
 * cased so it does NOT light up for every /admin/* route — it only matches
 * exactly. The trailing "/" guard prevents sibling-prefix false positives
 * (/admin/seasonal must not match /admin/seasons).
 */
export function isNavItemActive(currentPath: string, href: string): boolean {
  if (currentPath === href) return true;
  if (href === "/admin") return false;
  return currentPath.startsWith(href + "/");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/portal/active-state.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal/active-state.ts tests/unit/portal/active-state.test.ts
git commit -m "feat(portal): isNavItemActive helper"
```

---

## Task 3: Portal registry

Defines the `Portal` type and the five-portal array, reusing the existing admin/venue nav arrays so current behavior is preserved.

**Files:**
- Create: `src/lib/portal/registry.ts`
- Test: `tests/unit/portal/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/portal/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PORTALS, type Portal } from "@/lib/portal/registry";

describe("PORTALS registry", () => {
  it("defines the five portals", () => {
    const ids = PORTALS.map((p) => p.id).sort();
    expect(ids).toEqual(["admin", "coach", "media", "referee", "venue"]);
  });

  it("admin and venue share the /admin base path but differ in home", () => {
    const admin = PORTALS.find((p) => p.id === "admin")!;
    const venue = PORTALS.find((p) => p.id === "venue")!;
    expect(admin.basePath).toBe("/admin");
    expect(venue.basePath).toBe("/admin");
    expect(admin.homeHref).toBe("/admin");
    expect(venue.homeHref).toBe("/admin/venue");
  });

  it("admin portal carries the super-admin nav (Seasons present, Venue Day absent)", () => {
    const admin = PORTALS.find((p) => p.id === "admin")!;
    const names = admin.nav.flatMap((g) => g.items).map((i) => i.name);
    expect(names).toContain("Seasons");
    expect(names).not.toContain("Venue Day");
  });

  it("venue portal carries the venue-manager nav (Venue Day present, Seasons absent)", () => {
    const venue = PORTALS.find((p) => p.id === "venue")!;
    const names = venue.nav.flatMap((g) => g.items).map((i) => i.name);
    expect(names).toContain("Venue Day");
    expect(names).not.toContain("Seasons");
  });

  it("every portal grants at least one role and has an icon", () => {
    for (const p of PORTALS) {
      expect(p.roles.length).toBeGreaterThan(0);
      expect(p.icon).toBeTruthy();
    }
  });

  it("referee is not yet available (pages land in sub-project 5)", () => {
    const referee = PORTALS.find((p) => p.id === "referee")!;
    expect(referee.available).toBe(false);
  });

  it("admin, venue, coach, media are available", () => {
    for (const id of ["admin", "venue", "coach", "media"] as const) {
      expect(PORTALS.find((p) => p.id === id)!.available).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/portal/registry.test.ts`
Expected: FAIL — cannot resolve `@/lib/portal/registry`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/portal/registry.ts`:

```ts
import {
  ShieldCheck,
  Building2,
  Whistle,
  Camera,
  Flag,
  Calendar,
  ClipboardList,
  GraduationCap,
  BarChart3,
  Inbox,
  Image,
  History,
  type LucideIcon,
} from "lucide-react";
import { SUPER_ADMIN_NAV, type NavGroup } from "@/lib/admin/nav-super-admin";
import { VENUE_MANAGER_NAV } from "@/lib/admin/nav-venue-manager";
import type { RoleName } from "@/lib/auth/roles";

export type PortalId = "admin" | "venue" | "coach" | "media" | "referee";

export type Portal = {
  id: PortalId;
  label: string;
  icon: LucideIcon;
  basePath: string;
  homeHref: string;
  roles: RoleName[];
  /** Hidden from resolution until its pages exist. */
  available: boolean;
  nav: NavGroup[];
};

// Starter nav for portals whose full IA lands in later sub-projects. These
// list the current top-level routes so the orphan-guard test is meaningful;
// Sub-projects 3 (coach) and 4 (media) will redesign them.
const COACH_NAV: NavGroup[] = [
  {
    name: null,
    items: [
      { name: "Home", href: "/coach", icon: ClipboardList },
      { name: "Schedule", href: "/coach/schedule", icon: Calendar },
      { name: "Practices", href: "/coach/practices", icon: GraduationCap },
      { name: "Assessments", href: "/coach/assessments", icon: ClipboardList },
      { name: "Standings", href: "/coach/standings", icon: BarChart3 },
      { name: "Resources", href: "/coach/resources", icon: GraduationCap },
      { name: "Messages", href: "/coach/messages", icon: Inbox },
    ],
  },
];

const MEDIA_NAV: NavGroup[] = [
  {
    name: null,
    items: [
      { name: "My jobs", href: "/media/jobs", icon: Image },
      { name: "History", href: "/media/history", icon: History },
    ],
  },
];

export const PORTALS: Portal[] = [
  {
    id: "admin",
    label: "Admin",
    icon: ShieldCheck,
    basePath: "/admin",
    homeHref: "/admin",
    roles: ["super_admin"],
    available: true,
    nav: SUPER_ADMIN_NAV,
  },
  {
    id: "venue",
    label: "Venue manager",
    icon: Building2,
    basePath: "/admin",
    homeHref: "/admin/venue",
    roles: ["location_admin"],
    available: true,
    nav: VENUE_MANAGER_NAV,
  },
  {
    id: "coach",
    label: "Coach",
    icon: Whistle,
    basePath: "/coach",
    homeHref: "/coach",
    roles: ["coach"],
    available: true,
    nav: COACH_NAV,
  },
  {
    id: "media",
    label: "Media",
    icon: Camera,
    basePath: "/media",
    homeHref: "/media/jobs",
    roles: ["media_staff", "media_editor"],
    available: true,
    nav: MEDIA_NAV,
  },
  {
    id: "referee",
    label: "Referee",
    icon: Flag,
    basePath: "/referee",
    homeHref: "/referee",
    roles: ["referee"],
    available: false,
    nav: [],
  },
];
```

> Note: if `Whistle` is not exported by the installed `lucide-react` version, substitute `Flag` for the coach icon (run `npx tsc --noEmit` in step 4 — an unknown icon import errors there). Both `Flag` and `Camera` are stable lucide exports.

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run tests/unit/portal/registry.test.ts && npx tsc --noEmit`
Expected: PASS (7 tests); no type errors. If an icon import fails to typecheck, swap it for `Flag`/`Camera`/`Image` and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal/registry.ts tests/unit/portal/registry.test.ts
git commit -m "feat(portal): portal registry (five role-scoped portals)"
```

---

## Task 4: Portal resolution helpers

**Files:**
- Create: `src/lib/portal/resolve.ts`
- Test: `tests/unit/portal/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/portal/resolve.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  resolvePortalsForUser,
  resolvePostLoginTarget,
  getPortalById,
} from "@/lib/portal/resolve";

describe("resolvePortalsForUser", () => {
  it("returns the admin portal for a super_admin", () => {
    expect(resolvePortalsForUser(["super_admin"]).map((p) => p.id)).toEqual(["admin"]);
  });

  it("returns the venue portal for a location_admin", () => {
    expect(resolvePortalsForUser(["location_admin"]).map((p) => p.id)).toEqual(["venue"]);
  });

  it("returns both portals for a multi-role user, registry order preserved", () => {
    const ids = resolvePortalsForUser(["coach", "super_admin"]).map((p) => p.id);
    expect(ids).toEqual(["admin", "coach"]);
  });

  it("maps either media role to the media portal, once", () => {
    expect(resolvePortalsForUser(["media_staff", "media_editor"]).map((p) => p.id)).toEqual(["media"]);
  });

  it("excludes unavailable portals (referee)", () => {
    expect(resolvePortalsForUser(["referee"])).toEqual([]);
  });

  it("returns nothing for customer-only roles", () => {
    expect(resolvePortalsForUser(["parent", "player"])).toEqual([]);
  });
});

describe("resolvePostLoginTarget", () => {
  it("sends customers to the dashboard", () => {
    expect(resolvePostLoginTarget(["parent"])).toBe("/dashboard");
  });

  it("sends a single-portal user straight to that portal's home", () => {
    expect(resolvePostLoginTarget(["super_admin"])).toBe("/admin");
    expect(resolvePostLoginTarget(["location_admin"])).toBe("/admin/venue");
    expect(resolvePostLoginTarget(["coach"])).toBe("/coach");
  });

  it("sends a multi-portal user to the hub", () => {
    expect(resolvePostLoginTarget(["super_admin", "coach"])).toBe("/portal");
  });
});

describe("getPortalById", () => {
  it("finds a portal", () => {
    expect(getPortalById("admin")?.homeHref).toBe("/admin");
  });
  it("returns undefined for an unknown id", () => {
    // @ts-expect-error testing the runtime guard with a bad id
    expect(getPortalById("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/portal/resolve.test.ts`
Expected: FAIL — cannot resolve `@/lib/portal/resolve`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/portal/resolve.ts`:

```ts
import { PORTALS, type Portal, type PortalId } from "./registry";

/**
 * The portals a user can access, in registry order (most-privileged first).
 * A portal matches if any of the user's role names is in its `roles` list and
 * the portal is `available`. De-duped by portal id (the two media roles map to
 * one media portal).
 */
export function resolvePortalsForUser(roleNames: string[]): Portal[] {
  const have = new Set(roleNames);
  return PORTALS.filter(
    (p) => p.available && p.roles.some((r) => have.has(r)),
  );
}

/**
 * Where a freshly-authenticated user belongs:
 *   0 portals → customer dashboard
 *   1 portal  → that portal's home (no hub flash)
 *   2+ portals → the landing hub
 */
export function resolvePostLoginTarget(roleNames: string[]): string {
  const portals = resolvePortalsForUser(roleNames);
  if (portals.length === 0) return "/dashboard";
  if (portals.length === 1) return portals[0].homeHref;
  return "/portal";
}

export function getPortalById(id: PortalId): Portal | undefined {
  return PORTALS.find((p) => p.id === id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/portal/resolve.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal/resolve.ts tests/unit/portal/resolve.test.ts
git commit -m "feat(portal): role→portal resolution + post-login target"
```

---

## Task 5: Wire the hub into magic-link redemption

The magic-link redeem route (`/m/[token].ts`) already fetches the user's roles. Replace the binary `isAdminRole ? "/admin" : "/dashboard"` with `resolvePostLoginTarget`.

**Files:**
- Modify: `src/lib/auth/magic-link-destination.ts:32-47`
- Modify: `src/pages/m/[token].ts:55-66`
- Test: `tests/unit/auth/magic-link-destination.test.ts`

- [ ] **Step 1: Update the existing destination test for the new login behavior**

Open `tests/unit/auth/magic-link-destination.test.ts`. The `login` / `password_reset_login` cases currently assert routing via an `isAdminRole` boolean. Replace the option with `roleNames: string[]` and assert the hub-aware behavior. Replace any test block that calls `destinationFor("login", ...)` / `destinationFor("password_reset_login", ...)` with these cases (keep all other purpose tests unchanged):

```ts
  it("login: honors a safe relative redirectTo override", () => {
    expect(
      destinationFor("login", { redirectTo: "/dashboard/payments" }, "https://x", {
        roleNames: ["super_admin"],
      }),
    ).toBe("/dashboard/payments");
  });

  it("login: routes a single-portal admin to their portal home", () => {
    expect(destinationFor("login", null, "https://x", { roleNames: ["super_admin"] })).toBe("/admin");
    expect(destinationFor("login", null, "https://x", { roleNames: ["location_admin"] })).toBe("/admin/venue");
  });

  it("login: routes a multi-portal user to the hub", () => {
    expect(
      destinationFor("login", null, "https://x", { roleNames: ["super_admin", "coach"] }),
    ).toBe("/portal");
  });

  it("login: routes a customer to the dashboard", () => {
    expect(destinationFor("login", null, "https://x", { roleNames: ["parent"] })).toBe("/dashboard");
  });

  it("password_reset_login: same portal routing as login", () => {
    expect(
      destinationFor("password_reset_login", null, "https://x", { roleNames: ["coach"] }),
    ).toBe("/coach");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/auth/magic-link-destination.test.ts`
Expected: FAIL — `destinationFor` still expects `{ isAdminRole }`; `roleNames` calls return the wrong value / type-error at runtime.

- [ ] **Step 3: Update `destinationFor`**

In `src/lib/auth/magic-link-destination.ts`, add the import at the top:

```ts
import { resolvePostLoginTarget } from "@/lib/portal/resolve";
```

Change the signature (line 32-37) and the login case (lines 41-47):

```ts
export function destinationFor(
  purpose: MagicLinkPurpose,
  context: Record<string, unknown> | null,
  _origin: string,
  opts: { roleNames: string[] },
): string {
  const ctx = context ?? {};

  switch (purpose) {
    case "login":
    case "password_reset_login": {
      if (isSafeRelativePath(ctx.redirectTo)) {
        return ctx.redirectTo;
      }
      return resolvePostLoginTarget(opts.roleNames);
    }
```

Leave every other `case` unchanged.

- [ ] **Step 4: Update the redeem route to pass role names**

In `src/pages/m/[token].ts`, replace lines 55-66 (the `isAdminRole` computation and `destinationFor` call) with:

```ts
  // For plain-login purposes, route by the user's portals (hub for multi-role,
  // straight in for single-role, dashboard for customers).
  const userRoles = await getUserRoles(result.userId);
  const roleNames = userRoles.map((r) => r.name);

  const destination = destinationFor(
    result.purpose,
    result.purposeContext,
    url.origin,
    { roleNames },
  );
  return redirect(destination);
```

- [ ] **Step 5: Run the test + typecheck**

Run: `npx vitest run tests/unit/auth/magic-link-destination.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors (confirms no other caller still passes `isAdminRole`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/magic-link-destination.ts src/pages/m/[token].ts tests/unit/auth/magic-link-destination.test.ts
git commit -m "feat(portal): route magic-link redemption through the portal hub"
```

---

## Task 6: `PortalLayout` component

Generalize `AdminLayout` into a portal-driven layout. Carries forward the exact navy-sidebar design, adds badge rendering (currently typed-but-dead), a breadcrumb slot, and a "Switch portal" link.

**Files:**
- Create: `src/components/portal/portal-layout.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/portal/portal-layout.tsx`:

```tsx
"use client"

import { useState } from "react"
import { Menu, X, LogOut, LayoutGrid } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { VenuePicker } from "@/components/admin/venue-picker"
import { isNavItemActive } from "@/lib/portal/active-state"
import type { NavGroup } from "@/lib/admin/nav-super-admin"

export type PortalBadges = {
  inbox?: number
  refundsPending?: number
  attention?: number
}

export type Breadcrumb = { label: string; href?: string }

interface PortalLayoutProps {
  children: React.ReactNode
  currentPath: string
  /** Portal nav groups to render in the sidebar. */
  navGroups: NavGroup[]
  /** Where the logo links to. */
  homeHref: string
  /** Sidebar subtitle (portal label / venue name). */
  subtitle: string
  /** Footer role label under the user's name. */
  roleLabel: string
  /** When true, show the "Switch portal" link (user has >1 portal). */
  showPortalSwitch?: boolean
  /** Show the venue picker in the top bar (admin/venue only). */
  showVenuePicker?: boolean
  badges?: PortalBadges
  breadcrumbs?: Breadcrumb[]
  user: {
    firstName: string | null
    lastName: string | null
    email: string
  } | null
}

export function PortalLayout({
  children,
  currentPath,
  navGroups,
  homeHref,
  subtitle,
  roleLabel,
  showPortalSwitch = false,
  showVenuePicker = false,
  badges,
  breadcrumbs,
  user,
}: PortalLayoutProps) {
  useHydrationBeacon()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-cream">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-ink/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 md:w-12 lg:w-64 bg-navy-deep transform transition-transform duration-200 ease-in-out md:translate-x-0",
          sidebarOpen ? "translate-x-0 w-64" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between h-16 px-3 lg:px-4 bg-navy">
            <a href={homeHref} className="flex items-center gap-3 min-w-0">
              <img src="/images/logo.svg" alt="Aspire Sports" className="h-8 w-auto flex-shrink-0" />
              <span className={cn(
                "text-[11px] font-semibold tracking-[0.15em] uppercase text-cream/50 truncate",
                sidebarOpen ? "inline" : "hidden lg:inline"
              )}>
                {subtitle}
              </span>
            </a>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-cream/60 hover:text-cream"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <nav className="flex-1 px-1.5 lg:px-2 py-4 overflow-y-auto">
            {navGroups.map((group, gi) => (
              <div key={gi} className={gi === 0 ? "" : "mt-4"}>
                {group.name && (
                  <div className={cn(
                    "px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-cream/40 truncate",
                    sidebarOpen ? "block" : "hidden lg:block"
                  )}>
                    {group.name}
                  </div>
                )}
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = isNavItemActive(currentPath, item.href)
                    const badgeCount = item.badgeKey && badges ? badges[item.badgeKey] : undefined
                    return (
                      <a
                        key={item.name}
                        href={item.href}
                        title={item.name}
                        className={cn(
                          "flex items-center gap-3 px-2 lg:px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px]",
                          isActive
                            ? "bg-navy text-cream"
                            : "text-cream/60 hover:bg-navy hover:text-cream"
                        )}
                      >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        <span className={cn(
                          "flex-1 truncate",
                          sidebarOpen ? "inline" : "hidden lg:inline"
                        )}>{item.name}</span>
                        {badgeCount ? (
                          <span className={cn(
                            "ml-auto inline-flex items-center justify-center rounded-full bg-rust text-cream text-[10px] font-semibold min-w-[18px] h-[18px] px-1",
                            sidebarOpen ? "inline-flex" : "hidden lg:inline-flex"
                          )}>
                            {badgeCount > 99 ? "99+" : badgeCount}
                          </span>
                        ) : null}
                      </a>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="p-2 lg:p-4 border-t border-cream/10">
            {showPortalSwitch && (
              <a
                href="/portal"
                title="Switch portal"
                className="flex items-center gap-3 px-2 lg:px-3 py-2 mb-2 rounded-lg text-sm font-medium text-cream/60 hover:bg-navy hover:text-cream min-h-[44px]"
              >
                <LayoutGrid className="h-5 w-5 flex-shrink-0" />
                <span className={cn(sidebarOpen ? "inline" : "hidden lg:inline")}>
                  Switch portal
                </span>
              </a>
            )}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-navy flex items-center justify-center text-cream font-medium flex-shrink-0">
                {user?.firstName?.[0] || user?.email[0].toUpperCase()}
              </div>
              <div className={cn(
                "flex-1 min-w-0",
                sidebarOpen ? "block" : "hidden lg:block"
              )}>
                <p className="text-sm font-medium text-cream truncate">
                  {user?.firstName && user?.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user?.email}
                </p>
                <p className="text-xs text-cream/50 truncate">{roleLabel}</p>
              </div>
            </div>
            <form action="/api/auth/signout" method="POST" className="mt-3">
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                title="Sign out"
                className="w-full justify-start text-cream/60 hover:text-cream hover:bg-navy min-h-[44px]"
              >
                <LogOut className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className={cn(sidebarOpen ? "inline" : "hidden lg:inline")}>
                  Sign out
                </span>
              </Button>
            </form>
          </div>
        </div>
      </aside>

      <div className="md:pl-12 lg:pl-64">
        <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between h-16 px-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden text-ink-muted hover:text-ink"
              >
                <Menu className="h-6 w-6" />
              </button>
              {breadcrumbs && breadcrumbs.length > 0 && (
                <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1 text-sm text-ink-muted min-w-0">
                  {breadcrumbs.map((crumb, i) => (
                    <span key={i} className="flex items-center gap-1 min-w-0">
                      {i > 0 && <span className="text-ink-muted/50">/</span>}
                      {crumb.href ? (
                        <a href={crumb.href} className="hover:text-ink truncate">{crumb.label}</a>
                      ) : (
                        <span className="text-ink truncate">{crumb.label}</span>
                      )}
                    </span>
                  ))}
                </nav>
              )}
            </div>
            <div className="flex items-center gap-4">
              {showVenuePicker && <VenuePicker />}
              <a
                href="/"
                className="text-sm text-ink-muted hover:text-ink transition-colors"
              >
                View Site
              </a>
            </div>
          </div>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `bg-rust` is not a defined Tailwind color in this project, change it to `bg-navy` — verify with `grep -rn "rust\|bg-navy" src/styles tailwind.config.* 2>/dev/null`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/portal/portal-layout.tsx
git commit -m "feat(portal): PortalLayout (badges, breadcrumbs, portal switch)"
```

---

## Task 7: Reduce `AdminLayout` to a `PortalLayout` wrapper

Keep the existing `AdminLayout` public props (so the ~70 admin `.astro` pages need no change) but render `PortalLayout` underneath, resolving the portal from the role. This is the "migrate /admin onto the system" proof.

**Files:**
- Modify: `src/components/admin/admin-layout.tsx` (full replace)

- [ ] **Step 1: Replace the component body**

Replace the entire contents of `src/components/admin/admin-layout.tsx` with:

```tsx
"use client"

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
 * narrower `venue` portal (the safe default, matching the prior
 * getSidebarForRole behavior).
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

  return (
    <PortalLayout
      currentPath={currentPath}
      navGroups={portal.nav}
      homeHref={portal.homeHref}
      subtitle={subtitle}
      roleLabel={roleLabel}
      showPortalSwitch={multiPortal}
      showVenuePicker
      badges={badges}
      breadcrumbs={breadcrumbs}
      user={user}
    >
      {children}
    </PortalLayout>
  )
}
```

- [ ] **Step 2: Confirm the existing sidebar test still passes**

The registry reuses `SUPER_ADMIN_NAV` / `VENUE_MANAGER_NAV`, so `getSidebarForRole` and its test are untouched.

Run: `npx vitest run tests/unit/admin/sidebar-for-role.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds. The admin pages pass `role`/`currentPath`/`user` exactly as before; the new optional props default safely.

> If `npm run build` cannot run locally (Node 25 breaks `astro build` per project notes), run `npx tsc --noEmit` only and rely on CI for the build. Note this in the task handoff.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/admin-layout.tsx
git commit -m "refactor(portal): AdminLayout delegates to PortalLayout"
```

---

## Task 8: Portal landing hub page + middleware rule

**Files:**
- Create: `src/pages/portal/index.astro`
- Modify: `src/middleware.ts:51-62`

- [ ] **Step 1: Add the authed middleware rule**

In `src/middleware.ts`, add to `ROUTE_RULES` (after the `/admin` and `/coach` role rules, alongside the other `authed` patterns, around line 57):

```ts
  { kind: "authed", pattern: /^\/portal(\/|$)/ },
```

- [ ] **Step 2: Create the hub page**

Create `src/pages/portal/index.astro`:

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";
import { resolvePortalsForUser, resolvePostLoginTarget } from "@/lib/portal/resolve";

export const prerender = false;

// Middleware guarantees a signed-in user on /portal.
const user = Astro.locals.user!;
const roleNames = (Astro.locals.userRoles ?? []).map((r) => r.name);
const portals = resolvePortalsForUser(roleNames);

// Collapse the trivial cases so multi-portal users are the only ones who see
// the hub. resolvePostLoginTarget returns "/portal" only when there are 2+.
if (portals.length < 2) {
  return Astro.redirect(resolvePostLoginTarget(roleNames), 302);
}
---

<BaseLayout title="Choose a portal — Aspire Sports" navigation={false} footer={false}>
  <main class="min-h-screen bg-cream flex items-center justify-center p-6">
    <div class="w-full max-w-2xl">
      <div class="mb-8 text-center">
        <img src="/images/logo.svg" alt="Aspire Sports" class="h-10 w-auto mx-auto mb-4" />
        <h1 class="text-2xl font-semibold text-ink">
          Welcome back{user.firstName ? `, ${user.firstName}` : ""}
        </h1>
        <p class="text-ink-muted mt-1">Choose where you want to go.</p>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        {portals.map((portal) => (
          <a
            href={portal.homeHref}
            class="group flex items-center gap-4 rounded-2xl border border-border bg-white p-5 transition-colors hover:border-navy hover:bg-navy/5"
          >
            <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-navy text-cream">
              <portal.icon class="h-6 w-6" />
            </div>
            <div class="min-w-0">
              <p class="font-semibold text-ink">{portal.label}</p>
              <p class="text-sm text-ink-muted truncate">{portal.homeHref}</p>
            </div>
          </a>
        ))}
      </div>
      <div class="mt-8 text-center">
        <a href="/" class="text-sm text-ink-muted hover:text-ink">View site</a>
      </div>
    </div>
  </main>
</BaseLayout>
```

> `portal.icon` is a lucide React component rendered inside `.astro` markup — Astro renders React components statically without a `client:` directive, which is what we want (the hub is fully static). If Astro errors on the bare component tag, wrap as `<portal.icon className="h-6 w-6" />` (React prop name) — Astro accepts both for React components, but `className` is the safe form.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; `/portal` builds as an SSR route. (Node-25 caveat from Task 7 applies — fall back to `tsc` + CI if needed.)

- [ ] **Step 4: Manual smoke (if a dev server is available)**

Start the dev server and verify: a single-role admin hitting `/portal` 302s to `/admin`; a customer 302s to `/dashboard`; a user with two portals sees two cards. If no dev server (Node-25), rely on the resolver unit tests (Task 4) which cover the same branching.

- [ ] **Step 5: Commit**

```bash
git add src/pages/portal/index.astro src/middleware.ts
git commit -m "feat(portal): multi-role landing hub at /portal"
```

---

## Task 9: Orphan-guard route-coverage test

A pure unit test that fails CI if any portal page is unreachable from nav (and not a known dynamic/redirect/contextual route).

**Files:**
- Create: `tests/unit/portal/route-coverage.test.ts`

- [ ] **Step 1: Write the test (it will fail until the whitelist is complete)**

Create `tests/unit/portal/route-coverage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PORTALS } from "@/lib/portal/registry";

const PAGES_DIR = fileURLToPath(new URL("../../../src/pages", import.meta.url));
const PORTAL_DIRS = ["admin", "coach", "media", "referee"];

/** All nav hrefs across every portal. */
const navHrefs = new Set(
  PORTALS.flatMap((p) => p.nav.flatMap((g) => g.items.map((i) => i.href))),
);

/**
 * Routes intentionally reached only via contextual links (not the sidebar),
 * or whose nav placement is owned by a later sub-project. Each entry MUST carry
 * a reason. Remove entries as Sub-projects 1–4 give these pages real nav homes.
 */
const CONTEXTUAL_ROUTES = new Set<string>([
  // Reached via contextual links (confirmed in the codebase) — keep contextual.
  "/admin/registrations", // from season-detail + registration-detail
  "/admin/teams",         // from season-detail + roster-manager
  "/admin/sports",        // from programs-list (also a /admin/programs tab)
  // TODO(sub-project 1): orphans to be placed in the super-admin nav redesign.
  "/admin/games",
  "/admin/age-groups",
  "/admin/game-day/today",
  "/admin/broadcasts",
  "/admin/re-registration-campaign",
  "/admin/reports",            // reports hub; nav links straight to sub-reports today
  "/admin/walk-up-registration", // 301 redirect stub (also caught by redirect check)
  "/admin/check-in",             // 301 redirect stub
  "/admin/venues",               // 301 redirect stub
  // TODO(sub-project 1): media management lives under /admin (distinct from /media worker queue).
  "/admin/media/shoots",
  "/admin/media/staff",
  "/admin/media/tag-queue",
  // Reached from a parent index (e.g. /admin/dropins, /admin/rentals, /admin/memberships,
  // /admin/curriculum, /admin/gear, /admin/locations, /admin/branding) — contextual sub-pages.
  "/admin/dropin/rate-card",
  "/admin/dropin/sessions",
  "/admin/rentals/rate-card",
  "/admin/rentals/new",
  "/admin/memberships/new",
  "/admin/gear/products",
  "/admin/curriculum/activities",
  "/admin/curriculum/skills",
  "/admin/curriculum/templates",
  "/admin/media/shoots/bulk",
  "/admin/venue/walk-up",      // in venue nav as "Walk-up reg" -> /admin/venue/walk-up
  "/admin/venue/check-in",     // in venue nav as "Check-in"
  // Always-reachable utility pages.
  "/admin/unauthorized",
  "/admin/organizations", // super-admin-only org switcher; intentionally unlinked
  "/admin/walk-up-registration",
]);

/** Recursively collect .astro files under a directory. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".astro")) out.push(full);
  }
  return out;
}

/** Map a .astro file path to its route, e.g. .../admin/seasons/index.astro -> /admin/seasons */
function fileToRoute(file: string): string {
  const rel = path.relative(PAGES_DIR, file).replace(/\\/g, "/");
  let route = "/" + rel.replace(/\.astro$/, "");
  route = route.replace(/\/index$/, "");
  return route === "" ? "/" : route;
}

const isDynamic = (route: string) => route.includes("[");

/** A redirect stub is a tiny file whose frontmatter calls Astro.redirect. */
function isRedirectStub(file: string): boolean {
  const src = readFileSync(file, "utf8");
  return /Astro\.redirect\(/.test(src) && src.length < 800;
}

describe("portal route coverage (orphan guard)", () => {
  const files = PORTAL_DIRS
    .map((d) => path.join(PAGES_DIR, d))
    .filter((d) => {
      try { return statSync(d).isDirectory(); } catch { return false; }
    })
    .flatMap(walk);

  const uncovered = files
    .map((file) => ({ file, route: fileToRoute(file) }))
    .filter(({ file, route }) =>
      !navHrefs.has(route) &&
      !CONTEXTUAL_ROUTES.has(route) &&
      !isDynamic(route) &&
      !isRedirectStub(file),
    )
    .map(({ route }) => route);

  it("has no orphaned portal pages", () => {
    expect(uncovered).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to see uncovered routes**

Run: `npx vitest run tests/unit/portal/route-coverage.test.ts`
Expected: Either PASS, or FAIL printing an array of route strings that are neither in nav nor whitelisted.

- [ ] **Step 3: Triage every printed route into nav or whitelist**

For each route the test prints:
- If it legitimately belongs in a portal's sidebar **today** and is owned by *this* sub-project — it does not; nav content changes are Sub-projects 1–4. So:
- Add it to `CONTEXTUAL_ROUTES` with a one-line reason comment. Use `// TODO(sub-project 1)` for `/admin/*` pages that should eventually get a sidebar home, and a plain reason for genuinely-contextual sub-pages (reached from a parent index/detail).

Re-run until the array is empty. Do **not** silence the test by deleting it or broadening `isDynamic`/`isRedirectStub`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/portal/route-coverage.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add tests/unit/portal/route-coverage.test.ts
git commit -m "test(portal): orphan-guard route coverage for portal pages"
```

---

## Task 10: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite**

Run: `npx vitest run tests/unit/portal tests/unit/admin/sidebar-for-role.test.ts tests/unit/auth/magic-link-destination.test.ts`
Expected: all PASS.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: zero errors (CLAUDE.md baseline).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success. (If Node 25 blocks the local build, state that explicitly and defer the build check to CI per project notes.)

- [ ] **Step 4: Run the broader unit suite to catch regressions**

Run: `npx vitest run tests/unit`
Expected: no regressions introduced by the role-type and layout changes.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin docs/portal-ia-foundation
```
Then open a PR to `main` summarizing: portal registry + resolver, PortalLayout, hub, orphan guard; `/admin` migrated; coach/media/referee adoption deferred to their sub-projects. Wait for CI green before declaring done (CLAUDE.md release process).

---

## Self-Review notes (addressed during authoring)

- **Spec coverage:** registry (Task 3), PortalLayout incl. badges/breadcrumbs/switch (Task 6), hub + post-login routing (Tasks 4, 5, 8), orphan guard (Task 9), `/admin` migration (Task 7). Referee/coach/media full adoption explicitly deferred per spec scope.
- **`referee` type gap:** discovered during planning (both `RoleName` and `getPrimaryRoleName` omit it though the DB enum has it) — fixed in Task 1.
- **Magic-link, not signin-form:** auth is magic-link only; the integration point is `destinationFor` / `/m/[token].ts`, not the signin form (Task 5).
- **Badge data vs mechanism:** Task 6 renders badges *when fed*; populating counts is Sub-project 1 (admin IA). Honest to the spec's "render the typed-but-dead badges" without scope-creeping data fetching.
