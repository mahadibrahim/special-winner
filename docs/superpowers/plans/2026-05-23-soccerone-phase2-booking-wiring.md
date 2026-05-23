# Phase 2 — Wire SoccerOne Marketing CTAs Into Live Booking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded mock data on the three SoccerOne marketing pages (`leagues`, `rent`, `pickup`) with live data from the existing tenant-scoped booking endpoints, and point every CTA at the real registration / rental / drop-in flows.

**Architecture:** All three pages live under `src/pages/soccerone/*` (plus their React components under `src/components/soccerone/*`). They render with the SoccerOne dark theme and `SoccerOneHeader` / `SoccerOneFooter`, bypassing Aspire's `Navigation`. The booking endpoints (`/api/public/seasons`, `/api/rentals/availability`, `/api/dropin/sessions`, plus the POST endpoints for bookings) are already tenant-scoped from Phase 0 and routed by Phase 1. Phase 2 is purely the wiring: remove mock constants, fetch the real data with the right query parameters, and update CTA hrefs to deep-link into the shared booking flows. **Zero edits to Aspire-shared code** — the spec's strongest safety promise for this phase.

**Tech Stack:** Astro 5 SSR pages (`leagues.astro` server-side `fetch` to `/api/public/seasons`), React 19 client components (`FieldCalendar.tsx` and `PickupGames.tsx` with `useEffect`-based fetch + `LoadingSkeleton` / `ErrorBanner` / `EmptyState` primitives), the existing booking flow at `/register/[seasonId]`, `/rentals/`, and `/dropin/[id]`.

**Spec:** [`docs/superpowers/specs/2026-05-22-soccerone-gosoccerone-domain-design.md`](../specs/2026-05-22-soccerone-gosoccerone-domain-design.md), §7 (Phase 2).

---

## Why this is safe to ship

The spec's §7 explicitly states: *"Phase 2 edits only `soccerone/*` files and calls existing endpoints — it touches no Aspire-shared code."* This is the strongest safety promise of any phase. Risk surface:

- Bugs in `soccerone/*` only affect the SoccerOne marketing site.
- Even before `gosoccerone.com` is live, the only consumers of `soccerone/*` URLs are: (a) the Aspire-host `/soccerone/*` reverse-301 from Phase 1 (which 301s to canonical, no rendering), and (b) the eventual SoccerOne-host rewrite (also from Phase 1, not yet active because `domain_mappings.status` is still `pending`).
- The booking endpoints we call (`/api/public/seasons`, `/api/rentals/*`, `/api/dropin/*`) are unchanged — Phase 2 is a pure consumer of them.

This phase can land before the founder runs the launch checklist's Stage 7 (`domain_mappings → ssl_active`). It's preparatory work.

## Data preconditions (ops, not code)

Per spec §10, before SoccerOne actually serves real bookings:

1. SoccerOne **programs** + **seasons** (status `open`/`active`, `isTest=false`) for the leagues page.
2. SoccerOne **venues** with `rentalEnabled=true`, `rentalHourlyRateCents`, `rentalOpenMinute`/`rentalCloseMinute`, `fieldCount` set — plus the matching **`field_rental_rate_card`** rows.
3. SoccerOne **drop-in sessions** with their **`drop_in_rate_card`** rows.
4. The facility's **Stripe Connect account** onboarded and `partnerStripeAccountId` set on the SoccerOne venues.

These are NOT Phase 2 implementation tasks — they're ops work done via the admin UI when the founder is ready. **Phase 2's job is to make the code consume that data correctly once it exists.** For local development, Task 2 below adds a small set of staging fixtures so the implementer can verify the wiring without doing the full ops dance.

The launch checklist will be updated (Task 6) with the prod-side data-creation steps so the founder has a clear runbook for the final "go live" moment.

---

## File Structure

**Modify** (existing files):

| Path | Change |
|---|---|
| `src/pages/soccerone/leagues.astro` | Frontmatter fetches SoccerOne seasons from `/api/public/seasons` (scoped via the resolver — the page already runs in SoccerOne org context). Replace hardcoded league cards in the template with a loop over the fetched seasons. CTAs → `/register/[seasonId]`. |
| `src/components/soccerone/FieldCalendar.tsx` | Remove `MOCK_SCHEDULE`. Add `venueId` prop (string, optional). Add `useEffect` that fetches `/api/rentals/availability?venueId=...&date=...` on mount + when date or venueId changes. Use `LoadingSkeleton` / `ErrorBanner` / `EmptyState` primitives. "Book" button hrefs become `/rentals/?venueId=...&date=...&field=...&time=...`. |
| `src/pages/soccerone/rent.astro` | Frontmatter queries SoccerOne venues (using a shared helper — see Task 4); passes `venueId` to the `FieldCalendar` component for the user-selected facility. The current downtown/worthington selector becomes the venue-id selector. |
| `src/components/soccerone/PickupGames.tsx` | Remove `TODAY_GAMES` / `WEEK_GAMES`. Fetch `/api/dropin/sessions` filtered to upcoming SoccerOne sessions. Use the UI primitives. CTAs become `/dropin/[id]`. |
| `src/pages/soccerone/pickup.astro` | Minor: any hardcoded data passed to `PickupGames` becomes empty / removed; the React component owns the fetch. |
| `src/lib/db/seeds/seed-e2e-tests.ts` | **Append-only** — add a "Stage 12: SoccerOne booking fixtures" block that idempotently creates: one program + open season for SoccerOne, one rental-enabled venue + rate card for SoccerOne Downtown, and one drop-in session + rate card for SoccerOne. (Mirroring the existing `orgb` pattern.) |
| `docs/ops/soccerone-launch-checklist.md` | Add a new Stage 6.5 — "Seed SoccerOne booking data in prod" — between the existing Stage 6 (provisioning script) and Stage 7 (flip domain_mappings to `ssl_active`). Documents the admin-UI steps for creating SoccerOne programs/venues/rate cards/drop-in sessions in prod. |

**Create** (new files):

| Path | Purpose |
|---|---|
| `src/lib/soccerone/venues.ts` | Tiny helper: `getSoccerOneVenuesByLocation(orgSlug, locationSlug)` — returns venue rows the rent page needs. Pure DB query. Allows `rent.astro` to query venues without hand-rolling SQL in the frontmatter. |
| `tests/unit/soccerone/venues.test.ts` | Unit tests for the helper — given two test orgs each with venues, asserts only the requested org's venues are returned, etc. |

---

## Pre-flight (Task 1 handles this)

The existing worktree at `/Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone` is currently on the merged Phase 1 branch. Task 1 fetches latest main and creates a new branch.

---

## Task 1: Worktree + branch off latest main

**Files:** none modified.

- [ ] **Step 1: Confirm starting state.**

  ```bash
  WT=/Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone
  git -C "$WT" branch --show-current
  git -C "$WT" status --short
  ```
  Expected: branch is `feat/soccerone-phase1-domain-plumbing` (now merged into main); working tree clean.

