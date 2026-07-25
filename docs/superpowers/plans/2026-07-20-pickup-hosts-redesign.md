# Manage Pickup and Hosts Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin pickup/drop-in sessions surface as a week-schedule view with fill and host visibility, wire the existing delete endpoint into the UI, add a manual host-add path, and collect lightweight host ratings through the existing post-session NPS ask.

**Architecture:** UI-heavy: the sessions list becomes a week navigator + day-grouped cards over the existing list API (which gains two additive host fields). Host creation adds one POST endpoint over the existing `host_profiles` table. Host ratings add one table + optional fields on the existing NPS score submit — no new feedback kind, no new dispatch.

**Tech Stack:** Astro 5 + React 19, Drizzle ORM, Vitest API tests against the running dev server, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-07-20-pickup-hosts-redesign-design.md`

## Global Constraints

- Branch: `feat/pickup-hosts-redesign` (worktree `/Volumes/MahadData/Aspire-Sports/web-app-worktrees/pickup-hosts-redesign`), stacked on `feat/rename-pickup-nav` (PR #431). ALL file paths below are relative to that worktree. Subagents MUST be given absolute worktree paths (repo memory: subagents drift to the main checkout otherwise).
- Unhosted is a NORMAL state: never amber/warning styling on "No host" — muted `text-ink-muted` only.
- Editorial cream design system (`docs/design-system.md`): `bg-cream-2`, `border-border`, `text-ink` / `text-ink-muted`; accent tokens are never text colours. Chips follow the catalog chip idiom used in `src/components/admin/seasons-list.tsx`.
- Every admin endpoint change keeps org-scoping via `requireOrgAdminAccess` and location-scoping via the existing helpers (`getEffectiveLocationIds`, `venueLocationCondition`, `callerCanActOnVenue`).
- Schema changes: `npm run db:generate` after editing schema, review + commit the migration. Additive only. Never `db:push` against remote DBs.
- API tests need the dev server running (`npm run dev:bws` with `E2E_TEST_ENDPOINTS=yes`); run as `TEST_BASE_URL=http://localhost:4321 npm run test:api -- <file>`.
- All timestamps UTC in the DB; the week view displays in the org timezone (`organizations.timezone`, default `America/New_York`).
- Copy rule: the surface is called "Manage Pickup and Hosts" (renamed in PR #431). No eyebrow/kicker text.

---

### Task 1: Sessions list API returns host fields

**Files:**
- Modify: `src/pages/api/admin/dropin/sessions/index.ts` (GET, ~lines 52–95)
- Test: `tests/api/dropin/admin-sessions-host-fields.test.ts` (create)

**Interfaces:**
- Produces: `GET /api/admin/dropin/sessions` response rows gain `hostUserId: string | null` and `hostName: string | null` (first + last name joined, or null). Consumed by Task 3's `SessionRow` type and Task 5's popover.

- [ ] **Step 1: Write the failing test.** Follow the auth/fixture conventions in `tests/api/host/admin-assign.test.ts` (sign-in helper, seeded admin `admin@test.aspiresports.com` / `TestAdmin123!`, seeded session fixtures from `seed-e2e-tests.ts`). New file:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminSignIn, BASE } from "../utils"; // match the import used by tests/api/host/admin-assign.test.ts — copy its exact helper import path

