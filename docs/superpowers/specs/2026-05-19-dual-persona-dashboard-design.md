# Dual-persona dashboard — design

## Problem

The signed-in `/dashboard` was built for one use case: a **parent managing
children** in youth programs. That use case is still valid. But a growing
part of the business is **adults** who play in leagues, pickup/drop-in
games, and tournaments. The current dashboard hard-loads parent-only
sections (children overview, coach notes, "how we coach") and has no
concept of an adult player. Adult-relevant components exist
(`MyDropInBookings`, `MyFieldRentals`) but live off on `/dashboard/bookings`,
not the main page.

## Goals

- Serve parents and adult players each a dashboard that fits their job.
- Support the user who is **both** a parent and an adult player.
- Give administrative content (invoices, settings, personal details) a
  proper, persistent home.
- Keep the two dashboards deliberate siblings — one shared structure.

## Decisions (settled during brainstorming)

1. **Two explicit destinations** — `Family` and `My Play` — not a unified
   data-driven page and not a mode toggle.
2. **Conditional visibility** — the nav exposes a destination only once the
   user has data for it. A parent-only user never sees `My Play`; a
   player-only user never sees `Family`.
3. **My Play v1 scope** — all four content clusters: league play,
   pickup/drop-in, tournaments, account essentials.
4. **Landing** — `/dashboard` redirects; a "both" user lands on whichever
   destination they visited last; a brand-new user lands on a get-started
   screen.
5. **Both dashboards reworked to match** — shared shell, shared
   section components, consistent layout.
6. **Architecture** — Astro pages + a shared `DashboardShell` + React
   island sections (matches the existing BaseLayout pattern).
7. **Information architecture** — four job-driven sections, urgency-ordered,
   identical skeleton on both destinations.
8. **Account area** — a separate `/account` space for administrative
   content, reached from the avatar dropdown menu.

## Persona model

The data model already distinguishes the two cases on `family_members`:

- `parentUserId` set → a **dependent** (the user is a parent)
- `selfUserId` set → a **self** (the user is an adult player)
- a DB CHECK enforces exactly one of the two

A single user may have both kinds of rows. There is no persona flag on
`users` and none is added — persona is **derived**, not stored.

### `getDashboardDestinations(userId)`

One helper, the single source of truth for "which destinations does this
user have." Returns `{ hasFamily: boolean, hasPlay: boolean }`.

- `hasFamily` — user has ≥1 `family_members` row with `parentUserId = userId`
- `hasPlay` — user has ≥1 `family_members` row with `selfUserId = userId`
  **or** ≥1 drop-in booking **or** ≥1 field rental (so an adult who only
  ever did a pickup, without a registration, still counts)

Used by the `/dashboard` redirector and by `DashboardShell` (to decide
whether to render the destination tabs).

## Routing

| Route | Purpose |
|-------|---------|
| `/dashboard` | Thin Astro redirector — no UI of its own |
| `/dashboard/family` | The parent dashboard |
| `/dashboard/play` | The adult-player dashboard |
| `/dashboard/start` | Get-started screen for zero-data users |
| `/account/*` | Administrative area (see below) |

### `/dashboard` redirect logic

- neither destination → `/dashboard/start`
- family only → `/dashboard/family`
- play only → `/dashboard/play`
- both → read the `aspire_dash` cookie and redirect to last-visited;
  default to `/dashboard/family` when no cookie is set

Visiting `/dashboard/family` or `/dashboard/play` writes `aspire_dash`
(`family` | `play`) so the next `/dashboard` hit lands in the same place.
The cookie only sets a landing default — it hides nothing; both
destinations stay reachable via the always-visible tabs.

`/dashboard/**` already requires auth via `src/middleware.ts`; the new
sub-routes inherit that. All four pages are SSR (no `prerender`) — they
depend on `Astro.locals.user` and request-time redirects.

## Navigation

The Family / My Play switch is a **tab pair inside the dashboard**, just
under the header (not in the global site nav). The global nav keeps a
single `Dashboard` link.

- A user with **one** destination sees no tabs — just their dashboard.
- A user with **both** sees `Family | My Play` tabs in the shell.

The global nav's avatar becomes a small dropdown: **Account**, **Sign out**.

## Information architecture

Every dashboard — Family and My Play — is the **same four sections**,
top-to-bottom by urgency. Only the content inside differs. This shared
skeleton is what makes them siblings.

### 1 — Needs your attention *(job: complete actions)*

Time-sensitive items requiring the user to act. **Hidden entirely when
empty** — it is a signal, not a permanent header.

- *Family:* outstanding child balance, unsigned waiver, phone verification
- *My Play:* field-rental hold expiring, league balance due, unconfirmed
  roster spot, available check-in

Urgent billing items deep-link into `/account/invoices` to resolve.

