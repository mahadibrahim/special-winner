# Pickup Mode — Fast Register + Roll Call for Ad-Hoc Games — Design Spec

- **Date:** 2026-06-21
- **Status:** Approved design (validated in dialogue); ready for implementation planning
- **Slice:** A follow-on to the venue command center / Person 360. Adds a fast path for the venue manager to register walk-ups and build a checked-in attendance list for ad-hoc/pickup games.

## Context

The venue runs many **ad-hoc / pickup games** — people just show up. The league model (`games` → `teams` → `rosters`, all season-bound) is the wrong tool: it requires a season + named teams and links a *season registration* to a team. What the manager needs is to get walk-ups **registered and onto a checked-in attendance list fast**, and sort sides themselves on the field.

The platform already has the right primitive: a **drop-in session** (`drop_in_sessions` + `drop_in_bookings`) is venue-scoped, needs no season, and its booking list already carries waiver / paid / checked-in status (surfaced live in the command center's roster panel after the Person 360 work).

## Problem

When a crowd shows up to a pickup game, the manager needs to (a) spin the game up in seconds and (b) add each person to the attendance list without the line backing up — capturing identity now and deferring waiver/payment to a link so nothing blocks play.

## Goals

- **Quick-create** a pickup game (a drop-in session) in seconds, with now-defaults.
- **Rapid roll call:** type a name + mobile → the person is registered, **checked in immediately**, and a **waiver + pay link is auto-texted**; the input refocuses for the next person.
- A **live attendance list** with waiver / paid chips that flip green as people complete the link.
- Reuse existing infrastructure; **no schema change**.

## Non-goals

- **No sides / teams.** Attendance list only — the manager splits teams on the field. The drop-in team-color (`teamAssignment`) is left unused for pickup sessions.
- **Adults only (v1).** Walk-ups self-register (name + their own phone). Minors/COPPA add a parent step that slows the line and are out of scope (consistent with youth features being a 2027 concern).
- **Not the league `games`/`teams`/`rosters` model** and **not the full offering wizard** — pickup is the drop-in model with a stripped, now-defaulted create.
- **No new payment surface** — the texted link reuses the existing self-serve waiver+pay token flow; in-person card payment is the separate Stripe Terminal roadmap item.

## The model (no new tables)

A pickup game **is** a `drop_in_session` of `kind: "pickup"`. Attendance **is** its `drop_in_bookings`. No season, no `teams`, no `rosters`. `teamAssignment` is left null/ignored (no sides). Status chips (waiver/paid/checked-in) and the roster panel already exist.

## Quick-create

- A **"Start pickup game"** action in the command center (next to + Walk-in).
- A minimal form: **sport/label** (free text or a quick pick), **field/space** (the venue's bookable resources), optional **capacity**, **walk-up rate** (default from the venue's drop-in rate config; may be $0). **Start = now**, **end = now + 2h** (a sensible default; editable).
- `POST /api/admin/pickup/start` creates the `drop_in_session` (kind `pickup`, the chosen space/label/rate, org+venue scoped) and returns it. The UI drops straight into the roll call for that session.
- Reuses the drop-in-session creation logic (the same insert the offering wizard / drop-in setup uses), stripped to these fields with now-defaults — NOT the multi-step wizard.

## Rapid roll call (the core)

A focused view for the open pickup session: a single **Name + mobile** row, autofocused.

On Enter / Add:
1. **`resolvePerson` (adult self)** — find-or-create the user + `family_members` self row. **Dedupe by phone**: if the mobile matches an existing user, reuse that account/person (regulars don't get duplicated).
2. Create a **confirmed** `drop_in_booking` for the session, **stamped `checkedInAt = now`** (they're playing immediately).
3. **Auto-dispatch a waiver + pay link** to the mobile (SMS), reusing the self-serve `walkin_session` token + send-link flow.
4. **Clear the input and refocus** for the next person.

Below the input, the **live attendance list** renders each added player with **waiver / paid** chips (and checked-in). The list polls (as the roster panel already does), so chips flip green as people finish the link on their phones. Inline, non-blocking errors (invalid phone, send-link failure → the person is still on the list checked-in; a "resend link" affordance covers a failed text).

This is one combined server call for speed (below), so a name-to-on-the-list round trip is a single request.

## The attendance list = existing roster panel

Reuse `ActivityDetailPanel`'s roster rows (name, waiver/paid/checked-in chips, manual **check-in** / **mark-paid** / **resend link** overrides) as the roll. For a `pickup` session, **hide the team-color**. The manager sees who's here, who's paid, who's signed — and can manually flip any status.

## Endpoints

- **`POST /api/admin/pickup/start`** — admin-gated, org/venue-scoped. Body: `{ spaceId, label, capacity?, walkUpRateCents?, durationMinutes? }`. Creates the `drop_in_session` (kind `pickup`, `startsAt = now`). Returns `{ sessionId }`.
- **`POST /api/admin/pickup/[sessionId]/add`** — admin-gated, org-scoped to the session's venue. Body: `{ firstName, lastName, phone }`. Does, in one transaction-ish flow: `resolvePerson` (dedupe by phone) → confirmed `drop_in_booking` checked-in now → mint + send the waiver+pay link. Returns `{ bookingId, personName, linkChannel, recipientMasked }`. Idempotent-ish: re-adding the same phone to the same session returns the existing booking (no dup).
- **List + overrides:** reuse the existing `GET /api/admin/check-in/event` (roster), `check-in/check-in`, `check-in/send-link` (resend), and mark-paid endpoints.

## Semantics

- Booking is **confirmed + checked-in immediately** (they're playing); **waiver and paid stay pending** until the link is completed; chips reflect live status. The manager can also mark waiver/paid manually or resend the link.
- **Rate:** the session's `walkUpRateCents`; if $0, the pay step is skipped (waiver-only link, or nothing).
- **Dedupe:** by phone for the person (reuse account); by `(session, person)` for the booking (no double-add).

## Reuse

- `drop_in_sessions` / `drop_in_bookings` (the model); the drop-in session insert (create).
- `resolvePerson` (`src/lib/registrations/resolve-person.ts`) for the person.
- The kiosk `walkin/start` token + `check-in/send-link` for the waiver+pay link; `check-in/event` + `check-in/check-in` + mark-paid for the list/overrides.
- `ActivityDetailPanel` roster rows + `StatusChip`; the command-center session/panel chrome; `Sheet` for the create form.

## Components (decomposition)

- `StartPickupGame` (the quick-create form + the command-center entry button).
- `PickupRollCall` (the autofocused Name+mobile add row + the live list) — may compose the existing roster panel for the list.
- `usePickupAdd` (the add submit → `/pickup/[id]/add`, optimistic row, refocus).
- Endpoints `pickup/start` + `pickup/[sessionId]/add`; a thin `addWalkUpToPickup(...)` lib that sequences resolvePerson → booking → send-link (pure-ish, testable).

## Error / loading / empty

- Shared `ErrorBanner` / `LoadingSkeleton` / `EmptyState`.
- Create: validation inline; failure → ErrorBanner, no session created.
- Add: invalid phone → inline error, no add; a failed link send → the person is STILL added + checked-in, with a visible "link not sent — resend" on the row (don't lose the registration over a texting blip).
- Empty roll → "No one added yet — type a name to start."

## Testing

- **Unit:** the `addWalkUpToPickup` sequencing + phone-dedupe (reuse existing person on matching phone; new person otherwise); the now-defaults for create.
- **API:** `pickup/start` (admin-gated, scoped, creates a `kind=pickup` session) and `pickup/[id]/add` (creates a confirmed checked-in booking, dedupes by phone, attempts the link; 401/404/cross-org). Use the existing api-test helpers.
- **E2E (Playwright):** start a pickup game → rapid-add a player by name+phone → the player appears on the live list checked-in. `waitForHydration`; staging-latency-tolerant timeouts.

## Rollout

- Additive, no schema change (all reads/writes on existing tables). Ship the two endpoints first, then the command-center UI.
- Adults-only is a v1 product decision, not a technical limit — a minor path can be added later by routing the add through the parent/COPPA flow.
