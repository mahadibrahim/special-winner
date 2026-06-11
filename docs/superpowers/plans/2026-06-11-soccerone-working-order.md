# SoccerOne Working-Order Fixes (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix everything customer-visibly broken on the live gosoccerone.com site: wrong/fake contact info, dead CTAs, invented stats, time-bound copy, dead social icons.

**Architecture:** Pure template fixes inside the existing hardcoded `/soccerone/*` tree (no schema, no new endpoints). One new constant module is the single source of truth for the contact email. The leagues featured CTA flips from hardcoded copy to rendering the already-fetched `seasons[0]`, hidden when none.

**Tech Stack:** Astro 5 SSR pages, existing per-page scoped styles. Branch `feat/soccerone-hardening` (spec already committed on it). One commit, one PR.

Spec: `docs/superpowers/specs/2026-06-11-soccerone-hardening-design.md`. Verification is `npx tsc --noEmit` + CI build + prod smoke after deploy — these are static templates with no test surface; the only logic change (featured CTA) is render-conditional on data already covered by `/api/public/seasons` tests.

---

### Task 1: Contact constant module

**Files:**
- Create: `src/lib/soccerone/contact.ts`

- [ ] **Step 1: Create the module**

```ts
/**
 * Single source of truth for the SoccerOne contact email. Rendered in
 * the footer, the homepage contact bar, and both facility pages.
 *
 * Mailbox provisioning (founder, 2026-06-12): Migadu mailbox + MX
 * records in the Netlify-managed gosoccerone.com DNS zone, mirroring
 * aspiresportsohio.com (10 aspmx1.migadu.com / 20 aspmx2.migadu.com).
 * A scheduled routine verifies this on 2026-06-12 and opens an issue
 * if missing. Change the address here only.
 */
export const SOCCERONE_CONTACT_EMAIL = "play@gosoccerone.com";
```

### Task 2: leagues.astro — data-driven featured CTA, evergreen stats, gated bottom CTAs

**Files:**
- Modify: `src/pages/soccerone/leagues.astro` (frontmatter ~line 38; stats 78–93; featured CTA 124–156; bottom CTA 248–252)

- [ ] **Step 1: Frontmatter — derive featured-season display values** (after `const firstSeasonId = …` line 38)

```ts
// Featured season = first open season (the API already sorts by startDate).
// All featured-CTA copy derives from it; the block renders only when one exists.
const featured = seasons[0] ?? null;
const featuredStart = featured?.startDate
  ? new Date(featured.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  : null;
const featuredPrice = featured
  ? (featured.teamPrice
      ? `$${featured.price}/player · $${featured.teamPrice}/team`
      : `$${featured.price}/player`)
  : null;
```

- [ ] **Step 2: Header stats → factual evergreen** (replace the three `lhs-item` blocks "16 Active leagues / 8 Week seasons / 2 Locations")

```html
<div class="lhs-item">
  <span class="lhs-num">4</span>
  <span class="lhs-label">Indoor fields</span>
</div>
<div class="lhs-div" aria-hidden="true"></div>
<div class="lhs-item">
  <span class="lhs-num">2</span>
  <span class="lhs-label">Locations</span>
</div>
<div class="lhs-div" aria-hidden="true"></div>
<div class="lhs-item">
  <span class="lhs-num">7–11</span>
  <span class="lhs-label">Open daily</span>
</div>
```

- [ ] **Step 3: Featured CTA block — wrap in `{featured && (…)}` and replace hardcoded copy**