### 2 — What's coming up *(job: stay ahead)*

The forward-looking, time-ordered feed.

- *Family:* the children's upcoming games and practices
- *My Play:* the player's next league game (given prominence), upcoming
  pickup sessions, tournament rounds

### 3 — What you're part of *(job: understand membership)*

The stable, entity-ordered picture of involvement.

- *Family:* each child → their programs, teams, coach notes, progress
- *My Play:* the player's teams (roster + standing), leagues, active
  registrations, tournament entries

### 4 — Explore *(job: market new services)*

The growth surface. **Always shown.** Register for the next season, join
another league, book a field, and the cross-program nudge (an adult player
sees kids' camp at Worthington; a parent sees adult leagues).

### Layout

The page is a single vertical flow of the four sections. Within sections 2
and 3, content may use an internal two-up grid on wide screens (e.g. a wide
"next game" card beside a stack of secondary items); on mobile everything
is single-column.

## Account area

A dedicated administrative space, separate from the task-oriented
dashboards, reached from the avatar dropdown. Universal — every signed-in
user has one.

| Route | Holds |
|-------|-------|
| `/account/invoices` | Payment history, receipts, outstanding balances, saved payment methods |
| `/account/notifications` | Email/SMS/Telegram preferences, messaging settings |
| `/account/profile` | The account holder's own name, email, phone |
| `/account/security` | Password |
| `/account/consents` | Signed-document record (waivers, media auth) |

Existing components relocate here largely unchanged: `payment-history`,
`payments-summary`, `notification-settings`, `messaging-settings`,
`profile-settings`, `password-change`, `manage-consent`,
`phone-verification-client`, `telegram-connect-banner`.

**Boundary:** Account holds only the *account holder's own* data. Managing
a **child's** profile (medical notes, emergency contacts) stays in the
Family destination — that is "your kid," not "your account."

## Architecture

Astro pages + a shared shell + React island sections — the existing
`BaseLayout` + client-island pattern.

- `DashboardShell.astro` — header (greeting, avatar), the destination tabs
  (rendered only for both-users), the section grid. Consumed by both
  `/dashboard/family` and `/dashboard/play`.
- Shared section primitives — `DashboardSection` (titled section wrapper),
  reused card components — so Family and My Play compose from the same
  parts.
- Section bodies are React islands (`client:visible`), as today.
- `/dashboard` and `/dashboard/start` are thin Astro pages.

## Data layer

### Reused as-is (endpoints already exist)

drop-in bookings, field rentals, registrations, payments, announcements,
team-groups.

### New player-facing endpoints

The `teams` / `rosters` / `games` / `standings` tables exist but nothing
exposes them to a player. All three are tenant-scoped per the repo
convention.

- `GET /api/dashboard/play/teams` — the player's teams, derived from their
  self-registration → roster entries, with win/loss record
- `GET /api/dashboard/play/games` — upcoming games for the player's teams
- `GET /api/dashboard/play/standings` — division standings for the
  player's team's season

### Tournaments v1

No bracket data model exists. v1 scopes "tournaments" to **tournament-type
programs the player is entered in plus their game schedule** (read via the
games endpoint). A true bracket is out of scope — see below.

## States

Use the repo's shared primitives — `ErrorBanner`, `EmptyState`,
`LoadingSkeleton`.

- Section 1 — hidden entirely when there is nothing pending.
- Sections 2 & 3 — per-cluster `EmptyState` ("No league games yet — browse
  adult leagues"), so a pickup-only player never sees a broken page.
- Section 4 — always shown.
- Each section island owns its own loading and error state.

## Testing

- API tests for the three new `/api/dashboard/play/*` endpoints, including
  tenant-scoping (an admin/player in org A cannot read org B rows).
- API test for `getDashboardDestinations` across the four cases:
  parent-only, player-only, both, neither.
- E2E: each persona lands on the correct destination; a both-user sees the
  tabs and the `aspire_dash` cookie remembers the last visit; a new user is
  routed to `/dashboard/start`. This also fills part of the documented
  season-signup E2E coverage gap.

## Out of scope (future iterations)

- A real tournament **bracket** data model and bracket UI.
- A free-agent / "looking for a team" matching surface (the
  `registrations.lookingForTeam` flag exists but is not used here).
- Any change to the registration wizard.
- **Existing detail pages** (`/dashboard/children/[id]`,
  `/dashboard/registrations/[id]`, etc.) keep their current routes — they
  are linked from within the section content. Re-namespacing them under
  `/dashboard/family/*` or `/dashboard/play/*` is not required for v1.

## Open items carried into the plan

- Final section header wording ("Needs your attention", "What's coming
  up", "What you're part of", "Explore" are drafts — tunable, evergreen).
- Exact `aspire_dash` cookie attributes (httpOnly, SameSite, max-age).