- [ ] **Step 2: Fetch latest main.**

  ```bash
  git -C "$WT" fetch origin main
  git -C "$WT" log --oneline origin/main -3
  ```
  Expected: top commit is the Phase 1 merge.

- [ ] **Step 3: Create the Phase 2 branch off origin/main.**

  ```bash
  git -C "$WT" checkout -b feat/soccerone-phase2-booking-wiring origin/main
  git -C "$WT" branch --show-current
  git -C "$WT" log --oneline -3
  ```
  Expected: branch is `feat/soccerone-phase2-booking-wiring`; tip is the Phase 1 merge.

- [ ] **Step 4: Refresh test DB to current main.**

  ```bash
  cd "$WT"
  export $(grep -E "^DATABASE_URL=" .env | xargs)
  npm run db:migrate 2>&1 | tail -5
  npm run db:seed:e2e 2>&1 | tail -10
  ```
  Expected: migrations clean; seed completes idempotently.

- [ ] **Step 5: Confirm dev server can come up.** Run in a separate shell (or `run_in_background: true`):

  ```bash
  cd "$WT"
  R2_MOCK=1 CRON_SECRET=test DISABLE_RATE_LIMIT=1 npm run dev
  ```
  Wait until `Local: http://localhost:4321/`. Verify: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4321/api/test/org-fixtures?slug=orgb"` returns 200.

- [ ] **Step 6: Move the plan into the worktree (if not already).**

  ```bash
  ls "$WT/docs/superpowers/plans/2026-05-23-soccerone-phase2-booking-wiring.md"
  ```
  If missing, copy from wherever it was authored.

- [ ] **Step 7: Commit the plan.**

  ```bash
  git -C "$WT" add docs/superpowers/plans/2026-05-23-soccerone-phase2-booking-wiring.md
  git -C "$WT" commit -m "$(cat <<'EOF'
  docs(plan): Phase 2 — wire SoccerOne CTAs into live booking

  Implementation plan for spec §7: replace mock data on the three
  SoccerOne marketing pages with live tenant-scoped data, and point
  CTAs at the real registration / rental / drop-in flows. Zero edits
  to Aspire-shared code.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2: SoccerOne booking fixtures in the e2e seed

**Files:**
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts`

Add idempotent seed steps for the SoccerOne booking data so the implementer can verify the wiring locally without running the full ops sequence. **All steps look up by slug / unique key first, insert only if missing** — mirrors the existing `orgb` pattern in the same file.

- [ ] **Step 1: Read the relevant existing patterns in the seed file.**

  ```bash
  grep -n "Org B" /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone/src/lib/db/seeds/seed-e2e-tests.ts | head
  grep -n "rentalEnabled\|fieldRentalRateCard\|dropInSession" /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone/src/lib/db/seeds/seed-e2e-tests.ts | head
  ```
  Look at the `orgb` insert block (the structure: org → location → sport → program → season) and the existing rental/dropin fixtures for the main Aspire org. Mirror the property names exactly when creating the SoccerOne equivalents.

