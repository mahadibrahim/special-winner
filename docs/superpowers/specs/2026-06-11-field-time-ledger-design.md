# Field-Time Ledger — Design

**Date:** 2026-06-11 · **Status:** draft for founder review · **Decision:** build as ONE coherent project, not phases (founder, this session — "field time is a scarce resource; tracking it is tablestakes")

## Problem

Field time is the business's inventory, but the system has no inventory model:

- Rental availability = venue hours − games − rental holds. **Drop-in sessions are invisible to it** (they have no field attribution at all — `drop_in_sessions` carries only `venueId`).
- **External bookings don't exist anywhere.** The venue partner books slots through Good Rec and email; the system can sell a slot Good Rec already took. With the /rent calendar now driving real Stripe bookings (PR #163), this is a live conflict risk.
- `fieldNumber` is a bare integer/varchar on `games` and `field_rentals` — no notion of field configurations, no shared conflict authority.
- The admin venue-day view (`lib/admin/venue-day-data.ts`) already unions games + drop-ins + rentals, but it's display-only and venue-level.

## Founder decisions (locked)

1. **Full fields only for now** — the model supports parent/child configurations from day one; we seed only the 4 full fields (Worthington ×3, Downtown ×1). No sub-field rows until a real configuration exists.
2. **Facility staff enter external holds** via the existing venue-manager admin surface (`/admin/venue`, role infra from PRs #139–#143). Founder can too — same surface, org-scoped.
3. **One field per drop-in session** — sessions gain a required field assignment.
4. UX bar: adding an external hold must take **under ten seconds** — field, time, label, done.

## Schema

### `venue_resources`

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| venueId | uuid FK venues, cascade | |
| name | varchar(100) | "Field 1" |
| fieldNumber | integer | legacy bridge — matches existing `games.fieldNumber` (varchar, cast) / `field_rentals.fieldNumber` (int) |
| parentResourceId | uuid FK self, nullable | configurations: Field 1 ⊃ Field 1A/1B. Null for top-level |
| sortOrder | integer default 0 | |
| active | boolean default true | retire a resource without deleting history |

Unique `(venueId, fieldNumber)` for top-level rows. Seed/backfill migration creates one row per `venues.fieldCount` per venue.

### `resource_blocks` — the single occupancy ledger

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| resourceId | uuid FK venue_resources, cascade | |
| startsAt / endsAt | timestamptz, not null | CHECK endsAt > startsAt |
| sourceType | enum `block_source`: game, drop_in, rental, external, maintenance, practice | `practice` reserved (session plans have no venue/field today) |
| sourceId | uuid nullable | FK-less pointer to the source row (game id, session id, rental id); null for external/maintenance |
| label | varchar(200) | what shows on calendars: "U10 vs Thunder", "Good Rec — Smith party" |
| notes | text nullable | |
| expiresAt | timestamptz nullable | mirrors rental hold expiry; the existing expire-pending-rentals sweeper deletes the block with the hold |
| createdByUserId | uuid FK users, nullable | who entered it (external holds) |
| createdAt / updatedAt | | |

Indexes: `(resourceId, startsAt)`, `(sourceType, sourceId)`.

**Double-booking protection, two layers:**
1. **DB:** GiST exclusion constraint — `EXCLUDE USING gist (resource_id WITH =, tsrange(starts_at, ends_at) WITH &&)` (requires `btree_gist`; migration enables the extension). Same-resource overlap becomes impossible at the database level.
2. **App (family-aware):** parent/child conflicts (full field vs halves) can't live in a single exclusion constraint. The booking library takes a Postgres advisory lock keyed on the resource's ROOT id, then checks the family (self + ancestors + descendants) for overlap inside the transaction. With full-fields-only seeded, layer 1 alone covers everything today; layer 2 is ready for the first split-field configuration.

## One library, one availability function

`src/lib/scheduling/blocks.ts`
- `syncBlockForSource({sourceType, sourceId, resourceId, startsAt, endsAt, label, expiresAt?})` — upsert by (sourceType, sourceId); writers call on create/update.
- `removeBlockForSource(sourceType, sourceId)` — on cancel/delete/expiry.
- `createManualBlock(...)` / `deleteManualBlock(id)` — external + maintenance, permission-checked to venue scope.
- All writes run the advisory-lock + family-conflict check; conflicts raise a typed error the caller surfaces ("Field 2 is taken 6–7 PM: Good Rec — Smith party").

`src/lib/scheduling/availability.ts`
- `getResourceAvailability(venueId, date)` → per-resource free blocks (venue hours − family-expanded blocks, holds included while unexpired).
- `lib/rentals/availability.ts` becomes a thin delegate (same response shape — the /rent calendar and Aspire AvailabilityGrid keep working unchanged).

## Writers (all in this project)

| Source | Where it hooks | Notes |
|---|---|---|
| Games | admin games API create/update/delete + season schedule tab | resourceId resolved from venue+fieldNumber during transition; games keep writing `fieldNumber` (additive) |
| Rentals | booking orchestrator (hold create), webhook confirm, cancel, expiry sweeper | block carries `expiresAt` while a hold |
| Drop-in sessions | admin drop-in session create/update/delete + bulk-repeat | **schema change:** `drop_in_sessions.resourceId` (required for new sessions; backfilled to Field 1 of the venue for existing rows — founder confirms or corrects per session in the admin) |
| External / maintenance | NEW: venue-day "Add hold" | venue-manager + admin roles |

Backfill migration generates blocks for all FUTURE games, unexpired rental holds/confirmed rentals, and drop-in sessions. Past events stay out of the ledger (history lives in the source tables).

## Admin UX — the calendar IS the product

Upgrade the venue-day view (`/admin/venue`, already role-scoped):
- One column per resource (today it's a flat list), blocks colored by sourceType, label visible.
- **Add Hold**: click an empty slot → prefilled field + hour → type label, pick source (Good Rec / email / maintenance), adjust times → save. Under ten seconds.
- Delete/edit own holds inline; conflicts surface the blocking label.
- Venue-manager sees only their venue (existing scoping); super-admin sees all.

## Customer surfaces

- /rent calendars (SoccerOne + Aspire): unchanged API shape, availability now actually true.
- Drop-in admin creation gains a required field picker; public session cards can show "Field 2" (small, nice).
- Game scheduling in admin warns on conflict at save (typed error from the library).

## Testing

- Unit: family-expansion conflict logic (parent blocks child, child blocks parent, siblings independent); availability subtraction incl. hold expiry.
- API: add-hold endpoint auth (admin ✓, venue-manager scoped ✓, parent ✗, cross-org 404); rental booking rejected when an external hold overlaps; drop-in creation rejected without field.
- Migration: idempotent patterns per repo convention; exclusion constraint verified by attempting an overlapping insert in a test.

## Out of scope (recorded, not forgotten)

- Good Rec ICS/API import (automate entry later if volume justifies; manual entry is the contract for now).
- Sub-field configuration seeding (model ready; seed when a real split exists).
- Customer-facing combined "facility calendar" page.
- Practices as a writer (no venue/field on session plans today; enum value reserved).

## Sequencing within the one project

Single PR is too large to review honestly. One project, ~3 stacked PRs merged in quick succession, each independently green: (1) schema + library + backfill + rentals/games/drop-in writers, (2) venue-day calendar UX + add-hold endpoint, (3) drop-in field picker + game-conflict surfacing + cutover of `lib/rentals/availability` to the ledger. Not "phases" — one continuous build, reviewable chunks.
