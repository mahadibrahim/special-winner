# Youth Design System Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/youth/classes` v2 composed from new youth band primitives, plus the accumulated prod copy fixes — youth surfaces only.

**Architecture:** The committed mockup `docs/superpowers/specs/2026-08-18-youth-classes-v2-mockup.html` is the visual source of truth — implementers translate its CSS values into tokens/Tailwind, never invent values. Primitives live in `src/components/youth/bands/` (Astro; one React island for the jump-bar active state and one for booking cards). Copy lives in `src/lib/youth/landing-content.ts` and the page frontmatter, per existing convention.

**Tech Stack:** Astro 5, React 19 islands, Tailwind 4, Playwright.

## Global Constraints

- The spec `docs/superpowers/specs/2026-08-18-youth-design-system-p1-design.md` binds every task — especially its Copy rules and Scope rule sections. Read the relevant spec section before each task.
- **Youth only:** no adult surface may change. Shared components get opt-in props defaulting to current behavior.
- Tokens for every color — the mockup's oklch values become/refer to named tokens; no inline oklch in pages (gradients composed from tokens via color-mix are fine).
- Roman headings; no eyebrow text; ages "N – M years old" below titles; no weeknight/indoors-only/DoC-teaches commitments; camps copy generalized.
- The coach section renders his method as attributed prose (NOT quotation marks) until the owner blesses the quote wording.
- Pricing band describes today's true block-pricing model; live "from $" via catalog helpers; no invented figures.
- No new JSON-LD (SEO branch owns schema).
- Dev server: `http://localhost:4455` already running (HMR). Worktree: `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/fix-meta-autofill-noise`, branch `youth-design-system-p1`.
- Commits per task; owner browser-gate before any push.

---

### Task 0: Commit spec + mockup record

**Files:** commit-only (`docs/superpowers/specs/2026-08-18-*`, this plan).

- [ ] **Step 1:** `git add docs/superpowers && git commit -m "docs(spec): youth design system phase 1 — approved mockup + design record"` (append Claude Code co-author trailer). Verify clean tree except `.hallmark/`.

---

### Task 1: Tokens + design-system.md canon

**Files:**
- Modify: `src/styles/globals.css` (palette block + `@theme inline`)
- Modify: `docs/design-system.md`

**Interfaces:**
- Produces: `--brand-red`, `--royal`, `--royal-bright` tokens + `--color-brand-red`, `--color-royal`, `--color-royal-bright` theme mappings (Tailwind classes `bg-brand-red`, `bg-royal`, `text-royal-bright`, etc.) consumed by every later task.

- [ ] **Step 1:** In `globals.css` after the emerald family, add (values verbatim from the spec):

```css
  /* Logo-derived brand extensions (2026-08-18 youth redesign): the script
     logo's red and a bright structural blue between navy and white. Youth
     surfaces: red = hot CTA/flood, royal = structural (jump bar, discs). */
  --brand-red: oklch(0.52 0.19 27);
  --royal: oklch(0.50 0.16 260);
  --royal-bright: oklch(0.62 0.15 258);
```

and in `@theme inline` after the emerald mappings:

```css
  --color-brand-red: var(--brand-red);
  --color-royal: var(--royal);
  --color-royal-bright: var(--royal-bright);
```

- [ ] **Step 2:** In `docs/design-system.md`, add the two tokens to the core colors table, and append a short "## Youth band grammar (2026-08-18)" section covering: full-bleed color-blocked bands; serif headers with `text-brand-red` tinted closing phrase; kicker rules retired on youth surfaces; the primitive inventory (jump bar, feature band, statement cards, pull-quote coach, booking cards, pricing cards) with file paths; accent roles (emerald = youth signature, brand-red = youth hot CTA, royal = structure). Keep under 40 lines.
- [ ] **Step 3:** `npx tsc --noEmit 2>&1 | grep -v pdf-lib` → no output. Commit: `feat(design): brand-red + royal tokens, youth band grammar canon`.

---

### Task 2: Band primitives (static four)

**Files:**
- Create: `src/components/youth/bands/section-jump-bar.astro`
- Create: `src/components/youth/bands/feature-band.astro`
- Create: `src/components/youth/bands/statement-cards.astro`
- Create: `src/components/youth/bands/pricing-cards.astro`

