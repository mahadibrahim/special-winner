# Admin Deep-Dive · PR #1 — Audit + Bot Detection + Day-0 Seed

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first PR of the admin deep-dive: a comprehensive admin-surface audit doc, the bot-detection scaffolding (CAPTCHA + Gmail dot-trick normalization + unverified-account TTL + short pre-verification session), the Day-0 launch seed data, and a Playwright spec for the customer-journey spine.

**Architecture:** Phase-ordered. Safety (pg_dump) first, then Day-0 seed (so we have data to audit against), then audit (recorded as a triage markdown), then bot detection (independent code work), then customer-journey spec. Bot detection ships with this PR because it's universally needed and doesn't depend on per-page findings.

**Tech Stack:** Astro 5 (SSR) · React 19 · Lucia Auth v3 · Drizzle ORM (PostgreSQL) · Tailwind CSS 4 · Vitest (unit + API) · Playwright (E2E) · Cloudflare Turnstile (`@marsidev/react-turnstile`) · Netlify scheduled functions

**Spec reference:** `docs/superpowers/specs/2026-05-16-admin-deep-dive-design.md`

---

## File structure overview

### New files

```
scripts/
  admin-deep-dive-day0-seed.ts          — one-off Day-0 launch seed
                                          (deleted after PR1 merges)
  cron-expire-unverified-users.mjs      — (lives in netlify/functions/)

src/lib/auth/
  email-normalize.ts                     — Gmail dot/plus normalization
  turnstile.ts                           — server-side Turnstile verifier

netlify/functions/
  cron-expire-unverified-users.mjs       — daily TTL purge for unverified users

src/lib/db/migrations/
  0028_email_canonical_column.sql        — adds users.email_canonical UNIQUE

docs/superpowers/specs/
  2026-05-17-admin-deep-dive-audit.md    — the triage doc (THE main artifact)

tests/unit/auth/
  email-normalize.test.ts                — pure-function tests
  turnstile.test.ts                      — mocked-fetch tests for verifier

tests/e2e/customer-journey/
  season-signup.spec.ts                  — the customer spine
```

### Modified files

```
src/pages/api/auth/signup.ts             — calls Turnstile verify before DB write
src/pages/api/auth/signin.ts             — short session if !email_verified, dot-trick lookup
src/pages/api/auth/verify-email.ts       — invalidate short session, issue 30-day
src/components/auth/signup-form.tsx      — render Turnstile widget, include token in POST
src/lib/db/schema/users.ts               — add email_canonical column
src/lib/auth/magic-link.ts               — verify-link consumption invalidates short session
netlify.toml                             — wire cron schedule
package.json                             — add @marsidev/react-turnstile
.env.example                             — document TURNSTILE_SITE_KEY / SECRET_KEY
```

---

## Working agreements

