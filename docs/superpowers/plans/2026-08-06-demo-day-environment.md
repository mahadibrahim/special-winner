# Demo-Day Staging Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the staging site (`https://aspire-sports-staging.netlify.app`) look like a real, operating league for tomorrow's partner-org demo: season history, live standings from scored games, referee and coach histories, populated admin reports, demo accounts, runbook.

**Architecture:** One branch-local script `scripts/seed-demo-day.ts` run repeatedly against the staging Railway DB via `./scripts/with-bws.sh npx tsx scripts/seed-demo-day.ts`. It is a sequence of section functions threaded through a shared `Ctx`, each idempotent (find-or-create by natural key, or delete-and-recreate for demo-owned games). No app code changes, no schema changes, nothing merges to `main` before the demo. Standings are NOT seeded — they compute from `games` rows (`status='completed'`, both team ids and both scores non-null) via `src/lib/leagues/standings.ts`.

**Tech Stack:** TypeScript, Drizzle ORM, tsx, existing schema modules under `src/lib/db/schema/`, patterns copied from `src/lib/db/seeds/seed-e2e-tests.ts`.

## Global Constraints

- **Never run `npm run db:seed:e2e` and never merge to `main`** between the first seed run and the end of the demo (staging auto-deploys `main`).
- **Staging-only guard:** the script refuses to run unless the `DATABASE_URL` hostname matches the pinned staging host (captured in Task 1 — the URL may NOT contain the substring "staging", so substring checks are insufficient).
- **All dates anchored to `new Date()` at run time** — no fixed UTC timestamps (repo hazard: time-of-day lottery). Re-running the script re-anchors "today's" fixtures.
- **Every `.limit(1)` lookup has an explicit `orderBy`** (shared-DB hazard).
- **Demo entity slugs never start with `e2e-`**; junk-tidy sets `isTest=true` on `e2e-*` slugs only.
- Demo accounts: `demo.admin@aspiresportsohio.com`, `demo.coach@…`, `demo.parent@…`, `demo.ref@…`, shared password `AspireDemo2026!`.
- Fictional family parent emails use `@example.com` (IETF-reserved — never fabricate real-looking third-party addresses). These users have `passwordHash: null` so they cannot log in. Staging sends no real mail (`MESSAGING_LIVE` unset).
- Flag football uses `DEFAULT_RULES` (no draws) — **never seed a drawn flag game**. Soccer allows draws.
- No `Math.random()` — deterministic score/attendance formulas so re-runs are stable.
- Testing model: there is no local Postgres. Each task's "test" = run the seed against staging (idempotent) + a verification query/HTTP check with expected output. That replaces unit-TDD for this data-only script.

## Verified schema facts the executor must not re-derive

