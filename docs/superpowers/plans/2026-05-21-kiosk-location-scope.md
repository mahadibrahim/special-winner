# Kiosk Location-Scope + "Space" Relabel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-scope the kiosk from a single venue to the whole facility (location), relabel "Venue" → "Space" in the UI, and retire the venue-level kiosk slug added in PR #116.

**Architecture:** The kiosk resolves a `location` (facility) by its existing `locations.slug`. Every kiosk endpoint lists/searches across all `venues` in that location. The `venues` table and `venueId` code identifiers are unchanged — only user-facing labels become "Space".

**Tech Stack:** Astro 5 SSR, React 19, Drizzle ORM (Postgres), Vitest (API tests over HTTP), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-05-21-kiosk-location-scope-design.md`

**Note — this is a structural refactor.** The kiosk route path, resolver, and endpoint queries are interlocking; tasks are "change → verify it compiles/tests → commit" rather than pure red-green. The existing `tests/api/kiosk/walkin.test.ts` is updated in Task 7 and must pass at the end.

---

## File Structure

**Modified — kiosk re-scope (Part 1):**
- `src/lib/check-in/kiosk-auth.ts` — `requireKioskVenue` → `requireKioskLocation`.
- `src/pages/kiosk/[venueSlug]/` → `src/pages/kiosk/[locationSlug]/` (folder rename) — `index.astro`.
- `src/pages/api/kiosk/[venueSlug]/` → `src/pages/api/kiosk/[locationSlug]/` (folder rename) — `sessions.ts`, `search.ts`, `token-for-target.ts`, `walkin/start.ts`, `walkin/payment.ts`.
- `src/components/kiosk/KioskLanding.tsx`, `FindBooking.tsx`, `WalkInWizard.tsx` — `venueSlug` prop → `locationSlug`.

**Modified — relabel (Part 2):**
- `src/components/admin/venues-list.tsx`, `src/pages/admin/locations/index.astro`, `src/components/dropin/SessionList.tsx`.

**Modified — retire venue slug (Part 3):**
- `src/components/admin/venues-list.tsx`, `src/pages/api/admin/venues.ts`.

**Modified — tests:**
- `tests/api/kiosk/walkin.test.ts`, `tests/e2e/check-in-flow.spec.ts`.

**Unchanged:** `venues` table (`src/lib/db/schema/teams.ts`), all `venueId` columns, `venues.slug` column (left dormant). No migration.

---

## Task 1: `requireKioskLocation` resolver

**Files:**
- Modify: `src/lib/check-in/kiosk-auth.ts` (full rewrite of the file)

- [ ] **Step 1: Rewrite `kiosk-auth.ts` to resolve a location**

```ts
/**
 * Resolve a kiosk URL segment to its facility (location). The segment is
 * either the location's human-friendly `slug` (e.g. /kiosk/worthington)
 * or its UUID — both resolve, so older UUID kiosk URLs keep working. The
 * segment isn't a secret; it scopes every kiosk query to one facility.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { locations } from "@/lib/db/schema/organizations";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Mirrors the slug format the locations admin editor produces.
const SLUG_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

function notFound() {
  return {
    ok: false as const,
    response: new Response(JSON.stringify({ error: "Kiosk not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }),
  };
}

export async function requireKioskLocation(slug: string) {
  const isUuid = UUID_RX.test(slug);
  if (!isUuid && !SLUG_RX.test(slug)) return notFound();

  const [row] = await getDb()
    .select({
      id: locations.id,
      name: locations.name,
      active: locations.active,
      organizationId: locations.organizationId,
      timezone: locations.timezone,
    })
    .from(locations)
    .where(
      isUuid ? eq(locations.id, slug) : eq(locations.slug, slug.toLowerCase()),
    )
    .limit(1);
  if (!row || !row.active) return notFound();
  return { ok: true as const, location: row };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit` — expect errors only in the kiosk endpoint files that still import `requireKioskVenue` (fixed in Task 2). No error inside `kiosk-auth.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/lib/check-in/kiosk-auth.ts
git commit -m "refactor(kiosk): resolve a location instead of a venue"
```

---

## Task 2: Rename route folders, swap resolver in every endpoint

The kiosk endpoints must move to `[locationSlug]` and call `requireKioskLocation`. `walkin/payment.ts` and `token-for-target.ts` need only this mechanical swap; `sessions.ts`, `search.ts`, `walkin/start.ts` get their query logic changed in Tasks 3–5.

**Files:**
- Rename: `src/pages/kiosk/[venueSlug]/` → `src/pages/kiosk/[locationSlug]/`
- Rename: `src/pages/api/kiosk/[venueSlug]/` → `src/pages/api/kiosk/[locationSlug]/`

- [ ] **Step 1: Rename both folders with git**

```bash
git mv src/pages/kiosk/[venueSlug] src/pages/kiosk/[locationSlug]
git mv src/pages/api/kiosk/[venueSlug] src/pages/api/kiosk/[locationSlug]
```

- [ ] **Step 2: In every endpoint file, swap the param name and resolver**

In each of `sessions.ts`, `search.ts`, `token-for-target.ts`, `walkin/start.ts`, `walkin/payment.ts` and the page `index.astro`:
- Replace `params.venueSlug` → `params.locationSlug`.
- Replace `import { requireKioskVenue }` → `import { requireKioskLocation }`.
- Replace the call `requireKioskVenue(slug)` → `requireKioskLocation(slug)`.
- Rename the result variable: `requireKioskVenue` returned `{ ok, venue }`; `requireKioskLocation` returns `{ ok, location }`. Update destructuring (`const { venue }` → `const { location }`) and downstream references. In `token-for-target.ts` and `walkin/payment.ts`, replace `venue.organizationId` → `location.organizationId` and `venue.id` (where it scoped the kiosk) per Tasks 3–5; for `walkin/payment.ts` the venue used for the partner Stripe split is still derived from the booking's session (the existing `venueRow` query by `booking.sessionId`'s venue) — keep that, it does not depend on the kiosk slug.

- [ ] **Step 3: `walkin/payment.ts` — confirm no kiosk-venue dependency remains**

`walkin/payment.ts` currently calls `requireKioskVenue` only to get `venue.id`/`venue.organizationId`. After the swap it uses `requireKioskLocation` purely to authorize the kiosk (valid location) — the booking, session, and partner venue are all derived from the token's `targetId`. Verify the partner-Stripe `venueRow` query keys off the **session's** `venueId`, not the kiosk param.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit` — expect remaining type errors only where Tasks 3–5 still reference `venue.id` for scoping. If `sessions.ts`/`search.ts`/`walkin/start.ts` are not yet done, that is expected; `token-for-target.ts` and `walkin/payment.ts` must be clean.

- [ ] **Step 5: Commit**

```bash
git add -A src/pages/kiosk src/pages/api/kiosk
git commit -m "refactor(kiosk): move routes to [locationSlug], use location resolver"
```

---

## Task 3: `sessions.ts` — list sessions across the whole facility

**Files:**
- Modify: `src/pages/api/kiosk/[locationSlug]/sessions.ts`

- [ ] **Step 1: Replace the venue-scoped query with a location-scoped one**

Import `venues` from `@/lib/db/schema/teams`. Replace the `sessions` query so it joins `venues` and filters by `locationId`, and add the space name to the select:

```ts
const sessions = await getDb()
  .select({
    id: dropInSessions.id,
    startsAt: dropInSessions.startsAt,
    endsAt: dropInSessions.endsAt,
    title: dropInSessions.sportOrClassLabel,
    format: dropInSessions.formatLabel,
    capacity: dropInSessions.capacity,
    sessionRateCents: dropInSessions.sessionRateCents,
    spaceName: venues.name,
  })
  .from(dropInSessions)
  .innerJoin(venues, eq(venues.id, dropInSessions.venueId))
  .where(
    and(
      eq(venues.locationId, location.id),
      eq(dropInSessions.status, "scheduled"),
      gte(dropInSessions.startsAt, dayStart),
      lt(dropInSessions.startsAt, dayEnd),
    ),
  )
  .orderBy(dropInSessions.startsAt);
```

- [ ] **Step 2: Add `spaceName` to the JSON response**

In the `sessions.map(...)` response builder, add `spaceName: s.spaceName` to each returned object.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — `sessions.ts` must be clean.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/kiosk/[locationSlug]/sessions.ts
git commit -m "feat(kiosk): list today's sessions across all spaces in the facility"
```

---

## Task 4: `search.ts` — search bookings across the whole facility

**Files:**
- Modify: `src/pages/api/kiosk/[locationSlug]/search.ts`

- [ ] **Step 1: Re-scope the drop-in booking query**

The drop-in query currently filters `eq(dropInSessions.venueId, venue.id)`. Change it to filter by location: `eq(venues.locationId, location.id)`, joining `venues`. Import `venues` from `@/lib/db/schema/teams`:

```ts
.from(dropInBookings)
.innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
.innerJoin(venues, eq(venues.id, dropInSessions.venueId))
.innerJoin(users, eq(users.id, dropInBookings.userId))
.where(
  and(
    eq(venues.locationId, location.id),
    eq(dropInBookings.status, "confirmed"),
    gte(dropInSessions.startsAt, todayStart),
    lt(dropInSessions.startsAt, todayEnd),
    or(/* unchanged name/phone matchers */),
  ),
)
```

- [ ] **Step 2: Re-scope the field-rental query**

`fieldRentals` has `venueId`. Add `.innerJoin(venues, eq(venues.id, fieldRentals.venueId))` and change `eq(fieldRentals.venueId, venue.id)` → `eq(venues.locationId, location.id)`.

- [ ] **Step 3: Keep the venue-timezone formatting working**

`search.ts` formats result times with `venue.timezone` today. `requireKioskLocation` returns `location.timezone` — use `location.timezone ?? "America/New_York"` for the `tz` used by `fmtTime`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — `search.ts` must be clean.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/kiosk/[locationSlug]/search.ts
git commit -m "feat(kiosk): search bookings across all spaces in the facility"
```

