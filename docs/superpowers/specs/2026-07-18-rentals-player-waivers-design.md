# Per-player rental waivers — design (Sub-project 2)

**Date:** 2026-07-18
**Branch:** `feat/rentals-player-waivers` (worktree off `main` @ #420 merge)
**Scope:** Both brands (shared field-rental flow). Builds on the request→approve→pay flow (PR #419) and the UX refresh (PR #420).

## Context

Sub-project 1 (PR #420) added interim copy that "every player must have a signed
waiver." This sub-project builds the mechanism: after a rental is approved, the
requester adds a **player roster**, and each player (or a minor's parent) signs
the liability waiver via an **emailed self-serve link**. Completion is tracked;
nothing is hard-blocked.

**Reuses existing infrastructure** (the owner's instinct — extend, don't rebuild):
- `waivers` table — versioned liability-waiver content per org (with global fallback), already used by registration + self-serve signing. We reuse the content + its sha256 hash for legal proof.
- `self_service_tokens` + `/self-serve/[token].astro` signing page + `/api/self-serve/[token]/waiver.ts` — the emailed-link waiver-signing flow (already handles drop-in, walk-in, roster minors, and single-signer `field_rental`).
- Email infra (`sendEmail`, brand-aware) + the `MESSAGING_LIVE`/`MESSAGING_MOCK` gate.
- `RentalDetail` (admin) + `MyBookings` (requester dashboard) for surfacing status.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Roster capture | **After approval**, by the requester (from `/dashboard/bookings`). Request stays light. |
| Signers | **Adults sign own; minors' parent signs** (roster entry flagged `isMinor`, `signerEmail` = parent for minors). |
| Gating | **Tracked + reminders, no hard block.** Payment/booking proceed regardless. |
| Data model | **Self-contained roster** (`field_rental_players`) holding the signature record; reuses `waivers` content + hash, NOT the user-gated `consents` ledger. |
| Requester | **Auto-added as player #1, marked signed** (already accepted the waiver at request time). Requester can add the rest. *(Flagged: veto if you'd rather not auto-add.)* |
| Reuse vs new page | Extend the self-serve flow with a `rental_player` waiver-only kind; fall back to a dedicated minimal `/rental-waiver/[token]` page only if wiring the multi-purpose self-serve context proves tangled (decided in planning). |

## Why self-contained (not the consents ledger)

`consents` requires a NOT-NULL `signedByUserId` (a registered user) — emailed
roster players frequently have no account, so a full consents row can't be
written for them (the existing self-serve waiver endpoint already only writes
consents "for roster_entry minors" where a user resolves). The rental already
stores its own waiver as `waiverSigned`/`waiverSignedBy` columns (lightweight).
We extend that same lightweight pattern per player, while reusing the `waivers`
content row + its hash so we still capture *what version* was signed. Linking
players into `family_members`/`consents` is a possible future enhancement, not v1.

## Architecture

### 1. Schema — `field_rental_players` (`src/lib/db/schema/field-rentals.ts` or new module)

```
field_rental_players
  id            uuid pk
  rental_id     uuid  FK field_rentals(id) onDelete cascade
  player_name   text  not null              -- the participant
  is_minor      boolean not null default false
  signer_email  text  not null              -- adult's own, or parent's for a minor
  status        enum('pending','signed') not null default 'pending'
  signer_name   text                        -- captured at signing (parent's name if minor)
  waiver_id     uuid  FK waivers(id)         -- which waiver version was signed
  content_hash  text                        -- sha256 of waiver content at signing
  signed_at     timestamptz
  signed_ip     text
  signed_ua     text
  reminder_sent_at timestamptz
  created_at    timestamptz not null default now()
  (index on rental_id; index on status where pending, for the reminder sweep)
```
Migration via `db:generate` (plain additive CREATE TABLE + enum). New enum
`field_rental_player_status`; write the enum add in its own migration if the same
file also references it (the 55P04 lesson from #419).

### 2. Roster capture — requester, post-approval

`/dashboard/bookings` (`MyBookings`): an approved (`pending_payment` or
`confirmed`) rental gains an **"Players & waivers"** panel showing "X of N
signed" and per-player rows. An **"Add player"** form (name, email, is-minor
toggle) posts to a new endpoint:
- `POST /api/rentals/bookings/[id]/players` `{ playerName, signerEmail, isMinor }`
  → renter-owned check; inserts a `field_rental_players` row (`pending`); mints a
  `rental_player` self-serve token; emails the signing link (§4). Returns the row.
- `GET  /api/rentals/bookings/[id]/players` → the roster (for the panel).
- `POST /api/rentals/bookings/[id]/players/[playerId]/resend` → re-mint token +
  re-email (rate-limited).
- `DELETE .../players/[playerId]` → remove a pending player (renter-owned).

On rental **approval** (admin approve path from PR #419), auto-insert the
requester as player #1 with `status='signed'`, `signer_name = renterName`,
`signed_at = now`, `waiver_id`/`content_hash` from the request-time acceptance —
so the roster reflects them without re-asking.

### 3. Signing — reuse self-serve (`rental_player` kind)

- Add `rental_player` to `SelfServiceKind` (`resolve-signer.ts`) + the token-kind
  enum; `targetId` = `field_rental_players.id`.
- Extend `resolveSigner` / `build-context.ts` so a `rental_player` token resolves
  to the roster row: display the player name, the org's active liability waiver
  content, `outstanding = { waiver: true, photo: false, payment: false }`,
  `isMinor` from the row (drives "parent/guardian signing" copy).
- Extend `POST /api/self-serve/[token]/waiver.ts`: for a `rental_player` target,
  mark the roster row `signed` (`signer_name`, `waiver_id`, `content_hash`,
  `signed_at`, ip/ua) instead of the rental's own `waiverSigned` column.
- The `/self-serve/[token].astro` page already renders waiver-only when photo +
  payment are not outstanding — verify it degrades cleanly for this kind.

### 4. Emails + reminders (`src/lib/rentals/messages/`)

- **On add**: a "Sign your waiver for {venue} on {when}" email to `signer_email`
  (brand-aware, minor-aware copy), with the self-serve link. Reuse the rental
  dispatch pattern; respect `MESSAGING_LIVE`.
- **Reminder cron**: extend an existing rental cron (or a new
  `/api/cron/rental-waiver-reminders`) to re-email `pending` players whose
  `reminder_sent_at` is null or older than N hours and whose rental start is
  still upcoming; stamp `reminder_sent_at`. Bounded, idempotent, `MESSAGING_LIVE`.

### 5. Tracking surfaces (no gate)

- **Admin `RentalDetail`**: a "Players & waivers" section — roster rows with
  status, "X of N signed", and a resend action (reuses the players API, admin
  variant or the same endpoint with admin auth).
- **Requester `MyBookings`**: the same "X of N signed" + per-player status the
  add-player panel shows.
- No status transition on the rental is gated by waiver completion.

### 6. Tests

- **Unit**: roster/reminder eligibility logic; minor-vs-adult signer copy render.
- **API** (`tests/api/rentals/`): add player (200, roster row + token minted),
  resend (rate-limited), delete pending, ownership (403 non-owner); sign via
  `POST /api/self-serve/[token]/waiver` for a `rental_player` token → row goes
  `signed` with content hash; reminder sweep marks + stamps only eligible rows.
- Update any self-serve tests that enumerate token kinds.

## Non-goals

- Hard gating on waiver completion (payment/check-in proceed regardless).
- Per-player photos or payments (waiver only).
- Writing rental players into `family_members` / the `consents` ledger.
- Editing the request-time flow beyond the auto-add-requester-on-approval hook.

## Risks / notes

- **Schema migration** → `db:generate`, commit, controller applies to staging
  (and prod on merge). Enum add isolated per the 55P04 lesson.
- **Self-serve context is multi-purpose** — extending it for a waiver-only kind
  is the main integration risk; the dedicated-page fallback bounds it.
- **Public-ish signing link** — the self-serve token is the capability; no extra
  auth needed (same model as existing self-serve). Token expiry via the existing
  cleanup cron.
- **Both brands** — brand comes from the rental row (as the rental dispatch
  already does); minor-aware + brand-aware copy.
- **No accidental email blasts** — every send respects `MESSAGING_LIVE`;
  reminders are bounded + stamped.
- Verify the self-serve signing page renders correctly for this kind on both
  brands (can't fully browser-verify SoccerOne on localhost — see
  [[soccerone-rental-data-and-verification]]; Aspire path is verifiable).