**Interfaces (Produces — consumed by Tasks 4–6):**
- `SectionJumpBar` props: `{ items: { href: string; label: string }[] }`. Sticky top-0 z-50 `bg-royal` band; mono uppercase pill links; inline `<script>` uses IntersectionObserver on the anchor targets to set the active pill (`bg-cream text-royal`). Follows the mockup's `.jump` styling.
- `FeatureBand` props: `{ tone: "royal" | "emerald" | "red" | "amber" | "navy"; id?: string; photoLabel?: string; title: string; kicker?: string; hook?: string; body: string; cta?: { href: string; label: string }; flip?: boolean }`. Full-bleed band, photo-slot third (gradient placeholder from tone via color-mix with navy-deep, mono `photoLabel` centered), text block per mockup `.srow`; `amber` tone uses ink text (contrast). `flip` mirrors the columns.
- `StatementCards` props: `{ cards: { label: string; statement: string; body: string }[] }` — tone rotation royal→emerald→brand-red per mockup `.fact`.
- `PricingCards` props: `{ cards: { label: string; amount: string; unit?: string; body: string; hot?: boolean }[]; note?: string }` per mockup `.pcard`.

- [ ] **Step 1:** Implement all four, translating mockup CSS to Tailwind + tokens (no inline oklch; gradients via `color-mix(in oklch, var(--x), var(--navy-deep) N%)`).
- [ ] **Step 2:** Verification: temporarily render all four on a scratch route? NO — Task 4 is the first consumer; here verify with `npx tsc --noEmit` and `npx astro check --minimumSeverity error 2>&1 | tail -3` (from worktree; ignore pre-existing errors not in `src/components/youth/bands/`).
- [ ] **Step 3:** Commit: `feat(youth): band primitives — jump bar, feature band, statement cards, pricing cards`.

---

### Task 3: Coach pull-quote + booking-card variant

**Files:**
- Modify: `src/components/youth/youth-coach-section.astro` (rework to pull-quote feature per mockup `.coach`; circular 180px placeholder portrait; method rendered as attributed prose — NOT in quotation marks — with `<em class="text-brand-red">` emphasis; credential chips from `COACH.credits`; tie line "Your kid's coach — whichever step of the pathway they're on — trains under him.")
- Modify: `src/components/landing/category-finder.tsx` + the card component it renders (follow the import chain; likely `program-card-v2.tsx`): add opt-in prop `cardVariant?: "default" | "youth-band"` threaded from CategoryFinder. `"youth-band"` renders the mockup `.bcard` treatment (colored level band header w/ spots pill, meta rows, price + `bg-brand-red` Book CTA). Default MUST remain byte-identical for existing consumers.

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: `<YouthCoachSection>` (same import path, new rendering); `CategoryFinder` accepting `cardVariant="youth-band"` (Task 4 consumer). Existing CategoryFinder call sites (adult + youth pages) pass nothing and render unchanged.

- [ ] **Step 1:** Implement both. For the finder card, derive the band color by pathway-step match on the season's age range if trivially available, else rotate emerald→royal→navy by index (mockup behavior).
- [ ] **Step 2:** Verify adult unchanged: `curl -s http://localhost:4455/adult/leagues | grep -c "REGISTER"` unchanged vs before (capture before/after), and visually via diff of rendered HTML for one adult page (`curl … | shasum` before/after the change must match for /adult/tournaments which uses CategoryFinder).
- [ ] **Step 3:** `npx tsc --noEmit` clean → commit: `feat(youth): coach pull-quote + opt-in youth booking-card variant`.

---

### Task 4: /youth/classes v2 page

**Files:**
- Rewrite: `src/pages/youth/classes.astro` composing: hero (graded photo, subhead with `<b>` ages, `bg-brand-red` CTA + ghost philosophy CTA) → `SectionJumpBar` → pathway cards section (per mockup `.lvl`: navy cards, tone-gradient photo slots, title then `.ages` "years old" line, hook, blurb, anchor CTA `#step-<slug>`) → philosophy band (navy-deep, four `.step` numbered cards, CTA `/youth/philosophy`) → `StatementCards` (Group/Coaching/Feedback) → `YouthCoachSection` → `PricingCards` (today's true model; "from $" live via a small client island reusing `fetchPublicCatalogSeasons` + `minIndividualPrice` scoped audience=youth types=training,clinic — or omit live figure if helpers don't fit cleanly; never hardcode) → book-band + `CategoryFinder client:load cardVariant="youth-band"` with the red overlap header → FAQ (`LandingFaq`, SIX items incl. "Where are classes held?" naming venue + communities and "What days do classes run?") → five `FeatureBand` step bands (copy from mockup, ids `step-micros`…`step-select`) → two cross-promo `FeatureBand`s (leagues per mockup; camps with GENERALIZED copy: kicker "Also at Aspire", title "Camps, all year long.", body "Day camps on school breaks, plus specialty camps through the year — coached rather than supervised, by the same people they see all year.") → close band (navy-deep, red CTA back to `#open`).
- Modify: `src/lib/youth/landing-content.ts`: PATHWAY ages → "18 months – 3 years old" forms; Select blurb → "Small invitation-only groups for players who are ready for more, under our most senior coaches."; add per-step `hook` strings (mockup values) and step long-copy (the step-band paragraphs) as `PATHWAY_DETAILS` or fields on PATHWAY.
- Meta: title "Youth Soccer Classes in Columbus & Worthington — Aspire Sports"? NO — classes are sport-agnostic; use "Youth Sports Classes in Columbus & Worthington, Ohio — Aspire Sports" and description with ages + communities.

