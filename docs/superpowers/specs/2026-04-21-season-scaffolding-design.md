# Season Scaffolding (Clone + Bulk-Create)

**Date:** 2026-04-21
**Status:** Design approved, ready for implementation plan

## Problem

Creating a new season today requires three separate admin flows: create the season, then open the teams page, then create each team one-by-one via a dialog. For a typical league with 4–6 age groups and 4–8 teams per group, that's 20–40 manual entries, most of which are near-duplicates of prior seasons or follow a predictable "N teams per age group" pattern.

There is no `clone`, `duplicate`, or bulk-create path anywhere in the admin UI or API. Every POST creates one entity.

## Goal

Collapse season setup into a single form. Give admins three ways to populate a new season's team structure: clone from a prior season, bulk-create teams across age groups, or start empty.

## Non-goals (v1)

- Cloning game schedules (too date-dependent)
- Reusable named templates ("My U10 Standard Setup") — revisit if the pattern emerges
- Roster or player carryover with age graduation — separate, larger feature
- Per-clone toggles for what copies — revisit if defaults don't match reality

## Design

### One flow, three starting options

Replace the current plain create-season form (at `/admin/seasons` → `seasons-list.tsx`) with a form that has a **"Starting structure"** picker at the top. Three options:

1. **Clone from previous season.** Picker lists prior seasons for the selected program, sorted newest-first. Selected by default if any exist. When chosen, pulls the source season's pricing, max participants, and structural settings into the form as defaults (admin can override). On save, clones the team list, coach assignments, and home-venue assignments.
2. **Bulk-create teams.** Expands a small grid: one row per age group attached to the organization, integer input for team count. Auto-generates team names like `"U10 Team 1"`, `"U10 Team 2"` — admin renames later. Good for day-one setup when no prior season exists.
3. **Empty season.** Creates the season shell, no teams. For unusual cases.

**Default selection:** #1 if prior seasons exist for this program, otherwise #2.

### What clone copies

Two layers, handled separately:

**Season-level fields** always come from the top-level request body, which the UI pre-fills from the source season for admin convenience. This means the admin sees and can edit pricing, `maxParticipants`, and `settings` before submit — no hidden copies. Dates, registration window, and `status` are blank / `draft` in the pre-fill.

**Team-level scaffolding** is what the `scaffold.type === "clone"` path actually copies server-side:
- Teams (name, age group, division)
- Coach assignments on teams
- Home venue assignments on teams

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
  programId, name, slug?, startDate, endDate,
  registrationOpens, registrationCloses, earlyBirdDeadline?,
  priceCents, earlyBirdPriceCents?, depositCents?, allowDeposit?,
  maxParticipants?, settings?,

  // new field, optional (back-compat default = "empty")
  scaffold?:
    | { type: "clone", sourceSeasonId: string }
    | { type: "bulk", teams: Array<{ ageGroupId: string; count: number }> }
    | { type: "empty" }
}
```

Behavior:
- Omitted `scaffold` → treated as `{ type: "empty" }`, preserving current callers.
- Wraps season insert + team inserts in a single DB transaction.
- `type: "clone"` with a `sourceSeasonId` that belongs to a different program → 400.
- `type: "clone"` with a source season that has zero teams → succeeds (season created, zero teams).
- `type: "bulk"` rows with `count: 0` or missing `ageGroupId` → skipped silently.
- `type: "bulk"` with any unknown `ageGroupId` → 400, rollback.

Response: the created season, including its teams (so the UI can redirect confidently).

### Helper module

Put the clone/bulk logic in a new file `src/lib/seasons/scaffold.ts` with two exported functions:

```ts
cloneSeasonTeams(tx, { sourceSeasonId, targetSeasonId }): Promise<void>
bulkCreateTeams(tx, { targetSeasonId, rows }): Promise<void>
```

Both take an active transaction and mutate within it. The endpoint orchestrates; the helpers are narrowly responsible for one thing each, easy to test in isolation.

### UI

**File:** `src/components/admin/seasons-list.tsx` (extend the existing create-season dialog)

- Add a `<ScaffoldPicker>` component rendered at the top of the dialog, above the existing fields.
- When "Clone from previous" is selected: show a season picker (fetches seasons for the current `programId`), and on selection, populate pricing/settings defaults into the form fields.
- When "Bulk-create teams" is selected: show the age-group grid (fetches org age groups, one row each, with a count input defaulting to 0).
- When "Empty" is selected: hide both sub-forms.
- On submit: build the `scaffold` field based on the selection and POST.

Scale: this dialog is the first multi-mode form in the admin UI. Keep it contained — don't refactor surrounding files. If the dialog grows past ~400 lines, split `<ScaffoldPicker>` into its own file.

### Data flow

1. Admin opens "New Season" in `/admin/seasons`.
2. Dialog fetches prior seasons for the selected program (reuses existing admin seasons query, filtered by `programId`).
3. Admin picks a scaffold mode and fills in season fields.
4. Client POSTs to `/api/admin/seasons` with the `scaffold` field.
5. Server opens a transaction: insert season → run `cloneSeasonTeams` or `bulkCreateTeams` or nothing → commit.
6. On success, client redirects to `/admin/seasons/{id}` edit page.
7. Admin tweaks dates, pricing, and team names in place.

### Error handling

- Any failure inside the transaction rolls the entire thing back. No partial seasons.
- 400 errors (unknown age group, cross-program clone source) return a clear message; the dialog stays open and shows it.
- 500 errors surface a generic "Failed to create season" toast; details go to server logs.

### Testing

**API tests** (`tests/api/seasons.test.ts`, extend existing file):
- `POST /api/admin/seasons` with `scaffold.type === "empty"` behaves like today
- `POST` with `scaffold.type === "clone"` creates the expected teams, coach assignments, and venue assignments; dates/status are reset
- `POST` with `scaffold.type === "clone"` across programs → 400
- `POST` with `scaffold.type === "bulk"` creates N teams per age group with auto-generated names
- `POST` with `scaffold.type === "bulk"` and unknown `ageGroupId` → 400, no season row created (rollback verified)
- `POST` with `scaffold.type === "bulk"` and `count: 0` row → row skipped, no error
- `POST` with `scaffold` omitted → still works (back-compat)

**E2E test** (new Playwright test):
- Seed a program with one prior season containing 4 teams
- From `/admin/seasons`, open "New Season", confirm "Clone from previous" is the default
- Submit with the defaults plus new dates
- Verify the new season's edit page shows 4 teams with matching names

## Open questions

None. If something looks off after the spec lands, flag it in the plan review.

## Rollout

Single branch, single PR. No feature flag — this is admin-only, additive, and back-compat. The existing create-season flow continues to work for any caller that omits `scaffold`.
