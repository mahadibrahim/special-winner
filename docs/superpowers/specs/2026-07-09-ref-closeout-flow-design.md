# Ref Close-Out Flow: One Guided Finish That Gates Pay

**Date:** 2026-07-09
**Status:** Approved design, pending implementation plan

## Purpose

Referees assigned to games need to close those games out — final score, cards, ejections, injuries, notes — quickly and completely, from a phone, on the field. Today the pieces all exist but are scattered: check-in, an ejection form, and a match report are three separate cards on the match page, cards live in one place and ejections in another, nothing forces a ref to actually finish, and pay is unrelated to whether the game was reported. The result is too many forms, incomplete/ambiguous data ("no incidents logged" vs "forgot"), a clunky mobile experience, and games that sit un-reported.

This work tightens that into a single guided close-out that is mobile-first, demands complete data without busywork, gates the ref's pay on completion, and nudges stragglers by SMS.

## Decisions (settled during brainstorming)

| Question | Decision |
|---|---|
| Pay/close-out link | **Payable state gate.** A fee is payable **⇔ `games.status = 'completed'`**. No new payment enum — game status is the single source of truth, and submitting the report is what sets it. Nothing traps the ref in the UI; the incentive is the locked fee. |
| Completeness bar | **Score + explicit "None" gates.** Final score (both sides) is required. Each of Cards / Ejections / Injuries must be actively answered — either logged or tapped "None this game." Enforced at submit time; kills forgot-vs-none ambiguity without busywork on clean games. |
| Consolidation | Merge score + cards + ejections + injuries + notes into **one close-out screen and one submit**. Fold **check-out** into the finish (opportunistic). Keep **check-in** separate — it's geofenced and happens at kickoff. |
| Check-out | **Opportunistic, not required.** Submit clocks the ref out if an open check-in exists; a ref who never checked in can still close out. Pay gates on the report, not on clock-out. |
| Reminders | **Escalating SMS:** T+2h after kickoff → next morning if still open → then stop texting and flag on the admin dashboard. Sent through the existing provider-agnostic `sendSms` (Zernio swap needs no change here). |
| Old endpoints | Keep `report.ts` / `ejections.ts` / `check-out.ts` in place during transition; the UI stops calling them. No deletion in this work. |

## Architecture

The finish is currently split across three endpoints:
`POST .../report` (score + cards/injuries + notes, sets `status='completed'`), `POST .../ejections` (additive, also creates a `suspensions` trail via FK), and `POST .../check-out` (clocks out). The client stacks `EjectionForm` + `MatchReport` + `RefereeCheckIn` as separate cards. We collapse the client to one screen and one button, backed by one atomic endpoint.

### 1. Shared ejection logic — `src/lib/referee/create-ejection.ts` (extract)

Extract today's ejection-creation logic (insert `game_incidents` row of type `ejection` + the linked `suspensions` row) out of `ejections.ts` into a reusable `createEjection(tx, ...)` that runs inside a caller's transaction. Both the existing ejections endpoint and the new close-out endpoint call it, so the suspension trail stays identical and correct. Idempotency: close-out only creates ejections not already recorded for the game (so a resubmit/score-correction never double-creates a suspension).

### 2. Atomic close-out endpoint — `POST /api/referee/matches/[gameId]/close-out`

One endpoint, one DB transaction, all-or-nothing. Auth via the existing `requireAssignedOfficial(user.id, gameId)` gate (404 otherwise).

Request body:
```ts
interface CloseOutBody {
  homeScore: number;               // required, non-neg int
  awayScore: number;               // required, non-neg int
  cards:     IncidentInput[];      // yellow_card | red_card
  injuries:  IncidentInput[];      // injury
  ejections: EjectionInput[];      // NEW ejections only (see note below)
  noCards: boolean;                // explicit "None" acknowledgments
  noInjuries: boolean;
  noEjections: boolean;
  refereeNotes?: string | null;
}
```

Validation (submit-time completeness gate):
- `homeScore` / `awayScore` present and non-negative integers.
- For each section: **either** it has ≥1 entry **or** its `noX` flag is `true`. A section that is empty **and** not acknowledged → `400` (this is the forgot-vs-none guard). A section that has entries **and** its `noX` flag → `400` (contradiction).
- Each incident: valid `type` for its section, valid `side` (`home`/`away`), optional non-neg-int `minute`.

Transaction:
1. `UPDATE games SET homeScore, awayScore, status='completed', refereeNotes, updatedAt`.
2. Replace non-ejection incidents (delete `game_incidents WHERE gameId AND type != 'ejection'`, re-insert cards + injuries) — same delete-scope as today's `report.ts`, which deliberately never touches ejection rows.
3. For each entry in `ejections`, `createEjection(tx, ...)`. The contract is that `ejections` carries **only newly-added ejections** — the close-out screen shows any already-recorded ejections read-only (they were created by a prior submit and carry a live suspension trail) and does **not** resubmit them. This keeps resubmits/score-corrections from double-creating a suspension without the server needing to fuzzy-match. Removing/editing an existing ejection stays out of the bulk flow (see Out of scope).
4. If an open check-in exists for this ref+game (`time_entries` row with null `clockOutAt`), set `clockOutAt = now` (opportunistic; skip silently if none).

