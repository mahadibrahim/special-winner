# Forming / interest-list season state — design spec

**Date:** 2026-06-13
**Status:** draft — pending founder review
**Trigger:** the 2026–27 catalog build (fall→spring, ~70–80 draft seasons). Founder decision: advertise the *full* division grid from day one even though fall won't fill it, and open paid registration selectively as demand reveals itself. This state must land **before** the seed so the advertised grid has somewhere to land.

## Context

The catalog build seeds a mature-operator grid — ~18 adult league divisions/session across both venues plus youth, futsal, and the Drop League — but launch demand is one or a few divisions. The founder wants the catalog to *look* established and act as a demand sensor (which divisions collect interest tells us what to run), without the trust-killer of taking $1,050 for a division that has three teams and never runs.

The rule this spec encodes: **advertise broadly, open paid registration selectively.** A division that isn't open yet is visible with a "Join the interest list" CTA, not a checkout.

## What exists today — and the gap

- **`draft`** → hidden from the public catalog. Not advertised. (After PR #189, `/api/public/seasons` clamps to `PUBLIC_STATUSES = ['open','active']`; drafts never leak.)
- **`open` / `active`** → live paid registration via the registration wizard.
- **Waitlist** (`src/lib/waitlist/`, `pickup-card.tsx`) → triggers only when a season is **full** (`spotsLeft === 0`). Over-demand. The opposite of launch.
- **`empty-notify-form`** → captures email, but only when the **whole catalog** is empty (org-wide dead-end rescue). The moment one division opens, the empty state disappears and the other ~70 advertised divisions have nowhere to capture interest.

**The missing state:** a per-division *visible but not-yet-fillable* status that collects interest instead of payment. That is this spec.

## Goals

1. A division can be **advertised** (visible on the public catalog, in sport/location filters, with day/venue/price context) while collecting interest rather than payment.
2. Interest capture is **per-division**, deduped, and gives admin a **count per division** — the signal to decide what to open.
3. Going live runs a **priority window**: the interest cohort is emailed with a **deadline to register before the inventory opens generally** — rewarding early interest and creating honest urgency.
4. Zero risk of taking money for a league that won't run: forming divisions have **no checkout path**, and interest is **free** (no deposit).

## Non-goals

- Paid deposits/holds to harden the signal (a possible v2; v1 is free email capture).
- Changing the existing registration, waitlist, or drop-in flows. Forming is additive.
- A separate marketing site. Forming renders inside the existing catalog (`programs-catalog`, category pages, location hubs).

## Design

### 1. New season status: `forming`

Add `forming` to `seasonStatusEnum`. Lifecycle:

```
draft  →  forming  →  open + priority window  →  open + general  →  active  →  completed
(hidden)  (advertised,  (registrable; cohort      (registrable;     (in       (done)
           interest      emailed, deadline to      public Register   season)
           capture)      claim before general)     button shows)
                                          ↘ closed / cancelled (existing)
```

- `forming` is publicly **visible** but **not registrable** — the seed's landing state for the advertised grid.
- The **priority window** is NOT a new status. It is the `open` status plus a `generalAvailabilityAt` timestamp: while `now < generalAvailabilityAt`, the season is registrable but the public catalog does not yet show a Register button — only the interest cohort has the deep link (from their email). At/after `generalAvailabilityAt`, the public Register button appears. When `generalAvailabilityAt` is null, opening is immediately general (no priority window).
- A new status value for `forming` (not a boolean flag on `open`) keeps the invariant **`open` = registrable** intact. Every query and admin badge already switches on `status`; a flag would force every call-site to learn a second axis. **Adopted:** new enum value `forming`; priority window as a timestamp on `open`. **Rejected:** `open` + `interestOnly` flag; a separate `priority` status (the timestamp is enough and reuses the registration machinery).

### 2. Public catalog behavior

- Extend `PUBLIC_STATUSES` in `/api/public/seasons` to `['open','active','forming']`. (The allowlist constant from PR #189 is the single edit point.)
- The seasons API response gains a derived field **`signupMode: 'register' | 'priority' | 'interest'`**: `forming` → `'interest'`; `open` with `now < generalAvailabilityAt` → `'priority'`; otherwise → `'register'`. The card branches on this, not on raw status — keeps card logic declarative.
- Sorting: **open (register) first, then priority, then forming**, each by start date. Live divisions lead; forming fills the grid beneath.
- `getPublicSports` / `getPublicLocations` (`src/lib/programs/public-filters.ts`) extend their `IN ('open','active')` clause to include `forming`, so an advertised-only sport/venue still appears in filters.
- Card CTA by `signupMode`:
  - `interest` → **"Join the interest list"** (opens capture form), **"Forming"** chip, planned day/venue/price shown.
  - `priority` → **"Opening {generalAvailabilityAt}"** with a soft "Notify me" — no public Register button yet (the cohort registers via their emailed link). Signals "this league is happening, spots filling."
  - `register` → **"Register"** (existing flow).

**Interest is free — no deposit.** The per-season deposit (`depositCents` / `allowDeposit`) is a *registration* feature and is unchanged: teams pay the deposit at registration and clear the balance by `registrationCloses`/a set date. Interest capture takes an email only; requiring payment to express interest would suppress the demand signal this state exists to read.

### 3. Interest capture — new table (newsletter_signups can't hold this)

`newsletter_signups` is `unique(email)` — one row per person globally — so it cannot store per-division interest. New table:

```
season_interest
  id              uuid pk
  season_id       uuid → seasons(id) on delete cascade
  organization_id uuid → organizations(id) on delete set null   -- tenant scope
  email           varchar(320) not null
  first_name      varchar(100)
  created_at      timestamptz default now()
  unique (season_id, lower(email))     -- one interest per person per division
  index (season_id)                    -- per-division count + listing
```

- New endpoint **`POST /api/public/season-interest`** `{ seasonId, email, firstName? }`: validates the season is `forming` and tenant-owned, upserts on `(season_id, lower(email))` (idempotent — re-submitting is a no-op success), rate-limited per-IP like the newsletter endpoint (5/min).
- **Also upserts the email into `newsletter_signups`** (source `interest-<sport>-<venue>` or `interest-<seasonSlug>`) so interest feeds the general marketing list — the existing capture-incentive email can fire here too.
- Brand-aware: inherits `locals.organization` + brand context exactly like the newsletter endpoint, so SoccerOne capture works unchanged.

### 4. Conversion: threshold → priority window → general availability

The conversion is a **priority window** that rewards the interest cohort with first claim on a limited inventory, then opens to everyone.

1. **Threshold (advisory).** Each division can carry an optional `interestThreshold` (e.g. enough emails to plausibly fill the team slots). When the `season_interest` count crosses it, the admin **attention feed** surfaces the division as "ready to launch." The threshold prompts; it never auto-launches — the founder clicks to go live (avoids launching on soft demand).
2. **Go live with a priority window.** Admin flips `forming → open` and sets `generalAvailabilityAt` (a deadline, e.g. now + 72h, or a fixed date). This:
   - Makes the division **registrable** (status `open`).
   - Emails the entire `season_interest` cohort: *"{division} is happening — you have until {generalAvailabilityAt} to claim your team's spot before we open it to everyone,"* with a **direct register deep link** (`/register/{seasonId}`).
   - Keeps the **public catalog** showing the card as `priority` ("Opening {date}") — no public Register button yet. The cohort registers via the emailed link; remaining inventory is held for them.
3. **General availability.** At `generalAvailabilityAt`, the public Register button appears (`signupMode` flips to `register` purely on the timestamp — no admin action needed). Any unclaimed team slots open to all.

- **Access during the window is soft, not hard-gated:** the register link works for anyone who has it, but only the cohort is told and the public button is hidden. Adequate for a niche local league; a hard email-gate at checkout is a noted v2 option if leagues routinely oversubscribe.
- `season_interest` rows are retained after conversion (analytics: interest → registration funnel; 1:1 outreach to non-converters).
- Reuses transactional email infra (`src/lib/email/send`) and the attention feed (`src/lib/admin/attention-feed.ts`).

### 5. Admin

- **`seasons-list.tsx` / `season-hub-layout.tsx`:** add a `forming` status badge (amber) to `STATUS_STYLES`, and show an **interest count** (`N interested`) on forming seasons.
- **Status transition control:** draft → forming → open as explicit buttons ("Advertise" / "Open registration"). Reversible (open → forming → draft) for mistakes.
- **Interest detail:** per-season list of interested emails + CSV export, so the founder can see who's waiting and reach out 1:1 (captain outreach is a known motion).

### 6. Emails & analytics

- **Interest confirmation** (optional, recommended): "You're on the list for {division} — we'll email you when registration opens." Reuses transactional send.
- **PostHog events** (existing tracking layer, see project memory): `season_interest_submitted` (props: seasonId, sport, venue, audience, brand) and, on conversion, tie registration back to a prior interest for a funnel.

## Schema / migration notes

- `forming` enum value: `ALTER TYPE season_status ADD VALUE IF NOT EXISTS 'forming';` — additive, idempotent (follow the 0023/0024 pattern; enum `ADD VALUE` can't run inside a transaction block with other DDL — keep it isolated).
- `seasons` gains two nullable columns (`ADD COLUMN IF NOT EXISTS`):
  - `general_availability_at timestamptz` — when set on an `open` season, the priority window runs until this moment (public Register button hidden; cohort registers via emailed link). Null = open immediately to all.
  - `interest_threshold integer` — advisory count that flags the division as "ready to launch" in the attention feed. Null = no prompt.
- `season_interest` table: `CREATE TABLE IF NOT EXISTS`, with the partial-safe unique index. Generate via `db:generate`, review, commit (per CLAUDE.md — `db:push` is local-only).

## Edge cases

- **Already registrable:** a season can't be both forming and open — status is single-valued, so no conflict.
- **Capacity / full:** forming has no registrations, so `spotsLeft` is N/A; the card shows "Forming," never "Waitlist."
- **Test fixtures:** `is_test` filtering already applies; forming respects it.
- **Prerender:** catalog pages are SSR (read request-time catalog), unaffected by the new status.
- **Dedup across divisions:** intended — a person may be interested in many divisions; the unique constraint is per `(season, email)`, not per email.
- **Spam:** same rate-limit + tenant-scope guards as the newsletter endpoint; unauthenticated write, so cap and validate.

## Phasing

- **Phase 1 (before the seed — the blocker):** `forming` enum value; `season_interest` table; `POST /api/public/season-interest`; extend `PUBLIC_STATUSES` + `public-filters`; `signupMode` (`interest`/`register`) on the seasons API; card CTA branch + interest capture form; admin `forming` badge + per-division interest count + draft↔forming↔open transitions. Enough to **seed the grid as forming and collect signal** — which is all the seed needs.
- **Phase 2 (before the first go-live, not the seed):** the priority window — `general_availability_at` + `interest_threshold` columns; `priority` `signupMode` + the "Opening {date}" card; the cohort conversion email with deadline + deep link; attention-feed "ready to launch" prompt; interest confirmation email; CSV export; PostHog interest→registration funnel. This lands when the first divisions fill (weeks after the seed), so it doesn't block the catalog.
- **v2 (optional):** hard email-gate at checkout during the priority window; refundable interest deposit — only if leagues routinely oversubscribe.

## Open decisions (recommendation in bold)

1. **Deposit on interest?** → **No — interest is free (email only).** Decided with founder 2026-06-13: the deposit is a registration feature (already built); interest is an earlier, frictionless signal step. A deposit at interest would suppress the signal.
2. **Auto-launch at threshold, or admin-initiated?** → **Admin-initiated.** The threshold is advisory (flags "ready to launch" in the attention feed); the founder clicks to go live and sets the priority-window deadline. Avoids launching on soft demand.
3. **Priority-window length default?** → **72 hours** (confirmed, founder 2026-06-13) as the default `general_availability_at` offset; admin can override to a fixed date. Long enough for a captain to rally a team, short enough to keep urgency.
4. **Soft vs hard priority gate?** → **Soft for v1** (register link works for anyone who has it; only the cohort is told, public button hidden). Hard email-gate at checkout is v2 if oversubscription becomes real.
5. **Show planned price on a forming card?** → **Yes** — price + day + venue is the IA principle from the public-IA redesign; hiding it weakens the advertising. Label the fee as planned.
6. **Drop the `empty-notify-form` once forming exists?** → **Keep it** as the true-empty fallback (a brand with zero catalog); forming covers the populated case.

## Relationship to the seed

Seed all ~70–80 divisions as `draft`, then set the advertised slate to `forming` (the whole grid shows, collecting interest), and `open` only the 3–4 divisions credibly fillable for fall. The preview HTML (`docs/research/2026-2027-calendar-preview.html`) already labels every division "seeded as a draft, flipped open as teams commit" — `forming` is the intermediate rung that makes that real.