describe("GET /api/admin/dropin/sessions host fields", () => {
  let cookie: string;
  beforeAll(async () => {
    cookie = await adminSignIn();
  });

  it("every row carries hostUserId and hostName keys (null when unhosted)", async () => {
    const res = await fetch(`${BASE}/api/admin/dropin/sessions`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const { sessions } = await res.json();
    expect(Array.isArray(sessions)).toBe(true);
    for (const s of sessions) {
      expect(s).toHaveProperty("hostUserId");
      expect(s).toHaveProperty("hostName");
    }
  });
});
```

(If `tests/api/dropin/admin-sessions-repeat.test.ts` uses different sign-in helper names, mirror those — read it first, don't invent.)

- [ ] **Step 2: Run it — expect FAIL** (`hostUserId` key missing):
`TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/dropin/admin-sessions-host-fields.test.ts`

- [ ] **Step 3: Implement.** In the GET select, add a `users` join and two fields. Import `users` from `@/lib/db/schema/users`:

```ts
import { users } from "@/lib/db/schema/users";
// in .select({ ... }) add:
      hostUserId: dropInSessions.hostUserId,
      hostName: sql<string | null>`CASE WHEN ${users.id} IS NULL THEN NULL
        ELSE TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})) END`,
// after .leftJoin(venues, ...):
    .leftJoin(users, eq(users.id, dropInSessions.hostUserId))
```

- [ ] **Step 4: Re-run the test — expect PASS.**

- [ ] **Step 5: Commit:** `git add -A && git commit -m "feat(admin): expose host on drop-in sessions list API"`

---

### Task 2: Week-bucketing helper

**Files:**
- Create: `src/lib/dropin/week-schedule.ts`
- Test: `tests/unit/dropin/week-schedule.test.ts` (create)

**Interfaces:**
- Produces:
  - `weekBoundsFor(anchor: Date, timezone: string): { from: Date; to: Date }` — the Monday 00:00 → next Monday 00:00 window containing `anchor`, computed in `timezone`, returned as UTC instants.
  - `groupByDay(sessions: { startsAt: string }[], timezone: string): { dayKey: string; label: string; sessions: T[] }[]` — 7 entries (Mon→Sun) for the week of the sessions' window, `dayKey` = `YYYY-MM-DD` in org tz, `label` like `"SAT Jul 25"`, empty `sessions` arrays preserved.
  - `addWeeks(d: Date, n: number): Date`
- Consumed by Task 3.

- [ ] **Step 1: Write failing tests:**

```ts
import { describe, it, expect } from "vitest";
import { weekBoundsFor, groupByDay, addWeeks } from "@/lib/dropin/week-schedule";

const TZ = "America/New_York";

describe("weekBoundsFor", () => {
  it("returns Mon 00:00 ET → next Mon 00:00 ET for a mid-week anchor", () => {
    // Wed 2026-07-22 15:00 UTC
    const { from, to } = weekBoundsFor(new Date("2026-07-22T15:00:00Z"), TZ);
    expect(from.toISOString()).toBe("2026-07-20T04:00:00.000Z"); // Mon 00:00 EDT
    expect(to.toISOString()).toBe("2026-07-27T04:00:00.000Z");
  });
  it("handles a UTC instant that is still the previous day in ET", () => {
    // 2026-07-20T02:00Z is Sun 22:00 ET → week starting Mon Jul 13 ET
    const { from } = weekBoundsFor(new Date("2026-07-20T02:00:00Z"), TZ);
    expect(from.toISOString()).toBe("2026-07-13T04:00:00.000Z");
  });
});

describe("groupByDay", () => {
  it("buckets sessions into org-tz days and keeps empty days", () => {
    const sessions = [
      { startsAt: "2026-07-25T14:00:00.000Z" }, // Sat 10:00 ET
      { startsAt: "2026-07-26T01:00:00.000Z" }, // Sat 21:00 ET (NOT Sunday)
    ];
    const days = groupByDay(sessions, TZ);
    expect(days).toHaveLength(7);
    const sat = days.find((d) => d.dayKey === "2026-07-25")!;
    expect(sat.sessions).toHaveLength(2);
    expect(sat.label).toBe("SAT Jul 25");
    expect(days.find((d) => d.dayKey === "2026-07-26")!.sessions).toHaveLength(0);
  });
});

describe("addWeeks", () => {
  it("moves exactly 7 days", () => {
    expect(addWeeks(new Date("2026-07-22T15:00:00Z"), -1).toISOString()).toBe(
      "2026-07-15T15:00:00.000Z",
    );
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module not found): `npm run test:api -- --project unit tests/unit/dropin/week-schedule.test.ts` — check how other unit tests are invoked first (`npx vitest run tests/unit/dropin/week-schedule.test.ts` if there's no project split).

- [ ] **Step 3: Implement** using `Intl.DateTimeFormat` (no new deps):

```ts
/** Week bucketing for the admin pickup schedule. All returns are UTC instants;
 *  "day" boundaries are computed in the org's IANA timezone. */

function tzParts(d: Date, timeZone: string): { y: number; m: number; day: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "numeric", day: "numeric", weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    y: Number(parts.year), m: Number(parts.month), day: Number(parts.day),
    weekday: weekdays.indexOf(parts.weekday), // 0 = Monday
  };
}

/** UTC instant of midnight (00:00) in `timeZone` on the given civil date. */
function zonedMidnightUtc(y: number, m: number, day: number, timeZone: string): Date {
  // Guess noon UTC then correct by the formatted offset — DST-safe without a tz lib.
  let guess = new Date(Date.UTC(y, m - 1, day, 12));
  for (let i = 0; i < 3; i++) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone, hour: "numeric", minute: "numeric", hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric",
    });
    const p = Object.fromEntries(fmt.formatToParts(guess).map((x) => [x.type, x.value]));
    const deltaMin =
      (Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) -
        Date.UTC(y, m - 1, day, 0, 0)) / 60000;
    if (deltaMin === 0) return guess;
    guess = new Date(guess.getTime() - deltaMin * 60000);
  }
  return guess;
}

export function addWeeks(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 7 * 24 * 60 * 60 * 1000);
}

export function weekBoundsFor(anchor: Date, timezone: string): { from: Date; to: Date } {
  const { y, m, day, weekday } = tzParts(anchor, timezone);
  const anchorMidnight = zonedMidnightUtc(y, m, day, timezone);
  const from = new Date(anchorMidnight.getTime() - weekday * 24 * 60 * 60 * 1000);
  // Recompute from's civil date to survive DST inside the week:
  const f = tzParts(from, timezone);
  const start = zonedMidnightUtc(f.y, f.m, f.day, timezone);
  const e = tzParts(new Date(start.getTime() + 7.5 * 24 * 60 * 60 * 1000), timezone);
  const to = zonedMidnightUtc(e.y, e.m, e.day, timezone);
  return { from: start, to };
}

const DAY_LABEL = new Map<number, string>(); // built per call below

export function groupByDay<T extends { startsAt: string }>(
  sessions: T[], timezone: string,
): { dayKey: string; label: string; sessions: T[] }[] {
  const anchor = sessions.length ? new Date(sessions[0].startsAt) : new Date();
  const { from } = weekBoundsFor(anchor, timezone);
  const days: { dayKey: string; label: string; sessions: T[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(from.getTime() + (i * 24 + 12) * 60 * 60 * 1000); // midday, DST-safe
    const p = tzParts(d, timezone);
    const dayKey = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, weekday: "short", month: "short", day: "numeric",
    }).format(d).replace(/^(\w+)/, (w) => w.toUpperCase()).replace(",", "");
    days.push({ dayKey, label, sessions: [] });
  }
  const byKey = new Map(days.map((d) => [d.dayKey, d]));
  for (const s of sessions) {
    const p = tzParts(new Date(s.startsAt), timezone);
    const key = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    byKey.get(key)?.sessions.push(s);
  }
  return days;
}
```

Adjust the `label` format until the test's `"SAT Jul 25"` expectation passes (uppercase 3-letter weekday, no comma). Delete the unused `DAY_LABEL` constant if you don't need it.

- [ ] **Step 4: Run tests — expect PASS.** Also run `npx tsc --noEmit`.

- [ ] **Step 5: Commit:** `git commit -am "feat(dropin): tz-safe week bucketing helper for the admin schedule"`

---

### Task 3: Week-schedule sessions view

**Files:**
- Modify: `src/components/admin/dropin/SessionsList.tsx` (full rewrite of the list body; keep the fetch/error/hydration scaffolding and the `useHydrationBeacon()` call)
- Modify: `src/pages/admin/dropins.astro` (pass org timezone down)
- Modify: `src/components/admin/dropin/SessionForm.tsx` (accept `?date=` prefill)
- Modify: `src/pages/admin/dropin/sessions/new.astro` (no change needed if the form reads `window.location.search`; otherwise pass through)

**Interfaces:**
- Consumes: Task 1's `hostUserId`/`hostName` fields; Task 2's `weekBoundsFor`, `groupByDay`, `addWeeks`.
- Produces: `SessionsList` renders week navigator + day groups; each card links to `/admin/dropin/sessions/{id}`; empty day `+ add` links to `/admin/dropin/sessions/new?date=YYYY-MM-DD`. The card exposes an overflow-menu mount point (a `DropdownMenu`) that Tasks 4–5 extend. Card test ids: `data-testid="session-card"`, day headers `data-testid="day-group"`.

- [ ] **Step 1: Get the org timezone to the client.** In `dropins.astro` frontmatter read `Astro.locals.organization?.timezone ?? "America/New_York"` and pass `<SessionsList client:load timezone={tz} />`. Update the component's props: `export function SessionsList({ timezone }: { timezone: string })`.

- [ ] **Step 2: Rewrite the list rendering.** State: `weekAnchor` (Date, default now). Derive `{from, to} = weekBoundsFor(weekAnchor, timezone)`; fetch `/api/admin/dropin/sessions?from=${from.toISOString()}&to=${to.toISOString()}` in a `useEffect` keyed on the anchor. Render:

```tsx
<div className="flex items-center justify-between flex-wrap gap-3">
  <div className="flex items-center gap-2">
    <Button variant="outline" size="sm" onClick={() => setWeekAnchor((d) => addWeeks(d, -1))}>◀</Button>
    <div className="text-sm font-medium text-ink min-w-40 text-center">{weekRangeLabel}</div>
    <Button variant="outline" size="sm" onClick={() => setWeekAnchor((d) => addWeeks(d, 1))}>▶</Button>
    <Button variant="ghost" size="sm" onClick={() => setWeekAnchor(new Date())}>Today</Button>
  </div>
  <Button asChild><a href="/admin/dropin/sessions/new">+ New session</a></Button>
</div>
```

`weekRangeLabel` formats `from`–`to-1day` in the org tz (e.g. "Jul 20 – 26"). Then for each `groupByDay(rows, timezone)` entry:

```tsx
<section data-testid="day-group" key={day.dayKey}>
  <h3 className="text-xs uppercase tracking-wider text-ink-muted mt-6 mb-2">{day.label}</h3>
  {day.sessions.length === 0 ? (
    <a href={`/admin/dropin/sessions/new?date=${day.dayKey}`}
       className="block rounded-lg border border-dashed border-border px-4 py-3 text-sm text-ink-muted hover:text-ink">
      No sessions · + add
    </a>
  ) : day.sessions.map((s) => <SessionCard key={s.id} s={s} onChanged={reload} />)}
</section>
```

`SessionCard` (same file, not exported): a `bg-cream-2 border border-border rounded-xl p-4` block, muted (`opacity-60`) when `s.status === "cancelled"`, containing: linked title `{sportOrClassLabel}{formatLabel && ` · ${formatLabel}`}`, time range + venue name line, `kind` chip + status chip (only when not `scheduled`), the fill bar, host line, and the overflow menu. Fill bar:

```tsx
const pct = s.capacity > 0 ? Math.min(100, Math.round((s.confirmedCount / s.capacity) * 100)) : 0;
<div className="mt-2 flex items-center gap-2 text-sm">
  <div className="h-2 w-28 rounded-full bg-cream overflow-hidden border border-border">
    <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
  </div>
  <span className="text-ink">{s.confirmedCount}/{s.capacity}</span>
  {s.waitlistCount > 0 && <span className="text-ink-muted">· {s.waitlistCount} waitlist</span>}
</div>
```

Host line (neutral, never warning):

```tsx
<div className="mt-1 text-sm">
  {s.hostName
    ? <span className="text-ink">Host: {s.hostName}</span>
    : <span className="text-ink-muted">No host</span>}
  {/* Task 5 adds the Assign control here */}
</div>
```

Overflow menu (shadcn `DropdownMenu`, trigger `⋯`): items View (`href` detail), Edit (`/admin/dropin/sessions/${s.id}/edit`). Tasks 4–5 add Cancel/Delete/Assign.

Keep the venue-scope empty state from PR #431: when ALL seven days are empty, render the existing `EmptyState` (same copy) beneath the navigator instead of seven empty day rows.

- [ ] **Step 3: `?date=` prefill in SessionForm.** In `SessionForm.tsx`, when creating (no session id) read `new URLSearchParams(window.location.search).get("date")` inside the initial-state setup; if present and matches `/^\d{4}-\d{2}-\d{2}$/`, set `startsAt` to `${date}T18:00` and `endsAt` to `${date}T19:00` (the form's `datetime-local` string shape — match the existing `localIso` usage).

- [ ] **Step 4: Verify by hand.** `npm run dev:bws`, open `http://localhost:4321/admin/dropins` as `admin@test.aspiresports.com` / `TestAdmin123!`. Check: navigator moves weeks; seeded sessions appear under correct days; empty day links prefill the date; cancelled sessions render muted. Run `npx tsc --noEmit`.

- [ ] **Step 5: Commit:** `git commit -am "feat(admin): week-schedule view for pickup/drop-in sessions"`

---

### Task 4: Delete in the UI + stale comment fix

**Files:**
- Modify: `src/components/admin/dropin/SessionsList.tsx` (overflow menu)
- Modify: `src/components/admin/dropin/AdminSessionDetail.tsx` (header actions, ~line 335)
- Modify: `src/pages/api/admin/dropin/sessions/[id].ts` (lines 2–7 header comment ONLY)

**Interfaces:**
- Consumes: existing `DELETE /api/admin/dropin/sessions/:id` (409 with `{error}` when live bookings exist), the detail page's existing `confirmDialog` pattern (see `cancelSession` in the same file), Task 3's overflow menu.

- [ ] **Step 1: Fix the stale comment.** In `[id].ts` replace the header lines claiming `DELETE → soft-delete (status = cancelled)` with: `DELETE /api/admin/dropin/sessions/:id → hard delete; 409s when any non-cancelled booking exists (use POST /cancel for a booked session). Removes the field-time ledger block.`

- [ ] **Step 2: Detail page Delete.** Next to the existing Cancel button add:

```tsx
<Button variant="outline" disabled={busy} onClick={deleteSession} className="text-rose-700">
  Delete
</Button>
```

with (mirroring `cancelSession`'s confirm-dialog usage in the same file):

```tsx
const deleteSession = async () => {
  const ok = await confirm({
    title: "Delete session?",
    description:
      "Permanently removes this session from the schedule and the field-time ledger. If people are booked, use Cancel instead — it refunds and notifies them.",
    confirmLabel: "Delete session",
  });
  if (!ok) return;
  setBusy(true);
  try {
    const res = await fetch(`/api/admin/dropin/sessions/${sessionId}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Delete failed"); return; }
    toast.success("Session deleted");
    window.location.href = "/admin/dropins";
  } finally { setBusy(false); }
};
```

(Match the file's actual confirm-dialog helper name — read how `cancelSession` builds its dialog and reuse that exact mechanism.)

- [ ] **Step 3: Card overflow Delete + Cancel.** In `SessionsList`'s overflow menu add Cancel (POST `/api/admin/dropin/sessions/${s.id}/cancel`, confirm first, copy the warning text from `AdminSessionDetail.cancelSession`) and Delete (as above but `onChanged()` instead of redirect). Both wrapped in the same confirm-dialog mechanism — if the list has none, use the shared confirm dialog component the detail page uses.

- [ ] **Step 4: Verify.** Dev server: delete an empty seeded session (row disappears); attempt delete on a session with a confirmed booking (`tests` seed has one — or book via the public flow) → toast shows the 409 message. `npx tsc --noEmit`.

- [ ] **Step 5: Commit:** `git commit -am "feat(admin): delete sessions from list and detail; fix stale DELETE doc"`

---

### Task 5: Assign-host popover + zero-host empty states

**Files:**
- Modify: `src/components/admin/dropin/SessionsList.tsx`
- Modify: `src/components/admin/dropin/AdminSessionDetail.tsx` (empty-picker copy only)

**Interfaces:**
- Consumes: `GET /api/admin/hosts` (`{hosts: [{userId, firstName, lastName, status, ...}]}`, filter `status === "active"` client-side); `PUT /api/admin/dropin/sessions/:id/host` body `{hostUserId, replace: true}`.

- [ ] **Step 1:** In `SessionsList`, fetch hosts once alongside sessions (`/api/admin/hosts`, fail-soft). On each card's host line add an `Assign`/`Change` ghost button opening a shadcn `Popover` with either:
  - active hosts as a simple button list — click → `PUT .../host` `{hostUserId, replace: true}` → toast + `onChanged()`; or
  - when zero active hosts: `No active hosts yet — approve applicants or add one in the <a href="/admin/dropins?tab=hosts">Hosts tab</a>.`

- [ ] **Step 2:** In `AdminSessionDetail`, when `hostOptions.length === 0` and `changingHost`, render the same sentence instead of the empty `<select>`.

- [ ] **Step 3: Verify.** With staging-seeded hosts (seed has host fixtures — see `tests/api/host/*`): assign from a card, change, remove from detail. Then with a fresh org state (or by temporarily filtering to a status that matches nothing) confirm the zero-host sentence renders. `npx tsc --noEmit`.

- [ ] **Step 4: Commit:** `git commit -am "feat(admin): inline host assignment from session cards + honest zero-host state"`

---

### Task 6: Hosts API — manual create + unhosted coverage count

**Files:**
- Modify: `src/pages/api/admin/hosts/index.ts` (add POST; extend GET response)
- Test: `tests/api/host/admin-create-host.test.ts` (create)

**Interfaces:**
- Consumes: `hostProfiles` schema (`host_profiles_user_org_unique` unique index on user+org), `requireOrgAdminAccess`, sessions location-scope helpers from `sessions/index.ts`.
- Produces:
  - `POST /api/admin/hosts` body `{userId: string}` → 201 `{host}` (status `active`, `approvedByUserId` = caller); 409 `{error}` when a profile exists for user+org; 404 when the user id doesn't exist or isn't in this org's orbit (user exists check only — org membership is not required for hosts, mirror what the approve flow does: read `src/pages/api/admin/applications` host-approval code and copy its user validation).
  - `GET /api/admin/hosts` response gains top-level `unhostedUpcoming: number` — count of `drop_in_sessions` with `status='scheduled'`, `kind='pickup'`, `hostUserId IS NULL`, `startsAt > now()`, same org + location scope as the sessions list GET.

- [ ] **Step 1: Failing tests** (same helper conventions as `tests/api/host/admin-hosts.test.ts`):

```ts
it("creates an active host profile for an existing user", async () => {
  const res = await fetch(`${BASE}/api/admin/hosts`, {
    method: "POST", headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ userId: SEEDED_PARENT_USER_ID }), // resolve a seeded user id via an existing endpoint or the seed constants used by neighboring tests
  });
  expect(res.status).toBe(201);
  const { host } = await res.json();
  expect(host.status).toBe("active");
});

it("409s on duplicate", async () => { /* same POST again → 409 */ });
it("400s on missing userId", async () => { /* {} body → 400 */ });
it("GET carries unhostedUpcoming count", async () => {
  const res = await fetch(`${BASE}/api/admin/hosts`, { headers: { cookie } });
  const json = await res.json();
  expect(typeof json.unhostedUpcoming).toBe("number");
});
```

- [ ] **Step 2: Run — expect FAIL** (405/undefined).

- [ ] **Step 3: Implement POST** in `hosts/index.ts`:

```ts
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  let body: { userId?: string };
  try { body = await context.request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  if (!body.userId) return json({ error: "userId required" }, 400);

  const db = getDb();
  const [user] = await db.select({ id: users.id }).from(users)
    .where(eq(users.id, body.userId)).limit(1);
  if (!user) return json({ error: "User not found" }, 404);

  const [existing] = await db.select({ id: hostProfiles.id }).from(hostProfiles)
    .where(and(eq(hostProfiles.userId, body.userId),
               eq(hostProfiles.organizationId, auth.organizationId))).limit(1);
  if (existing) return json({ error: "Already a host in this organization" }, 409);

  const [created] = await db.insert(hostProfiles).values({
    userId: body.userId,
    organizationId: auth.organizationId,
    status: "active",
    approvedByUserId: auth.user.id,
  }).returning();
  return json({ host: created }, 201);
};
```

and extend GET with the count (reuse `getEffectiveLocationIds` + `venueLocationCondition` exactly as `sessions/index.ts` does, joining `venues` for the scope condition):

```ts
const [cnt] = await getDb()
  .select({ n: sql<number>`COUNT(*)::int` })
  .from(dropInSessions)
  .leftJoin(venues, eq(venues.id, dropInSessions.venueId))
  .where(and(
    eq(dropInSessions.organizationId, auth.organizationId),
    eq(dropInSessions.status, "scheduled"),
    eq(dropInSessions.kind, "pickup"),
    isNull(dropInSessions.hostUserId),
    gt(dropInSessions.startsAt, new Date()),
    scopeCond,
  ));
// response: json({ hosts: rows, unhostedUpcoming: cnt?.n ?? 0 }, 200)
```

- [ ] **Step 4: Run tests — expect PASS.** Also re-run `tests/api/host/admin-hosts.test.ts` (response shape changed additively — fix any strict-shape assertion).

- [ ] **Step 5: Commit:** `git commit -am "feat(admin): manual host creation + unhosted-coverage count on hosts API"`

---

### Task 7: Hosts tab UI — coverage line + Add host dialog

**Files:**
- Modify: `src/components/admin/dropin/HostsPanel.tsx`

**Interfaces:**
- Consumes: Task 6's `unhostedUpcoming` + `POST /api/admin/hosts`; existing `GET /api/admin/users?search=` (paginated users list — read `src/pages/api/admin/users.ts` response shape before wiring).

- [ ] **Step 1: Coverage line.** Under the tab intro, when `unhostedUpcoming > 0`, render informational (NOT alarm) copy: `<p className="text-sm text-ink-muted">{n} upcoming pickup session{s} without a host — <a className="underline" href="/admin/dropins">view schedule</a>.</p>`

- [ ] **Step 2: Add host dialog.** Secondary `<Button variant="outline">Add host manually</Button>` opening a shadcn `Dialog`: a search input (debounced 300ms) hitting `/api/admin/users?search=${q}&limit=8`, results as rows (name + email) with an `Add` button → `POST /api/admin/hosts {userId}` → success toast + reload roster; 409 → toast "Already a host". Explain-line in the dialog: "For people you already know. New volunteers should apply at /host so they're vetted."

- [ ] **Step 3: Verify** in the browser: search a seeded parent, add, see them appear active in the roster; assign them from a session card (Task 5 path). `npx tsc --noEmit`.

- [ ] **Step 4: Commit:** `git commit -am "feat(admin): host coverage line + manual add-host dialog"`

---

### Task 8: `host_ratings` schema + migration

**Files:**
- Modify: `src/lib/db/schema/hosts.ts` (append table + type exports)
- Create: `src/lib/db/migrations/NNNN_host_ratings.sql` (via `npm run db:generate`)

**Interfaces:**
- Produces: `hostRatings` table for Tasks 9–10:

```ts
import { integer, check } from "drizzle-orm/pg-core"; // add to existing imports
import { sql } from "drizzle-orm";
import { feedbackRequests } from "./feedback";

export const hostRatings = pgTable(
  "host_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull().unique()
      .references(() => feedbackRequests.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull()
      .references(() => dropInSessions.id, { onDelete: "cascade" }),
    hostUserId: uuid("host_user_id").notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("host_ratings_host_created_idx").on(table.hostUserId, table.createdAt),
    index("host_ratings_session_idx").on(table.sessionId),
    check("host_ratings_rating_range", sql`${table.rating} BETWEEN 1 AND 5`),
  ],
);
export type HostRating = typeof hostRatings.$inferSelect;
export type NewHostRating = typeof hostRatings.$inferInsert;
```

- [ ] **Step 1:** Add the table. Check `hosts.ts`'s existing imports — it does not import `feedbackRequests` today; watch for a circular import (feedback.ts must not import hosts.ts — it doesn't). If the schema barrel (`src/lib/db/schema/index.ts`) exists, confirm `hostRatings` is exported through it.
- [ ] **Step 2:** `npm run db:generate` — review the generated SQL: one `CREATE TABLE`, three constraints, two indexes, nothing destructive. Rename the file suffix to `_host_ratings` if the generator's name is opaque.
- [ ] **Step 3:** `npx tsc --noEmit`.
- [ ] **Step 4: Commit** schema + migration together: `git commit -am "feat(db): host_ratings table"`

---

### Task 9: Host metadata through dispatch + rating on score submit

**Files:**
- Modify: `src/lib/db/schema/feedback.ts` (`FeedbackRequestMetadata` interface: add `hostUserId?: string; hostName?: string;`)
- Modify: `src/lib/feedback/dispatch.ts` (nps_drop_in candidate query ~lines 100–140)
- Modify: `src/lib/feedback/lookup.ts` (expose `hostName` on the page view)
- Modify: `src/pages/api/feedback/[token]/score.ts`
- Test: `tests/api/feedback/host-rating.test.ts` (create — follow existing `tests/api/` feedback test conventions; if none exist, follow `tests/api/dropin/cancel.test.ts` style and create requests directly via the seeded DB path other feedback tests use; read `src/lib/feedback/dispatch.ts` test coverage first: `grep -rn "feedback" tests/api/ -l`)

**Interfaces:**
- Consumes: Task 8's `hostRatings`.
- Produces: `POST /api/feedback/[token]/score` accepts optional `hostRating` (int 1–5) and `hostComment` (≤2000 chars); when the request's metadata has `hostUserId`, writes a `host_ratings` row in the SAME transaction as the NPS claim. `getFeedbackPageData` returns `hostName?: string`.

- [ ] **Step 1: Dispatch stamps the host.** In the `nps_drop_in` candidate select, join is already on `dropInSessions`; add `hostUserId: dropInSessions.hostUserId` to the selected fields, left-join `users` for the name, and when building metadata include (only when set):

```ts
...(c.hostUserId ? { hostUserId: c.hostUserId, hostName: c.hostFirstName ?? "your host" } : {}),
```

Match the surrounding metadata-building code style exactly — read how `eventLabel`/`venueId` are stamped and extend that object.

- [ ] **Step 2: Lookup exposes hostName.** In `lookup.ts`'s page-view builder add `hostName: row.metadata?.hostName` beside `refereeName`.

- [ ] **Step 3: Failing API test** (the seeded feedback-request path used by existing feedback tests; core assertions):

```ts
it("accepts an optional host rating with the NPS score", async () => {
  // seed/dispatch a nps_drop_in request whose session has a host (fixture from Task 6's created host)
  const res = await fetch(`${BASE}/api/feedback/${token}/score`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: 9, hostRating: 5, hostComment: "great vibes" }),
  });
  expect(res.status).toBe(200);
});
it("rejects out-of-range hostRating", async () => { /* hostRating: 6 → 400 */ });
it("still works with score only", async () => { /* {score: 7} on a hosted request → 200 */ });
```

- [ ] **Step 4: Implement in score.ts.** Extend the schema:

```ts
const bodySchema = z.object({
  score: z.number().int().min(0).max(10),
  hostRating: z.number().int().min(1).max(5).optional(),
  hostComment: z.string().trim().max(2000).optional(),
});
```

Inside the existing transaction, after the `npsResponses` insert:

```ts
const hostUserId = row.metadata?.hostUserId;
if (hostRating && hostUserId && row.kind === "nps_drop_in") {
  // targetId is the dropInBookings.id for nps_drop_in — resolve the session.
  const [booking] = await tx
    .select({ sessionId: dropInBookings.sessionId })
    .from(dropInBookings)
    .where(eq(dropInBookings.id, row.targetId))
    .limit(1);
  if (booking) {
    await tx.insert(hostRatings).values({
      organizationId: row.organizationId,
      requestId: row.id,
      sessionId: booking.sessionId,
      hostUserId,
      rating: hostRating,
      comment: hostComment ?? null,
    });
  }
}
```

A missing booking silently skips the rating (the NPS response still commits) — the score is the primary artifact. `hostRating` on a request without `metadata.hostUserId` is ignored, not an error.

- [ ] **Step 5: Run tests — expect PASS.** Re-run the whole feedback + dropin API suites for regressions.

- [ ] **Step 6: Commit:** `git commit -am "feat(feedback): optional host rating rides the drop-in NPS submit"`

---

### Task 10: Host question on the feedback form

**Files:**
- Modify: `src/components/feedback/feedback-form.tsx`

**Interfaces:**
- Consumes: `hostName` prop (add to the component's props and to `src/pages/feedback/[token].astro`'s `<FeedbackForm ... hostName={data.hostName ?? null} />`); Task 9's extended score POST body.

- [ ] **Step 1:** Read `feedback-form.tsx` first — match its state/submit structure. Add: when `hostName` is set and `kind === "nps_drop_in"`, render below the score selector (before submit):

```tsx
<fieldset className="mt-6">
  <legend className="text-sm font-medium text-ink">
    How was your host, {hostName}? <span className="text-ink-muted">(optional)</span>
  </legend>
  <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Host rating">
    {[1, 2, 3, 4, 5].map((n) => (
      <button key={n} type="button" role="radio" aria-checked={hostRating === n}
        onClick={() => setHostRating(hostRating === n ? null : n)}
        className={`text-2xl leading-none ${hostRating && n <= hostRating ? "text-ink" : "text-ink-muted/40"}`}>
        ★
      </button>
    ))}
  </div>
  {hostRating != null && (
    <textarea value={hostComment} onChange={(e) => setHostComment(e.target.value)}
      maxLength={2000} rows={2} placeholder="Anything to add? (optional)"
      className="mt-2 w-full rounded border border-border bg-cream px-3 py-2 text-sm" />
  )}
