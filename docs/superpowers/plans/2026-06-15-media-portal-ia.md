# Media Portal IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the media portal first-class for both sub-roles — a role-aware sidebar, a new editor **Tagging queue** (the missing editor entry point), a role-aware `/media` home, a queue badge, and all 4 `/media` pages on the portal chrome.

**Architecture:** Mirror SP2/SP3. The registry holds the full `MEDIA_NAV` (so the orphan-guard covers every page); a `MediaLayout` (mirroring `src/components/admin/admin-layout.tsx`) renders a role-filtered nav via `getMediaNav(roleNames)` and fetches a queue badge. The editor queue reuses the service-area model (`mediaStaffProfiles.serviceLocationIds`) and the `locationId`→venue fallback from `tag-permissions.ts`.

**Tech Stack:** Astro 5 + React 19, Drizzle ORM, Vitest. Spec: `docs/superpowers/specs/2026-06-15-media-portal-ia-design.md`.

**Task order is dependency-first** so every TDD step goes green when run: badge types → queue helper → nav → layout → queue page → home redirect → badge endpoint → migrate → verify.

---

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `src/lib/admin/nav-super-admin.ts` | Modify | add `mediaQueue` to `NavItem.badgeKey` |
| `src/components/portal/portal-layout.tsx` | Modify | add `mediaQueue` to `PortalBadges` |
| `src/lib/media/get-tagging-queue.ts` | Create | editor's tagging queue (service-area scoped) |
| `src/lib/admin/nav-media.ts` | Create | full `MEDIA_NAV` + `getMediaNav(roles)` |
| `src/lib/portal/registry.ts` | Modify | import full `MEDIA_NAV`, drop inline starter |
| `src/components/media/media-layout.tsx` | Create | portal chrome + role-aware nav + badge fetch |
| `src/components/media/tagging-queue.tsx` | Create | queue list display |
| `src/pages/media/queue.astro` | Create | editor Tagging queue page |
| `src/pages/media/index.astro` | Create | role-aware `/media` redirect |
| `src/pages/api/media/nav-badges.ts` | Create | editor tagging-queue count |
| `src/pages/media/**` (4 pages) | Modify | `BaseLayout` → portal chrome |
| `tests/unit/media/get-tagging-queue.test.ts` | Create | service-area scoping; empty profile |
| `tests/unit/admin/nav-media.test.ts` | Create | role filtering; badge; static pages resolve |
| `tests/unit/media/media-nav-badges.test.ts` | Create | editor count; 0 for non-editor |
| `tests/unit/portal/route-coverage.test.ts` | Modify | coverage for new pages |

---

## Task 1: Badge type plumbing

**Files:**
- Modify: `src/lib/admin/nav-super-admin.ts`
- Modify: `src/components/portal/portal-layout.tsx`

- [ ] **Step 1: Extend the `NavItem.badgeKey` union**

In `src/lib/admin/nav-super-admin.ts`, change:

```ts
  badgeKey?: "inbox" | "refundsPending" | "attention";
```
to:
```ts
  badgeKey?: "inbox" | "refundsPending" | "attention" | "mediaQueue";
```

- [ ] **Step 2: Extend `PortalBadges`**

In `src/components/portal/portal-layout.tsx`, change:

```ts
export type PortalBadges = {
  inbox?: number
  refundsPending?: number
  attention?: number
```
to add the new optional key:
```ts
export type PortalBadges = {
  inbox?: number
  refundsPending?: number
  attention?: number
  mediaQueue?: number
```
(Leave the rest of the type unchanged.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0 (additive change; nothing else references the new key yet).

- [ ] **Step 4: Commit**

```bash
git add src/lib/admin/nav-super-admin.ts src/components/portal/portal-layout.tsx
git commit -m "feat(media-ia): add mediaQueue badge key to nav/portal types"
```

---

## Task 2: `getTaggingQueue` helper

**Files:**
- Create: `src/lib/media/get-tagging-queue.ts`
- Create: `tests/unit/media/get-tagging-queue.test.ts`

Scopes to sessions in `tagging` state whose effective location (own `locationId`,
else the venue's `locationId`) ∈ the editor's active `serviceLocationIds` — the
same resolution `tag-permissions.ts` uses, so the queue and the per-session
permission check agree.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media/get-tagging-queue.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

let profile: { serviceLocationIds: string[] | null; active: boolean; organizationId: string } | null = null;
let rows: Array<{
  sessionId: string; sessionType: string; scheduledStart: Date; updatedAt: Date;
  sessionLocationId: string | null; venueLocationId: string | null;
  venueName: string | null; locationName: string | null;
}> = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    query: { mediaStaffProfiles: { findFirst: async () => profile } },
    select: () => ({ from: () => ({ leftJoin: () => ({ leftJoin: () => ({ where: () => ({ orderBy: async () => rows }) }) }) }) }),
  }),
}));