Returns `{ ok: true }` or a single error. Old endpoints untouched.

### 3. Close-out screen — `src/components/referee/match-closeout.tsx` (replaces `EjectionForm` + `MatchReport` on the detail page)

Mobile-first single component on `/referee/matches/[gameId]`:
- Final-score **steppers** (big tap targets, not tiny number inputs), sides labeled with team names.
- Three sections — Cards / Ejections / Injuries — each a **None | Log** toggle. "Log" reveals the row editor (type/side/player/minute/notes). Selecting "None" sets the corresponding `noX` flag; adding a row clears it. In edit mode (game already completed), any already-recorded ejections render read-only above the editor and are not part of the submitted `ejections` array; the section still counts as "answered" for gate purposes when such an ejection is present.
- Optional notes.
- Sticky **"Submit & check out"** button; disabled until score is filled and every section is answered. On success the screen renders a completed summary + "You're clear to be paid."

`ActiveSuspensionBanner` and `RefereeCheckIn` stay above it unchanged — check-in is a kickoff-time action, not part of the finish. The detail page (`[gameId].astro`) swaps the two cards for the one component and passes existing `detail` data (score, incidents split into cards/injuries, refereeNotes) plus whether the game is already completed (edit vs first-close mode).

### 4. Pay page + admin payout gate

- `getRefereePay` (`src/lib/referee/get-referee-pay.ts`) adds a derived `locked` per row (`true` when the game's `status !== 'completed'`) and excludes locked fees from `totalUnpaidCents`/payable totals.
- `RefereePay` (`src/components/referee/referee-pay.tsx`) renders locked rows as `🔒 Close out to unlock` with a deep link to the close-out screen; unlocked-unpaid and paid render as today.
- Admin side: the payout/officials read surface flags or excludes officials whose game isn't `completed`, so no one is marked `paid` before close-out. (Enforcement is at the read/UI layer; the admin PATCH that sets `paymentStatus='paid'` is unchanged but operates on a filtered list.)

### 5. SMS close-out reminders — `src/pages/api/cron/referee-closeout-reminders.ts`

New cron on the established pattern (`CRON_SECRET` guard, scheduled Netlify function; models `send-balance-reminders.ts`). Provider-agnostic via `src/lib/sms/send.ts` — the pending Zernio provider swap is out of scope and requires no change here.

Escalation tracked by a new `closeoutRemindersSent` integer column on `game_officials` (default `0`), a pure state machine:
- Stage 0, now ≥ `kickoff + 2h`, game not completed → send #1 ("Close out {home} vs {away} to get paid: {link}"), set 1.
- Stage 1, past the next local morning (8am ET) and still open → send #2 ("Reminder: 1 game still needs closing out. You won't be paid until it's done."), set 2.
- Stage 2 → stop texting; the game surfaces on the admin payout flag instead.
- Game reaches `completed` → no further sends (counter irrelevant thereafter).

Guards: only officials with a non-null, `phoneVerified` phone that is opted-in (enforced inside `sendSms`) are texted; missing-phone / opted-out / send-failure is skipped with a logged reason and never throws the cron.

### Schema change

One additive column:
```sql
ALTER TABLE game_officials ADD COLUMN IF NOT EXISTS closeout_reminders_sent integer NOT NULL DEFAULT 0;
```
Via `db:generate` → committed migration → `db:migrate` (per repo policy; no `db:push` to remote).

## Error handling

- Close-out endpoint is one transaction → single success/failure. The screen shows one `toast.error` / `ErrorBanner` on failure; no partial writes possible.
- Reused `requireAssignedOfficial` gate → 404 for non-assigned callers, matching existing endpoints.
- Cron never throws on a single bad official (missing phone, opt-out, provider error) — it logs and continues, so one ref can't block reminders for the rest.
- SMS opt-in / compliance is already enforced inside `sendSms`; the cron does not re-implement it.

## Testing

- **API** (`tests/api/`): score-required rejection; each None-gate (empty+unacknowledged → 400, entries+`noX` → 400, acknowledged-none → 200); ejection creates exactly one suspension and a resubmit does not double-create; check-out folded in when an open check-in exists and skipped when not; `getRefereePay` locked-derivation and payable-total exclusion; payable gating (fee stays locked until `status='completed'`).
- **Unit** (`tests/unit/`): the reminder-stage function as a pure `(now, kickoff, status, stage) → action` mapping across all transitions.
- **E2E** (`tests/e2e/`): a ref closes out a game on a mobile viewport (steppers + None toggles + submit) and the game's fee flips from locked to payable on the pay page. Uses `useHydrationBeacon` / `waitForHydration` per repo Playwright conventions.

## Out of scope

- Changing the SMS provider (Twilio → Zernio) — tracked as a separate project; this work depends only on the `sendSms` interface.
- Automated payouts / money movement — pay is still an admin "mark paid" action; this work only gates *when* a fee becomes payable and what the ref/admin see.
- Multi-official games (AR1/AR2/fourth) — the schema allows it, but close-out remains single-ref MVP; no per-position report reconciliation.
- Editing an already-recorded ejection through the bulk flow — ejections stay individually managed, matching today's careful suspension-trail architecture.