</fieldset>
```

Submit body gains `...(hostRating ? { hostRating, hostComment: hostComment || undefined } : {})`. Clicking the same star clears it (optional truly means optional).

- [ ] **Step 2: Verify by hand:** trigger the feedback page with a seeded token (see how e2e/API tests mint tokens — `src/lib/feedback/tokens.ts`) for a hosted session; submit with and without stars; confirm one `host_ratings` row via the admin ratings columns (Task 11) or a direct API check. Verify on BOTH brands' styling (BrandTheme token inversion — check the page on a gosoccerone-resolved host or the brand preview mechanism used by other feedback styling checks).

- [ ] **Step 3: Commit:** `git commit -am "feat(feedback): optional host star rating on the drop-in NPS form"`

---

### Task 11: Ratings aggregates on the Hosts tab

**Files:**
- Modify: `src/pages/api/admin/hosts/index.ts` (GET select)
- Modify: `src/components/admin/dropin/HostsPanel.tsx` (columns)
- Test: extend `tests/api/host/admin-create-host.test.ts` (or `admin-hosts.test.ts`)

**Interfaces:**
- Consumes: Task 8's `hostRatings`.
- Produces: each host row gains `avgRating: number | null` (1 decimal) and `ratingCount: number`.

- [ ] **Step 1: Failing test:** GET `/api/admin/hosts` → every host row has `avgRating` (null or number) and `ratingCount` (number).

- [ ] **Step 2: Implement** — add to the GET select, following the existing correlated-subquery style in the same file:

```ts
avgRating: sql<number | null>`(
  SELECT ROUND(AVG(r.rating)::numeric, 1)::float FROM ${hostRatings} r
  WHERE r.host_user_id = ${hostProfiles.userId}
    AND r.organization_id = ${hostProfiles.organizationId}
)`,
ratingCount: sql<number>`(
  SELECT COUNT(*)::int FROM ${hostRatings} r
  WHERE r.host_user_id = ${hostProfiles.userId}
    AND r.organization_id = ${hostProfiles.organizationId}
)`,
```

- [ ] **Step 3: HostsPanel columns:** add a "Rating" column rendering `avgRating != null ? `★ ${avgRating} (${ratingCount})` : <span className="text-ink-muted">—</span>`.

- [ ] **Step 4: Run tests, `npx tsc --noEmit`, commit:** `git commit -am "feat(admin): host rating aggregates on the hosts roster"`

---

### Task 12: E2E updates + full verification pass

**Files:**
- Modify: any spec in `tests/e2e/` that exercises `/admin/dropins` or the sessions table (find them: `grep -rln "dropin\|Drop-in" tests/e2e/`)
- Create: `tests/e2e/admin-pickup-week-view.spec.ts`

**Interfaces:**
- Consumes: Task 3's `data-testid="session-card"` / `data-testid="day-group"`; `waitForHydration` from `tests/utils/test-helpers` (import as `../utils/test-helpers`).

- [ ] **Step 1: Update stale specs.** Any selector assuming the old `<table>` layout must move to the card testids. Remember: these run POST-merge only (`test-full`), so they won't gate the PR — get them right now.

- [ ] **Step 2: New spec** (click-driven, hydration-gated):

```ts
import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../utils/test-helpers";