- [ ] **Step 2: Identify the SoccerOne org + locations** (already provisioned by Phase 1's `scripts/seed-soccerone-org.ts`):

  ```typescript
  // Lookup, do not create — Phase 1's provisioning script owns the org/location rows.
  const [soccerOneOrg] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "soccerone"))
    .limit(1);

  if (!soccerOneOrg) {
    console.log("   ⚠️  Skipping SoccerOne booking fixtures — SoccerOne org not provisioned yet.");
    console.log("   Run: npx tsx scripts/seed-soccerone-org.ts");
  } else {
    // ...continue with booking fixtures below
  }
  ```

  If `soccerOneOrg` is missing, the seed prints a friendly message and skips Stage 12. This makes the seed safe to run against any DB regardless of whether SoccerOne has been provisioned yet.

- [ ] **Step 3: Append the new seed block** at the end of `seedE2ETests()`, after the existing org-A / orgb / dual-persona blocks but before the final "✅ E2E test data seeded successfully!" log line. The seed block (verbatim — adapt only the import additions if they aren't already at the top of the file):

  ```typescript
  // -------------------------------------------------------------------------
  // Stage 12 — SoccerOne booking fixtures (Phase 2).
  // Idempotent. Skipped if SoccerOne org isn't provisioned yet (run
  // scripts/seed-soccerone-org.ts first).
  // -------------------------------------------------------------------------
  console.log("\n12. Setting up SoccerOne booking fixtures...");

  const [soccerOneOrg] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "soccerone"))
    .limit(1);

  if (!soccerOneOrg) {
    console.log("   ⚠️  Skipping — SoccerOne org not provisioned. Run scripts/seed-soccerone-org.ts first.");
  } else {
    // 12a. SoccerOne Downtown location (provisioned by Phase 1).
    const [soccerOneDowntown] = await db
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.organizationId, soccerOneOrg.id),
          eq(locations.slug, "soccerone-downtown"),
        ),
      )
      .limit(1);

    if (!soccerOneDowntown) {
      throw new Error("SoccerOne Downtown location missing — re-run scripts/seed-soccerone-org.ts");
    }

    // 12b. SoccerOne sport (Soccer — separate row per org because sports are org-scoped).
    let [soccerOneSport] = await db
      .select()
      .from(sports)
      .where(
        and(
          eq(sports.organizationId, soccerOneOrg.id),
          eq(sports.slug, "soccer"),
        ),
      )
      .limit(1);

    if (!soccerOneSport) {
      [soccerOneSport] = await db
        .insert(sports)
        .values({
          organizationId: soccerOneOrg.id,
          name: "Soccer",
          slug: "soccer",
          icon: "⚽",
          color: "#22c55e",
        })
        .returning();
    }
    console.log(`   ✓ SoccerOne Sport: ${soccerOneSport.name}`);

    // 12c. SoccerOne league program + open season.
    let [soccerOneProgram] = await db
      .select()
      .from(programs)
      .where(eq(programs.slug, "soccerone-adult-coed-league"))
      .limit(1);

    if (!soccerOneProgram) {
      [soccerOneProgram] = await db
        .insert(programs)
        .values({
          sportId: soccerOneSport.id,
          locationId: soccerOneDowntown.id,
          name: "Adult Coed League",
          slug: "soccerone-adult-coed-league",
          programType: "league",
          audienceType: "adult",
          active: true,
          isTest: false,
        })
        .returning();
    }
    console.log(`   ✓ SoccerOne Program: ${soccerOneProgram.name}`);

    let [soccerOneSeason] = await db
      .select()
      .from(seasons)
      .where(eq(seasons.slug, "soccerone-adult-coed-spring-2026"))
      .limit(1);

    const sixWeeksOut = new Date(Date.now() + 6 * 7 * 24 * 60 * 60 * 1000);
    const tenWeeksOut = new Date(Date.now() + 10 * 7 * 24 * 60 * 60 * 1000);

    if (!soccerOneSeason) {
      [soccerOneSeason] = await db
        .insert(seasons)
        .values({
          programId: soccerOneProgram.id,
          name: "Adult Coed — Spring 2026",
          slug: "soccerone-adult-coed-spring-2026",
          status: "open",
          isTest: false,
          startDate: sixWeeksOut.toISOString().slice(0, 10),
          endDate: tenWeeksOut.toISOString().slice(0, 10),
          priceCents: 18000,
          maxParticipants: 80,
        })
        .returning();
    }
    console.log(`   ✓ SoccerOne Season: ${soccerOneSeason.name} (status=${soccerOneSeason.status})`);

    // 12d. SoccerOne rental-enabled venue + rate card.
    let [soccerOneVenue] = await db
      .select()
      .from(venues)
      .where(eq(venues.slug, "soccerone-downtown-field-1"))
      .limit(1);

    if (!soccerOneVenue) {
      [soccerOneVenue] = await db
        .insert(venues)
        .values({
          locationId: soccerOneDowntown.id,
          name: "Downtown — Field 1",
          slug: "soccerone-downtown-field-1",
          rentalEnabled: true,
          rentalHourlyRateCents: 9000,
          rentalOpenMinute: 7 * 60,    // 7am
          rentalCloseMinute: 23 * 60,  // 11pm
          fieldCount: 1,
        })
        .returning();
    }
    console.log(`   ✓ SoccerOne Venue: ${soccerOneVenue.name} (rentalEnabled=${soccerOneVenue.rentalEnabled})`);

    // 12e. Drop-in session for SoccerOne — one upcoming "Evening Coed Pickup."
    // Imports needed: { dropInSessions } from "@/lib/db/schema/drop-in"
    const tomorrow6pm = new Date();
    tomorrow6pm.setDate(tomorrow6pm.getDate() + 1);
    tomorrow6pm.setHours(18, 0, 0, 0);

    let [soccerOneDropIn] = await db
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.slug, "soccerone-evening-coed-pickup"))
      .limit(1);

    if (!soccerOneDropIn) {
      [soccerOneDropIn] = await db
        .insert(dropInSessions)
        .values({
          organizationId: soccerOneOrg.id,
          locationId: soccerOneDowntown.id,
          venueId: soccerOneVenue.id,
          name: "Evening Coed Pickup",
          slug: "soccerone-evening-coed-pickup",
          skillLevel: "intermediate",
          startsAt: tomorrow6pm,
          durationMinutes: 90,
          totalSpots: 12,
          priceCents: 1200,
          active: true,
        })
        .returning();
    } else {
      // Refresh startsAt so it stays in the future on repeated seed runs
      [soccerOneDropIn] = await db
        .update(dropInSessions)
        .set({ active: true, startsAt: tomorrow6pm })
        .where(eq(dropInSessions.id, soccerOneDropIn.id))
        .returning();
    }
    console.log(`   ✓ SoccerOne Drop-In: ${soccerOneDropIn.name}`);
  }
  ```

  **Important:** if any of the schema column names above don't match the real schema (`fieldRentalRateCard` row shape, `dropInSessions` columns, etc.), adapt the values to match. The actual columns are in `src/lib/db/schema/field-rentals.ts` and `src/lib/db/schema/drop-in.ts`. Read those files first if anything looks ambiguous.

- [ ] **Step 4: Update the imports** at the top of `seed-e2e-tests.ts`. Add `dropInSessions` (or whichever drop-in tables you reference) if not already imported. Pattern: read the file's existing `import { ... } from "../schema/..."` blocks and add only what's needed.

- [ ] **Step 5: Run the seed.**

  ```bash
  cd /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone
  export $(grep -E "^DATABASE_URL=" .env | xargs)
  npm run db:seed:e2e 2>&1 | tail -25
  ```
  Expected: Stage 12 logs four ✓ lines (sport, program, season, venue, drop-in). Run a second time → all "already exists" — idempotent.

- [ ] **Step 6: Quick sanity query.**

  ```bash
  npx tsx -e "
  import postgres from 'postgres';
  (async () => {
    const sql = postgres(process.env.DATABASE_URL);
    const seasons = await sql\`
      SELECT s.name, s.status, p.name as program, o.slug as org
      FROM seasons s
      JOIN programs p ON p.id = s.program_id
      JOIN sports sp ON sp.id = p.sport_id
      JOIN organizations o ON o.id = sp.organization_id
      WHERE o.slug = 'soccerone' AND s.status IN ('open','active');
    \`;
    console.log('SoccerOne open seasons:', seasons);
    await sql.end();
  })();
  "
  ```
  Expected: at least one row — "Adult Coed — Spring 2026" with status `open`.

- [ ] **Step 7: Commit.**

  ```bash
  git -C /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone \
    add src/lib/db/seeds/seed-e2e-tests.ts
  git -C /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone \
    commit -m "$(cat <<'EOF'
  feat(seed): SoccerOne booking fixtures for local + staging

  Adds an idempotent "Stage 12" block to the e2e seed: one league
  program + open season, one rental-enabled venue + rate card, one
  upcoming drop-in session for the SoccerOne tenant. Skipped if the
  SoccerOne org row isn't present yet (run scripts/seed-soccerone-org.ts
  first).

  These are local/staging fixtures — prod gets its real SoccerOne data
  via the admin UI per the launch checklist's new Stage 6.5.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: Wire `leagues.astro` to live SoccerOne seasons

**Files:**
- Modify: `src/pages/soccerone/leagues.astro`

The page is SSR (`prerender = false`) and already runs in SoccerOne org context (the middleware rewrite from Phase 1 means `Astro.locals.organization` is SoccerOne when the page is reached via `gosoccerone.com/leagues`). Fetch in the frontmatter, render in the template.

- [ ] **Step 1: Read the existing template.** Identify:
  1. The frontmatter section (lines 1–10).
  2. The section that currently renders hardcoded league cards (probably under the page header — search for terms like `Adult Coed`, `Premier`, or any literal league name).
  3. The "filter by facility" interaction (`facility` query param → `facilityLabel`).

- [ ] **Step 2: Add the fetch to the frontmatter.**

  Replace the existing frontmatter with (preserving the existing imports + the facility query handling):

  ```astro
  ---
  export const prerender = false;
  import BaseLayout from '@/layouts/BaseLayout.astro';
  import SoccerOneHeader from '@/components/soccerone/SoccerOneHeader.astro';
  import SoccerOneFooter from '@/components/soccerone/SoccerOneFooter.astro';
  import { Toaster } from 'sonner';

  const facility = Astro.url.searchParams.get('facility') || 'all';
  const facilityLabel = facility === 'worthington' ? 'Worthington' : facility === 'downtown' ? 'Downtown' : 'All Locations';

  // Phase 2 — fetch live SoccerOne seasons via the tenant-scoped public API.
  // The endpoint is org-scoped from Phase 0 (reads Astro.locals.organization),
  // so this page sees only SoccerOne seasons when rendered in SoccerOne context.
  // Optional ?facility=downtown|worthington filters by location slug — matches
  // the existing UI affordance.
  const locationSlug = facility === 'downtown'
    ? 'soccerone-downtown'
    : facility === 'worthington'
      ? 'soccerone-worthington'
      : null;

  let seasons: any[] = [];
  try {
    const url = new URL('/api/public/seasons', Astro.url);
    url.searchParams.set('audience', 'adult');
    if (locationSlug) url.searchParams.set('location', locationSlug);
    const res = await fetch(url, {
      headers: { Host: Astro.request.headers.get('host') ?? '' },
    });
    if (res.ok) {
      const body = await res.json();
      seasons = body.seasons ?? [];
    }
  } catch (err) {
    console.error('[soccerone/leagues] failed to load seasons', err);
  }
  ---
  ```

  **Note on `Host: ...` forwarding:** the public API route reads `locals.organization` which is set by middleware based on the request's `host` header. When you do a server-to-server `fetch` from inside Astro, the new request's host defaults to whatever the URL points at — but you want it scoped to the SAME tenant as the outer request, so explicitly forward the incoming `host` header.

- [ ] **Step 3: Replace the hardcoded league cards in the template** with a loop over `seasons`. Find the section that today has hardcoded blocks like `<div class="league-card">...Adult Coed...</div>`. Replace it with:

  ```astro
  {seasons.length === 0 ? (
    <div class="empty-state">
      <p class="empty-title">No open leagues right now</p>
      <p class="empty-body">Check back soon — new seasons open before each cycle.</p>
    </div>
  ) : (
    <div class="league-grid">
      {seasons.map((season) => (
        <article class="league-card">
          <header class="lc-header">
            <h3 class="lc-title">{season.name}</h3>
            <span class={`lc-status lc-status-${season.status}`}>{season.status}</span>
          </header>

          <dl class="lc-meta">
            <div class="lc-meta-row">
              <dt>Program</dt>
              <dd>{season.program.name}</dd>
            </div>
            <div class="lc-meta-row">
              <dt>Location</dt>
              <dd>{season.location.name}</dd>
            </div>
            {season.startDate && (
              <div class="lc-meta-row">
                <dt>Starts</dt>
                <dd>{new Date(season.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</dd>
              </div>
            )}
            <div class="lc-meta-row">
              <dt>Spots</dt>
              <dd>
                {season.spotsLeft != null
                  ? `${season.spotsLeft} left of ${season.maxParticipants}`
                  : 'Open'}
              </dd>
            </div>
            <div class="lc-meta-row">
              <dt>Price</dt>
              <dd>${season.price}</dd>
            </div>
          </dl>

          <a href={`/register/${season.id}`} class="lc-cta">Register</a>
        </article>
      ))}
    </div>
  )}
  ```

  Preserve the surrounding section structure (the section's enclosing `<section>` tag, its heading, etc.) — only the cards themselves change from hardcoded to data-driven.

  If the existing CSS class names (`league-card`, `lc-header`, etc.) don't exist in the page's `<style>` block, choose the closest existing class names from the current hardcoded markup. The goal is to keep the visual design unchanged. Read the existing `<style is:global>` or `<style>` block in `leagues.astro` to find the actual class names in use.

- [ ] **Step 4: Type check + build.**

  ```bash
  cd /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone
  npx tsc --noEmit 2>&1 | grep -vE "(progress\.tsx|separator\.tsx|r2\.ts)" | tail -10
  ```
  Expected: zero errors.

  ```bash
  npm run build 2>&1 | tail -25
  ```
  Expected: build succeeds; no errors mentioning `leagues.astro`.

- [ ] **Step 5: Manual smoke** (dev server must be up). Use a browser at `http://soccerone.localhost:4321/leagues` — browsers send `Host` correctly, so the resolver matches the SoccerOne org via subdomain pattern. (The dev server uses `127.0.0.1` resolution; macOS resolves `*.localhost` to `127.0.0.1` natively; if your environment doesn't, add `127.0.0.1 soccerone.localhost` to `/etc/hosts`.)

  Expected: page renders with the seeded "Adult Coed — Spring 2026" season visible. CTA link target inspectable as `/register/<season-uuid>`.

  If the dev server isn't reachable, note it and proceed — Task 7's regression sweep catches it.

- [ ] **Step 6: Commit.**

  ```bash
  git -C /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone \
    add src/pages/soccerone/leagues.astro
  git -C /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone \
    commit -m "$(cat <<'EOF'
  feat(soccerone): wire leagues.astro to live tenant-scoped seasons

  Replaces hardcoded league cards with a server-side fetch to
  /api/public/seasons (tenant-scoped via Phase 0). Optional ?facility=
  query param filters by location slug. CTAs deep-link to
  /register/[seasonId]. Empty state when no open seasons.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 4: Wire `FieldCalendar.tsx` + `rent.astro` to live rental availability

**Files:**
- Create: `src/lib/soccerone/venues.ts` — helper that returns SoccerOne venues for a given location slug.
- Create: `tests/unit/soccerone/venues.test.ts` — unit tests for the helper.
- Modify: `src/components/soccerone/FieldCalendar.tsx` — fetch availability instead of using `MOCK_SCHEDULE`.
- Modify: `src/pages/soccerone/rent.astro` — query SoccerOne venues in the frontmatter, pass `venueId` to `FieldCalendar`.

This is the largest task in Phase 2 — FieldCalendar is 784 lines. The visual structure stays; only the data source changes.

### 4a. Helper module

- [ ] **Step 1: Write the failing test.**

  ```typescript
  // tests/unit/soccerone/venues.test.ts
  import { describe, it, expect, beforeAll } from "vitest";
  import { getDb } from "@/lib/db";
  import { organizations, locations, venues } from "@/lib/db/schema";
  import { eq } from "drizzle-orm";
  import { getSoccerOneVenuesByLocation } from "@/lib/soccerone/venues";

  describe("getSoccerOneVenuesByLocation()", () => {
    let soccerOneOrgId: string;

    beforeAll(async () => {
      const [org] = await getDb()
        .select()
        .from(organizations)
        .where(eq(organizations.slug, "soccerone"))
        .limit(1);
      if (!org) {
        throw new Error("SoccerOne org missing — run scripts/seed-soccerone-org.ts + npm run db:seed:e2e");
      }
      soccerOneOrgId = org.id;
    });

    it("returns only SoccerOne Downtown's rental-enabled venues when called with 'soccerone-downtown'", async () => {
      const result = await getSoccerOneVenuesByLocation("soccerone-downtown");
      expect(result.length).toBeGreaterThan(0);
      for (const v of result) {
        expect(v.rentalEnabled).toBe(true);
      }
    });

    it("returns an empty array for a non-existent location slug", async () => {
      const result = await getSoccerOneVenuesByLocation("never-existed");
      expect(result).toEqual([]);
    });

    it("does not return non-SoccerOne venues even if the location slug exists for another org", async () => {
      // Aspire's existing "powell" location is a non-SoccerOne location.
      const result = await getSoccerOneVenuesByLocation("powell");
      expect(result).toEqual([]);
    });
  });
  ```

- [ ] **Step 2: Run; verify failure.**

  ```bash
  cd /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone
  npx vitest run tests/unit/soccerone/venues.test.ts
  ```
  Expected: module not found.

- [ ] **Step 3: Implement the helper.**

  ```typescript
  // src/lib/soccerone/venues.ts
  /**
   * Helper queries scoped to the SoccerOne org by slug. Used by the
   * soccerone/* marketing pages where Astro frontmatter needs a small
   * server-side query and we don't want to hand-roll SQL inline.
   *
   * Phase 2 of the SoccerOne / gosoccerone.com project.
   */
  import { getDb } from "@/lib/db";
  import { organizations, locations, venues, type Venue } from "@/lib/db/schema";
  import { and, eq } from "drizzle-orm";
  import { SOCCERONE_ORG_SLUG } from "@/lib/organization/soccerone-routing";

  /**
   * Returns rental-enabled venues at the given SoccerOne location slug.
   * Returns an empty array if the location doesn't exist or belongs to a
   * different org (defense-in-depth — the slug check is org-scoped via the
   * inner join on `organizations.slug = SOCCERONE_ORG_SLUG`).
   */
  export async function getSoccerOneVenuesByLocation(
    locationSlug: string,
  ): Promise<Venue[]> {
    const db = getDb();
    if (!db) return [];

    const rows = await db
      .select({ venue: venues })
      .from(venues)
      .innerJoin(locations, eq(locations.id, venues.locationId))
      .innerJoin(organizations, eq(organizations.id, locations.organizationId))
      .where(
        and(
          eq(organizations.slug, SOCCERONE_ORG_SLUG),
          eq(locations.slug, locationSlug),
          eq(venues.rentalEnabled, true),
        ),
      );

    return rows.map((r) => r.venue);
  }
  ```

- [ ] **Step 4: Run; verify pass.**

  ```bash
  npx vitest run tests/unit/soccerone/venues.test.ts
  ```
  Expected: 3/3 pass.

### 4b. FieldCalendar component

- [ ] **Step 5: Read the existing `FieldCalendar.tsx`** to identify:
  1. The props interface (currently no `venueId`).
  2. The `MOCK_SCHEDULE` constant (line 22).
  3. Where the schedule is rendered (search for `MOCK_SCHEDULE[`).
  4. The "Book" button / CTA handler.
  5. The selected-field / selected-date state.

- [ ] **Step 6: Modify `FieldCalendar.tsx`** as follows. Read the existing file structure first; only the data-source + UI primitives change, the rendering layout stays:

  **Add the new types + remove `MOCK_SCHEDULE`:**

  ```typescript
  // Replace the existing FieldSchedule + MOCK_SCHEDULE with:

  /** A free time block returned by /api/rentals/availability. */
  interface FreeBlock {
    startsAt: string; // ISO
    endsAt: string;   // ISO
  }

  interface FieldAvailability {
    fieldNumber: number;
    free: FreeBlock[];
  }

  interface AvailabilityResponse {
    venueName: string;
    date: string;
    fields: FieldAvailability[];
  }
  ```

  **Add a `venueId` prop:**

  ```typescript
  interface FieldCalendarProps {
    /** UUID of the SoccerOne venue whose availability to show. When null/undefined the component shows an empty state. */
    venueId: string | null;
    /** Initial date (YYYY-MM-DD). Defaults to today. */
    initialDate?: string;
  }

  export function FieldCalendar({ venueId, initialDate }: FieldCalendarProps) {
    // ...
  }
  ```

  If the component is currently a default export with no props, convert it to a named export with `FieldCalendarProps` AND keep a default export (`export default FieldCalendar`) so existing imports don't break.

  **Add the fetch:**

  ```typescript
  const [date, setDate] = useState(initialDate ?? new Date().toISOString().slice(0, 10));
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!venueId) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/rentals/availability?venueId=${encodeURIComponent(venueId)}&date=${encodeURIComponent(date)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as AvailabilityResponse;
        if (!cancelled) setAvailability(body);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load availability");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [venueId, date]);
  ```

  **Replace the schedule render.** Where the component currently does `const schedule = MOCK_SCHEDULE[selectedField] ?? [];` and renders schedule rows, derive the rendered schedule from `availability` instead. The general translation:
  - For each hour in the 7am–11pm range, look at each field's `free` blocks and determine whether the hour is bookable (the hour falls inside a `free` block) or booked (it doesn't).
  - Mark non-bookable as "Booked" without specifying the type (we don't have that info from the public endpoint — and we don't need it for the booking grid).

  Sketch:

  ```typescript
  /** True if the integer hour `h` (e.g. 19 = 7pm) is inside any free block for the given field on the selected date. */
  function isHourBookable(field: FieldAvailability | undefined, dateStr: string, h: number): boolean {
    if (!field) return false;
    const hourStart = new Date(`${dateStr}T${String(h).padStart(2, "0")}:00:00.000Z`).getTime();
    const hourEnd = hourStart + 60 * 60 * 1000;
    return field.free.some((b) => {
      const blockStart = new Date(b.startsAt).getTime();
      const blockEnd = new Date(b.endsAt).getTime();
      return blockStart <= hourStart && blockEnd >= hourEnd;
    });
  }
  ```

  Then in the render, the current rendering of `schedule.map(...)` (which assumed mock-data rows with `label`/`type`) becomes a loop over `HOURS` for each visible field, calling `isHourBookable()` and rendering a "Book this hour" CTA or a greyed "Booked" cell.

  **Loading / error / empty UI:** wrap the schedule grid:

  ```tsx
  {loading && <LoadingSkeleton />}
  {!loading && error && <ErrorBanner message={`Couldn't load availability: ${error}`} />}
  {!loading && !error && !venueId && (
    <EmptyState
      title="Pick a facility"
      description="Choose Downtown or Worthington above to see field availability."
    />
  )}
  {!loading && !error && availability && availability.fields.length === 0 && (
    <EmptyState
      title="No rentable fields right now"
      description="Try a different date."
    />
  )}
  {!loading && !error && availability && availability.fields.length > 0 && (
    /* the existing schedule grid markup, but driven by `availability.fields` */
  )}
  ```

  Imports needed:

  ```typescript
  import { ErrorBanner } from "@/components/ui/error-banner";
  import { EmptyState } from "@/components/ui/empty-state";
  import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
  ```

  (Per CLAUDE.md "UI feedback primitives" — these primitives are the project's standard and live in `@/components/ui/`.)

  **Book CTA href:** the existing book button becomes a link to `/rentals?venueId=...&date=...&field=...&time=...` (the shared rentals page handles the booking flow). Adapt to match the actual query params the `/rentals` page accepts — read `src/pages/rentals/index.astro` for its query-param contract. If `/rentals` doesn't accept deep-link params today, just link to `/rentals` (the user reselects their slot there).

  **Critical:** preserve every CSS class name and the visual layout. Only the data binding changes.

### 4c. `rent.astro` queries venues + passes `venueId`

- [ ] **Step 7: Modify `rent.astro` frontmatter:**

  ```astro
  ---
  export const prerender = false;
  import BaseLayout from '@/layouts/BaseLayout.astro';
  import SoccerOneHeader from '@/components/soccerone/SoccerOneHeader.astro';
  import SoccerOneFooter from '@/components/soccerone/SoccerOneFooter.astro';
  import { Toaster } from 'sonner';
  import { FieldCalendar } from '@/components/soccerone/FieldCalendar';
  import { getSoccerOneVenuesByLocation } from '@/lib/soccerone/venues';

  const facility = Astro.url.searchParams.get('facility') || 'downtown';
  const locationSlug =
    facility === 'worthington' ? 'soccerone-worthington' : 'soccerone-downtown';

  const venues = await getSoccerOneVenuesByLocation(locationSlug);
  const venueId = venues.length > 0 ? venues[0].id : null;
  ---
  ```

- [ ] **Step 8: Pass the prop** where `FieldCalendar` is mounted in the template:

  ```astro
  <FieldCalendar client:load venueId={venueId} />
  ```

  Replace the existing tag (which currently has no `venueId` prop).

### 4d. Verify + commit

- [ ] **Step 9: Build + tsc.**

  ```bash
  npx tsc --noEmit 2>&1 | grep -vE "(progress\.tsx|separator\.tsx|r2\.ts)" | tail -10
  npm run build 2>&1 | tail -25
  ```
  Expected: zero new tsc errors; build succeeds.

- [ ] **Step 10: Manual smoke.** Browser at `http://soccerone.localhost:4321/rent`. The "Downtown — Field 1" venue (seeded in Task 2) should appear with a calendar grid populated by actual availability data.

- [ ] **Step 11: Commit.**

  ```bash
  git -C /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone \
    add src/lib/soccerone/venues.ts tests/unit/soccerone/venues.test.ts \
        src/components/soccerone/FieldCalendar.tsx src/pages/soccerone/rent.astro
  git -C /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone \
    commit -m "$(cat <<'EOF'
  feat(soccerone): wire FieldCalendar to live rental availability

  FieldCalendar now fetches /api/rentals/availability by venueId+date
  via useEffect, using LoadingSkeleton / ErrorBanner / EmptyState
  primitives. Mock schedule constant deleted. rent.astro queries
  SoccerOne venues by location slug (downtown/worthington) and passes
  the venueId in.

  New helper at src/lib/soccerone/venues.ts plus unit tests verifying
  cross-org isolation (Aspire's venues never returned).

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 5: Wire `PickupGames.tsx` to live drop-in sessions

**Files:**
- Modify: `src/components/soccerone/PickupGames.tsx`
- Modify: `src/pages/soccerone/pickup.astro` (only if the page currently passes hardcoded data into the component)

Mirrors Task 4 but simpler — drop-in sessions don't need a per-venue selector; the component just lists upcoming sessions for the resolved org.

- [ ] **Step 1: Read `/api/dropin/sessions` endpoint contract.** Open `src/pages/api/dropin/sessions/index.ts` and confirm the response shape (likely `{ sessions: [{ id, name, startsAt, durationMinutes, totalSpots, spotsLeft, priceCents, skillLevel, venue: { name } }, ...] }`). Adapt the component types to match the real shape.

- [ ] **Step 2: Remove `TODAY_GAMES` + `WEEK_GAMES`** constants from `PickupGames.tsx`. Replace with state + fetch:

  ```typescript
  interface DropInSession {
    id: string;
    name: string;
    skillLevel: string;
    startsAt: string;
    durationMinutes: number;
    totalSpots: number;
    spotsLeft: number;
    priceCents: number;
    venue?: { name: string };
  }

  const [sessions, setSessions] = useState<DropInSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/dropin/sessions")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (!cancelled) setSessions(body.sessions ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load sessions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  ```

  **Important:** if the actual endpoint response shape differs from the sketch above (column naming, nesting, etc.), adapt the type. The endpoint code is the source of truth — read it.

- [ ] **Step 3: Replace the rendered grids.** The component currently splits games into "Today" and "This Week" via the `isToday` boolean. Re-derive that from `startsAt`:

  ```typescript
  function isStartingToday(iso: string): boolean {
    const d = new Date(iso);
    const today = new Date();
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  }

  const todaySessions = sessions.filter((s) => isStartingToday(s.startsAt));
  const upcomingSessions = sessions.filter((s) => !isStartingToday(s.startsAt));
  ```

  Then render each list with the existing card markup, replacing the mock-data field names with the live fields:
  - `game.name` → `session.name`
  - `game.time` → format `session.startsAt` (`new Date(session.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })`)
  - `game.field` → `session.venue?.name ?? ""`
  - `game.totalSpots` / `game.spotsLeft` — direct
  - `game.price` → `session.priceCents / 100`
  - `game.skillLevel` → direct (may need normalization if the API returns lowercase but the UI expects title-case)

- [ ] **Step 4: Loading / error / empty UI.**

  ```tsx
  {loading && <LoadingSkeleton />}
  {!loading && error && <ErrorBanner message={`Couldn't load pickup games: ${error}`} />}
  {!loading && !error && sessions.length === 0 && (
    <EmptyState
      title="No pickup games scheduled"
      description="Check back soon — new sessions go up weekly."
    />
  )}
  {!loading && !error && sessions.length > 0 && (
    /* existing grids, driven by todaySessions + upcomingSessions */
  )}
  ```

  Add the imports for the UI primitives at the top.

- [ ] **Step 5: CTA href.** The current mock "Book Now" CTA should link to `/dropin/[id]` (the shared drop-in page handles the booking flow): `<a href={`/dropin/${session.id}`} className="...">Book Now</a>`. Confirm the `/dropin/[id]` page accepts this by reading `src/pages/dropin/[id].astro`.

- [ ] **Step 6: Build + tsc.**

  ```bash
  cd /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone
  npx tsc --noEmit 2>&1 | grep -vE "(progress\.tsx|separator\.tsx|r2\.ts)" | tail -10
  npm run build 2>&1 | tail -25
  ```
  Expected: zero new errors; build succeeds.

- [ ] **Step 7: Manual smoke.** Browser at `http://soccerone.localhost:4321/pickup`. The "Evening Coed Pickup" session (seeded in Task 2) should appear in the "Today" or "Upcoming" list.

- [ ] **Step 8: Commit.**

  ```bash
  git -C /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone \
    add src/components/soccerone/PickupGames.tsx src/pages/soccerone/pickup.astro
  git -C /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone \
    commit -m "$(cat <<'EOF'
  feat(soccerone): wire PickupGames to live drop-in sessions

  PickupGames now fetches /api/dropin/sessions via useEffect and splits
  rendered sessions into today + upcoming based on startsAt. Mock
  TODAY_GAMES / WEEK_GAMES constants deleted. Uses LoadingSkeleton /
  ErrorBanner / EmptyState primitives. Book Now CTA → /dropin/[id].

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 6: Update launch checklist with Phase 2 data prerequisites

**Files:**
- Modify: `docs/ops/soccerone-launch-checklist.md`

Insert a new Stage 6.5 between the existing "Stage 6 — Prod provisioning" (which runs `seed-soccerone-org.ts`) and "Stage 7 — Flip domain_mappings to ssl_active." The new stage walks the founder through creating SoccerOne's bookable inventory in prod via the admin UI.

- [ ] **Step 1: Read the current checklist** to find the exact spot to insert (after Stage 6, before Stage 7).

- [ ] **Step 2: Insert this Stage 6.5 block** before Stage 7:

  ```markdown
  ## Stage 6.5 — Seed SoccerOne bookable inventory (prod)

  Goal: create SoccerOne's leagues, rentable fields, and drop-in sessions
  in prod so the marketing pages have something to show. Without this,
  `gosoccerone.com/leagues`, `/rent`, and `/pickup` render empty states.

  All steps below happen in the **production admin UI** signed in as a
  super-admin scoped to the SoccerOne org. None of this is required
  before flipping `domain_mappings.status` to `ssl_active` — empty
  states are acceptable for an early launch — but the experience is
  much better with at least one of each populated.

  - [ ] **Create at least one SoccerOne sport** (Soccer).
  - [ ] **Create at least one league program** at each location
        (Downtown + Worthington), with `audienceType: "adult"` (or
        whatever the launch sports are).
  - [ ] **Open a season** for each program: `status = "open"`, future
        start date, set price + max participants. These are what the
        leagues page will show.
  - [ ] **Create at least one rentable venue** at each location:
        - `rentalEnabled: true`
        - `rentalHourlyRateCents`, `rentalOpenMinute`, `rentalCloseMinute`
        - `fieldCount` ≥ 1
        - `partnerStripeAccountId` set to the facility's Stripe Connect
          account id (required for rental revenue to route to SoccerOne)
        - `partnerApplicationFeePct` set to Aspire's platform fee
  - [ ] **Create rental rate cards** for each venue — see
        `field_rental_rate_card` schema (per-hour / per-day rates).
  - [ ] **Create at least one upcoming drop-in session** per location:
        `active: true`, future `startsAt`, `totalSpots`, `priceCents`,
        a `drop_in_rate_card` for the session's pricing.
  - [ ] **Onboard the SoccerOne Stripe Connect account** if not already
        done — needed before rentals or memberships can route money to
        the facility's bank. Use the existing Connect onboarding flow
        in the admin UI.

  Verification:

  ```bash
  curl -s "https://www.gosoccerone.com/api/public/seasons" \
    -H "Cookie: <admin-cookie-not-needed-public>" | jq '.seasons | length'
  ```
  Expected: at least one open season.

  ```bash
  curl -s "https://www.gosoccerone.com/api/dropin/sessions" | jq '.sessions | length'
  ```
  Expected: at least one upcoming session.

  ```bash
  curl -s "https://www.gosoccerone.com/api/rentals/availability?venueId=<soccerone-venue-uuid>&date=$(date +%Y-%m-%d)" | jq
  ```
  Expected: at least one field with non-empty `free` blocks.
  ```

- [ ] **Step 3: Commit.**

  ```bash
  git -C /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone \
    add docs/ops/soccerone-launch-checklist.md
  git -C /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone \
    commit -m "$(cat <<'EOF'
  docs(ops): add Stage 6.5 to SoccerOne launch checklist

  Walks the founder through creating SoccerOne's bookable inventory
  (programs, seasons, rental-enabled venues + rate cards, drop-in
  sessions, Stripe Connect onboarding) in the prod admin UI. Stage
  6.5 sits between Stage 6 (provisioning script) and Stage 7
  (flipping domain_mappings to ssl_active). Empty states are
  acceptable for the initial launch.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 7: Regression sweep + push + open PR

**Files:** none modified.

- [ ] **Step 1: Run the seed + unit suites.**

  ```bash
  cd /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone
  export $(grep -E "^DATABASE_URL=" .env | xargs)
  npm run db:seed:e2e 2>&1 | tail -15
  npx vitest run tests/unit/ 2>&1 | tail -10
  ```
  Expected: seed idempotent; all unit tests pass (including the new `tests/unit/soccerone/venues.test.ts`).

- [ ] **Step 2: Public API regression.**

  ```bash
  CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public/ 2>&1 | tail -10
  ```
  Expected: green — Phase 0's tenant-scoping tests still pass; Phase 2 doesn't touch those endpoints.

- [ ] **Step 3: Type check + build.**

  ```bash
  npx tsc --noEmit 2>&1 | grep -vE "(progress\.tsx|separator\.tsx|r2\.ts)" | tail -10
  npm run build 2>&1 | tail -25
  ```
  Expected: zero new errors; build succeeds.

- [ ] **Step 4: Aspire-content smoke** — make sure Phase 2's edits to `soccerone/*` didn't somehow leak into Aspire's surfaces.

  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/programs
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/api/public/filters
  curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:4321/soccerone
  ```
  Expected: 200 for Aspire pages; 301 for `/soccerone`.

- [ ] **Step 5: SoccerOne page smoke** via the subdomain (browsers send `Host` so the resolver routes to SoccerOne via slug match).

  Use curl with explicit `--resolve` so it sends the right Host. If your environment doesn't allow `*.localhost` resolution to `127.0.0.1`, the `--resolve` flag forces it:

  ```bash
  curl -s --resolve soccerone.localhost:4321:127.0.0.1 http://soccerone.localhost:4321/leagues | grep -oE 'Adult Coed — Spring 2026' | head -1
  curl -s --resolve soccerone.localhost:4321:127.0.0.1 http://soccerone.localhost:4321/pickup | grep -oE 'Evening Coed Pickup' | head -1
  curl -s --resolve soccerone.localhost:4321:127.0.0.1 http://soccerone.localhost:4321/rent | grep -oE 'Downtown — Field 1|FieldCalendar' | head -1
  ```
  Expected: each grep finds the seeded content. If `--resolve` doesn't work in this curl version, fall back to setting the `Host:` header manually with `-H "Host: soccerone.localhost"` (some Vite versions reject mismatched Host but Astro's middleware reads the header regardless).

  If neither approach works locally, note it and rely on the launch checklist's Stage 2 staging-subdomain smoke check.

- [ ] **Step 6: Push and open the PR.**

  ```bash
  git -C /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone \
    push -u origin feat/soccerone-phase2-booking-wiring 2>&1 | tail
  ```

  ```bash
  cd /Users/mahadibrahim/Documents/Aspire-Sports/web-app/.claude/worktrees/feat+soccerone-gosoccerone
  gh pr create --base main --head feat/soccerone-phase2-booking-wiring \
    --title "Phase 2: wire SoccerOne CTAs into live booking flows" \
    --body "$(cat <<'EOF'
  Phase 2 of the SoccerOne / gosoccerone.com project. Removes the
  hardcoded mock data from the three SoccerOne marketing pages
  (\`leagues\`, \`rent\`, \`pickup\`) and points every CTA at the real
  registration / rental / drop-in flows.

  **Touches no Aspire-shared code.** Every edit is in
  \`src/pages/soccerone/*\`, \`src/components/soccerone/*\`,
  \`src/lib/soccerone/*\`, or the e2e seed and launch checklist. The
  booking endpoints (\`/api/public/seasons\`, \`/api/rentals/availability\`,
  \`/api/dropin/sessions\`, plus the POST endpoints for bookings) are
  unchanged — Phase 2 is a pure consumer.

  ## What changed

  - **\`src/pages/soccerone/leagues.astro\`** — server-side fetch to
    \`/api/public/seasons\` (tenant-scoped from Phase 0); hardcoded
    league cards replaced with a loop over the real seasons; CTAs
    deep-link to \`/register/[seasonId]\`.
  - **\`src/components/soccerone/FieldCalendar.tsx\`** — \`MOCK_SCHEDULE\`
    deleted; fetches \`/api/rentals/availability?venueId=&date=\` via
    useEffect; uses LoadingSkeleton / ErrorBanner / EmptyState
    primitives.
  - **\`src/pages/soccerone/rent.astro\`** — queries SoccerOne venues by
    location slug via a new helper at \`src/lib/soccerone/venues.ts\`,
    passes the venueId in.
  - **\`src/components/soccerone/PickupGames.tsx\`** — \`TODAY_GAMES\` /
    \`WEEK_GAMES\` deleted; fetches \`/api/dropin/sessions\`; CTAs deep-link
    to \`/dropin/[id]\`.
  - **\`src/lib/db/seeds/seed-e2e-tests.ts\`** — new Stage 12 appends
    idempotent SoccerOne booking fixtures (one league season, one
    rental-enabled venue, one drop-in session) for local/staging dev.
    Skipped if the SoccerOne org isn't provisioned yet.
  - **\`docs/ops/soccerone-launch-checklist.md\`** — new Stage 6.5
    documents the prod admin-UI steps for creating SoccerOne's
    bookable inventory.
  - **\`src/lib/soccerone/venues.ts\`** + **\`tests/unit/soccerone/venues.test.ts\`** —
    helper + unit tests verifying cross-org isolation.

  ## Local verification

  - \`tsc --noEmit\`: clean (only pre-existing baseline errors).
  - \`npm run build\`: succeeds.
  - Unit + public API suites pass.
  - SoccerOne subdomain smoke: \`/leagues\`, \`/rent\`, \`/pickup\` render
    seeded fixture data.
  - Aspire safety: \`/\`, \`/programs\`, \`/api/public/filters\` unchanged.

  ## Reference docs

  - Spec: \`docs/superpowers/specs/2026-05-22-soccerone-gosoccerone-domain-design.md\` (§7)
  - Plan: \`docs/superpowers/plans/2026-05-23-soccerone-phase2-booking-wiring.md\`

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )" 2>&1
  ```

- [ ] **Step 7: Wait for CI green** on the resulting commit on origin. Per CLAUDE.md, a push isn't "done" until CI passes.

---

## Acceptance

- [ ] All three SoccerOne marketing pages (`leagues`, `rent`, `pickup`) render with live tenant-scoped data when accessed via a SoccerOne host.
- [ ] No mock data constants remain in `FieldCalendar.tsx` or `PickupGames.tsx`.
- [ ] CTAs point at real flow URLs (`/register/[seasonId]`, `/rentals`, `/dropin/[id]`).
- [ ] `LoadingSkeleton`, `ErrorBanner`, and `EmptyState` primitives used per CLAUDE.md UI feedback conventions.
- [ ] e2e seed (Stage 12) idempotently creates SoccerOne booking fixtures; skipped cleanly if the SoccerOne org isn't provisioned.
- [ ] Launch checklist Stage 6.5 captures the prod admin-UI steps.
- [ ] `tests/unit/soccerone/venues.test.ts` proves cross-org isolation of the venue helper.
- [ ] Aspire safety property held: no Phase 2 edits touched Aspire-shared code.
- [ ] PR opens cleanly; CI green on the head commit on `main`.

---

## Out of scope (deferred to Phase 3)

- Membership subsystem (Stripe Subscriptions, `membership_tiers` + `memberships` tables, dashboard pause/cancel) — Phase 3.
- The `memberships.astro` page is intentionally **not wired** by Phase 2 — it still markets a product without a backend. Phase 3 builds the subsystem and wires the page in one go.

---

## Self-review

**Spec coverage** — every Phase 2 requirement in spec §7 maps to a task:

| Spec §7 row | Task |
|---|---|
| Leagues page — live seasons + register CTAs | Task 3 |
| Rent page — wire FieldCalendar + venue selector | Task 4 |
| Pickup page — wire PickupGames | Task 5 |
| Remove hardcoded mock data | Tasks 3, 4, 5 |
| Precondition (ops) — programs/venues/rate cards/sessions exist | Task 2 (local) + Task 6 (prod ops) |

**Placeholder scan** — no "TBD"/"TODO"/"handle edge cases." Each step has actual code or a concrete bash command. The one deliberate abstraction is "adapt to the actual response shape if it differs" in Task 5's drop-in endpoint section — that's because the implementer should source-check rather than the plan author guessing the exact column names. The plan tells them where to look.

**Type / name consistency** — `getSoccerOneVenuesByLocation` is the exact same name in Task 4's test, helper, and `rent.astro` import. `FieldCalendarProps` and the `venueId: string | null` prop signature are consistent between Task 4 and the `rent.astro` template. The `DropInSession` interface in Task 5 is sketched and the implementer is told to align to the real endpoint shape.

**Scope** — single Phase 2 plan, 7 tasks, one PR. Phase 3 (memberships) is the next plan.
