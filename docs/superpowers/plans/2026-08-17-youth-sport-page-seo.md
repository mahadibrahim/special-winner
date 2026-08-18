# Youth Sport-Page SEO (Approach A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/youth/soccer` and `/youth/futsal` the crawlable, customer-forward substance that matches real search queries, with the hub staying a tight router.

**Architecture:** Content lives in the `YOUTH_SPORT_PAGES` registry (`src/lib/youth/sport-pages.ts`) and `src/lib/youth/landing-content.ts`; `youth-sport-page.astro` renders it. No new components — `LandingFaq` is reused. Sitemap entries come from the static `ASPIRE_SSR_PUBLIC_PAGES` list.

**Tech Stack:** Astro 5 (SSR pages), React (LandingFaq island), Tailwind 4, Playwright (e2e), TypeScript.

## Global Constraints

- **Voice (spec §Voice):** second person, kid-centered ("your kid", "you"); outcomes over inventory; no superlatives; Aspire is the answer, never the subject.
- **Copy bans (owner-standing):** no format claims (roster/court/ball/game-length; for futsal, no claims about how it differs from soccer in court/ball/roster); no oppositional language; facility is not a selling point; no eyebrow text; roman headings; hub copy carries NO location words (Columbus/central Ohio allowed on sport pages only).
- **No FAQPage JSON-LD anywhere** — owned by the `feat/seo-content-phase-a` branch.
- **Dev server:** already running with HMR at `http://localhost:4455` (started via `./scripts/with-bws.sh npx astro dev --port 4455`). Do not start a second one.
- **Worktree:** all paths relative to `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/fix-meta-autofill-noise`. Branch: `youth-hub-v3`.
- **Final gate:** after the last task, the owner reviews the rendered pages in the browser BEFORE any push/PR. Local commits per task are fine.

---

### Task 0: Checkpoint the approved sport-first redesign

The working tree holds the owner-approved sport-first redesign (hub v3, sport pages, nav, e2e spec), uncommitted. Commit it as-is so this plan's work diffs cleanly against it.

**Files:**
- Modify: none (commit only)

**Interfaces:**
- Consumes: current working tree state.
- Produces: a clean baseline commit all later tasks diff against.

- [ ] **Step 1: Verify the tree contains only the redesign changes**

Run: `git status --short`
Expected: modified/created files limited to: `src/styles/globals.css`, `src/lib/youth/landing-content.ts`, `src/lib/youth/sport-pages.ts`, `src/lib/programs/season-facts.ts`, `src/components/landing/tile-facts-line.tsx`, `src/components/marketing/benefit-trio.tsx`, `src/components/marketing/dual-cta-hero.tsx`, `src/components/navigation.tsx`, `src/components/youth/youth-sport-page.astro`, `src/components/youth/youth-sport-league-page.astro`, `src/pages/youth.astro`, `src/pages/youth/[sport].astro`, `src/pages/youth/camps.astro`, `src/pages/youth/classes.astro`, `docs/design-system.md`, `tests/e2e/landing-pages.spec.ts`. (`.hallmark/` stays untracked; do NOT add it.)

- [ ] **Step 2: Commit**

```bash
git add src docs/design-system.md tests/e2e/landing-pages.spec.ts
git commit -m "feat(youth): sport-first youth funnel — hub sport tiles, /youth/[sport] pages, emerald tokens

Hub leads with sport tiles (live facts client-side), sport landing pages
hold leagues/classes/camps + DoC, emerald becomes a real token family.
Owner-approved rendered state; SEO content pass follows."
```

- [ ] **Step 3: Verify clean tree**

Run: `git status --short`
Expected: only untracked `.hallmark/` remains.

---

### Task 1: Registry gains intro + FAQ content (soccer, futsal)

