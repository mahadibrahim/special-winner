# Venue Front-Desk Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/admin/venue` into one responsive command center — a live Now/Next strip, a visual time×field calendar (day/week, click→roster), a walk-in→payment flow, and a needs-attention queue with inline actions — fed by a single aggregation endpoint on a shared poll.

**Architecture:** A new `GET /api/admin/venue/today` endpoint composes the existing day-view aggregation (`getVenueDayEvents`) plus needs-attention items, location-scoped. A `useVenueToday` hook (modeled on `useVenueDayData`'s visibility-aware poll) feeds the whole page so counts and calendar always agree. Pure derivation modules (now/next, needs-attention grouping, calendar time→row layout, walk-in payload) are unit-tested; components are covered by a Playwright e2e (the repo has no component-unit-test setup). The walk-in flow reuses the shipped kiosk walk-in + payment-link + self-serve send-link endpoints.

**Tech Stack:** Astro 5 + React 19, Drizzle (PostgreSQL), Zod, Tailwind, Vitest (unit + api), Playwright (e2e).

## Global Constraints

- **Audience/scope:** venue admin + front-desk staff only. NOT coach/team ops. Responsive (desktop/tablet/phone). Mobile stacks **Now → Needs-attention → Calendar**.
- **Reuse, don't rebuild:** compose existing data via `getVenueDayEvents` (`src/lib/check-in/day-view.ts`); reuse check-in (`/api/admin/check-in/{check-in,upload-photo,send-link}`), kiosk walk-in (`/api/kiosk/[locationSlug]/walkin/{start,payment}`), and self-serve flows. No new payment hardware; no card-present entry. No schedule CRUD (holds only). No SSE/WebSockets — one shared poll (~5–10s).
- **Tenant scoping:** every read is location-scoped via `getEffectiveLocationIds` (`src/lib/admin/active-venue.ts:72`) — never return cross-location data.
- **Payment methods (walk-in):** send pay link (email **or** SMS) and hand-off to kiosk self-pay. Waiver link also sendable by email/SMS.
- **Status chips (roster):** waiver · photo · paid · checked-in (exactly these four).
- **UI primitives:** `ErrorBanner`, `LoadingSkeleton`, `EmptyState` from `@/components/ui/*`. Money is integer cents; times `HH:MM`; dates `YYYY-MM-DD`.
- **TDD** for all pure logic. Components have NO unit tests (repo convention — Testing Library not installed); they are covered by the Task 9 Playwright e2e. `npm run test:unit` has one pre-existing unrelated failure (`soccerone/venues.test.ts`, needs DATABASE_URL) — ignore it.

---

### Task 1: `useVenueToday` shared-poll hook

**Files:**
- Create: `src/lib/hooks/use-venue-today.ts`
- Reference (read, do not modify): `src/lib/hooks/use-venue-day-data.ts`

**Interfaces:**
- Produces: `useVenueToday({ date, locationId }: { date: string; locationId: string | null }): { data: VenueTodayPayload | null; isLoading: boolean; error: string | null; lastUpdatedAt: number | null; isStale: boolean; refetch: () => void }`. `VenueTodayPayload` is defined in Task 2. Polls `GET /api/admin/venue/today?date=&locationId=` every 7s, paused while the tab is hidden, refetching on focus.

- [ ] **Step 1: Read the reference.** Open `src/lib/hooks/use-venue-day-data.ts`. Copy its structure: `POLL_INTERVAL_MS`, visibility-pause via `visibilitychange`, `lastUpdatedAt`, `isStale`, `refetch`. You are making a near-identical hook that hits the new endpoint and returns `VenueTodayPayload`.

- [ ] **Step 2: Write the hook.** Create `src/lib/hooks/use-venue-today.ts`, mirroring `use-venue-day-data.ts` but: `const POLL_INTERVAL_MS = 7_000;`, fetch URL `/api/admin/venue/today?date=${date}&locationId=${locationId ?? ""}`, and type the data as `VenueTodayPayload` (import the type from `@/lib/venue/today-types`, created in Task 2). Keep the same loading/error/stale/refetch shape.

- [ ] **Step 3: Type-check.**

Run: `npx tsc --noEmit`
Expected: exit 0. (If `@/lib/venue/today-types` doesn't exist yet, do Task 2 first — these two tasks may be reordered; the hook only needs the type.)

- [ ] **Step 4: Commit.**

```bash
git add src/lib/hooks/use-venue-today.ts
git commit -m "feat(venue): shared visibility-aware poll hook for the command center"
```

---

### Task 2: Payload types + pure now/next derivation

**Files:**
- Create: `src/lib/venue/today-types.ts`
- Create: `src/lib/venue/derive-now-next.ts`
- Test: `tests/unit/venue-now-next.test.ts`

**Interfaces:**
- Produces:
  - `today-types.ts`: `interface VenueTodaySession { id: string; kind: "league"|"tournament"|"dropin"|"class"|"camp"|"rental"|"hold"; spaceId: string; spaceName: string; title: string; startsAt: string; endsAt: string; capacity: number|null; booked: number; checkedIn: number; waiversOut: number; photosMissing: number; refAssigned: boolean|null }`; `interface VenueAttentionItem { kind: "waiver"|"photo"|"ref"|"request"|"message"; id: string; title: string; subtitle: string; sessionId?: string }`; `interface VenueTodayPayload { date: string; locationId: string; locationName: string; spaces: { id: string; name: string }[]; sessions: VenueTodaySession[]; attention: VenueAttentionItem[] }`.
  - `derive-now-next.ts`: `function deriveNowNext(sessions: VenueTodaySession[], nowMs: number): { now: VenueTodaySession[]; next: VenueTodaySession[] }` — `now` = sessions whose [startsAt,endsAt) contains nowMs; `next` = up to 4 upcoming sessions starting after now, sorted ascending.

- [ ] **Step 1: Write the types.** Create `src/lib/venue/today-types.ts` with the three interfaces above (and the `VenueTodayPayload`). No logic.

- [ ] **Step 2: Write the failing test.** Create `tests/unit/venue-now-next.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveNowNext } from "@/lib/venue/derive-now-next";
import type { VenueTodaySession } from "@/lib/venue/today-types";

const s = (id: string, startsAt: string, endsAt: string): VenueTodaySession => ({
  id, kind: "dropin", spaceId: "sp", spaceName: "Field 1", title: id,
  startsAt, endsAt, capacity: 20, booked: 9, checkedIn: 2, waiversOut: 3, photosMissing: 0, refAssigned: null,
});

describe("deriveNowNext", () => {
  const now = Date.parse("2026-06-19T11:00:00Z");
  const sessions = [
    s("past", "2026-06-19T09:00:00Z", "2026-06-19T10:00:00Z"),
    s("live", "2026-06-19T10:30:00Z", "2026-06-19T12:00:00Z"),
    s("soon", "2026-06-19T13:00:00Z", "2026-06-19T15:00:00Z"),
    s("later", "2026-06-19T17:00:00Z", "2026-06-19T20:00:00Z"),
  ];
  it("puts in-progress sessions in 'now'", () => {
    expect(deriveNowNext(sessions, now).now.map((x) => x.id)).toEqual(["live"]);
  });
  it("puts upcoming sessions in 'next', ascending, capped at 4", () => {
    expect(deriveNowNext(sessions, now).next.map((x) => x.id)).toEqual(["soon", "later"]);
  });
});
```

- [ ] **Step 3: Run it, watch it fail.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/venue-now-next.test.ts`
Expected: FAIL — module `derive-now-next` missing.

- [ ] **Step 4: Implement.** Create `src/lib/venue/derive-now-next.ts`:

```ts
import type { VenueTodaySession } from "./today-types";

export function deriveNowNext(sessions: VenueTodaySession[], nowMs: number) {
  const now: VenueTodaySession[] = [];
  const upcoming: VenueTodaySession[] = [];
  for (const s of sessions) {
    const start = Date.parse(s.startsAt);
    const end = Date.parse(s.endsAt);
    if (start <= nowMs && nowMs < end) now.push(s);
    else if (start > nowMs) upcoming.push(s);
  }
  upcoming.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return { now, next: upcoming.slice(0, 4) };
}
```

- [ ] **Step 5: Run the test, watch it pass.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/venue-now-next.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit.**

```bash
git add src/lib/venue/today-types.ts src/lib/venue/derive-now-next.ts tests/unit/venue-now-next.test.ts
git commit -m "feat(venue): command-center payload types + now/next derivation"
```

---

### Task 3: Needs-attention grouping (pure)

**Files:**
- Create: `src/lib/venue/group-attention.ts`
- Test: `tests/unit/venue-group-attention.test.ts`

**Interfaces:**
- Consumes: `VenueAttentionItem` (Task 2).
- Produces: `function groupAttention(items: VenueAttentionItem[]): { key: "waiver"|"photo"|"ref"|"request"|"message"; label: string; count: number; items: VenueAttentionItem[] }[]` — groups by kind in a fixed display order (waiver, photo, ref, request, message), each with a human label and count; omits empty groups; `total(items)` helper returns the overall count.

- [ ] **Step 1: Write the failing test.** Create `tests/unit/venue-group-attention.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupAttention, attentionTotal } from "@/lib/venue/group-attention";
import type { VenueAttentionItem } from "@/lib/venue/today-types";

const it_ = (kind: VenueAttentionItem["kind"], id: string): VenueAttentionItem =>
  ({ kind, id, title: id, subtitle: "" });

describe("groupAttention", () => {
  const items = [it_("photo", "p1"), it_("waiver", "w1"), it_("waiver", "w2"), it_("request", "r1")];
  it("groups by kind in display order, omitting empty groups", () => {
    const g = groupAttention(items);
    expect(g.map((x) => [x.key, x.count])).toEqual([["waiver", 2], ["photo", 1], ["request", 1]]);
  });
  it("labels groups", () => {
    expect(groupAttention(items)[0].label).toBe("Waivers outstanding");
  });
  it("totals all items", () => {
    expect(attentionTotal(items)).toBe(4);
  });
});
```

- [ ] **Step 2: Run it, watch it fail.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/venue-group-attention.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement.** Create `src/lib/venue/group-attention.ts`:

```ts
import type { VenueAttentionItem } from "./today-types";

const ORDER: VenueAttentionItem["kind"][] = ["waiver", "photo", "ref", "request", "message"];
const LABELS: Record<VenueAttentionItem["kind"], string> = {
  waiver: "Waivers outstanding",
  photo: "Missing check-in photos",
  ref: "Unassigned referees",
  request: "Requests",
  message: "Messages",
};

export function groupAttention(items: VenueAttentionItem[]) {
  return ORDER.map((key) => {
    const groupItems = items.filter((i) => i.kind === key);
    return { key, label: LABELS[key], count: groupItems.length, items: groupItems };
  }).filter((g) => g.count > 0);
}

export function attentionTotal(items: VenueAttentionItem[]): number {
  return items.length;
}
```

- [ ] **Step 4: Run the test, watch it pass.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/venue-group-attention.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/venue/group-attention.ts tests/unit/venue-group-attention.test.ts
git commit -m "feat(venue): needs-attention grouping"
```

---

### Task 4: Calendar time→row layout helper (pure)

**Files:**
- Create: `src/lib/venue/calendar-layout.ts`
- Test: `tests/unit/venue-calendar-layout.test.ts`

**Interfaces:**
- Produces: `function timeToRow(iso: string, dayStartHour: number): number` — half-hour row index (1-based) for a timestamp relative to `dayStartHour` (e.g. 8). `function blockRows(startsAt: string, endsAt: string, dayStartHour: number): { rowStart: number; rowEnd: number }` for CSS-grid spans. `function columnsForSpaces(spaces: { id: string; name: string }[]): { id: string; name: string; index: number }[]` — assigns 1-based column indices (col 1 is the time gutter, so spaces start at 2).

- [ ] **Step 1: Write the failing test.** Create `tests/unit/venue-calendar-layout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { timeToRow, blockRows, columnsForSpaces } from "@/lib/venue/calendar-layout";

describe("calendar-layout", () => {
  it("maps 9:00 to row 3 with an 8am day start (half-hour rows, 1-based)", () => {
    expect(timeToRow("2026-06-19T09:00:00Z", 8)).toBe(3);
    expect(timeToRow("2026-06-19T08:00:00Z", 8)).toBe(1);
    expect(timeToRow("2026-06-19T10:30:00Z", 8)).toBe(6);
  });
  it("computes a block's row span", () => {
    expect(blockRows("2026-06-19T09:00:00Z", "2026-06-19T10:00:00Z", 8)).toEqual({ rowStart: 3, rowEnd: 5 });
  });
  it("assigns space columns starting at 2 (col 1 is the gutter)", () => {
    expect(columnsForSpaces([{ id: "a", name: "Field 1" }, { id: "b", name: "Court A" }]))
      .toEqual([{ id: "a", name: "Field 1", index: 2 }, { id: "b", name: "Court A", index: 3 }]);
  });
});
```

> Note: tests use UTC times for determinism. In the component, render times in the location timezone — but the row math is offset-relative and tz-agnostic as written. The implementer should compute rows from the same zoned hour used for display (pass hours derived via the location tz). Keep the helper pure (takes ISO + dayStartHour); the component supplies the correct hour.

- [ ] **Step 2: Run it, watch it fail.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/venue-calendar-layout.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement.** Create `src/lib/venue/calendar-layout.ts`:

```ts
export function timeToRow(iso: string, dayStartHour: number): number {
  const d = new Date(iso);
  const minutes = (d.getUTCHours() - dayStartHour) * 60 + d.getUTCMinutes();
  return Math.floor(minutes / 30) + 1;
}

export function blockRows(startsAt: string, endsAt: string, dayStartHour: number) {
  return { rowStart: timeToRow(startsAt, dayStartHour), rowEnd: timeToRow(endsAt, dayStartHour) };
}

export function columnsForSpaces(spaces: { id: string; name: string }[]) {
  return spaces.map((s, i) => ({ ...s, index: i + 2 }));
}
```

> Implementer: the component will likely use a tz-aware hour (e.g. via `Intl.DateTimeFormat` in the location tz) rather than `getUTCHours`. If so, change `timeToRow` to accept a pre-computed minutes-from-day-start value, and update the test to match. Either way the helper stays pure and tested.

- [ ] **Step 4: Run the test, watch it pass.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/venue-calendar-layout.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/venue/calendar-layout.ts tests/unit/venue-calendar-layout.test.ts
git commit -m "feat(venue): calendar time→row layout helpers"
```

---

### Task 5: Aggregation endpoint `GET /api/admin/venue/today`

**Files:**
- Create: `src/pages/api/admin/venue/today.ts`
- Test: `tests/api/venue-today.test.ts`
- Reference (read): `src/pages/api/admin/check-in/day.ts`, `src/lib/check-in/day-view.ts` (`getVenueDayEvents`), `src/lib/admin/active-venue.ts` (`getEffectiveLocationIds`)

**Interfaces:**
- Consumes: `VenueTodayPayload`/`VenueTodaySession`/`VenueAttentionItem` (Task 2).
- Produces: `GET /api/admin/venue/today?date=YYYY-MM-DD&locationId=<uuid|empty>` → `VenueTodayPayload` (200), admin-gated and location-scoped. When `locationId` is empty, use the caller's effective location(s) (first/active). Returns 400 on bad date, 401 unauth.

- [ ] **Step 1: Read the references.** Read `check-in/day.ts` for the auth/date-validation pattern and how it calls `getVenueDayEvents`; read `getVenueDayEvents`'s return shape in `src/lib/check-in/day-view.ts`; read `getEffectiveLocationIds` (`active-venue.ts:72`) for the scoping call. The endpoint maps `getVenueDayEvents` output → `VenueTodaySession[]`, derives `attention` items (waivers out, photos missing, unassigned refs from the same data; pending refund-requests + unread inbox counts via their existing queries), and returns the payload.

- [ ] **Step 2: Write the failing API test.** Create `tests/api/venue-today.test.ts`, modeled on the auth/helper pattern in existing `tests/api/` admin tests (use the real `getAdminCookie`/`apiFetch`/`expectJson` helpers from `tests/api/setup/test-helpers.ts`, as `tests/api/admin/programs.test.ts` does):

```ts
import { describe, it, expect } from "vitest";
import { apiFetch, getAdminCookie, expectJson } from "./setup/test-helpers";

describe("GET /api/admin/venue/today", () => {
  it("returns a location-scoped day payload for an admin", async () => {
    const cookie = await getAdminCookie();
    const res = await apiFetch(`/api/admin/venue/today?date=2026-06-19&locationId=`, { headers: { cookie } });
    const body = await expectJson(res, 200);
    expect(Array.isArray(body.spaces)).toBe(true);
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(Array.isArray(body.attention)).toBe(true);
    expect(body.date).toBe("2026-06-19");
  });

  it("401s without auth", async () => {
    const res = await apiFetch(`/api/admin/venue/today?date=2026-06-19&locationId=`);
    expect(res.status).toBe(401);
  });
});
```

> Implementer note: confirm the exact admin-cookie helper name in `tests/api/setup/test-helpers.ts` and copy the pattern other admin api tests use verbatim.

- [ ] **Step 3: Run it, watch it fail.** (Dev server up.)

Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run --config vitest.config.ts --project api tests/api/venue-today.test.ts`
Expected: FAIL — 404 (route missing).

- [ ] **Step 4: Implement the endpoint.** Create `src/pages/api/admin/venue/today.ts` following the `check-in/day.ts` skeleton (`prerender = false`, `requireAdminAccess`, date regex validation, `json` helper). Resolve the location via `getEffectiveLocationIds` when `locationId` is empty (use the first/active one). Call `getVenueDayEvents` for that location+date, map each event to `VenueTodaySession` (fill `booked`/`checkedIn`/`waiversOut`/`photosMissing` from the event's roster, `refAssigned` from the game's ref field where applicable, `kind`/`spaceId`/`spaceName`/`title`/`startsAt`/`endsAt`/`capacity`). Build `attention`: one `waiver` item per outstanding-waiver person, one `photo` item per checked-in-without-photo person, one `ref` item per unassigned-ref game, plus `request` items from the pending refund-requests query and `message` items from the unread inbox count (reuse the queries behind `/api/admin/nav-badges`). Return `VenueTodayPayload`.

> Keep the heavy shaping in a helper `buildVenueToday(...)` in `src/lib/venue/build-today.ts` if the route grows past ~120 lines, so the route stays thin. Tenant scoping (location filter) is mandatory on every query.

- [ ] **Step 5: Run the test, watch it pass.**

Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run --config vitest.config.ts --project api tests/api/venue-today.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Type-check + commit.**

```bash
npx tsc --noEmit   # expect 0
git add src/pages/api/admin/venue/today.ts tests/api/venue-today.test.ts src/lib/venue/build-today.ts
git commit -m "feat(venue): today aggregation endpoint for the command center"
```

---

### Task 6: NowStrip + ScheduleCalendar components

**Files:**
- Create: `src/components/admin/venue/command/NowStrip.tsx`
- Create: `src/components/admin/venue/command/ScheduleCalendar.tsx`
- Create: `src/components/admin/venue/command/ActivityBlock.tsx`
- Reference (read): `src/components/admin/venue/venue-day-page.tsx`, `activity-block.tsx`, `week-strip.tsx`, `date-navigator.tsx`; the approved mockups in `.superpowers/brainstorm/74462-1781982519/content/calendar-day-grid.html` and `command-center-layout.html`.

**Interfaces:**
- Consumes: `VenueTodayPayload`/`VenueTodaySession` (Task 2), `deriveNowNext` (Task 2), `timeToRow`/`blockRows`/`columnsForSpaces` (Task 4).
- Produces:
  - `<NowStrip sessions onOpenActivity />` — horizontally scrollable now/next cards.
  - `<ScheduleCalendar payload view onView onPrev onNext onOpenActivity />` where `view: "day"|"week"` — the time×field grid (day) with a Day/Week toggle and prev/next; `onOpenActivity(sessionId)` opens the roster panel (Task 7).
  - `<ActivityBlock session onClick />` — a colored/iconed block with a hover popover.
- NO component unit tests — covered by Task 9 e2e.

- [ ] **Step 1: Build the components.** Use the approved mockups as the visual source of truth and reuse the type/color/icon conventions from the existing `activity-block.tsx` (it already maps the 7 activity kinds to icons/colors — mirror them). The day grid is `display:grid` with a `62px` gutter column + one column per space; blocks positioned via `blockRows()` and `columnsForSpaces()`. Open slots are rendered for gaps. Week view renders 7 day-columns with condensed blocks (reuse `week-strip.tsx` density patterns). `NowStrip` maps `deriveNowNext(payload.sessions, Date.now())` to cards.

> Match the existing editorial styling (cream/ink tokens) used across `src/components/admin/venue/*`. Keep each component focused; if `ScheduleCalendar` exceeds ~250 lines, extract the week view into `WeekGrid.tsx`.

- [ ] **Step 2: Type-check.**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit.**

```bash
git add src/components/admin/venue/command/NowStrip.tsx src/components/admin/venue/command/ScheduleCalendar.tsx src/components/admin/venue/command/ActivityBlock.tsx
git commit -m "feat(venue): now strip + visual time×field calendar"
```

---

### Task 7: ActivityDetailPanel (roster) + WalkInFlow

**Files:**
- Create: `src/components/admin/venue/command/ActivityDetailPanel.tsx`
- Create: `src/components/admin/venue/command/WalkInFlow.tsx`
- Create: `src/lib/venue/walkin-payload.ts`
- Test: `tests/unit/venue-walkin-payload.test.ts`
- Reference (read): the check-in drawer (`src/components/admin/check-in/Drawer.tsx`, `SendLinkActions.tsx`), kiosk walk-in endpoints, `/api/admin/check-in/{check-in,upload-photo,send-link}`.

**Interfaces:**
- Consumes: a session's roster (from the payload / a per-session fetch), the layout/types from Tasks 2/4.
- Produces:
  - `walkin-payload.ts`: `function walkInToPayload(form, ctx): object` — maps the walk-in form (adult/child, name, email, phone, sessionId) + delivery choice into the kiosk walk-in `start` body, with `paymentMethod: "link"|"kiosk"` and `linkChannel: "email"|"sms"` when `method === "link"`. Pure + unit-tested.
  - `<ActivityDetailPanel session onClose onAction />` — roster rows with the four status chips and a Check-in button (POST `/api/admin/check-in/check-in`), photo Capture (reuse upload-photo), Send link (reuse send-link, email/SMS/QR); open slots → opens `WalkInFlow`.
  - `<WalkInFlow session onDone />` — who → waiver (sign on device / send link email|SMS) → payment (send pay link email|SMS, or kiosk self-pay hand-off) using `walkInToPayload` + the kiosk `start`/`payment` endpoints.
- Components: NO unit tests (e2e covers them).

- [ ] **Step 1: Write the failing test for the mapper.** Create `tests/unit/venue-walkin-payload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { walkInToPayload } from "@/lib/venue/walkin-payload";

const form = { mode: "adult" as const, firstName: "Alex", lastName: "Rivera", email: "a@x.com", phone: "6145550142", sessionId: "sess-1" };

describe("walkInToPayload", () => {
  it("maps an adult walk-in paying by email link", () => {
    const p = walkInToPayload(form, { method: "link", linkChannel: "email" }) as any;
    expect(p.sessionId).toBe("sess-1");
    expect(p.contact.firstName).toBe("Alex");
    expect(p.paymentMethod).toBe("link");
    expect(p.linkChannel).toBe("email");
  });
  it("maps a kiosk self-pay hand-off", () => {
    const p = walkInToPayload(form, { method: "kiosk" }) as any;
    expect(p.paymentMethod).toBe("kiosk");
    expect(p.linkChannel).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it, watch it fail.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/venue-walkin-payload.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the mapper.** Create `src/lib/venue/walkin-payload.ts`:

```ts
export interface WalkInForm {
  mode: "adult" | "child";
  firstName: string; lastName: string; email: string; phone: string;
  sessionId: string;
}
export type WalkInPayment =
  | { method: "link"; linkChannel: "email" | "sms" }
  | { method: "kiosk" };

export function walkInToPayload(form: WalkInForm, pay: WalkInPayment) {
  return {
    sessionId: form.sessionId,
    contact: { firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone, isAdult: form.mode === "adult" },
    paymentMethod: pay.method,
    ...(pay.method === "link" ? { linkChannel: pay.linkChannel } : {}),
  };
}
```

> Implementer: reconcile the `contact` shape with the actual kiosk `walkin/start` body (read `src/pages/api/kiosk/[locationSlug]/walkin/start.ts`); adjust field names to match what that endpoint accepts. Keep the mapper pure and the test in sync.

- [ ] **Step 4: Run the test, watch it pass.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/venue-walkin-payload.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Build the components.** `ActivityDetailPanel` renders roster rows (avatar, name, the four chips, Check-in/Here) and open-slot rows; reuse `SendLinkActions` for the send-link control and the check-in/upload-photo POST patterns from the existing `Drawer.tsx`. `WalkInFlow` is the 3-step flow; on submit it POSTs the kiosk `walkin/start` with `walkInToPayload(...)`, then for `link` triggers the pay-link send and for `kiosk` shows the hand-off instruction/QR. On success, call `onDone()` so the page refetches.

- [ ] **Step 6: Type-check + commit.**

```bash
npx tsc --noEmit   # expect 0
git add src/components/admin/venue/command/ActivityDetailPanel.tsx src/components/admin/venue/command/WalkInFlow.tsx src/lib/venue/walkin-payload.ts tests/unit/venue-walkin-payload.test.ts
git commit -m "feat(venue): activity roster panel + walk-in payment flow"
```

---

### Task 8: NeedsAttentionQueue + VenueCommandCenter page

**Files:**
- Create: `src/components/admin/venue/command/NeedsAttentionQueue.tsx`
- Create: `src/components/admin/venue/command/VenueCommandCenter.tsx`
- Modify: `src/pages/admin/venue/index.astro` (stop redirecting; render the command center)
- Reference (read): current `src/pages/admin/venue/index.astro`, `src/pages/admin/venue/day/[date].astro`.

**Interfaces:**
- Consumes: `useVenueToday` (Task 1), `groupAttention`/`attentionTotal` (Task 3), all Task 6/7 components.
- Produces: `<VenueCommandCenter locationId date />` — the page shell: fetches via `useVenueToday`, renders `NowStrip`, `ScheduleCalendar`, and `NeedsAttentionQueue`; manages the open-activity panel state; responsive grid (desktop: calendar left / attention right with Now strip on top; mobile: Now → attention → calendar). `<NeedsAttentionQueue groups onAction />` renders grouped items with inline action buttons.

- [ ] **Step 1: Build `NeedsAttentionQueue`.** Render `groupAttention(payload.attention)`; each group has a header with count badge and rows with the right inline action per kind (waiver→Send link, photo→Capture, ref→Assign, request→Review, message→Open), collapsing long groups behind "See all N".

- [ ] **Step 2: Build `VenueCommandCenter`.** Compose the three regions with the responsive layout from the approved `command-center-layout.html` mockup (desktop `grid-template-columns: 1.7fr 1fr` with the Now strip spanning the top; `@media(max-width:820px)` stacks to one column in the order Now → attention → calendar). Use `useHydrationBeacon()` (top-level island, for e2e). Use `LoadingSkeleton`/`ErrorBanner`/`EmptyState`. Keep showing last-good data with the "updated Ns ago" stamp when `isStale`.

- [ ] **Step 3: Wire the page.** Edit `src/pages/admin/venue/index.astro`: remove the redirect; resolve the active location + today's date server-side (as `day/[date].astro` does) and render `<VenueCommandCenter client:load locationId={...} date={...} />` inside `BaseLayout` via `AdminLayout`. Keep `day/[date].astro` reachable (the calendar's deep link) but the command center is the new `/admin/venue` home.

- [ ] **Step 4: Type-check + build.**

Run: `npx tsc --noEmit && ./scripts/with-bws.sh npm run build`
Expected: tsc 0; build "Complete!" (the `Astro.request.headers` warnings are known noise).

- [ ] **Step 5: Commit.**

```bash
git add src/components/admin/venue/command/NeedsAttentionQueue.tsx src/components/admin/venue/command/VenueCommandCenter.tsx src/pages/admin/venue/index.astro
git commit -m "feat(venue): needs-attention queue + command-center page at /admin/venue"
```

---

### Task 9: E2E — command center + walk-in

**Files:**
- Create: `tests/e2e/venue-command-center.spec.ts`
- Reference (read): `tests/utils/test-helpers.ts` (`signInAsAdmin`/`waitForHydration`), the built components for selectors.

**Interfaces:**
- Consumes: the full command center.

- [ ] **Step 1: Write the spec.** Create `tests/e2e/venue-command-center.spec.ts`. Align selectors to the BUILT components (read them). Flow: sign in as admin (`signInAsAdmin`), `goto('/admin/venue', { waitUntil: 'domcontentloaded' })`, `waitForHydration`, assert the Now strip / Schedule / "Needs attention" regions render; click an activity block → assert the roster panel opens with status chips and an open slot; open the walk-in flow from an open slot, fill the contact step, choose "Send pay link" + email, and assert it advances (full payment completion needs Stripe + seed and is left to manual/CI verification). Use role/label selectors.

```ts
import { test, expect } from "@playwright/test";
import { signInAsAdmin, waitForHydration } from "../utils/test-helpers";

test("venue command center renders and opens an activity roster", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/admin/venue", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await expect(page.getByText(/needs attention/i)).toBeVisible();
  // click the first activity block, assert the roster panel opens
  const block = page.locator('[data-activity-block]').first();
  if (await block.count()) {
    await block.click();
    await expect(page.getByText(/open slot|add walk-in/i)).toBeVisible();
  }
});
```

> Implementer: add a `data-activity-block` attribute to `ActivityBlock` (Task 6) so the e2e has a stable selector. Full execution runs in CI/test-full (needs a server + seeded venue data); verify locally with `npx playwright test tests/e2e/venue-command-center.spec.ts --list` (exit 0).

- [ ] **Step 2: Verify discovery + commit.**

```bash
npx playwright test tests/e2e/venue-command-center.spec.ts --list   # exit 0
git add tests/e2e/venue-command-center.spec.ts
git commit -m "test(e2e): venue command center renders + activity roster"
```

---

## Self-Review

**Spec coverage:**
- Command center at `/admin/venue` (3 regions) → Tasks 6, 7, 8. ✓
- Visual time×field calendar, day/week, open slots, click→roster → Tasks 4 (layout), 6 (calendar), 7 (roster). ✓
- Roster with waiver/photo/paid/checked-in + open slots → Task 7. ✓
- Walk-in→payment (pay link email/SMS, kiosk self-pay) → Task 7 (mapper + flow), reusing kiosk endpoints. ✓
- Needs-attention queue (waivers/photos/refs/requests+messages) inline actions → Tasks 3 (grouping), 8 (queue). ✓
- Now/Next live strip → Tasks 2 (derive), 6 (NowStrip). ✓
- Single aggregation endpoint + shared poll → Tasks 5 (endpoint), 1 (hook). ✓
- Tenant scoping via getEffectiveLocationIds → Task 5. ✓
- Responsive stack order → Task 8. ✓
- Reuse existing check-in/kiosk/send-link endpoints → Tasks 5, 7. ✓
- Non-goals (no coach/team, no card hardware, no schedule CRUD, no SSE) → respected; not built.

**Placeholder scan:** Implementer notes point at existing files to read (kiosk start body shape, admin-cookie helper name, tz hour for row math) — these are reconciliation instructions against real code, not missing logic. No "TODO/handle edge cases" placeholders. Component tasks intentionally have no unit tests (repo convention) and are covered by the Task 9 e2e — stated explicitly.

**Type consistency:** `VenueTodayPayload`/`VenueTodaySession`/`VenueAttentionItem` (Task 2) are used consistently by Tasks 1, 3, 5, 6, 7, 8. `deriveNowNext`, `groupAttention`/`attentionTotal`, `timeToRow`/`blockRows`/`columnsForSpaces`, `walkInToPayload` signatures match across their producer and consumer tasks.