---

## Task 5: `walkin/start.ts` — validate the session belongs to the facility

`walkin/start.ts` currently checks `session.venueId !== venue.id`. With a location-scoped kiosk, the chosen session may be in any venue of the location.

**Files:**
- Modify: `src/pages/api/kiosk/[locationSlug]/walkin/start.ts`

- [ ] **Step 1: Replace the venue-match check with a location-match check**

After loading the session, load its venue and confirm the venue's `locationId` matches the kiosk location. Replace the existing `if (session.venueId !== venue.id) return json({ error: "Session not at this venue" }, 422);` block with:

```ts
const [sessionVenue] = await db
  .select({ locationId: venues.locationId })
  .from(venues)
  .where(eq(venues.id, session.venueId))
  .limit(1);
if (!sessionVenue || sessionVenue.locationId !== location.id) {
  return json({ error: "Session is not at this facility" }, 422);
}
```

Import `venues` from `@/lib/db/schema/teams` if not already imported.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` — `walkin/start.ts` must be clean. The whole `src/pages/api/kiosk` tree should now type-check.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/kiosk/[locationSlug]/walkin/start.ts
git commit -m "feat(kiosk): accept walk-in sessions from any space in the facility"
```

---

## Task 6: Kiosk React components — location prop + space labels

**Files:**
- Modify: `src/pages/kiosk/[locationSlug]/index.astro`
- Modify: `src/components/kiosk/KioskLanding.tsx`, `FindBooking.tsx`, `WalkInWizard.tsx`

