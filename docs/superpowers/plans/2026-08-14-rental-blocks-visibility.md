# Rental Blocks — Visibility Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin see rental inventory across months — answer "is Tuesday 8pm free all winter, and who else has asked for it?" — and edit the block settings that Plan 1 leaves DB-only.

**Architecture:** One org-scoped range endpoint generalizes the existing per-day ledger read, returning confirmed rentals, scheduled games, internal reserves and quote markers in a single pass. Two read-only React views consume it: a recurring-slot finder (day-of-week × weeks) and a month grid with an hour × field day drill-in. No new tables.

**Tech Stack:** Astro 5 (SSR), React 19 islands, Drizzle ORM + PostgreSQL, Vitest, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-08-14-rental-blocks-design.md` §5, §6

**Prerequisite:** `2026-08-14-rental-blocks-core.md` must be complete and merged — this plan consumes `field_rental_block_quote_slots`, the four new rate-card columns, and `fieldRentals.blockId`.

## Global Constraints

- **Worktree:** `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/rental-blocks`, branch `feat/rental-blocks`. Never switch the primary checkout.
- **Money is whole dollars.** Display `$2,808`, never `$2,808.00`. Use the same `formatDollars` helper Plan 1 Task 8 introduces.
- **Read-only.** No drag-to-create, no mutation from the calendar. The only writes in this plan are the rate-card `PUT` (Task 4).
- **Every endpoint** gates on `requireOrgAdminAccess(context)`, and any `locationId` from the request goes through `requireSameOrgLocation`.
- **All local-time arithmetic** goes through `zonedMinuteToUtc` / `tzDayBoundsUtc` from `@/lib/activity-tracking/tz-day`. Range iteration advances by calendar day, never by `24 * 3600_000`.
- **Prerender:** every page here is SSR. No `prerender = true`.
- **UI primitives:** `ErrorBanner`, `EmptyState`, `LoadingSkeleton`; top-level `client:load` islands call `useHydrationBeacon()`.
- **Multi-tenant query hazard:** any `findFirst` / `.limit(1)` needs an explicit `orderBy` — CI's shared DB has many matching rows where local has one.
- **Commit after every task.**

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/lib/scheduling/range.ts` | Ledger read over a date range for a location's venues |
| `src/pages/api/admin/rentals/calendar.ts` | `GET` range availability, org-scoped |
| `src/components/admin/rentals/RecurringSlotFinder.tsx` | Day-of-week × weeks occupancy strip |
| `src/components/admin/rentals/RentalCalendar.tsx` | Month grid + day drill-in |
| `src/pages/admin/rentals/calendar.astro` | Page hosting both views |

**Modify**

| File | Change |
|---|---|
| `src/lib/rentals/validators.ts` | Validate the four new rate-card fields |
| `src/pages/api/admin/rentals/rate-card.ts` | Persist the four new fields |
| `src/components/admin/rentals/RentalRateCardEditor.tsx` | Inputs for the four new fields |
| `src/components/dashboard/MyFieldRentals.tsx` | Group block sessions; "Pay balance" |
| `src/pages/admin/rentals/index.astro` | Link to the calendar |

---

### Task 1: Range ledger read

**Files:**
- Create: `src/lib/scheduling/range.ts`
- Test: `tests/api/rentals/blocks/calendar-range.test.ts`

**Interfaces:**
- Consumes: `resourceBlocks`, `venueResources` from `@/lib/db/schema/scheduling`; `fieldRentalBlockQuoteSlots` from `@/lib/db/schema/field-rental-blocks`.
- Produces:
  ```ts
  export interface RangeBusyBlock {
    venueId: string;
    fieldNumber: number;
    startsAt: Date;
    endsAt: Date;
    sourceType: "game" | "drop_in" | "rental" | "external" | "maintenance" | "practice";
    sourceId: string | null;
    label: string;
  }
  export interface RangeQuoteMarker {
    venueId: string; fieldNumber: number; startsAt: Date; endsAt: Date;
    blockId: string; label: string;
  }
  export async function getBusyBlocksForVenuesRange(
    venueIds: string[], fromUtc: Date, toUtc: Date,
  ): Promise<RangeBusyBlock[]>
  export async function getQuoteMarkersForVenuesRange(
    venueIds: string[], fromUtc: Date, toUtc: Date,
  ): Promise<RangeQuoteMarker[]>
  ```

- [ ] **Step 1: Write the failing test**

