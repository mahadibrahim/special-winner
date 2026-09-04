# Classes Dashboard Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the parent dashboard and per-child pages launch-ready for the October 2026 youth classes launch — real schedule data, full class management (see/cancel any booked session, real cancel-window copy), waiver attention, class discovery entry points, and class-aware child profiles.

**Architecture:** Everything hangs off `GET /api/classes/summary` (the one aggregate the dashboard runs on) — Task 1 extends it once, and every UI task consumes the new fields. Schedule data gets a pure projection helper (`src/lib/dashboard/schedule-events.ts`) + one new authed endpoint, then the existing (fully-built, never-wired) `full-schedule.tsx` UI is connected to it. No schema changes, no migrations — every field needed already exists in the DB (`memberships.currentPeriodEnd`, `familyMembers.kitSize`, `dropInBookings.familyMemberId`).

**Tech Stack:** Astro 5 SSR API routes, React 19 islands, Drizzle ORM, Vitest (API + unit), Playwright.

## Global Constraints

- **No schema changes.** If any task appears to need a migration, stop — it's out of scope and likely wrong.
- **Tenant scoping:** every query filters by `organizationId` from `locals.organization`; summary endpoint copy stays **brand-neutral** (serves Aspire + SoccerOne).
- **`findFirst`/`.limit(1)` MUST have explicit `orderBy`** (shared CI DB accumulates rows — see CLAUDE.md "Multi-tenant query hazards").
- **UI primitives:** `ErrorBanner` / `EmptyState` / `LoadingSkeleton` from `@/components/ui/`; destructive confirms use `useConfirmDialog()` from `@/components/ui/confirm-dialog` (returns `{ confirm, dialog }`; `await confirm({ title?, description?, confirmLabel?, destructive? })` → `Promise<boolean>`; render `{dialog}` in JSX) — never `window.confirm`.
- **E2E:** every spec calls `await waitForHydration(page)` (from `../utils/test-helpers`) before any interaction; prefer element clicks over `page.keyboard.press`; new interactive surfaces get `data-testid` hooks. `/dashboard/family`'s hydration beacon lives in `ChildrenOverview` (`useHydrationBeacon()`) — don't remove it.
- **API tests** hit the running dev server (`npm run dev` with `E2E_TEST_ENDPOINTS=yes`); CI has **no Stripe** — memberships/credits are minted via DB insert using `tests/utils/classes-helpers.ts` (`createTestChild`, `createTestChildMembership`, `createTestClassTemplate`, `createTestCreditGrant`, `resolveClassTestFixtures`, `cleanupTestClassFixtures`). Sign in as `CLASS_TEST_PARENT_EMAIL` / `CLASS_TEST_PARENT_PASSWORD`.
- **Design coordination:** the Broadsheet design-system session may restyle dashboards in a later wave. Tasks here are **structural/behavioral only** — reuse `DashboardShell` / `DashboardSection` / `DashboardCard` and the `StatusTone` palette (`src/lib/dashboard/dashboard-ui.ts`); do NOT import `src/components/youth/bands/*` or invent new styling.
- **Commits:** one per task minimum, conventional messages, end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Timestamps are UTC in the DB, displayed in org timezone. Class session projection must use the existing zoned helpers (`zonedWallClockUtc` in `src/lib/classes/materialize.ts`) — never naive `new Date(y, m, d, h)` arithmetic.

## File Structure

| File | Responsibility | Fate |
|---|---|---|
| `src/lib/memberships/get-child-membership.ts` | `ChildMembership` gains `currentPeriodEnd`, `cancelAtPeriodEnd` | modify (Task 1) |
| `src/pages/api/classes/summary.ts` | + `upcomingSessions[]`, `membership.renewsAt/cancelAtPeriodEnd/technicalMonthlyCents`, `kitSize`, top-level `cancelWindowHours` | modify (Task 1) |
| `tests/api/classes/summary.test.ts` | first-ever test for the summary endpoint | create (Task 1) |
| `src/components/dashboard/family-classes-card.tsx` | session list + per-session cancel, real cancel-window copy, confirm dialogs, technical upsell, tail-of-block End button, testids | modify (Tasks 2, 4, 5) |
| `src/pages/dashboard/family.astro` | waiver attention item, Explore card → `/youth/classes` | modify (Tasks 3, 6) |
| `src/pages/dashboard/start.astro` | classes door | modify (Task 6) |
| `src/pages/api/dropin/bookings/index.ts` | response gains `familyMemberId` | modify (Task 7) |
| `src/lib/dashboard/schedule-events.ts` | pure projection: bookings + enrollments + registrations → dated events | create (Task 8) |
| `tests/unit/dashboard/schedule-events.test.ts` | projection unit tests | create (Task 8) |
| `src/pages/api/dashboard/schedule.ts` | authed per-family schedule endpoint | create (Task 8) |
| `tests/api/dashboard-schedule.test.ts` | endpoint API tests | create (Task 8) |
| `src/components/dashboard/full-schedule.tsx` | delete mock generator; fetch real events; `"class"` event type; real child filter | modify (Task 9) |
| `src/components/dashboard/payments-summary.tsx` | wire to `GET /api/payments/history` | modify (Task 10) |
| `src/components/dashboard/registrations-card.tsx` | dead code (zero imports) | delete (Task 10) |
| `src/components/dashboard/child-profile.tsx` + `child-profile-data.ts` | Classes section (tier/allotment/home slot/credits/kit size); Schedule tab shows real sessions | modify (Task 11) |
| `src/pages/dashboard/children/[id].astro`, `[id]/development.astro`, `src/pages/dashboard/schedule.astro` | adopt `DashboardShell`, drop inline gradient `<style>` blocks | modify (Task 12) |
| `tests/e2e/classes-dashboard.spec.ts` | cancel-booking, end-enrollment, schedule-content, child-profile-classes flows | create (Tasks 2, 9, 11) |

