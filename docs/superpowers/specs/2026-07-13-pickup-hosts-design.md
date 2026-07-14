# Pickup Hosts — Design Spec

**Date:** 2026-07-13
**Status:** Approved by owner (brainstorming session)
**Model reference:** GoodRec community hosts (https://goodrec.recruitee.com/o/targeted-hosts/c/new)

## Goal

Build out the pickup (drop-in) subsystem with three connected features, mimicking the GoodRec model:

1. **Hosts** — unpaid community members who lead pickup games they're assigned to, and play free in those games.
2. **Fill tracking + sharing** — surface whether a game is filling, let hosts/players share a join link, and auto-text opted-in subscribers when a game needs players.
3. **Host role + application** — a public host application (extending the careers ATS) with admin review/approval that grants the host role.

## Context (what exists today)

- Pickup games are `drop_in_sessions` (`src/lib/db/schema/drop-in.ts`) with `kind = 'pickup'`, capacity + gender caps, pricing, status. The only person field is `createdByUserId` — no host concept.
- Bookings are `drop_in_bookings` with statuses `confirmed | waitlisted | pending_claim | pending_payment | cancelled | no_show`, capacity enforced by `checkSessionCapacityLocked` (`src/lib/dropin/booking.ts`) under a session row lock.
- Fill counts are computed inline in the listing API (`src/pages/api/dropin/sessions/index.ts`) as `confirmedCount`.
- SMS goes through `sendSms` (`src/lib/sms/send.ts`) — opt-in enforced via `phone_opt_ins`, `MESSAGING_MOCK=1` supported. Dropin notifications dispatch via `src/lib/dropin/messages/dispatch.ts`.
- Careers ATS: `job_applications` (`src/lib/db/schema/job-applications.ts`, roles `referee | coach | staff`), public apply endpoint, admin review + `hire.ts` (creates/links accounts), Notion sync cron.
- Per-org dropin config lives in `drop_in_rate_card` (windows: cancel/promotion/check-in).

## Decisions (owner-confirmed)

| Question | Decision |
|---|---|
| Host model | GoodRec-style: unpaid community volunteer; plays free in games they host |
| Host powers | Roster + check-in, share/promote, team assignment, post-game wrap-up report |
| Share mechanism | Both: opt-in auto-alert subscriptions (SMS) **and** manual share link with prewritten blurb |
| Application | Extend the careers ATS with a `host` role |
| Application media | Full uploads: two videos (motivation + greeting/rules demo) and a profile photo, to R2 |
| Assignment | Admin assigns **and** hosts self-claim unhosted games; admin can always override |
| Architecture | Approach A: dedicated `host_profiles` table + `hostUserId` on sessions (not a global RBAC enum value, not an org-membership role) |
| Host capacity | Host's comp booking counts toward capacity but **bypasses** the capacity gate (may overfill by one) |

## Data model

### New table: `host_profiles` (new file `src/lib/db/schema/hosts.ts`)

- `id`
- `userId` → users; `organizationId` → organizations; **unique `(userId, organizationId)`**
- `status` — new enum `host_profile_status`: `active | paused | revoked`
- `preferredVenueId` → venues, nullable (drives the self-claim list)
- `bio` text; `photoUrl` (R2) — copied from the approved application; shown on the public game page ("Hosted by …")
- `applicationId` → `job_applications`, nullable, on delete set null (provenance)
- `approvedByUserId` → users, nullable; `createdAt` / `updatedAt`

### `drop_in_sessions` — two new columns

- `hostUserId` → users, nullable, on delete set null (same convention as `createdByUserId`). Writes must validate the user has an **active** host profile in the session's org.
- `fillAlertSentAt` timestamptz, nullable — one "needs players" blast per session, ever.

### `drop_in_bookings` — one new column

- `referralSource` varchar, nullable — captures the `?src=` param present at booking time (`host-share`, `fill-alert`, …) for attribution. Absent param → null.

### `drop_in_rate_card` — two new per-org config columns

- `fillAlertWindowHours` int, default 24
- `fillAlertThresholdPct` int, default 60

A session qualifies for a fill alert when it starts within the window and confirmed count < threshold% of capacity.

### New table: `pickup_alert_subscriptions`

- `id`; `userId` → users (required — subscribers are account holders; SMS consent stays in `phone_opt_ins`, enforced by `sendSms`)
- `organizationId` → organizations
- `venueId` → venues, nullable (null = all locations)
- `sport` varchar, nullable (null = all sports; matched against `drop_in_sessions.sportOrClassLabel` — there is no sport FK)
- `active` boolean; `unsubscribedAt` nullable; timestamps
- **Unique `(userId, organizationId, venueId, sport)`**

### New table: `host_game_reports`

- `id`; `sessionId` → drop_in_sessions, **unique** (one report per game)
- `hostProfileId` → host_profiles
- `summary` text; `incidentFlagged` boolean; `incidentDetails` text nullable
- `createdAt`

No-show marking is NOT stored here — it reuses the existing booking status machinery (`no_show`).

### Enum additions (idempotent migrations, per-file runner pattern)

- `job_application_role`: add `host`
- `drop_in_payment_method`: add `host_comp` (the host's free booking)

### Host comp booking

Assigning/claiming a host auto-creates a `confirmed` booking for them: `amountPaidCents = 0`, `paymentMethod = 'host_comp'`. Unassigning/revoking cancels it. It counts toward capacity in all counts but its creation bypasses `checkSessionCapacityLocked` (a host claiming a full game overfills by one — the host is at the field running the game either way).

## Host application flow

**Public form** — `host` joins `src/lib/careers/roles.ts` with GoodRec-inspired copy ("Lead your community. Play for free."). Role-specific fields on the existing apply page:

- Contact: name, email, phone, DOB
- Experience: games played (`0 / 1–3 / 3–5 / 5+`, self-reported), preferred location (org venue picker), weekly-commitment confirmation (yes/no)
- Profile: bio (3–4 sentences), profile photo upload
- Videos: motivation video; greeting/rules-demo video

**Uploads:** apply endpoint issues R2 upload URLs following the existing resume pattern. Caps ~100MB/video, ~5MB photo; types mp4/mov/webm and jpg/png/webp. Keys stored on the application row under a `host-applications/` R2 prefix. Without R2 env locally, upload fields degrade to link inputs (feature-inert-when-unconfigured convention).

**Admin review** — applications admin gains the `host` role filter; detail view renders photo + inline video playback + answers. Actions:

- **Approve** (host analog of `hire.ts`): creates or links the user account by email → creates `host_profiles` row (`active`, copying bio/photo/preferred venue) → stamps application `hired` → sends welcome email/SMS linking to `/host`.
- **Archive**: existing behavior, optional rejection email.

**Notion sync**: free, since rows live in `job_applications`. Videos sync as R2 links, not file copies.

## Host portal (`/host`, phone-first)

**Middleware:** `/host/**` requires auth (new prefix rule in `src/middleware.ts`). Active-host enforcement via new helpers in `src/lib/auth/`: `requireActiveHost(locals)` and `requireHostOfSession(locals, sessionId)` — used by every `/host` page and `/api/host/**` endpoint (coach-helper pattern). Paused/revoked profiles see a friendly "hosting is paused" page, not a 403.

**`/host` dashboard:**
- *My upcoming games* — sessions where `hostUserId` = me
- *Games needing a host* — unhosted `pickup` sessions at my preferred venue, soonest first, with fill meters
- **Claim** — transactional (`SELECT … FOR UPDATE` on the session): guards still-unhosted + `scheduled` + profile active; sets `hostUserId` + creates the comp booking. Loser of a claim race gets "someone beat you to it."
- **Unclaim** — allowed until the rate card's `cancelWindowHours` before start; after that, the UI says to contact the org.

**`/host/games/[id]` game-day view — four zones:**
1. **Fill status** — capacity meter (booked/capacity, waitlist count) reusing the listing count logic; "needs players" state under the rate-card threshold.
2. **Share** — Web Share API with copy-link fallback; prewritten blurb (game, venue, time, spots left) linking to `/dropin/[id]?src=host-share`. The `src` param is recorded on resulting bookings for attribution.
3. **Roster + check-in** — confirmed/waitlisted list; tap to set/undo `checkedInAt`; team assignment via existing `teamCount`/`teamColors` machinery. A host-scoped, phone-first rebuild of `AttendancePanel`'s logic (not a reuse of the admin component).
4. **Wrap-up** (available from game start) — mark no-shows (booking status), summary note, incident flag. Submits the `host_game_reports` row; incidents notify org staff via the existing staff-notifications channel.

All `/api/host/**` endpoints re-verify session ownership + org scoping server-side. The host role grants nothing beyond sessions where `hostUserId` = the caller.

## Fill tracking, subscriptions, auto-alerts

**Subscribe surface:** "Text me when games need players" card on `/adult/pickup`, `/soccerone/pickup`, `/dropin`, and `/dashboard/play`. Signed-in users pick location (or all) + sport (or all); missing SMS consent triggers the existing `phone_opt_ins` flow first. Signed-out visitors get a sign-in prompt. Manage/unsubscribe on `/dashboard/play`; carrier STOP already honored by the SMS compliance layer.

**Cron `check-fill-alerts`** (new endpoint under `src/pages/api/cron/`, CRON_SECRET-authed, ~every 15 min):
1. Select `pickup` sessions: `scheduled`, starting within the org's `fillAlertWindowHours`, confirmed count < `fillAlertThresholdPct` of capacity, `fillAlertSentAt IS NULL`.
2. Per session: active subscriptions matching org + venue (or null) + sport (or null), excluding users with an active booking on that session.
3. Stamp `fillAlertSentAt` **before** dispatching the batch (a crashed run can't double-blast).
4. Send via `sendSms` (opt-in enforced there; `MESSAGING_MOCK` honored): e.g. *"⚽ Pickup at {venue} {Tue 7pm} has {n} spots open — {price}. Grab one: {url}?src=fill-alert"*.
5. Per-user daily cap: max 2 fill-alert texts/day, checked at dispatch.

**Fill state chips (UI):** derived client-side from data the listing API already returns — `Almost full` (≥80%), `Filling` (≥ threshold), `Needs players` (< threshold within alert window). Shared derivation helper used by browse cards and the host game view. No new queries.

## Admin surfaces

- `SessionForm`: host picker (active hosts in the org). `AdminSessionDetail`: show host, reassign/remove (remove cancels the comp booking, optionally texts the host).
- New **Hosts** tab on `/admin/dropins`: host roster (status, games hosted, last report), pause/revoke actions, incident-flagged reports surfaced.
- Applications admin: `host` filter + inline video playback.
- All admin endpoints tenant-scoped via the `requireSameOrg*` / `requireOrgAdminAccess` helpers, per repo convention.

## Error handling

- **Claim race:** transaction + row lock; loser gets a friendly conflict message.
- **Revoke/pause mid-assignment:** revoke unassigns the host from future sessions and cancels comp bookings; past sessions keep the historical record.
- **Session cancelled:** existing cancellation flow additionally notifies the host and cancels the comp booking.
- **Application upload failure:** form preserves entered answers; per-file retry.
- **Missing R2 env (local):** upload fields degrade to link inputs.

## Testing

- `tests/unit/`: fill-state derivation, alert-eligibility logic, share-blurb builder.
- `tests/api/`: claim/unclaim (incl. race + full-session bypass); host endpoint authz (non-host 403, host of session A cannot touch session B — tenant-isolation pattern); approve-application → host profile creation; cron alert run under `MESSAGING_MOCK=1` asserting recipients, exclusions, and one-blast semantics.
- `tests/e2e/`: one host-portal happy path (claim → check-in → wrap-up). Runs post-merge only (`test-full`), so it must get a local run before merging (`PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- <spec>`).

## Out of scope (v1)

- Paid hosts / payroll integration (hosts are unpaid volunteers)
- Host ratings or player feedback on hosts
- Host-created sessions (hosts claim/are assigned to admin-created sessions only)
- Non-account phone-only alert subscribers
- In-app video recording for applications (upload only)
