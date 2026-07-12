# Command Center Polish (19-finding audit fix) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 19 findings from the 2026-07-11 venue command center audit (spec: `docs/superpowers/specs/2026-07-11-command-center-polish-findings.md`, committed in Task 1).

**Architecture:** All changes stay inside the existing command-center architecture: one aggregation endpoint + `useVenueToday` poll, React island components under `src/components/admin/venue/command/`, action endpoints under `/api/admin/*`. The two backend changes (held-booking visibility, real booked counts) extend existing endpoints additively. No schema changes.

**Tech Stack:** Astro 5 + React 19, Drizzle ORM, Vitest (tests/unit + tests/api), Playwright, sonner toasts, shared UI primitives (`ErrorBanner`, `EmptyState`, `LoadingSkeleton`).

## Global Constraints

- Work in a **git worktree** on branch `feat/command-center-polish` (create via superpowers:using-git-worktrees BEFORE the first edit). Never commit to `main`; another session is active in the main checkout. Subagents MUST be given the absolute worktree path in every dispatch.
- Dev server for tests: another session may own port 4321. Start yours with `E2E_TEST_ENDPOINTS=yes R2_MOCK=1 ./scripts/with-bws.sh npm run dev -- --port 4323` and run API tests with `TEST_BASE_URL=http://localhost:4323 ./scripts/with-bws.sh npx vitest run <file>`.
- Every admin endpoint added or modified MUST be tenant-scoped: `requireOrgAdminAccess` + location check via `getEffectiveLocationIds` (see `src/pages/api/admin/booking-search.ts` for the canonical pattern).
- Any `findFirst`/`.limit(1)` needs an explicit `orderBy` (shared CI DB has many rows).
- UI feedback: inline state errors → `<ErrorBanner>`; transient action errors → `toast.error(...)` (sonner); empty → `<EmptyState>`; loading → `<LoadingSkeleton>`.
- Timestamps UTC in DB, rendered in the payload `timezone`.
- Commit after every task (conventional commits). Run `npx tsc --noEmit` before each commit.
- The pay-pending booking status value is **`pending_claim`** (the `drop_in_booking_status` enum has no `pending_payment`); cancellation value is **`cancelled`** with `cancelledAt` timestamp (`src/lib/db/schema/drop-in.ts:37-59,147`).

---

### Task 1: Worktree + commit audit spec + poll resilience (findings 2, 12)

**Files:**
- Create: worktree at `/Volumes/MahadData/Aspire-Sports/web-app-worktrees/command-center-polish` (or the path using-git-worktrees chooses), branch `feat/command-center-polish`
- Create: `docs/superpowers/specs/2026-07-11-command-center-polish-findings.md` (copy from `/private/tmp/claude-501/-Volumes-MahadData-Aspire-Sports-web-app/e96de319-d1da-4ac7-b862-ab86e14d685e/scratchpad/command-center-audit-findings.md`)
- Create: `src/lib/venue/format-ago.ts`
- Test: `tests/unit/format-ago.test.ts`
- Modify: `src/lib/hooks/use-venue-today.ts`
- Modify: `src/components/admin/venue/command/VenueCommandCenter.tsx:202,241-258,275-287`

**Interfaces:**
- Produces: `formatAgo(seconds: number): string` — "0s", "45s", "3m", "2h". Used by Tasks 8's stamps too.
- Produces: `UseVenueTodayResult` gains `nowTick: number` (ms timestamp state that re-renders every 1s while mounted). `isStale` computed against `nowTick`, not render-time `Date.now()`.

- [ ] **Step 1: Worktree + spec commit.** Create the worktree/branch, copy the findings file in, `git add docs/superpowers/specs/2026-07-11-command-center-polish-findings.md docs/superpowers/plans/2026-07-11-command-center-polish.md && git commit -m "docs: command center polish audit findings + plan"`.

- [ ] **Step 2: Write the failing unit test** at `tests/unit/format-ago.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatAgo } from "@/lib/venue/format-ago";

describe("formatAgo", () => {
  it("renders seconds under a minute", () => {
    expect(formatAgo(0)).toBe("0s");
    expect(formatAgo(59)).toBe("59s");
  });
  it("renders whole minutes under an hour", () => {
    expect(formatAgo(60)).toBe("1m");
    expect(formatAgo(3599)).toBe("59m");
  });
  it("renders hours beyond that", () => {
    expect(formatAgo(3600)).toBe("1h");
    expect(formatAgo(7300)).toBe("2h");
  });
  it("clamps negatives to 0s", () => {
    expect(formatAgo(-5)).toBe("0s");
  });
});
```

- [ ] **Step 3: Run it** — `npx vitest run tests/unit/format-ago.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement** `src/lib/venue/format-ago.ts`:

```ts
/** Compact "time since" label for freshness stamps: 45s, 3m, 2h. */
export function formatAgo(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}
```

- [ ] **Step 5: Run test** → PASS.

- [ ] **Step 6: Fix the hook.** In `src/lib/hooks/use-venue-today.ts` replace the fetch closure (lines 37-56) and add the ticker. The three defects: no timeout (a hung fetch never settles), `inFlight` blocking forever, staleness computed at render time.

```ts
const FETCH_TIMEOUT_MS = 10_000;

// inside useVenueToday:
const [nowTick, setNowTick] = useState(() => Date.now());

