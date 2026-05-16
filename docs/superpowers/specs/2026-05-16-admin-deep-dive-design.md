# Admin deep-dive — design spec

**Date:** 2026-05-16
**Status:** Draft, pending founder review
**Predecessor:** admin-overhaul (PR #56 shipped 2026-05-16); prod-purge (PR #57 shipped 2026-05-16); CI follow-ups (PR #58, in flight)

## 1. Problem

The admin overhaul (PR #56) reorganized the navigation and shipped the Venue Day + Season Hub surfaces, but many admin pages were left in placeholder or stale states. The founder has named three concrete issues and one umbrella concern:

- `/admin/users` is broken — can't add or manage users from there.
- No bot detection — four Gmail-dot-trick signups reached prod between 2026-05-05 and 2026-05-14 (see `security_prod-bot-signups` memory).
- Many other admin pages "simply don't exist or work."

The prod DB was hard-reset earlier today (PR #57) to a clean baseline (1 org + 2 locations + 2 users). The site is pre-launch with no customer data to protect, so this is the window to actually fix every admin surface and the spine of the customer journey before public registration opens.

## 2. Goals

- Every super-admin sidebar item works end-to-end, including its detail pages.
- The customer-journey spine — signup → register → pay → confirm — works end-to-end against real Day-0 seed data.
- Bot deterrent on `/signup` shipped: CAPTCHA, dot-trick normalization, unverified-account TTL, short pre-verification session.
- Day-0 seed in prod is real launch data, not test fixtures. The audit doubles as the launch baseline.
- Severity P0/P1/P2 findings all get fixed in this deep-dive; XL-effort items become explicit follow-up issues.

## 3. Non-goals

- Mobile-first redesign of admin (existing tablet behavior preserved; the Venue Day tablet pass from PR #56 stays).
- Post-game flows — assessments, coach notes, player development tracking. Per the founder, these aren't designed yet.
- Curriculum CRUD UI — schema exists but the surface is a separate follow-up.
- Venue-manager testing as a *real* logged-in venue-manager. We test those pages as super-admin (super-admins can see the venue-manager surface via `/admin/venue/**`).
- Customer flows other than the spine — parent dashboard polish, post-game viewing, media album access, etc. Each becomes its own follow-up audit.

## 4. Scope summary

Decisions locked from the brainstorm:

- **Cadence:** breadth-first audit → fix by priority. No fixes during the discovery pass; all findings recorded, then fixed group-by-group.
- **Coverage:** super-admin sidebar + child detail pages + the customer-journey spine. ~30 page-types audited.
- **Data philosophy:** real production data. Day-0 seed rows we create stay in prod as the actual launch baseline.
- **Severity:** all three levels (P0/P1/P2) in scope. XL-effort items deferred with a follow-up issue link.
- **PR structure:** 7 PRs total (audit + bot detection in PR1; 6 fix-group PRs after).

## 5. The audit

### 5.1 What gets audited

| Surface | Pages |
| --- | --- |
| Super-admin home | `/admin` |
| Inbox | `/messages` |
| Plan group | `/admin/seasons` (+ `[id]` Season Hub, 7 tabs), `/admin/programs` (+ Sports + Age groups tabs + per-program detail), `/admin/dropins` (Sessions + Rate card tabs), `/admin/rentals` (Bookings + Rate card tabs + per-rental detail + `/new`), `/admin/campaigns` |
| People group | `/admin/lookup`, `/admin/users` (+ `/[id]`) |
| Money group | `/admin/refunds`, `/admin/payments`, `/admin/discount-codes`, `/admin/gear` (+ products + variants) |
| Setup group | `/admin/locations` (Locations + Venues tabs + per-location `/[id]`), `/admin/branding` (+ `/[id]`), `/admin/curriculum/*`, `/admin/compliance`, `/admin/settings` |
| Reports group | `/admin/reports/revenue`, `/admin/reports/registrations`, `/admin/reports/conversion` |
| Venue (super sees too) | `/admin/venue/day/[date]`, `/admin/venue/check-in`, `/admin/venue/walk-up`, `/admin/refund-requests`, `/admin/announcements`, `/admin/broadcasts`, `/admin/waitlist` |
| Auxiliary | `/admin/teams`, `/admin/games`, `/admin/organizations`, `/admin/media/*`, `/admin/check-in` (legacy redirect) |
| Customer-journey spine | `/`, `/sports/soccer`, `/register/[seasonId]` (wizard), `/signup`, `/m/[token]` magic-link, Stripe Checkout success → `/dashboard` |

### 5.2 Output format

A single markdown file at `docs/superpowers/specs/2026-05-17-admin-deep-dive-audit.md`. One section per page:

```
### /admin/users — Users & staff

Status: BROKEN | PARTIAL | OK | EMPTY-STATE-ONLY
Severity: P0 | P1 | P2 | none
Effort: S (≤2h) | M (~½ day) | L (1-2 days) | XL (≥3 days, deferred)
Fix PR: Plan | People | Money | Setup | Reports | Customer-flow | deferred

Findings:
  - <each issue, one bullet, concrete>

Notes:
  - <any context or business decision needed>
```

XL findings each open a tracked follow-up issue and are noted with the issue number.

### 5.3 Audit method

Performed by a logged-in super-admin against the staging environment after Day-0 seed is loaded. Each page is visited; each affordance on the page is clicked; each detail page is opened. Findings are recorded in the audit markdown, not as inline code edits.

Browser automation (claude-in-chrome MCP) drives the click-through. Console-error capture via `mcp__claude-in-chrome__read_console_messages` catches client-side errors not visible in the UI.

## 6. The customer-journey spine

The end-to-end chain that defines "production ready" for season 1:

```
Step  Action                                                      Verifies
─────────────────────────────────────────────────────────────────────────────────
1     anon GET /                                                  Marketing home renders
2     anon GET /sports/soccer                                     Real Soccer SEO page renders
3     anon GET /register/<season-1-id>                            Wizard step 1 (who) loads
4     anon fills child info → continue                            Wizard step 2 (waiver) loads
5     anon signs waiver → continue                                Wizard step 3 (payment) loads
6     anon enters email; clicks "I'm new" → /signup with CAPTCHA  Bot detection in place
7     verification email arrives at the test inbox                Email pipeline alive
8     click magic link → /m/<token> → /dashboard                  Auth flow works
9     return to /register/<season-1-id>?returning=1               Wizard resumes at payment
10    Stripe Checkout (test mode) → success                       Payment integration alive
11    GET /dashboard                                              Registration appears confirmed
12    admin POV: /admin/seasons/<id> Registrations tab            Admin sees the registration
13    admin POV: /admin/payments                                  Payment row exists
14    admin POV: /admin/venue/day/<game-date>                     Player appears on team roster on game day
```

Each step is a checkpoint. Any failure becomes a P0 finding. The audit PR ships this as a single Playwright spec (`tests/e2e/customer-journey/season-signup.spec.ts`) so a regression breaks CI.

## 7. Day-0 seed

Real launch data, not throwaway. Created in the audit PR. Stays in prod as the actual launch baseline.

### 7.1 Pre-audit snapshot

Before any writes, run `pg_dump` against the Railway prod proxy:
```bash
pg_dump $DATABASE_URL --no-owner --no-acl | gzip > /tmp/aspire-prod-pre-audit-2026-05-17.sql.gz
```
This dump captures the 2-location/2-user post-purge state in case rollback is needed. Not committed to the repo.

### 7.2 What we create

**Sport (1):** `Soccer` — slug `soccer`.

**Venues (~5):**
- Downtown / OSU: `Field 1` (outdoor 7v7 footprint). `{{TBD — confirm exact venue list with partner}}`
- Worthington: `Field A`, `Field B` (indoor), `Field C` (outdoor if applicable). `{{TBD — confirm with partner}}`

**Age groups** (8 — the realistic full set):
- `Adult Co-Ed`, `Adult Open`, `Adult Over 30`, `U6`, `U8`, `U10`, `U12`, `HS`

**Programs (4):**
- `Adult Co-Ed 7v7 League` — programType=`league`, location=Downtown, sport=Soccer, ageGroup=Adult Co-Ed
- `Founders' Tournament` — programType=`tournament`, location=Downtown, sport=Soccer, ageGroup=Adult Co-Ed
- `Adult Open Pickup` — programType=`clinic` (or drop-in if a separate flow), location=Downtown, sport=Soccer
- `Worthington Youth Soccer` — programType=`league`, location=Worthington, sport=Soccer, ageGroup=`U10` (initial; more age groups added later)

**Seasons (3):**
- `Summer 2026 — Adult Co-Ed 7v7` (league, Downtown). 8-team capacity, registration window 2026-05-20 → 2026-06-25, season 2026-07-08 → 2026-08-26. Status: **`open` during the audit**, flipped to `draft` after (per business rule: public reg only after 4 founders' teams commit).
- `Founders' Tournament — June 2026` (tournament, Downtown). 6-team capacity, single-day 2026-06-21. Status: `open`.
- `Summer 2026 — Worthington U10` (league, Worthington). 4-team capacity placeholder. Status: `draft`.

**Teams** (for the open Adult Co-Ed 7v7 season): seed 2 placeholder teams (`Founders Team 1`, `Founders Team 2`) so the Season Hub Teams & rosters tab has content to test.

**Games:** seed 4 games for the placeholder teams across 2 weeks (so Schedule tab and Venue Day both have real data).

**Registrations:** 2 seed registrations to a test parent account, so the admin's Registrations tab + payment listing have rows.

**Discount codes (1):** `FOUNDERS` — 100% off for the founders' team free-registration prize.

**Branding / domain mapping:** verify the existing prod domain resolves to the active org (no row in `domain_mappings` because that table is for subdomains — `aspiresportsohio.com` is resolved via the host-to-org code path in middleware).

**Idempotent seed script:** the seed lives at `scripts/admin-deep-dive-day0-seed.ts` (one-off; deleted after PR1 merges per repo convention). Each insert is `WHERE NOT EXISTS` or upsert-style so re-running is safe.

## 8. Bot detection (ships with audit PR)

Four small components, each independently testable.

### 8.1 Cloudflare Turnstile on `/signup`

- Library: `@marsidev/react-turnstile` (or hand-rolled — the Turnstile widget is a single iframe; no need for a wrapper).
- Site key + secret key go in env vars: `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`.
- Frontend: signup form renders the widget; the resulting token is included in the POST body.
- Backend: `/api/auth/signup` validates the token against Turnstile's verify endpoint before any DB write.
- Fail-closed in production (no token → 400). Fail-open in dev when `TURNSTILE_SECRET_KEY` is unset, to keep local iteration fast.
- Failure mode if Turnstile is down: surface a clear "couldn't verify, try again" message; do not silently accept.

### 8.2 Gmail dot-trick normalization

A small helper at `src/lib/auth/email-normalize.ts`:

```ts
export function normalizeForUniqueness(email: string): string {
  const [local, domain] = email.toLowerCase().split("@");
  if (!domain) return email.toLowerCase();
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.replace(/\./g, "").split("+")[0]}@gmail.com`;
  }
  return `${local}@${domain}`;
}
```

A new column `users.email_canonical` (text, unique) stores the normalized form. The signup/signin lookups query against this column. Migration:

```sql
ALTER TABLE users ADD COLUMN email_canonical text;
UPDATE users SET email_canonical = lower(email); -- best effort; gmail rows get the dot/plus stripped in app code on next signin
CREATE UNIQUE INDEX users_email_canonical_idx ON users(email_canonical);
```

Existing rows are backfilled by the migration's `UPDATE`; gmail rows get the proper canonical form re-computed on next login.

### 8.3 Unverified-account TTL

Netlify scheduled function (mirroring the pattern in `netlify/functions/cron-*`) running daily:

```ts
// netlify/functions/cron-expire-unverified-users.mjs
// Deletes users with email_verified=false older than 7 days. Cascades to
// sessions, magic_links, etc. Skips users with active registrations
// (defensive — shouldn't happen but worth gating).
```

Hooked into `netlify.toml` under `[functions."cron-expire-unverified-users"]` with a `schedule = "@daily"`.

### 8.4 Pre-verification session lifetime

Lucia session creation already takes a config. Currently sessions are 30 days regardless. Change: in `src/pages/api/auth/signin.ts` (and `/signup`), check `user.emailVerified`. If false, issue a session with a 1-hour expiry. At email verification (`/api/auth/verify-email`), invalidate the short session and issue a fresh 30-day one.

Lucia v3 API: `lucia.createSession(userId, {}, { sessionExpiresIn })` — verify the exact parameter name in the SDK; codebase already uses Lucia so the pattern is in place.

## 9. Fix-PR groups & ordering

Each row below is a single PR. Cadence assumes ~½ day to 1.5 days per group.

| PR | Title | Scope |
| --- | --- | --- |
| 1 | `chore(admin): deep-dive audit + bot detection + Day-0 seed` | Audit markdown, the pg_dump receipt, bot detection (8.1-8.4), Day-0 seed script, customer-journey Playwright spec |
| 2 | `feat(admin): Plan group fixes` | Seasons (Season Hub tabs become live data, not placeholder panels), Programs (CRUD if missing), Drop-ins, Rentals, Campaigns. P0/P1/P2 fixes from audit. |
| 3 | `feat(admin): People group fixes` | Users & staff invite flow + listing fix. Look up search. Per-user detail page. |
| 4 | `feat(admin): Money group fixes` | Refunds approve/deny flow, Payments listing, Discount codes CRUD, Gear product+variant CRUD. |
| 5 | `feat(admin): Setup group fixes` | Locations detail page with nested venues, Branding editor, Curriculum (if scope allows or deferred), Compliance, Settings. |
| 6 | `feat(admin): Reports group` | Build `/admin/reports/revenue`, `/admin/reports/registrations`, `/admin/reports/conversion` as real pages with charts/tables. (Currently bare sidebar entries that 404 or render empty.) |
| 7 | `feat(launch): customer-journey hardening` | Whatever audit surfaces in steps 1-14. Pre-launch sign-off checklist. Possibly post-game placeholder + redirect to "coming soon." |

## 10. Quality gates

For every fix PR:

- Every audit finding in that group has a fix OR an explicit defer note in the audit doc (with an issue link).
- One Playwright spec per page exercising the page's primary action.
- Existing tests that asserted old UI either updated or `test.skip`-ed with a tracking TODO referencing the audit doc.
- `npx tsc --noEmit` clean.
- `npm run test:unit` green.
- `npm run build` succeeds.
- Smoke-test against staging in browser before merge (claude-in-chrome MCP, one path per fixed page).

For the audit PR specifically:
- pg_dump receipt confirmed before any Day-0 writes happen.
- Day-0 seed script idempotent — running twice doesn't duplicate rows.
- Bot detection tests: a) Turnstile validation rejects missing-token POSTs; b) email-normalize unit tests; c) cron function dry-run prints what it would delete.

## 11. Hard defers (out of scope, captured here for follow-up)

- **Post-game flows** — assessments, coach notes, player development tracking. Per the founder, not designed yet.
- **Curriculum admin UI** — schema exists; surface is a placeholder. Separate spec needed.
- **Parent dashboard polish** — beyond what the customer-journey spine exercises.
- **Media album / shoot management** — `/admin/media/*` is its own surface; not in the audit scope (you have a separate media team workflow).
- **Mobile-first admin redesign** — the Venue Day tablet pass shipped in PR #56; the rest stays desktop-first.
- **Multi-org administration** — current model assumes a single active org. Future multi-org partnerships (e.g., real SoccerOne integration) would expand this.

## 12. Open assumptions to confirm during the audit (not blocking the spec)

- Exact venue list at each location ({{TBD with the facility partner}}).
- Real registration window dates for Summer 2026 ({{TBD with the founder}}).
- Real pricing per program ({{TBD with the founder}}).
- Whether `posthog` calls in the signin endpoint contribute meaningful latency (worth measuring during the audit; if so, file as a follow-up).
- Stripe test mode is configured in staging env (verify in the audit; if not, surface as a P0 finding for PR1).