**Files:**
- Modify: `src/lib/youth/sport-pages.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `YouthSportPage.intro: string[]` (paragraphs) and `YouthSportPage.faqs: SportFaq[]` where `interface SportFaq { question: string; answer: string; linkHref?: string; linkLabel?: string }` — Task 2 renders both; the `SportFaq` shape must stay assignable to `LandingFaqItem`.

- [ ] **Step 1: Add the types and content**

In `src/lib/youth/sport-pages.ts`, add at the top:

```ts
import { PRICING } from "@/lib/youth/landing-content";
```

and above `YouthSportPage`:

```ts
/** Shape-compatible with LandingFaqItem (landing-faq.tsx) — typed locally so
 *  lib code doesn't import component types. */
export interface SportFaq {
  question: string;
  answer: string;
  linkHref?: string;
  linkLabel?: string;
}
```

Extend the `YouthSportPage` interface:

```ts
  /** Editorial intro paragraphs under the hero — customer-forward voice,
   *  location words allowed here (sport pages only). */
  intro: string[];
  /** Sport-specific FAQs. True answers only. */
  faqs: SportFaq[];
```

Add to the `soccer` entry (intro is the owner-approved sample, verbatim):

```ts
    intro: [
      "Your kid wants to play soccer — or you want them to try it. Either way, there's a place for them here: leagues by age group from U6 to U19, weeknight classes that start at 18 months with you on the floor beside them, and camps that cover school breaks. It's all indoors in central Ohio, so the season your kid falls in love with the game doesn't end in November.",
      "Every coach they'll have trains under our Director of Coaching, so Tuesday's session means the same thing as Thursday's. Start with what's open above, or find their age group and go from there.",
    ],
    faqs: [
      {
        question: "What age can my kid start?",
        answer:
          "At 18 months, in Aspire Micros — you're on the floor with them. From age 3 they train without you, and leagues start at U6.",
      },
      {
        question: "Is it indoors in the winter?",
        answer:
          "Yes. Everything runs indoors, so winter is a real season for your kid, not a pause.",
      },
      {
        question: "Does my kid need experience — or a team?",
        answer:
          "No. Developmental leagues take individual players — we build the teams — and classes meet your kid where they are, from their first touch.",
      },
      {
        // PRICING.body verbatim so the figures can never drift (spec §3).
        question: "What does it cost?",
        answer: PRICING.body,
      },
    ],
```

Add to the `futsal` entry (NO claims about court/ball/roster or how futsal differs from soccer in format):

```ts
    intro: [
      "If your kid already plays soccer, futsal is more of what they love — the same game's skills, coached by the same staff on the same curriculum. If they're new, it's a friendly way in: small groups, and coaches who explain while the game is happening.",
      "Leagues run by age group, indoors in central Ohio. Find your kid's group and see what's open for the 2026–27 season.",
    ],
    faqs: [
      {
        question: "Is futsal right for a kid who plays soccer?",
        answer:
          "Yes — the same staff coach both, on the same curriculum, and many soccer families add futsal to keep their kid playing between seasons.",
      },
      {
        question: "What age groups do you run?",
        answer:
          "Leagues run by age group. The futsal age-group page shows what's open for the 2026–27 season.",
        linkHref: "/youth/leagues/futsal",
        linkLabel: "See futsal age groups",
      },
      {
        question: "Does my kid need a team?",
        answer:
          "No. Developmental leagues take individual players — we build the teams around them.",
      },
      {
        // PRICING.body verbatim so the figures can never drift (spec §3).
        question: "What does it cost?",
        answer: PRICING.body,
      },
    ],
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -v pdf-lib`
Expected: no output (the three `pdf-lib` errors in `scripts/` are a pre-existing environment artifact — ignore them).

- [ ] **Step 3: Commit**

```bash
git add src/lib/youth/sport-pages.ts
git commit -m "feat(youth): sport-page intro + FAQ content in registry — customer-forward voice"
```

---

### Task 2: Sport page renders intro + FAQs

**Files:**
- Modify: `src/components/youth/youth-sport-page.astro`

**Interfaces:**
- Consumes: `sport.intro: string[]`, `sport.faqs: SportFaq[]` from Task 1; existing `LandingFaq` component (`@/components/landing/landing-faq.tsx`, props `{ id, heading, items }`, needs `client:visible`).
- Produces: rendered `<section aria-labelledby="youth-<slug>-intro-h">` prose block and a `LandingFaq` with `id={`${sport.slug}-faq`}`.

- [ ] **Step 1: Add the intro block**

In `youth-sport-page.astro`, add the `LandingFaq` import to the frontmatter:

```ts
import LandingFaq from "@/components/landing/landing-faq.tsx";
```

Directly after the closing `</section>` of the hero, insert:

```astro
  {/* ---------- Editorial intro — the crawlable substance ------------------ */}
  <section class="px-6 sm:px-9 py-10 border-b border-border" aria-label={`About youth ${sport.name.toLowerCase()}`}>
    <div class="max-w-[1080px] mx-auto">
      <div class="max-w-[640px] space-y-4">
        {sport.intro.map((p) => (
          <p class="text-[15px] text-ink-2 leading-relaxed">{p}</p>
        ))}
      </div>
    </div>
  </section>
