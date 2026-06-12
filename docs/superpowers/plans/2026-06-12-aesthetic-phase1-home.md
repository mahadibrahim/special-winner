# Aesthetic Evolution — Phase 1: Foundation + Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship spec slices 1–2 of `docs/superpowers/specs/2026-06-12-aesthetic-evolution-design.md`: the graded-image foundation plus the rebuilt home page (benefit-led hero with "For Kids"/"For Adults", benefit trio, deadline-sorted "Open now" strip, inline capture band).

**Architecture:** The brand grade is CSS-first (`.graded` utility + variants in globals.css) with a thin React `GradedImage` wrapper, so Astro pages and React islands share one mechanism and per-image removal is one class when real photography lands. The hero (`dual-cta-hero.tsx`) is rebuilt over a self-hosted graded stock photo, preserving its `mounted` stagger pattern and the e2e-pinned `data-landing-cta` attrs/hrefs. `HomepageProgramsPreview` becomes a single cross-audience strip sorted by `byRegistrationCloses` (existing lib helper) reusing `ProgramCardV2` with an audience-badge overlay — no third card system. `WhyAspire` and `StatsSection` (renders null today) are deleted in favor of a static `BenefitTrio`. A `CaptureBand` posts to the existing newsletter endpoint. Announcement card, blog teaser, hubs, `/programs` are later slices.

**Tech Stack:** Astro 5, React 19, Tailwind 4 (CSS-first utilities in globals.css), existing `/api/public/seasons` + `/api/public/newsletter`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `public/images/stock/*.jpg` | create (6 files) | Curated self-hosted stock (Unsplash, verified URLs below). |
| `docs/design-system.md` | modify (append) | Grade recipe, accent roles, benefit-trio + badge patterns, stock source table. |
| `src/styles/globals.css` | modify (append) | `.graded` / `.graded--emerald` utilities. |
| `src/components/ui/graded-image.tsx` | create | Thin React wrapper over the CSS pattern. |
| `src/components/marketing/dual-cta-hero.tsx` | rewrite | Graded photo hero, approved copy, For Kids / For Adults. |
| `src/components/marketing/benefit-trio.tsx` | create | Fun / development / fitness trio. |
| `src/components/marketing/capture-band.tsx` | create | Inline email capture → newsletter endpoint. |
| `src/components/homepage-programs-preview.tsx` | rewrite | "Open now" strip: deadline-sorted, cross-audience, badges, → `/programs`. |
| `src/components/why-aspire.tsx`, `src/components/stats-section.tsx` | delete | Superseded by BenefitTrio / dead (empty stats). Only index.astro imports them. |
| `src/pages/index.astro` | modify | New section order, new SEO meta, imports updated. |
| `tests/e2e/landing-pages.spec.ts` | modify (add 1 test) | Evolved-homepage assertions. |

Binding facts (verified):

- e2e contract to PRESERVE: `[data-landing-cta="homepage-hero-youth"]` → href `/youth/leagues`; `homepage-hero-adult` → `/adult/leagues` (landing-pages.spec.ts:51-59); `#programs` section visible with always-rendered heading (public-pages.spec.ts:62-67); h1 visible; footer visible.
- `byRegistrationCloses`, `deriveAudience` live in `@/lib/programs/category-pages` and `@/lib/programs/derive`; `ApiSeason` in `@/lib/programs/api-season`.
- `Testimonials` and `PartnersSection` auto-hide (empty arrays) — keep them in index.astro untouched.
- Newsletter endpoint accepts `{ email, audience?, source? }`, rate-limited 5/min/IP, upserts by email.
- Images: plain `<img>` against `public/images/` is the repo pattern (no astro:assets anywhere).

---

### Task 1: Branch + commit spec/plan

- [ ] **Step 1:**

```bash
git -C /Users/mahadibrahim/Documents/Aspire-Sports/web-app branch --show-current   # if a feature branch with an open PR, STOP and report
git fetch origin && git switch -c feat/aesthetic-home origin/main
git status --porcelain   # review BEFORE adding — never add stray untracked files
git add docs/superpowers/specs/2026-06-12-aesthetic-evolution-design.md docs/superpowers/plans/2026-06-12-aesthetic-phase1-home.md
git commit -m "docs: aesthetic evolution spec + phase 1 plan"
```

