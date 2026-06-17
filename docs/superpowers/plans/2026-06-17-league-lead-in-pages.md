# League Lead-in Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the two pages that lead into the soccer season page — the soccer **landing** (`/adult/leagues/soccer`, now tabbed: Overview · This Season · Upcoming · Past with a bold benefit-led Overview) and the multi-sport **catalog** (`/adult/leagues`, bold video hero + sport quick-entry tiles + card-title fix).

**Architecture:** A new `client:load` React island drives the landing's tabs (grouping seasons by term/status via the existing `terms` helpers + evergreen content from `adult-soccer-content`). The catalog gets a video hero + a typed sport-tile config in its `.astro`. One shared card-title regex fix removes the redundant program-name prefix. One small public-API change exposes `completed` seasons for the Past tab.

**Tech Stack:** Astro 5 SSR, React 19 islands, Tailwind 4 (cream/navy/orange tokens), Drizzle, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-17-league-lead-in-pages-design.md`. **Design fidelity:** the locked mockups live at `.superpowers/brainstorm/20993-1781711805/content/` (`landing-overview-v3.html`, `landing-tabs.html`, `catalog-bold-v3.html`) in the main checkout — match their structure/classes.

**⚠️ Environment:** external volume — editor cache can diverge from disk. Use absolute paths, no `cd` in Bash, verify edits with `git diff`, prove with `npx tsc --noEmit`. Confirmed-good Pexels video: `6077723` (hd + sd fallback). `@/`→`src/`.

---

## File Structure

**Create:**
- `src/components/leagues/soccer-landing-tabs.tsx` — the tabbed landing body island.
- `tests/unit/term-partition.test.ts`, `tests/api/public-seasons-completed.test.ts`, `tests/e2e/league-lead-in.spec.ts`

**Modify:**
- `src/lib/leagues/terms.ts` — add `partitionTerms()` (current/upcoming/past).
- `src/lib/leagues/adult-soccer-content.ts` — add `WHY_INDOOR` value props.
- `src/pages/api/public/seasons.ts` — allow explicit `?status=completed`.
- `src/pages/adult/leagues/soccer/index.astro` — hero + banner + render the island.
- `src/pages/adult/leagues.astro` — bold video hero + sport tiles.
- `src/components/programs/program-card-v2.tsx` — tighten `isGenericSeasonName`.

---

## Task 1: Public API — expose `completed` seasons

**Files:** Modify `src/pages/api/public/seasons.ts`; Create `tests/api/public-seasons-completed.test.ts`

- [ ] **Step 1: Allow explicit `completed` status**

In `src/pages/api/public/seasons.ts`, the status clamp is:
```ts
    const PUBLIC_STATUSES = ["open", "active", "forming"] as const;
    if (status && (PUBLIC_STATUSES as readonly string[]).includes(status)) {
      conditions.push(eq(seasons.status, status as typeof seasons.status.enumValues[number]));
    } else {
      conditions.push(sql`${seasons.status} IN ('open', 'active', 'forming')`);
    }
```
Change `PUBLIC_STATUSES` to include `"completed"` so an explicit `?status=completed` is honored, while the default (no/invalid status) stays the open/active/forming set:
```ts
    // 'completed' is allowed ONLY when explicitly requested (?status=completed) —
    // it's public historical data (final standings). The default fallback below
    // never includes it, so the catalog/finders don't surface finished seasons.
    const PUBLIC_STATUSES = ["open", "active", "forming", "completed"] as const;
    if (status && (PUBLIC_STATUSES as readonly string[]).includes(status)) {
      conditions.push(eq(seasons.status, status as typeof seasons.status.enumValues[number]));
    } else {
      conditions.push(sql`${seasons.status} IN ('open', 'active', 'forming')`);
    }