```

- [ ] **Step 2: Add the FAQ band above the coach section**

Directly before the `{sport.hasCoach && ...}` line, insert:

```astro
  {/* ---------- Sport FAQs — no JSON-LD (owned by the SEO branch) ---------- */}
  <LandingFaq
    client:visible
    id={`${sport.slug}-faq`}
    heading={`Youth ${sport.name.toLowerCase()} FAQs`}
    items={sport.faqs}
  />
```

- [ ] **Step 3: Verify rendered output**

Run: `curl -s http://localhost:4455/youth/soccer | grep -c "falls in love with the game"; curl -s http://localhost:4455/youth/futsal | grep -c "more of what they love"`
Expected: `1` and `1`. (FAQ content is client-hydrated; verify presence of the island container instead: `curl -s http://localhost:4455/youth/soccer | grep -c 'soccer-faq'` → at least `1`.)

- [ ] **Step 4: Commit**

```bash
git add src/components/youth/youth-sport-page.astro
git commit -m "feat(youth): render editorial intro + sport FAQs on sport pages"
```

---

### Task 3: Age-anchor sections on the pathway cards

**Files:**
- Modify: `src/components/youth/youth-sport-page.astro`

**Interfaces:**
- Consumes: `PATHWAY` from `@/lib/youth/landing-content` (already imported; steps carry `name`, `ages`, `blurb`).
- Produces: stable anchor ids `#micros`, `#minis`, `#juniors`, `#academy`, `#select` on the pathway cards of every sport page.

- [ ] **Step 1: Derive the slug and add ids**

In `youth-sport-page.astro`'s frontmatter add:

```ts
// "Aspire Micros" -> "micros" — stable anchor for age-query landings
// (/youth/soccer#micros). Renaming a pathway step changes the anchor;
// the naming decision doc owns renames.
const stepSlug = (name: string) => name.replace(/^Aspire /, "").toLowerCase();
```

Change the pathway card loop from:

```astro
        {PATHWAY.map((s) => (
          <div class="rounded-xl border border-border bg-paper p-4">
```

to:

```astro
        {PATHWAY.map((s) => (
          <div id={stepSlug(s.name)} class="rounded-xl border border-border bg-paper p-4 scroll-mt-28">
```

(The cards already render `s.blurb` — the customer-forward sentence required by the spec is already on screen; no copy change needed.)

- [ ] **Step 2: Verify anchors render**

Run: `curl -s http://localhost:4455/youth/soccer | grep -o 'id="micros"\|id="minis"\|id="juniors"\|id="academy"\|id="select"' | sort -u | wc -l`
Expected: `5`

- [ ] **Step 3: Commit**

```bash
git add src/components/youth/youth-sport-page.astro
git commit -m "feat(youth): age anchors (#micros…#select) on sport-page pathway cards"
```

---

### Task 4: Hub crawlable intro

**Files:**
- Modify: `src/lib/youth/landing-content.ts`
- Modify: `src/pages/youth.astro`

**Interfaces:**
- Consumes: nothing new.
- Produces: `INTRO: string` export in `landing-content.ts`, rendered on `/youth` between hero and trio. NO location words (hub rule).

