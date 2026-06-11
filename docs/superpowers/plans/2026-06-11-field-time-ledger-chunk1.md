# Field-Time Ledger — Chunk 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The inventory model exists and every internal writer feeds it: `venue_resources` + `resource_blocks` schema with DB-level overlap exclusion, the scheduling library, the backfill migration, and sync hooks on games/rentals/drop-ins.

**Architecture:** Sync-by-source pattern — each domain gets a `sync<X>Block(id)` that reads the source row and upserts/deletes its ledger block idempotently; mutation endpoints call it after writes. Reads DON'T change in this chunk (no double-subtraction risk); external-hold subtraction and full cutover land in chunks 2–3.

**Tech Stack:** Drizzle/Postgres (btree_gist + tstzrange exclusion), Vitest unit tests. Branch `feat/field-time-ledger`. Spec: `docs/superpowers/specs/2026-06-11-field-time-ledger-design.md`.

---

### Task 1: Schema module + migration

**Files:**
- Create: `src/lib/db/schema/scheduling.ts` (venueResources, resourceBlocks, blockSourceEnum — columns per spec table; partial unique `(venueId, fieldNumber) WHERE parent_resource_id IS NULL`; partial unique `(source_type, source_id) WHERE source_id IS NOT NULL`; check `ends_at > starts_at`; timestamptz columns)
- Modify: `src/lib/db/schema/index.ts` (export), `src/lib/db/schema/drop-in.ts` (+ `resourceId` uuid nullable FK venue_resources set null)
- Generate migration via `npx drizzle-kit generate`, then hand-append (idempotent, 0023/0024 convention):
  1. `CREATE EXTENSION IF NOT EXISTS btree_gist;`
  2. `ALTER TABLE resource_blocks ADD CONSTRAINT resource_blocks_no_overlap EXCLUDE USING gist (resource_id WITH =, tstzrange(starts_at, ends_at) WITH &&);` (wrapped in duplicate_object guard)
  3. Backfill: insert one venue_resources row per `generate_series(1, venues.field_count)` (`name = 'Field ' || n`, `field_number = n`); backfill `drop_in_sessions.resource_id` to the venue's field 1 resource; insert blocks for FUTURE games (status scheduled/in_progress, venue + numeric field_number attributable, duration COALESCE 60min), field_rentals with status IN (pending_payment, confirmed) and ends_at > now() (expires_at carried from pending holds), and future drop_in_sessions via their backfilled resource. Labels: game `'Game'`, rental `'Rental'`, drop-in session label from sport_or_class_label. ON CONFLICT DO NOTHING throughout.

- [ ] Steps: write schema → generate → hand-edit migration → `npx tsc --noEmit` clean.

### Task 2: Scheduling library

**Files:**
- Create: `src/lib/scheduling/blocks.ts`
  - `BlockConflictError` (typed: conflicting label + time range)
  - `getResourceFamilyIds(resourceId)` — self + ancestors + descendants (recursive CTE)
  - `assertNoBlockConflict(db, {resourceId, startsAt, endsAt, ignoreSourceType?, ignoreSourceId?})` — deletes expired hold-blocks in range first, then overlap check across family; advisory lock `pg_advisory_xact_lock(hashtext(rootId))`
  - `upsertSourceBlock({sourceType, sourceId, resourceId, startsAt, endsAt, label, expiresAt?})` — upsert by (sourceType, sourceId)
  - `removeSourceBlock(sourceType, sourceId)`
- Create: `src/lib/scheduling/sync.ts`
  - `syncGameBlock(gameId)` — reads game; scheduled/in_progress + attributable → upsert; else remove
  - `syncRentalBlock(rentalId)` — pending_payment (expiresAt=holdExpiresAt)/confirmed → upsert; cancelled/expired-deleted → remove
  - `syncDropInSessionBlock(sessionId)` — scheduled + resourceId → upsert; cancelled/deleted → remove
  - All resolve resourceId from (venueId, fieldNumber) via venue_resources for games/rentals during transition
- Test: `tests/unit/scheduling-blocks.test.ts` — pure-logic tests for the overlap/family helpers that don't need a DB (range overlap math, family expansion given rows); DB-backed behavior is covered by API tests in chunk 2 and the exclusion constraint itself.

- [ ] Steps: tests for pure helpers → implement → `npm run test:unit` green → tsc clean.

### Task 3: Writer hooks

**Files (call sync after mutation, never block the user action on ledger errors except conflicts):**
- `src/pages/api/admin/games.ts` — POST/PUT/DELETE → `syncGameBlock` (DELETE → `removeSourceBlock('game', id)`)
- `src/lib/rentals/booking.ts` — `createRentalHold` + `createConfirmedRentalNonStripe` → `syncRentalBlock`
- `src/lib/rentals/expire.ts` — expired ids → `removeSourceBlock('rental', id)`
- `src/lib/rentals/refund.ts` + any cancel path setting status='cancelled' → `syncRentalBlock`
- Stripe webhook rental-confirm handler → `syncRentalBlock` (clears hold expiry)
- `src/pages/api/admin/dropin/sessions/index.ts` (+ accept `resourceId`), `[id].ts`, `[id]/repeat.ts`, `[id]/cancel.ts` → `syncDropInSessionBlock`

- [ ] Steps: hook each writer → tsc clean → commit.

### Task 4: Ship

- [ ] `npx tsc --noEmit` + `npm run test:unit` green; review migration SQL by eye; commit (schema + migration + lib + writers + tests + plan/spec docs), push, PR titled `feat(scheduling): field-time ledger — schema, library, writers (1/3)`; CI is the API/E2E gate.