**Interfaces:** Consumes everything above. h1 becomes "Their first coach is the one that counts." — update any e2e expecting the old h1 (Task 6 owns spec edits; note here).

- [ ] **Step 1:** Implement; all copy verbatim from the committed mockup except the camps promo + coach non-quote adjustments defined above.
- [ ] **Step 2:** Verify: `curl -s http://localhost:4455/youth/classes | grep -c "one that counts"` = 1; grep for banned strings on the rendered page: `weeknight` (0 in body), `takes himself` (0), `school-break` (0), `years old` (≥5); anchors `id="step-micros"`…`select` all present.
- [ ] **Step 3:** Commit: `feat(youth): classes page v2 — band system, on-page booking, philosophy + step bands`.

---

### Task 5: Philosophy stub + prod copy fixes across youth surfaces

**Files:**
- Create: `src/pages/youth/philosophy.astro` — v1: BaseLayout, hero-less editorial page: h1 "How we develop players.", the four-step system as prose sections, coach attribution block, CTA back to `/youth/classes`. SSR, canonical, meta. Sitemap: add `/youth/philosophy` to `ASPIRE_SSR_PUBLIC_PAGES`.
- Modify: `src/lib/youth/sport-pages.ts`: soccer intro sentence "It's all indoors in central Ohio, so the season your kid falls in love with the game doesn't end in November." → "It's all in central Ohio, and the season your kid falls in love with the game doesn't end in November."; soccer FAQ "Is it indoors in the winter?" answer → "Winter is a real season here — training runs all year, and every class and league card shows exactly where it meets."
- Modify: `src/components/youth/youth-sport-page.astro`: tiles meta "Weeknight training, five steps" → "Small-group training, five steps"; classes lede "Weeknight training in small groups — one pathway…" → "Training in small groups — one pathway that starts with your toddler on the floor beside you and runs to an invitation-only group."
- Modify: `src/pages/youth/camps.astro`: meta description → "Youth sports camps in central Ohio — day camps on school breaks, plus specialty camps through the year. Coached rather than supervised."; `CAMPS.lede` (landing-content) → "Day camps for when school is out, and specialty camps through the year — full days coached rather than supervised, with the same people they see every week."
- Modify: hub `src/pages/youth.astro` camps faq/copy if it carries school-break-only phrasing (grep and fix).

- [ ] **Step 1:** Implement all; grep the rendered pages for `weeknight|takes himself|Worthington and central Ohio` regressions.
- [ ] **Step 2:** `curl -s http://localhost:4455/youth/philosophy | grep -c "develop players"` ≥1; sitemap grep includes `/youth/philosophy`.
- [ ] **Step 3:** Commit: `feat(youth): philosophy page v1 + copy de-commitments (days, venue, DoC, camps)`.

---

### Task 6: E2E updates + full verification

**Files:**
- Modify: `tests/e2e/*.spec.ts` — grep for specs asserting classes-page content (old h1 "Training, one step at a time", "The pathway." heading) and sport-page copy changed in Task 5; update assertions. Add a classes-v2 test: h1, jump bar links, `#step-micros` visible, booking section present, philosophy link href.

- [ ] **Step 1:** Update/add specs; run `PLAYWRIGHT_BASE_URL=http://localhost:4455 npm test -- landing-pages youth` (matching youth specs) — all green.
- [ ] **Step 2:** `npx tsc --noEmit` clean; `./scripts/with-bws.sh npm run build 2>&1 | tail -3` clean; adult-unchanged check from Task 3 re-verified on final HEAD.
- [ ] **Step 3:** Commit: `test(e2e): classes v2 + copy-fix coverage`.
- [ ] **Step 4: STOP — owner browser gate.** Screenshots of /youth/classes (full scroll), /youth/philosophy, one sport page, /adult/leagues (unchanged proof). No push until approval.