---

### Task 1: Extend `GET /api/classes/summary` — renewal date, cancel window, kit size, upcoming-sessions list

The summary endpoint currently returns only the SINGLE next session per child, no renewal date, no cancel-window number, and no kit size. Every later UI task needs these. This endpoint has **no test at all today** — that gets fixed first.

**Files:**
- Modify: `src/lib/memberships/get-child-membership.ts:28-44` (interface), `:97-107` (return)
- Modify: `src/pages/api/classes/summary.ts`
- Create: `tests/api/classes/summary.test.ts`

**Interfaces:**
- Consumes: existing `getActiveChildMembership(familyMemberId, organizationId, dbOrTx?)`; `dropInRateCard` lookup pattern from `src/lib/dropin/refund.ts:82-87`.
- Produces (later tasks rely on these exact names):
  - `ChildMembership` gains `currentPeriodEnd: Date | null` and `cancelAtPeriodEnd: boolean`.
  - Summary response: top-level `cancelWindowHours: number`; per child `kitSize: string | null`, `upcomingSessions: Array<{ sessionId: string; bookingId: string; startsAt: string }>` (ISO strings, soonest-first, capped at 10), `membership` gains `renewsAt: string | null`, `cancelAtPeriodEnd: boolean`, `technicalMonthlyCents: number | null`. Existing `nextSession` shape is **unchanged** (choose-slot depends on it).

- [ ] **Step 1: Write the failing API test**

Create `tests/api/classes/summary.test.ts`, mirroring the setup style of `tests/api/classes/enrollments.test.ts` (signed-in parent via `CLASS_TEST_PARENT_EMAIL`, fixtures via `tests/utils/classes-helpers.ts`, cleanup in `afterAll` with `cleanupTestClassFixtures`):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
// import the same signIn/baseUrl helpers enrollments.test.ts uses

describe("GET /api/classes/summary", () => {
  // beforeAll: resolveClassTestFixtures(); createTestChild(); createTestChildMembership({
  //   tierOverrides: { technicalMonthlyCents: 900 } });
  // createTestClassTemplate(); enroll child; book TWO future sessions for the child.

  it("returns 401 signed out", async () => {
    const res = await fetch(`${baseUrl}/api/classes/summary`);
    expect(res.status).toBe(401);
  });

  it("exposes cancelWindowHours at the top level (number, default 24)", async () => {
    const body = await authedGet("/api/classes/summary");
    expect(typeof body.cancelWindowHours).toBe("number");
  });

  it("returns membership renewal fields and technical supplement", async () => {
    const child = findChild(body, testChildId);
    expect(child.membership).toMatchObject({
      cancelAtPeriodEnd: false,
      technicalMonthlyCents: 900,
    });
    // renewsAt: ISO string when currentPeriodEnd is set, null otherwise —
    // fixture memberships are DB-minted without Stripe, so assert null here
    // and assert the ISO passthrough by updating the row directly:
    expect(child.membership.renewsAt).toBeNull();
  });

  it("returns kitSize from familyMembers", async () => {
    // set kitSize "YM" on the child row via DB, re-fetch
    expect(findChild(body, testChildId).kitSize).toBe("YM");
  });

  it("lists ALL upcoming confirmed sessions soonest-first, and nextSession still equals the first", async () => {
    const child = findChild(body, testChildId);
    expect(child.upcomingSessions.length).toBe(2);
    const times = child.upcomingSessions.map((s: any) => s.startsAt);
    expect([...times].sort()).toEqual(times);
    expect(child.nextSession.sessionId).toBe(child.upcomingSessions[0].sessionId);
    expect(child.upcomingSessions[0]).toHaveProperty("bookingId");
  });

  it("caps upcomingSessions at 10", async () => {
    // book 12 future sessions for a second child; expect exactly 10 returned
  });
});
```

Write the `// comment` lines as real code — the helpers named in Global Constraints do all of it via DB insert (no Stripe in CI). Booking future sessions: insert `dropInSessions` (kind `"class"`, status `"scheduled"`, future `startsAt`) + `dropInBookings` (status `"confirmed"`, the child's `familyMemberId`) directly, the way `tests/api/classes/book.test.ts` does.