```

- [ ] **Step 2: API test**

Create `tests/api/public-seasons-completed.test.ts` (no auth needed; public endpoint):
```ts
import { describe, it, expect } from "vitest";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("GET /api/public/seasons status handling", () => {
  it("returns only completed seasons when explicitly requested", async () => {
    const res = await fetch(`${BASE}/api/public/seasons?status=completed`);
    expect(res.status).toBe(200);
    const { seasons } = await res.json();
    expect(Array.isArray(seasons)).toBe(true);
    for (const s of seasons) expect(s.status).toBe("completed");
  });
  it("default (no status) never includes completed", async () => {
    const res = await fetch(`${BASE}/api/public/seasons`);
    const { seasons } = await res.json();
    for (const s of seasons) expect(["open", "active", "forming"]).toContain(s.status);
  });
});
```

- [ ] **Step 3: `npx tsc --noEmit` (zero errors), commit**
```bash
git add src/pages/api/public/seasons.ts tests/api/public-seasons-completed.test.ts
git commit -m "feat(api): expose completed seasons on explicit ?status=completed"
```

---

## Task 2: `partitionTerms` helper + value-prop content

**Files:** Modify `src/lib/leagues/terms.ts`, `src/lib/leagues/adult-soccer-content.ts`; Create `tests/unit/term-partition.test.ts`

- [ ] **Step 1: Failing test for `partitionTerms`**
```ts
// tests/unit/term-partition.test.ts
import { describe, it, expect } from "vitest";
import { partitionTerms, type TermSeason } from "@/lib/leagues/terms";

const S = (over: Partial<TermSeason>): TermSeason => ({ id: "s", termSlug: "fall-2026", termLabel: "Fall 2026", status: "open", startDate: "2026-09-14", ...over });

