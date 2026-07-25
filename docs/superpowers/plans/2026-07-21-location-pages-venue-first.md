# Venue-First Location Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/locations` and `/locations/[slug]` as venue-first pages (spec: `docs/superpowers/specs/2026-07-21-location-pages-venue-first-design.md`) with live season data and a single curated venue-facts module.

**Architecture:** `[slug].astro` stays SSR and keeps its existing DB location lookup, 404-rewrite, canonical, and SportsActivityLocation JSON-LD. New content comes from (a) `/api/public/seasons?location=<slug>&status=open` fetched server-side (the `[term].astro` pattern) summarized by a pure helper, and (b) a curated `venue-facts.ts` record per slug. Sections are Astro partials — no new client islands.

**Tech Stack:** Astro 5 SSR, Tailwind 4 (cream design system per `docs/design-system.md`), Drizzle (existing query only), Vitest unit tests, Playwright e2e.

## Global Constraints

- Facility claims MUST match the spec's "Verified venue facts": Worthington = **2 turf fields (110×60, boarded)**, **futsal court coming Sept 2026**, free parking, year-round indoor. Downtown = 1 field, pickup + rentals hub. **Never** "3 fields"; **never** mention concessions.
- The strings `{{` and `TBD` must not appear in any rendered output.
- No CTA on these pages may link to `/programs` (with or without query).
- Keep: `setMarketingEdgeCache(Astro)` on the index; canonical tags; SportsActivityLocation JSON-LD + breadcrumb JSON-LD; `Astro.rewrite("/404")` for unknown slugs.
- Spec refinement (approved rationale): there is no public dropin/rentals listing API, so pickup/rentals **presence** is curated in `venue-facts.ts` (`offerings` flags); league/season content is fully live from the seasons API.
- Spec refinement 2: the "stylized inline map graphic (static SVG)" in Getting Here is simplified to a facility photo + the Google Maps link — hand-authored SVG maps per venue add maintenance for little value; revisit only if requested.
- Design idiom: match existing location/league pages (font-display serif headings, `bg-cream-2` bands, `border-ink/10`, mono uppercase micro-labels). Reuse existing utility classes; no new CSS files.
- Photos: `/media/soccerone/still-entrance.jpg`, `still-action.jpg`, `still-party.jpg`, `worthington-hero-poster.jpg` (all exist in `public/media/soccerone/`).

---

### Task 1: Venue facts module

**Files:**
- Create: `src/lib/locations/venue-facts.ts`
- Test: `tests/unit/venue-facts.test.ts`

**Interfaces:**
- Produces: `type VenueFacts`, `function getVenueFacts(slug: string): VenueFacts | null`. Consumed by Tasks 3 and 4.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/venue-facts.test.ts
import { describe, it, expect } from "vitest";
import { getVenueFacts } from "@/lib/locations/venue-facts";

