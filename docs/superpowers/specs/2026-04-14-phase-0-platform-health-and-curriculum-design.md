# Phase 0: Platform Health & Curriculum Integration

**Status:** Approved 2026-04-14, in implementation
**Owner:** Mahad Ibrahim
**Reviewer:** (self)
**Gates:** Phase 1 (messaging layer) cannot begin until this phase is complete

---

## Summary

Bring the existing Aspire Sports platform to a known-good state and ship the substantial coaching curriculum content currently sitting uncommitted in the working tree. Nothing in this phase is new feature development. Everything is either (a) fixing a rough edge that makes the platform feel "slower than hoped and not as functional as I remember," or (b) shipping the content and product integration for work that was already done but never landed.

This phase gates Phase 1 (messaging layer). Building a new messaging system on top of a platform with unresolved performance issues and half-shipped content would be painting over water damage.

## Goals

1. **Eliminate the "slower than hoped" symptoms** by fixing concrete performance anti-patterns in the existing code.
2. **Eliminate the "not as functional as I remember" symptoms** by removing placeholder/dead UI and finishing or deferring half-built features.
3. **Ship the coaching curriculum content** (15 minibooks, 4 sport guides, practice planner pages, supporting data and CSS) and integrate it meaningfully into the coach workflow and public marketing surface.
4. **Establish a known-good baseline** so Phase 1 implementation isn't fighting pre-existing issues.

## Non-goals