fetchDataRef.current = async () => {
  if (inFlight.current) return;
  inFlight.current = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `/api/admin/venue/today?date=${encodeURIComponent(date)}&locationId=${encodeURIComponent(locationId ?? "")}`,
      { signal: controller.signal },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as VenueTodayPayload;
    setData(json);
    setLastUpdatedAt(Date.now());
    setError(null);
  } catch (e) {
    setError(e as Error);
  } finally {
    clearTimeout(timeout);
    inFlight.current = false;
    setLoading(false);
  }
};
```

Add a 1-second ticker effect (alongside the polling effect) and derive staleness from it:

```ts
useEffect(() => {
  const t = setInterval(() => setNowTick(Date.now()), 1_000);
  return () => clearInterval(t);
}, []);

const isStale =
  lastUpdatedAt !== null && nowTick - lastUpdatedAt > POLL_INTERVAL_MS * 2;
```

Export `nowTick` in the result type and return object.

- [ ] **Step 7: Honest badge + quiet errors.** In `VenueCommandCenter.tsx`:
  - Line 202: `const staleSecs = lastUpdatedAt !== null ? Math.floor((nowTick - lastUpdatedAt) / 1000) : null` (destructure `nowTick` from the hook; delete the local `secondsAgo` helper at lines 68-70).
  - Lines 241-258: when `isStale`, replace the green pulsing LIVE with a visually loud stale badge — amber dot (no pulse animation), text `STALE`, `· updated {formatAgo(staleSecs)} ago` in amber. Keep the green LIVE + `updated Ns ago` for the fresh case, using `formatAgo`.
  - Lines 282-287: DELETE the `{error && data && <ErrorBanner …>}` block entirely (design: quiet retry, the stale banner + badge carry the signal). Keep the hard-error-no-data branch at 214-220.

- [ ] **Step 8: Verify live.** With the dev server running, load `/admin/venue`, watch the stamp tick every second. In DevTools set network offline for 30s: badge flips to STALE, no red banner, data stays; back online: recovers within one poll. (The old code never recovered — this is the regression test for the `inFlight` lockup.)

- [ ] **Step 9: Commit** — `git commit -m "fix(venue): poll survives hung fetches; ticking honest freshness badge"`.

---

### Task 2: Needs-attention action routing (findings 3, 4, 9-noop)

**Files:**
- Create: `src/lib/venue/attention-action.ts`
- Test: `tests/unit/attention-action.test.ts`
- Modify: `src/components/admin/venue/command/VenueCommandCenter.tsx:182-197`
- Modify: `src/components/admin/venue/command/NeedsAttentionQueue.tsx` (hide action button when no target)

**Interfaces:**
- Produces: `attentionActionTarget(item: VenueAttentionItem): { type: "session"; sessionId: string } | { type: "href"; href: string } | null`

- [ ] **Step 1: Failing test** `tests/unit/attention-action.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { attentionActionTarget } from "@/lib/venue/attention-action";

const base = { id: "x", title: "t", subtitle: "s" } as const;

