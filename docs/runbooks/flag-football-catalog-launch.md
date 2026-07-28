# Runbook: Flag Football Catalog Go-Live

**Audience:** Owner/founder, executing in the **production** admin (`/admin/programs`, `/admin/seasons`). No engineering involvement required — every step below is a click-through in the live admin UI.

**Goal:** Create the real catalog rows (sport, program, age group, 4 seasons) so `/adult/leagues/flag-football` and `/sports/flag-football` go live with real, registerable data — mirroring the fixture already verified in staging (`src/lib/db/seeds/seed-e2e-tests.ts`, `seedFlagFootballFixture`).

**Do NOT** run any seed script against prod. `src/lib/db/seeds/seed-e2e-tests.ts` is staging-only (refuses to run unless `DATABASE_URL` contains "staging" or `ALLOW_E2E_SEED=yes`) and is not the path for real catalog data per `docs/CLAUDE.md`'s "Database write surface" section. Everything here goes through the admin UI, which calls the same `/api/admin/*` endpoints a script would — just tenant-scoped and audited under your session.

---

## Step 0 — Check for an existing Worthington location

Go to **Admin → Locations** (`/admin/locations`). The adult soccer catalog already uses a Worthington location for `docs/location-pages` (venue-first pages). If a `Worthington` location already exists for the org, reuse it — do not create a duplicate. Only create a new one if it's genuinely missing.

## Step 1 — Confirm the admin path for sport creation (verification, not a runbook step)

`POST /api/admin/sports` (`src/pages/api/admin/sports.ts`) is the only sport-creation endpoint, and it's tenant-scoped via `requireOrgWideAdminAccess`. The admin UI **does** expose a full create form for it:

- `/admin/sports` redirects (301) to `/admin/programs?tab=sports`.
- The **Sports** tab renders `SportsList` (`src/components/admin/sports-list.tsx`), which has an **"Add Sport"** button opening a dialog with Name, Slug, Icon, Color, Active, Sort order — submitting `POST /api/admin/sports`.