```ts
/**
 * Integration: the range ledger read returns rentals, games, reserves and
 * quote markers for a set of venues over a window.
 */
import { describe, it, expect, afterAll } from "vitest";
import { inArray, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { getBusyBlocksForVenuesRange, getQuoteMarkersForVenuesRange } from "@/lib/scheduling/range";
import { replaceQuoteMarkers } from "@/lib/rentals/blocks/quote-markers";
import { syncRentalBlock } from "@/lib/scheduling/sync";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID, E2E_LOCATION_ID } from "@/lib/db/seeds/seed-e2e-tests";

const FROM = new Date(Date.UTC(2044, 0, 1));
const TO = new Date(Date.UTC(2044, 1, 1));
const START = new Date(Date.UTC(2044, 0, 13, 1)); // 2044-01-12 8pm ET
const END = new Date(Date.UTC(2044, 0, 13, 2));
const rentals: string[] = [];
const blocks: string[] = [];

afterAll(async () => {
  const db = getDb();
  if (rentals.length) await db.delete(fieldRentals).where(inArray(fieldRentals.id, rentals));
  if (blocks.length) await db.delete(fieldRentalBlocks).where(inArray(fieldRentalBlocks.id, blocks));
});

describe("getBusyBlocksForVenuesRange", () => {
  it("returns a confirmed rental inside the window with its label", async () => {
    const [r] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 1,
        startsAt: START,
        endsAt: END,
        status: "confirmed",
        source: "admin_created",
        paymentMethod: "cash",
        amountDueCents: 26000,
        renterName: "Range Tester",
      })
      .returning();
    rentals.push(r.id);
    await syncRentalBlock(r.id);

    const busy = await getBusyBlocksForVenuesRange([E2E_RENTAL_VENUE_ID], FROM, TO);
    const hit = busy.find((b) => b.sourceId === r.id);
    expect(hit).toBeTruthy();
    expect(hit!.sourceType).toBe("rental");
    expect(hit!.fieldNumber).toBe(1);
    expect(hit!.startsAt.toISOString()).toBe(START.toISOString());
  });

  it("excludes blocks entirely outside the window", async () => {
    const busy = await getBusyBlocksForVenuesRange(
      [E2E_RENTAL_VENUE_ID],
      new Date(Date.UTC(2044, 5, 1)),
      new Date(Date.UTC(2044, 5, 2)),
    );
    expect(busy.every((b) => !rentals.includes(b.sourceId ?? ""))).toBe(true);
  });

  it("returns an empty array for no venues", async () => {
    expect(await getBusyBlocksForVenuesRange([], FROM, TO)).toEqual([]);
  });
});

describe("getQuoteMarkersForVenuesRange", () => {
  it("returns unexpired draft markers with their block label", async () => {
    const [b] = await getDb()
      .insert(fieldRentalBlocks)
      .values({
        organizationId: E2E_ORG_ID,
        locationId: E2E_LOCATION_ID,
        label: "Range Quote Team",
        renterName: "Range Quote Team",
        status: "draft",
      })
      .returning();
    blocks.push(b.id);
    await replaceQuoteMarkers(
      b.id,
      [{ venueId: E2E_RENTAL_VENUE_ID, fieldNumber: 1, startsAt: START, endsAt: END }],
      14,
    );

    const markers = await getQuoteMarkersForVenuesRange([E2E_RENTAL_VENUE_ID], FROM, TO);
    const hit = markers.find((m) => m.blockId === b.id);
    expect(hit?.label).toBe("Range Quote Team");
  });

  it("ignores expired markers", async () => {
    const id = blocks[blocks.length - 1];
    await getDb()
      .update(fieldRentalBlocks)
      .set({ updatedAt: new Date() })
      .where(eq(fieldRentalBlocks.id, id));
    // Expire by rewriting with a negative TTL.
    await replaceQuoteMarkers(
      id,
      [{ venueId: E2E_RENTAL_VENUE_ID, fieldNumber: 1, startsAt: START, endsAt: END }],
      -1,
    );
    const markers = await getQuoteMarkersForVenuesRange([E2E_RENTAL_VENUE_ID], FROM, TO);
    expect(markers.some((m) => m.blockId === id)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

```bash
cd /Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/rental-blocks
./scripts/with-bws.sh npx vitest run tests/api/rentals/blocks/calendar-range.test.ts
```

Expected: FAIL — cannot resolve `@/lib/scheduling/range`.

- [ ] **Step 3: Implement**

Create `src/lib/scheduling/range.ts`. `getBusyBlocksForVenuesRange` joins `resourceBlocks` → `venueResources` filtered by `inArray(venueResources.venueId, venueIds)`, overlap (`startsAt < toUtc AND endsAt > fromUtc`), and excludes expired holds (`expiresAt IS NULL OR expiresAt >= now()`) — the same freshness rule `assertNoBlockConflict` applies. Map rows to `RangeBusyBlock` using `venueResources.fieldNumber`. Return `[]` early when `venueIds` is empty (an empty `inArray` generates invalid SQL).

`getQuoteMarkersForVenuesRange` joins `fieldRentalBlockQuoteSlots` → `fieldRentalBlocks`, filtered to `status = 'draft'`, `expiresAt > now()`, and the same overlap window.

Model both on the existing `getBlocksForVenueDay` (`src/lib/scheduling/blocks.ts:269`) — same shape, wider window, several venues.

- [ ] **Step 4: Run the test to verify it passes**

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduling/range.ts tests/api/rentals/blocks/calendar-range.test.ts
git commit -m "feat(scheduling): range ledger read for the admin rental calendar"
```

