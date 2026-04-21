# Season Scaffolding (Clone + Bulk-Create)

**Date:** 2026-04-21
**Status:** Design approved, ready for implementation plan

## Problem

Creating a new season today requires three separate admin flows: create the season, then open the teams page, then create each team one-by-one via a dialog. A typical program runs 3–5 age-group seasons per cycle (e.g. Fall 2025 Soccer U8, U10, U12, U14), each with 4–8 teams — 12–40 manual team entries, most of which mirror the prior cycle.

There is no `clone`, `duplicate`, or bulk-create path anywhere in the admin UI or API. Every POST creates one entity. Admins also have no way to set a season's venue until they schedule individual games — which matters because parents register based on venue and the eventual auto-scheduler needs venue as an input.

## Goal

Collapse season setup into a single form. Give admins three ways to populate a new season's teams — clone from a prior season, bulk-create N teams, or start empty — and capture the season's venue at creation time so it's available to registration UI and future auto-scheduling.

## Non-goals (v1)

- Cloning game schedules (too date-dependent)
- Reusable named templates ("My U10 Standard Setup") — revisit if the pattern emerges
- Roster or player carryover with age graduation — separate, larger feature
- Per-clone toggles for what copies — revisit if defaults don't match reality
- Program-level "clone all seasons of this program at once" (option C from brainstorming) — scope creep; single-season clone covers 90% of the need
- Team-level home venues (different teams in one season playing at different venues) — YAGNI for Aspire's model
- Auto-scheduler, public program-card venue rendering — downstream consumers of `seasons.venueId`, not this feature

## Data model background

Two facts that shape the design:

1. **Each season has at most one age group.** `seasons.ageGroupId` is nullable but singular. The admin model that matches this is: "Fall 2025 Soccer U8" and "Fall 2025 Soccer U10" are two separate seasons. Teams inherit the season's age group (teams themselves have no `ageGroupId`). This means bulk-create within one season is just "how many teams?" — a single integer — not a per-age-group grid.
2. **Location ≠ venue.** `programs.locationId` points to an organizational branch (Powell, Dublin). `venues` are physical facilities belonging to a location (Powell Park, Powell Soccer Complex). Games already carry `venueId`; media shoots already carry `venueId`. Seasons do not — which is the gap this feature closes.

## Design

### One flow, three starting options

Replace the current plain create-season form (at `/admin/seasons` → `seasons-list.tsx`) with a form that has a **"Starting structure"** picker at the top. Three options:

1. **Clone from previous season.** Picker lists prior seasons for the selected program, sorted newest-first. Selected by default if any exist. When chosen, pulls the source season's pricing, max participants, venue, and structural settings into the form as defaults (admin can override). On save, clones the team list + coach assignments.
2. **Bulk-create teams.** A single integer input ("Create N teams"). Auto-generates team names using the pattern `"{Program} {AgeGroup} Team {N}"` (e.g. `"Soccer U10 Team 1"`) — or `"{Program} Team {N}"` if the season has no age group. Admin renames later.
3. **Empty season.** Creates the season shell with no teams. For unusual cases.

**Default selection:** #1 if prior seasons exist for this program, otherwise #2 with `count` defaulting to `0` (admin types the number they want).

### New schema field: `seasons.venueId`

Add one column to the `seasons` table:

```sql
ALTER TABLE seasons ADD COLUMN venue_id uuid REFERENCES venues(id) ON DELETE SET NULL;
```

Drizzle definition:

```ts
// src/lib/db/schema/programs.ts
venueId: uuid("venue_id").references(() => venues.id, { onDelete: "set null" }),
```

Nullable — doesn't break existing rows, and a season can still be created without a venue (carryover behavior for legacy seasons). This introduces a cross-schema-file reference: `programs.ts` references `venues` which is defined in `teams.ts`. That's already the pattern Drizzle uses here (e.g. `media.ts` → `venues`), no new precedent.

### What clone copies

Two layers, handled separately:

**Season-level fields** always come from the top-level request body. The UI pre-fills them from the source season for admin convenience. This means the admin sees and can edit pricing, `maxParticipants`, `venueId`, `settings`, and `scheduleNotes` before submit — no hidden copies. Dates, registration window, and `status` are blank / `draft` in the pre-fill regardless of source.

**Team-level scaffolding** is what the `scaffold.type === "clone"` path actually copies server-side:
- Teams (name, color, division)
- Coach assignments (`coachUserId`, `assistantCoachUserId`)
- `maxRosterSize`

**Never copied (regardless of path):**
- Registrations, rosters
- Games, standings, attendance, coach notes
- Discount codes (org-wide codes already apply to the new season via null `seasonId`; season-locked codes are typically one-off promos and should not bleed forward)

No per-clone toggles in v1. If admins consistently clear coach assignments after cloning or wipe the pre-filled pricing, add toggles in v2.

### API

One endpoint, extended from the existing `POST /api/admin/seasons`:

```
POST /api/admin/seasons
body: {
  // existing season fields
  programId, ageGroupId?, name, slug, startDate, endDate,
  registrationOpens?, registrationCloses?,
  priceCents, depositCents?, allowDeposit?,
  maxParticipants?, status?, scheduleNotes?,

  // new season field
  venueId?: string,

  // new scaffold field, optional (back-compat default = "empty")
  scaffold?:
    | { type: "clone", sourceSeasonId: string }
    | { type: "bulk", count: number }
    | { type: "empty" }
}
```