describe("getVenueFacts", () => {
  it("returns null for unknown slugs", () => {
    expect(getVenueFacts("loc-g00dqku7")).toBeNull();
  });

  it("worthington: 2 turf fields, futsal coming, no concession text", () => {
    const f = getVenueFacts("worthington")!;
    expect(f.specs.find((s) => s.label.toLowerCase().includes("turf"))?.n).toBe("2");
    expect(f.comingSoon.join(" ")).toMatch(/futsal/i);
    const all = JSON.stringify(f).toLowerCase();
    expect(all).not.toContain("concession");
    expect(all).not.toContain("{{");
    expect(all).not.toContain("3 indoor");
  });

  it("downtown: pickup-first offerings, no leagues flag", () => {
    const f = getVenueFacts("downtown")!;
    expect(f.offerings.pickup).toBe(true);
    expect(f.offerings.rentals).toBe(true);
    expect(f.offerings.youth).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/venue-facts.test.ts`
Expected: FAIL — `Cannot find module '@/lib/locations/venue-facts'`

- [ ] **Step 3: Write the module**

```ts
// src/lib/locations/venue-facts.ts
// The single file a human edits when facility claims change. Everything
// program-related stays live from the seasons API — this holds only the
// structural facts of the building (owner-verified 2026-07-21).

export interface VenueSpec { n: string; label: string }

export interface VenueFacts {
  /** One-line identity under the hero title. */
  tagline: string;
  /** Facts ticker items (address renders separately from the DB row). */
  ticker: string[];
  specs: VenueSpec[];
  features: string[];
  comingSoon: string[];
  /** Which What's-Happening cards this venue gets besides live leagues. */
  offerings: { youth: boolean; pickup: boolean; rentals: boolean };
  directions: string[];
  parkingNote: string;
  hours: string;
  photos: { src: string; alt: string }[];
  heroPoster: string;
}

const FACTS: Record<string, VenueFacts> = {
  worthington: {
    tagline:
      "2 indoor turf fields off I-270, futsal court coming. Adult co-ed leagues on weeknights, youth programs U6–U18 on a published weekly schedule.",
    ticker: ["Weeknights to 11 PM", "Free parking", "Indoor · year-round"],
    specs: [
      { n: "2", label: "Turf fields · 110×60, boarded" },
      { n: "Futsal", label: "Court coming Sept 2026" },
      { n: "Year-round", label: "No weather cancellations" },
      { n: "Free", label: "On-site parking" },
    ],
    features: [
      "Fully boarded fields — play off the walls, keep the tempo up",
      "Family-friendly viewing area",
      "Restrooms + locker rooms",
    ],
    comingSoon: ["Futsal court — September 2026"],
    offerings: { youth: true, pickup: false, rentals: true },
    directions: [
      "I-270 Exit 23 → US-23 north",
      "East on Campus View Blvd",
      "Lakeview Plaza — we're in Suite B",
    ],
    parkingNote: "Free lot right outside the door — designed for family drop-off.",
    hours: "Weeknights to 11 PM · weekend mornings",
    photos: [
      { src: "/media/soccerone/still-action.jpg", alt: "Match on the boarded turf field" },
      { src: "/media/soccerone/still-entrance.jpg", alt: "Facility entrance" },
      { src: "/media/soccerone/still-party.jpg", alt: "Spectator and event space" },
    ],
    heroPoster: "/media/soccerone/worthington-hero-poster.jpg",
  },
  downtown: {
    tagline:
      "One field near campus — the pickup and rentals hub. Show up and play, or book the field by the hour.",
    ticker: ["Pickup most nights", "Book by the hour", "Indoor · year-round"],
    specs: [
      { n: "1", label: "Indoor field" },
      { n: "Nightly", label: "Drop-in pickup" },
      { n: "Hourly", label: "Field rentals" },
    ],
    features: [
      "Campus-adjacent — walkable from OSU",
      "Balanced-teams pickup format, live session times published",
    ],
    comingSoon: [],
    offerings: { youth: false, pickup: true, rentals: true },
    directions: ["Near the OSU campus — exact walking/parking notes on the booking page"],
    parkingNote: "Street and lot parking nearby.",
    hours: "Sessions listed on the pickup schedule",
    photos: [
      { src: "/media/soccerone/still-action.jpg", alt: "Indoor field in play" },
      { src: "/media/soccerone/still-entrance.jpg", alt: "Facility entrance" },
    ],
    heroPoster: "/media/soccerone/worthington-hero-poster.jpg",
  },
};

export function getVenueFacts(slug: string): VenueFacts | null {
  return FACTS[slug] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/venue-facts.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/locations/venue-facts.ts tests/unit/venue-facts.test.ts
git commit -m "feat(locations): curated venue-facts module (owner-verified facility claims)"
```

---

### Task 2: Season summary helper

**Files:**
- Create: `src/lib/locations/season-summary.ts`
- Test: `tests/unit/season-summary.test.ts`

**Interfaces:**
- Consumes: raw season objects from `/api/public/seasons` (fields used: `status`, `termSlug`, `dayOfWeek`, `price`, `effectivePrice`, `teamPrice`, `effectiveTeamPrice`, `registrationCloses`, `signupModes`, `program.programType`, and `ageGroup.minAge`).
- Produces: `function summarizeOpenLeagues(seasons: PublicSeason[]): LeagueSummary | null` and `type LeagueSummary = { divisionCount: number; nights: string[]; soloPrice: number | null; teamPrice: number | null; closes: string | null; termSlug: string; termHref: string }`. Consumed by Tasks 3 and 4.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/season-summary.test.ts
import { describe, it, expect } from "vitest";
import { summarizeOpenLeagues } from "@/lib/locations/season-summary";

const season = (over: Record<string, unknown> = {}) => ({
  status: "open",
  termSlug: "fall-2026",
  dayOfWeek: "tue",
  price: 120,
  effectivePrice: null,
  teamPrice: 1050,
  effectiveTeamPrice: 1000,
  registrationCloses: "2026-09-03T12:00:00.000Z",
  signupModes: ["team", "individual"],
  program: { programType: "league" },
  ageGroup: { minAge: 18, maxAge: 99 },
  ...over,
});

describe("summarizeOpenLeagues", () => {
  it("returns null when no open adult league seasons", () => {
    expect(summarizeOpenLeagues([])).toBeNull();
    expect(summarizeOpenLeagues([season({ status: "active" })])).toBeNull();
    expect(summarizeOpenLeagues([season({ ageGroup: { minAge: 6, maxAge: 12 } })])).toBeNull();
  });

  it("summarizes divisions, nights, early-bird-aware prices, and term link", () => {
    const s = summarizeOpenLeagues([
      season(),
      season({ dayOfWeek: "sun", effectivePrice: 100 }),
    ])!;
    expect(s.divisionCount).toBe(2);
    expect(s.nights).toEqual(["Tue", "Sun"]);
    expect(s.soloPrice).toBe(100); // lowest effective price wins the "from $X" display
    expect(s.teamPrice).toBe(1000); // effectiveTeamPrice preferred
    expect(s.termSlug).toBe("fall-2026");
    expect(s.termHref).toBe("/adult/leagues/soccer/fall-2026");
    expect(s.closes).toBe("2026-09-03T12:00:00.000Z");
  });

  it("solo price null when no individual signup", () => {
    const s = summarizeOpenLeagues([season({ signupModes: ["team"] })])!;
    expect(s.soloPrice).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/season-summary.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the helper**

```ts
// src/lib/locations/season-summary.ts
// Pure summarizer for the location pages' live "What's happening" league card
// and pricing band. Input is the /api/public/seasons payload (already
// early-bird-aware: effectivePrice/effectiveTeamPrice while the window is live).

interface PublicSeasonLike {
  status: string;
  termSlug?: string | null;
  dayOfWeek?: string | null;
  price?: number | null;
  effectivePrice?: number | null;
  teamPrice?: number | null;
  effectiveTeamPrice?: number | null;
  registrationCloses?: string | null;
  signupModes?: string[] | null;
  program?: { programType?: string | null } | null;
  ageGroup?: { minAge?: number | null; maxAge?: number | null } | null;
}

export interface LeagueSummary {
  divisionCount: number;
  nights: string[];
  soloPrice: number | null;
  teamPrice: number | null;
  closes: string | null;
  termSlug: string;
  termHref: string;
}

const DAY_LABEL: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

export function summarizeOpenLeagues(seasons: PublicSeasonLike[]): LeagueSummary | null {
  const open = seasons.filter(
    (s) =>
      s.status === "open" &&
      (s.program?.programType ?? "league") === "league" &&
      (s.ageGroup?.minAge ?? 0) >= 18,
  );
  if (open.length === 0) return null;

  const nights: string[] = [];
  for (const s of open) {
    const d = s.dayOfWeek ? DAY_LABEL[s.dayOfWeek] : null;
    if (d && !nights.includes(d)) nights.push(d);
  }

  const soloPrices = open
    .filter((s) => (s.signupModes ?? ["individual"]).includes("individual"))
    .map((s) => s.effectivePrice ?? s.price)
    .filter((p): p is number => p != null);
  const teamPrices = open
    .map((s) => s.effectiveTeamPrice ?? s.teamPrice)
    .filter((p): p is number => p != null);

  const closes = open
    .map((s) => s.registrationCloses)
    .filter((c): c is string => !!c)
    .sort()[0] ?? null;

  const termSlug = open[0].termSlug ?? "";
  return {
    divisionCount: open.length,
    nights,
    soloPrice: soloPrices.length ? Math.min(...soloPrices) : null,
    teamPrice: teamPrices.length ? Math.min(...teamPrices) : null,
    closes,
    termSlug,
    termHref: termSlug ? `/adult/leagues/soccer/${termSlug}` : "/adult/leagues/soccer",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/season-summary.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/locations/season-summary.ts tests/unit/season-summary.test.ts
git commit -m "feat(locations): summarizeOpenLeagues helper for live venue cards"
```

---

### Task 3: Rebuild `/locations/[slug].astro`

**Files:**
- Modify: `src/pages/locations/[slug].astro` (full rewrite of the template body; KEEP frontmatter's location DB query, 404 rewrite, canonical, breadcrumb + SportsActivityLocation JSON-LD blocks exactly as they are)
- Test: covered by Task 5 e2e + Tasks 1–2 unit tests

**Interfaces:**
- Consumes: `getVenueFacts(slug)` (Task 1), `summarizeOpenLeagues(seasons)` (Task 2), `/api/public/seasons?location=<slug>&status=open`.
- Produces: the page. No exports.

- [ ] **Step 1: Add data plumbing to frontmatter (after the existing location query)**

```ts
import { getVenueFacts } from "@/lib/locations/venue-facts";
import { summarizeOpenLeagues } from "@/lib/locations/season-summary";

const facts = getVenueFacts(slug);

// Live seasons for this venue — same-origin fetch, the [term].astro pattern.
let venueSeasons: any[] = [];
try {
  const res = await fetch(
    `${Astro.url.origin}/api/public/seasons?location=${encodeURIComponent(slug)}&status=open`,
    { headers: { cookie: Astro.request.headers.get("cookie") ?? "" } },
  );
  if (res.ok) venueSeasons = (await res.json()).seasons ?? [];
} catch (err) {
  console.error("[locations/[slug]] seasons fetch failed", err);
}
const leagueSummary = summarizeOpenLeagues(venueSeasons);
const youthOpenCount = venueSeasons.filter((s) => (s.ageGroup?.maxAge ?? 99) < 18).length;

const fullAddress = [location.addressLine1, location.addressLine2, cityState, location.postalCode]
  .filter(Boolean)
  .join(", ");
const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${location.name} ${fullAddress}`,
)}`;
const fmtCloses = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
```

- [ ] **Step 2: Replace the template body with the venue-first sections**

Keep `<BaseLayout>` wrapper, canonical, and both JSON-LD `<script type="application/ld+json">` blocks. Replace everything between with (structure — full markup written in the Aspire idiom used by the current page's classes):

```astro
<main id="main-content">
  {/* 1 · Hero — photo background + ink wash, like the [term].astro hero pattern */}
  <section class="relative text-cream pt-24 pb-10 px-6 bg-cover bg-center"
    style={`background-image:linear-gradient(180deg,oklch(0.2 0.03 100/0.72),oklch(0.2 0.03 100/0.9)),url('${facts?.heroPoster ?? "/media/soccerone/still-action.jpg"}')`}>
    <div class="max-w-[1080px] mx-auto">
      <p class="font-mono text-[11px] tracking-widest uppercase opacity-80">Aspire Sports · {cityState}</p>
      <h1 class="font-display text-5xl md:text-6xl mt-2 mb-2">Aspire in <em class="text-primary-orange-bright not-italic font-display italic">{displayLocationName}.</em></h1>
      {facts && <p class="max-w-xl text-cream/90">{facts.tagline}</p>}
      <div class="flex flex-wrap gap-3 mt-5">
        {leagueSummary && <a href={leagueSummary.termHref} class="font-sans font-semibold text-[13px] bg-primary text-cream px-5 py-3 rounded-md" data-testid="loc-hero-adult">Adult leagues →</a>}
        {facts?.offerings.youth && <a href="/youth" class="font-sans font-semibold text-[13px] border border-cream/40 text-cream px-5 py-3 rounded-md">Youth programs</a>}
        {facts?.offerings.pickup && <a href="/adult/pickup" class="font-sans font-semibold text-[13px] border border-cream/40 text-cream px-5 py-3 rounded-md">Play pickup</a>}
      </div>
    </div>
  </section>
  {/* facts ticker */}
  <div class="bg-ink text-cream/90 font-mono text-[11px] tracking-wider uppercase px-6 py-2.5">
    <div class="max-w-[1080px] mx-auto flex flex-wrap gap-x-8 gap-y-1">
      <span>{fullAddress}</span>
      {facts?.ticker.map((t) => <span>{t}</span>)}
    </div>
  </div>

  {/* 2 · What's happening — live cards; a card renders only when real */}
  <section class="py-16 px-6" aria-label="What's happening">
    <div class="max-w-[1080px] mx-auto">
      <h2 class="font-display text-3xl text-ink mb-1">What's happening</h2>
      <p class="text-ink-muted text-sm mb-8">Live from the season catalog.</p>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="whats-happening">
        {leagueSummary && (
          <a href={leagueSummary.termHref} class="block p-5 rounded-xl border border-border bg-paper hover:border-primary/40">
            <p class="font-mono text-[10px] tracking-widest uppercase text-primary font-bold">
              Open now{fmtCloses(leagueSummary.closes) ? ` · closes ${fmtCloses(leagueSummary.closes)}` : ""}
            </p>
            <h3 class="font-display text-xl text-ink mt-1">Adult leagues</h3>
            <p class="text-sm text-ink-2 mt-1">
              {leagueSummary.divisionCount} divisions · {leagueSummary.nights.join(" & ")} nights
              {leagueSummary.soloPrice != null ? ` · from $${leagueSummary.soloPrice}/player` : ""}
            </p>
            <span class="text-sm font-semibold text-primary mt-2 inline-block">See divisions & register →</span>
          </a>
        )}
        {facts?.offerings.youth && (
          <a href="/youth" class="block p-5 rounded-xl border border-border bg-paper hover:border-primary/40">
            <p class="font-mono text-[10px] tracking-widest uppercase text-ink-muted font-bold">Weekly · U6–U18</p>
            <h3 class="font-display text-xl text-ink mt-1">Youth programs</h3>
            <p class="text-sm text-ink-2 mt-1">Age-banded sessions, same coaches week over week.{youthOpenCount ? ` ${youthOpenCount} open now.` : ""}</p>
            <span class="text-sm font-semibold text-primary mt-2 inline-block">Browse youth programs →</span>
          </a>
        )}
        {facts?.offerings.pickup && (
          <a href="/adult/pickup" class="block p-5 rounded-xl border border-border bg-paper hover:border-primary/40">
            <p class="font-mono text-[10px] tracking-widest uppercase text-ink-muted font-bold">Show up & play</p>
            <h3 class="font-display text-xl text-ink mt-1">Drop-in pickup</h3>
            <p class="text-sm text-ink-2 mt-1">Balanced teams, pay per session, no commitment.</p>
            <span class="text-sm font-semibold text-primary mt-2 inline-block">See sessions →</span>
          </a>
        )}
        {facts?.offerings.rentals && (
          <a href="/rent" class="block p-5 rounded-xl border border-border bg-paper hover:border-primary/40">
            <p class="font-mono text-[10px] tracking-widest uppercase text-ink-muted font-bold">By the hour</p>
            <h3 class="font-display text-xl text-ink mt-1">Field rentals</h3>
            <p class="text-sm text-ink-2 mt-1">Training, parties, or team practice.</p>
            <span class="text-sm font-semibold text-primary mt-2 inline-block">Book a field →</span>
          </a>
        )}
      </div>
    </div>
  </section>

  {/* 3 · The facility — spec tiles + features + coming-soon chip */}
  {facts && (
    <section class="bg-cream-2 border-y border-ink/10 py-16 px-6" aria-label="The facility">
      <div class="max-w-[1080px] mx-auto">
        <h2 class="font-display text-3xl text-ink mb-8">The facility</h2>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="facility-specs">
          {facts.specs.map((sp) => (
            <div class="p-5 rounded-xl border border-border bg-paper">
              <div class="font-display text-3xl text-ink">{sp.n}</div>
              <div class="font-mono text-[10px] tracking-widest uppercase text-ink-muted mt-1">{sp.label}</div>
            </div>
          ))}
        </div>
        <ul class="mt-8 grid sm:grid-cols-2 gap-x-10 gap-y-3">
          {facts.features.map((f) => (
            <li class="text-ink-2 text-sm flex gap-2"><span class="text-primary">→</span>{f}</li>
          ))}
        </ul>
        {facts.comingSoon.length > 0 && (
          <p class="mt-6 inline-block font-mono text-[11px] tracking-wider uppercase bg-primary/10 text-primary px-3 py-1.5 rounded-full">
            Coming soon: {facts.comingSoon.join(" · ")}
          </p>
        )}
      </div>
    </section>
  )}

  {/* 4 · Inside the building */}
  {facts && facts.photos.length > 0 && (
    <section class="py-14 px-6" aria-label="Inside the building">
      <div class="max-w-[1080px] mx-auto grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-3">
        {facts.photos.map((p) => (
          <img src={p.src} alt={p.alt} loading="lazy" class="rounded-xl object-cover w-full h-44" />
        ))}
      </div>
    </section>
  )}

  {/* 5 · Season pricing band — only while a term is open */}
  {leagueSummary && (
    <section class="bg-ink text-cream py-16 px-6" aria-label="Season pricing">
      <div class="max-w-[1080px] mx-auto lg:grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
        <div>
          <h2 class="font-display text-4xl mb-3">Leagues are open at {displayLocationName}.</h2>
          <p class="text-cream/80 max-w-md">{leagueSummary.divisionCount} divisions · {leagueSummary.nights.join(" & ")} nights{fmtCloses(leagueSummary.closes) ? ` · registration closes ${fmtCloses(leagueSummary.closes)}` : ""}.</p>
        </div>
        <div class="mt-8 lg:mt-0 rounded-2xl bg-cream/5 border border-cream/15 p-6">
          {leagueSummary.soloPrice != null && (
            <div class="flex justify-between py-2 border-b border-cream/15"><span>Solo / free agent</span><b>${leagueSummary.soloPrice}</b></div>
          )}
          {leagueSummary.teamPrice != null && (
            <div class="flex justify-between py-2 border-b border-cream/15"><span>Per team</span><b>${leagueSummary.teamPrice.toLocaleString()}</b></div>
          )}
          <a href={leagueSummary.termHref} class="mt-5 block text-center font-sans font-semibold text-[13px] bg-primary text-cream px-5 py-3 rounded-md">Register →</a>
        </div>
      </div>
    </section>
  )}

  {/* 6 · Good to know — rewritten; stale answers deleted */}
  <section class="py-16 px-6" aria-label="Good to know">
    <div class="max-w-[1080px] mx-auto">
      <h2 class="font-display text-3xl text-ink mb-8">Good to know</h2>
      <div class="grid sm:grid-cols-2 gap-x-12 gap-y-7 max-w-3xl">
        <div><h3 class="font-display italic text-lg text-ink mb-1.5">Is there parking?</h3><p class="text-sm text-ink-2">{facts?.parkingNote ?? "Parking details on the venue booking page."}</p></div>
        <div><h3 class="font-display italic text-lg text-ink mb-1.5">What ages do you serve?</h3><p class="text-sm text-ink-2">{facts?.offerings.youth ? "Youth programs from U6 through U18, plus adult leagues 18 and up." : "Adult programming — 18 and up."}</p></div>
        <div><h3 class="font-display italic text-lg text-ink mb-1.5">Can I come alone?</h3><p class="text-sm text-ink-2">Yes — register solo and we place you on a team, or drop into pickup where offered.</p></div>
        <div><h3 class="font-display italic text-lg text-ink mb-1.5">Do you run year-round?</h3><p class="text-sm text-ink-2">Yes — fully indoor. No weather cancellations, no seasonal gaps.</p></div>
      </div>
    </div>
  </section>

  {/* 7 · Getting here */}
  <section class="bg-cream-2 border-y border-ink/10 py-16 px-6" aria-label="Getting here">
    <div class="max-w-[1080px] mx-auto grid lg:grid-cols-2 gap-10">
      <div class="space-y-5 text-sm text-ink-2">
        <div><p class="font-mono text-[10px] tracking-widest uppercase text-ink-muted mb-1">Address</p>{fullAddress}</div>
        {facts && <div><p class="font-mono text-[10px] tracking-widest uppercase text-ink-muted mb-1">Hours</p>{facts.hours}</div>}
        {facts && facts.directions.length > 0 && (
          <div><p class="font-mono text-[10px] tracking-widest uppercase text-ink-muted mb-1">Directions</p>
            <ol class="list-decimal ml-4 space-y-1">{facts.directions.map((d) => <li>{d}</li>)}</ol>
          </div>
        )}
        {facts && <div><p class="font-mono text-[10px] tracking-widest uppercase text-ink-muted mb-1">Parking</p>{facts.parkingNote}</div>}
        <a href={mapsHref} target="_blank" rel="noopener" class="inline-block font-sans font-semibold text-[13px] border border-ink text-ink px-5 py-2.5 rounded-md hover:bg-ink hover:text-cream transition-colors" data-testid="maps-link">Open in Google Maps →</a>
      </div>
      <img src={facts?.photos[0]?.src ?? "/media/soccerone/still-entrance.jpg"} alt={`${displayLocationName} facility`} loading="lazy" class="rounded-2xl object-cover w-full h-64 lg:h-auto" />
    </div>
  </section>

  {/* 8 · Bottom CTA band */}
  <section class="py-16 px-6 bg-ink text-cream text-center" aria-label="Get started">
    <h2 class="font-display text-4xl mb-6">Ready to play at {displayLocationName}?</h2>
    <div class="flex flex-wrap justify-center gap-3">
      {leagueSummary && <a href={leagueSummary.termHref} class="font-sans font-semibold text-[13px] bg-primary text-cream px-6 py-3 rounded-md">Register for leagues →</a>}
      {facts?.offerings.youth && <a href="/youth" class="font-sans font-semibold text-[13px] border border-cream/40 px-6 py-3 rounded-md">Youth programs</a>}
      {facts?.offerings.pickup && <a href="/adult/pickup" class="font-sans font-semibold text-[13px] border border-cream/40 px-6 py-3 rounded-md">Play pickup</a>}
      {facts?.offerings.rentals && <a href="/rent" class="font-sans font-semibold text-[13px] border border-cream/40 px-6 py-3 rounded-md">Book a field</a>}
    </div>
  </section>
</main>
```

Delete the old Adult/Youth split sections, "What you get", the old About FAQ (including the "address publishes once partnership terms finalize" answer and the `{{TBD}}` bullet), and any `/programs?…` hrefs. Verify `/rent` is the live rentals route (`ls src/pages/rent*`) — if the Aspire rentals page lives elsewhere, use that path.

- [ ] **Step 3: Verify locally in a browser**

Run: `./scripts/with-bws.sh npx astro dev --port 4333`, open `http://localhost:4333/locations/<a-staging-slug>` (get a slug from `http://localhost:4333/locations`). Staging slugs have no venue-facts entry — confirm the page renders hero + live cards with facts sections absent, no errors. Then `grep`-check the output: `curl -s http://localhost:4333/locations/<slug> | grep -c '{{'` → `0`.

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add "src/pages/locations/[slug].astro"
git commit -m "feat(locations): venue-first location page — live cards, facility facts, getting-here"
```

---

### Task 4: Rebuild `/locations` index

**Files:**
- Modify: `src/pages/locations/index.astro`

**Interfaces:**
- Consumes: `getPublicLocations(orgId)` (existing), `getVenueFacts(slug)` (Task 1), `summarizeOpenLeagues` (Task 2), `/api/public/seasons?location=<slug>&status=open` per location.

- [ ] **Step 1: Extend frontmatter**

```ts
import { getVenueFacts } from "@/lib/locations/venue-facts";
import { summarizeOpenLeagues } from "@/lib/locations/season-summary";

const enriched = await Promise.all(
  locations.map(async (loc) => {
    let seasons: any[] = [];
    try {
      const res = await fetch(
        `${Astro.url.origin}/api/public/seasons?location=${encodeURIComponent(loc.slug)}&status=open`,
        { headers: { cookie: Astro.request.headers.get("cookie") ?? "" } },
      );
      if (res.ok) seasons = (await res.json()).seasons ?? [];
    } catch { /* card renders without live chip */ }
    return {
      ...loc,
      facts: getVenueFacts(loc.slug),
      openCount: seasons.length,
      league: summarizeOpenLeagues(seasons),
    };
  }),
);
```

- [ ] **Step 2: Replace the card grid**

```astro
<h1 class="font-display text-ink mb-3" style="font-size: clamp(2rem, 5vw, 3.5rem); letter-spacing: -0.025em;">Where we play.</h1>
<p class="text-lg text-ink-muted max-w-2xl mb-10">Indoor venues across central Ohio — year-round, rain or shine.</p>
<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
  {enriched.map((loc) => (
    <div class="rounded-2xl border border-border bg-paper overflow-hidden">
      <a href={`/locations/${loc.slug}`}>
        <img src={loc.facts?.photos[0]?.src ?? "/media/soccerone/still-action.jpg"} alt={`${loc.name} facility`} loading="lazy" class="w-full h-44 object-cover" />
      </a>
      <div class="p-6">
        <a href={`/locations/${loc.slug}`} class="font-display text-2xl text-ink hover:text-primary">{loc.name}</a>
        <p class="font-mono text-[10px] tracking-widest uppercase text-ink-muted mt-1">
          {[loc.city, loc.state].filter(Boolean).join(", ")}
        </p>
        <div class="flex flex-wrap gap-2 mt-4">
          {loc.openCount > 0 && <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-sage/15 text-sage">● {loc.openCount} programs open</span>}
          {loc.facts?.specs.slice(0, 2).map((sp) => (
            <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-cream-2 text-ink-2">{sp.n} {sp.label.split("·")[0].trim().toLowerCase()}</span>
          ))}
        </div>
        <div class="flex flex-wrap gap-2.5 mt-5">
          {loc.league ? (
            <a href={loc.league.termHref} class="font-sans font-semibold text-xs bg-primary text-cream px-4 py-2.5 rounded-md">Adult leagues →</a>
          ) : loc.facts?.offerings.pickup ? (
            <a href="/adult/pickup" class="font-sans font-semibold text-xs bg-primary text-cream px-4 py-2.5 rounded-md">Play pickup →</a>
          ) : null}
          <a href={`/locations/${loc.slug}`} class="font-sans font-semibold text-xs border border-border text-ink px-4 py-2.5 rounded-md hover:border-primary/40">Venue page</a>
        </div>
      </div>
    </div>
  ))}
</div>
```

Keep the `locations.length === 0` empty state and `setMarketingEdgeCache`.

- [ ] **Step 3: Verify in browser + type check**

Open `http://localhost:4333/locations` — cards show photo, chips, CTAs. Run `npx tsc --noEmit` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/locations/index.astro
git commit -m "feat(locations): index cards with photo, live program chips, direct CTAs"
```

---

### Task 5: E2E spec + full verification

**Files:**
- Create: `tests/e2e/location-pages.spec.ts`
- Verify: no other spec greps for the removed copy (`grep -rn "What you get\|Aspire in" tests/e2e/` → update any hits)

**Interfaces:**
- Consumes: pages from Tasks 3–4. Uses `waitForHydration` NOT required (no islands); use `domcontentloaded`.

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/location-pages.spec.ts
import { test, expect } from "@playwright/test";

// Venue pages are data-driven: resolve a real location slug from the index
// rather than hardcoding prod-only slugs (staging uses fixture locations).
async function firstLocationSlug(page): Promise<string | null> {
  await page.goto("/locations", { waitUntil: "domcontentloaded" });
  const href = await page
    .locator('a[href^="/locations/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  return href ? href.replace("/locations/", "") : null;
}

test("locations index renders venue cards with CTAs", async ({ page }) => {
  await page.goto("/locations", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /where we play/i })).toBeVisible();
  const venueLinks = page.locator('a[href^="/locations/"]');
  expect(await venueLinks.count()).toBeGreaterThan(0);
});

test("venue page renders venue-first sections with no template placeholders", async ({ page }) => {
  const slug = await firstLocationSlug(page);
  test.skip(!slug, "no public locations in this env");
  const res = await page.goto(`/locations/${slug}`, { waitUntil: "domcontentloaded" });
  expect(res!.status()).toBe(200);
  // Hero renders the venue name
  await expect(page.locator("h1")).toContainText(/Aspire in/i);
  // What's-happening grid exists (cards depend on live data; grid always renders)
  await expect(page.getByTestId("whats-happening")).toBeVisible();
  // No raw template placeholders, ever
  const body = await page.content();
  expect(body).not.toContain("{{");
  expect(body).not.toMatch(/TBD/);
  // No CTA points at /programs
  const programsLinks = await page.locator('#main-content a[href^="/programs"]').count();
  expect(programsLinks).toBe(0);
});

test("venue page 404s unknown slugs (no redirect)", async ({ page }) => {
  const res = await page.goto("/locations/loc-does-not-exist", { waitUntil: "domcontentloaded" });
  expect(res!.status()).toBe(404);
});
```

- [ ] **Step 2: Run the new spec**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4333 npx playwright test tests/e2e/location-pages.spec.ts --reporter=line`
Expected: 3 passed (dev server from Task 3 still running)

- [ ] **Step 3: Grep for other affected specs and stale references**

Run: `grep -rln "locations/" tests/e2e/ | xargs grep -l "What you get\|programs?location" 2>/dev/null`
Expected: no hits (fix any that appear). Also run `grep -rn "programs?location" src/` — remaining hits must be outside `src/pages/locations/`.

- [ ] **Step 4: Full local gate**

```bash
npx tsc --noEmit                                    # 0 errors
./scripts/with-bws.sh npm run build                 # green
PLAYWRIGHT_BASE_URL=http://localhost:4333 npx playwright test \
  tests/e2e/location-pages.spec.ts tests/e2e/public-pages.spec.ts \
  tests/e2e/landing-pages.spec.ts --reporter=line   # all pass
npx vitest run tests/unit/venue-facts.test.ts tests/unit/season-summary.test.ts
```

- [ ] **Step 5: Commit, push, PR**

```bash
git add tests/e2e/location-pages.spec.ts
git commit -m "test(locations): e2e coverage for venue-first pages (placeholder ban, CTA targets)"
git push -u origin feat/location-pages-venue-first
gh pr create --title "feat(locations): venue-first location pages" --body "Implements docs/superpowers/specs/2026-07-21-location-pages-venue-first-design.md — see spec for facts + structure. 🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Wait for CI green before declaring done. Prod verification after merge: `/locations/worthington` shows "2" turf fields, futsal coming-soon chip, live fall-league card with price; `curl | grep -c '{{'` → 0.