---

### Task 2: Calendar endpoint

**Files:**
- Create: `src/pages/api/admin/rentals/calendar.ts`
- Test: `tests/api/rentals/blocks/calendar-endpoint.test.ts`

**Interfaces:**
- Consumes: Task 1's two functions; `getRentalVenuesByLocation` from `@/lib/soccerone/venues`; `tzDayBoundsUtc`.
- Produces: `GET /api/admin/rentals/calendar?locationId=&from=YYYY-MM-DD&to=YYYY-MM-DD` →
  ```ts
  {
    timeZone: string,
    venues: Array<{ id: string; name: string; fieldNumbers: number[] }>,
    busy: Array<{ venueId, fieldNumber, startsAt, endsAt, sourceType, sourceId, label }>,
    quotes: Array<{ venueId, fieldNumber, startsAt, endsAt, blockId, label }>,
  }
  ```

- [ ] **Step 1: Write the failing test**

Cover: 200 with `venues`/`busy`/`quotes` and the org timezone for a valid range; 400 on a malformed `from`/`to` or when `to < from`; 400 when the range exceeds 120 days (a guard against someone requesting a decade); 403/404 for a location in another org; 401/403 for a non-admin.

- [ ] **Step 2: Run it and confirm 404**

```bash
CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/blocks/calendar-endpoint.test.ts
```

- [ ] **Step 3: Implement**

Standard admin-endpoint shape (see `src/pages/api/admin/rentals/rate-card.ts`): `requireOrgAdminAccess`, then `requireSameOrgLocation(orgId, locationId)`. Convert `from`/`to` to UTC bounds with `tzDayBoundsUtc(from, tz).startUtc` and `tzDayBoundsUtc(to, tz).endUtc` using the org timezone from `locals.organization?.timezone ?? "America/New_York"`. Resolve the location's rental-enabled venues, gather each venue's top-level `fieldNumbers` from `venueResources` (falling back to `[1]` when a venue has no resource rows, matching `availability.ts`), then call both range reads once each.

- [ ] **Step 4: Run the test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/rentals/calendar.ts tests/api/rentals/blocks/calendar-endpoint.test.ts
git commit -m "feat(rentals): org-scoped range availability endpoint for the admin calendar"
```

---

### Task 3: Recurring-slot finder and month grid

**Files:**
- Create: `src/components/admin/rentals/RecurringSlotFinder.tsx`
- Create: `src/components/admin/rentals/RentalCalendar.tsx`
- Create: `src/pages/admin/rentals/calendar.astro`
- Modify: `src/pages/admin/rentals/index.astro`

**Interfaces:**
- Consumes: `GET /api/admin/rentals/calendar` (Task 2).

- [ ] **Step 1: Build `RecurringSlotFinder`**

Props: `{ locations: LocationOption[]; timeZone: string }`. Controls: location select, day-of-week select, start time, duration, first/last date. On submit, fetch the calendar range once and render **one strip per venue/field**, one cell per matching week:

```
Worthington · Tue · 8–9pm · Jan 6 – Mar 24
  Orange  ●●●●●○●●△●●●    9 open · 1 game · 1 quoted
  Blue    ●●●●●●●●●●●●   12 open
  Yellow  ■■■■■■■■■■■■   reserved — winter league
