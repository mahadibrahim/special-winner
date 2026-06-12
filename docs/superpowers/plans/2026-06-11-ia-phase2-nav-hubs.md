# Public IA Redesign — Phase 2: Nav Dropdowns + Slim Hubs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewire the public nav around the Phase-1 category pages — audience dropdowns, `Sports` out of the nav — and slim `/adult` and `/youth` to one-screen hubs (hero + category doors), per the spec `docs/superpowers/specs/2026-06-11-public-ia-redesign-design.md` (Phase 2).

**Architecture:** `navigation.tsx` gets nested nav data (`children` on the Youth/Adult entries) rendered as CSS-only hover/focus dropdowns on desktop (work pre-hydration) and grouped link blocks in the mobile drawer. The hub pages drop their finder islands entirely — hero CTAs become real links to category pages, a door-card grid replaces the stacked sections, and a tiny hash-redirect script forwards legacy `#leagues`/`#ages-*` anchors to the category URLs. The now-orphaned `AdultFinder`/`YouthFinder`/`SectionNav` islands are deleted, with the shared `ApiSeason` type relocated from `adult-finder.tsx` to `src/lib/programs/` (fixing the lib→component layering inversion flagged in the Phase-1 final review).

**Tech Stack:** Astro 5 SSR pages, React 19 (nav only), Tailwind 4, Playwright.

**Out of scope (Phase 3):** home hero CTAs, `/sports` 301s (the `/sports` pages and footer sport links stay — only the nav entry goes), sitemap changes.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/programs/api-season.ts` | create | New home of the `ApiSeason` interface (lib no longer imports types from components). |
| `src/components/navigation.tsx` | modify | Nested navLinks + desktop CSS dropdowns + grouped mobile drawer; `Sports` entry removed. |
| `src/pages/adult.astro` | rewrite | One-screen hub: hero (CTAs → category links) + 3 door cards + hash-redirect script. |
| `src/pages/youth.astro` | rewrite | One-screen hub: parent-first hero (CTAs → category links) + 2 door cards + hash-redirect script. |
| `src/components/landing/adult-finder.tsx`, `youth-finder.tsx`, `section-nav.tsx` | delete | Orphaned by the hub rewrite. |
| `src/components/landing/seasons-finder-section.tsx`, `category-finder.tsx`, `src/lib/programs/category-pages.ts`, `tests/unit/category-pages.test.ts` | modify | Import `ApiSeason` from its new lib home. |
| `tests/e2e/landing-pages.spec.ts` | rewrite tests 1, 2, 4 | Hub structure + nav dropdown assertions replace jump-link/section assertions. |

Facts that bind every task (verified against main @ 37d46dd4):

- `navLinks` lives at `src/components/navigation.tsx:90-97`; desktop render at 126-139; mobile drawer maps the same array (~line 240s) as flat rows. The only existing DropdownMenu usage is the avatar account menu — leave it alone.
- No cross-page hash links exist anywhere in src (`/adult#…` / `/youth#…` grep is empty) — the hash-redirect script is purely for external bookmarks.
- `Testimonials` renders nothing today (empty quotes array) and `WhyAspire`/`FAQSection` both already render on the homepage — cutting all three from the hubs loses nothing (spec: "bias to cutting").
- Hubs will have NO React island after the rewrite, so hub e2e tests must NOT call `waitForHydration` (the beacon never fires); door links are plain `<a>` navigations. The desktop dropdown must be CSS-only (`group-hover`/`focus-within`) so it works pre-hydration too.
- `ApiSeason` importers today: `seasons-finder-section.tsx`, `youth-finder.tsx`, `category-finder.tsx`, `src/lib/programs/category-pages.ts`, `tests/unit/category-pages.test.ts` (plus definition in `adult-finder.tsx`).
- Keep `data-landing-cta` analytics: hub hero CTAs keep firing `landing_hero_cta_click` (the inline script stays; the smooth-scroll handler goes — no in-page anchors remain).

---

### Task 1: Branch setup

- [ ] **Step 1: Confirm no open PR holds the current branch, then branch from main**

```bash
git -C /Users/mahadibrahim/Documents/Aspire-Sports/web-app branch --show-current
gh pr list --head feat/ia-category-pages --state open   # expect empty (PR #171 merged)
git fetch origin
git switch -c feat/ia-phase2-nav origin/main
```