Behavior:
- Omitted `scaffold` → treated as `{ type: "empty" }`, preserving current callers.
- Wraps season insert + team inserts in a single DB transaction.
- `type: "clone"` where `sourceSeasonId` belongs to a different program → 400.
- `type: "clone"` where source season has zero teams → succeeds (season created, zero teams).
- `type: "bulk"` with `count` ≤ 0 → succeeds, no teams created (treated as empty).
- `type: "bulk"` with `count` > 50 → 400 (sanity cap; admin can bulk-create a second batch or add manually).
- `venueId` provided but the referenced venue doesn't belong to the program's location → 400.

Response: `{ season: Season, teams: Team[] }` — so the UI can redirect confidently and the E2E test can verify without a second fetch.

### Helper module

Put the clone/bulk logic in a new file `src/lib/seasons/scaffold.ts` with two exported functions:

```ts
cloneSeasonTeams(tx, { sourceSeasonId, targetSeasonId }): Promise<Team[]>
bulkCreateTeams(tx, { targetSeasonId, count, programName, ageGroupName }): Promise<Team[]>
```

Both take an active Drizzle transaction and mutate within it, returning the inserted team rows so the endpoint can include them in the response. The endpoint orchestrates; the helpers are narrowly responsible for one thing each, easy to test in isolation.

### UI

**File:** `src/components/admin/seasons-list.tsx` (extend the existing create-season dialog)

- Add a `<ScaffoldPicker>` section rendered at the top of the dialog, above the existing fields. Three radio-style options with conditional sub-forms:
  - "Clone from previous" → dropdown of prior seasons for the current `programId` (fetched lazily when a program is selected). On source selection, populate `priceCents`, `depositCents`, `maxParticipants`, `allowDeposit`, `venueId`, `scheduleNotes`, and `ageGroupId` into the form fields; the admin sees the filled values and can edit.
  - "Bulk-create teams" → a single number input labeled "How many teams?" (defaults to 0).
  - "Empty season" → no sub-form.
- Add a Venue picker to the main form (separate from the ScaffoldPicker). Loads venues via a new endpoint `GET /api/admin/venues?locationId={id}` or by filtering from an existing query. Populated whenever a program is selected, since `venueId` is tied to the program's `locationId`. Nullable: the admin can leave it unset.
- On submit: build the `scaffold` field based on the ScaffoldPicker selection and POST.
- On success response: redirect to `/admin/seasons/{id}` (the season edit page).

Scale: this dialog is the first multi-mode form in the admin UI. Keep it contained — don't refactor surrounding files. The dialog is already ~500 lines; split `<ScaffoldPicker>` into its own file at `src/components/admin/season-scaffold-picker.tsx` from the start to keep `seasons-list.tsx` readable.

### Data flow

1. Admin opens "New Season" in `/admin/seasons`.
2. Dialog fetches prior seasons for the selected program (filter the existing seasons query client-side by `programId`, no new endpoint) and venues for the program's location.
3. Admin picks a scaffold mode and fills in season fields (incl. venue).
4. Client POSTs to `/api/admin/seasons` with the `scaffold` and `venueId` fields.
5. Server opens a transaction: insert season → run `cloneSeasonTeams` or `bulkCreateTeams` or nothing → commit.
6. On success, client redirects to `/admin/seasons/{id}` edit page.
7. Admin tweaks dates, pricing, and team names in place.

### Error handling

- Any failure inside the transaction rolls the entire thing back. No partial seasons.
- 400 errors (unknown source season, cross-program clone source, venue doesn't belong to program's location, bulk count > 50) return a clear message; the dialog stays open and shows it.
- 500 errors surface a generic "Failed to create season" toast; details go to server logs.

### Testing

**API tests** (`tests/api/seasons.test.ts`, extend existing file):
- `POST /api/admin/seasons` with `scaffold` omitted → behaves like today (back-compat)
- `POST` with `scaffold.type === "empty"` → season created, zero teams
- `POST` with `scaffold.type === "clone"` → teams copied with names, colors, coach assignments, divisions; registrations/rosters/games NOT copied; new season `status === "draft"`
- `POST` with `scaffold.type === "clone"` where source is a different program → 400
- `POST` with `scaffold.type === "bulk", count: 4` → creates 4 teams named `"{Program} {AgeGroup} Team 1"` through `...Team 4"`
- `POST` with `scaffold.type === "bulk", count: 4` on a season with null `ageGroupId` → names are `"{Program} Team 1"` through `...Team 4"`
- `POST` with `scaffold.type === "bulk", count: 0` → zero teams, no error
- `POST` with `scaffold.type === "bulk", count: 51` → 400
- `POST` with `venueId` belonging to a different location than the program's → 400, no season row created (rollback verified)
- `POST` with valid `venueId` → season row has it

**E2E test** (new Playwright test in `tests/e2e/` — confirm location matches existing E2E setup):
- Seed a program with one prior season containing 4 teams
- From `/admin/seasons`, open "New Season", select the program, confirm "Clone from previous" is the default option
- Submit with defaults plus new dates and the admin's choice of venue
- Verify the new season's edit page loads and shows 4 teams with names matching the source season

## Open questions

None. If something looks off during the plan review, flag it inline.

## Rollout

Single branch, single PR. No feature flag — admin-only, additive, and back-compat. The existing create-season flow continues to work for any caller that omits `scaffold`. Schema migration ships with the PR via `npm run db:generate` and is applied on deploy via `npm run db:push`.