```

Cell state is derived client-side by intersecting each candidate week's UTC window (computed with the same `generateBlockSessions` helper from Plan 1 Task 2, so the finder and the builder can never disagree about which instants a pattern means) against `busy` and `quotes`. Legend: `●` open, `○` booked rental, `△` quoted, `■` reserved/game. Each glyph carries a `title` **and** an `aria-label` naming the date and reason — glyph-only status is not accessible on its own. Hovering a cell shows the conflicting label.

Below the strips, a "Build a block from this slot" link to `/admin/rentals/blocks/new` with the pattern pre-filled via query params.

- [ ] **Step 2: Build `RentalCalendar`**

Props: `{ locations: LocationOption[]; timeZone: string }`. Month grid per location: 7-column day cells, each showing a small per-field fill bar for the prime-time window (6pm–midnight local) and the count of open hours. Prev/next month advances by calendar month, not by adding days. Clicking a day expands an hour × field detail table for that day, hours from the venues' `rentalOpenMinute`/`rentalCloseMinute` (fall back to 16:00–24:00 local, the facility's stated window). Both views share one fetch per visible range.

- [ ] **Step 3: Build the page and link it**

`src/pages/admin/rentals/calendar.astro` extends `BaseLayout`, no `prerender`, loads locations in frontmatter, mounts both islands `client:load` with the finder first (it answers the winter question). Add a link to `/admin/rentals/calendar` in `src/pages/admin/rentals/index.astro` next to the Blocks link.

- [ ] **Step 4: Verify in a browser**

```bash
npm run dev:bws
```

Sign in as `admin@test.aspiresports.com` / `TestAdmin123!`, open `/admin/rentals/calendar`. Confirm: the finder renders one strip per field with correct open counts against a slot you know is booked; the month grid paints fill bars and the day drill-in lists hours; glyph colours are legible in both brand themes (SoccerOne's `BrandTheme` inverts the Aspire tokens — re-pin token values on the container if anything washes out, and never use an accent token as a text colour).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/rentals/RecurringSlotFinder.tsx src/components/admin/rentals/RentalCalendar.tsx src/pages/admin/rentals/calendar.astro src/pages/admin/rentals/index.astro
git commit -m "feat(rentals): recurring-slot finder and month availability grid"
```

---

### Task 4: Rate-card fields

**Files:**
- Modify: `src/lib/rentals/validators.ts`
- Modify: `src/pages/api/admin/rentals/rate-card.ts`
- Modify: `src/components/admin/rentals/RentalRateCardEditor.tsx`
- Test: `tests/api/rentals/rate-card.test.ts` (extend the existing file)

**Interfaces:**
- Produces: `RentalRateCardPutBody` gains `depositPct`, `balanceDueLeadDays`, `blockHoldHours`, `quoteMarkerTtlDays`.

- [ ] **Step 1: Extend the existing test**

Add cases to `tests/api/rentals/rate-card.test.ts`:

```ts
it("persists the block settings", async () => {
  const res = await apiFetch("/api/admin/rentals/rate-card", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      ...validBase,
      depositPct: 30,
      balanceDueLeadDays: 21,
      blockHoldHours: 48,
      quoteMarkerTtlDays: 10,
    }),
  });
  expect(res.status).toBe(200);
  const { rateCard } = await res.json();
  expect(rateCard).toMatchObject({
    depositPct: 30, balanceDueLeadDays: 21, blockHoldHours: 48, quoteMarkerTtlDays: 10,
  });
});

it("rejects a deposit percent outside 0-100", async () => {
  const res = await apiFetch("/api/admin/rentals/rate-card", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ ...validBase, depositPct: 130 }),
  });
  expect(res.status).toBe(400);
});

it("rejects a non-integer hold window", async () => {
  const res = await apiFetch("/api/admin/rentals/rate-card", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ ...validBase, blockHoldHours: 12.5 }),
  });
  expect(res.status).toBe(400);
});
```

Reuse whatever the existing file already names as its valid baseline body; if it builds the body inline, extract it to a `validBase` const in this step.

- [ ] **Step 2: Run it and confirm failure**

```bash
CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/rentals/rate-card.test.ts
```

Expected: the three new cases FAIL (fields dropped / not validated).

- [ ] **Step 3: Implement**

In `validateRentalRateCardPut`, validate: `depositPct` integer 0–100; `balanceDueLeadDays` integer 0–180; `blockHoldHours` integer 1–336; `quoteMarkerTtlDays` integer 1–90. Follow the existing per-field style in that function exactly. Add the four to the `PUT` upsert set. In `RentalRateCardEditor.tsx`, add a "Recurring blocks" fieldset with four number inputs (`step="1"`), each with the helper text explaining what it controls — e.g. *"Deposit percent — what a renter pays to hold a whole block. The builder can override this per deal."*