- [ ] **Step 2: Commit this plan**

```bash
git add docs/superpowers/plans/2026-06-11-ia-phase2-nav-hubs.md
git commit -m "docs: phase 2 plan — nav dropdowns + slim hubs"
```

### Task 2: Relocate `ApiSeason` to lib

**Files:**
- Create: `src/lib/programs/api-season.ts`
- Modify: `src/components/landing/adult-finder.tsx` (re-export for back-compat until Task 4 deletes it)
- Modify: `src/components/landing/seasons-finder-section.tsx`, `src/components/landing/category-finder.tsx`, `src/components/landing/youth-finder.tsx`, `src/lib/programs/category-pages.ts`, `tests/unit/category-pages.test.ts` (import path only)

- [ ] **Step 1: Create the lib type module**

Move the `ApiSeason` interface body VERBATIM from `adult-finder.tsx` (lines ~23-49) into:

```typescript
// src/lib/programs/api-season.ts
import type { SeasonForDerive } from "@/lib/programs/derive"

/** Shape of a season row from `/api/public/seasons`. Structurally satisfies
 *  both `SeasonForDerive` and `ProgramCardV2`'s `Season` prop. */
export interface ApiSeason extends SeasonForDerive {
  id: string
  name: string
  slug: string
  startDate: string
  endDate: string
  price: number
  teamPrice: number | null
  scheduleNotes: string | null
  registeredCount: number
  maxParticipants: number | null
  pricingMode: string
  signupModes?: string[]
  registrationCloses?: string | null
  program: {
    id: string
    name: string
    slug: string
    programType: string
    audienceType: string
  }
  sport: { id: string; name: string; slug: string; icon: string | null; color: string | null }
  location: { id: string; name: string; slug: string; city: string | null; state: string | null }
  ageGroup: { id: string; name: string; minAge: number; maxAge: number } | null
}
```

(Copy the CURRENT interface from adult-finder.tsx, not this block, if they differ — the file on disk is the source of truth.)

- [ ] **Step 2: Re-export from adult-finder, flip all other importers**

In `adult-finder.tsx`: delete the interface, add `import type { ApiSeason } from "@/lib/programs/api-season"` and `export type { ApiSeason }` (keeps any unflipped importer working until Task 4 deletes the file). In the five other files, change `from "./adult-finder"` / `from "@/components/landing/adult-finder"` to `from "@/lib/programs/api-season"` (type-only import).

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
npx vitest run tests/unit/
git add -u && git add src/lib/programs/api-season.ts
git commit -m "refactor(ia): move ApiSeason type to lib (layering fix)"
```

Expected: 0 type errors; 477/477 unit tests. (`git add -u` is safe here — only tracked files were modified; verify with `git status` first per repo rules.)

### Task 3: Nav dropdowns

**Files:**
- Modify: `src/components/navigation.tsx`
- Modify: `tests/e2e/landing-pages.spec.ts` (test 4 only)

- [ ] **Step 1: Restructure navLinks (navigation.tsx:90-97)**

```tsx
  const navLinks: Array<{ href: string; label: string; children?: Array<{ href: string; label: string }> }> = [
    {
      href: "/youth",
      label: "Youth",
      children: [
        { href: "/youth/leagues", label: "Leagues & Classes" },
        { href: "/youth/camps", label: "Camps" },
      ],
    },
    {
      href: "/adult",
      label: "Adult",
      children: [
        { href: "/adult/leagues", label: "Leagues" },
        { href: "/adult/pickup", label: "Pickup" },
        { href: "/adult/tournaments", label: "Tournaments" },
      ],
    },
    { href: "/locations", label: "Locations" },
    { href: "/shop", label: "Shop" },
    { href: "/about", label: "About" },
  ]