test("admin week view shows day groups and navigates weeks", async ({ page }) => {
  await signIn(page, "admin@test.aspiresports.com", "TestAdmin123!");
  await page.goto("/admin/dropins");
  await waitForHydration(page);
  await expect(page.getByTestId("day-group")).toHaveCount(7);
  const label = await page.locator("text=/–/").first().textContent();
  await page.getByRole("button", { name: "▶" }).click();
  await expect(page.locator(`text=${label}`)).toHaveCount(0);
});
```

(Match `signIn`'s real signature from `tests/utils/test-helpers.ts` before writing.)

- [ ] **Step 3: Full pre-push checklist** (this is major work — schema + endpoints + e2e):
  1. Migration committed (Task 8) — re-check `git log --stat` shows the SQL file.
  2. `npm run db:seed:e2e`
  3. Dev server up with `R2_MOCK=1 CRON_SECRET=x E2E_TEST_ENDPOINTS=yes`; `CRON_SECRET=x TEST_BASE_URL=http://localhost:4321 npm run test:api`
  4. `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- admin-pickup-week-view` (+ any updated specs)
  5. `npm run build` (worktree; note: a build poisons the dev Vite cache — restart the dev server after)
  6. `npx tsc --noEmit` → zero errors
  Known staging-data flakes (2 API + 4 Playwright) are pre-existing — triage by file-overlap with this branch only.
- [ ] **Step 4: Browser verification on BOTH brands** (aspire + soccerone hosts) for: week view, assign popover, hosts tab, feedback form stars.
- [ ] **Step 5: Commit, push, open PR** targeting `main` **after PR #431 merges** (this branch stacks on it — if #431 is still open, set the PR base to `feat/rename-pickup-nav` and retarget after merge). PR body summarizes the spec; end with the standard Claude Code footer.

---

## Self-review notes

- Spec §1 (week view) → Tasks 1–3; §2 (delete) → Task 4; §3 (assignment) → Task 5; §4 (hosts tab) → Tasks 6–7; §5 (reviews) → Tasks 8–11; testing section → per-task tests + Task 12.
- Types consistent: `hostUserId`/`hostName` (Tasks 1, 3, 9), `unhostedUpcoming` (6, 7), `hostRatings` (8, 9, 11), `hostRating`/`hostComment` body fields (9, 10).
- Deliberate deviations from "complete code": test-helper import names and confirm-dialog mechanics are referenced by "read the neighboring file first" because they're repo-specific and copying stale signatures into the plan would be worse than pointing at the live source.