### Task 2: Stock set + design-system addendum

- [ ] **Step 1: Download the curated set** (URLs verified live 2026-06-12; Unsplash License — free use, no attribution required, no hotlinking concerns since we self-host):

```bash
mkdir -p public/images/stock
curl -sL -o public/images/stock/adult-match-night.jpg "https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=1920&q=75"
curl -sL -o public/images/stock/soccer-action.jpg     "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=1200&q=70"
curl -sL -o public/images/stock/five-aside-turf.jpg   "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=70"
curl -sL -o public/images/stock/pickup-game.jpg       "https://images.unsplash.com/photo-1551958219-acbc608c6377?w=1200&q=70"
curl -sL -o public/images/stock/youth-training.jpg    "https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=1200&q=70"
curl -sL -o public/images/stock/team-huddle.jpg       "https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=1200&q=70"
ls -la public/images/stock/   # every file > 30KB; if any is tiny, the download failed — investigate
file public/images/stock/*.jpg   # all JPEG
```

- [ ] **Step 2: Append to `docs/design-system.md`** (after the existing color section):

```markdown
---

## Graded imagery (2026-06-12 — aesthetic evolution)

Photography on public marketing surfaces never appears raw. Every image passes
through the brand grade so mismatched (stock) photography reads as one set:

- CSS: wrap in `.graded` (navy→orange duotone) or `.graded--emerald` (youth contexts).
- React: `<GradedImage src alt variant?="navy|emerald" />` from `@/components/ui/graded-image`.
- Recipe: `grayscale(1) contrast(1.08) brightness(.96)` on the img + a
  `linear-gradient(135deg, rgba(29,45,68,.78), rgba(232,78,27,.32))` multiply overlay.
- Removing the grade per-image (when real photography arrives) = drop the class.

### Accent roles (marketing surfaces)

orange = adult/primary CTA energy · emerald = youth · ochre = tertiary highlight ·
navy = neutral/pickup. The "single hot-spot" restraint still applies to app/dashboard
surfaces; marketing pages may run all three accents.

### Patterns

- **Benefit trio**: 3 columns, 3px colored border-top (orange/emerald/ochre), italic
  serif benefit headline, one supporting sentence. Replaces stat/proof boxes — leading
  with operational tablestakes (venues, refs, fees) is banned; those live in body copy.
- **Audience badge**: chip overlay on mixed-surface cards — orange "Adult",
  emerald "Youth", navy "Pickup".

### Stock sources (license traceability — Unsplash License, self-hosted)

| File | Source |
|---|---|
| adult-match-night.jpg | https://unsplash.com/photos/bc90951d0974 (photo-1517466787929-bc90951d0974) |
| soccer-action.jpg | photo-1431324155629-1a6deb1dec8d |
| five-aside-turf.jpg | photo-1574629810360-7efbbe195018 |
| pickup-game.jpg | photo-1551958219-acbc608c6377 |
| youth-training.jpg | photo-1606925797300-0b35e9d1794e |
| team-huddle.jpg | photo-1529900748604-07564a03e7a6 |
```

- [ ] **Step 3: Commit**

```bash
git add public/images/stock docs/design-system.md
git commit -m "feat(aesthetic): curated graded stock set + design-system addendum"
```

### Task 3: Grade utilities + GradedImage