```

(`Sports` is intentionally gone — Phase 2 of the IA spec.)

- [ ] **Step 2: Desktop render — CSS-only dropdown (replace lines ~126-139)**

The label stays a real link to the hub; the panel opens on hover OR keyboard focus (`group-hover` + `group-focus-within`), so it works before React hydrates and for keyboard users. No state, no JS:

```tsx
          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <div key={link.href} className="relative group">
                <a
                  href={link.href}
                  className="relative flex items-center gap-1 px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
                >
                  {link.label}
                  {link.children && (
                    <ChevronDown
                      className="h-3 w-3 opacity-50 transition-transform group-hover:rotate-180"
                      aria-hidden="true"
                    />
                  )}
                  <span className="absolute bottom-1 left-4 right-4 h-[1.5px] bg-primary scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
                </a>
                {link.children && (
                  <div className="absolute left-0 top-full pt-1 hidden group-hover:block group-focus-within:block">
                    <div className="min-w-44 bg-cream border border-border rounded-xl shadow-lg py-2">
                      {link.children.map((child) => (
                        <a
                          key={child.href}
                          href={child.href}
                          className="block px-4 py-2 text-sm text-ink-muted hover:text-ink hover:bg-paper transition-colors"
                        >
                          {child.label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
```

Add `ChevronDown` to the existing `lucide-react` import. The `pt-1` bridge div prevents the hover gap from closing the panel. Verify the design tokens (`bg-cream`, `border-border`, `bg-paper`) against the file's existing usage before writing.

- [ ] **Step 3: Mobile drawer — grouped links**

In the drawer's `navLinks.map(...)` block, render parents as today (full-width row, closes sheet on click) and, when `link.children` exists, follow with the children as indented sub-rows (e.g. `pl-8`, smaller text, same border/close-on-click behavior). Keep the staggered `animationDelay` pattern by computing a flat running index across parents+children. No accordion state — all links visible (CLAUDE-spec: "mobile drawer flattens the dropdowns into grouped links").

- [ ] **Step 4: Update the nav e2e test**

In `tests/e2e/landing-pages.spec.ts`, replace the `"header nav exposes the six audience-led links"` test:

```typescript
  test("header nav — audience links with category dropdowns, no Sports", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const nav = page.locator("nav").first();

    for (const name of ["Youth", "Adult", "Locations", "Shop", "About"]) {
      await expect(nav.getByRole("link", { name, exact: true }).first()).toBeVisible();
    }
    await expect(nav.getByRole("link", { name: "Sports", exact: true })).toHaveCount(0);

    // CSS hover dropdown — works pre-hydration.
    await nav.getByRole("link", { name: "Adult", exact: true }).hover();
    await expect(nav.getByRole("link", { name: "Pickup" })).toBeVisible();
    await nav.getByRole("link", { name: "Pickup" }).click();
    await expect(page).toHaveURL(/\/adult\/pickup$/);
  });
```

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/landing-pages.spec.ts tests/e2e/category-pages.spec.ts
git add src/components/navigation.tsx tests/e2e/landing-pages.spec.ts
git commit -m "feat(ia): audience dropdowns in nav, Sports entry removed"
```

Expected: landing-pages tests 1-2 still pass (hubs unchanged so far), nav test passes with new shape, category-pages 6/6.

### Task 4: Slim the /adult hub

**Files:**
- Rewrite: `src/pages/adult.astro`
- Delete: `src/components/landing/adult-finder.tsx`
- Modify: `tests/e2e/landing-pages.spec.ts` (the `/adult` test)

- [ ] **Step 1: Rewrite adult.astro**

```astro
---
// One-screen hub: hero + category doors. Inventory lives on the category
// pages (/adult/leagues, /adult/pickup, /adult/tournaments) — Phase 2 of
// docs/superpowers/specs/2026-06-11-public-ia-redesign-design.md.
import BaseLayout from "@/layouts/BaseLayout.astro";

const doors = [
  {
    href: "/adult/leagues",
    cta: "adult-hub-leagues",
    title: "Leagues",
    blurb: "Season-long play. Sign up a full team or join as a free agent.",
  },
  {
    href: "/adult/pickup",
    cta: "adult-hub-pickup",
    title: "Pickup",
    blurb: "Show up and play — pay per session, no commitment.",
  },
  {
    href: "/adult/tournaments",
    cta: "adult-hub-tournaments",
    title: "Tournaments",
    blurb: "One-day brackets. Bring a team or get placed.",
  },
];
---

<BaseLayout
  title="Adult Sports Leagues — Aspire Sports"
  description="Adult sports leagues, pickup, and tournaments in central Ohio. Find a league, play pickup, or register for a tournament — Aspire Sports."
>
  <Fragment slot="head">
    <link rel="canonical" href={`${Astro.url.origin}/adult`} />
  </Fragment>

  <main id="main-content" class="flex-1">
    <section class="bg-gradient-to-br from-ink to-zinc-700 text-cream pt-28 pb-16">
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <p class="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary-orange mb-4">
          Adult Sports · Central Ohio
        </p>
        <h1
          class="font-display max-w-3xl"
          style="font-size: clamp(2.25rem, 6vw, 4.5rem); line-height: 1.05; letter-spacing: -0.03em;"
        >
          The league you'll build your week around.
        </h1>
        <p class="mt-6 text-lg text-cream/85 max-w-2xl">
          Fair refs, reliable communication, and a post-game scene worth staying
          for. Pick how you want to play.
        </p>
      </div>
    </section>

    <section class="py-12 lg:py-16">
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {doors.map((d) => (
          <a
            href={d.href}
            data-landing-cta={d.cta}
            class="group bg-paper border border-border rounded-2xl p-7 hover:border-ink-muted transition-colors"
          >
            <h2 class="font-display text-2xl text-ink">{d.title}</h2>
            <p class="text-ink-muted mt-2">{d.blurb}</p>
            <span class="inline-block mt-5 text-sm font-medium text-primary group-hover:translate-x-1 transition-transform">
              Browse {d.title.toLowerCase()} →
            </span>
          </a>
        ))}
      </div>
    </section>
  </main>
</BaseLayout>

<script>
  import { track } from "@/lib/analytics/track";

  // Legacy section anchors (pre-Phase-2 bookmarks) → category pages.
  const anchorMap: Record<string, string> = {
    leagues: "/adult/leagues",
    pickup: "/adult/pickup",
    tournaments: "/adult/tournaments",
  };
  const hash = location.hash.slice(1);
  if (anchorMap[hash]) location.replace(anchorMap[hash]);

  document.querySelectorAll<HTMLAnchorElement>("[data-landing-cta]").forEach((el) => {
    el.addEventListener("click", () => {
      track("landing_hero_cta_click", { cta: el.dataset.landingCta });
    });
  });
</script>
```

- [ ] **Step 2: Delete the orphaned island**

```bash
rm src/components/landing/adult-finder.tsx
grep -rn "adult-finder" src/ tests/ || echo "no remaining importers"
```

Expected: no remaining importers (Task 2 flipped them all to `@/lib/programs/api-season`).

- [ ] **Step 3: Update the /adult e2e test**

Replace the `"/adult — finder: hero, jump-links, three sections incl. pickup"` test:

```typescript
  test("/adult — hub: hero + three category doors", async ({ page }) => {
    await page.goto("/adult", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: /build your week around/i }),
    ).toBeVisible();
    for (const cta of ["adult-hub-leagues", "adult-hub-pickup", "adult-hub-tournaments"]) {
      await expect(page.locator(`[data-landing-cta="${cta}"]`)).toBeVisible();
    }

    // No React island on the hub — door links are plain <a> navigations.
    await page.locator('[data-landing-cta="adult-hub-pickup"]').click();
    await expect(page).toHaveURL(/\/adult\/pickup$/);

    // Legacy anchor bookmarks forward to category pages.
    await page.goto("/adult#leagues", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/adult\/leagues$/);
  });
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/landing-pages.spec.ts tests/e2e/category-pages.spec.ts
git add -A src/pages/adult.astro src/components/landing/adult-finder.tsx tests/e2e/landing-pages.spec.ts
git commit -m "feat(ia): /adult becomes a one-screen hub"
```

### Task 5: Slim the /youth hub

**Files:**
- Rewrite: `src/pages/youth.astro`
- Delete: `src/components/landing/youth-finder.tsx`, `src/components/landing/section-nav.tsx`
- Modify: `tests/e2e/landing-pages.spec.ts` (the `/youth` test)

- [ ] **Step 1: Rewrite youth.astro**

Same shape as Task 4's adult.astro with these differences (otherwise structurally identical — hero section, doors grid, analytics + hash-redirect script):

- Keep the CURRENT youth hero kicker/h1/copy (read the file — h1 matches `/look forward to/i`); replace only the jump-link CTA row with nothing (doors carry the CTAs).
- `doors` array (2 doors, `md:grid-cols-2` with `max-w-4xl mx-auto`):
  - `{ href: "/youth/leagues", cta: "youth-hub-leagues", title: "Leagues & Classes", blurb: "Season leagues and skill-building classes, filtered by your kid's age." }`
  - `{ href: "/youth/camps", cta: "youth-hub-camps", title: "Camps", blurb: "School-break and summer day camps — real coaching, tight logistics." }`
- Door headings: use `<h2>` as in adult.
- Hash-redirect map: `{ "ages-4-8": "/youth/leagues", "ages-9-12": "/youth/leagues", "ages-13-18": "/youth/leagues" }`.
- `WhyAspire`, `FAQSection`, `CTABanner`, `YouthFinder` imports and usages all removed (WhyAspire + FAQSection still live on the homepage; bias-to-cutting per spec).
- Title/description/canonical unchanged from the current file.

- [ ] **Step 2: Delete the orphaned islands**

```bash
rm src/components/landing/youth-finder.tsx src/components/landing/section-nav.tsx
grep -rn "youth-finder\|section-nav\|SectionNav" src/ tests/ || echo "no remaining importers"
```

If `section-nav` has any OTHER importer than the two deleted finders, STOP and report instead of deleting.

- [ ] **Step 3: Update the /youth e2e test**

Replace the `"/youth — age-led finder: hero, jump-links, three age sections"` test:

```typescript
  test("/youth — hub: hero + two category doors", async ({ page }) => {
    await page.goto("/youth", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: /look forward to/i }),
    ).toBeVisible();
    for (const cta of ["youth-hub-leagues", "youth-hub-camps"]) {
      await expect(page.locator(`[data-landing-cta="${cta}"]`)).toBeVisible();
    }

    await page.locator('[data-landing-cta="youth-hub-leagues"]').click();
    await expect(page).toHaveURL(/\/youth\/leagues$/);

    // Legacy age-band anchors forward to the leagues category page.
    await page.goto("/youth#ages-9-12", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/youth\/leagues$/);
  });
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
npx vitest run tests/unit/
PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/landing-pages.spec.ts tests/e2e/category-pages.spec.ts
git add -A src/pages/youth.astro src/components/landing/ tests/e2e/landing-pages.spec.ts
git commit -m "feat(ia): /youth becomes a one-screen hub"
```

### Task 6: Full verification + PR

- [ ] **Step 1: Pre-push checks**

```bash
npx tsc --noEmit                                   # 0 errors
npx vitest run tests/unit/                         # all pass
npm run build                                      # green (prerender warnings are known noise)
PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/landing-pages.spec.ts tests/e2e/category-pages.spec.ts tests/e2e/public-pages.spec.ts
git diff origin/main --stat -- src/lib/db/schema/  # empty — no migrations needed
```

(Local full API suite is known env-drifted — CI is the arbiter, per Phase 1 PR #171 precedent.)

- [ ] **Step 2: Push, PR, CI green**

```bash
git push -u origin feat/ia-phase2-nav
gh pr create --title "Public IA phase 2: nav dropdowns + one-screen hubs" --body "<summary per Phase-1 PR conventions, linking the spec; note Phase 3 remains>"
gh pr checks --watch
```

The task is not done until CI is green (Netlify PR check fails intentionally — expected).

---

## Self-review (done at plan time)

- **Spec coverage:** Phase 2 = slim hubs ✓ (hero + doors, one screen, trust content cut — it persists on the homepage), nav dropdowns ✓ (labels remain real links; CSS-only accelerator), Sports removed from nav ✓ (pages + footer links remain for Phase 3), anchor redirects ✓ (client-side, covers all six legacy anchors). Nothing from Phase 3 included.
- **Placeholder scan:** Task 5 Step 1 references the adult.astro template rather than repeating ~90 lines — acceptable because Task 4 lands first in the same branch and the differences are enumerated exhaustively. All other steps carry complete code.
- **Type consistency:** `ApiSeason` import path flips are enumerated per file; deletion order (re-export in Task 2 → delete in Tasks 4/5) keeps every intermediate commit type-clean.
- **Test consistency:** hub tests avoid `waitForHydration` (no island on hubs); nav dropdown test relies on CSS hover (pre-hydration safe); homepage CTA test (test 3) unaffected — `/youth` and `/adult` remain valid link targets.