import { getTaggingQueue } from "@/lib/media/get-tagging-queue";

const D = new Date("2026-06-15T12:00:00Z");

describe("getTaggingQueue", () => {
  beforeEach(() => { profile = null; rows = []; });

  it("returns [] when the editor has no active profile", async () => {
    profile = null;
    expect(await getTaggingQueue("u1")).toEqual([]);
  });

  it("returns [] for an inactive profile", async () => {
    profile = { serviceLocationIds: ["loc1"], active: false, organizationId: "o1" };
    expect(await getTaggingQueue("u1")).toEqual([]);
  });

  it("keeps only sessions whose effective location is in the service area", async () => {
    profile = { serviceLocationIds: ["loc1"], active: true, organizationId: "o1" };
    rows = [
      // in service area via session.locationId
      { sessionId: "s1", sessionType: "game", scheduledStart: D, updatedAt: D, sessionLocationId: "loc1", venueLocationId: null, venueName: null, locationName: "Downtown" },
      // in service area via venue fallback (session.locationId null)
      { sessionId: "s2", sessionType: "game", scheduledStart: D, updatedAt: D, sessionLocationId: null, venueLocationId: "loc1", venueName: "Field A", locationName: null },
      // NOT in service area
      { sessionId: "s3", sessionType: "game", scheduledStart: D, updatedAt: D, sessionLocationId: "loc2", venueLocationId: null, venueName: null, locationName: "Worthington" },
    ];
    expect(await getTaggingQueue("u1")).toEqual([
      { sessionId: "s1", sessionType: "game", scheduledStart: D, placeName: "Downtown" },
      { sessionId: "s2", sessionType: "game", scheduledStart: D, placeName: "Field A" },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/media/get-tagging-queue.test.ts`
Expected: FAIL — cannot resolve `@/lib/media/get-tagging-queue`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/media/get-tagging-queue.ts`:

```ts
import { and, eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { shootSessions, mediaStaffProfiles } from "@/lib/db/schema/media";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";

export type TaggingQueueItem = {
  sessionId: string;
  sessionType: string;
  scheduledStart: Date;
  placeName: string;
};

/**
 * Sessions waiting for an editor to tag: status 'tagging', within the editor's
 * active service area. Effective location = session.locationId, else the
 * session's venue's locationId (matches tag-permissions.ts). Inactive/absent
 * profile, or empty service area → [].
 */
export async function getTaggingQueue(editorUserId: string): Promise<TaggingQueueItem[]> {
  const db = getDb();
  const profile = await db.query.mediaStaffProfiles.findFirst({
    where: eq(mediaStaffProfiles.userId, editorUserId),
    columns: { serviceLocationIds: true, active: true, organizationId: true },
    orderBy: (p, { asc: a }) => a(p.createdAt),
  });
  if (!profile || profile.active === false) return [];
  const serviceIds = profile.serviceLocationIds ?? [];
  if (serviceIds.length === 0) return [];

  const rows = await db
    .select({
      sessionId: shootSessions.id,
      sessionType: shootSessions.sessionType,
      scheduledStart: shootSessions.scheduledStart,
      updatedAt: shootSessions.updatedAt,
      sessionLocationId: shootSessions.locationId,
      venueLocationId: venues.locationId,
      venueName: venues.name,
      locationName: locations.name,
    })
    .from(shootSessions)
    .leftJoin(venues, eq(venues.id, shootSessions.venueId))
    .leftJoin(locations, eq(locations.id, shootSessions.locationId))
    .where(and(eq(shootSessions.organizationId, profile.organizationId), eq(shootSessions.status, "tagging")))
    .orderBy(asc(shootSessions.updatedAt));

  return rows
    .map((r) => ({ ...r, effectiveLocationId: r.sessionLocationId ?? r.venueLocationId }))
    .filter((r): r is typeof r & { effectiveLocationId: string } =>
      r.effectiveLocationId != null && serviceIds.includes(r.effectiveLocationId))
    .map((r) => ({
      sessionId: r.sessionId,
      sessionType: r.sessionType,
      scheduledStart: r.scheduledStart,
      placeName: r.locationName ?? r.venueName ?? "Unknown",
    }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/media/get-tagging-queue.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/media/get-tagging-queue.ts tests/unit/media/get-tagging-queue.test.ts
git commit -m "feat(media-ia): getTaggingQueue helper (service-area scoped)"
```

---

## Task 3: `nav-media.ts` (full nav + role filter) + registry wiring

**Files:**
- Create: `src/lib/admin/nav-media.ts`
- Create: `tests/unit/admin/nav-media.test.ts`
- Modify: `src/lib/portal/registry.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin/nav-media.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MEDIA_NAV, getMediaNav } from "@/lib/admin/nav-media";

const PAGES = fileURLToPath(new URL("../../../src/pages", import.meta.url));
const allHrefs = (nav: { items: { href: string }[] }[]) => nav.flatMap((g) => g.items.map((i) => i.href));

function resolves(href: string): boolean {
  return (
    existsSync(path.join(PAGES, href.replace(/^\//, "") + ".astro")) ||
    existsSync(path.join(PAGES, href.replace(/^\//, ""), "index.astro"))
  );
}

describe("MEDIA_NAV / getMediaNav", () => {
  it("the existing static pages resolve", () => {
    // /media/queue is created in a later task; the orphan-guard verifies it then.
    for (const h of ["/media/jobs", "/media/history"]) {
      expect(resolves(h)).toBe(true);
    }
  });
  it("media_staff sees jobs + history (not the queue)", () => {
    const hrefs = allHrefs(getMediaNav(["media_staff"]));
    expect(hrefs).toContain("/media/jobs");
    expect(hrefs).toContain("/media/history");
    expect(hrefs).not.toContain("/media/queue");
  });
  it("media_editor sees the queue + history (not jobs)", () => {
    const hrefs = allHrefs(getMediaNav(["media_editor"]));
    expect(hrefs).toContain("/media/queue");
    expect(hrefs).toContain("/media/history");
    expect(hrefs).not.toContain("/media/jobs");
  });
  it("a dual-role user sees all three", () => {
    const hrefs = allHrefs(getMediaNav(["media_staff", "media_editor"]));
    expect(hrefs).toEqual(expect.arrayContaining(["/media/jobs", "/media/queue", "/media/history"]));
  });
  it("the queue item carries the mediaQueue badge", () => {
    const item = getMediaNav(["media_editor"]).flatMap((g) => g.items).find((i) => i.href === "/media/queue");
    expect(item?.badgeKey).toBe("mediaQueue");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/admin/nav-media.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin/nav-media`.

- [ ] **Step 3: Create `nav-media.ts`**

Create `src/lib/admin/nav-media.ts`:

```ts
import { Image, ListChecks, History } from "lucide-react";
import type { NavGroup, NavItem } from "./nav-super-admin";

const MY_JOBS: NavItem = { name: "My jobs", href: "/media/jobs", icon: Image };
const TAGGING_QUEUE: NavItem = { name: "Tagging queue", href: "/media/queue", icon: ListChecks, badgeKey: "mediaQueue" };
const HISTORY: NavItem = { name: "History", href: "/media/history", icon: History };

// Full media nav — used by the registry so the orphan-guard covers every page.
export const MEDIA_NAV: NavGroup[] = [{ name: null, items: [MY_JOBS, TAGGING_QUEUE, HISTORY] }];

// Role-filtered view rendered by MediaLayout. The two sub-roles do different
// work: media_staff shoot (jobs), media_editor tag (queue); History is shared.
export function getMediaNav(roleNames: string[]): NavGroup[] {
  const isStaff = roleNames.includes("media_staff");
  const isEditor = roleNames.includes("media_editor");
  const items: NavItem[] = [];
  if (isStaff) items.push(MY_JOBS);
  if (isEditor) items.push(TAGGING_QUEUE);
  items.push(HISTORY);
  return [{ name: null, items }];
}
```

- [ ] **Step 4: Wire the registry**

In `src/lib/portal/registry.ts`: delete the inline `const MEDIA_NAV: NavGroup[] = [...]` block (My jobs + History) and add `import { MEDIA_NAV } from "@/lib/admin/nav-media";` beside the other nav imports. The `media` entry in `PORTALS` already references `MEDIA_NAV`. Then remove any icon imports at the top of `registry.ts` now unreferenced (`Image`, `History` were used by the inline block — check they aren't used elsewhere; `tsc` Step 6 catches a miss).

- [ ] **Step 5: Run the nav test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/admin/nav-media.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin/nav-media.ts src/lib/portal/registry.ts tests/unit/admin/nav-media.test.ts
git commit -m "feat(media-ia): role-aware media nav, wired into the registry"
```

---

## Task 4: `MediaLayout` component

**Files:**
- Create: `src/components/media/media-layout.tsx`

Mirrors `src/components/admin/admin-layout.tsx`, with one addition: a `roleNames`
prop that drives `getMediaNav`. Fetches `/api/media/nav-badges` (that endpoint
lands in Task 7; until then the fetch fails soft and shows no badge).

- [ ] **Step 1: Create the component**

Create `src/components/media/media-layout.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { PortalLayout, type PortalBadges, type Breadcrumb } from "@/components/portal/portal-layout"
import { getPortalById } from "@/lib/portal/resolve"
import { getMediaNav } from "@/lib/admin/nav-media"

interface MediaLayoutProps {
  children: React.ReactNode
  currentPath: string
  /** The signed-in user's role names — drives the role-filtered nav. */
  roleNames: string[]
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
 * Portal chrome for the /media tree. Renders a role-filtered nav (staff vs
 * editor) and fetches the tagging-queue badge once on mount (fail-soft).
 */
export function MediaLayout({ children, currentPath, roleNames, multiPortal = false, breadcrumbs, user }: MediaLayoutProps) {
  const portal = getPortalById("media")!

  const [fetched, setFetched] = useState<PortalBadges | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch("/api/media/nav-badges")
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
      navGroups={getMediaNav(roleNames)}
      homeHref={portal.homeHref}
      subtitle="Media"
      roleLabel="Media"
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
Expected: exit 0. If `PortalLayout` requires a prop not passed here, compare to `admin-layout.tsx`'s call (intentional omissions: `showVenuePicker`, `venueLabel`) and add it.

- [ ] **Step 3: Commit**

```bash
git add src/components/media/media-layout.tsx
git commit -m "feat(media-ia): MediaLayout chrome with role-aware nav + badge fetch"
```

---

## Task 5: Tagging queue page

**Files:**
- Create: `src/components/media/tagging-queue.tsx`
- Create: `src/pages/media/queue.astro`

- [ ] **Step 1: Create the display component**

Create `src/components/media/tagging-queue.tsx`:

```tsx
"use client"

import { ListChecks } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"

export interface TaggingQueueItem {
  sessionId: string
  sessionType: string
  scheduledStart: string
  placeName: string
}

export function TaggingQueue({ items }: { items: TaggingQueueItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing to tag right now"
        description="Sessions ready for tagging in your service area will show up here."
        icon={<ListChecks className="h-10 w-10" />}
      />
    )
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tagging queue</h1>
        <p className="text-muted-foreground mt-1">Sessions waiting to be tagged in your service area.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <a key={it.sessionId} href={`/media/tag/${it.sessionId}`} className="block">
            <Card className="transition-colors hover:border-primary">
              <CardHeader className="pb-2">
                <CardTitle className="text-base capitalize">{it.sessionType} — {it.placeName}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground">
                {new Date(it.scheduledStart).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </CardContent>
            </Card>
          </a>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the page**

Create `src/pages/media/queue.astro`:

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import { MediaLayout } from '@/components/media/media-layout';
import { TaggingQueue } from '@/components/media/tagging-queue';
import { getTaggingQueue } from '@/lib/media/get-tagging-queue';

export const prerender = false;

// Middleware guarantees a media role for /media/**
const user = Astro.locals.user!;
const roleNames = (Astro.locals.userRoles ?? []).map((r) => r.name);
const queue = await getTaggingQueue(user.id);
const items = queue.map((q) => ({
  sessionId: q.sessionId,
  sessionType: q.sessionType,
  scheduledStart: q.scheduledStart.toISOString(),
  placeName: q.placeName,
}));
---

<BaseLayout title="Tagging Queue — Aspire Media" navigation={false} footer={false}>
  <MediaLayout
    client:load
    currentPath="/media/queue"
    roleNames={roleNames}
    user={{ firstName: user.firstName, lastName: user.lastName, email: user.email }}
  >
    <TaggingQueue client:load items={items} />
  </MediaLayout>
</BaseLayout>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (Confirm `EmptyState` / `Card*` import paths match those used in `src/components/admin/venue/venue-rosters.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add src/components/media/tagging-queue.tsx src/pages/media/queue.astro
git commit -m "feat(media-ia): editor Tagging queue page"
```

---

## Task 6: Role-aware `/media` home redirect

**Files:**
- Create: `src/pages/media/index.astro`

- [ ] **Step 1: Create the redirect page**

Create `src/pages/media/index.astro`:

```astro
---
export const prerender = false;

// Role-aware landing: staff → jobs, editor → tagging queue. Middleware already
// gates /media to media roles; the /dashboard fallback is a safety net.
const roleNames = (Astro.locals.userRoles ?? []).map((r) => r.name);
if (roleNames.includes("media_staff")) return Astro.redirect("/media/jobs");
if (roleNames.includes("media_editor")) return Astro.redirect("/media/queue");
return Astro.redirect("/dashboard");
---
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/pages/media/index.astro
git commit -m "feat(media-ia): role-aware /media landing redirect"
```

---

## Task 7: Media nav-badges endpoint

**Files:**
- Create: `src/pages/api/media/nav-badges.ts`
- Create: `tests/unit/media/media-nav-badges.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media/media-nav-badges.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

let queue: unknown[] = [];
vi.mock("@/lib/media/get-tagging-queue", () => ({
  getTaggingQueue: async () => queue,
}));

import { GET } from "@/pages/api/media/nav-badges";

const ctx = (roles: string[]) =>
  ({ locals: { user: { id: "u1" }, userRoles: roles.map((name) => ({ name })) } }) as never;

describe("GET /api/media/nav-badges", () => {
  beforeEach(() => { queue = []; });

  it("returns 0 for a non-editor (media_staff)", async () => {
    queue = [{}, {}];
    const res = await GET(ctx(["media_staff"]));
    expect(await res.json()).toEqual({ mediaQueue: 0 });
  });

  it("returns the queue length for an editor", async () => {
    queue = [{}, {}, {}];
    const res = await GET(ctx(["media_editor"]));
    expect(await res.json()).toEqual({ mediaQueue: 3 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/media/media-nav-badges.test.ts`
Expected: FAIL — cannot resolve `@/pages/api/media/nav-badges`.

- [ ] **Step 3: Implement the endpoint**

Create `src/pages/api/media/nav-badges.ts`:

```ts
import type { APIRoute } from "astro";
import { getTaggingQueue } from "@/lib/media/get-tagging-queue";

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// Editor tagging-queue count for the media sidebar badge. Fail-soft: any error
// (or non-editor) returns { mediaQueue: 0 }, never 500.
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const roleNames = (locals.userRoles ?? []).map((r) => r.name);
  if (!roleNames.includes("media_editor")) return json({ mediaQueue: 0 });
  try {
    const queue = await getTaggingQueue(locals.user.id);
    return json({ mediaQueue: queue.length });
  } catch {
    return json({ mediaQueue: 0 });
  }
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/media/media-nav-badges.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/media/nav-badges.ts tests/unit/media/media-nav-badges.test.ts
git commit -m "feat(media-ia): tagging-queue badge endpoint"
```

---

## Task 8: Migrate the 4 media pages onto portal chrome

**Files (Modify):** `src/pages/media/jobs/index.astro`, `src/pages/media/jobs/[id].astro`, `src/pages/media/tag/[session_id].astro`, `src/pages/media/history.astro`. (`queue.astro` and `index.astro` are already on the portal chrome / are redirects.)

**The transformation (apply to each page):**
1. Keep the frontmatter's component imports and data fetching, and `const user = Astro.locals.user!;`. Add `const roleNames = (Astro.locals.userRoles ?? []).map((r) => r.name);`.
2. Add `import { MediaLayout } from '@/components/media/media-layout';` (keep the `BaseLayout` import).
3. Replace the page's outer `<BaseLayout title="...">…</BaseLayout>` and its bespoke `<main>` / header markup with:

```astro
<BaseLayout title="<existing title>" navigation={false} footer={false}>
  <MediaLayout
    client:load
    currentPath="<the page's nav prefix>"
    roleNames={roleNames}
    user={{ firstName: user.firstName, lastName: user.lastName, email: user.email }}
  >
    <!-- the page's existing inner content component(s), unchanged -->
  </MediaLayout>
</BaseLayout>
```

4. `currentPath` per page: `jobs/index` → `/media/jobs`; `jobs/[id]` → `/media/jobs`; `history` → `/media/history`; `tag/[session_id]` → `/media/tag`. The drill-in `jobs/[id]` and `tag/[session_id]` pages pass `breadcrumbs` back to their list — `jobs/[id]`: `breadcrumbs={[{ label: "My jobs", href: "/media/jobs" }]}`; `tag/[session_id]`: `breadcrumbs={[{ label: "Tagging queue", href: "/media/queue" }]}` (match the `Breadcrumb` type from `@/components/portal/portal-layout`).
5. Drop in-page header/back-link chrome (PortalLayout provides it); keep genuine content (the `client:load` components and any page-specific UI).
6. Ensure `export const prerender = false;` is present.
7. NOTE on `tag/[session_id].astro`: it currently has its own forbidden/error HTML branches and already uses `navigation={false} footer={false}`. Preserve its error/forbidden handling; only the success branch's chrome moves into `MediaLayout`.

- [ ] **Step 1: Migrate `jobs/index.astro` and `history.astro`**

Apply the transformation. `jobs/index` renders `<JobsList client:load />`; `history` renders its history component. `currentPath` `/media/jobs` and `/media/history`.

- [ ] **Step 2: Migrate `jobs/[id].astro`**

`currentPath="/media/jobs"`, breadcrumb back to My jobs. Preserve the shoot-detail content component.

- [ ] **Step 3: Migrate `tag/[session_id].astro`**

`currentPath="/media/tag"`, breadcrumb back to the Tagging queue. Wrap ONLY the success render in `MediaLayout`; leave the forbidden / load-error responses as they are.

- [ ] **Step 4: Verify every media page is on the portal chrome**

Run: `grep -rl "MediaLayout" src/pages/media | grep '.astro' | wc -l`
Expected: `5` (4 migrated + `queue.astro`).

Run: `grep -rL "MediaLayout" src/pages/media | grep -E '.astro$' | grep -v 'index.astro'`
Expected: no output except possibly nothing (the only `.astro` without `MediaLayout` is `index.astro`, the redirect — and the grep excludes it).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/media
git commit -m "feat(media-ia): migrate /media pages onto portal chrome"
```

---

## Task 9: Orphan-guard + full verification

**Files:**
- Modify: `tests/unit/portal/route-coverage.test.ts` (only if needed)

- [ ] **Step 1: Run the orphan-guard**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/portal/route-coverage.test.ts`
Expected: PASS. The new `/media/queue` is in `MEDIA_NAV` (covered); `/media` is a redirect stub (auto-skipped by `isRedirectStub`); `jobs/[id]`, `tag/[session_id]` are dynamic (auto-skipped). If the guard flags `/media/queue` or `/media`, add the missing piece: confirm `MEDIA_NAV` includes `/media/queue` (it does from Task 3) and that `index.astro` is a pure redirect under 800 chars. Do NOT add `/media/*` to `CONTEXTUAL_ROUTES` unless a page is genuinely contextual-only.

- [ ] **Step 2: Run the full unit suite**

Run: `npx vitest run --config vitest.config.ts --project unit`
Expected: all new media tests pass (get-tagging-queue, nav-media, media-nav-badges); no NEW failures. The only failing file should be the pre-existing DB-dependent `soccerone/venues.test.ts` (needs `DATABASE_URL`; fails in any DB-less worktree). Report exact counts.

- [ ] **Step 3: Final typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit (only if route-coverage was modified)**

```bash
git add tests/unit/portal/route-coverage.test.ts
git commit -m "test(media-ia): orphan-guard covers the media portal"
```

If no change was needed, skip the commit.

---

## Done criteria

- A signed-in `media_editor` lands on the Tagging queue (not a 403), sees sessions waiting in their service area, and drills into `tag/[session_id]`.
- A signed-in `media_staff` lands on My jobs; a dual-role user sees both plus History.
- The Tagging queue nav item shows the editor's pending count.
- All 4 `/media` pages render the portal sidebar instead of the customer top nav.
- `tsc` clean, unit suite green (modulo the pre-existing DB-dependent file), build succeeds, orphan-guard passes.
- Super-admin / venue / coach portals are byte-unchanged.