- `seasons` required: `programId, name, slug, startDate("YYYY-MM-DD" string), endDate, priceCents`. Status enum: `draft|forming|open|closed|active|completed|cancelled`. Unique `(programId, slug)`. `audienceType` lives on **programs** (`"parents"` youth / `"adults"` adult), plain varchar.
- Public catalog (`/api/public/seasons`): shows `status IN (open, active, forming)`, `isTest=false` on season AND program; an `open` season also needs `registrationCloses > now()`. `/programs` page further filters to `open|forming`. Completed seasons reachable only via `?status=completed` (used by the adult league term/archive pages). Term grouping requires `termSlug` (seasons without it are dropped from term pages).
- `teams`: required `seasonId, name`; coach linkage is `teams.coachUserId` (that IS "my teams" everywhere — no join table). No unique key: find-or-create by `(seasonId, name)`.
- `games`: required `seasonId, scheduledAt(Date)`; nullable `homeTeamId/awayTeamId/venueId/homeScore/awayScore`; status enum `scheduled|in_progress|completed|postponed|cancelled`. No natural key.
- `gameOfficials`: required `gameId, userId`; defaults `position='referee'`, `feeCents=0`, `paymentStatus='unpaid'` (enum `unpaid|paid`). Unique `(gameId, userId)`. Assignment existence = acceptance (no pending state). `/referee` gate = RBAC role `referee` (roles row NOT in main bootstrap — must be ensured).
- `familyMembers`: required `firstName, lastName`; XOR `parentUserId`/`selfUserId` (CHECK constraint). Use `resolvePerson()` from `src/lib/registrations/resolve-person.ts` for dependents (dedupes on parent+name+DOB).
- `registrations`: required `seasonId, familyMemberId, registeredByUserId, amountDueCents`; status enum `pending|confirmed|waitlisted|cancelled|refunded`; paymentStatus enum `unpaid|deposit_paid|paid|failed|partial_refund|refunded`; partial unique `(familyMemberId, seasonId)` where status not cancelled/refunded. **No teamId — team linkage is `rosters(teamId, registrationId)`**, unique on that pair, `status='active'` needed for rosterCount.
- Coach roster page (`/api/coach/teams/{id}/roster`) **INNER JOINs `family_members.parent_user_id → users`** — every rostered kid must be a dependent with a real parent `users` row.
- `payments`: required `userId, amountCents, paymentType(deposit|full|balance|refund|installment)`; completed = `status:'succeeded'`. Revenue report inner-joins `payments.registrationId` → registrationId must be set. Refunds = separate row `paymentType:'refund'` (no status filter). Do not reuse fake Stripe ids across rows (partial uniques) — leave them null.
- Coach sessions = **`session_plans`** (`src/lib/db/schema/practice-planning.ts`): required `teamId, coachUserId, title, scheduledDate(timestamp), durationMinutes`; status `draft|planned|in_progress|completed|cancelled`. "Today's Sessions" on `/coach/practices` needs `scheduledDate` strictly in the future, status ≠ completed, same browser-local calendar day. Completed sessions should carry `completedAt`.
- `attendance` (in `teams.ts`): required `teamId, rosterId, eventDate, recordedByUserId`; set `sessionPlanId` (partial unique `(rosterId, sessionPlanId)`), `eventType:'practice'`, status enum `present|absent|late|excused`.
- `coach_notes` (in `teams.ts`): required `familyMemberId, teamId, coachUserId, title, content`; `visibleToParent` default true; category enum `progress|achievement|focus|encouragement|general`. Parent reads via `/api/family/coach-notes` (kid's `parentUserId` = parent).
- `player_assessments`: required `familyMemberId, skillId, coachUserId, level(int 1-5)`; set `seasonId, teamId, assessedAt, previousLevel`. No unique key — select-then-heal (e2e idiom at `seed-e2e-tests.ts:622-652`). Snapshots via `recomputePlayerSnapshots(db, familyMemberId, seasonId)`.
- NPS: `feedback_requests` (required `organizationId, kind, targetId, recipientUserId, tokenHash(unique), expiresAt`) with `kind:'nps_season'`, `status:'responded'` + `respondedAt` within 90d, plus `nps_responses` (`requestId` unique, `score` 0-10). Report ignores `referee_rating` kind.
- Referee ratings report (180d window): `referee_ratings` (required `requestId(unique), gameId, refereeUserId, overall, gameControl, communication, fairness` each 1-5) joined to org-scoped `feedback_requests` with `kind:'referee_rating'`, `gameOfficialId` set, `metadata.gameType:'league'`.
- Payroll export: `kind=referee` reads `gameOfficials⋈games` in date window (`paymentStatus='unpaid'` unless includePaid) with `feeCents`; `kind=hours` reads `time_entries` with role `coach|venue_manager`, **`clockOutAt` must be set** or hours = 0. `time_entries` CHECK: role `referee` ⟺ `gameId` set; coach entries must have `gameId: null`. Required: `organizationId, userId, venueId, role, clockInAt`.
- Parent "Upcoming Events" card reads `/api/registrations` and uses **`season.startDate` in the future** (not games). So the upcoming-season registration is what populates it.
- e2e idioms to copy: user+role creation `seed-e2e-tests.ts:2004-2036`; referee role bootstrap `:682-728`; season upsert `:1739-1783`; team find-or-create `:2737-2750`; games-with-scores block `:2752-2767`; official upsert `:783-800`; assessments `:589-655`.

---

### Task 1: Script skeleton — guard, context, demo accounts

**Files:**
- Create: `scripts/seed-demo-day.ts`

**Interfaces (Produces — later tasks consume these exactly):**
```ts
type DemoUser = { id: string; email: string; firstName: string; lastName: string };
type Ctx = {
  db: ReturnType<typeof getDb>;
  now: Date;
  org: { id: string };
  location: { id: string };
  venue: { id: string };
  roleMap: Record<string, { id: string }>;   // includes "referee"
  demo: { admin: DemoUser; coach: DemoUser; parent: DemoUser; ref: DemoUser };
};
// helpers exported within the file:
function daysAgo(n: number): Date;            // now - n days
function daysFromNow(n: number): Date;
function dstr(d: Date): string;               // "YYYY-MM-DD"
function at(d: Date, hour: number, minute?: number): Date; // local clone with time set
async function ensureUser(db, opts: { email: string; firstName: string; lastName: string; password?: string }): Promise<DemoUser>;
async function ensureRole(db, userId: string, roleId: string, scope: { scopeType: "global" } | { scopeType: "organization"; scopeId: string }): Promise<void>;
const DEMO_PASSWORD = "AspireDemo2026!";
```

- [ ] **Step 1: Capture the real staging host to pin the guard**

Run: `./scripts/with-bws.sh node -e "console.log(new URL(process.env.DATABASE_URL).host)"`
Record the output (e.g. `xxxx.proxy.rlwy.net:12345`). This exact string becomes `STAGING_HOST` in the script. Do NOT guess it and do NOT use a substring check for "staging".

- [ ] **Step 2: Write the skeleton**

```ts
// scripts/seed-demo-day.ts
//
// Demo-day seed for the 2026-08-07 partner demo. Branch-local; delete after
// the demo (repo convention for one-off scripts). Idempotent; re-run the
// morning of the demo to re-anchor today's game/session to demo day.
// Run: ./scripts/with-bws.sh npx tsx scripts/seed-demo-day.ts
import "dotenv/config";
import crypto from "node:crypto";
import { and, asc, eq, inArray, like } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import {
  users, roles, userRoles,
  organizations, locations,
  sports, programs, seasons, ageGroups,
  teams, rosters, games, gameOfficials, venues, attendance, coachNotes,
  familyMembers, registrations,
  payments,
  feedbackRequests, npsResponses, refereeRatings,
  timeEntries,
} from "../src/lib/db/schema";
import { sessionPlans } from "../src/lib/db/schema/practice-planning";
import { playerAssessments } from "../src/lib/db/schema/assessments";
import { resolvePerson } from "../src/lib/registrations/resolve-person";

const STAGING_HOST = "<PASTE STEP-1 OUTPUT HERE>"; // pinned staging Railway proxy host:port
const url = process.env.DATABASE_URL ?? "";
let host = "";
try { host = new URL(url).host; } catch { /* fallthrough to refusal */ }
if (host !== STAGING_HOST) {
  console.error(`Refusing to run: DATABASE_URL host "${host}" is not the pinned staging host.`);
  process.exit(1);
}

export const DEMO_PASSWORD = "AspireDemo2026!";
const NOW = new Date();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400_000);
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * 86400_000);
const dstr = (d: Date) => d.toISOString().slice(0, 10);
const at = (d: Date, hour: number, minute = 0) => {
  const c = new Date(d); c.setHours(hour, minute, 0, 0); return c;
};

async function ensureUser(db: ReturnType<typeof getDb>, opts: {
  email: string; firstName: string; lastName: string; password?: string;
}) {
  const passwordHash = opts.password ? await hashPassword(opts.password) : null;
  let [u] = await db.select().from(users)
    .where(eq(users.email, opts.email)).orderBy(asc(users.createdAt)).limit(1);
  if (!u) {
    [u] = await db.insert(users).values({
      email: opts.email, passwordHash,
      firstName: opts.firstName, lastName: opts.lastName, emailVerified: true,
    }).returning();
  } else if (opts.password) {
    await db.update(users).set({ passwordHash, emailVerified: true }).where(eq(users.id, u.id));
  }
  return { id: u.id, email: u.email, firstName: opts.firstName, lastName: opts.lastName };
}

async function ensureRole(db: ReturnType<typeof getDb>, userId: string, roleId: string,
  scope: { scopeType: "global" } | { scopeType: "organization"; scopeId: string }) {
  await db.delete(userRoles).where(eq(userRoles.userId, userId)); // e2e idiom: single-role demo users
  await db.insert(userRoles).values({ userId, roleId, ...scope });
}

async function main() {
  const db = getDb();

  const [org] = await db.select().from(organizations)
    .where(eq(organizations.slug, "aspire-sports"))
    .orderBy(asc(organizations.createdAt)).limit(1);
  if (!org) throw new Error("aspire-sports org not found on staging");

  const [location] = await db.select().from(locations)
    .where(eq(locations.organizationId, org.id))
    .orderBy(asc(locations.createdAt)).limit(1);
  if (!location) throw new Error("no location for aspire-sports org");

  let [venue] = await db.select().from(venues)
    .where(and(eq(venues.locationId, location.id), eq(venues.name, "Aspire Sports Park")))
    .orderBy(asc(venues.createdAt)).limit(1);
  if (!venue) {
    [venue] = await db.insert(venues).values({
      locationId: location.id, name: "Aspire Sports Park", fieldCount: 4, active: true,
    }).returning();
  }

  // Referee role is NOT in the main role bootstrap — ensure it (e2e idiom :682-697).
  await db.insert(roles).values({
    name: "referee",
    description: "Officiates assigned matches; enters final scores and incidents",
    permissions: ["games:read_assigned", "games:write_score"],
  }).onConflictDoNothing();
  const allRoles = await db.select().from(roles);
  const roleMap = Object.fromEntries(allRoles.map((r) => [r.name, r]));
  for (const need of ["super_admin", "coach", "parent", "referee"]) {
    if (!roleMap[need]) throw new Error(`role ${need} missing on staging — run db:seed:e2e once first? STOP and check.`);
  }

  const demo = {
    admin:  await ensureUser(db, { email: "demo.admin@aspiresportsohio.com",  firstName: "Dana",   lastName: "Okafor",  password: DEMO_PASSWORD }),
    coach:  await ensureUser(db, { email: "demo.coach@aspiresportsohio.com",  firstName: "Marcus", lastName: "Bell",    password: DEMO_PASSWORD }),
    parent: await ensureUser(db, { email: "demo.parent@aspiresportsohio.com", firstName: "Sarah",  lastName: "Mitchell",password: DEMO_PASSWORD }),
    ref:    await ensureUser(db, { email: "demo.ref@aspiresportsohio.com",    firstName: "Jordan", lastName: "Avery",   password: DEMO_PASSWORD }),
  };
  await ensureRole(db, demo.admin.id,  roleMap.super_admin.id, { scopeType: "global" });
  await ensureRole(db, demo.coach.id,  roleMap.coach.id,   { scopeType: "organization", scopeId: org.id });
  await ensureRole(db, demo.parent.id, roleMap.parent.id,  { scopeType: "organization", scopeId: org.id });
  await ensureRole(db, demo.ref.id,    roleMap.referee.id, { scopeType: "organization", scopeId: org.id });
  console.log("✓ context + demo accounts", Object.fromEntries(Object.entries(demo).map(([k, v]) => [k, v.email])));

  const ctx = { db, now: NOW, org, location, venue, roleMap, demo };
  // Later tasks append section calls here, threading ctx and returned ids.
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run it against staging**

Run: `./scripts/with-bws.sh npx tsx scripts/seed-demo-day.ts`
Expected: `✓ context + demo accounts {...}` then clean exit. If the guard refuses, the pinned host is wrong — redo Step 1, do not weaken the guard.

- [ ] **Step 4: Verify sign-in works on the live staging site**

Run: `curl -s -X POST https://aspire-sports-staging.netlify.app/api/auth/signin -H 'content-type: application/json' -d '{"email":"demo.admin@aspiresportsohio.com","password":"AspireDemo2026!"}' -i | head -5`
Expected: 200 (or a redirect/set-cookie — anything but 401). Repeat for `demo.ref` (referee role gate exercised later in browser).

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-demo-day.ts
git commit -m "feat(demo): seed skeleton — staging guard, context, demo accounts"
```

---

### Task 2: Youth catalog — programs, seasons (past/current/upcoming), junk tidy

**Files:**
- Modify: `scripts/seed-demo-day.ts`

**Interfaces:**
- Consumes: `Ctx`, `dstr`, `daysAgo`, `daysFromNow`.
- Produces: `async function seedYouthCatalog(ctx: Ctx): Promise<{ sportId: string; programId: string; ageGroupU8Id: string; ys: { fall25: string; spring26: string; summer26: string; fall26: string } }>` (season ids), called from `main()` after account setup.

- [ ] **Step 1: Add the section**

```ts
async function upsertSeason(db: Ctx["db"], programId: string, slug: string, fields: Record<string, unknown>) {
  // e2e idiom :1739-1783 — select by (programId, slug), insert else full re-sync update.
  let [s] = await db.select().from(seasons)
    .where(and(eq(seasons.programId, programId), eq(seasons.slug, slug)))
    .orderBy(asc(seasons.createdAt)).limit(1);
  if (!s) [s] = await db.insert(seasons).values({ programId, slug, ...fields } as any).returning();
  else [s] = await db.update(seasons).set(fields as any).where(eq(seasons.id, s.id)).returning();
  return s;
}

async function seedYouthCatalog(ctx: Ctx) {
  const { db, org, location } = ctx;
  let [sport] = await db.select().from(sports)
    .where(and(eq(sports.organizationId, org.id), eq(sports.slug, "soccer")))
    .orderBy(asc(sports.createdAt)).limit(1);
  if (!sport) [sport] = await db.insert(sports).values({ organizationId: org.id, name: "Soccer", slug: "soccer" }).returning();

  let [u8] = await db.select().from(ageGroups)
    .where(and(eq(ageGroups.organizationId, org.id), eq(ageGroups.name, "U8")))
    .orderBy(asc(ageGroups.createdAt)).limit(1);
  if (!u8) [u8] = await db.insert(ageGroups).values({ organizationId: org.id, name: "U8", minAge: 6, maxAge: 8 }).returning();

  let [program] = await db.select().from(programs)
    .where(and(eq(programs.locationId, location.id), eq(programs.slug, "youth-soccer")))
    .orderBy(asc(programs.createdAt)).limit(1);
  const programFields = {
    sportId: sport.id, name: "Youth Soccer League",
    description: "Recreational youth soccer with a development-first curriculum. Weekly practice plus Saturday games.",
    programType: "league" as const, audienceType: "parents", active: true, isTest: false,
  };
  if (!program) [program] = await db.insert(programs).values({ locationId: location.id, slug: "youth-soccer", ...programFields }).returning();
  else [program] = await db.update(programs).set(programFields).where(eq(programs.id, program.id)).returning();

  const shared = { ageGroupId: u8.id, priceCents: 19500, signupModes: ["individual"], isTest: false };
  const fall25 = await upsertSeason(db, program.id, "fall-2025", { ...shared,
    name: "Fall 2025", startDate: dstr(daysAgo(330)), endDate: dstr(daysAgo(260)), status: "completed" });
  const spring26 = await upsertSeason(db, program.id, "spring-2026", { ...shared,
    name: "Spring 2026", startDate: dstr(daysAgo(150)), endDate: dstr(daysAgo(80)), status: "completed" });
  const summer26 = await upsertSeason(db, program.id, "summer-2026", { ...shared,
    name: "Summer 2026", startDate: dstr(daysAgo(35)), endDate: dstr(daysFromNow(25)), status: "active",
    registrationOpens: daysAgo(90), registrationCloses: daysAgo(40),
    scheduleNotes: "Practice Tue 5:30pm · Games Sat mornings" });
  const fall26 = await upsertSeason(db, program.id, "fall-2026", { ...shared,
    name: "Fall 2026", startDate: dstr(daysFromNow(33)), endDate: dstr(daysFromNow(100)), status: "open",
    registrationOpens: daysAgo(20), registrationCloses: daysFromNow(26),
    scheduleNotes: "Practice Tue 5:30pm · Games Sat mornings" });

  // Junk tidy: hide e2e fixtures from every public surface (isTest is filtered everywhere).
  await db.update(seasons).set({ isTest: true }).where(like(seasons.slug, "e2e-%"));
  await db.update(programs).set({ isTest: true }).where(like(programs.slug, "e2e-%"));

  console.log("✓ youth catalog", { program: program.slug });
  return { sportId: sport.id, programId: program.id, ageGroupU8Id: u8.id,
    ys: { fall25: fall25.id, spring26: spring26.id, summer26: summer26.id, fall26: fall26.id } };
}
```
In `main()`, after the demo-accounts block: `const youth = await seedYouthCatalog(ctx);`

- [ ] **Step 2: Run the seed twice** (idempotency check)

Run: `./scripts/with-bws.sh npx tsx scripts/seed-demo-day.ts` — twice.
Expected: both runs succeed; second run makes no duplicate seasons.

- [ ] **Step 3: Verify on the live catalog API**

Run: `curl -s "https://aspire-sports-staging.netlify.app/api/public/seasons" | python3 -m json.tool | grep -E '"name"|"status"' | head -40`
Expected: `Fall 2026` present with status `open`; NO `e2e-` named seasons anywhere in the output.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-demo-day.ts
git commit -m "feat(demo): youth catalog seasons + e2e junk tidy"
```

---

### Task 3: Adult flag football catalog — terms with past/current/upcoming divisions

**Files:**
- Modify: `scripts/seed-demo-day.ts`

**Interfaces:**
- Consumes: `Ctx`, `upsertSeason`.
- Produces: `async function seedFlagCatalog(ctx: Ctx): Promise<{ sportId: string; programId: string; fs: { springB: string; springC: string; summerB: string; fallB: string; fallC: string } }>` — season ids per division. Called from `main()` after `seedYouthCatalog`.

- [ ] **Step 1: Add the section**

```ts
async function seedFlagCatalog(ctx: Ctx) {
  const { db, org, location } = ctx;
  let [sport] = await db.select().from(sports)
    .where(and(eq(sports.organizationId, org.id), eq(sports.slug, "flag-football")))
    .orderBy(asc(sports.createdAt)).limit(1);
  if (!sport) [sport] = await db.insert(sports).values({ organizationId: org.id, name: "Flag Football", slug: "flag-football" }).returning();

  let [adult] = await db.select().from(ageGroups)
    .where(and(eq(ageGroups.organizationId, org.id), eq(ageGroups.name, "Adult 18+")))
    .orderBy(asc(ageGroups.createdAt)).limit(1);
  if (!adult) [adult] = await db.insert(ageGroups).values({ organizationId: org.id, name: "Adult 18+", minAge: 18, maxAge: 99 }).returning();

  let [program] = await db.select().from(programs)
    .where(and(eq(programs.locationId, location.id), eq(programs.slug, "adult-flag-football")))
    .orderBy(asc(programs.createdAt)).limit(1);
  const pf = { sportId: sport.id, name: "Adult Flag Football",
    description: "4v4 co-ed flag football. Weeknight games, 7-game seasons.",
    programType: "league" as const, audienceType: "adults", active: true, isTest: false };
  if (!program) [program] = await db.insert(programs).values({ locationId: location.id, slug: "adult-flag-football", ...pf }).returning();
  else [program] = await db.update(programs).set(pf).where(eq(programs.id, program.id)).returning();

  const div = (skill: "b" | "c") => ({
    ageGroupId: adult.id, priceCents: 10500, teamPriceCents: 79500,
    signupModes: ["team", "individual"], divisionGender: "coed", skillLevel: skill,
    dayOfWeek: "wed", startTime: "18:30", endTime: "22:00", isTest: false,
  });
  // Past term — fully played (archive + standings history).
  const springB = await upsertSeason(db, program.id, "flag-spring-2026-coed-b", { ...div("b"),
    name: "Spring 2026 — Coed B", termSlug: "spring-2026", termLabel: "Spring 2026",
    startDate: dstr(daysAgo(140)), endDate: dstr(daysAgo(90)), status: "completed" });
  const springC = await upsertSeason(db, program.id, "flag-spring-2026-coed-c", { ...div("c"),
    name: "Spring 2026 — Coed C", termSlug: "spring-2026", termLabel: "Spring 2026",
    startDate: dstr(daysAgo(140)), endDate: dstr(daysAgo(90)), status: "completed" });
  // Current term — mid-season (live standings).
  const summerB = await upsertSeason(db, program.id, "flag-summer-2026-coed-b", { ...div("b"),
    name: "Summer 2026 — Coed B", termSlug: "summer-2026", termLabel: "Summer 2026",
    startDate: dstr(daysAgo(28)), endDate: dstr(daysFromNow(21)), status: "active",
    registrationCloses: daysAgo(30) });
  // Upcoming term — registration open (the funnel is live).
  const fallB = await upsertSeason(db, program.id, "flag-fall-2026-coed-b", { ...div("b"),
    name: "Fall 2026 — Coed B", termSlug: "fall-2026", termLabel: "Fall 2026",
    startDate: dstr(daysFromNow(35)), endDate: dstr(daysFromNow(85)), status: "open",
    registrationOpens: daysAgo(10), registrationCloses: daysFromNow(28) });
  const fallC = await upsertSeason(db, program.id, "flag-fall-2026-coed-c", { ...div("c"),
    name: "Fall 2026 — Coed C", termSlug: "fall-2026", termLabel: "Fall 2026",
    startDate: dstr(daysFromNow(35)), endDate: dstr(daysFromNow(85)), status: "open",
    registrationOpens: daysAgo(10), registrationCloses: daysFromNow(28) });

  console.log("✓ flag catalog");
  return { sportId: sport.id, programId: program.id,
    fs: { springB: springB.id, springC: springC.id, summerB: summerB.id, fallB: fallB.id, fallC: fallC.id } };
}
```
In `main()`: `const flag = await seedFlagCatalog(ctx);`

- [ ] **Step 2: Run seed, verify term pages**

Run: `./scripts/with-bws.sh npx tsx scripts/seed-demo-day.ts`
Then: `curl -s "https://aspire-sports-staging.netlify.app/adult/leagues/flag-football" | grep -oE "Spring 2026|Summer 2026|Fall 2026" | sort -u`
Expected: all three term labels present (past / current / upcoming partitions).

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-demo-day.ts
git commit -m "feat(demo): adult flag football terms — past, current, upcoming"
```

---

### Task 4: Youth families, registrations, payments, coach team + rosters

**Files:**
- Modify: `scripts/seed-demo-day.ts`

**Interfaces:**
- Consumes: `Ctx`, youth season ids from Task 2 (`youth.ys`), `resolvePerson`.
- Produces: `async function seedYouthPeople(ctx: Ctx, youth: Awaited<ReturnType<typeof seedYouthCatalog>>): Promise<{ thunderTeamId: string; rostersByKid: Record<string, { rosterId: string; familyMemberId: string; parentUserId: string; regId: string }> }>` — keyed by kid first name. `demo.parent`'s kid is `Maya`.

- [ ] **Step 1: Add the section**

```ts
const FAMILIES = [
  // Maya belongs to demo.parent (Sarah Mitchell) — parentEmail null means "use ctx.demo.parent".
  { kid: "Maya",   kidLast: "Mitchell",  dob: "2018-04-12", parentEmail: null,                          pFirst: "Sarah",  pLast: "Mitchell" },
  { kid: "Leo",    kidLast: "Tran",      dob: "2018-07-03", parentEmail: "minh.tran@example.com",       pFirst: "Minh",   pLast: "Tran" },
  { kid: "Ava",    kidLast: "Rossi",     dob: "2018-01-22", parentEmail: "elena.rossi@example.com",     pFirst: "Elena",  pLast: "Rossi" },
  { kid: "Noah",   kidLast: "Whitfield", dob: "2017-11-09", parentEmail: "james.whitfield@example.com", pFirst: "James",  pLast: "Whitfield" },
  { kid: "Zoe",    kidLast: "Okonkwo",   dob: "2018-03-30", parentEmail: "ada.okonkwo@example.com",     pFirst: "Ada",    pLast: "Okonkwo" },
  { kid: "Eli",    kidLast: "Garcia",    dob: "2018-09-15", parentEmail: "rosa.garcia@example.com",     pFirst: "Rosa",   pLast: "Garcia" },
  { kid: "Ruby",   kidLast: "Chen",      dob: "2018-06-08", parentEmail: "wei.chen@example.com",        pFirst: "Wei",    pLast: "Chen" },
  { kid: "Owen",   kidLast: "Novak",     dob: "2017-12-27", parentEmail: "petra.novak@example.com",     pFirst: "Petra",  pLast: "Novak" },
  { kid: "Isla",   kidLast: "Haddad",    dob: "2018-02-14", parentEmail: "sami.haddad@example.com",     pFirst: "Sami",   pLast: "Haddad" },
  { kid: "Jonas",  kidLast: "Berg",      dob: "2018-08-19", parentEmail: "anna.berg@example.com",       pFirst: "Anna",   pLast: "Berg" },
];

async function ensureRegistration(db: Ctx["db"], opts: {
  seasonId: string; familyMemberId: string; registeredByUserId: string;
  status: "confirmed" | "pending"; paid: boolean; amountCents: number; createdAt: Date;
}) {
  let [reg] = await db.select().from(registrations)
    .where(and(eq(registrations.familyMemberId, opts.familyMemberId), eq(registrations.seasonId, opts.seasonId)))
    .orderBy(asc(registrations.createdAt)).limit(1);
  if (!reg) {
    [reg] = await db.insert(registrations).values({
      seasonId: opts.seasonId, familyMemberId: opts.familyMemberId,
      registeredByUserId: opts.registeredByUserId, status: opts.status,
      paymentStatus: opts.paid ? "paid" : "unpaid", registrationType: "full",
      amountDueCents: opts.amountCents, amountPaidCents: opts.paid ? opts.amountCents : 0,
      waiverSigned: true, createdAt: opts.createdAt,
    }).returning();
  }
  if (opts.paid) {
    const [existingPay] = await db.select({ id: payments.id }).from(payments)
      .where(and(eq(payments.registrationId, reg.id), eq(payments.paymentType, "full")))
      .orderBy(asc(payments.createdAt)).limit(1);
    if (!existingPay) {
      await db.insert(payments).values({
        userId: opts.registeredByUserId, registrationId: reg.id,
        amountCents: opts.amountCents, paymentType: "full", status: "succeeded",
        createdAt: new Date(opts.createdAt.getTime() + 2 * 60_000),
      });
    }
  }
  return reg;
}

async function seedYouthPeople(ctx: Ctx, youth: { ys: { fall25: string; spring26: string; summer26: string; fall26: string } }) {
  const { db, org, demo } = ctx;
  const rostersByKid: Record<string, { rosterId: string; familyMemberId: string; parentUserId: string; regId: string }> = {};

  // Opponent teams for the current season (no rosters needed — games/standings only).
  const YOUTH_TEAMS = ["Thunder", "Comets", "Red Dragons", "Wolves", "Falcons", "Tigers"];
  const teamIds: Record<string, string> = {};
  for (const name of YOUTH_TEAMS) {
    let [t] = await db.select().from(teams)
      .where(and(eq(teams.seasonId, youth.ys.summer26), eq(teams.name, name)))
      .orderBy(asc(teams.createdAt)).limit(1);
    if (!t) [t] = await db.insert(teams).values({
      seasonId: youth.ys.summer26, name, division: "U8",
      coachUserId: name === "Thunder" ? demo.coach.id : null,
    }).returning();
    else if (name === "Thunder" && t.coachUserId !== demo.coach.id) {
      await db.update(teams).set({ coachUserId: demo.coach.id }).where(eq(teams.id, t.id));
    }
    teamIds[name] = t.id;
  }
  // Past-season Thunder so the coach has multi-season history.
  let [pastThunder] = await db.select().from(teams)
    .where(and(eq(teams.seasonId, youth.ys.spring26), eq(teams.name, "Thunder")))
    .orderBy(asc(teams.createdAt)).limit(1);
  if (!pastThunder) [pastThunder] = await db.insert(teams).values({
    seasonId: youth.ys.spring26, name: "Thunder", division: "U8", coachUserId: demo.coach.id,
  }).returning();

  let jersey = 2;
  for (const fam of FAMILIES) {
    const parent = fam.parentEmail
      ? await ensureUser(db, { email: fam.parentEmail, firstName: fam.pFirst, lastName: fam.pLast }) // no password — cannot log in
      : demo.parent;
    const kid = await resolvePerson(db, {
      kind: "dependent", parentUserId: parent.id,
      firstName: fam.kid, lastName: fam.kidLast, birthDate: fam.dob,
    });
    // Current season: everyone confirmed + paid, createdAt staggered 55..46 days ago.
    const idx = FAMILIES.indexOf(fam);
    const reg = await ensureRegistration(db, {
      seasonId: youth.ys.summer26, familyMemberId: kid.id, registeredByUserId: parent.id,
      status: "confirmed", paid: true, amountCents: 19500, createdAt: daysAgo(55 - idx),
    });
    // Upcoming season: first 6 kids re-registered in the last 10 days (4 paid, 2 pending).
    if (idx < 6) {
      await ensureRegistration(db, {
        seasonId: youth.ys.fall26, familyMemberId: kid.id, registeredByUserId: parent.id,
        status: idx < 4 ? "confirmed" : "pending", paid: idx < 4, amountCents: 19500,
        createdAt: daysAgo(10 - idx),
      });
    }
    // History: first 4 kids played the two past seasons too.
    if (idx < 4) {
      const s26 = await ensureRegistration(db, {
        seasonId: youth.ys.spring26, familyMemberId: kid.id, registeredByUserId: parent.id,
        status: "confirmed", paid: true, amountCents: 19500, createdAt: daysAgo(170 - idx),
      });
      await ensureRegistration(db, {
        seasonId: youth.ys.fall25, familyMemberId: kid.id, registeredByUserId: parent.id,
        status: "confirmed", paid: true, amountCents: 19500, createdAt: daysAgo(350 - idx),
      });
      // Past-season roster for coach history.
      await db.insert(rosters).values({ teamId: pastThunder.id, registrationId: s26.id, status: "active" })
        .onConflictDoNothing();
    }
    // Current roster on Thunder.
    let [rosterRow] = await db.select().from(rosters)
      .where(and(eq(rosters.teamId, teamIds.Thunder), eq(rosters.registrationId, reg.id)))
      .orderBy(asc(rosters.createdAt)).limit(1);
    if (!rosterRow) [rosterRow] = await db.insert(rosters).values({
      teamId: teamIds.Thunder, registrationId: reg.id, jerseyNumber: String(jersey), status: "active",
    }).returning();
    jersey += 1;
    rostersByKid[fam.kid] = { rosterId: rosterRow.id, familyMemberId: kid.id, parentUserId: parent.id, regId: reg.id };
  }
  // One refund for realism in the revenue report.
  const zoe = rostersByKid["Zoe"];
  const [refundExists] = await db.select({ id: payments.id }).from(payments)
    .where(and(eq(payments.registrationId, zoe.regId), eq(payments.paymentType, "refund")))
    .orderBy(asc(payments.createdAt)).limit(1);
  if (!refundExists) {
    await db.insert(payments).values({
      userId: zoe.parentUserId, registrationId: zoe.regId, amountCents: 5000,
      paymentType: "refund", status: "succeeded", refundReason: "Missed two weeks — goodwill credit",
      createdAt: daysAgo(12),
    });
  }
  console.log("✓ youth families, registrations, payments, rosters");
  return { thunderTeamId: teamIds.Thunder, youthTeamIds: teamIds, rostersByKid };
}
```
In `main()`: `const people = await seedYouthPeople(ctx, youth);`

- [ ] **Step 2: Run seed twice, then verify via the site**

Run: `./scripts/with-bws.sh npx tsx scripts/seed-demo-day.ts` (twice — second run must not duplicate registrations/rosters/payments; the partial-unique on `(familyMemberId, seasonId)` would error loudly if `ensureRegistration` were wrong).
Then sign in via browser as `demo.parent@aspiresportsohio.com` on staging: `/dashboard` must land on the family dashboard showing Maya, with Fall 2026 in Upcoming Events.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-demo-day.ts
git commit -m "feat(demo): youth families, multi-season registrations, payments, Thunder roster"
```

---

### Task 5: Games, scores, referee assignments (flag + youth)

**Files:**
- Modify: `scripts/seed-demo-day.ts`

**Interfaces:**
- Consumes: `Ctx`, `flag.fs`, `people.youthTeamIds`, `people.thunderTeamId`, youth season ids.
- Produces: `async function seedGames(ctx, youth, flag, people): Promise<{ ratedGameOfficials: Array<{ gameId: string; gameOfficialId: string }> }>` — completed flag games officiated by `demo.ref`, consumed by Task 7 for ratings.
- Demo-owned games are **delete-then-recreated per demo season** each run (safe: these seasons are created solely by this script; cascades remove officials/ratings which this run recreates). Before deleting, referee-rating feedback requests targeting those games are removed (no FK on `targetId`, they'd orphan).

- [ ] **Step 1: Add the section**

```ts
// Deterministic score pair; never a draw (flag rules disallow draws).
const flagScore = (i: number): [number, number] => {
  const a = 12 + ((i * 7) % 15); const b = 6 + ((i * 5) % 13);
  return a === b ? [a + 6, b] : [a, b];
};
// Round-robin: 6 teams -> 5 rounds x 3 games. Standard circle method.
function roundRobin(ids: string[]): Array<Array<[string, string]>> {
  const n = ids.length; const arr = [...ids]; const rounds: Array<Array<[string, string]>> = [];
  for (let r = 0; r < n - 1; r++) {
    const round: Array<[string, string]> = [];
    for (let i = 0; i < n / 2; i++) round.push([arr[i], arr[n - 1 - i]]);
    rounds.push(round);
    arr.splice(1, 0, arr.pop() as string);
  }
  return rounds;
}

async function resetSeasonGames(ctx: Ctx, seasonId: string) {
  const { db } = ctx;
  const old = await db.select({ id: games.id }).from(games).where(eq(games.seasonId, seasonId));
  if (old.length) {
    const ids = old.map((g) => g.id);
    await db.delete(feedbackRequests).where(and(
      eq(feedbackRequests.kind, "referee_rating"), inArray(feedbackRequests.targetId, ids)));
    await db.delete(games).where(inArray(games.id, ids)); // cascades officials/ratings/incidents
  }
}

async function seedFlagDivisionGames(ctx: Ctx, opts: {
  seasonId: string; teamNames: string[]; firstMatchday: Date; playedRounds: number;
  refUserId?: string; refPaid?: boolean;
}) {
  const { db, venue } = ctx;
  const teamIds: string[] = [];
  for (const name of opts.teamNames) {
    let [t] = await db.select().from(teams)
      .where(and(eq(teams.seasonId, opts.seasonId), eq(teams.name, name)))
      .orderBy(asc(teams.createdAt)).limit(1);
    if (!t) [t] = await db.insert(teams).values({ seasonId: opts.seasonId, name }).returning();
    teamIds.push(t.id);
  }
  await resetSeasonGames(ctx, opts.seasonId);
  const officiated: Array<{ gameId: string; gameOfficialId: string }> = [];
  const rounds = roundRobin(teamIds);
  let gi = 0;
  for (let r = 0; r < rounds.length; r++) {
    const matchday = new Date(opts.firstMatchday.getTime() + r * 7 * 86400_000);
    for (let m = 0; m < rounds[r].length; m++) {
      const [home, away] = rounds[r][m];
      const played = r < opts.playedRounds;
      const [hs, as] = flagScore(gi);
      const [g] = await db.insert(games).values({
        seasonId: opts.seasonId, homeTeamId: home, awayTeamId: away,
        scheduledAt: at(matchday, 18 + m, 30), venueId: venue.id, fieldNumber: String(m + 1),
        durationMinutes: 50,
        status: played ? "completed" : "scheduled",
        homeScore: played ? hs : null, awayScore: played ? as : null,
      }).returning();
      if (opts.refUserId) {
        const [go] = await db.insert(gameOfficials).values({
          gameId: g.id, userId: opts.refUserId, position: "referee",
          feeCents: 3500, paymentStatus: opts.refPaid && played ? "paid" : "unpaid",
        }).returning();
        if (played) officiated.push({ gameId: g.id, gameOfficialId: go.id });
      }
      gi += 1;
    }
  }
  return officiated;
}

async function seedGames(ctx: Ctx, youth: { ys: Record<string, string> }, flag: { fs: Record<string, string> },
  people: { youthTeamIds: Record<string, string>; thunderTeamId: string }) {
  const { db, demo, venue } = ctx;
  const B = ["Gridiron Gurus", "Blitz Mode", "Sunday Scaries", "Turf Burners", "Hail Marys", "Zone Six"];
  const C = ["Backyard Ballers", "The Replacements", "Flag Em Down", "Monday Quarterbacks", "Shortside", "Late Flags"];

  // Past term: fully played (5/5 rounds). demo.ref officiated division B, all paid.
  const springOff = await seedFlagDivisionGames(ctx, { seasonId: flag.fs.springB, teamNames: B,
    firstMatchday: daysAgo(135), playedRounds: 5, refUserId: demo.ref.id, refPaid: true });
  await seedFlagDivisionGames(ctx, { seasonId: flag.fs.springC, teamNames: C,
    firstMatchday: daysAgo(135), playedRounds: 5 });
  // Current term: 4 of 5 rounds played, demo.ref officiating, current fees unpaid.
  const summerOff = await seedFlagDivisionGames(ctx, { seasonId: flag.fs.summerB, teamNames: B,
    firstMatchday: daysAgo(28), playedRounds: 4, refUserId: demo.ref.id, refPaid: false });

  // Tonight's showcase assignment for the ref app: scheduled a few hours from now.
  const [tonight] = await db.insert(games).values({
    seasonId: flag.fs.summerB, scheduledAt: new Date(ctx.now.getTime() + 3 * 3600_000),
    venueId: venue.id, fieldNumber: "1", durationMinutes: 50, status: "scheduled",
  }).returning();
  await db.insert(gameOfficials).values({
    gameId: tonight.id, userId: demo.ref.id, position: "referee", feeCents: 3500,
  }).onConflictDoNothing();

  // Youth current season: Saturday games, 4 played (soccer — one draw is fine), 2 upcoming.
  await resetSeasonGames(ctx, youth.ys.summer26);
  const yt = people.youthTeamIds;
  const youthFixtures: Array<[string, string, number, number | null, number | null]> = [
    // [home, away, weeksAgoSat, homeScore, awayScore]
    ["Thunder", "Comets", 4, 3, 1], ["Red Dragons", "Wolves", 4, 2, 2],
    ["Thunder", "Falcons", 3, 2, 0], ["Tigers", "Comets", 3, 1, 4],
    ["Wolves", "Thunder", 2, 1, 2], ["Falcons", "Red Dragons", 2, 0, 3],
    ["Thunder", "Tigers", 1, 4, 2], ["Comets", "Wolves", 1, 2, 1],
  ];
  for (const [h, a, w, hs, as] of youthFixtures) {
    await db.insert(games).values({
      seasonId: youth.ys.summer26, homeTeamId: yt[h], awayTeamId: yt[a],
      scheduledAt: at(daysAgo(w * 7), 9, 30), venueId: venue.id, durationMinutes: 60,
      status: "completed", homeScore: hs, awayScore: as,
    });
  }
  // Upcoming Saturday games (Thunder plays — shows on coach schedule).
  await db.insert(games).values([
    { seasonId: youth.ys.summer26, homeTeamId: yt.Thunder, awayTeamId: yt["Red Dragons"],
      scheduledAt: at(daysFromNow(2), 9, 30), venueId: venue.id, durationMinutes: 60, status: "scheduled" },
    { seasonId: youth.ys.summer26, homeTeamId: yt.Falcons, awayTeamId: yt.Comets,
      scheduledAt: at(daysFromNow(2), 10, 45), venueId: venue.id, durationMinutes: 60, status: "scheduled" },
  ]);

  console.log(`✓ games: flag spring B/C + summer B (+tonight), youth summer (ref history: ${springOff.length + summerOff.length} games)`);
  return { ratedGameOfficials: [...springOff, ...summerOff] };
}
```
In `main()`: `const gameData = await seedGames(ctx, youth, flag, people);`

- [ ] **Step 2: Run seed, verify standings derive live**

Run: `./scripts/with-bws.sh npx tsx scripts/seed-demo-day.ts`
Then: `curl -s "https://aspire-sports-staging.netlify.app/api/public/league-standings?seasonId=<summerB-id>" | python3 -m json.tool | head -30` (the script logs season ids; or grab from the run output).
Expected: 6 teams, `played` = 12 games' worth (each team 4), non-zero wins/losses, results list newest-first. Also re-run the seed once more — standings identical (deterministic scores).

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-demo-day.ts
git commit -m "feat(demo): flag + youth games with scores, ref assignments, tonight's fixture"
```

---

### Task 6: Coach history — sessions, attendance, assessments, coach notes, time entries

**Files:**
- Modify: `scripts/seed-demo-day.ts`

**Interfaces:**
- Consumes: `Ctx`, `people.thunderTeamId`, `people.rostersByKid`, `youth.ys.summer26`, `youth.sportId`.
- Produces: `async function seedCoachHistory(ctx, youth, people): Promise<void>`. Assessment skills: reuse existing curriculum skills for the soccer sport when present; otherwise create four realistic skills copying the e2e idiom at `seed-e2e-tests.ts:511-620` (stage `fundamentals`, one skill per domain) with slugs/names `first-touch`/“First Touch”, `spatial-awareness`/“Spatial Awareness”, `agility-balance`/“Agility & Balance”, `confidence-focus`/“Confidence & Focus”. Snapshots via `recomputePlayerSnapshots` (same import the e2e seed uses).

- [ ] **Step 1: Add the section**

```ts
async function seedCoachHistory(ctx: Ctx, youth: { ys: Record<string, string>; sportId: string },
  people: { thunderTeamId: string; rostersByKid: Record<string, { rosterId: string; familyMemberId: string; parentUserId: string; regId: string }> }) {
  const { db, org, demo, venue } = ctx;
  const teamId = people.thunderTeamId;
  const kids = Object.entries(people.rostersByKid);

  // --- Practice sessions: 5 completed Tuesdays + today + next week -----------
  async function ensureSession(title: string, scheduledDate: Date, status: "completed" | "planned",
    reflections?: { whatWorkedWell: string; whatToImprove: string }) {
    let [s] = await db.select().from(sessionPlans)
      .where(and(eq(sessionPlans.teamId, teamId), eq(sessionPlans.title, title)))
      .orderBy(asc(sessionPlans.createdAt)).limit(1);
    const fields = {
      coachUserId: demo.coach.id, scheduledDate, durationMinutes: 60, status,
      completedAt: status === "completed" ? new Date(scheduledDate.getTime() + 60 * 60_000) : null,
      objectives: ["Ball mastery", "Small-sided play"],
      ...(reflections ?? {}),
    };
    if (!s) [s] = await db.insert(sessionPlans).values({ teamId, title, ...fields }).returning();
    else [s] = await db.update(sessionPlans).set(fields).where(eq(sessionPlans.id, s.id)).returning();
    return s;
  }
  const pastSessions = [];
  const themes = ["Dribbling & 1v1s", "First Touch Circuit", "Passing & Possession", "Finishing Fun", "Defending Shape"];
  for (let w = 5; w >= 1; w--) {
    pastSessions.push(await ensureSession(
      `Practice — ${themes[5 - w]}`, at(daysAgo(w * 7 - 1), 17, 30), "completed",
      { whatWorkedWell: "High energy in the small-sided games; everyone touched the ball a lot.",
        whatToImprove: "Transitions between stations were slow — tighter whistle next time." }));
  }
  await ensureSession("Practice — Game Prep & Set Pieces", new Date(ctx.now.getTime() + 3 * 3600_000), "planned");
  await ensureSession("Practice — Shielding & Support Play", at(daysFromNow(6), 17, 30), "planned");

  // --- Attendance for the completed sessions (unique (rosterId, sessionPlanId)) ---
  for (const s of pastSessions) {
    for (let k = 0; k < kids.length; k++) {
      const [, kid] = kids[k];
      const status = (k * 31 + pastSessions.indexOf(s) * 7) % 11 === 0 ? "absent"
        : (k * 13 + pastSessions.indexOf(s) * 3) % 9 === 0 ? "late" : "present";
      await db.insert(attendance).values({
        teamId, rosterId: kid.rosterId, sessionPlanId: s.id, eventType: "practice",
        eventDate: s.scheduledDate, status, recordedByUserId: demo.coach.id,
      }).onConflictDoNothing();
    }
  }

  // --- Coach time entries (payroll hours). CHECK: coach entries must have gameId null. ---
  for (const s of pastSessions) {
    const clockInAt = new Date(s.scheduledDate.getTime() - 15 * 60_000);
    const [existing] = await db.select({ id: timeEntries.id }).from(timeEntries)
      .where(and(eq(timeEntries.userId, demo.coach.id), eq(timeEntries.clockInAt, clockInAt)))
      .orderBy(asc(timeEntries.createdAt)).limit(1);
    if (!existing) {
      await db.insert(timeEntries).values({
        organizationId: org.id, userId: demo.coach.id, venueId: venue.id, role: "coach",
        clockInAt, clockOutAt: new Date(s.scheduledDate.getTime() + 75 * 60_000),
      });
    }
  }

  // --- Assessments: two waves for Maya, Leo, Ava; skills resolved per Interfaces note ---
  const skillIds = await resolveDemoSkills(ctx, youth.sportId); // returns 4 skill ids (see note)
  const waves: Array<{ kid: string; early: number[]; recent: number[] }> = [
    { kid: "Maya", early: [2, 2, 3, 2], recent: [3, 3, 3, 3] },
    { kid: "Leo",  early: [3, 2, 2, 2], recent: [4, 3, 3, 3] },
    { kid: "Ava",  early: [2, 3, 2, 3], recent: [3, 3, 3, 4] },
  ];
  for (const w of waves) {
    const kid = people.rostersByKid[w.kid];
    for (let i = 0; i < skillIds.length; i++) {
      // select-then-heal, e2e idiom :622-652 — one row per (kid, skill, season, assessedAt-wave)
      for (const [level, prev, when] of [[w.early[i], null, daysAgo(30)], [w.recent[i], w.early[i], daysAgo(4)]] as const) {
        const [existing] = await db.select({ id: playerAssessments.id }).from(playerAssessments)
          .where(and(eq(playerAssessments.familyMemberId, kid.familyMemberId),
            eq(playerAssessments.skillId, skillIds[i]),
            eq(playerAssessments.assessedAt, when)))
          .orderBy(asc(playerAssessments.createdAt)).limit(1);
        if (!existing) {
          await db.insert(playerAssessments).values({
            familyMemberId: kid.familyMemberId, skillId: skillIds[i], coachUserId: demo.coach.id,
            seasonId: youth.ys.summer26, teamId, level, previousLevel: prev,
            observationContext: "practice", assessedAt: when,
          });
        }
      }
    }
    await recomputePlayerSnapshots(db, kid.familyMemberId, youth.ys.summer26);
  }

  // --- Parent-visible coach notes (glows & grows voice) ---
  const NOTES: Array<{ kid: string; category: "achievement" | "focus" | "encouragement";
    title: string; content: string; when: Date }> = [
    { kid: "Maya", category: "achievement", title: "First touch is really coming along",
      content: "Maya controlled high balls cleanly three times in the scrimmage — a big step from last month.", when: daysAgo(4) },
    { kid: "Maya", category: "focus", title: "Using the weaker foot",
      content: "Next few weeks we'll work on left-foot passing so Maya has options on both sides.", when: daysAgo(11) },
    { kid: "Maya", category: "encouragement", title: "Great teammate moment",
      content: "Maya cheered loudest when Ruby scored her first goal. Love the energy she brings.", when: daysAgo(18) },
    { kid: "Leo", category: "achievement", title: "Hat trick in small-sided play",
      content: "Leo finished three composed goals in the 3v3 games tonight.", when: daysAgo(4) },
    { kid: "Ava", category: "focus", title: "Looking up before passing",
      content: "Working with Ava on scanning the field before receiving — already improving.", when: daysAgo(11) },
  ];
  for (const n of NOTES) {
    const kid = people.rostersByKid[n.kid];
    const [existing] = await db.select({ id: coachNotes.id }).from(coachNotes)
      .where(and(eq(coachNotes.familyMemberId, kid.familyMemberId), eq(coachNotes.title, n.title)))
      .orderBy(asc(coachNotes.createdAt)).limit(1);
    if (!existing) {
      await db.insert(coachNotes).values({
        familyMemberId: kid.familyMemberId, teamId, coachUserId: demo.coach.id,
        title: n.title, content: n.content, category: n.category,
        visibleToParent: true, createdAt: n.when,
      });
    }
  }
  console.log("✓ coach history: sessions, attendance, time entries, assessments, notes");
}
```

`resolveDemoSkills(ctx, sportId)`: query `curriculumSkills` for the sport joined to distinct domains, `orderBy asc(createdAt)`; if ≥4 skills exist across ≥3 domains AND none of their slugs start with `e2e-`, return the first 4 skill ids. Otherwise create stage/domains/skills by copying `seed-e2e-tests.ts:511-620` verbatim with the four realistic slug/name pairs from the Interfaces note (the executor reads that block; the imports it needs — `developmentStages`, `curriculumSkills`, `STAGES`, `recomputePlayerSnapshots` — are visible at the top of the e2e seed and `seedCurriculumRadarFixture`).

In `main()`: `await seedCoachHistory(ctx, youth, people);`

- [ ] **Step 2: Run seed, verify coach + parent surfaces in browser**

Run: `./scripts/with-bws.sh npx tsx scripts/seed-demo-day.ts`
Browser (staging URL): sign in as `demo.coach` → `/coach` shows Thunder (roster 10, next game Sat); `/coach/practices` shows "Today's Sessions" with Game Prep (future-timed); `/coach/attendance/<teamId>` populated. Sign in as `demo.parent` → dashboard shows Maya's coach notes and the development radar.
If the "today" session has already passed by clock time, re-run the seed — it re-anchors to now+3h.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-demo-day.ts
git commit -m "feat(demo): coach sessions, attendance, assessments, parent-visible notes, payroll hours"
```

---

### Task 7: Feedback — NPS responses + referee ratings

**Files:**
- Modify: `scripts/seed-demo-day.ts`

**Interfaces:**
- Consumes: `Ctx`, `people.rostersByKid` (registration ids + parent user ids), `gameData.ratedGameOfficials` from Task 5.
- Produces: `async function seedFeedback(ctx, people, gameData): Promise<void>`. Uses `hashFeedbackToken` + `generateFeedbackToken` from `src/lib/feedback/tokens.ts` (add to imports).

- [ ] **Step 1: Add the section**

```ts
import { generateFeedbackToken, hashFeedbackToken } from "../src/lib/feedback/tokens"; // top of file

async function seedFeedback(ctx: Ctx,
  people: { rostersByKid: Record<string, { regId: string; parentUserId: string }> },
  gameData: { ratedGameOfficials: Array<{ gameId: string; gameOfficialId: string }> }) {
  const { db, org, demo } = ctx;

  // --- NPS (kind nps_season): dedupe unique (kind, targetId, recipientUserId) ---
  const npsScores: Array<[string, number, string | null]> = [
    ["Maya", 10, "Coach Marcus is phenomenal — Maya begs to go to practice."],
    ["Leo", 9, null], ["Ava", 10, "So organized. Sign-up took two minutes."],
    ["Noah", 8, null], ["Zoe", 9, null], ["Eli", 7, null],
    ["Ruby", 10, "Ruby scored her first goal and got a shout-out. Made her month."],
    ["Owen", 6, "Wish there were more field-side shade for parents."],
  ];
  for (let i = 0; i < npsScores.length; i++) {
    const [kidName, score, comment] = npsScores[i];
    const kid = people.rostersByKid[kidName];
    const respondedAt = daysAgo(3 + i * 5);
    await db.insert(feedbackRequests).values({
      organizationId: org.id, kind: "nps_season", targetId: kid.regId,
      recipientUserId: kid.parentUserId, tokenHash: hashFeedbackToken(generateFeedbackToken()),
      expiresAt: daysFromNow(14), status: "responded",
      sentAt: new Date(respondedAt.getTime() - 86400_000), respondedAt,
      metadata: { eventLabel: "Youth Soccer — Summer 2026" },
    }).onConflictDoNothing();
    const [req] = await db.select({ id: feedbackRequests.id }).from(feedbackRequests)
      .where(and(eq(feedbackRequests.kind, "nps_season"), eq(feedbackRequests.targetId, kid.regId),
        eq(feedbackRequests.recipientUserId, kid.parentUserId)))
      .orderBy(asc(feedbackRequests.createdAt)).limit(1);
    await db.insert(npsResponses).values({ requestId: req.id, score, comment })
      .onConflictDoNothing();
  }

  // --- Referee ratings on demo.ref's completed games (games recreated each run,
  //     so these are inserted fresh each run too — resetSeasonGames cleared the old ones).
  const raters = Object.values(people.rostersByKid).map((k) => k.parentUserId);
  const dims = (i: number) => 4 + ((i * 3) % 2); // 4s and 5s
  const comments = [null, "Fair and communicative all night.", null,
    "Kept the chippy game under control.", null, "Best ref in the league.", null, null];
  const toRate = gameData.ratedGameOfficials.slice(0, 12);
  for (let i = 0; i < toRate.length; i++) {
    const { gameId, gameOfficialId } = toRate[i];
    const respondedAt = daysAgo(2 + i * 9);
    const [req] = await db.insert(feedbackRequests).values({
      organizationId: org.id, kind: "referee_rating", targetId: gameId,
      gameOfficialId, recipientUserId: raters[i % raters.length],
      tokenHash: hashFeedbackToken(generateFeedbackToken()),
      expiresAt: daysFromNow(7), status: "responded",
      sentAt: new Date(respondedAt.getTime() - 86400_000), respondedAt,
      metadata: { eventLabel: "Flag Football — league night", gameType: "league", refereeName: "Jordan Avery" },
    }).returning();
    await db.insert(refereeRatings).values({
      requestId: req.id, gameId, refereeUserId: demo.ref.id,
      overall: dims(i), gameControl: dims(i + 1), communication: dims(i), fairness: 5,
      comment: comments[i % comments.length], createdAt: respondedAt,
    }).onConflictDoNothing();
  }
  console.log("✓ feedback: NPS + referee ratings");
}
```
In `main()`: `await seedFeedback(ctx, people, gameData);`

- [ ] **Step 2: Run seed, verify all five admin reports in browser**

Run: `./scripts/with-bws.sh npx tsx scripts/seed-demo-day.ts`
Browser as `demo.admin` on staging: `/admin/reports/registrations` (counts + trend), `/admin/reports/revenue` (succeeded payments + one refund), `/admin/reports/nps` (score ≈ mid-positive, comments feed), `/admin/reports/referee-ratings` (Jordan Avery, ~12 ratings, league split), `/admin/reports/payroll` → download `kind=referee` CSV for the current month (unpaid summer fees) and `kind=hours` CSV (coach hours from Task 6).

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-demo-day.ts
git commit -m "feat(demo): NPS responses + referee ratings feeding admin reports"
```

---

### Task 8: Demo runbook

**Files:**
- Create: `docs/demo/partner-demo-runbook.md`

- [ ] **Step 1: Write the runbook** (single page; fill the `<>` placeholders with real values from the seed output and Netlify):

```markdown
# Partner Demo Runbook — 2026-08-07

**Site:** https://aspire-sports-staging.netlify.app (Stripe TEST mode; no real email/SMS can send)

## Morning of (5 min)
1. `./scripts/with-bws.sh npx tsx scripts/seed-demo-day.ts` — re-anchors tonight's
   ref assignment and today's practice session to demo day.
2. Spot-check: /coach/practices shows a Today session; /referee (as demo.ref) shows an
   Upcoming assignment tonight.

## Freeze rules (until demo is over)
- Do NOT run `npm run db:seed:e2e` against staging.
- Do NOT merge anything to `main` (staging auto-deploys it).
- No other Claude/dev sessions mutating the staging DB.

## Accounts — password for all: `AspireDemo2026!`
| Who | Email | Opens on |
|---|---|---|
| Admin | demo.admin@aspiresportsohio.com | /admin |
| Coach (phone) | demo.coach@aspiresportsohio.com | /coach |
| Parent | demo.parent@aspiresportsohio.com | /dashboard |
| Referee (phone) | demo.ref@aspiresportsohio.com | /referee |

## Demo arc (tab order)
1. **Public** — home → /programs (Fall 2026 open) → /adult/leagues/flag-football
   → current term → live standings (derived from real game scores) → past term archive.
2. **Parent** (laptop) — Maya's dashboard: coach notes, development radar, upcoming
   Fall 2026, payment history.
3. **Coach** (phone) — /coach: Thunder roster (10 kids), today's practice ready to run,
   attendance history, assessments showing level progression.
4. **Referee** (phone) — /referee: tonight's assignment, 25+ game history with scores,
   /referee/pay fee ledger.
5. **Admin** (laptop) — registrations, revenue (with refund), NPS, referee ratings,
   payroll export. Optional: live registration on Fall 2026 with test card
   4242 4242 4242 4242 (any future expiry, any CVC).
6. **Scale story** — open https://gosoccerone.com (prod) in a tab: same platform,
   second brand, own domain.

## If something looks wrong
Re-run the seed (idempotent). If a surface is broken, drop it from the arc — do not
debug live.
```

- [ ] **Step 2: Commit**

```bash
git add docs/demo/partner-demo-runbook.md
git commit -m "docs(demo): partner demo runbook"
```

---

### Task 9: Full verification walkthrough (browser, laptop + phone-viewport)

**Files:** none (verification only; fixes loop back into `scripts/seed-demo-day.ts`).

- [ ] **Step 1: Walk every surface in a real browser against `https://aspire-sports-staging.netlify.app`**, in runbook order. Checklist — each item must show believable, consistent data with zero `e2e`/`test` strings visible:
  - Public: home, /programs (Fall 2026 only demo seasons, no junk), flag landing (3 terms), current-term standings table populated, past-term archive with final standings, season detail pages.
  - demo.parent: family dashboard (Maya, upcoming events, coach notes, radar), payment history if surfaced.
  - demo.coach: /coach overview stats, teams (2 seasons of Thunder), roster (10 kids, no blanks), schedule (games + practices merged), today's session, attendance, assessments overview.
  - demo.ref: index buckets (Upcoming = tonight; Completed = history with score badges), match detail page for one completed game, /referee/pay totals.
  - demo.admin: dashboard, registrations list, all five reports, both payroll CSVs download non-empty.
- [ ] **Step 2: Repeat coach + referee surfaces at phone viewport** (or on an actual phone — the site is public). Fix anything broken by adjusting the seed and re-running; re-verify.
- [ ] **Step 3: Report results** — list of surfaces checked, screenshots of the money shots (standings, coach today, ref history, reports), and any surfaces dropped from the demo arc with reasons.

---

## Self-review notes (done at plan time)

- Spec coverage: past+upcoming seasons (T2/T3), scores→standings auto-derived (T5), ref history (T5/T7), coach history (T6), parent story (T4/T6), all five admin reports (T4 registrations/revenue, T6 payroll hours, T5 payroll referee fees, T7 NPS + referee ratings), junk tidy (T2), accounts (T1), runbook (T8), browser verification (T9). Payroll "renders non-empty" satisfied by T5 feeCents + T6 timeEntries.
- Known simplifications (deliberate): flag teams have no rosters (standings/games need none); youth standings only surface via team-hub/coach views; `standings` cache table intentionally not written (only reader is /dashboard/play which the demo skips).
- Type consistency: `Ctx`, `people.rostersByKid`, `gameData.ratedGameOfficials`, season-id records are defined in Interfaces blocks and used with the same names in every task.