describe("attentionActionTarget", () => {
  it("prefers the session panel when a sessionId exists", () => {
    expect(attentionActionTarget({ ...base, kind: "ref", sessionId: "abc" }))
      .toEqual({ type: "session", sessionId: "abc" });
  });
  it("routes messages to the real inbox (/messages, NOT /admin/messages)", () => {
    expect(attentionActionTarget({ ...base, kind: "message" }))
      .toEqual({ type: "href", href: "/messages" });
  });
  it("routes requests to the venue-accessible refund queue", () => {
    expect(attentionActionTarget({ ...base, kind: "request" }))
      .toEqual({ type: "href", href: "/admin/refund-requests" });
  });
  it("returns null (no action) for waiver/photo/ref without a session", () => {
    expect(attentionActionTarget({ ...base, kind: "waiver" })).toBeNull();
    expect(attentionActionTarget({ ...base, kind: "photo" })).toBeNull();
    expect(attentionActionTarget({ ...base, kind: "ref" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `src/lib/venue/attention-action.ts`:

```ts
import type { VenueAttentionItem } from "./today-types";

export type AttentionTarget =
  | { type: "session"; sessionId: string }
  | { type: "href"; href: string }
  | null;

/**
 * Single source of truth for where a needs-attention action goes.
 * Both hrefs must be reachable by location_admin — /admin/registrations and
 * /admin/messages (which doesn't exist) caused the ISS audit findings 3+4.
 */
export function attentionActionTarget(item: VenueAttentionItem): AttentionTarget {
  if (item.sessionId) return { type: "session", sessionId: item.sessionId };
  if (item.kind === "message") return { type: "href", href: "/messages" };
  if (item.kind === "request") return { type: "href", href: "/admin/refund-requests" };
  return null;
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Wire it.** Replace `handleAttentionAction` (VenueCommandCenter.tsx:182-197):

```ts
const handleAttentionAction = useCallback((item: VenueAttentionItem) => {
  const target = attentionActionTarget(item)
  if (!target) return
  if (target.type === "session") {
    setOpenSessionId(target.sessionId)
  } else {
    window.location.href = target.href
  }
}, [])
```

In `NeedsAttentionQueue.tsx`, find where the per-item action button renders and only render it when `attentionActionTarget(item) !== null` (import the helper). This removes the enabled-but-dead buttons.

- [ ] **Step 6: Verify live** — with the seeded refund request / unread message present, click both actions; land on `/admin/refund-requests` and `/messages` (no 404, no unauthorized).

- [ ] **Step 7: Commit** — `git commit -m "fix(venue): needs-attention actions route to reachable pages; no dead buttons"`.

> **Finding 9 scope note:** the audit's second half of finding 9 (carry `personId` so waiver/photo actions pre-select the person) is deliberately NOT built: `build-today.ts` emits no waiver/photo attention items in v1 (lines 148 — "omitted, no per-session source yet"), so there is no item to target. When Phase-3 adds those items, add `personId?: string` to `VenueAttentionItem` and a `highlightTargetId` prop on `ActivityDetailPanel` in the same change. Record this in the PR body.

---

### Task 3: Attention/badge count agreement (finding 19)

**Files:**
- Read first: `src/lib/admin/nav-badges.ts` (see how `inbox` is scoped)
- Modify: `src/lib/venue/build-today.ts:112-142`
- Modify: `src/components/admin/venue/command/NeedsAttentionQueue.tsx` (the "All clear" empty state)
- Test: extend `tests/api/` coverage only if a scoping bug is found (see step 2)

- [ ] **Step 1: Diagnose.** Read `getNavBadges` and compare the two call sites: the sidebar badge (super-admin layout) vs `buildVenueToday(…, { locationIds, userId })`. Reproduce the audit observation: sidebar Inbox badge 11, needs-attention "All clear". Determine which of these is true: (a) the today call passes a narrower locationIds scope, so location-scoped unread is genuinely 0; (b) the `try/catch` at build-today.ts:118-142 is swallowing an error (add a temporary `console.error` in the catch to check).
- [ ] **Step 2: Fix accordingly.**
  - If (b): the catch must log — change `catch {}` to `catch (err) { console.error("[build-today] attention badges failed:", err); }` and fix the underlying error.
  - If (a): the counts are honest but the UI contradicts itself. Change the `NeedsAttentionQueue` empty state description from "Nothing needs attention right now." to "Nothing needs attention for this location. Org-wide items live in the sidebar Inbox." AND pass through location-scoped unread when it exists (keep current logic).
- [ ] **Step 3: Verify live** — needs-attention and the sidebar tell one coherent story for the seeded data.
- [ ] **Step 4: Commit** — `git commit -m "fix(venue): needs-attention and sidebar badges agree (or say why they differ)"`.

---

### Task 4: URL state + retarget day-board game links (findings 13, 6)

**Files:**
- Modify: `src/components/admin/venue/command/VenueCommandCenter.tsx:81-127`
- Modify: `src/pages/admin/venue/index.astro` (read `?date=`, `?view=`, `?session=`)
- Modify: `src/lib/admin/venue-day-data.ts:185` (game block link)
- Test: `tests/e2e/venue-command-center.spec.ts` (extend)

**Interfaces:**
- Produces: `/admin/venue?date=YYYY-MM-DD&view=day|week&session=<id>` is a shareable deep link; `VenueCommandCenter` gains optional prop `initialView?: "day" | "week"` and `initialSessionId?: string | null`.

- [ ] **Step 1: index.astro.** Where the island is rendered, parse and validate query params (date must match `/^\d{4}-\d{2}-\d{2}$/` else today; view must be `day|week` else `day`; session passed through as string|null) and pass `initialView` / `initialSessionId` props.

- [ ] **Step 2: Sync state → URL.** In `VenueCommandCenter`, initialize `view`, `date`, `openSessionId` from props. Add one effect:

```ts
useEffect(() => {
  const params = new URLSearchParams()
  params.set("date", date)
  if (view !== "day") params.set("view", view)
  if (openSessionId) params.set("session", openSessionId)
  const url = `${window.location.pathname}?${params.toString()}`
  window.history.replaceState(null, "", url)
}, [date, view, openSessionId])
```

`replaceState` (not push) — arrow-key date browsing must not spam history; Back returns to the previous PAGE with the last-visited state intact in its URL.

- [ ] **Step 3: Retarget game links.** In `src/lib/admin/venue-day-data.ts:185` change the game-block link from `/admin/games/${g.id}` to `` `/admin/venue?date=${dateStr}&session=${g.id}` `` (the date string is already in scope in that builder; check the surrounding function). league/tournament sessions open in the ActivityDetailPanel (the event endpoint's `game` kind already serves rosters).

- [ ] **Step 4: E2E.** Extend `tests/e2e/venue-command-center.spec.ts`: navigate to `/admin/venue?session=<seeded-session-id>` → the detail panel is open on load (`await waitForHydration(page)` first, per repo convention).

- [ ] **Step 5: Run the spec** — `PLAYWRIGHT_BASE_URL=http://localhost:4323 npm test -- venue-command-center` → PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(venue): URL-addressable command center state; day-board game links stay in venue scope"`.

---

### Task 5: Held bookings visible everywhere (finding 1) — backend

**Files:**
- Modify: `src/pages/api/admin/check-in/event.ts:73-110` (include pending_claim, expose status)
- Modify: `src/lib/admin/venue-day-data.ts:227` (real capacityCurrent for drop-in blocks)
- Modify: `src/pages/api/admin/booking-search.ts:120-133,162-184` (include pending_claim + status)
- Create: `src/pages/api/admin/venue/cancel-hold.ts`
- Test: `tests/api/venue-hold-visibility.test.ts`

**Interfaces:**
- Produces: event endpoint rows gain `status: "confirmed" | "pending_claim"`; booking-search results gain `status` with the same union; `POST /api/admin/venue/cancel-hold {bookingId}` → `{ ok: true }` | 404 | 409.

- [ ] **Step 1: Failing API test** `tests/api/venue-hold-visibility.test.ts` (sign in as admin via the existing test-helper pattern used in `tests/api/booking-search*.test.ts` — copy its auth setup; it creates a pending_claim booking via `POST /api/kiosk/{locationId}/walkin/start` against the seeded walk-in session, then):

```ts
it("includes pending_claim rows with status in the event roster", async () => {
  const res = await authedFetch(`/api/admin/check-in/event?kind=drop_in_session&id=${sessionId}`);
  const body = await res.json();
  const held = body.rows.find((r: any) => r.targetId === heldBookingId);
  expect(held).toBeDefined();
  expect(held.status).toBe("pending_claim");
});

it("cancel-hold cancels a pending booking and refuses a confirmed one", async () => {
  const ok = await authedFetch("/api/admin/venue/cancel-hold", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId: heldBookingId }),
  });
  expect(ok.status).toBe(200);
  const again = await authedFetch(`/api/admin/check-in/event?kind=drop_in_session&id=${sessionId}`);
  const rows = (await again.json()).rows;
  expect(rows.find((r: any) => r.targetId === heldBookingId)).toBeUndefined();
});

it("cancel-hold is tenant-scoped (cross-org admin gets 404)", async () => {
  const res = await orgBFetch("/api/admin/venue/cancel-hold", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId: heldBookingId2 }),
  });
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run** → FAIL (no `status` field; cancel-hold 404s as a route).

- [ ] **Step 3: event.ts** — in the drop-in branch replace the status filter and expose status:

```ts
import { and, eq, inArray } from "drizzle-orm"; // inArray already imported

// select adds:
status: dropInBookings.status,

// where clause becomes:
.where(
  and(
    eq(dropInBookings.sessionId, id),
    inArray(dropInBookings.status, ["confirmed", "pending_claim"]),
  ),
)

// row mapping adds (confirmed rows first so held ones group at the bottom):
status: r.status as "confirmed" | "pending_claim",
```

Sort: `rows.sort((a, b) => (a.status === b.status ? 0 : a.status === "confirmed" ? -1 : 1))` before returning.

- [ ] **Step 4: capacityCurrent.** In `src/lib/admin/venue-day-data.ts` around line 227 (the drop-in block builder with the `// TODO: count active bookings` comment): add one grouped count query for all drop-in session ids in the day window and map it in:

```ts
import { count, inArray } from "drizzle-orm";
// after collecting dropInSessionIds for the day:
const bookingCounts = dropInSessionIds.length
  ? await db
      .select({ sessionId: dropInBookings.sessionId, n: count() })
      .from(dropInBookings)
      .where(
        and(
          inArray(dropInBookings.sessionId, dropInSessionIds),
          inArray(dropInBookings.status, ["confirmed", "pending_claim"]),
        ),
      )
      .groupBy(dropInBookings.sessionId)
  : [];
const countBySession = new Map(bookingCounts.map((r) => [r.sessionId, r.n]));
// in the block: capacityCurrent: countBySession.get(s.id) ?? 0,
```

(Adapt names to the file's local variables; ONE grouped query, not per-session queries.)

- [ ] **Step 5: booking-search.ts** — same status widening: select `status: dropInBookings.status`, where becomes `inArray(dropInBookings.status, ["confirmed", "pending_claim"])`, result objects gain `status`. Field rentals stay confirmed-only but emit `status: "confirmed" as const`. Update the `Result` type accordingly.

- [ ] **Step 6: cancel-hold endpoint** `src/pages/api/admin/venue/cancel-hold.ts`:

```ts
/**
 * POST /api/admin/venue/cancel-hold { bookingId }
 * Cancels a pending_claim (pay-link hold) drop-in booking so the desk can
 * release a slot without waiting out the 2h hold. Tenant-scoped: the booking's
 * session venue must be in the caller's effective locations.
 */
import type { APIRoute } from "astro";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getEffectiveLocationIds } from "@/lib/admin/active-venue";

export const prerender = false;
const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const body = await context.request.json().catch(() => ({}));
  const bookingId = typeof body.bookingId === "string" ? body.bookingId : null;
  if (!bookingId) return json({ error: "bookingId required" }, 400);

  const db = getDb();
  const [row] = await db
    .select({
      id: dropInBookings.id,
      status: dropInBookings.status,
      locationId: venues.locationId,
      orgId: locations.organizationId,
    })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
    .innerJoin(venues, eq(venues.id, dropInSessions.venueId))
    .innerJoin(locations, eq(locations.id, venues.locationId))
    .where(eq(dropInBookings.id, bookingId))
    .limit(1);

  if (!row || row.orgId !== auth.organizationId) return json({ error: "Not found" }, 404);

  const effectiveIds = await getEffectiveLocationIds({
    userId: auth.user.id,
    userRoles: auth.roles,
    activeLocationId: context.locals.activeLocationId,
  });
  if (effectiveIds !== null && !effectiveIds.includes(row.locationId)) {
    return json({ error: "Not found" }, 404);
  }

  if (row.status !== "pending_claim") {
    return json({ error: "Only pending pay-link holds can be cancelled" }, 409);
  }

  await db
    .update(dropInBookings)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(and(eq(dropInBookings.id, bookingId), eq(dropInBookings.status, "pending_claim")));

  return json({ ok: true }, 200);
};
```

- [ ] **Step 7: Run the API test** → PASS. Also run the existing suites that touch these endpoints: `TEST_BASE_URL=http://localhost:4323 ./scripts/with-bws.sh npx vitest run tests/api/booking-search.test.ts tests/api/check-in 2>/dev/null` (adjust to the actual file names found by `ls tests/api`).

- [ ] **Step 8: Commit** — `git commit -m "feat(venue): pending pay-link holds visible in roster/search; real booked counts; cancel-hold endpoint"`.

---

### Task 6: Held bookings visible — UI (finding 1, continued)

**Files:**
- Modify: `src/components/admin/venue/command/ActivityDetailPanel.tsx` (RowData type, held-row rendering, resend/cancel actions)
- Modify: `src/components/admin/venue/command/FindBookingPanel.tsx:29-36,90-93` (status chip)
- Test: `tests/e2e/venue-command-center.spec.ts` (extend: walk-in → held row appears)

**Interfaces:**
- Consumes: `status` field from Task 5's endpoints; `POST /api/admin/venue/cancel-hold`; existing `POST /api/admin/check-in/send-link {kind, targetId, channel}`.

- [ ] **Step 1: RowData** gains `status: "confirmed" | "pending_claim"`.
- [ ] **Step 2: Held-row rendering.** In the roster row map: when `row.status === "pending_claim"`, render the row with 60% opacity avatar, an amber chip `⏳ awaiting payment` in place of the paid chip, and instead of the Check in button a two-button cluster:

```tsx
{row.status === "pending_claim" ? (
  <div className="flex items-center gap-1.5 flex-shrink-0">
    <span className="text-[10.5px] font-bold rounded px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
      ⏳ awaiting payment
    </span>
    <button type="button" onClick={() => resendLink(row)} disabled={rowBusy[row.targetId]}
      className="text-xs px-2 py-1 rounded border border-[#e4ddcf] bg-[#f6f1e7] text-[#4b463e] font-semibold disabled:opacity-40">
      Resend link
    </button>
    <button type="button" onClick={() => cancelHold(row)} disabled={rowBusy[row.targetId]}
      className="text-xs px-2 py-1 rounded border border-rose-200 bg-rose-50 text-rose-700 font-semibold disabled:opacity-40">
      Cancel hold
    </button>
  </div>
) : /* existing Here / Check in cluster */}
```

With handlers (uses sonner `toast` — import it):

```ts
const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

const resendLink = async (row: RowData) => {
  setRowBusy((p) => ({ ...p, [row.targetId]: true }));
  try {
    const res = await fetch("/api/admin/check-in/send-link", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "drop_in_booking", targetId: row.targetId, channel: "sms" }),
    });
    if (!res.ok) throw new Error(`Failed (${res.status})`);
    toast.success(`Pay link re-sent to ${row.name}`);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Could not resend link");
  } finally {
    setRowBusy((p) => ({ ...p, [row.targetId]: false }));
  }
};

const cancelHold = async (row: RowData) => {
  setRowBusy((p) => ({ ...p, [row.targetId]: true }));
  try {
    const res = await fetch("/api/admin/venue/cancel-hold", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: row.targetId }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error ?? `Failed (${res.status})`);
    }
    toast.success(`Hold released — slot is open again`);
    setRows((prev) => prev?.filter((r) => r.targetId !== row.targetId) ?? prev);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Could not cancel hold");
  } finally {
    setRowBusy((p) => ({ ...p, [row.targetId]: false }));
  }
};
```

Note: `resendLink`'s channel choice — if the booking user has no phone the SMS send fails server-side; surface that error via the toast (it already does). A channel picker is YAGNI here; the send-link endpoint's error message says what's missing.

- [ ] **Step 3: Panel counts.** `booked` currently comes from `session.booked` (now real, includes holds, per Task 5 Step 4). Update the empty-state condition: the "No confirmed bookings yet." branch must only render when `rows.length === 0` (held rows count as rows now) — and reword to "No bookings yet." (Task 10 converts it to `<EmptyState>`.)
- [ ] **Step 4: FindBookingPanel** — `BookingResult` gains `status`; in `ResultRow` add `{result.status === "pending_claim" && <StatusChip ok={false} okLabel="" badLabel="Awaiting payment" />}` beside the existing chips, and change the sheet subtitle (line 162) to "Search today's drop-in bookings and field rentals."
- [ ] **Step 5: E2E** — extend the venue spec: run the walk-in flow with email-only contact via UI (or seed a pending_claim booking via the kiosk API in test setup), open the session panel, assert the held row with "awaiting payment" is visible, click "Cancel hold", assert the row disappears.
- [ ] **Step 6: Run spec** → PASS. **Step 7: Commit** — `git commit -m "feat(venue): held walk-ins visible in roster + find-booking with resend/cancel actions"`.

---

### Task 7: Find-booking rows open the session panel (finding 5)

**Files:**
- Modify: `src/pages/api/admin/booking-search.ts` (add `sessionId` to drop-in results, `rentalId`→ rental has no session panel target: emit `sessionId: null`)
- Modify: `src/components/admin/venue/command/FindBookingPanel.tsx` (row onClick → callback prop)
- Modify: `src/components/admin/venue/command/VenueCommandCenter.tsx:404-407` (pass handler)

**Interfaces:**
- Produces: `FindBookingPanel` gains prop `onOpenSession: (sessionId: string) => void`; search results gain `sessionId: string | null`.

- [ ] **Step 1: Endpoint** — drop-in select adds `sessionId: dropInSessions.id`; result objects emit it; rentals emit `sessionId: null`. (The rental "session" in the today payload is the rental block whose id IS the rental id — check `build-today`/`venue-day-data`: rental blocks use the rental id as block id, so rentals CAN target the panel: emit `sessionId: row.rentalId` for rentals instead of null if that holds; verify by opening a rental block in the UI and checking the event fetch kind mapping `rental → field_rental` with `session.id` = rental id. If confirmed, both kinds get a working target.)
- [ ] **Step 2: Panel** — `ResultRow` becomes a `<button type="button">` with hover state, calling `onSelect(result)`; `FindBookingPanel` calls `props.onOpenSession(result.sessionId)` then `onClose()` when `sessionId` is non-null; rows with null `sessionId` render as today (non-interactive) with a `title="No session view for this booking"`.
- [ ] **Step 3: Wire** in VenueCommandCenter: `<FindBookingPanel onClose={…} onOpenSession={(id) => { setFindBookingOpen(false); setOpenSessionId(id); }} />`.
- [ ] **Step 4: Verify live** — search the seeded booking, click the row, roster panel opens with that person visible.
- [ ] **Step 5: Commit** — `git commit -m "feat(venue): find-booking results open the session roster"`.

---

### Task 8: Check-in feedback + double-tap guard (finding 7) and roster poll hygiene (finding 11)

**Files:**
- Create: `src/lib/hooks/use-visible-poll.ts`
- Modify: `src/components/admin/venue/command/ActivityDetailPanel.tsx:113-169,251-261`
- Modify: `src/components/admin/venue/command/PickupRollCall.tsx:130-145` (adopt the hook)

**Interfaces:**
- Produces: `useVisiblePoll(fn: () => void | Promise<void>, intervalMs: number): { lastRunAt: number | null }` — runs `fn` immediately and on the interval while `document.visibilityState === "visible"`, pauses on hide, re-runs on show. Both polling sub-panels use it.

- [ ] **Step 1: Hook** `src/lib/hooks/use-visible-poll.ts`:

```ts
import { useEffect, useRef, useState } from "react";

/** Interval poller that pauses while the tab is hidden and fires on re-show. */
export function useVisiblePoll(fn: () => void | Promise<void>, intervalMs: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const run = () => {
      void fnRef.current();
      setLastRunAt(Date.now());
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(run, intervalMs);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") { run(); start(); } else stop();
    };
    run();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [intervalMs]);

  return { lastRunAt };
}
```

- [ ] **Step 2: Panel adopts it.** In `ActivityDetailPanel`, replace the `useEffect` + `setInterval` roster fetch (lines 123-157) with `const { lastRunAt } = useVisiblePoll(load, 5_000)` where `load` is the same fetch, EXCEPT the success branch now clears the error: after `setRows(body.rows ?? [])` add `setError(null)` (the stuck-banner fix). Keep the `alive` guard via a ref that flips on unmount.
- [ ] **Step 3: Non-blocking error.** Change the error render (lines 252-256): when `rows !== null` (we have data), render a thin amber strip instead of ErrorBanner: `<div className="px-4 py-1.5 text-[11px] text-amber-800 bg-amber-50 border-b border-amber-200">Refresh failed — retrying…</div>`. Keep `<ErrorBanner>` only for the `rows === null` case.
- [ ] **Step 4: Freshness stamp.** In the panel header under the time row, add `{lastRunAt && <span className="text-[10.5px] text-[#8a8175]">updated {formatAgo(Math.floor((Date.now() - lastRunAt) / 1000))} ago</span>}` — driven by the parent's 1s `nowTick` if available; simplest: add a local 1s ticker state in the panel (3 lines, same pattern as Task 1).
- [ ] **Step 5: Check-in handler** (lines 160-169) becomes:

```ts
const checkIn = async (row: RowData) => {
  if (row.rowKind === "roster_entry" || rowBusy[row.targetId]) return;
  setRowBusy((p) => ({ ...p, [row.targetId]: true }));
  try {
    const res = await fetch("/api/admin/check-in/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: row.rowKind, targetId: row.targetId }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error ?? `Check-in failed (${res.status})`);
    }
    // Optimistic flip so the desk sees "Here" immediately, not at the next poll.
    setRows((prev) =>
      prev?.map((r) =>
        r.targetId === row.targetId ? { ...r, checkedInAt: new Date().toISOString() } : r,
      ) ?? prev,
    );
    onAction?.(session.id);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Check-in failed — try again");
  } finally {
    setRowBusy((p) => ({ ...p, [row.targetId]: false }));
  }
};
```

And the Check in button gets `disabled={row.rowKind === "roster_entry" || rowBusy[row.targetId]}` with label `{rowBusy[row.targetId] ? "…" : "Check in"}`. (`rowBusy` state was added in Task 6; if Task 6 isn't merged yet in your worktree order, declare it here — one declaration total.)
- [ ] **Step 6: PickupRollCall** — swap its `setInterval` (line ~140) for `useVisiblePoll`, keep its existing (correct) error-clearing.
- [ ] **Step 7: Verify live** — open a roster, DevTools offline: amber strip appears, rows stay; online: strip clears (error reset on success). Click Check in: instant "Here", button can't double-fire.
- [ ] **Step 8: Commit** — `git commit -m "fix(venue): roster polls pause when hidden, recover from blips; check-in gives feedback and can't double-fire"`.

---

### Task 9: Walk-in contact-aware sending + visible validation (findings 8, 18)

**Files:**
- Modify: `src/components/admin/venue/command/WalkInFlow.tsx:111-127,130-216,504-624` and the result screen `:263-331`

**Interfaces:**
- Consumes: nothing new. Pure component behavior change.

- [ ] **Step 1: Contact-derived availability.** Add derivations after the form state:

```ts
const contactPhone = form.mode === "child" ? form.parentPhone.trim() : form.phone.trim();
const contactEmail = form.mode === "child" ? form.parentEmail.trim() : form.email.trim();
const hasPhone = contactPhone.length > 0;
const hasEmail = contactEmail.length > 0;
```

Auto-correct selections when contact fields change (one effect):

```ts
useEffect(() => {
  if (!hasPhone && payMethod === "link_sms") setPayMethod(hasEmail ? "link_email" : "kiosk");
  if (!hasPhone && waiverMethod === "sms") setWaiverMethod("device");
}, [hasPhone, hasEmail]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 2: Disable unusable cards.** In the payment-method map, compute `const disabled = method === "link_sms" ? !hasPhone : method === "link_email" ? !hasEmail : false;` — render disabled cards with `opacity-50 cursor-not-allowed`, `disabled={disabled}`, and swap the subtitle to `"Add a mobile number above to text"` / `"Add an email above to send"` when disabled. Same for the waiver "Text link to phone" button (`!hasPhone` → disabled + hint).
- [ ] **Step 3: Visible validation.** In `handleSubmit`, before the fetch:

```ts
const missing: string[] = [];
if (!mappedForm.firstName) missing.push("first name");
if (!mappedForm.lastName) missing.push("last name");
if (!mappedForm.dob) missing.push("date of birth");
if (form.mode === "adult" && !hasEmail) missing.push("email");
if (form.mode === "child" && (!form.parentFirstName.trim() || !form.parentLastName.trim())) missing.push("parent name");
if (form.mode === "child" && !hasEmail) missing.push("parent email");
if (missing.length) {
  setSubmitError(`Missing: ${missing.join(", ")}.`);
  setBusy(false);
  return;
}
```

Replace the hand-rolled rose error box (lines 602-606) with `<ErrorBanner message={submitError} />` (import from `@/components/ui/error-banner`) — this also closes the WalkInFlow item of finding 16.
- [ ] **Step 4: Honest not-sent state.** In the result screen's `!result.sent` branch (lines 297-310), make failure unmissable: headline `Link NOT sent — share it manually`, wrap the paragraph in an amber panel (`bg-amber-50 border border-amber-200 rounded-lg px-3 py-2`), text: `We couldn't {result.method === "link_sms" ? "text" : "email"} the link{result.method === "link_sms" && !hasPhone ? " (no mobile number was entered)" : ""}. Copy it below and share it — the slot stays held for 2 hours.`
- [ ] **Step 5: Clipboard catch** (finding 16 item): the copy button's `.then(...)` gains `.catch(() => toast.error("Copy failed — long-press or select the link text to copy manually"))` (import sonner toast).
- [ ] **Step 6: Verify live** — email-only walk-in: SMS card disabled with hint, default = email link, submit with missing DOB shows the ErrorBanner listing it; a send failure shows the amber NOT-sent screen.
- [ ] **Step 7: Commit** — `git commit -m "fix(venue): walk-in flow reacts to available contact channels and never claims an unsent link"`.

> **Product note carried in the PR description, not code:** DOB stays required for adult walk-ins (matches the kiosk payload contract). Flagged in the audit as a friction question for the owner — needs a product decision before relaxing.

---

### Task 10: Conformance sweep — shared primitives + empty day (findings 16, 17)

**Files:**
- Modify: `src/components/admin/venue/command/FindBookingPanel.tsx:191-193`
- Modify: `src/components/admin/venue/command/CommandSearchBar.tsx:185-200`
- Modify: `src/components/admin/venue/command/NowStrip.tsx:72-77`
- Modify: `src/components/admin/venue/command/ActivityDetailPanel.tsx:364-368`
- Modify: `src/components/admin/check-in/SendLinkActions.tsx:14,79-85`
- Modify: `src/components/admin/check-in/AvatarUploader.tsx:47,89-93`
- Modify: `src/components/admin/venue/command/VenueCommandCenter.tsx:289-300`

- [ ] **Step 1: ErrorBanner swaps.** FindBookingPanel error (lines 191-193) and CommandSearchBar error (its rose-text render around lines 185-200) become `<div className="px-4 py-3"><ErrorBanner message={error} /></div>`. For CommandSearchBar additionally: when a search fails, ALSO fire `toast.error("Search failed — try again")` so the failure survives the dropdown closing (the audit's vanish-on-blur point).
- [ ] **Step 2: EmptyState swaps.** NowStrip's muted empty line (72-77) → `<EmptyState title="Nothing on right now" description="The next sessions will appear here as they approach." className="bg-[#fffdf8] border border-[#e4ddcf] rounded-2xl" />`. ActivityDetailPanel's "No confirmed bookings yet." div → `<EmptyState title="No bookings yet" description="Add a walk-in below to fill the first slot." />`.
- [ ] **Step 3: Empty DAY state** (finding 17). In `VenueCommandCenter`, when `data && data.sessions.length === 0`, replace the NowStrip slot with:

```tsx
<EmptyState
  title="Nothing scheduled today"
  description="Start a pickup game or add a walk-in to get the day moving."
  className="bg-[#fffdf8] border border-[#e4ddcf] rounded-2xl"
  action={
    <div className="flex gap-2 justify-center">
      <button type="button" onClick={handleStartPickup} className="px-3 py-1.5 rounded-lg bg-[#1c1a17] text-[#fffdf8] text-xs font-bold">Start pickup game</button>
      <button type="button" onClick={handleWalkIn} className="px-3 py-1.5 rounded-lg border border-[#e4ddcf] bg-[#f6f1e7] text-[#4b463e] text-xs font-bold">+ Walk-in</button>
    </div>
  }
/>
```

(Check `EmptyState`'s actual prop name for actions — if it has no action slot, render the buttons in a wrapper div directly under it.)
- [ ] **Step 4: SendLinkActions** — delete its hand-rolled `toast` state (line 14) and colored-text feedback (79-85); use sonner: success → `toast.success("Link sent")`, failure → `toast.error(message)`. Keep button-level busy state.
- [ ] **Step 5: AvatarUploader** — failure (89-93) → `toast.error("Photo upload failed — try again")` (keep or drop the inline text, toast is the requirement); success (line 47 area) → `toast.success("Photo saved")`.
- [ ] **Step 6: Verify live** — trigger each state (kill network for search; open empty day via `?date=` on a blank date; upload a photo). **Step 7: Commit** — `git commit -m "chore(venue): shared feedback primitives everywhere; inviting empty-day state"`.

---

### Task 11: Calendar honesty — off-hours chip + header density (findings 10, 15)

**Files:**
- Modify: `src/lib/venue/calendar-layout.ts:55-63`
- Test: `tests/unit/calendar-layout.test.ts` (extend — file exists; if not, create)
- Modify: `src/components/admin/venue/command/ScheduleCalendar.tsx` (chip render, min column width, hide-empty toggle)
- Modify: `src/components/admin/venue/command/ActivityBlock.tsx` (off-hours chip)

**Interfaces:**
- Produces: `clampRowsToWindow` returns `{ rowStart, rowEnd, clamped: boolean }` — `clamped: true` when the block's true time window fell (fully or partly) outside the grid.

- [ ] **Step 1: Failing test** (extend `tests/unit/calendar-layout.test.ts`):

```ts
it("flags clamped blocks so the UI can mark off-hours sessions", () => {
  expect(clampRowsToWindow(-10, -7, 26)).toMatchObject({ rowStart: 1, rowEnd: 2, clamped: true });
  expect(clampRowsToWindow(3, 5, 26)).toMatchObject({ rowStart: 3, rowEnd: 5, clamped: false });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — in `clampRowsToWindow` compute `const clamped = rowStart < 1 || rowEnd > totalRows + 1;` and return it. Update all call sites (ScheduleCalendar / WeekGrid — grep `clampRowsToWindow(`).
- [ ] **Step 4: Chip.** Pass `clamped` + the session's real start time into `ActivityBlock`; when clamped, render inside the block: `<span className="text-[9.5px] font-bold bg-stone-800/80 text-white rounded px-1">off-hours · {fmtTime(session.startsAt, timezone)}</span>`. (ActivityBlock already receives the session and timezone — verify prop names when editing.)
- [ ] **Step 5: Header density.** In `ScheduleCalendar`'s day-grid template: give field columns a floor — `grid-template-columns: 64px repeat(${cols}, minmax(110px, 1fr))` — inside the existing horizontally scrollable container (add `overflow-x-auto` on the grid wrapper if not present), and make each header cell `truncate` with `title={space.name}`.
- [ ] **Step 6: Hide-empty toggle.** In `ScheduleCalendar` derive `const activeSpaceIds = new Set(payload.sessions.map((s) => s.spaceId))`; add state `const [hideEmpty, setHideEmpty] = useState(true)`; `const visibleSpaces = hideEmpty ? payload.spaces.filter((sp) => activeSpaceIds.has(sp.id)) : payload.spaces` — use `visibleSpaces` for columns. Render a small toggle next to the Day/Week switch: `Empty fields: shown/hidden`. Default ON (hidden) — the audit's 15-ghost-column screen is the norm-breaker, and a day where a field has nothing scheduled offers no click affordance anyway; the toggle reveals them for hold-planning.
- [ ] **Step 7: Run unit tests + verify live** (seeded day: ghost columns gone, toggle restores them; the 2 AM session shows the off-hours chip). **Step 8: Commit** — `git commit -m "feat(venue): off-hours chips, legible field headers, hide-empty-fields toggle"`.

---

### Task 12: Retire the parallel check-in / walk-up paths (finding 14)

**Files:**
- Modify: `src/lib/admin/nav-venue-manager.ts:26-29`
- Modify: `src/pages/admin/venue/check-in.astro` and `src/pages/admin/venue/walk-up.astro` (redirect)
- Modify: any `tests/e2e/*` spec that visits those routes (grep first!)

- [ ] **Step 1: Grep the blast radius.** `rg -l 'venue/check-in|venue/walk-up' src tests` — every hit must be dispositioned. Remember: full Playwright runs post-merge only (`test-full`), so a missed spec breaks main silently.
- [ ] **Step 2: Nav.** Remove the two entries (lines 27-28) from `VENUE_MANAGER_NAV`, leaving Command center as the single front-desk entry.
- [ ] **Step 3: Redirects.** Replace each page's frontmatter render with `return Astro.redirect("/admin/venue", 308)` (permanent; bookmarks keep working). Do NOT delete the page files — the redirect IS the page.
- [ ] **Step 4: Update specs.** Any e2e spec exercising the old pages: retarget the check-in flows to the command-center panel equivalents (or, where the spec exists purely to test the old page, assert the redirect: `expect(page.url()).toContain("/admin/venue")`).
- [ ] **Step 5: Run affected specs** — `PLAYWRIGHT_BASE_URL=http://localhost:4323 npm test -- <each matched spec>` → PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(venue): command center is the single front-desk path; old pages 308-redirect"`.

---

### Task 13: Full verification + PR

- [ ] **Step 1:** `npx tsc --noEmit` → 0 errors.
- [ ] **Step 2:** `./scripts/with-bws.sh npm run build` → green (catches prerender/SSR mistakes).
- [ ] **Step 3:** Full API suite against the worktree dev server: `CRON_SECRET=<same-as-server> TEST_BASE_URL=http://localhost:4323 ./scripts/with-bws.sh npm run test:api` (background Bash, 15+ min; do NOT run inside a subagent).
- [ ] **Step 4:** Targeted Playwright: `PLAYWRIGHT_BASE_URL=http://localhost:4323 npm test -- venue-command-center pickup-mode venue-day person-360` → PASS.
- [ ] **Step 5:** Live smoke of the five headline fixes (poll recovery, held-booking row, attention routing, find-booking click-through, walk-in email-only flow) — use the audit's reproduction steps from the spec doc.
- [ ] **Step 6:** Push, open PR titled `fix(venue): command center polish — 19 audit findings`, body listing findings → tasks mapping; note the DOB product question and the aggregation-endpoint perf follow-up as explicitly out of scope. Wait for CI green.