describe("partitionTerms", () => {
  it("splits terms into current (open/active), upcoming (forming), past (completed)", () => {
    const { current, upcoming, past } = partitionTerms([
      S({ id: "a", termSlug: "fall-2026", status: "open", startDate: "2026-09-14" }),
      S({ id: "b", termSlug: "winter-1", termLabel: "Winter 1", status: "forming", startDate: "2026-11-09" }),
      S({ id: "c", termSlug: "summer-2026", termLabel: "Summer 2026", status: "completed", startDate: "2026-06-01" }),
      S({ id: "d", termSlug: "spring-2027", termLabel: "Spring 2027", status: "forming", startDate: "2027-04-05" }),
    ]);
    expect(current?.slug).toBe("fall-2026");
    expect(upcoming.map((t) => t.slug)).toEqual(["winter-1", "spring-2027"]); // earliest-start first
    expect(past.map((t) => t.slug)).toEqual(["summer-2026"]);
  });
  it("current is null when nothing is open or active", () => {
    const { current, upcoming } = partitionTerms([S({ status: "forming" })]);
    expect(current).toBeNull();
    expect(upcoming).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`partitionTerms` not exported). `npx vitest run tests/unit/term-partition.test.ts`

- [ ] **Step 3: Implement `partitionTerms`** — append to `src/lib/leagues/terms.ts`:
```ts
export type TermPartition<T extends TermSeason = TermSeason> = {
  current: TermGroup<T> | null;
  upcoming: TermGroup<T>[];
  past: TermGroup<T>[];
};

// Split term groups for the landing tabs: current = the open/active group
// (via resolveCurrentTerm), upcoming = forming groups, past = completed groups.
// Upcoming/past are sorted earliest-start first (groupByTerm already sorts).
export function partitionTerms<T extends TermSeason>(seasons: T[]): TermPartition<T> {
  const groups = groupByTerm(seasons);
  const statusOf = (g: TermGroup<T>) => {
    if (g.seasons.some((s) => s.status === "open" || s.status === "active")) return "current";
    if (g.seasons.some((s) => s.status === "forming")) return "upcoming";
    if (g.seasons.every((s) => s.status === "completed")) return "past";
    return "other";
  };
  const current = resolveCurrentTerm(seasons);
  const upcoming = groups.filter((g) => g.slug !== current?.slug && statusOf(g) === "upcoming");
  const past = groups.filter((g) => g.slug !== current?.slug && statusOf(g) === "past");
  return { current, upcoming, past };
}
```

- [ ] **Step 4: Run → PASS.** `npx vitest run tests/unit/term-partition.test.ts`

- [ ] **Step 5: Add `WHY_INDOOR` value props** — append to `src/lib/leagues/adult-soccer-content.ts`:
```ts
export type ValueProp = { icon: string; tint: "orange" | "sage" | "ochre"; title: string; copy: string };

export const WHY_INDOOR: ValueProp[] = [
  { icon: "⚡", tint: "orange", title: "Faster, more goals", copy: "Walled arena, no offside — more touches, more shots, more action than outdoor 11v11." },
  { icon: "☃︎", tint: "sage", title: "Year-round, weatherproof", copy: "Climate-controlled turf. Games run on schedule all winter — never rained or snowed out." },
  { icon: "🤝", tint: "orange", title: "No team? No problem", copy: "Sign up solo and the Free Agent Pool places you on a balanced squad by skill & schedule." },
  { icon: "🥅", tint: "ochre", title: "Actual competition", copy: "Certified refs every match, live standings, and four skill tiers so you're matched, not mismatched." },
  { icon: "🍻", tint: "ochre", title: "Stick around after", copy: "Half of league night happens off the field — food, drinks, and the people you'll keep playing with." },
  { icon: "📍", tint: "sage", title: "Built around your week", copy: "Weeknight games, 50 minutes, at Worthington & Downtown / OSU. In and out, no all-day commitment." },
];
```

- [ ] **Step 6: `npx tsc --noEmit`, commit**
```bash
git add src/lib/leagues/terms.ts src/lib/leagues/adult-soccer-content.ts tests/unit/term-partition.test.ts
git commit -m "feat(leagues): partitionTerms helper + why-indoor value props"
```

---

## Task 3: `SoccerLandingTabs` island

**Files:** Create `src/components/leagues/soccer-landing-tabs.tsx`

- [ ] **Step 1: Implement** (match `landing-overview-v3.html`)
```tsx
// src/components/leagues/soccer-landing-tabs.tsx
"use client";
import { useState } from "react";
import { LevelLadder } from "@/components/leagues/level-ladder";
import { WHY_INDOOR, RULE_SECTIONS } from "@/lib/leagues/adult-soccer-content";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { cn } from "@/lib/utils";

export type LandingTerm = { slug: string; label: string; meta: string };
type Props = {
  current: (LandingTerm & { dateLine: string; divisions: number; venues: number }) | null;
  upcoming: (LandingTerm & { opensLabel: string })[];
  past: LandingTerm[];
};
type Tab = "overview" | "this" | "upcoming" | "past";
const TINT: Record<string, string> = { orange: "bg-primary/20", sage: "bg-sage/25", ochre: "bg-ochre/20" };

export function SoccerLandingTabs({ current, upcoming, past }: Props) {
  useHydrationBeacon();
  const [tab, setTab] = useState<Tab>("overview");
  const tabs: { key: Tab; label: string; badge?: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "this", label: "This Season", badge: current?.label.replace(/\s*\d{4}$/, " ’" + (current?.label.match(/\d{2}$/)?.[0] ?? "")) },
    { key: "upcoming", label: "Upcoming", badge: upcoming.length ? String(upcoming.length) : undefined },
    { key: "past", label: "Past" },
  ];
  return (
    <div>
      <div className="bg-navy-deep px-9">
        <div className="max-w-[1080px] mx-auto flex gap-0.5">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} aria-selected={tab === t.key}
              className={cn("font-mono text-xs tracking-wider uppercase px-4 py-3.5 cursor-pointer relative top-px flex items-center gap-1.5",
                tab === t.key ? "bg-cream text-ink rounded-t-lg" : "text-cream/70")}>
              {t.label}{t.badge && <span className="text-[9px] bg-primary/25 text-primary-foreground rounded-full px-1.5 py-px">{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-cream min-h-[360px]" data-testid="landing-tabs">
        {tab === "overview" && (
          <>
            <div className="bg-navy-deep text-cream px-9 py-9">
              <div className="max-w-[1080px] mx-auto">
                <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-primary-bright" style={{ color: "oklch(0.66 0.21 35)" }}>Why indoor soccer</div>
                <h2 className="font-display font-semibold text-3xl md:text-[34px] leading-tight mt-2 mb-1 max-w-[620px]">Real games, <em className="italic" style={{ color: "oklch(0.66 0.21 35)" }}>every week</em> — rain, snow, or shine.</h2>
                <p className="text-cream/85 max-w-[560px] text-[15px] mb-6">A faster, higher-scoring game on walled turf, leagues sorted by skill so every match is competitive, and a crew waiting whether or not you bring one.</p>
                <div className="grid md:grid-cols-3 gap-3.5">
                  {WHY_INDOOR.map((v) => (
                    <div key={v.title} className="bg-navy rounded-2xl border border-cream/10 p-4">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-lg mb-2.5", TINT[v.tint])}>{v.icon}</div>
                      <div className="font-display font-semibold text-base mb-0.5">{v.title}</div>
                      <p className="text-[12.5px] text-cream/80 leading-snug">{v.copy}</p>
                    </div>
                  ))}
                </div>
                {current && (
                  <a href={`/adult/leagues/soccer/${current.slug}`} data-testid="overview-season-cta"
                     className="flex items-center justify-between gap-5 rounded-2xl px-6 py-5 mt-6 text-ink" style={{ background: "oklch(0.66 0.21 35)" }}>
                    <span className="flex items-center gap-4">
                      <span className="font-mono text-[9px] tracking-widest uppercase bg-ink text-cream px-2.5 py-1.5 rounded-full whitespace-nowrap" style={{ color: "oklch(0.66 0.21 35)" }}>● Registration open</span>
                      <span><span className="font-display font-semibold text-2xl leading-none block">{current.label}</span><span className="font-mono text-xs text-ink/70 mt-1 block">{current.dateLine} · {current.divisions} divisions · {current.venues} venues</span></span>
                    </span>
                    <span className="font-mono text-xs tracking-wide uppercase bg-ink text-cream px-4 py-3 rounded-lg whitespace-nowrap">See divisions &amp; register →</span>
                  </a>
                )}
              </div>
            </div>
            <div className="px-9 py-9"><div className="max-w-[1080px] mx-auto">
              <p className="font-mono text-[11px] tracking-widest uppercase text-ink-muted mb-3">Find your level</p>
              <LevelLadder />
              <p className="font-mono text-[11px] tracking-widest uppercase text-ink-muted mt-9 mb-3">The rules, in brief</p>
              <div className="grid md:grid-cols-2 gap-x-7 gap-y-4">
                {RULE_SECTIONS.map((s) => (<div key={s.title}><h3 className="font-display font-semibold text-lg mb-1">{s.title}</h3><ul className="space-y-1">{s.items.slice(0, 3).map((it) => <li key={it} className="text-[12.5px] text-ink-2 leading-snug">· {it}</li>)}</ul></div>))}
              </div>
            </div></div>
          </>
        )}
        {tab === "this" && (
          <div className="px-9 py-9"><div className="max-w-[1080px] mx-auto">
            <h2 className="font-display font-semibold text-2xl mb-4">This season</h2>
            {current ? (
              <a href={`/adult/leagues/soccer/${current.slug}`} className="flex items-center justify-between gap-4 bg-navy-deep text-cream rounded-2xl px-6 py-5">
                <span><span className="font-display font-semibold text-2xl block">{current.label}</span><span className="font-mono text-xs text-cream/80 mt-1 block">{current.dateLine} · {current.divisions} divisions · {current.venues} venues</span></span>
                <span className="font-mono text-xs tracking-wide uppercase rounded-lg px-4 py-3 text-ink whitespace-nowrap" style={{ background: "oklch(0.66 0.21 35)" }}>See divisions &amp; register →</span>
              </a>
            ) : <p className="text-ink-muted text-sm">No season is open for registration right now — check Upcoming.</p>}
          </div></div>
        )}
        {tab === "upcoming" && (
          <div className="px-9 py-9"><div className="max-w-[1080px] mx-auto">
            <h2 className="font-display font-semibold text-2xl">Upcoming seasons</h2>
            <p className="text-ink-muted text-[13px] mt-0.5 mb-4">Get on the interest list — we'll email when registration opens.</p>
            {upcoming.length ? upcoming.map((t) => (
              <div key={t.slug} className="flex items-center justify-between gap-4 bg-paper border border-cream-3 rounded-xl px-5 py-4 mb-2.5">
                <span><span className="font-display font-semibold text-xl block">{t.label}</span><span className="font-mono text-xs text-ink-muted mt-1 block">{t.meta} · {t.opensLabel}</span></span>
                <a href={`/adult/leagues/soccer/${t.slug}`} className="font-mono text-[11px] tracking-wide uppercase border border-primary text-primary px-4 py-2.5 rounded-lg whitespace-nowrap">Notify me →</a>
              </div>
            )) : <div className="text-center py-9 border border-dashed border-cream-3 rounded-xl text-ink-muted text-sm">No upcoming seasons announced yet.</div>}
          </div></div>
        )}
        {tab === "past" && (
          <div className="px-9 py-9"><div className="max-w-[1080px] mx-auto">
            <h2 className="font-display font-semibold text-2xl">Past seasons</h2>
            <p className="text-ink-muted text-[13px] mt-0.5 mb-4">Final standings &amp; results live here once a season wraps.</p>
            {past.length ? past.map((t) => (
              <a key={t.slug} href={`/adult/leagues/soccer/${t.slug}`} className="flex items-center justify-between gap-4 bg-paper border border-cream-3 rounded-xl px-5 py-4 mb-2.5">
                <span className="font-display font-semibold text-xl">{t.label}</span>
                <span className="font-mono text-[11px] tracking-wide uppercase text-primary">Results →</span>
              </a>
            )) : <div className="text-center py-9 border border-dashed border-cream-3 rounded-xl text-ink-muted text-sm">No completed seasons yet — Fall 2026 is the first. Results &amp; champions will appear here.</div>}
          </div></div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `npx tsc --noEmit`** (zero errors). If `LevelLadder` requires no props that's fine (it renders non-interactive without `onSelect`).

- [ ] **Step 3: Commit**
```bash
git add src/components/leagues/soccer-landing-tabs.tsx
git commit -m "feat(leagues): tabbed soccer landing island (overview/this/upcoming/past)"
```

---

## Task 4: Landing page — wire hero + island

**Files:** Modify `src/pages/adult/leagues/soccer/index.astro`

- [ ] **Step 1: Replace the file** with the hero (photo + banner) + the island, fetching open/active/forming + completed and partitioning:
```astro
---
export const prerender = false;
import BaseLayout from "@/layouts/BaseLayout.astro";
import { SoccerLandingTabs } from "@/components/leagues/soccer-landing-tabs";
import { FORMAT_FACTS } from "@/lib/leagues/adult-soccer-content";
import { partitionTerms, type TermSeason } from "@/lib/leagues/terms";

const origin = Astro.url.origin;
const cookie = Astro.request.headers.get("cookie") ?? "";
async function fetchSeasons(qs: string) {
  const r = await fetch(`${origin}/api/public/seasons?${qs}`, { headers: { cookie } });
  return r.ok ? ((await r.json()).seasons ?? []) : [];
}
const live = await fetchSeasons("sport=soccer&audience=adult");
const done = await fetchSeasons("sport=soccer&audience=adult&status=completed");
const all: any[] = [...live, ...done];

const termSeasons: TermSeason[] = all.filter((s) => s.termSlug)
  .map((s) => ({ id: s.id, termSlug: s.termSlug, termLabel: s.termLabel, status: s.status, startDate: s.startDate }));
const { current, upcoming, past } = partitionTerms(termSeasons);

// Build display props from the grouped seasons.
const venuesIn = (slug: string) => new Set(all.filter((s) => s.termSlug === slug).map((s) => s.location?.slug)).size;
const divsIn = (slug: string) => all.filter((s) => s.termSlug === slug).length;
const fmtRange = (slug: string) => {
  const rows = all.filter((s) => s.termSlug === slug);
  const start = rows.map((s) => s.startDate).sort()[0];
  const end = rows.map((s) => s.endDate).sort().at(-1);
  return start && end ? `${start} – ${end}` : "";
};
const currentProp = current ? { slug: current.slug, label: current.label, meta: "", dateLine: fmtRange(current.slug), divisions: divsIn(current.slug), venues: venuesIn(current.slug) } : null;
const upcomingProps = upcoming.map((t) => ({ slug: t.slug, label: t.label, meta: fmtRange(t.slug), opensLabel: "registration opens soon" }));
const pastProps = past.map((t) => ({ slug: t.slug, label: t.label, meta: "" }));

const heroPhoto = "https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?auto=format&fit=crop&w=1600&q=60";
---
<BaseLayout title="Adult Soccer Leagues — Aspire Sports"
  description="Coed, men's and women's indoor 7v7 soccer leagues in central Ohio. Rec to competitive, all skill levels.">
  <main id="main-content">
    <section class="relative text-cream pt-16 px-9 bg-cover bg-center"
      style={`background-image:linear-gradient(180deg,oklch(0.18 0.07 262/0.8),oklch(0.18 0.07 262/0.94)),url('${heroPhoto}')`}>
      <div class="max-w-[1080px] mx-auto pb-8">
        {currentProp && (
          <a href={`/adult/leagues/soccer/${currentProp.slug}`} class="flex items-center justify-between gap-3 bg-primary text-cream rounded-lg px-4 py-3 mb-5" data-testid="now-registering">
            <span><span class="font-mono text-[10px] tracking-widest uppercase opacity-85">● Now Registering</span><br/><span class="font-display font-semibold text-lg">{currentProp.label} · registration open</span></span>
            <span class="font-mono text-[11px] tracking-wider uppercase bg-cream text-primary px-3 py-2 rounded">See divisions →</span>
          </a>
        )}
        <h1 class="font-display font-semibold text-5xl md:text-6xl tracking-tight mb-2">Adult soccer<br/>at Aspire.</h1>
        <p class="text-cream/85 max-w-md mb-2">Coed, men's &amp; women's 7v7 — rec to competitive, indoor, across central-Ohio venues.</p>
        <p class="font-mono text-[12px] text-cream/70 pb-1">{FORMAT_FACTS.slice(0, 4).join(" · ")}</p>
      </div>
    </section>
    <SoccerLandingTabs client:load current={currentProp} upcoming={upcomingProps} past={pastProps} />
  </main>
</BaseLayout>
```

- [ ] **Step 2: Build + tsc** — `npx tsc --noEmit` (zero errors); `npm run build` (success except the known `guides/baseball.astro` no-DB error).

- [ ] **Step 3: Commit**
```bash
git add "src/pages/adult/leagues/soccer/index.astro"
git commit -m "feat(leagues): tabbed soccer landing page wired to season terms"
```

---

## Task 5: Catalog — bold video hero + sport tiles

**Files:** Modify `src/pages/adult/leagues.astro`

- [ ] **Step 1: Replace the hero `<section>`** (the `bg-gradient-to-br from-ink to-zinc-700` block) with a video hero + sport tiles. Keep the `<CategoryFinder>` + `<CTABanner>` below unchanged:
```astro
    <section class="relative text-cream pt-16 px-9 pb-8 overflow-hidden">
      <video autoplay muted loop playsinline class="absolute inset-0 w-full h-full object-cover z-0"
        poster="https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?auto=format&fit=crop&w=1600&q=60">
        <source src="https://videos.pexels.com/video-files/6077723/6077723-hd_1920_1080_25fps.mp4" type="video/mp4" />
        <source src="https://videos.pexels.com/video-files/6077723/6077723-sd_640_360_25fps.mp4" type="video/mp4" />
      </video>
      <div class="absolute inset-0 z-[1]" style="background:linear-gradient(180deg,oklch(0.18 0.07 262/0.45),oklch(0.18 0.07 262/0.82)),linear-gradient(100deg,oklch(0.18 0.07 262/0.7),oklch(0.18 0.07 262/0.25))"></div>
      <div class="relative z-[2] max-w-[1080px] mx-auto">
        <h1 class="font-display font-semibold tracking-tight" style="font-size:clamp(2.5rem,6vw,4rem);line-height:.95">Adult leagues.</h1>
        <p class="mt-3 text-base text-cream/90 max-w-[520px]">Season-long play with fair refs, reliable scheduling, and a post-game scene worth staying for. Sign up a full team or join as a free agent.</p>
        <div class="grid sm:grid-cols-3 gap-3 mt-6">
          <a href="/adult/leagues/soccer" class="relative rounded-2xl p-4 text-ink overflow-hidden" style="background:oklch(0.66 0.21 35)">
            <div class="font-mono text-[9px] tracking-widest uppercase opacity-80">● Now registering</div>
            <div class="font-display font-semibold text-2xl mt-1.5">Soccer</div>
            <div class="font-mono text-xs">Fall 2026 · 13 divisions · 2 venues</div>
            <span class="absolute right-4 bottom-4 font-semibold text-lg">→</span>
          </a>
          <div class="rounded-2xl p-4 border border-cream/25 text-cream/80" style="background:oklch(0.2 0.06 262/0.7)">
            <div class="font-mono text-[9px] tracking-widest uppercase opacity-80">Coming soon</div>
            <div class="font-display font-semibold text-2xl mt-1.5">Basketball</div>
            <div class="font-mono text-xs">Interested? Notify me</div>
          </div>
          <div class="rounded-2xl p-4 border border-cream/25 text-cream/80" style="background:oklch(0.2 0.06 262/0.7)">
            <div class="font-mono text-[9px] tracking-widest uppercase opacity-80">Coming soon</div>
            <div class="font-display font-semibold text-2xl mt-1.5">Volleyball</div>
            <div class="font-mono text-xs">Interested? Notify me</div>
          </div>
        </div>
      </div>
    </section>
```
(Removes the eyebrow line + the old "Soccer league details" text link — the Soccer tile replaces it. Keep the `<CategoryFinder>` and `<CTABanner>` exactly as they are.)

- [ ] **Step 2: Build + tsc.** `npx tsc --noEmit`; `npm run build` (success bar the known guides error).

- [ ] **Step 3: Commit**
```bash
git add src/pages/adult/leagues.astro
git commit -m "feat(leagues): bold video hero + sport tiles on adult catalog"
```

---

## Task 6: Card-title fix (drop redundant program prefix)

**Files:** Modify `src/components/programs/program-card-v2.tsx`

- [ ] **Step 1: Tighten `isGenericSeasonName`** — line ~35. Current:
```ts
function isGenericSeasonName(name: string): boolean {
  return /^(Spring|Summer|Fall|Winter)\s+\d{4}(\s*[—\-(].{0,30})?$/i.test(name.trim())
}
```
The optional suffix clause wrongly matches descriptive names like "Fall 2026 — Men's D", so the card prepends the program name → "Adult Men's 7v7 League — Fall 2026 — Men's D". Restrict "generic" to a **bare** term name (no division suffix), so descriptive names render as-is:
```ts
function isGenericSeasonName(name: string): boolean {
  // Only a bare "Season YYYY" (no division/detail suffix) is generic enough to
  // need the program name prepended. "Fall 2026 — Men's D" is self-describing.
  return /^(Spring|Summer|Fall|Winter)\s+\d{4}$/i.test(name.trim())
}
```

- [ ] **Step 2: Verify the per-unit label** — confirm line ~74 still keys on `season.program.audienceType === "adults"` for "Adult" vs "All ages", and the price unit (`deriveIndividualUnit`) likewise distinguishes adult ("player") from youth ("kid"). No code change needed — the PER-KID fix came from correcting `audience_type` to `adults` in prod data; this step is a read-only confirmation that the label is audience-driven. Run: `grep -n "kid\|player\|audienceType" src/components/programs/program-card-v2.tsx` and confirm.

- [ ] **Step 3: `npx tsc --noEmit`, commit**
```bash
git add src/components/programs/program-card-v2.tsx
git commit -m "fix(catalog): stop prepending program name to descriptive season titles"
```

---

## Task 7: E2E (@critical)

**Files:** Create `tests/e2e/league-lead-in.spec.ts`

- [ ] **Step 1: Write the spec**
```ts
import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";

test("soccer landing tabs switch content @critical", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues/soccer`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await expect(page.getByTestId("landing-tabs")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Why indoor soccer|Real games/i })).toBeVisible();
  await page.getByRole("button", { name: "This Season" }).click();
  await expect(page.getByRole("heading", { name: "This season" })).toBeVisible();
  await page.getByRole("button", { name: "Upcoming" }).click();
  await expect(page.getByRole("heading", { name: "Upcoming seasons" })).toBeVisible();
});

test("adult catalog: soccer tile links to the soccer landing @critical", async ({ page }) => {
  await page.goto(`${BASE}/adult/leagues`, { waitUntil: "domcontentloaded" });
  const soccerTile = page.getByRole("link", { name: /Soccer/i }).first();
  await expect(soccerTile).toHaveAttribute("href", "/adult/leagues/soccer");
});
```

- [ ] **Step 2: `npx tsc --noEmit`** (zero errors). (Live run is CI's `test-critical`.)

- [ ] **Step 3: Commit**
```bash
git add tests/e2e/league-lead-in.spec.ts
git commit -m "test(leagues): @critical e2e for landing tabs + catalog soccer tile"
```

---

## Task 8: Verify + PR

- [ ] **Step 1:** `npx vitest run tests/unit/term-partition.test.ts && npx tsc --noEmit` (pass + zero errors).
- [ ] **Step 2:** `npm run build` (success bar the known `guides/baseball.astro` no-DB error).
- [ ] **Step 3:** `git push -u origin <branch>` then `gh pr create --fill`.
- [ ] **Step 4: Watch CI to green** — `test-api` (completed-status), `test-critical` (the @critical specs), `build`, `typecheck`. Not done until green; fix + re-push if `test-critical` fails.

---

## Self-Review notes

- **Spec coverage:** landing tabs/bold Overview (T2 content + T3 island + T4 page), current-season banner (T3/T4), Upcoming=forming / Past=completed (T1 API + T2 partition + T3/T4), catalog video hero + sport tiles (T5), card-title fix (T6), PER-KID (T6 step 2 — data-fixed, confirmed), API completed (T1), tests (T1/T2/T7).
- **Reuse:** `LevelLadder`, `terms` helpers, `adult-soccer-content`, `program-card-v2` — no duplication.
- **Open items (from spec):** Upcoming shows only `forming` terms (Winter/Spring are `draft` → won't appear until flipped); the `?division=` deep-link and coming-soon interest capture are out of scope. `LevelLadder` color uses `text-primary-bright`-style inline oklch where no token class exists (matches the mock).
- **Known caveat:** the card-title regex is shared across all catalog surfaces (`/programs`, `/youth/leagues`); tightening it only *reduces* false-positive prepending, which is safe everywhere.