- [ ] **Step 2: Run it, verify it fails**

`CRON_SECRET=<dev-server-value> TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/classes/summary.test.ts`
Expected: FAIL — `cancelWindowHours` undefined, `upcomingSessions` undefined.

- [ ] **Step 3: Extend `ChildMembership`**

In `src/lib/memberships/get-child-membership.ts`, add to the interface (after `classAllotmentRemaining`):

```ts
  /** Stripe current_period_end — the "renews on" date. Null for DB-minted /
   *  pre-Stripe memberships. */
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
```

and to the return object: `currentPeriodEnd: row.m.currentPeriodEnd, cancelAtPeriodEnd: row.m.cancelAtPeriodEnd,` (both columns exist — `src/lib/db/schema/memberships.ts:121,125`).

- [ ] **Step 4: Extend the summary endpoint**

In `src/pages/api/classes/summary.ts`:

1. Children select (`:79`): add `kitSize: familyMembers.kitSize`.
2. Rate-card lookup (once, before the `result` map — same pattern as `src/lib/dropin/refund.ts:82-87`, import `dropInRateCard` from `@/lib/db/schema/drop-in`):
```ts
  const [rateCard] = await db
    .select({ cancelWindowHours: dropInRateCard.cancelWindowHours })
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, organizationId))
    .limit(1);
  const cancelWindowHours = rateCard?.cancelWindowHours ?? 24;
```
(`.limit(1)` without orderBy is acceptable ONLY because `dropInRateCard.organizationId` is unique-per-org; add a comment saying so.)
3. Upcoming sessions: the existing `nextSessionRows` query (`:162-180`) already fetches ALL future confirmed class sessions ordered `asc(startsAt)` — collect them all instead of first-only:
```ts
  const upcomingSessionsByChild = new Map<string, typeof nextSessionRows>();
  for (const row of nextSessionRows) {
    if (!row.familyMemberId) continue;
    const list = upcomingSessionsByChild.get(row.familyMemberId) ?? [];
    if (list.length < 10) list.push(row);
    upcomingSessionsByChild.set(row.familyMemberId, list);
  }
```
Keep the existing `nextSessionByChild` first-row logic untouched.
4. Per-child result: add `kitSize: c.kitSize ?? null`, `upcomingSessions: (upcomingSessionsByChild.get(c.id) ?? []).map((r) => ({ sessionId: r.sessionId, bookingId: r.bookingId, startsAt: r.startsAt.toISOString() }))`; membership block gains `renewsAt: membership.currentPeriodEnd?.toISOString() ?? null, cancelAtPeriodEnd: membership.cancelAtPeriodEnd, technicalMonthlyCents: membership.technicalMonthlyCents`.
5. Response: `return json({ children: result, cancelWindowHours }, 200);` — and update the empty-children early return (`:86`) to include `cancelWindowHours` too (fetch the rate card before it).

- [ ] **Step 5: Run the test, verify it passes** — same command as Step 2. Expected: PASS.

- [ ] **Step 6: Regression check** — `npx vitest run tests/api/classes/ tests/api/memberships-child-subscribe.test.ts` and `npx tsc --noEmit`. Expected: green (choose-slot and family-card consume `nextSession`, unchanged).

- [ ] **Step 7: Commit** — `feat(classes): summary API exposes upcoming sessions, renewal date, cancel window, kit size`

---

### Task 2: Family card — upcoming-session list with per-session cancel, real cancel-window copy, proper confirm dialogs

Today `MembershipChildCard` shows one "next class" line and can only cancel that one (`handleCancel` reads `child.nextSession` only, `family-classes-card.tsx:1121-1130`), the cancel confirm says "before the cancellation window" with no number (`:1123-1127`), and both destructive actions use `window.confirm` (`:1123`, `:358`).

**Files:**
- Modify: `src/components/dashboard/family-classes-card.tsx`
- Create: `tests/e2e/classes-dashboard.spec.ts` (first two scenarios)

**Interfaces:**
- Consumes: `child.upcomingSessions`, top-level `cancelWindowHours` from Task 1. `POST /api/classes/bookings/[id]/cancel` → `{ creditFreed, refunded }` | 409 `inside_cutoff` (unchanged).
- Produces: testids used by the E2E spec: `data-testid="upcoming-session-row"`, `data-testid="cancel-session"`, `data-testid="end-enrollment"`.

- [ ] **Step 1: Write the failing E2E scenario**