- [ ] **Step 1: Add the copy**

In `src/lib/youth/landing-content.ts`, directly after the `HERO` export:

```ts
/** Hub crawlable intro — the only prose block on the hub (tiles and
 *  accordions carry little indexable text). Customer-forward; NO location
 *  words on the hub (owner rule). */
export const INTRO =
  "Whatever sport your kid picks, they get the same three things here: a coach who explains while the game is happening, a small group where they're never waiting for a turn, and one pathway that runs from their first steps at 18 months to competitive play at nineteen — so they never have to start over.";
```

- [ ] **Step 2: Render it on the hub**

In `src/pages/youth.astro`, add `INTRO` to the existing `landing-content` import list, then directly before the `<BenefitTrio benefits={BENEFITS} />` line insert:

```astro
    {/* ---------- Crawlable intro — the hub's one prose block --------------- */}
    <section class="px-6 sm:px-9 py-10 border-b border-border" aria-label="About Aspire youth sports">
      <div class="max-w-[1080px] mx-auto">
        <p class="max-w-[640px] text-[15px] text-ink-2 leading-relaxed">{INTRO}</p>
      </div>
    </section>
```

- [ ] **Step 3: Verify — renders, and hub still carries no location words**

Run: `curl -s http://localhost:4455/youth | grep -c "never have to start over"; curl -s http://localhost:4455/youth | grep -io "worthington\|columbus\|central ohio" | grep -iv "central ohio, for" | head`
Expected: first command `1`. Second command: the only match should come from the meta description (`central Ohio, for 18 months`) and the shared footer — no location words in the new body copy.

- [ ] **Step 4: Commit**

```bash
git add src/lib/youth/landing-content.ts src/pages/youth.astro
git commit -m "feat(youth): crawlable customer-forward intro on the hub"
```

---

### Task 5: Sitemap entries

**Files:**
- Modify: `src/lib/seo/aspire-sitemap-pages.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `/youth/soccer`, `/youth/futsal`, `/youth/classes` in `ASPIRE_SSR_PUBLIC_PAGES` (consumed by `astro.config.mjs` and `src/pages/sitemap.xml.ts`).

- [ ] **Step 1: Add the routes**

In `src/lib/seo/aspire-sitemap-pages.mjs`, change:

```js
  "/youth",
  "/youth/leagues",
  "/youth/camps",
```

to:

```js
  "/youth",
  // Sport landing pages — registry-driven (src/lib/youth/sport-pages.ts);
  // keep in sync when a sport launches.
  "/youth/soccer",
  "/youth/futsal",
  "/youth/leagues",
  "/youth/classes",
  "/youth/camps",
```

(`/youth/classes` was missing before this change — pre-existing gap, fixed here.)

- [ ] **Step 2: Verify the served sitemap**

Run: `curl -s http://localhost:4455/sitemap.xml | grep -o "/youth/[a-z]*" | sort -u`
Expected output includes: `/youth/camps`, `/youth/classes`, `/youth/futsal`, `/youth/leagues`, `/youth/soccer`.

- [ ] **Step 3: Verify canonicals on the new routes**

Run: `curl -s http://localhost:4455/youth/soccer | grep -o 'rel="canonical" href="[^"]*"'`
Expected: `rel="canonical" href="http://localhost:4455/youth/soccer"`

- [ ] **Step 4: Commit**

```bash
git add src/lib/seo/aspire-sitemap-pages.mjs
git commit -m "seo(youth): sitemap entries for sport pages + missing /youth/classes"
```

---

### Task 6: Voice retrofit of session copy

One wording pass over copy added earlier this session. Apply exactly these edits — each is judged against the voice rules; structure untouched.

**Files:**
- Modify: `src/lib/youth/landing-content.ts`
- Modify: `src/components/youth/youth-sport-page.astro`

**Interfaces:**
- Consumes: existing exports (`BENEFITS`, hub `faqs` live in `src/pages/youth.astro` — one edit there via landing-content only; see below).
- Produces: same export names, adjusted strings.

- [ ] **Step 1: Apply the retrofit edits**