- **Branch:** create a fresh `feat/admin-deep-dive-pr1` off latest `origin/main` (PR #58 should be merged first; if not, branch off PR #58 to inherit its fixes).
- **TDD:** every helper / pure function task starts with the failing test. The audit phase and seed script are operational; their "test" is "did it run successfully and produce the expected artifact."
- **Frequent commits:** one commit per task. Commit messages follow `<area>(deep-dive): <what>`.
- **No `npm run db:push` against prod.** Migration goes through `db:generate` + commit.
- **The audit is performed against staging** — the prod purge happened, so prod also works, but staging is the safer audit target. The Day-0 seed runs against both (with explicit env opt-in per environment).
- **`ALLOW_PROD_AUDIT=yes` opt-in is required** for any DB write against the Railway prod proxy.

---

## Phase A — Safety + setup

### Task A.1: Branch off main

- [ ] **Step 1: Fetch + branch**

```bash
git fetch origin
# If PR #58 is already merged:
git checkout -b feat/admin-deep-dive-pr1 origin/main
# If PR #58 is in flight, base off it:
git checkout -b feat/admin-deep-dive-pr1 origin/fix/admin-overhaul-ci-followups
git branch --show-current
```

Expected: `feat/admin-deep-dive-pr1`

- [ ] **Step 2: Confirm working tree is clean**

```bash
git status --short
```

Expected: only untracked SEO components from earlier sessions (`src/components/hero-section.tsx`, `src/components/location-selector.tsx`) — ignore these.

### Task A.2: pg_dump prod baseline

The post-purge state is the safest baseline. Snapshot it before any Day-0 writes.

- [ ] **Step 1: Capture the dump**

```bash
mkdir -p /tmp/aspire-backups
set -a; source .env; set +a   # loads DATABASE_URL from .env (points at prod Railway)
pg_dump "$DATABASE_URL" --no-owner --no-acl --schema=public | gzip > /tmp/aspire-backups/aspire-prod-pre-day0-$(date +%Y%m%d-%H%M%S).sql.gz
ls -la /tmp/aspire-backups/
```

Expected: a `.sql.gz` file of ~50–200 KB (post-purge data is tiny). If file is empty or ≤ 1 KB, abort and investigate.

- [ ] **Step 2: Verify the dump is readable**

```bash
gunzip -c /tmp/aspire-backups/aspire-prod-pre-day0-*.sql.gz | head -50
```

Expected: SQL `CREATE TABLE` / `COPY` statements. If it errors or shows binary garbage, abort and re-run the dump with explicit auth.

- [ ] **Step 3: NO commit.** The dump is operational, not source. Lives only in `/tmp/`; the user manually moves to a safe location if they want a long-term backup.

---

## Phase B — Day-0 seed (real launch data)

One idempotent script that creates the launch baseline. Re-runnable.

### Task B.1: Write the seed script — header + guards

**Files:**
- Create: `scripts/admin-deep-dive-day0-seed.ts`

- [ ] **Step 1: Write the script header + env guards**

```typescript
/**
 * Day-0 launch seed — creates real Aspire Sports launch data.
 *
 * Idempotent: re-running is safe. Each insert is wrapped in a
 * "WHERE NOT EXISTS" check or uses ON CONFLICT DO NOTHING.
 *
 * Per CLAUDE.md "Database write surface": one-off seed scripts live on
 * a feature branch and are deleted after the PR merges. The launch
 * baseline this creates stays in prod as real data.
 *
 * Required env: DATABASE_URL pointing at the target DB.
 * Required opt-in: ALLOW_DAY0_SEED=yes
 *
 * Usage:
 *   ALLOW_DAY0_SEED=yes npx tsx scripts/admin-deep-dive-day0-seed.ts
 */

import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";

const KEEP_ORG_ID = "caf5eac4-28ed-459a-8bdd-04c572d052d3";
const DOWNTOWN_LOCATION_ID = "18762139-8a91-4c12-bbfa-346c61e1106c";
const WORTHINGTON_LOCATION_ID = "2a1693fe-3adc-41f5-90e2-03278decbd6d";

function guardEnv(): void {
  if (process.env.ALLOW_DAY0_SEED !== "yes") {
    console.error("REFUSED: set ALLOW_DAY0_SEED=yes to run this seed.");
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("REFUSED: DATABASE_URL is unset.");
    process.exit(2);
  }
}

function rowsOf(r: unknown): any[] {
  if (Array.isArray(r)) return r as any[];
  if (r && typeof r === "object" && Array.isArray((r as any).rows))
    return (r as any).rows;
  return [];
}

async function main() {
  guardEnv();
  const db = getDb();
  console.log("# Day-0 seed\n");
  console.log(`Target: ${(process.env.DATABASE_URL ?? "").replace(/\/\/[^@]*@/, "//***@")}\n`);

  // Verification: org + locations must exist (post-purge baseline).
  const orgRows = rowsOf(
    await db.execute(
      sql.raw(`SELECT id, name FROM organizations WHERE id = '${KEEP_ORG_ID}'`),
    ),
  );
  if (orgRows.length !== 1) {
    throw new Error(`Expected org ${KEEP_ORG_ID} to exist; found ${orgRows.length}.`);
  }
  console.log(`  ✓ Org: ${orgRows[0].name}`);

  const locRows = rowsOf(
    await db.execute(
      sql.raw(`SELECT id, name FROM locations WHERE id IN ('${DOWNTOWN_LOCATION_ID}','${WORTHINGTON_LOCATION_ID}')`),
    ),
  );
  if (locRows.length !== 2) {
    throw new Error(`Expected 2 keep-locations; found ${locRows.length}.`);
  }
  for (const l of locRows) console.log(`  ✓ Location: ${l.name}`);

  // Phase-by-phase seed runs here; subsequent tasks fill in the bodies.
  await seedSport(db);
  await seedVenues(db);
  await seedAgeGroups(db);
  await seedPrograms(db);
  await seedSeasons(db);
  await seedTeams(db);
  await seedGames(db);
  await seedRegistrations(db);
  await seedDiscountCodes(db);

  console.log("\nDay-0 seed complete.");
}

// Subsequent tasks define these:
async function seedSport(db: ReturnType<typeof getDb>): Promise<void> { /* Task B.2 */ }
async function seedVenues(db: ReturnType<typeof getDb>): Promise<void> { /* Task B.3 */ }
async function seedAgeGroups(db: ReturnType<typeof getDb>): Promise<void> { /* Task B.4 */ }
async function seedPrograms(db: ReturnType<typeof getDb>): Promise<void> { /* Task B.5 */ }
async function seedSeasons(db: ReturnType<typeof getDb>): Promise<void> { /* Task B.6 */ }
async function seedTeams(db: ReturnType<typeof getDb>): Promise<void> { /* Task B.7 */ }
async function seedGames(db: ReturnType<typeof getDb>): Promise<void> { /* Task B.8 */ }
async function seedRegistrations(db: ReturnType<typeof getDb>): Promise<void> { /* Task B.9 */ }
async function seedDiscountCodes(db: ReturnType<typeof getDb>): Promise<void> { /* Task B.10 */ }

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Type-check + commit (skeleton compiles even with empty bodies)**

```bash
npx tsc --noEmit
git add scripts/admin-deep-dive-day0-seed.ts
git commit -m "chore(deep-dive): Day-0 seed skeleton + env guards"
```

### Task B.2: Seed Soccer sport

- [ ] **Step 1: Fill in `seedSport`**

```typescript
async function seedSport(db: ReturnType<typeof getDb>): Promise<void> {
  const existing = rowsOf(
    await db.execute(
      sql.raw(
        `SELECT id FROM sports WHERE organization_id = '${KEEP_ORG_ID}' AND lower(name) = 'soccer'`,
      ),
    ),
  );
  if (existing.length > 0) {
    console.log(`  ✓ Soccer sport already exists (id=${existing[0].id})`);
    return;
  }
  const result: any = await db.execute(
    sql.raw(
      `INSERT INTO sports (organization_id, name, slug, active) VALUES ('${KEEP_ORG_ID}', 'Soccer', 'soccer', true) RETURNING id`,
    ),
  );
  const id = rowsOf(result)[0]?.id;
  console.log(`  ✓ Created Soccer sport (id=${id})`);
}
```

- [ ] **Step 2: Verify columns exist on `sports` table**

```bash
grep -n "export const sports = pgTable" src/lib/db/schema/sports.ts
```

If the schema uses different column names than `organization_id` / `slug` / `active`, adjust the SQL accordingly.

- [ ] **Step 3: Dry-run against staging first**

```bash
set -a; source .env.staging 2>/dev/null || source .env; set +a
ALLOW_DAY0_SEED=yes npx tsx scripts/admin-deep-dive-day0-seed.ts
```

Expected output includes `✓ Created Soccer sport`. Re-running prints `✓ Soccer sport already exists`.

- [ ] **Step 4: Commit**

```bash
git add scripts/admin-deep-dive-day0-seed.ts
git commit -m "feat(deep-dive): seed Soccer sport"
```

### Task B.3: Seed venues

- [ ] **Step 1: Fill in `seedVenues`**

```typescript
async function seedVenues(db: ReturnType<typeof getDb>): Promise<void> {
  const venues = [
    { location_id: DOWNTOWN_LOCATION_ID,   name: "Field 1", indoor: false, field_count: 1 },
    { location_id: WORTHINGTON_LOCATION_ID, name: "Field A", indoor: true,  field_count: 1 },
    { location_id: WORTHINGTON_LOCATION_ID, name: "Field B", indoor: true,  field_count: 1 },
    { location_id: WORTHINGTON_LOCATION_ID, name: "Field C", indoor: false, field_count: 1 },
  ];
  for (const v of venues) {
    const existing = rowsOf(
      await db.execute(
        sql.raw(
          `SELECT id FROM venues WHERE location_id = '${v.location_id}' AND name = '${v.name}'`,
        ),
      ),
    );
    if (existing.length > 0) {
      console.log(`  ✓ Venue ${v.name} already exists`);
      continue;
    }
    await db.execute(
      sql.raw(
        `INSERT INTO venues (location_id, name, indoor, field_count, active, owned)
         VALUES ('${v.location_id}', '${v.name}', ${v.indoor}, ${v.field_count}, true, false)`,
      ),
    );
    console.log(`  ✓ Created venue ${v.name}`);
  }
}
```

- [ ] **Step 2: Verify schema column names**

```bash
grep -E "^\s+(name|indoor|field_count|owned|active):" src/lib/db/schema/teams.ts | head -10
```

Confirm `field_count`, `indoor`, `owned`, `active` exist. Adjust SQL if any column name differs.

- [ ] **Step 3: Run + verify**

```bash
ALLOW_DAY0_SEED=yes npx tsx scripts/admin-deep-dive-day0-seed.ts | grep -E "venue"
```

Expected: 4 `✓ Created venue` lines on first run, 4 `✓ already exists` on second.

- [ ] **Step 4: Commit**

```bash
git add scripts/admin-deep-dive-day0-seed.ts
git commit -m "feat(deep-dive): seed 4 venues across Downtown + Worthington"
```

### Task B.4: Seed age groups

- [ ] **Step 1: Fill in `seedAgeGroups`**

```typescript
async function seedAgeGroups(db: ReturnType<typeof getDb>): Promise<void> {
  const ageGroups = [
    { name: "Adult Co-Ed",   min_age: 18, max_age: 99 },
    { name: "Adult Open",    min_age: 18, max_age: 99 },
    { name: "Adult Over 30", min_age: 30, max_age: 99 },
    { name: "U6",  min_age: 4,  max_age: 6  },
    { name: "U8",  min_age: 6,  max_age: 8  },
    { name: "U10", min_age: 8,  max_age: 10 },
    { name: "U12", min_age: 10, max_age: 12 },
    { name: "HS",  min_age: 14, max_age: 18 },
  ];
  for (const ag of ageGroups) {
    const existing = rowsOf(
      await db.execute(
        sql.raw(`SELECT id FROM age_groups WHERE name = '${ag.name.replace(/'/g, "''")}'`),
      ),
    );
    if (existing.length > 0) {
      console.log(`  ✓ Age group ${ag.name} already exists`);
      continue;
    }
    await db.execute(
      sql.raw(
        `INSERT INTO age_groups (name, min_age, max_age) VALUES ('${ag.name}', ${ag.min_age}, ${ag.max_age})`,
      ),
    );
    console.log(`  ✓ Created age group ${ag.name}`);
  }
}
```

- [ ] **Step 2: Verify schema (check whether age_groups has organization_id or is global)**

```bash
grep -A12 "^export const ageGroups = pgTable" src/lib/db/schema/programs.ts | head -16
```

If the table has `organization_id`, add that column to each insert with `KEEP_ORG_ID`.

- [ ] **Step 3: Run + commit**

```bash
ALLOW_DAY0_SEED=yes npx tsx scripts/admin-deep-dive-day0-seed.ts | grep -E "age group" | head -10
git add scripts/admin-deep-dive-day0-seed.ts
git commit -m "feat(deep-dive): seed 8 age groups (Adult Co-Ed + youth ladder)"
```

### Task B.5: Seed programs

- [ ] **Step 1: Fill in `seedPrograms`** (refs sport + locations from above)

```typescript
async function seedPrograms(db: ReturnType<typeof getDb>): Promise<void> {
  const soccerId = rowsOf(
    await db.execute(
      sql.raw(`SELECT id FROM sports WHERE organization_id = '${KEEP_ORG_ID}' AND lower(name) = 'soccer' LIMIT 1`),
    ),
  )[0]?.id;
  if (!soccerId) throw new Error("Soccer sport missing — run seedSport first");

  const programs = [
    {
      name: "Adult Co-Ed 7v7 League",
      slug: "adult-coed-7v7",
      location_id: DOWNTOWN_LOCATION_ID,
      sport_id: soccerId,
      program_type: "league",
    },
    {
      name: "Founders' Tournament",
      slug: "founders-tournament",
      location_id: DOWNTOWN_LOCATION_ID,
      sport_id: soccerId,
      program_type: "tournament",
    },
    {
      name: "Adult Open Pickup",
      slug: "adult-open-pickup",
      location_id: DOWNTOWN_LOCATION_ID,
      sport_id: soccerId,
      program_type: "clinic",
    },
    {
      name: "Worthington Youth Soccer",
      slug: "worthington-youth-soccer",
      location_id: WORTHINGTON_LOCATION_ID,
      sport_id: soccerId,
      program_type: "league",
    },
  ];

  for (const p of programs) {
    const existing = rowsOf(
      await db.execute(
        sql.raw(`SELECT id FROM programs WHERE slug = '${p.slug}'`),
      ),
    );
    if (existing.length > 0) {
      console.log(`  ✓ Program ${p.name} already exists`);
      continue;
    }
    await db.execute(
      sql.raw(`
        INSERT INTO programs (location_id, sport_id, name, slug, program_type, audience_type, active, is_test)
        VALUES ('${p.location_id}', '${p.sport_id}', '${p.name.replace(/'/g, "''")}', '${p.slug}', '${p.program_type}', 'parents', true, false)
      `),
    );
    console.log(`  ✓ Created program ${p.name}`);
  }
}
```

- [ ] **Step 2: Run + commit**

```bash
ALLOW_DAY0_SEED=yes npx tsx scripts/admin-deep-dive-day0-seed.ts | grep -E "program"
git add scripts/admin-deep-dive-day0-seed.ts
git commit -m "feat(deep-dive): seed 4 programs (Adult 7v7 + Founders Tournament + Pickup + Worthington Youth)"
```

### Task B.6: Seed seasons

- [ ] **Step 1: Fill in `seedSeasons`**

```typescript
async function seedSeasons(db: ReturnType<typeof getDb>): Promise<void> {
  type SeasonSpec = {
    program_slug: string;
    name: string;
    slug: string;
    start_date: string;
    end_date: string;
    registration_opens: string;
    registration_closes: string;
    max_participants: number;
    status: "open" | "draft";
    age_group_name: string;
    venue_name: string;
  };
  const seasons: SeasonSpec[] = [
    {
      program_slug: "adult-coed-7v7",
      name: "Summer 2026 — Adult Co-Ed 7v7",
      slug: "summer-2026-adult-coed-7v7",
      start_date: "2026-07-08",
      end_date: "2026-08-26",
      registration_opens: "2026-05-20T00:00:00Z",
      registration_closes: "2026-06-25T23:59:59Z",
      max_participants: 80,
      status: "open",
      age_group_name: "Adult Co-Ed",
      venue_name: "Field 1",
    },
    {
      program_slug: "founders-tournament",
      name: "Founders' Tournament — June 2026",
      slug: "founders-tournament-jun-2026",
      start_date: "2026-06-21",
      end_date: "2026-06-21",
      registration_opens: "2026-05-20T00:00:00Z",
      registration_closes: "2026-06-15T23:59:59Z",
      max_participants: 60,
      status: "open",
      age_group_name: "Adult Co-Ed",
      venue_name: "Field 1",
    },
    {
      program_slug: "worthington-youth-soccer",
      name: "Summer 2026 — Worthington U10",
      slug: "summer-2026-worthington-u10",
      start_date: "2026-07-15",
      end_date: "2026-08-30",
      registration_opens: "2026-05-25T00:00:00Z",
      registration_closes: "2026-06-30T23:59:59Z",
      max_participants: 40,
      status: "draft",
      age_group_name: "U10",
      venue_name: "Field A",
    },
  ];

  for (const s of seasons) {
    const existing = rowsOf(
      await db.execute(sql.raw(`SELECT id FROM seasons WHERE slug = '${s.slug}'`)),
    );
    if (existing.length > 0) {
      console.log(`  ✓ Season ${s.name} already exists`);
      continue;
    }

    const programId = rowsOf(
      await db.execute(sql.raw(`SELECT id FROM programs WHERE slug = '${s.program_slug}'`)),
    )[0]?.id;
    if (!programId) throw new Error(`Program ${s.program_slug} missing`);

    const ageGroupId = rowsOf(
      await db.execute(sql.raw(`SELECT id FROM age_groups WHERE name = '${s.age_group_name}' LIMIT 1`)),
    )[0]?.id;

    const venueId = rowsOf(
      await db.execute(sql.raw(`SELECT id FROM venues WHERE name = '${s.venue_name}' LIMIT 1`)),
    )[0]?.id;

    await db.execute(
      sql.raw(`
        INSERT INTO seasons (program_id, age_group_id, venue_id, name, slug, start_date, end_date,
                             registration_opens, registration_closes, max_participants, status)
        VALUES ('${programId}', ${ageGroupId ? `'${ageGroupId}'` : "NULL"}, ${venueId ? `'${venueId}'` : "NULL"},
                '${s.name.replace(/'/g, "''")}', '${s.slug}', '${s.start_date}', '${s.end_date}',
                '${s.registration_opens}', '${s.registration_closes}', ${s.max_participants}, '${s.status}')
      `),
    );
    console.log(`  ✓ Created season ${s.name} (status=${s.status})`);
  }
}
```

- [ ] **Step 2: Run + commit**

```bash
ALLOW_DAY0_SEED=yes npx tsx scripts/admin-deep-dive-day0-seed.ts | grep -E "season"
git add scripts/admin-deep-dive-day0-seed.ts
git commit -m "feat(deep-dive): seed 3 seasons (Adult 7v7 open, Tournament open, U10 draft)"
```

### Task B.7: Seed teams

2 placeholder teams in the open Adult Co-Ed 7v7 season.

- [ ] **Step 1: Fill in `seedTeams`**

```typescript
async function seedTeams(db: ReturnType<typeof getDb>): Promise<void> {
  const seasonId = rowsOf(
    await db.execute(sql.raw(`SELECT id FROM seasons WHERE slug = 'summer-2026-adult-coed-7v7'`)),
  )[0]?.id;
  if (!seasonId) {
    console.log("  ⚠ Adult 7v7 season missing; skipping team seed.");
    return;
  }
  const teams = [
    { name: "Founders Team 1", color: "#e11d48" },
    { name: "Founders Team 2", color: "#0ea5e9" },
  ];
  for (const t of teams) {
    const existing = rowsOf(
      await db.execute(
        sql.raw(`SELECT id FROM teams WHERE season_id = '${seasonId}' AND name = '${t.name.replace(/'/g, "''")}'`),
      ),
    );
    if (existing.length > 0) {
      console.log(`  ✓ Team ${t.name} already exists`);
      continue;
    }
    await db.execute(
      sql.raw(`
        INSERT INTO teams (season_id, name, color)
        VALUES ('${seasonId}', '${t.name}', '${t.color}')
      `),
    );
    console.log(`  ✓ Created team ${t.name}`);
  }
}
```

- [ ] **Step 2: Run + commit**

```bash
ALLOW_DAY0_SEED=yes npx tsx scripts/admin-deep-dive-day0-seed.ts | grep -E "team"
git add scripts/admin-deep-dive-day0-seed.ts
git commit -m "feat(deep-dive): seed 2 founders teams in Adult 7v7 season"
```

### Task B.8: Seed games

4 games across the first 2 weeks of the season, alternating between the 2 placeholder teams.

- [ ] **Step 1: Fill in `seedGames`**

```typescript
async function seedGames(db: ReturnType<typeof getDb>): Promise<void> {
  const seasonId = rowsOf(
    await db.execute(sql.raw(`SELECT id FROM seasons WHERE slug = 'summer-2026-adult-coed-7v7'`)),
  )[0]?.id;
  if (!seasonId) return;

  const teams = rowsOf(
    await db.execute(
      sql.raw(`SELECT id, name FROM teams WHERE season_id = '${seasonId}' ORDER BY name`),
    ),
  );
  if (teams.length < 2) {
    console.log("  ⚠ Need ≥2 teams to seed games; skipping.");
    return;
  }
  const [t1, t2] = teams;

  const venueId = rowsOf(
    await db.execute(sql.raw(`SELECT id FROM venues WHERE name = 'Field 1' LIMIT 1`)),
  )[0]?.id;

  const games = [
    { week: 1, kickoff: "2026-07-08T19:00:00Z", home: t1.id, away: t2.id },
    { week: 1, kickoff: "2026-07-08T20:00:00Z", home: t2.id, away: t1.id },
    { week: 2, kickoff: "2026-07-15T19:00:00Z", home: t1.id, away: t2.id },
    { week: 2, kickoff: "2026-07-15T20:00:00Z", home: t2.id, away: t1.id },
  ];

  for (const g of games) {
    const existing = rowsOf(
      await db.execute(
        sql.raw(
          `SELECT id FROM games WHERE season_id = '${seasonId}' AND scheduled_at = '${g.kickoff}'`,
        ),
      ),
    );
    if (existing.length > 0) {
      console.log(`  ✓ Game ${g.kickoff} already exists`);
      continue;
    }
    await db.execute(
      sql.raw(`
        INSERT INTO games (season_id, home_team_id, away_team_id, venue_id, scheduled_at, duration_minutes, status)
        VALUES ('${seasonId}', '${g.home}', '${g.away}', ${venueId ? `'${venueId}'` : "NULL"},
                '${g.kickoff}', 60, 'scheduled')
      `),
    );
    console.log(`  ✓ Created game at ${g.kickoff}`);
  }
}
```

- [ ] **Step 2: Run + commit**

```bash
ALLOW_DAY0_SEED=yes npx tsx scripts/admin-deep-dive-day0-seed.ts | grep -E "game"
git add scripts/admin-deep-dive-day0-seed.ts
git commit -m "feat(deep-dive): seed 4 games across weeks 1-2"
```

### Task B.9: Seed registrations

Skipped by default in the seed script (registrations require a real family member + payment record). Instead, document them as part of the audit's customer-journey spec — the spec creates one organically.

- [ ] **Step 1: Replace `seedRegistrations` body with a no-op + a note**

```typescript
async function seedRegistrations(db: ReturnType<typeof getDb>): Promise<void> {
  // Registrations are created organically via the customer-journey
  // Playwright spec (Phase E). Pre-seeding them here would conflict with
  // the auth + payment flow we want to exercise. No-op.
  console.log("  - Registrations: deferred to customer-journey spec");
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/admin-deep-dive-day0-seed.ts
git commit -m "feat(deep-dive): defer registration seed to customer-journey spec"
```

### Task B.10: Seed discount codes

- [ ] **Step 1: Fill in `seedDiscountCodes`**

```typescript
async function seedDiscountCodes(db: ReturnType<typeof getDb>): Promise<void> {
  const code = "FOUNDERS";
  const existing = rowsOf(
    await db.execute(sql.raw(`SELECT id FROM discount_codes WHERE code = '${code}'`)),
  );
  if (existing.length > 0) {
    console.log(`  ✓ Discount code ${code} already exists`);
    return;
  }
  // Schema check: the discount_codes columns vary. Read the schema once
  // and verify these column names before running.
  await db.execute(
    sql.raw(`
      INSERT INTO discount_codes (organization_id, code, discount_type, discount_value, active)
      VALUES ('${KEEP_ORG_ID}', '${code}', 'percentage', 100, true)
    `),
  );
  console.log(`  ✓ Created discount code ${code}`);
}
```

- [ ] **Step 2: Verify schema columns**

```bash
grep -A20 "^export const discountCodes = pgTable" src/lib/db/schema/discounts.ts
```

Adjust SQL if columns differ (e.g., the schema might use `kind` instead of `discount_type`).

- [ ] **Step 3: Run + commit**

```bash
ALLOW_DAY0_SEED=yes npx tsx scripts/admin-deep-dive-day0-seed.ts | grep -E "discount"
git add scripts/admin-deep-dive-day0-seed.ts
git commit -m "feat(deep-dive): seed FOUNDERS discount code"
```

### Task B.11: Run the seed against prod

After staging verifies clean, run against prod.

- [ ] **Step 1: Confirm DATABASE_URL points at prod**

```bash
grep "^DATABASE_URL=" .env | sed 's|//[^@]*@|//***@|'
```

Expected: `gondola.proxy.rlwy.net` (the prod Railway proxy).

- [ ] **Step 2: Run with full opt-in**

```bash
set -a; source .env; set +a
ALLOW_DAY0_SEED=yes ALLOW_PROD_AUDIT=yes npx tsx scripts/admin-deep-dive-day0-seed.ts
```

Expected: 1 sport + 4 venues + 8 age groups + 4 programs + 3 seasons + 2 teams + 4 games + 1 discount code = 23 new rows total. Second run should print all `✓ already exists`.

- [ ] **Step 3: Smoke-test on the live admin home**

Open `https://aspiresportsohio.com/admin` in a browser. The Seasons grid should now show 3 cards (Adult 7v7 Summer, Founders Tournament, Worthington U10) instead of "No seasons yet."

- [ ] **Step 4: NO commit.** The run is operational; data lives in prod but is the launch baseline.

---

## Phase C — Bot detection

### Task C.1: Email-normalize helper (pure function, TDD)

**Files:**
- Create: `src/lib/auth/email-normalize.ts`
- Test: `tests/unit/auth/email-normalize.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/auth/email-normalize.test.ts
import { describe, it, expect } from "vitest";
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";

describe("normalizeForUniqueness", () => {
  it("lowercases the whole email for non-gmail domains", () => {
    expect(normalizeForUniqueness("Foo@Example.COM")).toBe("foo@example.com");
  });

  it("strips dots from gmail.com local-part", () => {
    expect(normalizeForUniqueness("a.g.i.v.o.b@gmail.com")).toBe("agivob@gmail.com");
  });

  it("strips dots from googlemail.com local-part (treats as gmail)", () => {
    expect(normalizeForUniqueness("john.doe@googlemail.com")).toBe("johndoe@gmail.com");
  });

  it("strips +tag suffixes on gmail.com", () => {
    expect(normalizeForUniqueness("foo+spam@gmail.com")).toBe("foo@gmail.com");
  });

  it("strips dots AND +tags on gmail.com", () => {
    expect(normalizeForUniqueness("a.g.i.v.o.b+spam@gmail.com")).toBe("agivob@gmail.com");
  });

  it("leaves dots intact for non-gmail domains", () => {
    expect(normalizeForUniqueness("first.last@example.com")).toBe("first.last@example.com");
  });

  it("preserves +tags for non-gmail domains", () => {
    expect(normalizeForUniqueness("user+tag@example.com")).toBe("user+tag@example.com");
  });

  it("handles missing @ gracefully (returns lowercased)", () => {
    expect(normalizeForUniqueness("not-an-email")).toBe("not-an-email");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL ("module not found")**

```bash
npm run test:unit -- tests/unit/auth/email-normalize.test.ts
```

- [ ] **Step 3: Implement the helper**

```typescript
// src/lib/auth/email-normalize.ts

/**
 * Returns a canonical form of an email address for uniqueness purposes.
 *
 * Gmail and Googlemail addresses are equivalent inboxes when dots and
 * +tags are stripped from the local-part: `a.g.i.v.o.b@gmail.com`,
 * `agivob@gmail.com`, and `agivob+spam@gmail.com` all resolve to the
 * same Gmail inbox. Bots exploit this to defeat naive uniqueness checks.
 *
 * For any other domain, dots and +tags may be meaningful. Only lowercase
 * the whole address.
 */
export function normalizeForUniqueness(email: string): string {
  const lower = email.toLowerCase().trim();
  const atIdx = lower.lastIndexOf("@");
  if (atIdx <= 0) return lower;

  const local = lower.slice(0, atIdx);
  const domain = lower.slice(atIdx + 1);

  if (domain === "gmail.com" || domain === "googlemail.com") {
    const stripped = local.replace(/\./g, "").split("+")[0];
    return `${stripped}@gmail.com`;
  }

  return `${local}@${domain}`;
}
```

- [ ] **Step 4: Run test — expect PASS (8/8)**

```bash
npm run test:unit -- tests/unit/auth/email-normalize.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/email-normalize.ts tests/unit/auth/email-normalize.test.ts
git commit -m "feat(bot-detection): email-normalize helper (Gmail dot/plus + lowercase)"
```

### Task C.2: Schema migration — `users.email_canonical`

**Files:**
- Modify: `src/lib/db/schema/users.ts`
- Create: `src/lib/db/migrations/0028_*.sql` (generated)

- [ ] **Step 1: Add the column to the schema**

```typescript
// inside the users pgTable definition, after `email`:
emailCanonical: varchar("email_canonical", { length: 255 }).unique(),
```

- [ ] **Step 2: Generate migration**

```bash
npx drizzle-kit generate
```

Expected: a new file `src/lib/db/migrations/0028_*.sql` containing:
```sql
ALTER TABLE "users" ADD COLUMN "email_canonical" varchar(255);
ALTER TABLE "users" ADD CONSTRAINT "users_email_canonical_unique" UNIQUE("email_canonical");
```

- [ ] **Step 3: Augment the migration with a backfill**

Edit the generated `.sql` to append a backfill:

```sql
-- Backfill: best-effort lowercase. Gmail rows get re-normalized on next
-- signin via the app layer; this just keeps the column non-null for
-- existing users so the UNIQUE constraint doesn't break.
UPDATE users SET email_canonical = lower(email) WHERE email_canonical IS NULL;
```

- [ ] **Step 4: Verify schema compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema/users.ts src/lib/db/migrations/0028_*.sql src/lib/db/migrations/meta/
git commit -m "feat(bot-detection): users.email_canonical column + backfill migration"
```

### Task C.3: Wire normalize into signup

**Files:**
- Modify: `src/pages/api/auth/signup.ts`

- [ ] **Step 1: Locate where the existing uniqueness check happens**

```bash
grep -n "email\|uniqueness\|existing" src/pages/api/auth/signup.ts | head -10
```

- [ ] **Step 2: Add the canonical-form lookup before insert**

Find the block where the existing email lookup happens. Add normalization:

```typescript
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";

// ... later in the handler:
const canonical = normalizeForUniqueness(email);

const existing = await getDb().query.users.findFirst({
  where: eq(users.emailCanonical, canonical),
});
if (existing) {
  return new Response(JSON.stringify({ error: "Email already registered" }), { status: 409 });
}
```

Also include `emailCanonical: canonical` in the user insert.

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add src/pages/api/auth/signup.ts
git commit -m "feat(bot-detection): signup uses email_canonical for uniqueness"
```

### Task C.4: Wire normalize into signin

**Files:**
- Modify: `src/pages/api/auth/signin.ts`

- [ ] **Step 1: Find the user lookup in signin**

```bash
grep -n "findFirst\|users.email" src/pages/api/auth/signin.ts | head -5
```

- [ ] **Step 2: Change lookup to use email_canonical**

```typescript
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";

const canonical = normalizeForUniqueness(email);
const user = await getDb().query.users.findFirst({
  where: eq(users.emailCanonical, canonical),
});
```

This means a user who signed up as `agivob@gmail.com` can sign in with `agivob@gmail.com`, `a.g.i.v.o.b@gmail.com`, or `agivob+anything@gmail.com` — and rejected duplicate signups from the dot-trick.

- [ ] **Step 3: Backfill prod's existing 2 users' canonical column on next signin**

The migration backfilled with `lower(email)` — for `mahad.ibrahim@gmail.com` that's `mahad.ibrahim@gmail.com`, not `mahadibrahim@gmail.com`. Add an inline upgrade in signin: if the lookup misses but `lower(email)` lookup hits, update the row to its proper canonical form.

```typescript
let user = await getDb().query.users.findFirst({
  where: eq(users.emailCanonical, canonical),
});
if (!user) {
  // Legacy backfill: find by lower(email), repair canonical column.
  user = await getDb().query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });
  if (user && user.emailCanonical !== canonical) {
    await getDb()
      .update(users)
      .set({ emailCanonical: canonical })
      .where(eq(users.id, user.id));
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/auth/signin.ts
git commit -m "feat(bot-detection): signin uses email_canonical (with legacy backfill repair)"
```

### Task C.5: Add Turnstile dependency

- [ ] **Step 1: Install the React widget**

```bash
npm install --save @marsidev/react-turnstile
```

- [ ] **Step 2: Add env-var documentation**

Append to `.env.example`:
```
# Cloudflare Turnstile — CAPTCHA on /signup
PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "feat(bot-detection): add @marsidev/react-turnstile + env doc"
```

### Task C.6: Server-side Turnstile verifier (TDD)

**Files:**
- Create: `src/lib/auth/turnstile.ts`
- Test: `tests/unit/auth/turnstile.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// tests/unit/auth/turnstile.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyTurnstile } from "@/lib/auth/turnstile";

describe("verifyTurnstile", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("fails closed when secret is unset in production", async () => {
    const ok = await verifyTurnstile("any-token", { secret: undefined, isProd: true });
    expect(ok).toBe(false);
  });

  it("fails open when secret is unset in dev", async () => {
    const ok = await verifyTurnstile("any-token", { secret: undefined, isProd: false });
    expect(ok).toBe(true);
  });

  it("returns true when Cloudflare reports success=true", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ success: true }) } as any);
    const ok = await verifyTurnstile("token-x", { secret: "k", isProd: true });
    expect(ok).toBe(true);
  });

  it("returns false when Cloudflare reports success=false", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ success: false, "error-codes": ["timeout-or-duplicate"] }) } as any);
    const ok = await verifyTurnstile("token-x", { secret: "k", isProd: true });
    expect(ok).toBe(false);
  });

  it("returns false on network error", async () => {
    fetchSpy.mockRejectedValue(new Error("boom"));
    const ok = await verifyTurnstile("token-x", { secret: "k", isProd: true });
    expect(ok).toBe(false);
  });

  it("rejects empty token", async () => {
    const ok = await verifyTurnstile("", { secret: "k", isProd: true });
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm run test:unit -- tests/unit/auth/turnstile.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// src/lib/auth/turnstile.ts

/**
 * Validates a Cloudflare Turnstile token against Cloudflare's siteverify
 * endpoint. Fails closed in prod when the secret is missing; fails open
 * in dev for fast iteration.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileOpts = {
  secret: string | undefined;
  isProd: boolean;
};

export async function verifyTurnstile(token: string, opts: TurnstileOpts): Promise<boolean> {
  if (!opts.secret) {
    return !opts.isProd;
  }
  if (!token) return false;

  try {
    const body = new URLSearchParams();
    body.append("secret", opts.secret);
    body.append("response", token);
    const res = await fetch(VERIFY_URL, { method: "POST", body });
    if (!res.ok) return false;
    const data = (await res.json()) as { success: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run — expect PASS (6/6)**

```bash
npm run test:unit -- tests/unit/auth/turnstile.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/turnstile.ts tests/unit/auth/turnstile.test.ts
git commit -m "feat(bot-detection): server-side Turnstile verifier (fail-closed in prod)"
```

### Task C.7: Wire Turnstile into signup endpoint

**Files:**
- Modify: `src/pages/api/auth/signup.ts`

- [ ] **Step 1: Add the verification step before any DB work**

```typescript
import { verifyTurnstile } from "@/lib/auth/turnstile";

// In the POST handler, after parsing the request body but before
// rate-limit / uniqueness:
const turnstileToken = body.turnstileToken as string | undefined;
const turnstileOk = await verifyTurnstile(turnstileToken ?? "", {
  secret: import.meta.env.TURNSTILE_SECRET_KEY,
  isProd: import.meta.env.PROD,
});
if (!turnstileOk) {
  return new Response(
    JSON.stringify({ error: "Bot challenge failed. Please try again." }),
    { status: 400 },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/auth/signup.ts
git commit -m "feat(bot-detection): require Turnstile token on /api/auth/signup"
```

### Task C.8: Render Turnstile widget on signup form

**Files:**
- Modify: `src/components/auth/signup-form.tsx`

- [ ] **Step 1: Locate the form component**

```bash
grep -n "export function\|const SignupForm" src/components/auth/signup-form.tsx | head
```

- [ ] **Step 2: Add the widget and pass the token in the submit POST**

```tsx
import { Turnstile } from "@marsidev/react-turnstile";

// ...inside the component:
const [turnstileToken, setTurnstileToken] = useState<string>("");

// In the form JSX, above the submit button:
{import.meta.env.PUBLIC_TURNSTILE_SITE_KEY && (
  <Turnstile
    siteKey={import.meta.env.PUBLIC_TURNSTILE_SITE_KEY}
    onSuccess={(token) => setTurnstileToken(token)}
    onExpire={() => setTurnstileToken("")}
    options={{ theme: "light" }}
  />
)}

// In the submit handler, when building the POST body:
body: JSON.stringify({ email, password, firstName, lastName, turnstileToken }),
```

- [ ] **Step 3: Disable the submit button until the token is set**

```tsx
<button type="submit" disabled={!turnstileToken || isLoading}>
  Sign up
</button>
```

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add src/components/auth/signup-form.tsx
git commit -m "feat(bot-detection): render Turnstile widget on signup form"
```

### Task C.9: Pre-verification short session in signin endpoint

**Files:**
- Modify: `src/pages/api/auth/signin.ts`

- [ ] **Step 1: Find the createSession call**

```bash
grep -n "createSession\|lucia.createSession" src/pages/api/auth/signin.ts | head -3
```

- [ ] **Step 2: Differentiate session lifetime by `user.emailVerified`**

```typescript
// Lucia v3: the session expiry is controlled by Lucia's config, not a
// per-call argument. The workaround: create the session, then if !verified,
// patch the expiresAt to 1 hour from now.

const session = await lucia.createSession(user.id, {});

if (!user.emailVerified) {
  const ONE_HOUR_FROM_NOW = new Date(Date.now() + 60 * 60 * 1000);
  await getDb()
    .update(sessions)
    .set({ expiresAt: ONE_HOUR_FROM_NOW })
    .where(eq(sessions.id, session.id));
}

const sessionCookie = lucia.createSessionCookie(session.id);
// (existing cookie set logic)
```

- [ ] **Step 3: Verify `sessions` table import is in scope**

```bash
grep -n "import.*sessions\|from \"@/lib/db/schema" src/pages/api/auth/signin.ts | head -3
```

If `sessions` table is not imported, add the import.

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add src/pages/api/auth/signin.ts
git commit -m "feat(bot-detection): 1-hour session lifetime for unverified accounts on signin"
```

### Task C.10: Pre-verification short session in signup endpoint

Same pattern for signup.

- [ ] **Step 1: Apply the same conditional in signup.ts**

```typescript
const session = await lucia.createSession(newUser.id, {});

// Signup always starts unverified, so always shorten:
const ONE_HOUR_FROM_NOW = new Date(Date.now() + 60 * 60 * 1000);
await getDb()
  .update(sessions)
  .set({ expiresAt: ONE_HOUR_FROM_NOW })
  .where(eq(sessions.id, session.id));
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/auth/signup.ts
git commit -m "feat(bot-detection): 1-hour session on fresh signup (until email verified)"
```

### Task C.11: Restore 30-day session on email verification

**Files:**
- Modify: `src/pages/api/auth/verify-email.ts` (or whichever route consumes the verification token)

- [ ] **Step 1: Find the verification endpoint**

```bash
grep -rln "email_verified\|emailVerified.*true\|verifyEmail" src/pages/api/auth/ | head
```

- [ ] **Step 2: After marking emailVerified=true, find or create the user's active session and extend its expiry**

```typescript
// After: await db.update(users).set({ emailVerified: true })...
const activeSessions = await getDb()
  .select({ id: sessions.id })
  .from(sessions)
  .where(eq(sessions.userId, user.id));

const THIRTY_DAYS = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
for (const s of activeSessions) {
  await getDb()
    .update(sessions)
    .set({ expiresAt: THIRTY_DAYS })
    .where(eq(sessions.id, s.id));
}
```

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add src/pages/api/auth/verify-email.ts
git commit -m "feat(bot-detection): restore 30-day session after email verification"
```

### Task C.12: Unverified-account TTL cron handler (TDD-lite)

**Files:**
- Create: `netlify/functions/cron-expire-unverified-users.mjs`

- [ ] **Step 1: Write the handler**

```javascript
// netlify/functions/cron-expire-unverified-users.mjs
import { schedule } from "@netlify/functions";
import postgres from "postgres";

export const handler = schedule("@daily", async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    // Delete users that:
    //   - never verified their email
    //   - are older than 7 days
    //   - have NO registrations attached (defensive — shouldn't happen,
    //     but skip just in case a stray bot did somehow register)
    const deleted = await sql`
      DELETE FROM users
      WHERE email_verified = false
        AND created_at < NOW() - INTERVAL '7 days'
        AND id NOT IN (
          SELECT registered_by_user_id FROM registrations WHERE registered_by_user_id IS NOT NULL
        )
      RETURNING id, email
    `;
    console.log(`cron-expire-unverified-users: deleted ${deleted.length} rows`);
    return {
      statusCode: 200,
      body: JSON.stringify({ deleted: deleted.length }),
    };
  } catch (e) {
    console.error("cron-expire-unverified-users error:", e);
    return { statusCode: 500, body: String(e) };
  } finally {
    await sql.end();
  }
});
```

- [ ] **Step 2: Verify column name `registered_by_user_id`**

```bash
grep -n "registered_by_user_id\|registeredByUserId" src/lib/db/schema/registrations.ts | head -3
```

If different, adjust the query.

- [ ] **Step 3: Wire schedule in netlify.toml**

```bash
grep -A2 "cron-" netlify.toml | head -20
```

Append a stanza matching the existing pattern:

```toml
[functions."cron-expire-unverified-users"]
schedule = "@daily"
```

- [ ] **Step 4: Type-check (mjs is not part of tsc; just verify imports exist)**

```bash
ls node_modules/@netlify/functions
ls node_modules/postgres
```

Both should exist (`@netlify/functions` is a project dep; `postgres` is the driver).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/cron-expire-unverified-users.mjs netlify.toml
git commit -m "feat(bot-detection): daily cron to delete unverified accounts >7d old"
```

---

## Phase D — Audit (the main artifact)

### Task D.1: Create the audit doc shell

**Files:**
- Create: `docs/superpowers/specs/2026-05-17-admin-deep-dive-audit.md`

- [ ] **Step 1: Write the doc header + template**

```markdown
# Admin deep-dive · audit findings

**Date:** 2026-05-17
**Method:** Manual click-through against staging (admin@test.aspiresports.com)
with Day-0 seed loaded. Browser console errors captured.

## Severity scale
- **P0** — blocks customer journey (e.g., signin fails, payment fails)
- **P1** — admin can't do their job (e.g., can't create a season)
- **P2** — polish (label wrong, slow page, confusing copy)

## Effort scale
- **S** ≤2h · **M** ~½ day · **L** 1-2 days · **XL** ≥3 days (deferred)

## Findings by page

<!--
TEMPLATE — copy for each page:

### /admin/<path> — <name>
- **Status:** OK | EMPTY-STATE | BROKEN | PARTIAL
- **Severity:** none | P0 | P1 | P2
- **Effort:** S | M | L | XL (deferred → link issue)
- **Fix PR:** Plan | People | Money | Setup | Reports | Customer-flow | deferred
- **Findings:**
  - <bullet>
- **Notes:**
  - <optional>
-->
```

- [ ] **Step 2: Commit the shell**

```bash
git add docs/superpowers/specs/2026-05-17-admin-deep-dive-audit.md
git commit -m "docs(deep-dive): audit shell + template"
```

### Task D.2: Audit super-admin home + Inbox

Performed by clicking through and filling in findings in the audit doc.

- [ ] **Step 1: Navigate**

```bash
# In claude-in-chrome MCP, against the staging URL or the live prod URL.
# Operator does: sign in as super_admin → /admin
```

- [ ] **Step 2: For each surface, click every visible affordance, take note in the audit doc.**

Surfaces to test on `/admin`:
- Greeting line renders
- Needs Your Attention panel
- Seasons grid (now should show 3 seeded seasons)
- Today across venues (should show both locations)
- Sidebar items (every group + every item)

Surfaces to test on `/messages` (Inbox):
- Page loads, shows whatever conversations exist (or empty state)
- Click a conversation if any
- Try the inbox filters

- [ ] **Step 3: Append findings to audit doc, commit**

```bash
git add docs/superpowers/specs/2026-05-17-admin-deep-dive-audit.md
git commit -m "docs(deep-dive): audit /admin + /messages"
```

### Task D.3: Audit Plan group

Pages: `/admin/seasons` + per-season detail + 7 tabs; `/admin/programs` + Sports tab + Age groups tab; `/admin/dropins` Sessions + Rate card tabs; `/admin/rentals` Bookings + Rate card tabs + per-rental detail + `/new`; `/admin/campaigns`.

- [ ] **Step 1: Click through every page above**
- [ ] **Step 2: Test every CTA on every page (create season, create program, etc.)**
- [ ] **Step 3: Click into each detail page (Season Hub) and test every tab**
- [ ] **Step 4: Append findings, commit**

```bash
git add docs/superpowers/specs/2026-05-17-admin-deep-dive-audit.md
git commit -m "docs(deep-dive): audit Plan group (Seasons/Programs/Drop-ins/Rentals/Campaigns)"
```

### Task D.4: Audit People group

Pages: `/admin/lookup`, `/admin/users` + `/[id]`.

- [ ] **Step 1: Click through**

Specifically test:
- Look up search bar (try a real user email)
- Users & staff listing — does Mahad/Alexis appear?
- "Add user" / "Invite" affordances exist?
- Click into a user detail page

- [ ] **Step 2: Append + commit**

```bash
git add docs/superpowers/specs/2026-05-17-admin-deep-dive-audit.md
git commit -m "docs(deep-dive): audit People group (Look up + Users)"
```

### Task D.5: Audit Money group

Pages: `/admin/refunds`, `/admin/payments`, `/admin/discount-codes`, `/admin/gear` + products + variants.

- [ ] **Step 1: Click through; record findings**
- [ ] **Step 2: Test the FOUNDERS code we seeded — does it appear in `/admin/discount-codes`?**
- [ ] **Step 3: Append + commit**

```bash
git add docs/superpowers/specs/2026-05-17-admin-deep-dive-audit.md
git commit -m "docs(deep-dive): audit Money group (Refunds/Payments/Codes/Gear)"
```

### Task D.6: Audit Setup group

Pages: `/admin/locations` + Venues tab + `/[id]`; `/admin/branding` + `/[id]`; `/admin/curriculum/*`; `/admin/compliance`; `/admin/settings`.

- [ ] **Step 1: Click through; record findings**
- [ ] **Step 2: Specifically verify the seeded venues appear under each location**
- [ ] **Step 3: Append + commit**

```bash
git add docs/superpowers/specs/2026-05-17-admin-deep-dive-audit.md
git commit -m "docs(deep-dive): audit Setup group (Locations/Branding/Curriculum/Compliance/Settings)"
```

### Task D.7: Audit Reports group

Pages: `/admin/reports/revenue`, `/admin/reports/registrations`, `/admin/reports/conversion`.

- [ ] **Step 1: Click through — these are likely 404 or empty pages (they're bare sidebar entries in the post-overhaul nav)**
- [ ] **Step 2: Each one is a P1+ finding with effort M to L (build the report page)**
- [ ] **Step 3: Append + commit**

```bash
git add docs/superpowers/specs/2026-05-17-admin-deep-dive-audit.md
git commit -m "docs(deep-dive): audit Reports group"
```

### Task D.8: Audit Venue surface + Auxiliary

Pages: `/admin/venue/day/[today]`, `/admin/venue/check-in`, `/admin/venue/walk-up`, `/admin/refund-requests`, `/admin/announcements`, `/admin/broadcasts`, `/admin/waitlist`, `/admin/teams`, `/admin/games`, `/admin/organizations`, `/admin/media/*`.

- [ ] **Step 1: Click through; record findings**
- [ ] **Step 2: Specifically verify the Venue Day shows the 4 seeded games at Field 1 on the relevant dates (2026-07-08 and 2026-07-15)**
- [ ] **Step 3: Append + commit**

```bash
git add docs/superpowers/specs/2026-05-17-admin-deep-dive-audit.md
git commit -m "docs(deep-dive): audit Venue surface + Auxiliary pages"
```

---

## Phase E — Customer-journey spine

### Task E.1: Manual click-through

Per spec §6, click the 14-step journey by hand. Record any breakage in the audit doc as P0 findings.

- [ ] **Step 1: Open `/register/<adult-7v7-season-id>` anonymously and run the wizard end-to-end**
- [ ] **Step 2: For step 6 — signup — use a real test email (e.g., a `+test1@gmail.com` address you can read) so you can complete email verification**
- [ ] **Step 3: For step 9 — Stripe — use Stripe's test card `4242 4242 4242 4242` (verify staging uses Stripe test mode)**
- [ ] **Step 4: Note any P0 in the audit doc; commit**

```bash
git add docs/superpowers/specs/2026-05-17-admin-deep-dive-audit.md
git commit -m "docs(deep-dive): customer-journey manual click-through results"
```

### Task E.2: Write the Playwright spec (TDD applied to E2E)

**Files:**
- Create: `tests/e2e/customer-journey/season-signup.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect } from "@playwright/test";
import { waitForHydration } from "../../utils/test-helpers";

// End-to-end customer-journey spine for the Adult Co-Ed 7v7 Summer 2026
// season. Exercises every step in spec §6.
//
// Pre-reqs:
//   - Day-0 seed has run (creates the open Adult 7v7 season)
//   - Stripe is in test mode (uses 4242... test card)
//
// Strategy: each step is its own test. They share state via a fixed
// email derived from test run ID, so re-running is idempotent.

const SEASON_SLUG = "summer-2026-adult-coed-7v7";
const TEST_PREFIX = `e2e-${Date.now()}`;
const TEST_EMAIL = `${TEST_PREFIX}@example.invalid`;
const TEST_PASSWORD = "TestE2E!12345";

test.describe.serial("customer journey: Adult 7v7 signup", () => {
  test("step 1: anonymous home loads", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test("step 2: anonymous /sports/soccer renders the real sport", async ({ page }) => {
    await page.goto("/sports/soccer");
    await waitForHydration(page);
    await expect(page.getByText(/soccer/i).first()).toBeVisible();
  });

  test("step 3: anonymous registration wizard step 1 loads", async ({ page }) => {
    // Look up the season by slug via the public API to get its id.
    const resp = await page.request.get(`/api/public/seasons?slug=${SEASON_SLUG}`);
    expect(resp.ok()).toBe(true);
    const { seasons } = await resp.json();
    const season = seasons?.[0];
    expect(season?.id).toBeTruthy();
    await page.goto(`/register/${season.id}`);
    await waitForHydration(page);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  // Subsequent steps (4-14) follow the same shape. Each verifies the
  // checkpoint behavior described in spec §6. Implementer fills in the
  // remaining 11 step-tests by mirroring this pattern.
  test.skip("steps 4-14: full wizard + signup + payment + admin POV", () => {
    // Implementer note: this is the bulk of the work. Each step is
    // small in isolation; the bulk is exercising real form interactions
    // and Stripe Checkout (which requires a Stripe test mode webhook
    // listener to confirm). If Stripe webhooks aren't wired in CI, mock
    // the Stripe Checkout success via a direct call to the webhook
    // endpoint with a fixture payload.
  });
});
```

- [ ] **Step 2: Run the spec**

```bash
PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- tests/e2e/customer-journey/season-signup.spec.ts
```

Expected: steps 1-3 pass; step 4-14 is skipped (implementer note covers the work).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/customer-journey/season-signup.spec.ts
git commit -m "test(deep-dive): customer-journey spine spec (steps 1-3, rest scaffolded)"
```

---

## Phase F — Pre-push checks + open PR

### Task F.1: Run the pre-push checklist

- [ ] **Step 1: Generate any pending migration**

```bash
npx drizzle-kit generate
git status
```

If anything is newly generated, commit it.

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Unit tests**

```bash
npm run test:unit
```

Expected: all green.

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: completes without errors.

### Task F.2: Open the PR

- [ ] **Step 1: Push**

```bash
git push -u origin feat/admin-deep-dive-pr1
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --base main --head feat/admin-deep-dive-pr1 \
  --title "feat(admin): deep-dive PR1 — audit + bot detection + Day-0 seed" \
  --body "$(cat <<'EOF'
## Summary

PR #1 of the admin deep-dive (spec: docs/superpowers/specs/2026-05-16-admin-deep-dive-design.md). Three deliverables:

- **Audit triage doc** at docs/superpowers/specs/2026-05-17-admin-deep-dive-audit.md — every super-admin sidebar page + the customer-journey spine, with severity (P0/P1/P2) and effort (S/M/L/XL) per finding. Drives the scope of PRs #2-7.
- **Bot detection** — Cloudflare Turnstile on /signup, Gmail dot-trick normalization (new \`users.email_canonical\` column + migration 0028), 1-hour session lifetime until email verified (re-issued to 30 days on verify), daily cron that purges unverified accounts >7d old.
- **Day-0 launch seed** — real Aspire Sports data: Soccer sport, 4 venues, 8 age groups, 4 programs, 3 seasons (Adult 7v7 Summer open, Founders Tournament open, Worthington U10 draft), 2 founders teams, 4 games across weeks 1-2, FOUNDERS discount code. Idempotent. Stays in prod as the actual launch baseline.

PRs #2-7 (group-by-group fixes) follow once this audit lands.

## Test plan

- [ ] CI green (typecheck + test-api + test-critical)
- [ ] Day-0 seed runs idempotently against staging
- [ ] Day-0 seed runs idempotently against prod (verified manually before merge)
- [ ] Cloudflare Turnstile dashboard configured for the prod domain; env vars set in Netlify
- [ ] Bot signups blocked: try the Gmail dot-trick signup pattern — should 409 on the second attempt
- [ ] Unverified-account cron dry-run output reviewed before first scheduled fire

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Verify PR opens with green CI**

```bash
gh pr checks $(gh pr view --json number --jq .number) 2>&1 | head -10
```

---

## Self-review

Run after the plan is complete.

### Spec coverage check

| Spec section | Plan task(s) |
| --- | --- |
| §5 audit (super-admin sidebar, customer-journey spine) | Tasks D.1–D.8, E.1 |
| §6 customer-journey spine | Tasks E.1, E.2 |
| §7 Day-0 seed (pg_dump + sport + venues + age groups + programs + seasons + teams + games + discount) | Tasks A.2, B.1–B.11 |
| §8.1 Turnstile on /signup | Tasks C.5, C.6, C.7, C.8 |
| §8.2 Gmail dot-trick normalization | Tasks C.1, C.2, C.3, C.4 |
| §8.3 Unverified-account TTL cron | Task C.12 |
| §8.4 Pre-verification short session | Tasks C.9, C.10, C.11 |
| §9 PR plan (PR #1 = audit + bot detection + Day-0 seed) | This plan's scope |
| §10 quality gates | Task F.1 |

All spec sections have task coverage.

### Placeholder scan

- "Implementer fills in the remaining 11 step-tests" in Task E.2 step 1 is a deliberate scope-defer because writing 14 full Playwright steps would balloon this plan; the customer-journey audit (E.1) catches the same breakage manually. The skipped test is gated on Stripe webhook wiring which has its own surface.
- All other tasks have complete code.

### Type / column-name consistency

- `KEEP_ORG_ID`, `DOWNTOWN_LOCATION_ID`, `WORTHINGTON_LOCATION_ID` consistent across B.1–B.11.
- `emailCanonical` (schema) ↔ `email_canonical` (column) consistent between C.2, C.3, C.4.
- Step labels in audit doc template (Status/Severity/Effort/Fix PR) consistent with how Tasks D.2–D.8 fill them in.

### Risk-flagged items

- **Schema column names** for several tables (`sports.organization_id`, `venues.field_count`, `discount_codes.discount_type` vs `kind`) are based on best-guess reading of recent code. The seed tasks include explicit schema-check steps before insert to avoid runtime failures.
- **Lucia v3 session-expiry API** (Tasks C.9–C.11) — implementation patches `sessions.expiresAt` directly. If the Lucia SDK in this project exposes a `createSession(userId, attributes, options)` form with a `sessionExpiresIn` option, prefer that. The direct-DB patch is the safe fallback.