In new `tests/e2e/classes-dashboard.spec.ts` (fixture setup mirrors `tests/e2e/class-pack-purchase.spec.ts`'s credits suite — DB-minted membership + template + two future booked sessions, cleanup after):

```ts
import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../utils/test-helpers";

test("family card lists all upcoming sessions and cancels a specific one with a windowed confirm", async ({ page }) => {
  await signIn(page, PARENT_EMAIL, PARENT_PASSWORD);
  await page.goto("/dashboard/family");
  await waitForHydration(page);

  const rows = page.getByTestId("upcoming-session-row");
  await expect(rows).toHaveCount(2);

  await rows.nth(1).getByTestId("cancel-session").click();
  // useConfirmDialog renders an AlertDialog with the REAL window number:
  await expect(page.getByRole("alertdialog")).toContainText(/\d+ hours/);
  await page.getByRole("button", { name: "Cancel this class" }).click();

  await expect(rows).toHaveCount(1);
});
```

- [ ] **Step 2: Run it, verify it fails** — `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- classes-dashboard` → FAIL (`upcoming-session-row` count 0).

- [ ] **Step 3: Implement**

In `MembershipChildCard` (and `CreditChildCard` where it shows sessions):
1. Replace the single next-class line (`:1254-1257`) with a list over `child.upcomingSessions` — each row `data-testid="upcoming-session-row"`: formatted date/time + a `data-testid="cancel-session"` ghost button. Keep the visual weight of the current single line; this is a short `<ul>`, not a new card.
2. Replace `window.confirm` in `handleCancel` (`:1123`) and End-enrollment (`:358`) with `useConfirmDialog()`; the hook is per-component — call it once at the top of `FamilyClassesCard`'s child-card components and render `{dialog}`. Cancel copy: `title: "Cancel this class?"`, `description:` \`Cancelling less than ${cancelWindowHours} hours before start forfeits the session.\`, `confirmLabel: "Cancel this class"`, `destructive: true`. End-enrollment keeps its existing credits-float copy but moves into the dialog.
3. `handleCancel(bookingId: string)` now takes the row's bookingId instead of reading `child.nextSession`. Success toast copy unchanged (`creditFreed` / `refunded` / `inside_cutoff` branches, `:1136-1151`).
4. Thread `cancelWindowHours` from the summary fetch into the card props (it arrives top-level in the same response the card already fetches at `:1447`).
5. Add `data-testid="end-enrollment"` to the End button.

- [ ] **Step 4: Run the E2E, verify it passes** — command from Step 2. Also re-run the existing card specs: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- class-pack-purchase` (they select on copy strings — booking/waiver/billing flows must stay green).

- [ ] **Step 5: Commit** — `feat(dashboard): family card lists all upcoming class sessions with per-session cancel + real cancel-window copy`

---

### Task 3: Waiver attention item on the family page

`WaiverNudge` is gated on `credits.length > 0` (`family-classes-card.tsx:1283`, `:1322`) — a membership child with a lapsed annual waiver and zero credits gets no warning until a booking 422s.

**Files:**
- Modify: `src/components/dashboard/family-classes-card.tsx`

**Interfaces:**
- Consumes: `child.hasWaiverOnFile` (already annual-validity, `summary.ts:285`), `child.membership`, `child.enrollment`.

- [ ] **Step 1: Write the failing check** — extend `tests/e2e/classes-dashboard.spec.ts`: seed a membership child WITHOUT a valid waiver (helpers already support this — the annual-waiver suites in `class-pack-purchase.spec.ts:848-1024` show the recipe); assert `/dashboard/family` shows `getByTestId("waiver-attention")` containing the child's first name.

- [ ] **Step 2: Run → FAIL** (testid absent).

- [ ] **Step 3: Implement** — in `MembershipChildCard`, render the existing `WaiverNudge` component whenever `!child.hasWaiverOnFile && (child.membership || child.enrollment)` — i.e. drop the credits gate, keep it for `CreditChildCard` as-is. Add `data-testid="waiver-attention"` to `WaiverNudge`'s root. Copy stays what `WaiverNudge` renders today (it already handles sign-flow entry).

- [ ] **Step 4: Run → PASS**, plus `class-pack-purchase` waiver suites stay green.

- [ ] **Step 5: Commit** — `fix(dashboard): waiver nudge fires for membership children, not only credit holders`

---

### Task 4: Route `technical_not_included` to a membership upsell (issue #608)

`POST /api/classes/book` returns 409 `technical_not_included` when a member's allotment can't book a technical session; `MakeUpModal` currently dumps the raw message into an `ErrorBanner`.

**Files:**
- Modify: `src/components/dashboard/family-classes-card.tsx` (MakeUpModal error handling, near the 402 paid-path branch `:773-782`)

**Interfaces:**
- Consumes: 409 body `{ error: "technical_not_included" }` from `POST /api/classes/book`; `child.membership.technicalMonthlyCents` (Task 1) for the price line; the technical-premium confirm copy precedent in `choose-slot.tsx:489-498`.

- [ ] **Step 1: Failing test** — extend `classes-dashboard.spec.ts`: seed a technical template (`createTestClassTemplate` supports `isTechnical` — check its opts; the technical-enrollment API suite `tests/api/classes-technical-enrollment.test.ts` shows the fixture recipe) + a member child on a tier with `technicalMonthlyCents: 900` and no supplement active. Open Make-up modal, pick the technical session, assert the modal shows `getByTestId("technical-upsell")` containing "$9" and a link/button to add the supplement — not an ErrorBanner.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — in MakeUpModal's book-error branch, special-case `technical_not_included`: render a `data-testid="technical-upsell"` panel (info tone, not error): heading "This is a technical class", body \`Technical sessions run in smaller groups with extra coaching. Add the technical supplement — ${formatCents(technicalMonthlyCents)}/month — to book them with your membership.\`, CTA linking to `/dashboard/family/choose-slot?child=<id>` (the slot flow already owns the `acknowledgeTechnicalPremium` PUT), secondary "Not now" closes. `formatCents` from `src/lib/classes/ladder-model.ts:190`.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** — `feat(dashboard): technical make-up 409 routes to supplement upsell (closes #608)`

---

### Task 5: Tail-of-block End button persists (issue #601, F6 item)

On the last remaining session of a block, the card state that carries the End-enrollment control disappears, leaving no explicit way to end the enrollment.

**Files:**
- Modify: `src/components/dashboard/family-classes-card.tsx` (`CreditChildCard` render conditions `:1314-1361` and the `qualifying` filter `:1580-1583`)

- [ ] **Step 1: Failing test** — API-level state is easiest to stage: seed a block-backed enrollment whose grant has `remaining: 0` but one future booked session (the exact tail state — `classes-credit-booking.test.ts:158-524` shows grant manipulation). E2E: assert `/dashboard/family` still renders the child's card with `getByTestId("end-enrollment")` visible.

- [ ] **Step 2: Run → FAIL** (card absent or button gone).

- [ ] **Step 3: Implement** — treat "has an active enrollment" as qualifying on its own: extend the qualifying predicate to `membership || trialUsed || credits.length > 0 || enrollment !== null`, and in `CreditChildCard` render the End-enrollment button whenever `child.enrollment` exists, independent of the credits line. The DELETE response already reports `creditsFloated` for the tail case (`summary.ts` doc comment `:253-261`) — no copy changes needed.

- [ ] **Step 4: Run → PASS**; re-run `class-pack-purchase` credits suites.

- [ ] **Step 5: Commit** — `fix(dashboard): End-enrollment control survives the tail of a block (#601)`

---

### Task 6: Class discovery entry points

A child with no membership/trial/credits renders nothing (`:1580`), and neither `family.astro`'s Explore band nor `/dashboard/start` links classes at all.

**Files:**
- Modify: `src/components/dashboard/family-classes-card.tsx`, `src/pages/dashboard/family.astro:214-252`, `src/pages/dashboard/start.astro:26,45`

- [ ] **Step 1: Failing test** — E2E: fresh child (no class touchpoints) → `/dashboard/family` shows `getByTestId("discover-classes")` linking to `/youth/classes`; `/dashboard/start` shows a link with `href="/youth/classes"`.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**
1. In `FamilyClassesCard`, children failing the qualifying predicate get a compact `DiscoverCard` (pattern-match `ConvertCard` `:1367-1390`): child name, one line "Weekly small-group classes — first class is a free trial.", CTA → `/youth/classes` with `data-testid="discover-classes"`. Render at most ONE discover card per family (a 4-child family should not see 4 identical banners) — list the eligible names in the one card.
2. `family.astro` Explore band: add an `ExploreCard` for `/youth/classes` (title "Weekly classes", copy matching the other cards' tone).
3. `start.astro`: add a third door → `/youth/classes`.
Note: `/youth/classes` is the Aspire youth funnel — gate both Astro-level additions on the org/brand the page already uses for its other youth links (match how `family.astro` decides its existing youth Explore card; SoccerOne hosts must not grow an Aspire link).

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** — `feat(dashboard): class discovery entry points on family + start pages`

---

### Task 7: `GET /api/dropin/bookings` exposes `familyMemberId`

Child class bookings are stored with `familyMemberId` (`book-child.ts:517-518`) but the list response omits it (`src/pages/api/dropin/bookings/index.ts:135-152`) — blocks per-child attribution anywhere.

**Files:**
- Modify: `src/pages/api/dropin/bookings/index.ts`
- Test: grep `tests/api/` for an existing spec that GETs `/api/dropin/bookings` and add the assertion there; if none asserts the list shape, add a focused case to `tests/api/classes/book.test.ts` after a member booking.

- [ ] **Step 1: Failing assertion** — after a `POST /api/classes/book` success in `book.test.ts`, `GET /api/dropin/bookings` as the parent and expect the matching row to include `familyMemberId: testChildId`.
- [ ] **Step 2: Run → FAIL** (property undefined).
- [ ] **Step 3: Implement** — add `familyMemberId: dropInBookings.familyMemberId` to the endpoint's select + response mapping. Additive; `MyDropInBookings` ignores unknown fields.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `fix(api): dropin bookings list carries familyMemberId for per-child attribution`

---

### Task 8: Schedule data — projection helper + `GET /api/dashboard/schedule`

The schedule page needs dated events per child. Booked class sessions only exist ~8 days out (`HORIZON_DAYS = 8`, `materialize.ts:90`), so the endpoint returns **booked** sessions as firm events and **projects** the standing enrollment's weekly slot beyond the booked horizon, marked `projected`.

**Files:**
- Create: `src/lib/dashboard/schedule-events.ts`, `tests/unit/dashboard/schedule-events.test.ts`
- Create: `src/pages/api/dashboard/schedule.ts`, `tests/api/dashboard-schedule.test.ts`

**Interfaces:**
- Produces:
```ts
export interface FamilyScheduleEvent {
  id: string;               // booking id, or `proj-<enrollmentId>-<yyyy-mm-dd>`
  type: "class" | "game" | "practice" | "tournament";
  title: string;            // template/program name
  startsAt: string;         // ISO
  endsAt: string | null;
  childId: string;
  childName: string;
  location: string | null;
  address: string | null;
  projected: boolean;       // true = from enrollment recurrence, not a booked seat
  bookingId: string | null; // cancelable only when non-null
}

export function buildClassScheduleEvents(input: {
  bookedSessions: Array<{ bookingId: string; sessionId: string; startsAt: Date; durationMinutes: number | null; templateName: string; childId: string; childName: string; venueName: string | null; venueAddress: string | null }>;
  enrollments: Array<{ enrollmentId: string; childId: string; childName: string; templateName: string; weekday: number; startTime: string; durationMinutes: number | null; timezone: string; venueName: string | null; venueAddress: string | null }>;
  from: Date;
  horizonDays: number;      // endpoint passes 60
}): FamilyScheduleEvent[];
```
- Rules the unit tests pin: projected occurrences are generated from `weekday`/`startTime` in the org timezone using `zonedWallClockUtc` (import from `@/lib/classes/materialize` — export it there if not already exported); any projected occurrence within 24h of a booked session for the same child+template is **suppressed** (the booked seat is the truth — this also swallows the materialized-but-cancelled case honestly); output sorted by `startsAt`; deterministic `id`s.

- [ ] **Step 1: Unit tests first** — `tests/unit/dashboard/schedule-events.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildClassScheduleEvents } from "@/lib/dashboard/schedule-events";

const wed1730 = { enrollmentId: "e1", childId: "c1", childName: "Alex",
  templateName: "U8 Wednesdays", weekday: 3, startTime: "17:30",
  durationMinutes: 55, timezone: "America/New_York", venueName: "Powell", venueAddress: null };

describe("buildClassScheduleEvents", () => {
  it("emits booked sessions as firm events with bookingId", () => { /* one booked, no enrollment → 1 event, projected:false */ });
  it("projects weekly occurrences to the horizon in org-local wall time", () => {
    const events = buildClassScheduleEvents({ bookedSessions: [], enrollments: [wed1730],
      from: new Date("2026-09-04T12:00:00Z"), horizonDays: 28 });
    expect(events).toHaveLength(4);
    expect(events.every((e) => e.projected && e.bookingId === null)).toBe(true);
    // 17:30 America/New_York in September = 21:30Z
    expect(events[0].startsAt).toBe("2026-09-09T21:30:00.000Z");
  });
  it("suppresses a projection when a booked session for the same child+template lands within 24h", () => { /* booked Wed 17:30 + enrollment → no duplicate */ });
  it("sorts merged output by startsAt", () => { /* interleave two children */ });
  it("crosses a DST boundary keeping wall-clock time", () => { /* from late Oct, horizon 14 → both sides 17:30 local */ });
});
```

Fill each `/* */` with real fixtures — they're one object literal each.

- [ ] **Step 2: Run → FAIL** (module not found). `npx vitest run tests/unit/dashboard/schedule-events.test.ts`

- [ ] **Step 3: Implement the helper** — pure function, no DB. Projection: step day-by-day from `from` to `from + horizonDays`, emit when the org-local weekday matches `weekday`, building the instant via `zonedWallClockUtc(dateParts, startTime, timezone)` (match the exact signature in `materialize.ts:148` — reuse, don't reimplement). Suppression via a per-`childId+templateName` sorted array of booked times.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Endpoint API test** — `tests/api/dashboard-schedule.test.ts`: 401 signed out; parent with one booked session + enrollment gets ≥1 `projected:false` and ≥1 `projected:true` event, all `childId`s belong to the caller; a second signed-in user (media/coach account from the shared fixtures) sees `events: []` — tenant + ownership scoping.

- [ ] **Step 6: Run → FAIL** (404).

- [ ] **Step 7: Implement `src/pages/api/dashboard/schedule.ts`** — authed (`locals.user`, `locals.organization`); queries scoped `organizationId`:
  - children of caller (same pattern as `summary.ts:78-83`, `orderBy desc(createdAt)`, `limit MAX_CHILDREN`);
  - booked: confirmed `dropInBookings` joined to `dropInSessions` (kind `"class"`, future, org) joined to template for name/venue;
  - enrollments: active `classEnrollments` joined `classSlotTemplates` (org) — reuse the join shape from `summary.ts:132-152` plus `durationMinutes`/venue columns and the org timezone (`locals.organization.timezone` — confirm the field name on the org context; it's what `zonedDay` consumers use);
  - respond `{ children: [{id, name}], events: buildClassScheduleEvents({ ..., from: new Date(), horizonDays: 60 }) }`.
  League games/practices: **out of scope for this endpoint today** — `type` stays `"class"` for every event it emits; the union exists so the client type covers league events when a later pass adds them. Do not fake league events from season start dates.

- [ ] **Step 8: Run → PASS**, `npx tsc --noEmit` clean.

- [ ] **Step 9: Commit** — `feat(dashboard): family schedule endpoint — booked class sessions + projected enrollment occurrences`

---

### Task 9: Wire `full-schedule.tsx` to real data

The component is a fully-built calendar/list UI wired to hardcoded `[]` (`full-schedule.tsx:198-202`, `:635`) with a 120-line unused mock generator and no `"class"` event type.

**Files:**
- Modify: `src/components/dashboard/full-schedule.tsx`
- Modify: `tests/e2e/parent-dashboard.spec.ts:158` area + extend `tests/e2e/classes-dashboard.spec.ts`

- [ ] **Step 1: Failing E2E** — in `classes-dashboard.spec.ts`: seeded family (booked session + enrollment) → `/dashboard/schedule` → `waitForHydration` → list view shows ≥2 events including a "Class" badge and a "planned" marker on a projected row; child filter dropdown lists the child's name; clicking a booked event opens the detail modal.

- [ ] **Step 2: Run → FAIL** (empty state renders).

- [ ] **Step 3: Implement**
1. Delete `generateMockEvents` (`:75-196`) and the `mockEvents`/`mockChildren` block (`:198-202`).
2. `EventType` (`:25`) gains `"class"`; `eventTypeConfig` gains a class entry using the existing tone system (icon `Dumbbell` is taken by practice — use `Calendar`), colors consistent with the other three entries.
3. Replace `useState(mockEvents)` with a `useEffect` fetch of `GET /api/dashboard/schedule`; map `FamilyScheduleEvent` → `ScheduleEvent` (`date: new Date(e.startsAt)`, `title`, `childId`, `childName`, `location: e.location ?? ""`); keep a `projected` flag on the mapped object and render projected rows with a subtle "planned" chip + no cancel affordance. Loading → `LoadingSkeleton`; error → `ErrorBanner`; genuinely empty → existing empty state.
4. Child filter iterates the response's `children`.
5. Add `useHydrationBeacon()` to `FullSchedule` (it's the page's top-level `client:load` island — required by the E2E convention).

- [ ] **Step 4: Run → PASS**; also `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- parent-dashboard` (its shallow "can view schedule page" + calendar-export assertions must survive).

- [ ] **Step 5: Commit** — `feat(dashboard): schedule page renders real class sessions and projected weekly slots`

---

### Task 10: Payments summary goes real; delete dead `registrations-card.tsx`

`payments-summary.tsx` is a permanent empty state (`:33` `mockPayments = []`) on the page where class families now have monthly charges; `registrations-card.tsx` is ~800 lines with zero imports.

**Files:**
- Modify: `src/components/dashboard/payments-summary.tsx`
- Delete: `src/components/dashboard/registrations-card.tsx`

- [ ] **Step 1: Failing check** — E2E-light: extend `dashboard-persona.spec.ts`'s family-page section test OR assert in `classes-dashboard.spec.ts` that after fixtures exist, the payments summary section does NOT contain "No payments yet" when `GET /api/payments/history` returns rows for the account. (If the shared fixture parent has no payment rows and minting one without Stripe is awkward, instead unit-test the mapping: extract `mapHistoryToSummary(rows)` and test it — then the component test is just presence.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — fetch `GET /api/payments/history` (the exact response shape is whatever `src/components/dashboard/payment-history.tsx` already consumes — mirror its parsing), show the 3 most recent + a "View all" link to `/dashboard/payments`. Keep the honest empty state for zero rows.
- [ ] **Step 4: Delete `registrations-card.tsx`** — `grep -rn "registrations-card\|RegistrationsCard" src/ tests/` must return nothing after; `npx tsc --noEmit` clean.
- [ ] **Step 5: Run tests → PASS. Commit** — `feat(dashboard): payments summary shows real history; drop dead RegistrationsCard`

---

### Task 11: Child profile becomes class-aware

`/dashboard/children/[id]` fetches only family-members + registrations (`child-profile.tsx:87-88`); no membership, allotment, home slot, credits, kit size; its Schedule tab shows season start dates.

**Files:**
- Modify: `src/components/dashboard/child-profile.tsx`, `src/components/dashboard/child-profile-data.ts`
- Modify: `tests/unit/dashboard/child-profile-data.test.ts`
- Extend: `tests/e2e/classes-dashboard.spec.ts`

**Interfaces:**
- Consumes: `GET /api/classes/summary` (Task 1 shape) — the profile picks its child out of `children` by `familyMemberId`; `GET /api/dashboard/schedule` (Task 8) filtered client-side by `childId` for the Schedule tab.

- [ ] **Step 1: Failing unit test** — in `child-profile-data.test.ts`, add cases for a new pure helper:

```ts
import { buildClassesSection } from "@/components/dashboard/child-profile-data";

it("assembles the classes section from a summary child", () => {
  const section = buildClassesSection({
    membership: { tierName: "All-In", status: "active", classAllotmentRemaining: "unlimited",
      renewsAt: "2026-10-01T00:00:00.000Z", cancelAtPeriodEnd: false, technicalMonthlyCents: 900 },
    enrollment: { id: "e1", templateId: "t1", templateName: "U8 Wednesdays",
      weekday: 3, startTime: "17:30", creditsExpireAt: null },
    credits: [], kitSize: "YM", hasWaiverOnFile: true,
  });
  expect(section).toMatchObject({
    tierLine: "All-In · Unlimited classes this month",
    homeSlotLine: expect.stringContaining("Wednesday"),
    kitSize: "YM",
    renewsAt: "2026-10-01T00:00:00.000Z",
  });
});
it("returns null when the child has no class touchpoints", () => {
  expect(buildClassesSection({ membership: null, enrollment: null, credits: [],
    kitSize: null, hasWaiverOnFile: false })).toBeNull();
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `buildClassesSection`** in `child-profile-data.ts` (pure; weekday names via the same formatter the family card uses — extract if it's inline there). Allotment label logic matches `family-classes-card.tsx:450-453` ("N classes left this month" / "Unlimited classes this month") — import/extract that helper rather than duplicating the strings.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Wire the component** — `child-profile.tsx`: add the summary fetch alongside the existing two (`:87-88`); render a "Classes" card in Overview (above Programs) from `buildClassesSection` — tier line, home slot, kit size chip, renews-on line, waiver badge when `!hasWaiverOnFile`, "Manage" link → `/dashboard/family`. Schedule tab: fetch `/api/dashboard/schedule`, filter to this child, render dated rows (replacing only the class portion; keep league season rows beneath). `data-testid="child-classes-section"`.
- [ ] **Step 6: E2E** — extend `classes-dashboard.spec.ts`: navigate from `/dashboard/family` → child card → profile; assert `child-classes-section` shows the tier name and kit size; Schedule tab shows a dated class row. Run → PASS.
- [ ] **Step 7: Commit** — `feat(dashboard): child profile shows membership, home slot, kit size, and real class schedule`

---

### Task 12: Shell adoption for the three off-pattern pages

`/dashboard/schedule`, `/dashboard/children/[id]`, `/dashboard/children/[id]/development` bypass `DashboardShell` and each carry an inline radial-gradient `<style>` block (`schedule.astro:11-18`, `[id].astro:18-25`, `development.astro:19-26`).

**Files:**
- Modify: `src/pages/dashboard/schedule.astro`, `src/pages/dashboard/children/[id].astro`, `src/pages/dashboard/children/[id]/development.astro`

- [ ] **Step 1:** Wrap each page's content in `DashboardShell` (import pattern: `family.astro:106`), delete the inline gradient `<style>` blocks and hand-rolled breadcrumbs (the shell's `DestinationTabs` covers wayfinding; keep a simple back link on the child pages). Do NOT restyle the islands themselves — Broadsheet's dashboard wave owns that.
- [ ] **Step 2:** `npm run build` (catches Astro-level mistakes) + run `parent-dashboard`, `development-radar`, `coach-glows` specs — they navigate these pages and depend on the `ChildrenOverview` beacon; fix any selector fallout in the same commit.
- [ ] **Step 3: Commit** — `refactor(dashboard): schedule + child pages adopt DashboardShell`

---

### Task 13: Ship gate

- [ ] Full local sequence per CLAUDE.md pre-push checklist: `npm run db:seed:e2e` → API tests (`CRON_SECRET=<match> TEST_BASE_URL=http://localhost:4321 npm run test:api`) → `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test` → `npm run build` → `npx tsc --noEmit`.
- [ ] Grep `tests/e2e/` for specs touching `/dashboard` routes changed here (post-merge `test-full` job runs them unguarded — CLAUDE.md "Fix issues you notice").
- [ ] Browser pass on BOTH brands (Aspire + SoccerOne host) — greps can't see rendering; the summary endpoint and cards are org-scoped.
- [ ] PR: `feat: classes dashboard launch readiness — schedule, session management, child profiles`; note closes #608 and one #601 checkbox.

---

## Deliberately out of scope (do not gold-plate)

- League games/practices in the schedule endpoint (union type reserves room; no live game-schedule source exists for parents yet — `TeamHub.tsx:846` says "coming soon" honestly).
- Membership upgrade/downgrade flows (billing portal + choose-slot cover launch).
- `$50` annual-fee display (visible in the Stripe portal; revisit post-launch).
- Broadsheet restyling of any dashboard surface (design-system session's wave).
- `MembershipCard.tsx` (adult, `/dashboard/play`) — untouched.