No new UI is needed; the supported path is the Sports tab. (If this ever regressed, the fallback would be an authenticated `POST /api/admin/sports` from the admin's own session — not a seed script.)

## Step 2 — Create the sport

**Admin → Programs → Sports tab → Add Sport.**

| Field | Value |
|---|---|
| Name | Flag Football |
| Slug | `flag-football` |
| Icon | 🏈 (optional, matches staging fixture) |
| Color | `#f59e0b` (optional, matches staging fixture) |
| Active | checked |

## Step 3 — Confirm or create the age group

**Admin → Programs → Age groups tab.** Look for **"Adult 18+"** (min age 18, max age 99). If it doesn't already exist (it may, from the adult soccer catalog), add it:

| Field | Value |
|---|---|
| Name | Adult 18+ |
| Min age | 18 |
| Max age | 99 |
| Description | Ages 18 and up |

Reuse the existing row if soccer already created it — don't create a duplicate "Adult 18+".

## Step 4 — Create the program

**Admin → Programs → Programs tab → Add Program.**

| Field | Value |
|---|---|
| Location | Worthington |
| Sport | Flag Football |
| Name | Adult 4v4 Flag Football League |
| Slug | `adult-4v4-flag-football` |
| Program Type | League |
| Description | Adult 4v4 flag football league |
| Space | leave unassigned unless a specific field/turf is already booked |

## Step 5 — Create the 4 seasons

**Admin → Seasons → Add Season.** Create these four rows against the **same program** (Adult 4v4 Flag Football League). Fields not listed below (Space, Max players, Schedule notes, Skill level) can be left blank/default.

### Shared values (all 4 seasons)

| Field | Value |
|---|---|
| Age Group | Adult 18+ |
| Signup modes | both **Individual / free agent** and **Team** checked |
| Individual price | **$105.00** |
| Team price | **$795.00** |
| Deposit | **$200.00** (and check **"Allow deposit payment option"**) |
| Day (Night) | **Wed** |
| Start time | 18:00 |
| End time | 23:00 |

**Early-bird — optional, team-only by policy.** The repo convention (see `docs/CLAUDE.md` and the "Early-bird: per-player vs team" note) is that early-bird pricing is **team-only** — mixing an early-bird discount into per-player pricing previously caused an 8.3x overcharge incident. The admin form already enforces this structurally: "Early-bird team price" and "Early-bird deadline" are only enabled when the Team checkbox is on, and there is no equivalent early-bird field for the individual price. If you want to offer an early-bird rate, set **Early-bird team price** to something below $795 and set an **Early-bird deadline** before `registrationCloses`. Leave both blank for no early-bird (the staging fixture ships with no early-bird set).

### Per-season values

| # | Season Name | Slug | Division gender | Status | Start date | End date | Registration closes | Term label | Term slug |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Men's — Winter 1 2026-27 | `winter-1-2627-flag-mens` | Men's | **Open** | 2026-11-09 | 2027-01-17 | **2026-10-29** | Winter 1 2026-27 | `winter-1-2627` |
| 2 | Co-Ed — Winter 1 2026-27 | `winter-1-2627-flag-coed` | Coed | **Open** | 2026-11-09 | 2027-01-17 | **2026-10-29** | Winter 1 2026-27 | `winter-1-2627` |
| 3 | Men's — Winter 2 2027 | `winter-2-2027-flag-mens` | Men's | **Forming** (shows as "upcoming" on the landing page) | 2027-01-18 | 2027-03-20 | leave blank | Winter 2 2027 | `winter-2-2027` |
| 4 | Co-Ed — Winter 2 2027 | `winter-2-2027-flag-coed` | Coed | **Forming** (shows as "upcoming" on the landing page) | 2027-01-18 | 2027-03-20 | leave blank | Winter 2 2027 | `winter-2-2027` |

**Status note:** the admin's Status dropdown has no literal "Upcoming" option — the landing page derives "Now Registering" vs "upcoming" from the season's lifecycle status (`src/lib/leagues/terms.ts`, `partitionTerms`): any season with status `open` or `active` is treated as the **current** term; any season with status `forming` is treated as **upcoming**. So Winter 2's two rows must be set to **Forming**, not "Draft" or "Open" — "Draft" is invisible to the public catalog entirely, and "Open" would make Winter 2 register-able before Winter 1 even closes.

**Registration-closes note:** the field help text says "leave blank to auto-close the day after the start date." Winter 1's `registrationCloses` must be set explicitly to **2026-10-29** (in the org's local timezone; the admin form takes a date and stores end-of-day) — do not leave it blank, or it will auto-close on the season start date (2026-11-09) instead, several weeks too late relative to policy.

**Two rows per term, one term slug:** Men's and Co-Ed are two separate `seasons` rows sharing the same `termSlug`/`termLabel` — this is what makes them show up as one term with two division tabs on `/adult/leagues/flag-football/winter-1-2627`, matching how the Wednesday soccer league divisions work.

---

## Step 6 — Post-creation checks

Do these against prod immediately after saving all 4 seasons:

1. **`/adult/leagues/flag-football`** — the hero should show the "● Now Registering" banner with "Winter 1 2026-27 · registration open," and Winter 2 2027 should appear in the upcoming-terms list with "registration opens soon."
2. **`/sports/flag-football`** — resolves and lists the program (confirms the sport/program/season chain is wired correctly for the general sports catalog, not just the adult-leagues route).
3. **`/adult/leagues/flag-football/winter-1-2627`** — term page loads, shows both Men's and Co-Ed divisions, correct pricing ($105 individual / $795 team / $200 deposit), and the register CTA is live.
4. **$0-risk registration smoke test:** click through "Pick your division & register" for either division, as either an individual or a team captain, far enough to reach the payment step of checkout — then **stop before entering any card details or submitting payment**. This confirms the season is genuinely registerable end-to-end (capacity, waiver, age-group gating) without moving real money or seeding a real registration record you'd need to clean up.

If any of the above fails, don't debug live in prod — check the season rows against the tables above first (status, signupModes, termSlug match across the pair) before escalating to engineering.