- [ ] **Step 4: Run the test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/lib/rentals/validators.ts src/pages/api/admin/rentals/rate-card.ts src/components/admin/rentals/RentalRateCardEditor.tsx tests/api/rentals/rate-card.test.ts
git commit -m "feat(rentals): rate-card controls for deposit percent, balance lead, and hold windows"
```

---

### Task 5: Renter dashboard grouping

**Files:**
- Modify: `src/components/dashboard/MyFieldRentals.tsx`
- Modify: whichever endpoint feeds it (find with `grep -rn "MyFieldRentals" src/pages`)
- Test: `tests/api/rentals/blocks/dashboard.test.ts`

- [ ] **Step 1: Write the failing test**

Assert that the dashboard rentals endpoint, for a user who owns a block, returns the block's sessions grouped under a `block` object carrying `{ id, label, totalCents, depositDueCents, balanceDueCents, balanceDueAt, owed }`, that standalone rentals still come back ungrouped, and that a user never sees another user's block.

- [ ] **Step 2: Run it and confirm failure**

- [ ] **Step 3: Implement**

Extend the endpoint's select with `blockId` and left-join the block row. In `MyFieldRentals.tsx`, render one card per block — label, session count, date range, amount owed — with a `Pay balance` button linking to the tokenized page (mint on demand through the existing `deposit-link`/`balance-link` admin path is admin-only; for the renter, link to `/rentals/blocks/{token}` using a token minted by the dashboard endpoint, reusing `mintBlockToken` from Plan 1 Task 11 — `mintToken` returns the existing live token, so this does not proliferate tokens). Sessions inside a block list compactly beneath. Standalone rentals keep their current rendering untouched.

- [ ] **Step 4: Run the test to verify it passes**

- [ ] **Step 5: Verify in a browser**

Sign in as `parent@test.aspiresports.com` / `TestParent123!` (attach a block to that user first via `renterUserId`), open `/dashboard`, and confirm the block card renders with a working Pay balance link.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/MyFieldRentals.tsx src/pages/api/ tests/api/rentals/blocks/dashboard.test.ts
git commit -m "feat(dashboard): group block sessions with a pay-balance action"
```

---

### Task 6: Pre-push verification

- [ ] **Step 1: Re-seed and run the API suite**

```bash
cd /Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/rental-blocks
npm run db:seed:e2e
CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npm run test:api
```

`CRON_SECRET` must match the running dev server's, or cron tests fail with spurious 401s.

- [ ] **Step 2: Run the rental E2E specs**

```bash
PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/rental-blocks.spec.ts tests/e2e/field-rentals.spec.ts tests/e2e/soccerone-rental-pricing.spec.ts
```

These run post-merge only in CI (`test-full`), so they will not gate the PR — run them by hand.

- [ ] **Step 3: Build and type check**

```bash
npm run build
npx tsc --noEmit
```

Zero TS errors. Ignore `Astro.request.headers is not available on prerendered pages` warnings — known middleware false positives.

- [ ] **Step 4: Commit and push**

```bash
git push origin feat/rental-blocks
```

Not done until CI is green on the pushed commit.

---

## Self-Review

**Spec coverage.** §5's range endpoint → Task 2, built on Task 1. Recurring-slot finder → Task 3. Month grid with day drill-in → Task 3. Quote markers and internal reserves appearing in the same picture as rentals → Tasks 1–3. §6's rate-card fields → Task 4. §6's dashboard grouping with Pay balance → Task 5. Read-only-in-v1 → enforced in Global Constraints; no mutation endpoints added beyond the rate-card `PUT`.

**Type consistency.** `RangeBusyBlock` / `RangeQuoteMarker` are defined once in Task 1 and serialized unchanged by Task 2's endpoint; Task 3 consumes that JSON shape. The finder reuses `generateBlockSessions` from Plan 1 Task 2 rather than re-deriving pattern instants, so finder and builder cannot disagree. `mintBlockToken` is Plan 1 Task 11's export, reused in Task 5.

**Placeholder scan.** No TBDs. Task 5's "whichever endpoint feeds it" names the exact `grep` that resolves it, because the dashboard's data route is not fixed by the spec. Task 4's `validBase` is defined in its own step rather than assumed.