- New feature development (messaging, bot, auth redesign — all Phase 1 or later)
- Content creation (no new minibooks; we ship what's already written)
- Architectural refactors beyond what's required to fix identified issues
- Multi-tenant hardening (Phase 3)
- Schema changes unless required to unblock something
- Fixing every cosmetic issue found during smoke test (those become Phase 2/3 inputs)

## Context

### What's broken (identified during 2026-04-14 audit)

**Performance:**
- `src/pages/admin/index.astro:31-45` runs 7 sequential `db.select` calls in SSR (sports count, locations count, programs count, seasons count, registrations count, users count, pending refunds aggregate). Each awaits the previous. On a Netlify Function cold start against Railway Postgres, this is roughly 6x slower than necessary. `Promise.all` is the fix.
- Parent dashboard (`src/pages/dashboard/index.astro`) eager-hydrates 8 React components via `client:load`: `Navigation`, `Footer`, `EmailVerificationBanner`, `UpcomingEvents`, `ChildrenOverview`, `Announcements`, `CoachNotes`, `PaymentsSummary`. Only `Navigation` and the email banner need eager hydration. The rest should be `client:visible` or `client:idle`.
- Same pattern exists on coach dashboard and likely elsewhere; audit all pages.
- No query caching layer (acceptable for launch, noted for Phase 2+).

**Functionality gaps:**
- `src/pages/dashboard/index.astro:158-165` — "Need Help?" card has FAQ and Contact buttons rendered with no `href` and no `onClick`. Dead UI.
- `src/components/coach/roster-table.tsx:388,393` — "Open note editor modal" and "Export roster to CSV/PDF" are TODO-stubbed. User-visible buttons that don't work.
- `src/lib/db/seeds/curriculum-review/run-review.ts:55,60` — TODOs about activities/session plans rubric not implemented. Lower priority but noted.
- `announcements.sendEmail` flag exists on the schema but end-to-end delivery unverified without a real environment.

**Uncommitted content:**
- 15 minibooks in `src/pages/minibooks/` (~14,100 lines total) covering basketball, hockey, soccer with skill-level depth. Print-ready, designed for Amazon KDP / Lulu / Gumroad per `src/data/minibooks/DESIGN-SYSTEM.md`.
- 4 sport guides in `src/pages/guides/` (`baseball.astro`, `basketball.astro`, `hockey.astro`, `soccer.astro`) — each ~1,200+ lines, dynamically rendering curriculum from the database.
- `src/data/coaching-philosophy.ts` — grounded in PCA Double-Goal Coach, ELM Framework, TDEQ-5, US Soccer PDI.
- `src/data/minibooks/` — 15 data files plus `DESIGN-SYSTEM.md` and `_template.ts`.
- `src/pages/coach/practices/` — practice planner pages (`index.astro`, `new.astro`, `[id].astro`).
- `src/pages/api/public/seasons/[id].ts` — public season endpoint.
- `src/lib/db/seeds/curriculum-review/identify-upgrades.ts` — curriculum upgrade seed script.
- `src/styles/minibook.css`, `src/styles/print-guide.css`.
- `public/images/logo-black.png`.

### What exists and should be reused

- `src/pages/coach/resources.astro` already exists and is wired up to a `<ResourceLibrary />` component. This is the natural dock for curriculum integration on the coach side — no new navigation needed.
- Email infrastructure (`src/lib/email/`) is solid: Resend wrapper, send module, 7 templates, `emailLogs` table.
- Existing admin UI for announcements (broadcast outbound).
- Registration wizard (`src/components/registration/registration-wizard.tsx`) — fully functional, we extend in Phase 1 not here.

---

## Track A: Platform Health

### A1. Admin dashboard SSR parallelization

**Problem:** `src/pages/admin/index.astro:31-45` runs 7 sequential database queries in Astro frontmatter. On Netlify cold start, this is the slowest page load in the admin surface.

**Fix:** Wrap all independent queries in `Promise.all`. The pattern:

```typescript
const [
  [sportsCount],
  [locationsCount],
  [programsCount],
  [seasonsCount],
  [registrationsCount],
  [usersCount],
  [pendingRefundsData],
] = await Promise.all([
  db.select({ count: count() }).from(sports),
  db.select({ count: count() }).from(locations),
  db.select({ count: count() }).from(programs),
  db.select({ count: count() }).from(seasons).where(eq(seasons.status, 'open')),
  db.select({ count: count() }).from(registrations),
  db.select({ count: count() }).from(users),
  db.select({
    count: count(),
    totalAmount: sql<number>`COALESCE(SUM(${registrations.refundAmountCents}), 0)`,
  }).from(registrations).where(eq(registrations.refundStatus, 'pending_approval')),
]);
```

**Acceptance:** Admin dashboard SSR time drops meaningfully. Manual verification via browser devtools or a timing log.

**Same pattern audit:** Grep for sequential `await db.select` patterns in other Astro pages. Fix any other instances found.

### A2. Hydration budget audit

**Problem:** Dashboards eager-hydrate components that aren't above the fold. `client:load` runs on page load; `client:visible` runs when the user scrolls the component into view; `client:idle` runs after the main thread is free. Current code uses `client:load` universally, which bloats time-to-interactive.

**Rule going forward:**
- `client:load` — only Navigation and any component that must be interactive before first paint (e.g., session-dependent banners)
- `client:visible` — anything below the fold that needs React (lists, cards, dashboards)
- `client:idle` — anything that can wait for the page to settle (footers, help cards, non-critical widgets)

**Fix scope:**
- `src/pages/dashboard/index.astro` — downgrade `UpcomingEvents`, `ChildrenOverview`, `Announcements`, `CoachNotes`, `PaymentsSummary` to `client:visible`. `EmailVerificationBanner` stays `client:load`. `Footer` → `client:idle`.
- `src/pages/coach/index.astro` — same treatment for coach dashboard components.
- `src/pages/admin/index.astro` — review and downgrade where applicable.
- Grep for all `client:load` occurrences and apply the rule consistently across the app.

**Acceptance:** Total JS hydration cost on parent dashboard first paint drops. No behavioral regressions — the pages still work the same, just hydrate lazily.

### A3. Dead UI cleanup

**Problem:** Placeholder buttons and stubbed features make the platform feel "not as functional as I remember."

**Known dead UI:**
- `src/pages/dashboard/index.astro:158-165` — FAQ and Contact buttons on the "Need Help?" card. No href, no onClick. Either wire them up (FAQ page, contact form/mailto) or remove the card entirely until there's real content to link to.
- `src/components/coach/roster-table.tsx:388` — "Open note editor modal" TODO. Either implement the note editor modal or remove the button until we do.
- `src/components/coach/roster-table.tsx:393` — "Export roster to CSV/PDF" TODO. Either implement the export or remove the button.

**Audit scope:** Walk through every page in `src/pages/admin/`, `src/pages/dashboard/`, `src/pages/coach/`. For every button, link, dropdown item, and menu entry — verify it either (a) navigates somewhere real, (b) fires a real handler, or (c) is removed. No exceptions.

**Decision policy during audit:**
- If the fix is trivial (wire up an obvious handler), do it.
- If the fix requires significant product decisions, remove the UI and note it in the morning note for later decision.
- Never leave placeholder UI visible to users.

**Acceptance:** Zero buttons or links in parent/coach/admin views that do nothing when clicked. Every interactive element either works or is gone.

### A4. Smoke test pass

**Deferred.** Requires `DATABASE_URL`, real Stripe test keys, real Resend API key — none of which are available in this autonomous execution session. This item is marked as **must-run before Phase 1 implementation begins**, and added to the morning note as a user-gated task.

**When run:** Follow `BETA_LAUNCH_CHECKLIST.md` end-to-end. Validate signup, email verification, forgot password, program browse, registration wizard, payment, refund, admin CRUD, coach attendance, parent dashboard. Log every failure.

---

## Track B: Curriculum Integration

### B1. Commit the existing work

**Scope:** All currently-uncommitted curriculum and practice-planner files.

**Commits (logical grouping, not one big commit):**

1. **`feat(content): add coaching philosophy and minibook design system`**
   - `src/data/coaching-philosophy.ts`
   - `src/data/minibooks/DESIGN-SYSTEM.md`
   - `src/data/minibooks/_template.ts`

2. **`feat(content): add sport-specific minibook data files`**
   - `src/data/minibooks/basketball-*.ts` (5 files)
   - `src/data/minibooks/hockey-*.ts` (5 files)
   - `src/data/minibooks/soccer-*.ts` (5 files)

3. **`feat(minibooks): add 15 print-ready minibook pages`**
   - `src/pages/minibooks/*.astro` (15 files)
   - `src/styles/minibook.css`

4. **`feat(guides): add 4 dynamic sport coaching guides`**
   - `src/pages/guides/baseball.astro`
   - `src/pages/guides/basketball.astro`
   - `src/pages/guides/hockey.astro`
   - `src/pages/guides/soccer.astro`
   - `src/styles/print-guide.css`

5. **`feat(coach): add practice planning pages`**
   - `src/pages/coach/practices/index.astro`
   - `src/pages/coach/practices/new.astro`
   - `src/pages/coach/practices/[id].astro`

6. **`feat(api): add public seasons endpoint`**
   - `src/pages/api/public/seasons/[id].ts`

7. **`feat(admin): add curriculum upgrade identification seed`**
   - `src/lib/db/seeds/curriculum-review/identify-upgrades.ts`

8. **`feat(brand): add black logo variant`**
   - `public/images/logo-black.png`

**Acceptance:** `git status` shows no uncommitted work. All commits build.

### B2. Public marketing surface for guides

**Goal:** The 4 sport guides become first-class public marketing pages that drive SEO and build credibility with parents.

**Changes:**

1. **Guides index page:** Create `src/pages/guides/index.astro` as a landing page listing all 4 sport guides with short descriptions and preview images. Public, no auth required.

2. **Public navigation:** Add "Guides" as a top-level nav item on the public site (`src/components/navigation.tsx` or equivalent). Links to `/guides`.

3. **Homepage surfacing:** Add a section on the homepage highlighting the curriculum depth ("Evidence-based coaching across 4 sports — see our guides"). Links to `/guides`.

4. **PDF download affordance:** Each guide page gets a "Print this guide" or "Save as PDF" button that triggers `window.print()`. The existing `print-guide.css` makes this already look good when printed. No new PDF generation infrastructure needed — browser print-to-PDF is sufficient for v1.

5. **SEO basics:** Each guide page and the index get proper `<title>`, `<meta description>`, Open Graph tags so they surface well when shared.

**Acceptance:** `/guides`, `/guides/soccer`, `/guides/basketball`, `/guides/hockey`, `/guides/baseball` all resolve. Linked from public navigation. Print-to-PDF works via browser print.

### B3. Coach Resources page — real content

**Context:** `src/pages/coach/resources.astro` already exists and renders `<ResourceLibrary />`. The component may be a stub; its current state determines the scope of this task. During implementation, read the component first and decide to either (a) populate it with curriculum content, or (b) rewrite it if it's empty.

**Content to surface:**
- **Sport guides section:** All 4 sport guides, filtered by sports the coach works with (via `teams` / `coach_assignments` data). If the coach works with multiple sports, show all; if one, show one.
- **Minibook library:** All 15 minibooks, browsable by sport and by skill domain (technical / tactical / physical / psychological / game intelligence). Include search-by-title.
- **Coaching philosophy:** A prominent card linking to the `coachingPhilosophy` content — the 4 core beliefs, the Double-Goal Coach framing, ELM framework.

**Filtering UX:**
- Primary filter: sport
- Secondary filter: skill domain (for minibooks)
- Tertiary: text search
- Default view: all content for the coach's primary sport

**Acceptance:** Coach logs in, navigates to `/coach/resources`, sees their relevant sport guide(s) and minibooks organized and searchable. Every guide and minibook is reachable within 2 clicks.

### B4. Contextual surfacing in coach workflow

**Goal:** Minibooks aren't just a reference library — they're *in the path* of coach work.

**Surfaces to integrate:**

1. **Practice planner (`src/pages/coach/practices/`)**
   - When a coach is building a session and selects a skill focus (e.g., "ball handling", "shooting"), the relevant minibook surfaces as a suggested resource card near the skill selection.
   - Implementation: map skill names / slugs to minibook IDs in a small lookup table. When a session's focus skill matches, show the card with a "Read the ball-handling minibook" link.
   - Scope for Phase 0: linkage from the practice session edit view. More sophisticated suggestions (multi-skill sessions, difficulty-appropriate recommendations) deferred to later.

2. **Development tracking / roster**
   - When a coach is reviewing a kid's skill progress (e.g., on `src/pages/coach/assess/`), link to the relevant minibook for skills the kid is currently working on.
   - Implementation: on the skill detail view, show a "Teaching reference: [minibook title]" link if the skill maps to a minibook.
   - This is a light touch — one link, not a redesign of the development tracking UI.

3. **Coach dashboard first-run**
   - The first time a coach logs in to the dashboard (detected via `user.last_sign_in_at` being null or very recent), show a "Welcome to Aspire — start here" card with links to (a) the sport guide for their primary sport, (b) the top 3 foundational minibooks for that sport, (c) the coaching philosophy overview.
   - Implementation: new component `CoachFirstRunCard` conditionally rendered in the coach dashboard overview. Dismissible; state persisted in localStorage or a `dismissed_coach_welcome` boolean on the user profile.

**Acceptance:** A coach planning a ball-handling practice sees a link to the ball-handling minibook. A coach reviewing Maya's shooting development sees a link to the shooting minibook. A first-time coach sees a welcome card with curated starting content.

### B5. Parent-facing surfacing (light)

**Goal:** Parents see the curriculum depth without being overwhelmed by coach-level detail.

**Scope:**
- On the parent dashboard (`src/pages/dashboard/index.astro`) or the kid/program detail view, add a link to the relevant sport guide: "Here's how we teach soccer at Aspire — read our full guide."
- The link goes to the public guide page (`/guides/soccer`). Parents see the same content anyone can see; the link just surfaces it contextually.
- Minibooks stay coach-facing. Parents don't need skill-level detail by default, and mixing coach-level content into the parent surface would dilute the coaching experience.

**Explicit non-goal:** No parent-facing minibook browser, no development-report integration with minibooks, no per-kid skill recommendations to parents. That's a Phase 2+ decision.

**Acceptance:** A parent viewing their kid's program sees a single, unobtrusive link to the relevant sport guide. Clicking opens the public guide.

### B6. Baseball asymmetry

**Context:** Baseball has a sport guide but no minibooks. Basketball, hockey, and soccer each have 5 minibooks.

**Decision:** Ship the asymmetry. Do not block on creating baseball minibooks. Frame it as a feature rather than a bug:
- On the baseball guide page, add a small note: "More baseball content coming soon — new sport-specific minibooks are added each quarter."
- On the coach Resources page, the baseball filter shows the guide but an "Minibooks for baseball are in development" placeholder card.
- On the minibook library section, baseball is simply absent from the sport filter options (or shown as "coming soon").

**Acceptance:** Baseball experience is coherent. No broken links, no empty states that feel like bugs.

---

## Definition of done

- [ ] All admin pages with sequential SSR queries parallelized (A1)
- [ ] Hydration audit complete, `client:load` usage reduced to only above-the-fold components (A2)
- [ ] Zero dead buttons or placeholder UI in parent/coach/admin views (A3)
- [ ] All 15 minibooks, 4 guides, practice pages, coaching philosophy data, and supporting CSS committed to git (B1)
- [ ] `/guides` public index live, linked from public navigation and homepage; each guide has print-to-PDF affordance (B2)
- [ ] `/coach/resources` populated with searchable library of guides and minibooks, filtered by coach's sport (B3)
- [ ] Practice planner links to relevant minibooks by skill focus (B4)
- [ ] Development tracking/assessment views link to relevant minibooks (B4)
- [ ] First-run coach welcome card surfaces curated starting content (B4)
- [ ] Parent dashboard surfaces link to relevant sport guide (B5)
- [ ] Baseball asymmetry handled with "coming soon" messaging (B6)
- [ ] `git status` clean (no stale uncommitted work)
- [ ] **Deferred to user-gated task:** smoke test pass per `BETA_LAUNCH_CHECKLIST.md` (A4)

## Out of scope

- All Phase 1 messaging layer work
- New content creation (no new minibooks, no new guides)
- Multi-tenant hardening
- New schema migrations beyond what's required
- Fixing cosmetic issues that aren't blockers (deferred to Phase 2/3)
- Stripe/Twilio/Anthropic/other external service integration changes
- Parent-facing minibook integration (deferred — see B5 non-goals)
- Per-kid smart recommendation engines
- Analytics on minibook / guide usage

## Decisions made during design

- **Phase 0 + Phase 1 are separate spec documents**, run as separate brainstorming → implementation cycles. Phase 0 gates Phase 1.
- **Track A (health) and Track B (curriculum) run in parallel** within Phase 0, because they're independent and both gate Phase 1.
- **Browser print-to-PDF, not a PDF generation service**, for guide downloads. Avoids adding Puppeteer/headless-chrome infrastructure for a feature that works acceptably with `window.print()`.
- **Minibooks are coach-facing in v1**, not parent-facing, to avoid diluting the parent experience. Parent-side minibook surfacing reconsidered after Phase 1.
- **Baseball ships with a guide-only experience** in Phase 0. Minibook creation is future content work, not a launch blocker.

## Open questions (flagged during design, to revisit)

- None blocking Phase 0 implementation. Smoke test (A4) is a user-gated task that needs credentials.

## Change log

- 2026-04-14: Initial draft, approved for implementation.