- [ ] **Step 1: `index.astro` — resolve the location**

The page already calls the resolver (swapped in Task 2). Rename the local `venueName`/`venueSlug` variables to `locationName`/`locationSlug`, set `locationName` from `k.location.name`, and pass `locationSlug={slug}` / `locationName={locationName}` to `<KioskLanding>`. Update the `<BaseLayout title=...>` to use the location name.

- [ ] **Step 2: `KioskLanding.tsx` — rename the prop**

Rename the `venueSlug`/`venueName` props to `locationSlug`/`locationName` throughout the component, and pass `locationSlug`/`locationName` down to `<FindBooking>` and `<WalkInWizard>`.

- [ ] **Step 3: `FindBooking.tsx` — rename the prop, keep behavior**

Rename `venueSlug` → `locationSlug`. The fetch URLs become `/api/kiosk/${locationSlug}/search` and `/api/kiosk/${locationSlug}/token-for-target`. No other change — search results already render `r.subtitle`, which Task 4 keeps populated.

- [ ] **Step 4: `WalkInWizard.tsx` — rename the prop, show the space per session**

Rename `venueSlug` → `locationSlug` (fetch URLs `/api/kiosk/${locationSlug}/...`). Add `spaceName: string` to the `Session` interface. In `SessionStep`, render `s.spaceName` under the session title so a walk-in sees which space each session is in, e.g.:

```tsx
<div className="text-sm text-ink-muted mt-1">
  {s.spaceName} · {new Date(s.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
  {" – "}
  {new Date(s.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
</div>
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — zero errors across the whole repo.

- [ ] **Step 6: Commit**

```bash
git add src/pages/kiosk src/components/kiosk
git commit -m "feat(kiosk): location-scoped kiosk UI, label sessions by space"
```

---

## Task 7: Update kiosk tests for location scope

**Files:**
- Modify: `tests/api/kiosk/walkin.test.ts`
- Modify: `tests/e2e/check-in-flow.spec.ts`

- [ ] **Step 1: Read both test files and the e2e seed**

Read `tests/api/kiosk/walkin.test.ts`, `tests/e2e/check-in-flow.spec.ts`, and `src/lib/db/seeds/seed-e2e-tests.ts`. Identify how each currently obtains the kiosk URL segment (a venue id/slug today) and which seeded location/venue they use.

- [ ] **Step 2: Point the tests at the location**

Change every kiosk URL in both files from the venue segment to the **location** segment — the seeded location's `slug` (or id). The walk-in endpoints are now `/api/kiosk/{locationSlug}/walkin/...`.

- [ ] **Step 3: Add a multi-space assertion to the API test**

In `tests/api/kiosk/walkin.test.ts`, add a case: `GET /api/kiosk/{locationSlug}/sessions` returns sessions from **more than one venue** of that location when the seed has them, and each session object has a non-empty `spaceName`. If the e2e seed has only one venue per location, add a second venue + a session under the test location in `seed-e2e-tests.ts` first, then re-seed with `npm run db:seed:e2e`.

- [ ] **Step 4: Run the API tests**

Start the dev server (`R2_MOCK=1 CRON_SECRET=devtest npm run dev`), then:
Run: `CRON_SECRET=devtest TEST_BASE_URL=http://localhost:4321 npm run test:api -- kiosk`
Expected: PASS.

- [ ] **Step 5: Run the e2e check-in flow**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- check-in-flow`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/ src/lib/db/seeds/seed-e2e-tests.ts
git commit -m "test(kiosk): cover location-scoped sessions and search"
```

---

## Task 8: Relabel "Venue" → "Space" in the UI

Labels only — no table, column, route param, or query-string key changes.

**Files:**
- Modify: `src/pages/admin/locations/index.astro`
- Modify: `src/components/admin/venues-list.tsx`
- Modify: `src/components/dropin/SessionList.tsx`

- [ ] **Step 1: `locations/index.astro`**

- Tab label: `{ id: "venues", label: "Venues" }` → `{ id: "venues", label: "Spaces" }` (keep `id: "venues"` — it is the `?tab=` key).
- `<BaseLayout title="Locations & venues — Admin — Aspire Sports">` → `"Locations & spaces — Admin — Aspire Sports"`.
- `<h1>Locations & venues</h1>` → `<h1>Locations & spaces</h1>`.

- [ ] **Step 2: `venues-list.tsx` — swap visible strings**