Replace `<h2 class="lfcta-title">Adult Open Soccer 2026</h2>` with `{featured.name}`; "Starts June 2, 2026" with `{featuredStart && `Starts ${featuredStart}`}` (render the `lm-item` only when start date exists); drop the "8-week season + playoffs" and "Worthington · Field 1" items (replace with one item showing `{featured.location.name}` and one showing `{featured.scheduleNotes}` when present); price item renders `{featuredPrice}`. The register button becomes `href={`/register/${featured.id}`}` — **no `#` fallback** (block doesn't render without `featured`).

- [ ] **Step 4: Bottom CTA banner — wrap in `{firstSeasonId && (…)}`** so "Register a Team / Register as Individual" never render as `#` links.

### Task 3: index.astro — evergreen stats, dead links, contact email

**Files:**
- Modify: `src/pages/soccerone/index.astro` (stats ~139; play-card ~330–345; youth card ~390; contact bar ~530)

- [ ] **Step 1: Stat "16 / Active Leagues / Adult · Youth · Coed" →**

```html
<div class="stat-block">
  <div class="stat-num">3</div>
  <div class="stat-name">Ways to Play</div>
  <div class="stat-sub">Leagues · Pickup · Rentals</div>
</div>
```

- [ ] **Step 2: Adult Leagues play-card** — "NEXT SEASON / June 2026" detail →

```html
<span class="pc-detail-item">
  <span class="detail-label">SEASONS</span>
  <span class="detail-val">Year-round cycles</span>
</span>
```

and the dead `href="/register/season-adult-open-2026"` CTA → `href="/soccerone/leagues"` (label "See Leagues").

- [ ] **Step 3: Youth card dead anchor** — `href="/soccerone#programs"` → `href="/soccerone/leagues"`.

- [ ] **Step 4: Contact bar** — import the constant in frontmatter (`import { SOCCERONE_CONTACT_EMAIL } from '@/lib/soccerone/contact';`) and replace `mailto:play@soccerone.com` / display text with the constant.

### Task 4: memberships.astro — remove invented stat

**Files:**
- Modify: `src/pages/soccerone/memberships.astro` (~118–125)

- [ ] **Step 1:** Delete the "400+ / Active members" `ts-item` and its adjacent `ts-div`. Keep "$8–$16 saved per rental hour" (derived from real tier rates) and "2 locations".

### Task 5: Facility pages — real contact, evergreen schedule label

**Files:**
- Modify: `src/pages/soccerone/worthington/index.astro` (111, 367)
- Modify: `src/pages/soccerone/downtown/index.astro` (174, 371)

- [ ] **Step 1 (both files):** `Week of April 28, 2026` → `A typical week` (same `schedule-date mono` styling).
- [ ] **Step 2 (both files):** import the contact constant; replace `<a href="tel:+1614555…">(614) 555-…</a>` with `<a href={`mailto:${SOCCERONE_CONTACT_EMAIL}`} class="iab-link">{SOCCERONE_CONTACT_EMAIL}</a>` and change the adjacent label from phone wording to "Email us" if one exists.

### Task 6: Footer + Header

**Files:**
- Modify: `src/components/soccerone/SoccerOneFooter.astro` (social-row ~51–70; Help column ~110–116)
- Modify: `src/components/soccerone/SoccerOneHeader.astro` (desktop nav ~41–44; mobile nav ~68–71)

- [ ] **Step 1: Footer** — delete the `social-row` div (leave an HTML comment: `<!-- Social icons removed until accounts exist — restore from git history (SoccerOneFooter, pre-2026-06-11) and add real URLs -->`). Add to the Help column above Sign In: `<li><a href={`mailto:${SOCCERONE_CONTACT_EMAIL}`}>Email Us</a></li>` (import constant in frontmatter).
- [ ] **Step 2: Header** — add `<a href="/signin" class="so-nav-link">Sign In</a>` after the Members link in desktop nav, and `<a href="/signin" class="mobile-nav-link">Sign In</a>` in the mobile drawer.

### Task 7: Verify + ship

- [ ] **Step 1:** `npx tsc --noEmit` → 0 errors. `grep -rn "555-\|play@soccerone.com\|Week of April\|season-adult-open\|href=\"#\"" src/pages/soccerone src/components/soccerone` → no hits.
- [ ] **Step 2:** Commit all files (explicit paths) as one commit `fix(soccerone): working-order pass — real contact, data-driven CTAs, evergreen copy`; push `feat/soccerone-hardening`; open PR referencing the spec.
- [ ] **Step 3:** After CI green + founder merge: prod smoke — gosoccerone.com /leagues shows no featured block (no seasons yet) and no dead buttons; facility pages show the email; footer has no social icons.
