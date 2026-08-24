# Youth Class Memberships — Plan 3: Experience Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything a parent or admin touches: the live `/youth/classes` schedule + tier pricing with trial-led and pay-first signup flows, the post-checkout home-slot picker, per-child dashboard cards with make-up/cancel/change-slot actions, the `/admin/classes` template CRUD + roster, the trial-convert email, and the E2E/browser verification gate.

**Architecture:** Pure consumers of the Plan-2 engine APIs (`/api/public/class-schedule`, `/api/classes/*`, `/api/public/membership-tiers`, `/api/memberships/subscribe`) plus a small set of NEW admin endpoints (template CRUD does not exist yet) and one subscribe-flow change (child success URL). All live data on marketing pages rides client islands — `/youth/classes` is edge-cached (`setMarketingEdgeCache`, classes.astro:33). Admin pages follow the frontmatter-drizzle + island pattern; dashboard cards follow the fetch-in-island pattern.

**Tech Stack:** Astro 5 + React 19 islands, Tailwind 4 (youth emerald band grammar per `docs/design-system.md`), Drizzle, Vitest + Playwright.

**Spec:** `docs/superpowers/specs/2026-08-23-youth-class-memberships-design.md`. **Prereqs merged:** Plans 1–2 (#586, #588, #589).

## Global Constraints

- Fresh worktree, branch `youth-classes-ux` off current `origin/main`; cherry-pick the plan-doc commit. `git branch --show-current` before every edit session.
- **Engine-ledger hard requirements (binding):** (1) the enrollment UX MUST capture the guardian waiver — a child without waiver-on-file is silently skipped by auto-booking; the flow below (Task 3) books the first session WITH the waiver payload, which both establishes waiver-on-file and delivers the this-week class. (2) Admin deactivate MUST offer cancel-future-sessions. (3) A Stripe-gated (`itWithStripe`) paid make-up API test ships in this plan.
- Youth design system: emerald accents, band primitives from `src/components/youth/bands/` (FeatureBand tones, PricingCards shape at pricing-cards.astro:5-19), full-width body text (no measure caps), no eyebrow/kicker labels unless they carry real info. Read `docs/design-system.md` "Youth band grammar" before any page work.
- Every `client:load` island that E2E drives calls `useHydrationBeacon()`; specs use `waitForHydration(page)` + click-driven interactions.
- UI feedback: `ErrorBanner` for blocking errors, sonner `toast` for transient, `EmptyState`, `LoadingSkeleton` — never bespoke.
- Tenant/org scoping on every new admin endpoint via `requireOrgAdminAccess` / the `requireSameOrg*` helpers; `prerender = false` on all admin pages.
- Engine error codes are the API contract — surface them as human copy, never raw codes: `allotment_exhausted` (402 carries `memberRateCents`), `member_child_no_trial`, `trial_already_used`, `age_ineligible`, `waiver_required`, `session_full`, `template_full`, `class_requires_child`, `inside_cutoff`.
- `npx tsc --noEmit` zero before every commit; browser verification (both brands where shared surfaces are touched) is a phase-close gate, not an afterthought.

---

### Task 1: Admin template CRUD — endpoints

**Files:**
- Create: `src/pages/api/admin/classes/templates/index.ts` (GET list, POST create)
- Create: `src/pages/api/admin/classes/templates/[id].ts` (PUT update, POST deactivate action — see below)
- Create: `src/pages/api/admin/classes/templates/[id]/roster.ts` (GET)
- Create: `src/lib/classes/admin-templates.ts` (validation schema + deactivate orchestration)
- Test: `tests/api/classes/admin-templates.test.ts`

**Interfaces:**
- Produces: zod `templateInputSchema` — `{ name: string(min 1), venueId: uuid, sportLabel: string default "Soccer", minAge/maxAge: int|null, weekday: int 0-6, startTime: "HH:MM", durationMins: int default 55, capacity: int ≥1, sessionRateDollars/memberRateDollars: number|null, active: boolean default true }` (dollars↔cents at the boundary, mirroring `tier-units.ts`).
- PUT accepts the same; **deactivation with teeth**: `PUT { active: false, cancelFutureSessions?: boolean }` → when true, orchestration cancels this template's future `scheduled` sessions: sessions with zero active bookings flip to `cancelled` directly; sessions WITH active bookings are cancelled via the existing per-booking `processCancelRefund(bookingId, { adminOverride: true, reason: "session_cancelled" })` loop then the session flips (read `src/pages/api/admin/dropin/sessions/[id]/cancel.ts` first and REUSE its orchestration if it exports one — do not reimplement refund logic). Response reports `{ sessionsCancelled, bookingsRefunded }`.
- Roster GET → `{ template, enrollments: [{ enrollmentId, familyMemberId, childName, age, startedAt }], upcomingSessions: [{ sessionId, startsAt, bookedCount, capacity, trialCount }] }`.
- All endpoints org-scoped: venue ownership on create/update via `requireSameOrgVenue`; template lookups filtered by `locals.organization.id`.
- **Spec edge case:** a PUT that changes `weekday`/`startTime` on a template WITH active enrollments emails each enrolled family a schedule-change notice (simple template via `sendEmail` — child name, old→new time, dashboard link; awaited post-commit, failure logged not thrown). Response includes `{ familiesNotified }`.

- [ ] **Step 1:** Read `src/pages/api/admin/memberships/tiers/{index,[id]}.ts` (the pattern), `src/lib/db/schema/classes.ts`, the admin dropin session cancel endpoint. Implement lib + endpoints.
- [ ] **Step 2:** API tests: create/list/update org-scoped (cross-org 404), deactivate-with-cancel cancels sessions and reports counts, roster shape. Fixture hygiene per `tests/utils/classes-helpers.ts` conventions (unique names + afterAll retirement).
- [ ] **Step 3:** `npx tsc --noEmit`; suites green vs dev server; commit `feat(admin): class slot template CRUD + roster endpoints`.

---

### Task 2: Admin pages — `/admin/classes`

**Files:**
- Create: `src/pages/admin/classes/index.astro`, `new.astro`, `[id].astro`
- Create: `src/components/admin/classes/templates-list.tsx`, `template-form.tsx`, `template-roster.tsx`
- Modify: the admin nav (find where "Manage Pickup and Hosts" etc. are declared — the AdminLayout nav list) to add "Classes"

**Interfaces:**
- Consumes: Task 1 endpoints. Pages mirror the memberships admin shape exactly: `BaseLayout navigation={false} footer={false}` → `AdminLayout client:load` → island with frontmatter-drizzle props (`prerender = false`, org-scoped selects, redirect to index when row/org missing — memberships [id].astro:17-27 pattern).
- `template-form.tsx` mirrors `tier-form.tsx`: dollar-string state, `ErrorBanner` on submit failure, `window.location.href` on success. Weekday as a select (Sun..Sat ↔ 0..6), startTime as `<input type="time">`. Venue select: frontmatter passes the org's venues (id + name) as props.
- Deactivating an active template in the form surfaces a confirm section: "N upcoming sessions exist — cancel them too? Bookings will be refunded." wired to `cancelFutureSessions` (fetch the count from the roster endpoint on toggle).
- `templates-list.tsx`: rows (name, day/time, ages, capacity, enrolled count from roster data or a lightweight list payload, active badge), link to edit; `EmptyState` + "New template" button.

- [ ] **Step 1:** Implement pages + islands per the anchors above.
- [ ] **Step 2:** Browser-verify: create a real template via the UI on staging (this replaces the SQL-only path), edit it, roster renders, deactivate flow shows the cancel-future prompt. Fix visual issues before committing.
- [ ] **Step 3:** `tsc`; commit `feat(admin): /admin/classes template management UI`.

---

### Task 3: Pay-first flow — child subscribe success → home-slot picker

**Files:**
- Modify: `src/pages/api/memberships/subscribe.ts` (child success URL only)
- Create: `src/pages/dashboard/family/choose-slot.astro` + `src/components/dashboard/choose-slot.tsx`
- Modify: `src/pages/dashboard/family.astro` (membership-success banner param, mirroring play.astro:33-34's inline pattern)

**Interfaces:**
- `subscribe.ts`: when `familyMemberId` is present, `successUrl` becomes `${appUrl}/dashboard/family/choose-slot?child=${familyMemberId}&membership=success` (cancel URL → `${appUrl}/youth/classes?membership=cancelled`). Adult path unchanged.
- `choose-slot.tsx` (`client:load`, `useHydrationBeacon`): reads `?child=`; fetches `/api/public/class-schedule` + `/api/classes/summary`; validates the child belongs to the caller (summary rows) and shows their name; renders age-eligible slots (filter by child age vs min/max) with spots left; on select →
  1. `POST /api/classes/enrollments { slotTemplateId, familyMemberId }`;
  2. **guardian waiver capture** (the engine-ledger requirement): if summary shows no waiver-on-file signal — the summary API has no waiver field, so ALWAYS render the waiver panel (checkbox + typed signature, guardian consent language — reuse the waiver copy source the registration wizard uses; grep `DROPIN_WAIVER_TEXT` / waiver components) unless the first-booking call below returns success without it: implement as attempt-then-prompt — call step 3 without waiver; on 422 `waiver_required`, expand the waiver panel and retry with `waiver: { signedBy, consentText }`;
  3. `POST /api/classes/book { sessionId: <next upcoming session of that template from the schedule payload>, familyMemberId, kind: "member", waiver? }` — books this week's class immediately AND establishes waiver-on-file so the cron covers future weeks.
  Success state: confirmation panel (slot, first class date/time) + link to the family dashboard. Membership-not-yet-active race (webhook lag): on `no_membership`, show a "payment settling — retry" state with an auto-retry (3× w/ backoff) before surfacing an error.
- `family.astro`: `?membership=success` renders the same inline emerald status banner play.astro uses (copy: "Membership active — welcome!").

- [ ] **Step 1:** Implement; handle `template_full`/`age_ineligible` inline with human copy and alternative-slot suggestions.
- [ ] **Step 2:** Browser-verify the full pay-first loop on staging: tier subscribe (Stripe test card) → land on choose-slot → enroll + first booking → family dashboard shows it.
- [ ] **Step 3:** `tsc`; commit `feat(classes): post-checkout home-slot picker + child subscribe landing`.

---

### Task 4: `/youth/classes` — live schedule section

**Files:**
- Create: `src/components/youth/class-schedule.tsx` (island)
- Modify: `src/pages/youth/classes.astro` (new `#schedule` section between `#pricing` (~L370) and `#open` (L373); `JUMP_ITEMS` entry at L69)

**Interfaces:**
- Island (`client:visible` is fine — no E2E keyboard interaction; but the trial CTA inside needs clicks post-hydration, so use `client:load` + `useHydrationBeacon`). Fetches `/api/public/class-schedule`; renders slot cards grouped by weekday: name, day + start time (12h display), age range, `spotsLeft` chip, venue/location name; per-slot CTAs **Book a free trial** (→ Task 5's flow) and **Join** (→ scrolls to `#pricing`). Empty state (no templates yet): the current "schedule coming" copy — do not render an empty grid.
- Visual: youth band grammar — paper cards on cream, emerald accents; match the PricingCards card radius/padding rhythm (pricing-cards.astro internals). Section heading + one-line lede, full-width text.
- The section gets its own id `#schedule`, JUMP_ITEMS entry "Schedule", and `[data-youth-cta]` attributes on CTAs so the existing tracking script (classes.astro:490+) captures clicks.

- [ ] **Step 1:** Implement island + section wiring.
- [ ] **Step 2:** Browser-verify against staging data (the admin-created template from Task 2 renders; counts correct; mobile layout via narrow window resize).
- [ ] **Step 3:** `tsc`; commit `feat(youth): live class schedule section`.

---

### Task 5: Trial booking flow

**Files:**
- Create: `src/components/youth/trial-booking.tsx` (modal/flow component used by class-schedule.tsx)

**Interfaces:**
- From a slot card's trial CTA: if unauthed (`/api/auth/me` — reuse however Navigation/CategoryFinder detects auth; grep first) → `window.location.href = "/signin?redirect=" + encodeURIComponent("/youth/classes#schedule")`. Authed: modal with child picker (`GET /api/family-members`; "+ Add a player" inline create — reuse the wizard's add-player subcomponent if extractable, else minimal firstName/lastName/birthDate form posting to the same endpoint the wizard uses — read who-step.tsx first). Age-filter children client-side against the slot's range and label ineligible ones.
- Select child → guardian waiver panel (same attempt-then-prompt pattern as Task 3) → `POST /api/classes/book { sessionId: <next session of the slot>, familyMemberId, kind: "trial", waiver? }`.
- Error copy: `member_child_no_trial` → "Your member kids already have classes included — book a make-up instead" (link to dashboard); `trial_already_used` → "Trial already used — join to keep coming"; `session_full` → offer the next week's session of the same slot.
- Success: confirmation panel (class, date/time, venue) noting the confirmation email (the engine's standalone booking path already dispatches it).

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Browser-verify trial-led loop on staging end-to-end as a fresh parent account; confirm the email lands (MESSAGING mock or Resend test).
- [ ] **Step 3:** `tsc`; commit `feat(youth): free trial booking flow`.

---

### Task 6: Live tier pricing + join flow on `/youth/classes`

**Files:**
- Create: `src/components/youth/class-tiers.tsx` (island replacing the static `<PricingCards>` at classes.astro:367)

**Interfaces:**
- Fetches `/api/public/membership-tiers` (existing public endpoint). Renders tiers (marketing `name`, `tagline`, `$X/mo`, `$45/yr fee` line when `annualFeeCents`, benefits summary derived from `classes_per_month`/`unlimited_classes`/`camp_discount_pct`) in the PricingCards visual shape (re-implement the card styles in React — the astro primitive has no island seam, note in a comment). Falls back to the current static `PRICING_CARDS` content when the org has no class tiers (keep the figure-free cards as the empty state so the page never regresses).
- **Join CTA** per tier: unauthed → signin redirect (as Task 5); authed → child picker (shared subcomponent with Task 5 — extract `src/components/youth/child-picker.tsx`) → `POST /api/memberships/subscribe { tierId, billingInterval: "month", familyMemberId }` → redirect `body.checkoutUrl` (MembershipTiersLive.tsx:64-86 is the pattern; 409 already-member → "This child already has a membership" with dashboard link).

- [ ] **Step 1:** Implement, wiring the sibling-discount hint ("10% off additional children — applied automatically at checkout").
- [ ] **Step 2:** Browser-verify with the real staging tiers; confirm checkout carries fee + coupon lines for a second child.
- [ ] **Step 3:** `tsc`; commit `feat(youth): live tier pricing + child join flow`.

---

### Task 7: Family dashboard — per-child class card + actions

**Files:**
- Create: `src/components/dashboard/family-classes-card.tsx` (+ make-up modal subcomponent)
- Modify: `src/pages/dashboard/family.astro` ("What you're part of" section, alongside `<ChildrenOverview client:load/>` at family.astro:186)

**Interfaces:**
- Island (`client:load`, `useHydrationBeacon`) fetching `/api/classes/summary`. Renders one `DashboardCard` (shell/DashboardCard.tsx:13-39 props) per child having membership OR trialUsed: tier name + status badge (`past_due` → attention tone + "update payment" copy), classes remaining this month (∞ for unlimited), home slot (name/day/time) or "Choose a home slot" CTA → `/dashboard/family/choose-slot?child=`, next session datetime, renewal date. Children with no membership + trialUsed → **convert CTA** ("Loved the trial? Join from $X/mo" → `/youth/classes#pricing`).
- Actions per child: **Book a make-up** (modal: upcoming age-eligible sessions from `/api/public/class-schedule`; `POST /api/classes/book kind:"member"`; on 402 `allotment_exhausted` show the member rate and route the paid path: `POST /api/dropin/bookings { sessionId, familyMemberId }` → redirect `checkoutUrl`); **Cancel** upcoming booking (`POST /api/classes/bookings/:id/cancel`; `inside_cutoff` 409 → explain the window; render `creditFreed`/`refunded` in the toast); **Change home slot** (reuse choose-slot's slot list; `PUT /api/classes/enrollments/:id { newSlotTemplateId }`).
- Zero-membership zero-trial children render nothing (ChildrenOverview already covers them); the card renders nothing at all when no child qualifies.

- [ ] **Step 1:** Implement card + modal.
- [ ] **Step 2:** Browser-verify all four actions on staging (make-up free path, exhausted→paid redirect at least to the Stripe URL, cancel before/inside cutoff, change slot).
- [ ] **Step 3:** `tsc`; commit `feat(dashboard): per-child class membership card + actions`.

---

### Task 8: Trial-convert follow-up email

**Files:**
- Create: `src/lib/email/templates/trial-convert.tsx`, `src/lib/classes/trial-convert.ts`, `src/pages/api/cron/trial-convert-emails.ts`, `netlify/functions/scheduled-trial-convert-emails.ts` (daily, off-hour minute)
- Test: `tests/unit/classes/trial-convert.test.ts`

**Interfaces:**
- Scan: trial bookings (`paymentMethod='trial'`, status confirmed/no_show) on sessions that ENDED 1–3 days ago, where the child has NO live membership now. One email per child ever — dedupe via the email log (read `logEmail` in `src/lib/email/send.ts:131` and query its table by a stable tag) or a `metadata` stamp on the booking row — pick whichever the codebase supports cleanly and document.
- Template: warm convert nudge (child name, the class they tried, tier prices from the org's tiers, CTA to `/youth/classes#pricing`), Aspire brand chrome (`email-layout` components), `sendEmail` via `src/lib/email/index.ts` (mock-aware).
- Cron skeleton per siblings; counters `{ scanned, sent, skipped }`.

- [ ] **Step 1:** TDD the scan predicate (pure part) then implement.
- [ ] **Step 2:** `tsc`; unit green; trigger once on staging with MESSAGING mock and verify the mock outbox.
- [ ] **Step 3:** Commit `feat(classes): trial-convert follow-up email cron`.

---

### Task 9: Tests — Stripe make-up path + E2E flows

**Files:**
- Create: `tests/api/classes/paid-makeup.test.ts` (itWithStripe-gated)
- Create: `tests/e2e/youth-classes-signup.spec.ts`
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts` only if the E2E specs need a deterministic template fixture beyond "Test Class Slot"

**Interfaces:**
- Paid make-up API test (the engine-ledger requirement): exhausted member child → 402 → `POST /api/dropin/bookings { sessionId, familyMemberId }` returns a Stripe checkout URL; assert the created Stripe session's amount equals the template's memberRateCents and metadata carries `family_member_id` (inspect via the Stripe SDK with the test key, mirroring how `create-checkout-member-discount.test.ts` verifies) — the webhook completion leg stays out of scope (documented).
- E2E (post-merge `test-full` — run locally before merge per CLAUDE.md): trial-led happy path (signin → schedule → trial modal → child → waiver → confirmation) and the choose-slot page standalone (authed parent with a seeded child membership → enroll + first booking confirmation). `waitForHydration` before interaction; click-driven; pin fixtures by slug/name.

- [ ] **Step 1:** Implement both; run E2E locally `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- youth-classes-signup.spec.ts`.
- [ ] **Step 2:** `tsc`; commit `test(classes): paid make-up Stripe assertions + signup E2E`.

---

### Task 10: Verification pass — full browser gate + PR

- [ ] **Step 1:** Staging walkthrough in a real browser, owner-quality bar: `/youth/classes` (schedule, tiers, trial, join CTAs; mobile-width pass), full pay-first loop with test card incl. sibling second child, trial-led loop, all dashboard card actions, admin template CRUD + deactivate-with-cancel, SoccerOne brand regression on shared surfaces (dashboard shell, dropin pages). Refine until it reads as designed, not merely functional.
- [ ] **Step 2:** Full pre-push checklist: `npm run db:seed:e2e`; API suites; local Playwright for the new spec + any registration specs touched; `npm run build`; `npx tsc --noEmit`.
- [ ] **Step 3:** Push `youth-classes-ux`; PR titled `feat: youth classes experience — schedule, signup flows, dashboard, admin (Plan 3)`; body summarizes + calls out the owner data-entry step (create real templates + tiers in admin). CI green before done.