- [ ] **Step 1: Append to `src/styles/globals.css`** (match the file's existing layer conventions — read how `.rule`/`.drop-cap` are declared and place these alongside):

```css
/* Brand grade — photography never appears raw on marketing surfaces.
   See docs/design-system.md "Graded imagery". */
.graded {
  position: relative;
  overflow: hidden;
}
.graded > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  filter: grayscale(1) contrast(1.08) brightness(0.96);
}
.graded::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(29, 45, 68, 0.78), rgba(232, 78, 27, 0.32));
  mix-blend-mode: multiply;
  pointer-events: none;
}
.graded--emerald::after {
  background: linear-gradient(135deg, rgba(14, 82, 60, 0.74), rgba(232, 78, 27, 0.28));
}
/* Content layered above the grade inside a .graded container */
.graded > .graded-content {
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 2: Create `src/components/ui/graded-image.tsx`**

```tsx
"use client"

/**
 * Brand-graded image. Thin wrapper over the `.graded` CSS pattern
 * (globals.css) so React islands and Astro pages share one mechanism.
 * Drop the wrapper (or the class) to un-grade an image when real
 * photography replaces stock. See docs/design-system.md.
 */
interface GradedImageProps {
  src: string
  alt: string
  /** emerald = youth contexts; navy (default) = everything else */
  variant?: "navy" | "emerald"
  className?: string
  loading?: "eager" | "lazy"
}

export function GradedImage({ src, alt, variant = "navy", className = "", loading = "lazy" }: GradedImageProps) {
  return (
    <div className={`graded ${variant === "emerald" ? "graded--emerald" : ""} ${className}`}>
      <img src={src} alt={alt} loading={loading} />
    </div>
  )
}
```

- [ ] **Step 3: Verify + commit**

```bash
npx tsc --noEmit
git add src/styles/globals.css src/components/ui/graded-image.tsx
git commit -m "feat(aesthetic): brand-grade CSS utilities + GradedImage"
```

### Task 4: Hero rebuild

- [ ] **Step 1: Rewrite `src/components/marketing/dual-cta-hero.tsx`**

Keep: `"use client"`, the `mounted` stagger pattern (read the current file first), `ArrowRight`, and EXACTLY these attrs/hrefs — `data-landing-cta="homepage-hero-youth"` → `/youth/leagues`, `homepage-hero-adult` → `/adult/leagues` (e2e-pinned). New structure:

```tsx
"use client"

import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"

/**
 * DualCtaHero — the homepage gateway, benefit-led.
 *
 * Full-bleed brand-graded photo (see docs/design-system.md "Graded imagery")
 * with the dual-audience fork as the primary action:
 *  - "For Kids"   → /youth/leagues (emerald)
 *  - "For Adults" → /adult/leagues (orange)
 *
 * No geographic chrome — Columbus/service-area copy is SEO-only (meta,
 * footer, /locations). The right column reserves the Next-up announcement
 * slot (later slice); until then the copy block spans the full width.
 */
export function DualCtaHero() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <section className="graded relative text-cream pt-20 lg:pt-24">
      <img
        src="/images/stock/adult-match-night.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0"
        loading="eager"
      />
      <div className="graded-content max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 pt-20 lg:pt-32 pb-16 lg:pb-24">
        <div className="max-w-4xl">
          <h1
            className={`font-display transition-all duration-700 delay-100 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{
              fontSize: "clamp(2.75rem, 7vw, 6.5rem)",
              lineHeight: 0.98,
              letterSpacing: "-0.03em",
            }}
          >
            The best part of your week{" "}
            <span className="italic text-[#ffb38a]" style={{ fontWeight: 400 }}>
              happens here.
            </span>
          </h1>

          <p
            className={`mt-7 text-lg sm:text-xl text-cream/85 max-w-2xl leading-relaxed transition-all duration-700 delay-200 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Soccer leagues, pickup, and youth programs where the game is the
            excuse and the people are the reason. Organized properly, so you
            just play.
          </p>

          <div
            className={`mt-10 flex flex-wrap items-center gap-4 transition-all duration-700 delay-300 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <a
              href="/youth/leagues"
              data-landing-cta="homepage-hero-youth"
              className="group inline-flex items-center gap-3 bg-emerald-600 text-cream px-7 py-4 text-sm font-medium tracking-wide uppercase hover:bg-emerald-700 transition-colors duration-300"
              style={{ letterSpacing: "0.08em" }}
            >
              For Kids
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
            <a
              href="/adult/leagues"
              data-landing-cta="homepage-hero-adult"
              className="group inline-flex items-center gap-3 bg-primary text-cream px-7 py-4 text-sm font-medium tracking-wide uppercase hover:bg-primary/90 transition-colors duration-300"
              style={{ letterSpacing: "0.08em" }}
            >
              For Adults
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
```

Notes for the implementer: the `.graded > img` CSS sets width/height 100% + object-fit, so the absolute positioning class is the only sizing needed; verify against the rendered page that the photo fills the section behind the content. `bg-primary` is the existing CTA convention — check the current file's adult CTA classes and keep whichever primary-button idiom it used if it differs.

- [ ] **Step 2: Smoke + commit** (dev server: see Task 7 note — start it once for the whole plan)

```bash
curl -s -m 60 http://localhost:4321/ | grep -c "best part of your week"   # ≥1
npx tsc --noEmit
git add src/components/marketing/dual-cta-hero.tsx
git commit -m "feat(aesthetic): benefit-led graded photo hero"
```

### Task 5: BenefitTrio + section swap

- [ ] **Step 1: Create `src/components/marketing/benefit-trio.tsx`**

```tsx
/**
 * Benefit trio — why people play: fun, development, fitness.
 * Replaces operational stat/proof boxes (see design-system "Patterns").
 * Static content; no island needed — imported into index.astro without
 * a client directive. Plain function component rendered server-side.
 */
const BENEFITS = [
  {
    accent: "border-t-primary",
    title: "Actually fun",
    body: "Post-game hangs, rivalries, people who notice when you're gone.",
  },
  {
    accent: "border-t-emerald-600",
    title: "You'll get better",
    body: "Real coaching for kids, competitive reps for adults.",
  },
  {
    accent: "border-t-ochre",
    title: "Fitness that sticks",
    body: "The workout you won't skip — your team is waiting.",
  },
]

export default function BenefitTrio() {
  return (
    <section className="bg-paper border-y border-border">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 py-12 lg:py-16 grid grid-cols-1 md:grid-cols-3 gap-8">
        {BENEFITS.map((b) => (
          <div key={b.title} className={`border-t-[3px] ${b.accent} pt-5`}>
            <h2 className="font-display italic text-2xl text-ink">{b.title}</h2>
            <p className="text-ink-muted mt-2 leading-relaxed">{b.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

(Verify `border-t-primary` / `text-ochre`-style token classes exist in globals.css before using; fall back to arbitrary-value classes bound to the CSS variables, e.g. `border-t-[var(--primary)]`, matching whatever idiom the codebase already uses — grep for `--ochre` usage.)

- [ ] **Step 2: Delete superseded components, update index.astro**

```bash
rm src/components/why-aspire.tsx src/components/stats-section.tsx
grep -rn "why-aspire\|WhyAspire\|stats-section\|StatsSection" src/ tests/   # only index.astro hits; fix those, then re-run → empty
```

In `src/pages/index.astro`: remove the two imports/usages, import BenefitTrio (no client directive — it's static), place it directly after `<DualCtaHero client:load />` and before `<section id="programs">`. Update the BaseLayout meta:

```astro
<BaseLayout
  title="Aspire Sports — Adult & Youth Sports Leagues in Columbus, Ohio"
  description="Soccer leagues, pickup, and youth programs in Columbus — actually fun, properly organized, all year. Find your league or your kid's next season."
>
```

- [ ] **Step 3: Verify + commit**

```bash
npx tsc --noEmit
curl -s -m 60 http://localhost:4321/ | grep -c "Actually fun"   # ≥1
git status --porcelain
git add src/components/marketing/benefit-trio.tsx src/pages/index.astro
git rm --cached --ignore-unmatch src/components/why-aspire.tsx src/components/stats-section.tsx 2>/dev/null; git add -u src/components/
git commit -m "feat(aesthetic): benefit trio replaces WhyAspire/Stats on home"
```

### Task 6: "Open now" strip

- [ ] **Step 1: Rewrite `src/components/homepage-programs-preview.tsx`**

Read the current file first; keep its top-of-file comment convention about the `#programs` e2e dependency, the fetch pattern, skeletons, and empty state. Changes:

- One strip, not two audience rows: filter to seasons with `deriveAudience(s)` in `{"adult","youth"}`, sort with `byRegistrationCloses` (import from `@/lib/programs/category-pages`), take the first **3**.
- Each card: wrap `<ProgramCardV2 season={s} />` in a `relative` div and overlay an audience badge chip top-left:

```tsx
const AUDIENCE_BADGE: Record<string, { label: string; cls: string }> = {
  adult: { label: "Adult", cls: "bg-primary text-cream" },
  youth: { label: "Youth", cls: "bg-emerald-600 text-cream" },
}
// inside the map, audience = deriveAudience(s):
<div key={s.id} className="relative">
  <span
    className={`absolute top-3 left-3 z-10 text-[10px] font-bold tracking-[0.12em] uppercase px-2 py-0.5 rounded ${AUDIENCE_BADGE[audience].cls}`}
  >
    {AUDIENCE_BADGE[audience].label}
  </span>
  <ProgramCardV2 season={s} />
</div>
```

- Grid `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4` (drop the horizontal scroll rows).
- Section header: keep the always-rendered heading (e2e), label "Open for registration", heading "Pick your season", and a right-aligned link: `<a href="/programs" className="text-sm font-medium text-primary hover:underline">All programs →</a>`.
- Empty state: keep the existing paragraph but point its links at `/adult/leagues` and `/youth/leagues`.

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
curl -s -m 60 http://localhost:4321/ | grep -c "All programs"   # ≥1
git add src/components/homepage-programs-preview.tsx
git commit -m "feat(aesthetic): deadline-led cross-audience Open Now strip"
```

### Task 7: Capture band + page assembly

Dev-server note for all smoke steps: start ONE server for the whole plan (`R2_MOCK=1 CRON_SECRET=e2e-secret npm run dev`, unsandboxed per repo memory) and reuse it.

- [ ] **Step 1: Create `src/components/marketing/capture-band.tsx`**

```tsx
"use client"

import { useState } from "react"

/**
 * Inline email-capture band (home). Deliberately NOT a popup — see the
 * aesthetic-evolution spec. Posts to the org-scoped newsletter endpoint.
 * Copy is the pre-discount variant; the discount campaign slice swaps it
 * once the founder sets the amount.
 */
export default function CaptureBand() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus("submitting")
    try {
      const res = await fetch("/api/public/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "home-incentive" }),
      })
      if (!res.ok) throw new Error()
      setStatus("ok")
    } catch {
      setStatus("error")
    }
  }

  return (
    <section className="bg-navy-deep text-cream">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 py-12 lg:py-14 flex flex-col md:flex-row md:items-center gap-6">
        <div className="flex-1">
          <h2 className="font-display italic text-2xl lg:text-3xl">Get first dibs on every season.</h2>
          <p className="text-cream/70 mt-2 text-sm">
            New leagues, camps, and pickup blocks — in your inbox before they fill.
          </p>
        </div>
        {status === "ok" ? (
          <p className="flex-1 text-sm font-medium text-cream/90" role="status">
            You're on the list — see you out there.
          </p>
        ) : (
          <form onSubmit={submit} className="flex-1 flex flex-col sm:flex-row gap-2">
            <label htmlFor="capture-band-email" className="sr-only">Email address</label>
            <input
              id="capture-band-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "submitting"}
              className="flex-1 px-4 py-3 bg-cream/10 border border-cream/30 rounded-lg text-sm text-cream placeholder:text-cream/50 focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={status === "submitting"}
              className="px-6 py-3 bg-primary text-cream text-sm font-medium tracking-wide uppercase rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
              style={{ letterSpacing: "0.08em" }}
            >
              {status === "submitting" ? "Saving…" : "Count me in"}
            </button>
          </form>
        )}
        {status === "error" && (
          <p className="text-sm text-red-400" role="alert">Couldn't save that — try again.</p>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Final index.astro order**

```astro
  <main id="main-content">
    <DualCtaHero client:load />
    <BenefitTrio />
    <section id="programs">
      <HomepageProgramsPreview client:load />
    </section>
    <Testimonials client:visible />
    <PartnersSection client:visible />
    <FAQSection client:visible />
    <CaptureBand client:visible />
    <CTABanner client:visible />
  </main>
```

(Blog teaser slots between `#programs` and Testimonials in the blog slice.)

- [ ] **Step 3: Verify + commit**

```bash
npx tsc --noEmit
curl -s -m 60 http://localhost:4321/ | grep -c "first dibs"   # ≥1
git add src/components/marketing/capture-band.tsx src/pages/index.astro
git commit -m "feat(aesthetic): inline capture band + home section order"
```

### Task 8: E2E

- [ ] **Step 1: Add to `tests/e2e/landing-pages.spec.ts`** (the existing homepage CTA test stays untouched — it must pass as-is):

```typescript
  test("homepage — evolved sections: hero copy, benefits, strip, capture", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Benefit-led hero (server-rendered).
    await expect(
      page.getByRole("heading", { level: 1, name: /best part of your week/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /for kids/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /for adults/i })).toBeVisible();

    // Benefit trio (static, server-rendered).
    await expect(page.getByText(/actually fun/i)).toBeVisible();

    // Open-now strip: anchor + catch-all link.
    await expect(page.locator("#programs")).toBeVisible();
    await expect(page.locator('#programs a[href="/programs"]')).toBeVisible();

    // Capture band submits (newsletter upsert is idempotent across runs).
    await waitForHydration(page);
    await page.locator("#capture-band-email").scrollIntoViewIfNeeded();
    await page.locator("#capture-band-email").fill("home-incentive-e2e@test.aspiresports.com");
    await page.getByRole("button", { name: /count me in/i }).click();
    await expect(page.getByText(/you're on the list/i)).toBeVisible();
  });
```

`waitForHydration` needs an import — but this file no longer imports it (removed in the IA phase 2 nit pass) AND the homepage's top React island is `DualCtaHero`, which does NOT call `useHydrationBeacon`. Two options; take the first: add `useHydrationBeacon()` to the rewritten `DualCtaHero` (one line, matches repo convention for e2e-driven pages) and re-add the helper import to the spec. Otherwise replace the hydration wait with an expect-retry on the filled value.

- [ ] **Step 2: Run the suites**

```bash
ALLOW_E2E_SEED=yes npm run db:seed:e2e
PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/landing-pages.spec.ts tests/e2e/category-pages.spec.ts tests/e2e/public-pages.spec.ts
```

Expected: all pass, including the untouched homepage CTA-href test and public-pages' `#programs` assertion.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/landing-pages.spec.ts src/components/marketing/dual-cta-hero.tsx
git commit -m "test(aesthetic): evolved homepage coverage"
```

### Task 9: Verification + PR

- [ ] **Step 1:**

```bash
npx tsc --noEmit
npx vitest run tests/unit/
npm run build
git diff origin/main --stat -- src/lib/db/schema/   # empty
```

- [ ] **Step 2: Push + PR + CI green** (body per repo conventions; note the founder-review ask: the curated stock set and all public copy are in this PR). Netlify PR check fails by design; `gh pr checks --watch` until the CI workflow passes.

---

## Self-review (plan time)

- **Spec coverage (slices 1–2):** grade foundation ✓, stock set + traceability ✓, hero (voice/CTAs/no-geo) ✓, benefit trio + WhyAspire/Stats cut ✓, deadline-led mixed strip with badges + `/programs` link ✓, inline capture (pre-discount copy, `home-incentive` source) ✓, meta rewrite (SEO keeps Columbus) ✓. Deliberate deviations from the mockup, recorded: reuse `ProgramCardV2` (+badge overlay) instead of a third bespoke card; blog teaser deferred to the blog slice; Next-up card slot is layout-reserved only (later slice).
- **Placeholders:** none; conditional instructions carry both arms.
- **Type consistency:** helpers/imports verified against the explored files; `BenefitTrio` is server-rendered (no directive) — Astro renders React components without islands fine; e2e relies only on its static text.
- **e2e contract:** pinned attrs/hrefs and `#programs` preserved; new test additive.