Replace user-visible text only: heading "Venues" → "Spaces"; the description "Manage the venues and facilities for your programs" → "Manage the spaces within your facilities"; "Add Venue" / "Add Your First Venue" → "Add Space" / "Add Your First Space"; "No venues configured yet" → "No spaces configured yet"; dialog titles "Add Venue"/"Edit Venue" → "Add Space"/"Edit Space"; dialog descriptions referencing "venue" → "space"; "Venue Name" label → "Space Name"; the delete-confirm "Delete venue?" → "Delete space?"; toast `Deleted "..."` copy unchanged (uses the name). Leave the component name `VenuesList`, props, state, and the `/api/admin/venues` URL unchanged.

- [ ] **Step 3: `SessionList.tsx` — dropin filter label**

The filter label text `Venue` (around line 158) → `Space`. Leave the `venueId` state and the `venue` query-string key unchanged.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — zero errors. Run `npm run build` — succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/locations/index.astro src/components/admin/venues-list.tsx src/components/dropin/SessionList.tsx
git commit -m "refactor(ui): relabel \"Venue\" to \"Space\" in admin and drop-in filter"
```

---

## Task 9: Retire the venue-level kiosk slug from PR #116

**Files:**
- Modify: `src/components/admin/venues-list.tsx`
- Modify: `src/pages/api/admin/venues.ts`

- [ ] **Step 1: Remove the slug field from the venue form**

In `venues-list.tsx`: remove `slug` from the `Venue` interface, from `formData` state (the initial `useState`, the `openCreateDialog` reset, and the `openEditDialog` populate — all three), and delete the entire "Kiosk URL slug" form `<div>` block (label, `<Input id="slug">`, helper `<p>`).

- [ ] **Step 2: Remove `slug` from the venues API**

In `src/pages/api/admin/venues.ts`: remove the `slug` key from the `venueSchema` Zod object; remove `slug: venues.slug` from **both** GET `.select({...})` blocks (the `scope=all` one and the org-scoped one); remove the `23505` unique-violation catch blocks added for the slug (the `error.code === "23505"` branches in POST and PUT) — a slug collision is no longer possible.

- [ ] **Step 3: Leave the column in place**

Do **not** touch `src/lib/db/schema/teams.ts` — `venues.slug` stays defined in the Drizzle schema and in the database as a dormant, unreferenced column. No migration. (`db:generate` produces nothing because schema and DB still agree.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — zero errors. Run `npm run build` — succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/venues-list.tsx src/pages/api/admin/venues.ts
git commit -m "chore(kiosk): drop the unused venue-level kiosk slug field"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Type check + build**

Run: `npx tsc --noEmit` (zero errors) and `npm run build` (succeeds).

- [ ] **Step 2: Seed and run the API + e2e suites**

With the dev server up: `npm run db:seed:e2e`, then `CRON_SECRET=devtest TEST_BASE_URL=http://localhost:4321 npm run test:api` and `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test`. All pass.

- [ ] **Step 3: Drive the kiosk for a multi-space facility**

Set two venues under one test location, each with a `scheduled` drop-in session today. Open `/kiosk/{location-slug}`:
- Walk-in registration → the session picker lists sessions from **both** spaces, each labeled with its space name.
- Complete a walk-in into a session in the second space → reaches the payment step.
- "Find my booking" → searches across both spaces.
- Confirm `/kiosk/{location-uuid}` also resolves, and a bad slug shows "Kiosk not configured".

- [ ] **Step 4: Visual check of the relabel**

`/admin/locations` shows a "Spaces" tab; the venue form reads "Space Name" and has no "Kiosk URL slug" field; the `/dropin` filter reads "Space".

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A && git commit -m "fix(kiosk): address verification findings"
```

---

## Done criteria

- `/kiosk/{location-slug}` resolves a facility; sessions and search span every space in it; UUID URLs still work.
- Walk-in registration works for a session in any space of the facility.
- Admin and the drop-in filter say "Space"; no "Kiosk URL slug" field remains.
- `tsc` and `build` clean; API + e2e suites pass.
- No migration; `venues.slug` left dormant.