In `src/lib/youth/landing-content.ts`, `BENEFITS[1].body` — drop the résumé tone, keep the proof:

Before:
```
"Every coach trains under our Director of Coaching — seven seasons a professional — and talks players through the game while it is happening."
```
After:
```
"Your kid's coach trains under our Director of Coaching — seven seasons a professional — and explains the game while it is happening, not just at half time."
```

In `src/components/youth/youth-sport-page.astro`, the Classes section lede — center the parent:

Before:
```
Weeknight training in small groups — one pathway from a toddler on the floor beside you to an invitation-only group.
```
After:
```
Weeknight training in small groups — one pathway that starts with your toddler on the floor beside you and runs to an invitation-only group.
```

- [ ] **Step 2: Voice check the remaining session copy (read-only)**

Re-read against the voice rules, changing nothing unless a rule is violated: hub subhead ("Pick your kid's sport — …"), tile metas, hub FAQ answers (in `src/pages/youth.astro`), close band copy. These already pass (second person, outcome-led); this step exists so the pass is deliberate, not skipped.

- [ ] **Step 3: Verify + commit**

Run: `curl -s http://localhost:4455/youth | grep -c "not just at half time"`
Expected: `1`

```bash
git add src/lib/youth/landing-content.ts src/components/youth/youth-sport-page.astro
git commit -m "copy(youth): customer-forward voice retrofit"
```

---

### Task 7: E2E coverage for the sport pages

**Files:**
- Modify: `tests/e2e/landing-pages.spec.ts`

**Interfaces:**
- Consumes: rendered pages from Tasks 2–4; existing test idioms in the file (`waitUntil: "domcontentloaded"`).
- Produces: a `"/youth/soccer — sport page"` test. NOTE: this spec gates post-merge only (`test-full`), so it must also be run locally here.

- [ ] **Step 1: Add the test**

After the `"/youth — hub: hero + sport tiles"` test, insert:

```ts
  test("/youth/soccer — sport page: hero, intro, anchors, FAQs", async ({ page }) => {
    await page.goto("/youth/soccer", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: /youth soccer/i }),
    ).toBeVisible();
    // Editorial intro (sport-pages.ts intro[0]) — update together.
    await expect(page.getByText(/falls in love with the game/i)).toBeVisible();
    // Age anchors are the landing targets for age queries.
    for (const anchor of ["micros", "minis", "juniors", "academy", "select"]) {
      await expect(page.locator(`#${anchor}`)).toBeVisible();
    }
    // Offering tiles route into the funnel.
    await page.locator('[data-landing-cta="youth-soccer-leagues"]').click();
    await expect(page).toHaveURL(/\/youth\/leagues\/soccer$/);
  });
```

- [ ] **Step 2: Run the spec locally**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4455 npm test -- landing-pages`
Expected: all landing-pages tests pass, including the new one and the updated hub test.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/landing-pages.spec.ts
git commit -m "test(e2e): sport-page coverage — hero, intro, age anchors, tile routing"
```

---

### Task 8: Full verification + owner gate

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything above.
- Produces: evidence for the owner's browser review. NO push/PR until the owner approves the rendered pages.

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -v pdf-lib`
Expected: no output.

- [ ] **Step 2: Production build**

Run: `npm run build 2>&1 | tail -5`
Expected: build succeeds (Astro `Astro.request.headers` warnings on prerendered pages are known noise — ignore).

- [ ] **Step 3: Word-count the crawlable substance (spec success criterion)**

Run: `curl -s http://localhost:4455/youth/soccer | python3 -c "import sys,re,html; t=re.sub(r'<[^>]+>',' ',sys.stdin.read()); print(len(html.unescape(t).split()))"`
Expected: comfortably above the spec's ≥200 indexable words (the whole page text will be far higher; the intro + FAQ + blurbs alone exceed 200).

- [ ] **Step 4: STOP — owner review**

Report completion with screenshots of `/youth`, `/youth/soccer`, `/youth/futsal` and wait for the owner's approval of the rendered pages before any push or PR. Do not proceed past this step autonomously.
