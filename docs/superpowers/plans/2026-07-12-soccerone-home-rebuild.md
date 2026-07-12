# SoccerOne Homepage Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `src/pages/soccerone/index.astro` per the approved v4 mockup — live fall-league registration in the hero, tonight's pickup strip, futsal launch band, youth weekend leagues, social proof (gated on real content), sponsor/hiring split band, and an email/WhatsApp signup strip — while removing the facility selector cards, "By the Numbers" band, and "Two Facilities. One Network." section.

**Architecture:** The page stays SSR (`prerender = false`) behind the 60s marketing edge cache. Season data is fetched server-side from the org-scoped `/api/public/seasons` (same pattern as `leagues.astro`); the tonight strip and signup strip are small React islands (client-side fetch avoids stale-while-revalidate showing yesterday's "tonight"). All new sections are conditional: no open season → no hero season card and no fall CTA band; no curated reviews → no social proof section; no sessions today → the tonight strip renders nothing.

**Tech Stack:** Astro 5 page + scoped `<style>`, React 19 islands (`client:load`), Drizzle-backed public APIs, Vitest (unit + API), Playwright (e2e).

## Global Constraints

- **No eyebrow text** — per `docs/design-system.md` Editorial patterns: no kicker labels above headlines. Status/date info goes in docked corner chips, meta rows, or body copy.
- **The approved visual spec is the v4 mockup**: `/private/tmp/claude-501/-Volumes-MahadData-Aspire-Sports-web-app/6f2b6396-f6f2-448e-ba3c-c8dfa1f3f1db/scratchpad/soccerone-home-mockup.html`. Markup in this plan is extracted from it; when in doubt, match the mockup (minus the review-bar/annotation chrome, which is mockup-only).
- **No fabricated content**: futsal court count is "multiple" (exact count TBD from owner); reviews section ships EMPTY and hidden; no invented review quotes or ratings may ship.
- **Live CTAs hide when data is absent** — never render a register button with no season behind it.
- `setMarketingEdgeCache(Astro)` must be called AFTER all data fetches in frontmatter (failed render must not be cached).
- SoccerOne tokens come from `src/styles/soccerone-tokens.css` (`--so-lime`, `--so-font-display`, etc.). New accents added there, not inline hex.
- React islands must NOT rely on Astro scoped styles (they don't reach islands — known prod incident). Islands style themselves inline/via their own `<style>`.
- Existing route paths on SoccerOne hosts: `/leagues`, `/pickup`, `/rent`, `/memberships`, `/sponsors`, `/careers`, `/join`, `/worthington`, `/downtown`, `/register/{seasonId}`. Futsal has no page yet — futsal CTAs go to `/#futsal` (the band) and `/join?src=futsal-launch` (first-access list).
- Youth **leagues** run Saturday & Sunday mornings and are live. Youth **classes/clinics/academies** are still "coming 2027" — do not claim classes exist.
- Work happens in a worktree on branch `feat/soccerone-home-rebuild` (create via `superpowers:using-git-worktrees` before Task 1). All commands below run from the worktree root.
- Commits end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- API + e2e test runs need the dev server up: `npm run dev:bws` (with `E2E_TEST_ENDPOINTS=yes R2_MOCK=1` in the server shell for the full suites; the tasks below only need the plain server).

---

### Task 1: Expose `registrationCloses` on the public seasons API

The hero status chip ("OPEN · CLOSES AUG 30") needs the registration deadline. The `seasons` table already has `registrationCloses` (used in the API's SQL filter at `src/pages/api/public/seasons.ts:89`) but the response mapper omits it.

**Files:**
- Modify: `src/pages/api/public/seasons.ts` (response mapper, ~line 140)
- Test: `tests/api/public-seasons-registration-closes.test.ts` (create)

**Interfaces:**
- Produces: every season object in `GET /api/public/seasons` responses gains `registrationCloses: string | null`. NOTE (amended after Task 1 review): the column is a `timestamp`, not a `date` — Drizzle returns a JS `Date` and `JSON.stringify` serializes it as a full ISO-8601 instant (e.g. `2026-08-30T23:59:59.000Z`), nullable. Consumers must parse with `new Date(...)` and format with an explicit `timeZone` (org-local `America/New_York`). Task 6 consumes it.

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/public-seasons-registration-closes.test.ts
import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";

describe("GET /api/public/seasons", () => {
  it("includes registrationCloses on every season", async () => {
    const res = await fetch(`${BASE}/api/public/seasons`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.seasons)).toBe(true);
    for (const season of body.seasons) {
      expect(season).toHaveProperty("registrationCloses");
      // Timestamp column: null or an ISO-8601 string Date can parse.
      if (season.registrationCloses !== null) {
        expect(typeof season.registrationCloses).toBe("string");
        expect(Number.isNaN(new Date(season.registrationCloses).getTime())).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails** (dev server must be running)

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/public-seasons-registration-closes.test.ts --config vitest.api.config.ts`
(If the repo's API tests use a different config file, mirror whatever `npm run test:api` invokes — check `package.json` — and run just this file.)
Expected: FAIL — seasons objects have no `registrationCloses` key. (If the seeded DB returns zero seasons the loop is vacuous and the test passes trivially; in that case run `npm run db:seed:e2e` first so at least one season exists.)

- [ ] **Step 3: Add the field to the response mapper**

In `src/pages/api/public/seasons.ts`, in the `formatted = rows.map(...)` return object, directly after `endDate: r.season.endDate,` add:

```ts
        registrationCloses: r.season.registrationCloses,
```

- [ ] **Step 4: Run test to verify it passes**

Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/public/seasons.ts tests/api/public-seasons-registration-closes.test.ts
git commit -m "feat(api): expose registrationCloses on public seasons response

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: New accent tokens + curated reviews content module

**Files:**
- Modify: `src/styles/soccerone-tokens.css`
- Create: `src/lib/soccerone/home-reviews.ts`

**Interfaces:**
- Produces: CSS custom properties `--so-amber`, `--so-amber-a25`, `--so-sky`, `--so-sky-soft`, `--so-sky-a25` available on SoccerOne pages; `HOME_GOOGLE_RATING: { score: string; source: string } | null` and `HOME_REVIEWS: HomeReview[]` consumed by Task 7 (section renders only when `HOME_REVIEWS.length > 0 && HOME_GOOGLE_RATING`).

- [ ] **Step 1: Add tokens**

In `src/styles/soccerone-tokens.css`, after the existing `--so-lime*` definitions, add:

```css
  /* Complementary accents (2026-07 homepage rebuild) — amber for commerce/
     sponsorship surfaces, sky for people/hiring surfaces. Lime stays the
     primary brand voice; these appear only on secondary bands. */
  --so-amber: #fbbf24;
  --so-amber-a25: rgba(251, 191, 36, 0.25);
  --so-sky: #38bdf8;
  --so-sky-soft: #7dd3fc;
  --so-sky-a25: rgba(56, 189, 248, 0.25);
```

- [ ] **Step 2: Create the reviews content module**

```ts
// src/lib/soccerone/home-reviews.ts
// Curated Google-review quotes for the homepage social-proof section.
// Content policy: only real reviews, copied verbatim (light trimming OK),
// from the facilities' Google Business profiles. The section is hidden
// until this file is populated — never ship placeholder quotes.

export interface HomeReview {
  quote: string;
  /** Reviewer first name + last initial, e.g. "Marcus T." */
  name: string;
  /** Context chip, e.g. "LEAGUE PLAYER", "PICKUP REGULAR", "YOUTH PARENT" */
  context: string;
  /** 1–5 */
  stars: number;
}

/** Aggregate rating shown next to the section title. Null hides the section. */
export const HOME_GOOGLE_RATING: { score: string; source: string } | null = null;

export const HOME_REVIEWS: HomeReview[] = [];
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/styles/soccerone-tokens.css src/lib/soccerone/home-reviews.ts
git commit -m "feat(soccerone): amber/sky accent tokens + gated home-reviews content module

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Tonight-window helpers (pure, unit-tested)

**Files:**
- Create: `src/lib/soccerone/tonight.ts`
- Test: `tests/unit/soccerone-tonight.test.ts`

**Interfaces:**
- Produces (consumed by Task 4):
  - `todayWindow(now?: Date, tz?: string): { fromIso: string; toIso: string }` — from "now" until the next local midnight in the org timezone.
  - `formatSessionTime(iso: string, tz?: string): string` — `"7:00 PM"`.
  - `formatTodayLabel(now?: Date, tz?: string): string` — `"SAT JUL 12"`.
  - `facilityLabel(venueName: string | null): string` — `"Worthington"` / `"Downtown"` / raw name / `""`.
  - `skillChip(level: "recreational" | "intermediate" | "advanced" | "all_levels"): string` — `"REC" | "INTERMEDIATE" | "ADVANCED" | "OPEN"`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/soccerone-tonight.test.ts
import { describe, it, expect } from "vitest";
import {
  todayWindow,
  formatSessionTime,
  formatTodayLabel,
  facilityLabel,
  skillChip,
} from "@/lib/soccerone/tonight";

describe("todayWindow", () => {
  it("spans from now until the next local midnight in America/New_York", () => {
    // 2026-07-12T18:00:00Z == 2:00 PM EDT on Sat Jul 12.
    const now = new Date("2026-07-12T18:00:00Z");
    const { fromIso, toIso } = todayWindow(now);
    expect(fromIso).toBe(now.toISOString());
    // Local midnight (2026-07-13 00:00 EDT) == 2026-07-13T04:00:00Z.
    expect(toIso).toBe("2026-07-13T04:00:00.000Z");
  });

  it("handles late-night now (11 PM local)", () => {
    // 2026-07-13T03:00:00Z == 11:00 PM EDT on Sun Jul 12.
    const now = new Date("2026-07-13T03:00:00Z");
    const { toIso } = todayWindow(now);
    expect(toIso).toBe("2026-07-13T04:00:00.000Z");
  });
});

describe("formatSessionTime", () => {
  it("formats an ISO instant as a local time", () => {
    expect(formatSessionTime("2026-07-12T23:00:00Z")).toBe("7:00 PM");
  });
});

describe("formatTodayLabel", () => {
  it("formats the local date as an uppercase short label", () => {
    expect(formatTodayLabel(new Date("2026-07-12T18:00:00Z"))).toBe("SAT JUL 12");
  });
});

describe("facilityLabel", () => {
  it("maps venue names to short facility labels", () => {
    expect(facilityLabel("SoccerOne Worthington — Field 2")).toBe("Worthington");
    expect(facilityLabel("Downtown Columbus Court")).toBe("Downtown");
    expect(facilityLabel("Starr Ave Indoor")).toBe("Downtown");
    expect(facilityLabel("Some Other Venue")).toBe("Some Other Venue");
    expect(facilityLabel(null)).toBe("");
  });
});

describe("skillChip", () => {
  it("maps API skill levels to display chips", () => {
    expect(skillChip("recreational")).toBe("REC");
    expect(skillChip("intermediate")).toBe("INTERMEDIATE");
    expect(skillChip("advanced")).toBe("ADVANCED");
    expect(skillChip("all_levels")).toBe("OPEN");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/soccerone-tonight.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/soccerone/tonight.ts
// Pure helpers for the homepage "pickup tonight" strip. SoccerOne is a
// Columbus, OH business — "tonight" means the org's local calendar day,
// not the viewer's. All timestamps in the DB/API are UTC instants.

const SO_TZ = "America/New_York";

function tzClock(d: Date, tz: string): { hour: number; minute: number; second: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  );
  return { hour: +parts.hour, minute: +parts.minute, second: +parts.second };
}

export function todayWindow(
  now: Date = new Date(),
  tz: string = SO_TZ,
): { fromIso: string; toIso: string } {
  const { hour, minute, second } = tzClock(now, tz);
  const secsIntoDay = hour * 3600 + minute * 60 + second;
  const msIntoDay = secsIntoDay * 1000 + now.getMilliseconds();
  const endOfDay = new Date(now.getTime() + (86_400_000 - msIntoDay));
  return { fromIso: now.toISOString(), toIso: endOfDay.toISOString() };
}

export function formatSessionTime(iso: string, tz: string = SO_TZ): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTodayLabel(now: Date = new Date(), tz: string = SO_TZ): string {
  return now
    .toLocaleDateString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .replace(/,/g, "")
    .toUpperCase();
}

export function facilityLabel(venueName: string | null): string {
  if (!venueName) return "";
  if (/worthington/i.test(venueName)) return "Worthington";
  if (/downtown|starr/i.test(venueName)) return "Downtown";
  return venueName;
}

export function skillChip(
  level: "recreational" | "intermediate" | "advanced" | "all_levels",
): string {
  switch (level) {
    case "recreational": return "REC";
    case "intermediate": return "INTERMEDIATE";
    case "advanced":     return "ADVANCED";
    case "all_levels":   return "OPEN";
  }
}
```

Note on the DST edge: `todayWindow` assumes a 24h day, so on the two DST transition days the window end drifts by an hour. For a "sessions tonight" strip that's harmless (sessions end by midnight); do not add a tz library for it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/soccerone-tonight.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/soccerone/tonight.ts tests/unit/soccerone-tonight.test.ts
git commit -m "feat(soccerone): tonight-window helpers for homepage pickup strip

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `HomeTonightStrip` island

**Files:**
- Create: `src/components/soccerone/HomeTonightStrip.tsx`

**Interfaces:**
- Consumes: `todayWindow`, `formatSessionTime`, `formatTodayLabel`, `facilityLabel`, `skillChip` from `@/lib/soccerone/tonight`; `GET /api/dropin/sessions?from=&to=` (shape documented in `src/components/soccerone/PickupGames.tsx:9-36` — uses `id`, `kind`, `startsAt`, `skillLevel`, `venueName`).
- Produces: default-export React component `<HomeTonightStrip />`, mounted `client:load` by Task 6. Renders `null` while loading, on error, or when no pickup sessions remain today — the strip simply doesn't exist in those states.
- Calls `useHydrationBeacon()` (repo Playwright convention) since it's the page's top-most `client:load` island.

- [ ] **Step 1: Implement the component**

```tsx
// src/components/soccerone/HomeTonightStrip.tsx
"use client";

import { useEffect, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import {
  todayWindow,
  formatSessionTime,
  formatTodayLabel,
  facilityLabel,
  skillChip,
} from "@/lib/soccerone/tonight";

interface StripSession {
  id: string;
  kind: "pickup" | "class";
  startsAt: string;
  skillLevel: "recreational" | "intermediate" | "advanced" | "all_levels";
  venueName: string | null;
}

const MAX_SESSIONS = 4;

// NOTE: this island styles itself — Astro scoped styles do not reach React
// islands (known prod incident; see memory/design docs).
const S = {
  strip: {
    background: "#0c0c10",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  } as React.CSSProperties,
  inner: {
    maxWidth: 1400,
    margin: "0 auto",
    padding: "1rem 2rem",
    display: "flex",
    alignItems: "center",
    gap: "1.5rem",
    flexWrap: "wrap",
  } as React.CSSProperties,
  label: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    fontFamily: "var(--so-font-mono)",
    fontSize: "0.6875rem",
    fontWeight: 600,
    letterSpacing: "0.12em",
    color: "var(--so-lime)",
    flexShrink: 0,
  } as React.CSSProperties,
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--so-lime)",
    boxShadow: "0 0 8px var(--so-lime)",
  } as React.CSSProperties,
  sessions: {
    display: "flex",
    alignItems: "center",
    gap: "1.25rem",
    flexWrap: "wrap",
    flex: 1,
  } as React.CSSProperties,
  item: { display: "inline-flex", alignItems: "baseline", gap: "0.5rem", fontSize: "0.875rem" } as React.CSSProperties,
  time: { fontFamily: "var(--so-font-mono)", fontSize: "0.8125rem", color: "#fff", fontWeight: 600 } as React.CSSProperties,
  place: { color: "rgba(255,255,255,0.55)" } as React.CSSProperties,
  level: {
    fontFamily: "var(--so-font-mono)",
    fontSize: "0.5625rem",
    letterSpacing: "0.08em",
    color: "rgba(163,230,53,0.7)",
    border: "1px solid rgba(163,230,53,0.25)",
    padding: "1px 6px",
    borderRadius: 3,
  } as React.CSSProperties,
  divider: { width: 1, height: 16, background: "rgba(255,255,255,0.12)", alignSelf: "center" } as React.CSSProperties,
  cta: {
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: "var(--so-lime)",
    textDecoration: "none",
    whiteSpace: "nowrap",
    flexShrink: 0,
  } as React.CSSProperties,
};

export default function HomeTonightStrip() {
  useHydrationBeacon();
  const [sessions, setSessions] = useState<StripSession[] | null>(null);

  useEffect(() => {
    const { fromIso, toIso } = todayWindow();
    const qs = new URLSearchParams({ from: fromIso, to: toIso });
    fetch(`/api/dropin/sessions?${qs}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`${res.status}`))))
      .then((body) => {
        const pickup = (body.sessions ?? []).filter(
          (s: StripSession) => s.kind === "pickup",
        );
        setSessions(pickup.slice(0, MAX_SESSIONS));
      })
      .catch(() => setSessions([]));
  }, []);

  // Loading, error, and no-sessions-tonight all collapse to nothing — the
  // strip is a bonus, never a broken band.
  if (!sessions || sessions.length === 0) return null;

  return (
    <div style={S.strip} data-testid="tonight-strip">
      <div style={S.inner}>
        <span style={S.label}>
          <span style={S.dot} />
          PICKUP TONIGHT · {formatTodayLabel()}
        </span>
        <div style={S.sessions}>
          {sessions.map((s, i) => (
            <span key={s.id} style={{ display: "contents" }}>
              {i > 0 && <span style={S.divider} />}
              <span style={S.item}>
                <span style={S.time}>{formatSessionTime(s.startsAt)}</span>
                <span style={S.place}>{facilityLabel(s.venueName)}</span>
                <span style={S.level}>{skillChip(s.skillLevel)}</span>
              </span>
            </span>
          ))}
        </div>
        <a href="/pickup" style={S.cta}>
          All sessions &amp; drop-in rates →
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/soccerone/HomeTonightStrip.tsx
git commit -m "feat(soccerone): live pickup-tonight strip island for homepage

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `HomeSignupStrip` island

**Files:**
- Create: `src/components/soccerone/HomeSignupStrip.tsx`

**Interfaces:**
- Consumes: `POST /api/public/newsletter` with body `{ email, brand: "soccerone", source: "home-strip" }` (schema in `src/pages/api/public/newsletter.ts:10-18`; success = 2xx JSON, rate-limited = 429).
- Produces: default-export React component `<HomeSignupStrip />`, mounted `client:load` by Task 7. WhatsApp path is a plain link to `/join?src=home-whatsapp` (the existing join page owns channel selection).

- [ ] **Step 1: Implement the component**

```tsx
// src/components/soccerone/HomeSignupStrip.tsx
"use client";

import { useState } from "react";

type Status = "idle" | "sending" | "done" | "error";

// Island styles itself — Astro scoped styles don't reach React islands.
const S = {
  strip: { background: "#101014", borderTop: "1px solid rgba(255,255,255,0.08)" } as React.CSSProperties,
  inner: {
    maxWidth: 1400,
    margin: "0 auto",
    padding: "2.5rem 2rem",
    display: "flex",
    alignItems: "center",
    gap: "2rem",
    flexWrap: "wrap",
  } as React.CSSProperties,
  text: { flex: 1, minWidth: 260 } as React.CSSProperties,
  title: {
    fontFamily: "var(--so-font-display)",
    fontSize: "1.75rem",
    lineHeight: 1,
    textTransform: "uppercase",
    letterSpacing: "0.01em",
    marginBottom: "0.375rem",
    color: "#fff",
  } as React.CSSProperties,
  sub: { fontSize: "0.9375rem", color: "rgba(255,255,255,0.45)" } as React.CSSProperties,
  form: { display: "flex", gap: "0.625rem", flexWrap: "wrap", alignItems: "center" } as React.CSSProperties,
  input: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 6,
    color: "#fff",
    fontFamily: "var(--so-font-body)",
    fontSize: "0.9375rem",
    padding: "0.8rem 1.1rem",
    width: 260,
    maxWidth: "100%",
  } as React.CSSProperties,
  btn: {
    background: "var(--so-lime)",
    color: "#0a0a0d",
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--so-font-body)",
    fontSize: "0.9375rem",
    fontWeight: 700,
    letterSpacing: "0.03em",
    padding: "0.8rem 1.5rem",
    borderRadius: 6,
  } as React.CSSProperties,
  or: {
    fontFamily: "var(--so-font-mono)",
    fontSize: "0.625rem",
    letterSpacing: "0.08em",
    color: "rgba(255,255,255,0.35)",
  } as React.CSSProperties,
  wa: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    border: "1.5px solid rgba(37,211,102,0.5)",
    color: "#4ade80",
    fontSize: "0.875rem",
    fontWeight: 600,
    textDecoration: "none",
    padding: "0.7rem 1.25rem",
    borderRadius: 6,
  } as React.CSSProperties,
  note: { width: "100%", fontSize: "0.8125rem", marginTop: "0.25rem" } as React.CSSProperties,
};

export default function HomeSignupStrip() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || status === "sending") return;
    setStatus("sending");
    try {
      const res = await fetch("/api/public/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, brand: "soccerone", source: "home-strip" }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section style={S.strip} data-testid="signup-strip">
      <div style={S.inner}>
        <div style={S.text}>
          <div style={S.title}>Never miss a kickoff.</div>
          <p style={S.sub}>
            Schedules, open-spot alerts, and a welcome code — plus first word when futsal opens.
          </p>
        </div>
        {status === "done" ? (
          <p style={{ ...S.note, color: "var(--so-lime)", width: "auto" }}>
            You're in — check your inbox for the welcome code.
          </p>
        ) : (
          <form style={S.form} onSubmit={submit}>
            <input
              type="email"
              required
              style={S.input}
              placeholder="you@email.com"
              aria-label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" style={S.btn} disabled={status === "sending"}>
              {status === "sending" ? "Signing up…" : "Sign Up"}
            </button>
            <span style={S.or}>OR</span>
            <a href="/join?src=home-whatsapp" style={S.wa}>
              Join on WhatsApp
            </a>
            {status === "error" && (
              <span style={{ ...S.note, color: "#fda4af" }}>
                That didn't go through — try again, or use the WhatsApp option.
              </span>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/soccerone/HomeSignupStrip.tsx
git commit -m "feat(soccerone): email/WhatsApp signup strip island for homepage

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Homepage rewrite — frontmatter data + hero

Rewrite the top of `src/pages/soccerone/index.astro`: server-side season fetch, then the hero with the season card (docked status chip), futsal teaser (docked date chip), and the location line replacing the facility selector cards.

**Files:**
- Modify: `src/pages/soccerone/index.astro`

**Interfaces:**
- Consumes: `/api/public/seasons?audience=adult|youth` (fields: `id`, `name`, `startDate`, `registrationCloses` [Task 1], `signupMode`, `price`, `teamPrice`, `divisionGender`, `skillLevel`, `termSlug`, `signupModes`, `location.slug`); `HomeTonightStrip` (Task 4).
- Produces for Task 7: frontmatter consts `featured` (adult first, youth fallback), `youthOpen: boolean`, `featuredStart: string | null` (e.g. "Mon, Sep 14"), `featuredCloses: string | null` (e.g. "Sun Aug 30"), plus the existing imports. Register CTAs carry `data-so-register-cta` + dataset attrs and link `/register/{featured.id}` — the analytics `<script>` is added in Task 7.

- [ ] **Step 1: Replace the frontmatter**

Replace the entire frontmatter block (current lines 1–9) with:

```astro
---
export const prerender = false;
import BaseLayout from '@/layouts/BaseLayout.astro';
import SoccerOneHeader from '@/components/soccerone/SoccerOneHeader.astro';
import SoccerOneFooter from '@/components/soccerone/SoccerOneFooter.astro';
import HomeTonightStrip from '@/components/soccerone/HomeTonightStrip';
import HomeSignupStrip from '@/components/soccerone/HomeSignupStrip';
import { SOCCERONE_CONTACT_EMAIL } from '@/lib/soccerone/contact';
import { HOME_GOOGLE_RATING, HOME_REVIEWS } from '@/lib/soccerone/home-reviews';

// Live season data — same org-scoped fetch + filters as leagues.astro.
// The homepage features the first upcoming open ADULT season (youth as
// fallback) and separately tracks whether any youth season is open so the
// Youth Leagues card can show a live "now registering" state.
async function fetchOpenSeasons(audience: 'adult' | 'youth') {
  try {
    const url = new URL('/api/public/seasons', Astro.url);
    url.searchParams.set('audience', audience);
    const res = await fetch(url, {
      headers: { Host: Astro.request.headers.get('host') ?? '' },
    });
    if (!res.ok) return [];
    const body = await res.json();
    const todayIso = new Date().toISOString().slice(0, 10);
    return (body.seasons ?? [])
      .filter((s: any) => s.signupMode !== 'interest')
      .filter((s: any) => !s.startDate || String(s.startDate).slice(0, 10) >= todayIso);
  } catch (err) {
    console.error(`[soccerone/home] failed to load ${audience} seasons`, err);
    return [];
  }
}

const [adultSeasons, youthSeasons] = await Promise.all([
  fetchOpenSeasons('adult'),
  fetchOpenSeasons('youth'),
]);

const featured = adultSeasons[0] ?? youthSeasons[0] ?? null;
const youthOpen = youthSeasons.length > 0;

// startDate is a date-only column ("YYYY-MM-DD"): parsing yields UTC
// midnight, so format in UTC or the day shifts in negative-offset zones.
const featuredStart = featured?.startDate
  ? new Date(featured.startDate).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    })
  : null;
// registrationCloses is a timestamp (full ISO instant): display the
// deadline in the org's local timezone, not the server's.
const featuredCloses = featured?.registrationCloses
  ? new Date(featured.registrationCloses).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York',
    })
  : null;
const featuredPrice = featured
  ? (featured.teamPrice
      ? `$${featured.price}/player · $${featured.teamPrice}/team`
      : `$${featured.price}/player`)
  : null;

import { setMarketingEdgeCache } from '@/lib/http/edge-cache';
setMarketingEdgeCache(Astro); // AFTER fetches — never cache a failed render
---
```

Also update the `<BaseLayout>` `description` attribute to:

```
description="Columbus's indoor soccer chain. Adult leagues, youth weekend leagues, pickup, and field rentals at Worthington (3 fields) and Downtown (1 field). Futsal courts open September."
```

- [ ] **Step 2: Rewrite the hero content**

Keep the `<section class="hero">` shell, the video `hero-bg`, `hero-accent-stripe`, and `hero-scroll` exactly as they are. Inside `.hero-content`, keep the `<h1 class="hero-headline">` block unchanged, then replace everything from `<p class="hero-sub">` through the closing `</div>` of `.hero-facility-selector` with:

```astro
        <p class="hero-sub">
          Indoor soccer across <span class="hero-loc">Worthington &amp; Downtown Columbus</span> —
          adult leagues, pickup, and rentals every night, youth leagues on weekend mornings.
          Futsal courts arrive this September.
        </p>

        <!-- What's open now + what's next -->
        <div class="hero-actions">
          {featured && (
            <div class="season-card">
              <span class="status-dock">
                <span class="status-dock-dot" aria-hidden="true"></span>
                OPEN{featuredCloses ? ` · CLOSES ${featuredCloses.toUpperCase()}` : ''}
              </span>
              <div>
                <div class="season-name">{featured.name}</div>
                <div class="season-meta">
                  <span><b>Adult:</b> Coed · Premier · Women's</span>
                  {youthOpen && <span><b>Youth:</b> Sat &amp; Sun mornings</span>}
                  {featuredStart && <span>Kicks off <b>{featuredStart}</b></span>}
                  {featuredPrice && <span>{featuredPrice}</span>}
                </div>
              </div>
              <div class="season-cta-row">
                <a
                  href={`/register/${featured.id}`}
                  class="season-cta"
                  data-so-register-cta
                  data-season-id={featured.id}
                  data-level={featured.skillLevel ?? 'open'}
                  data-gender={featured.divisionGender ?? 'unknown'}
                  data-venue={featured.location?.slug ?? ''}
                  data-term={featured.termSlug ?? ''}
                  data-mode={featured.signupModes?.includes('team') ? 'team' : 'individual'}
                >
                  Register for Fall →
                </a>
                <span class="season-cta-note">Team &amp; free-agent spots · both facilities</span>
              </div>
            </div>
          )}

          <a href="#futsal" class="futsal-card">
            <span class="date-dock">SEP '26</span>
            <div class="futsal-title">Futsal courts at Worthington</div>
            <p class="futsal-copy">Dedicated hard courts open this September. Fast, technical, small-sided.</p>
            <span class="futsal-link">Get first access ↓</span>
          </a>
        </div>

        <!-- Location line (replaces the old facility selector cards) -->
        <div class="location-line">
          <a href="/worthington" class="ll-item"><span class="ll-name">WORTHINGTON</span> 3 fields · 535 Lakeview Plaza Blvd</a>
          <span class="ll-div" aria-hidden="true"></span>
          <a href="/downtown" class="ll-item"><span class="ll-name">DOWNTOWN</span> 1 field · 980 E Starr Ave</a>
          <span class="ll-div" aria-hidden="true"></span>
          <span>4PM–12AM DAILY · WEEKEND MORNINGS FOR YOUTH</span>
          <span class="ll-div" aria-hidden="true"></span>
          <span class="ll-soon">More locations coming</span>
        </div>
```

Note the season CTA copy: when the featured season is a fall season the button reads "Register for Fall →"; keep it generic-safe by using the literal text above — the season *name* right above it carries the specifics. When `featured` is null the whole card vanishes and the futsal teaser is the hero's single action (the `hero-actions` grid collapses via `:only-child`, Step 3).

- [ ] **Step 3: Replace the hero-selector CSS**

In the page `<style>`, delete the rule blocks for: `.hero-facility-selector`, `.hfb-header`, `.hfb-name`, `.hfb-badge`, `.hfb-address`, `.hero-future-chip`, `.hero-facility-card`, `.hero-facility-card--primary`, `.hfc-main`, `.hfc-formats`, `.hfc-fmt`, `.hfc-fmt:hover`, and the `.hero-facility-selector`/`.hero-facility-card` lines inside the `@media (max-width: 768px)` block. Add in their place:

```css
    /* Hero action row: what's open now (season card) + what's next (futsal) */
    .hero-actions {
      display: grid;
      grid-template-columns: 1.7fr 1fr;
      gap: 1rem;
      margin-bottom: 1.25rem;
      align-items: stretch;
      animation: heroReveal 1s ease-out 0.65s both;
    }
    .hero-actions > .futsal-card:only-child { max-width: 480px; }

    .season-card {
      position: relative;
      display: flex; flex-direction: column; justify-content: space-between; gap: 1.25rem;
      background: linear-gradient(120deg, var(--so-lime-a12), var(--so-lime-a04) 65%);
      border: 1px solid var(--so-lime-a40);
      border-radius: var(--so-radius-lg);
      padding: 1.75rem 1.75rem 1.5rem;
      box-shadow: 0 0 40px rgba(163,230,53,0.07);
      overflow: hidden;
    }
    .status-dock {
      position: absolute; top: 0; right: 0;
      display: inline-flex; align-items: center; gap: 0.5rem;
      background: var(--so-lime); color: var(--so-ink);
      font-family: var(--so-font-mono); font-size: 0.625rem; font-weight: 700; letter-spacing: 0.08em;
      padding: 0.5rem 1rem;
      border-radius: 0 0 0 var(--so-radius-md);
    }
    .status-dock-dot {
      width: 7px; height: 7px; border-radius: 50%; background: var(--so-ink);
      animation: pulse 2s ease-in-out infinite;
    }
    .season-name {
      font-family: var(--so-font-display);
      font-size: clamp(1.75rem, 3vw, 2.5rem);
      line-height: 1; letter-spacing: 0.01em; text-transform: uppercase;
      margin-bottom: 0.75rem; padding-right: 11rem; color: #fff;
    }
    .season-meta { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; font-size: 0.875rem; color: rgba(255,255,255,0.7); }
    .season-meta b { color: #fff; font-weight: 600; }
    .season-cta-row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
    .season-cta {
      display: inline-flex; align-items: center; gap: 0.625rem;
      background: var(--so-lime); color: var(--so-ink);
      font-size: 1rem; font-weight: 700; letter-spacing: 0.03em; text-decoration: none;
      padding: 0.9rem 1.75rem; border-radius: var(--so-radius-sm); white-space: nowrap;
    }
    .season-cta:hover { background: var(--so-lime-bright); }
    .season-cta-note { font-size: 0.75rem; color: rgba(255,255,255,0.4); }

    .futsal-card {
      position: relative;
      display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: var(--so-radius-lg);
      padding: 1.75rem 1.5rem 1.5rem;
      text-decoration: none;
      overflow: hidden;
      transition: border-color 0.15s;
    }
    .futsal-card:hover { border-color: var(--so-lime-a40); }
    .date-dock {
      position: absolute; top: 0; right: 0;
      font-family: var(--so-font-mono); font-size: 0.625rem; font-weight: 700; letter-spacing: 0.08em;
      color: var(--so-lime); background: var(--so-lime-a12);
      border-left: 1px solid var(--so-lime-a25); border-bottom: 1px solid var(--so-lime-a25);
      padding: 0.5rem 1rem;
      border-radius: 0 0 0 var(--so-radius-md);
    }
    .futsal-title {
      font-family: var(--so-font-display);
      font-size: clamp(1.5rem, 2.4vw, 2rem);
      line-height: 1.02; text-transform: uppercase; letter-spacing: 0.01em;
      padding-right: 5.5rem; color: #fff;
    }
    .futsal-copy { font-size: 0.875rem; color: rgba(255,255,255,0.55); line-height: 1.5; }
    .futsal-link {
      display: inline-flex; align-items: center; gap: 0.5rem;
      font-size: 0.875rem; font-weight: 700; letter-spacing: 0.03em; color: var(--so-lime);
      border-bottom: 1px solid var(--so-lime-a25); padding-bottom: 0.25rem; width: fit-content;
    }

    .location-line {
      display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap;
      font-family: var(--so-font-mono); font-size: 0.6875rem; letter-spacing: 0.05em;
      color: rgba(255,255,255,0.45); padding: 0.75rem 0.25rem;
      animation: heroReveal 1s ease-out 0.8s both;
    }
    .ll-item { display: inline-flex; align-items: baseline; gap: 0.5rem; text-decoration: none; }
    .ll-item:hover .ll-name { color: var(--so-lime); }
    .ll-name { color: rgba(255,255,255,0.85); font-weight: 600; letter-spacing: 0.08em; }
    .ll-div { width: 1px; height: 14px; background: rgba(255,255,255,0.15); align-self: center; }
    .ll-soon { color: rgba(255,255,255,0.28); }
```

And in `@media (max-width: 768px)` add:

```css
      .hero-actions { grid-template-columns: 1fr; }
      .season-name { padding-right: 0; margin-top: 1.5rem; }
      .futsal-title { padding-right: 0; margin-top: 1.5rem; }
```

Add a `pulse` keyframe only if the page doesn't already define one (it does — reuse it), and confirm the existing `@media (prefers-reduced-motion: reduce)` block also lists `.status-dock-dot { animation: none; }`.

- [ ] **Step 4: Verify in dev**

Run: `npm run dev:bws` and open `http://soccerone.localhost:4321/` (or the SoccerOne dev host used in this repo; check `SOCCERONE_HOSTS` in `src/lib/organization/soccerone-routing.ts`).
Expected: hero renders; season card appears if the connected DB has an open SoccerOne season, otherwise only the futsal teaser; the old facility cards are gone; location line shows both addresses. NOTE: memory says the staging SoccerOne fixture org is soft-archived and its seasons API may return empty on `soccerone.localhost` — an empty seasons response with a rendering futsal teaser is a PASS for the degraded state, not a failure.

- [ ] **Step 5: Commit**

```bash
git add src/pages/soccerone/index.astro
git commit -m "feat(soccerone): homepage hero — live season card, futsal teaser, location line

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Homepage rewrite — bands, sections, islands

Remaining page: mount the tonight strip, replace "By the Numbers" with the futsal band, delete the facilities section, rework How You Play (5 cards, no numbering), add gated social proof, bind the CTA band, add the sponsor/hiring duo band and signup strip, and wire register-CTA analytics.

**Files:**
- Modify: `src/pages/soccerone/index.astro`

**Interfaces:**
- Consumes: `featured`, `youthOpen`, `featuredStart`, `featuredCloses` from Task 6; `HomeTonightStrip`, `HomeSignupStrip`, `HOME_GOOGLE_RATING`, `HOME_REVIEWS`; `--so-amber*`/`--so-sky*` tokens from Task 2; `trackDivisionRegisterClicked` from `@/lib/analytics/events`.

- [ ] **Step 1: Mount the tonight strip**

Directly after the closing `</section>` of the hero, add:

```astro
    <!-- Live pickup-tonight strip — client island so the 60s edge cache
         never shows yesterday's "tonight"; renders nothing when empty. -->
    <HomeTonightStrip client:load />
```

- [ ] **Step 2: Replace the numbers section with the futsal band**

Delete the entire `<section class="numbers-section">…</section>` block and its CSS (`.numbers-section`, `.numbers-inner`, `.numbers-label`, `.nl-bar`, `.nl-text`, `.numbers-grid`, `.stat-block`, `.stat-num`, `.stat-name`, `.stat-sub`, `.stat-divider`, plus the `.numbers-grid`/`.stat-divider`/`.stat-block` lines in the 768px media query). In its place:

```astro
    <!-- ============================================================
         FUTSAL LAUNCH — September, Worthington
    ============================================================ -->
    <section class="futsal-band" id="futsal" aria-label="Futsal launch">
      <div class="fb-inner">
        <div>
          <h2 class="fb-headline">Futsal lands<br />at Worthington.</h2>
          <p class="fb-copy">
            Multiple dedicated futsal courts open this September — the fast, technical,
            small-sided game on proper hard courts. <b>Leagues, pickup sessions, and court
            rentals from day one.</b>
          </p>
          <div class="fb-formats">
            <span class="fb-format">LEAGUES</span>
            <span class="fb-format">PICKUP</span>
            <span class="fb-format">COURT RENTALS</span>
          </div>
        </div>
        <div class="fb-right">
          <div>
            <div class="fb-date">SEP</div>
            <div class="fb-date-label">COURTS OPEN · 2026</div>
          </div>
          <a href="/join?src=futsal-launch" class="fb-cta">Get first access →</a>
          <span class="fb-cta-note">Join the list — be first in when futsal league registration opens.</span>
        </div>
      </div>
    </section>
```

CSS (add where the numbers CSS was):

```css
    /* ---- FUTSAL LAUNCH BAND ---- */
    .futsal-band { background: var(--so-lime); color: var(--so-ink); position: relative; overflow: hidden; }
    .futsal-band::after {
      content: '';
      position: absolute; right: 180px; top: 0; bottom: 0; width: 90px;
      background: rgba(0,0,0,0.06); transform: skewX(-12deg);
    }
    .fb-inner {
      max-width: 1400px; margin: 0 auto; padding: 3.5rem 2rem;
      display: grid; grid-template-columns: 1fr auto; gap: 3rem; align-items: center;
      position: relative; z-index: 1;
    }
    .fb-headline {
      font-family: var(--so-font-display);
      font-size: clamp(2.25rem, 5vw, 4.25rem);
      line-height: 0.98; text-transform: uppercase; letter-spacing: 0.01em;
      margin-bottom: 1rem;
    }
    .fb-copy { font-size: 1.0625rem; color: rgba(10,10,13,0.7); line-height: 1.6; max-width: 560px; margin-bottom: 1.5rem; }
    .fb-copy b { font-weight: 700; }
    .fb-formats { display: flex; gap: 0.625rem; flex-wrap: wrap; }
    .fb-format {
      font-family: var(--so-font-mono); font-size: 0.625rem; font-weight: 600; letter-spacing: 0.08em;
      border: 1.5px solid rgba(10,10,13,0.35); color: var(--so-ink);
      padding: 0.4rem 0.8rem; border-radius: var(--so-radius-pill);
    }
    .fb-right { display: flex; flex-direction: column; align-items: center; gap: 1.25rem; flex-shrink: 0; }
    .fb-date { font-family: var(--so-font-display); font-size: clamp(3.5rem, 7vw, 6rem); line-height: 0.9; letter-spacing: 0.02em; text-align: center; }
    .fb-date-label { font-family: var(--so-font-mono); font-size: 0.625rem; font-weight: 600; letter-spacing: 0.14em; color: rgba(10,10,13,0.6); margin-top: 0.375rem; text-align: center; }
    .fb-cta {
      display: inline-flex; align-items: center; gap: 0.625rem;
      background: var(--so-ink); color: var(--so-lime);
      font-size: 1rem; font-weight: 700; letter-spacing: 0.04em; text-decoration: none;
      padding: 0.875rem 1.75rem; border-radius: var(--so-radius-sm); white-space: nowrap;
    }
    .fb-cta:hover { background: #1a1a1e; }
    .fb-cta-note { font-size: 0.75rem; color: rgba(10,10,13,0.55); text-align: center; max-width: 220px; }
    @media (max-width: 1000px) {
      .fb-inner { grid-template-columns: 1fr; gap: 2rem; }
      .fb-right { flex-direction: row; align-items: center; justify-content: flex-start; gap: 2rem; }
      .fb-cta-note { text-align: left; }
    }
```

- [ ] **Step 3: Delete the facilities section**

Delete the entire `<section class="facilities-section" id="facilities">…</section>` block and its CSS: `.facilities-section`, `.facilities-inner`, `.facility-card`, `.facility-card:hover`, `.facility-card--large`, `.facility-card--offset`, `.fcard-photo*`, `.fcard-pitch`, `.fcard-photo-gradient`, `.fcard-content*`, `.fcard-meta`, `.fcard-tag*`, `.fcard-status`, `.fcard-name`, `.fcard-specs`, `.spec-row`, `.spec-label`, `.spec-val*`, `.fcard-cta*`, the `.light-ray`/`.lr-*` rules that exist only for the facility SVGs, and the `.facility-card`/`.fcard-photo`/`.fcard-photo-gradient`/`.facility-card--offset` lines in the 1100px media query. Also remove `.facility-card` from the reveal-animation `querySelectorAll` in the page's bottom `<script>` (it becomes `'.play-card, .mem-card, .review-card'`).

If the SoccerOne header or any other page links to `/#facilities`, retarget that link to `/worthington` (grep: `grep -rn '#facilities' src/`).

- [ ] **Step 4: Rework "How You Play"**

Replace the section-heading block inside `<section class="play-section" id="leagues">` (the `<span class="section-num">02.</span>` and wrapper) with:

```astro
        <div class="section-heading">
          <div class="section-kicker-bar" aria-hidden="true"></div>
          <div class="section-head-text">
            <h2 class="section-title">How You Play</h2>
            <p class="section-desc">Five ways to get on the field. Every level welcome.</p>
          </div>
        </div>
```

Replace the four `play-card` anchors with these five (note: no `pc-num` divs, no icon changes needed — drop the `pc-icon` SVGs entirely to match the leaner v4 cards):

```astro
        <div class="play-grid">
          <!-- Adult Leagues — live-bound -->
          <a href="/leagues" class="play-card play-card--featured">
            <span class="pc-aurora" aria-hidden="true"></span>
            <h3 class="pc-title">Adult Leagues</h3>
            <p class="pc-desc">Coed, Premier, and Women's divisions. 7-game seasons across both sites.</p>
            {featured ? (
              <>
                <div class="pc-detail">
                  <span class="pc-detail-item">
                    <span class="detail-label">NOW REGISTERING</span>
                    <span class="detail-val">{featured.name}{featuredStart ? ` · starts ${featuredStart}` : ''}</span>
                  </span>
                  {featuredCloses && (
                    <span class="pc-detail-item">
                      <span class="detail-label">REGISTRATION CLOSES</span>
                      <span class="detail-val">{featuredCloses}</span>
                    </span>
                  )}
                </div>
                <span class="pc-live"><span class="pc-dot"></span> Spots open now</span>
              </>
            ) : (
              <div class="pc-detail">
                <span class="pc-detail-item">
                  <span class="detail-label">SEASONS</span>
                  <span class="detail-val">Year-round cycles</span>
                </span>
              </div>
            )}
            <span class="pc-cta">See Leagues</span>
          </a>

          <!-- Youth Leagues — weekend mornings, live when a youth season is open -->
          <a href="/leagues?audience=youth" class="play-card">
            <span class="pc-aurora" aria-hidden="true"></span>
            <h3 class="pc-title">Youth Leagues</h3>
            <p class="pc-desc">Boys' and girls' leagues every Saturday and Sunday morning — game-day energy before lunch.</p>
            <div class="pc-detail">
              <span class="pc-detail-item">
                <span class="detail-label">GAME DAYS</span>
                <span class="detail-val">Sat &amp; Sun mornings</span>
              </span>
            </div>
            {youthOpen
              ? <span class="pc-live"><span class="pc-dot"></span> Now registering</span>
              : <span class="pc-soon">Next season announced soon</span>}
            <span class="pc-cta pc-cta--ghost">See Youth Leagues</span>
          </a>

          <!-- Pickup -->
          <a href="/pickup" class="play-card">
            <span class="pc-aurora" aria-hidden="true"></span>
            <h3 class="pc-title">Drop-In Pickup</h3>
            <p class="pc-desc">Show up and play. No team needed. Seven days a week, multiple levels.</p>
            <div class="pc-detail">
              <span class="pc-detail-item">
                <span class="detail-label">SESSION RATE</span>
                <span class="detail-val">Members from $12 · drop in any night</span>
              </span>
            </div>
            <span class="pc-live"><span class="pc-dot"></span> Open every night</span>
          </a>

          <!-- Futsal -->
          <a href="#futsal" class="play-card">
            <span class="pc-aurora" aria-hidden="true"></span>
            <h3 class="pc-title">Futsal</h3>
            <p class="pc-desc">The fast, technical, small-sided game on dedicated hard courts at Worthington.</p>
            <div class="pc-detail">
              <span class="pc-detail-item">
                <span class="detail-label">COURTS OPEN</span>
                <span class="detail-val">September 2026</span>
              </span>
              <span class="pc-detail-item">
                <span class="detail-label">FORMATS</span>
                <span class="detail-val">Leagues · Pickup · Rentals</span>
              </span>
            </div>
            <span class="pc-soon">Opening September</span>
            <span class="pc-cta pc-cta--ghost">Get First Access</span>
          </a>

          <!-- Rentals -->
          <a href="/rent" class="play-card">
            <span class="pc-aurora" aria-hidden="true"></span>
            <h3 class="pc-title">Field Rentals</h3>
            <p class="pc-desc">Book a field by the hour. Training, parties, team practices. All 4 fields available.</p>
            <div class="pc-detail">
              <span class="pc-detail-item">
                <span class="detail-label">PRICING</span>
                <span class="detail-val">By the hour · all 4 fields</span>
              </span>
            </div>
            <span class="pc-live"><span class="pc-dot"></span> Open for booking</span>
          </a>
        </div>
```

CSS changes:
- Delete `.pc-num` and `.pc-icon` rules; delete `.section-num` and `.section-num--dark` rules (numbering removed site-section-wide on this page).
- Change `.play-grid` to `grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));` (was `repeat(4, 1fr)`), and in the 1100px media query change its override to `repeat(2, 1fr)`; keep the 768px `1fr`.
- `.section-heading` becomes `display: block; margin-bottom: 3rem;` (it no longer lays out a numeral + text pair); delete the `gap`/`align-items` properties.
- Add:

```css
    .section-kicker-bar { width: 32px; height: 3px; background: var(--so-lime); margin-bottom: 1.25rem; }
    .pc-cta--ghost { background: none; border: 1.5px solid var(--so-lime-a40); color: var(--so-lime); }
    .pc-cta--ghost:hover { background: var(--so-lime-a12); }
```

Also in the memberships callout, delete `<div class="section-num section-num--dark">03.</div>`, and in the about section delete `<div class="section-num">04.</div>`.

- [ ] **Step 5: Add the gated social-proof section**

Between the play section and the memberships callout:

```astro
    <!-- ============================================================
         SOCIAL PROOF — renders only when real curated reviews exist
         (src/lib/soccerone/home-reviews.ts). Never ship placeholders.
    ============================================================ -->
    {HOME_GOOGLE_RATING && HOME_REVIEWS.length > 0 && (
      <section class="proof-section" aria-label="Player reviews">
        <div class="proof-inner">
          <div class="proof-head">
            <div>
              <div class="section-kicker-bar" aria-hidden="true"></div>
              <h2 class="section-title">Players Rate Us</h2>
            </div>
            <div class="proof-rating">
              <span class="proof-score">{HOME_GOOGLE_RATING.score}</span>
              <span class="proof-stars">
                <span class="stars" aria-hidden="true">★★★★★</span>
                <span class="proof-source">{HOME_GOOGLE_RATING.source}</span>
              </span>
            </div>
          </div>
          <div class="proof-grid">
            {HOME_REVIEWS.map((r) => (
              <div class="review-card">
                <span class="rc-stars" aria-label={`${r.stars} stars`}>{'★'.repeat(r.stars)}</span>
                <p class="rc-quote">"{r.quote}"</p>
                <div class="rc-byline">
                  <span class="rc-name">{r.name}</span>
                  <span class="rc-context">{r.context}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    )}
```

```css
    /* ---- SOCIAL PROOF ---- */
    .proof-section { background: var(--bg); padding: 5.5rem 0; border-top: 1px solid var(--border); }
    .proof-inner { max-width: 1400px; margin: 0 auto; padding: 0 2rem; }
    .proof-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 2rem; flex-wrap: wrap; margin-bottom: 2.5rem; }
    .proof-rating { display: flex; align-items: center; gap: 1rem; }
    .proof-score { font-family: var(--so-font-display); font-size: 3.5rem; line-height: 1; letter-spacing: 0.02em; color: #fff; }
    .proof-stars { display: flex; flex-direction: column; gap: 0.25rem; }
    .stars { color: var(--so-lime); font-size: 1.125rem; letter-spacing: 0.15em; }
    .proof-source { font-family: var(--so-font-mono); font-size: 0.625rem; letter-spacing: 0.1em; color: rgba(255,255,255,0.4); }
    .proof-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; }
    .review-card {
      background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: var(--so-radius-lg);
      padding: 1.75rem 1.5rem; display: flex; flex-direction: column; gap: 1rem;
    }
    .rc-stars { color: var(--so-lime); font-size: 0.875rem; letter-spacing: 0.12em; }
    .rc-quote { font-size: 1rem; color: rgba(255,255,255,0.75); line-height: 1.6; flex: 1; }
    .rc-byline { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
    .rc-name { font-size: 0.875rem; font-weight: 600; color: rgba(255,255,255,0.85); }
    .rc-context {
      font-family: var(--so-font-mono); font-size: 0.5625rem; letter-spacing: 0.08em;
      color: var(--so-lime-a70); border: 1px solid var(--so-lime-a25);
      padding: 2px 8px; border-radius: var(--so-radius-pill); white-space: nowrap;
    }
    @media (max-width: 1000px) { .proof-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 6: Bind the CTA band and remove its label**

Replace the `<section class="cta-band">` contents so the band only renders with a season and carries the deadline in the sub (no `cta-band-label` eyebrow):

```astro
    {featured && (
      <section class="cta-band" aria-label="League registration CTA">
        <div class="cta-band-inner">
          <div class="cta-band-left">
            <h2 class="cta-band-heading">{featured.termLabel ? `${featured.termLabel} leagues are open.` : 'Leagues are open.'}<br />Grab your spot.</h2>
            <p class="cta-band-sub">
              Adult divisions at both facilities{youthOpen ? ', youth leagues on weekend mornings' : ''}.
              {featuredStart ? ` 7-game season starts ${featuredStart}` : ''}{featuredCloses ? ` — ` : ''}
              {featuredCloses && <b>registration closes {featuredCloses}</b>}.
            </p>
          </div>
          <div class="cta-band-right">
            <a
              href={`/register/${featured.id}`}
              class="cta-band-btn"
              data-so-register-cta
              data-season-id={featured.id}
              data-level={featured.skillLevel ?? 'open'}
              data-gender={featured.divisionGender ?? 'unknown'}
              data-venue={featured.location?.slug ?? ''}
              data-term={featured.termSlug ?? ''}
              data-mode={featured.signupModes?.includes('team') ? 'team' : 'individual'}
            >
              Register Now
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4 10h12M10 4l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </a>
            <span class="cta-band-note">Powered by Aspire Sports. Secure checkout.</span>
          </div>
        </div>
      </section>
    )}
```

Delete the `.cta-band-label` CSS rule. Add `max-width: 520px;` to `.cta-band-sub` and `color: var(--so-ink);` on its `b`. Heading copy note: "Fall leagues" reads correctly through this cycle; the season name itself is rendered in the hero card — if this ever bothers off-season, the band is hidden anyway when nothing is open.

- [ ] **Step 7: Add the sponsor/hiring duo band + signup strip**

Directly after the CTA band block (and before the about section):

```astro
    <!-- ============================================================
         SPONSOR + HIRING — secondary asks, complementary accents
    ============================================================ -->
    <section class="duo-band" aria-label="Sponsorships and hiring">
      <div class="duo-panel duo-panel--sponsor">
        <h2 class="duo-title">Put your brand<br /><em>on the pitch.</em></h2>
        <p class="duo-copy">
          Local businesses reach Columbus players every night — wall banners, team kits,
          and event title packages from $300/year.
        </p>
        <a href="/sponsors" class="duo-cta">Explore Sponsorships →</a>
        <span class="duo-note">Multi-asset &amp; two-facility packages save 10%.</span>
      </div>
      <div class="duo-panel duo-panel--crew">
        <h2 class="duo-title">Coach. Ref.<br /><em>Join the crew.</em></h2>
        <p class="duo-copy">
          We're hiring coaches and referees at both facilities — youth mornings and adult
          nights, flexible shifts, per-match pay.
        </p>
        <a href="/careers" class="duo-cta">See Open Roles →</a>
        <span class="duo-note">Evenings &amp; weekends. Train with us before your first whistle.</span>
      </div>
    </section>

    <HomeSignupStrip client:load />
```

```css
    /* ---- SPONSOR + HIRING DUO BAND ---- */
    .duo-band { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--border); }
    .duo-panel { padding: 3.5rem 3rem; display: flex; flex-direction: column; gap: 1rem; position: relative; overflow: hidden; }
    .duo-panel--sponsor {
      background: linear-gradient(135deg, rgba(251,191,36,0.14), rgba(180,83,9,0.05) 70%);
      border-right: 1px solid var(--border);
    }
    .duo-panel--sponsor::after {
      content: ''; position: absolute; right: -60px; top: -60px; width: 220px; height: 220px;
      border-radius: 50%; border: 2px solid var(--so-amber-a25); opacity: 0.6; pointer-events: none;
    }
    .duo-panel--crew { background: linear-gradient(135deg, rgba(56,189,248,0.13), rgba(14,116,144,0.05) 70%); }
    .duo-panel--crew::after {
      content: ''; position: absolute; right: -40px; bottom: -80px; width: 240px; height: 240px;
      border-radius: 50%; border: 2px solid var(--so-sky-a25); opacity: 0.6; pointer-events: none;
    }
    .duo-title { font-family: var(--so-font-display); font-size: clamp(1.75rem, 3vw, 2.75rem); line-height: 1; text-transform: uppercase; letter-spacing: 0.01em; color: #fff; }
    .duo-panel--sponsor .duo-title em { font-style: normal; color: var(--so-amber); }
    .duo-panel--crew .duo-title em { font-style: normal; color: var(--so-sky); }
    .duo-copy { font-size: 0.9375rem; color: rgba(255,255,255,0.6); line-height: 1.6; max-width: 440px; flex: 1; }
    .duo-cta {
      display: inline-flex; align-items: center; gap: 0.625rem;
      font-size: 0.875rem; font-weight: 700; letter-spacing: 0.04em; text-decoration: none;
      padding: 0.75rem 1.5rem; border-radius: var(--so-radius-sm); width: fit-content; color: var(--so-ink);
    }
    .duo-panel--sponsor .duo-cta { background: var(--so-amber); }
    .duo-panel--sponsor .duo-cta:hover { background: #fcd34d; }
    .duo-panel--crew .duo-cta { background: var(--so-sky); }
    .duo-panel--crew .duo-cta:hover { background: var(--so-sky-soft); }
    .duo-note { font-size: 0.75rem; color: rgba(255,255,255,0.35); }
    @media (max-width: 1000px) {
      .duo-band { grid-template-columns: 1fr; }
      .duo-panel--sponsor { border-right: none; border-bottom: 1px solid var(--border); }
    }
    @media (max-width: 640px) { .duo-panel { padding: 2.5rem 1.75rem; } }
```

- [ ] **Step 8: Wire register-CTA analytics**

After the existing reveal-animation `<script>` at the bottom of the page, add (ported verbatim from `leagues.astro:395-412`):

```astro
<script>
  import { trackDivisionRegisterClicked } from "@/lib/analytics/events";

  // Conversion analytics on the server-rendered register CTAs (hero season
  // card + fall CTA band).
  document.querySelectorAll<HTMLAnchorElement>("[data-so-register-cta]").forEach((el) => {
    el.addEventListener("click", () => {
      trackDivisionRegisterClicked({
        seasonId: el.dataset.seasonId ?? "",
        level: el.dataset.level ?? "open",
        gender: el.dataset.gender ?? "unknown",
        venue: el.dataset.venue ?? "",
        mode: el.dataset.mode === "team" ? "team" : "individual",
        term: el.dataset.term ?? "",
      });
    });
  });
</script>
```

- [ ] **Step 9: Full-page visual pass in dev**

With `npm run dev:bws` running, load the SoccerOne homepage and verify top-to-bottom order: hero (season card if data, futsal teaser, location line) → tonight strip (only if sessions today) → futsal band → How You Play (5 cards, no numerals) → memberships → CTA band (only if season) → duo band → signup strip → about → contact. Confirm zero eyebrow labels anywhere, and submit a test email through the signup strip (expect the success message; check the `newsletter_signups` row has `source = 'home-strip'`).

- [ ] **Step 10: Commit**

```bash
git add src/pages/soccerone/index.astro
git commit -m "feat(soccerone): homepage bands — futsal launch, 5-way play grid, gated social proof, sponsor/hiring, signup strip

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: E2E coverage + stale-reference sweep

E2E specs for SoccerOne run POST-MERGE only (`test-full`), so a broken spec passes the PR gate and fails on `main` — this task is not optional.

**Files:**
- Create: `tests/e2e/soccerone-home.spec.ts`
- Modify: any spec matched by the sweep greps below

**Interfaces:**
- Consumes: `data-testid="tonight-strip"` (Task 4), `data-testid="signup-strip"` (Task 5), `#futsal` section, `data-so-register-cta` (Tasks 6–7).

- [ ] **Step 1: Sweep for references to removed markup**

```bash
grep -rn "BY THE NUMBERS\|Two Facilities\|hero-facility\|numbers-section\|facilities-section\|Explore Worthington\|Explore Downtown\|fcard\|#facilities" tests/ src/ --include="*.ts" --include="*.tsx" --include="*.astro" | grep -v "soccerone/index.astro"
```

Fix every hit: e2e selectors move to surviving elements; `/#facilities` links retarget to `/worthington`. Also sweep stale youth copy on SoccerOne surfaces:

```bash
grep -rn "coming 2027\|Coming 2027\|2027" src/pages/soccerone/ src/components/soccerone/
```

Youth *leagues* references must not say 2027; youth *classes/clinics/academy* references may keep 2027. Update `leagues.astro` youth-audience copy only if it claims youth leagues don't exist yet.

- [ ] **Step 2: Write the homepage spec**

```ts
// tests/e2e/soccerone-home.spec.ts
import { test, expect } from "@playwright/test";

// SoccerOne homepage (rebuilt 2026-07). Live sections are data-dependent:
// the seeded staging DB may or may not have open SoccerOne seasons or
// pickup sessions today, so live blocks are asserted conditionally —
// structure is asserted unconditionally.
const HOME = "/soccerone/";

test.describe("SoccerOne homepage", () => {
  test("hero, futsal band, and play grid render; removed sections are gone", async ({ page }) => {
    await page.goto(HOME, { waitUntil: "domcontentloaded" });

    await expect(page.locator("h1")).toContainText("YOUR GAME");

    // Futsal launch band
    await expect(page.locator("#futsal")).toBeVisible();
    await expect(page.locator("#futsal")).toContainText("Futsal lands");

    // Five play cards, no numbering
    await expect(page.locator(".play-card")).toHaveCount(5);
    await expect(page.locator(".pc-num")).toHaveCount(0);
    await expect(page.locator(".section-num")).toHaveCount(0);

    // Removed sections
    await expect(page.getByText("BY THE NUMBERS")).toHaveCount(0);
    await expect(page.getByText("Two Facilities")).toHaveCount(0);

    // Location line replaces facility cards
    await expect(page.locator(".location-line")).toContainText("WORTHINGTON");
    await expect(page.locator(".location-line")).toContainText("DOWNTOWN");
  });

  test("register CTAs only render with a real season behind them", async ({ page }) => {
    await page.goto(HOME, { waitUntil: "domcontentloaded" });
    const ctas = page.locator("[data-so-register-cta]");
    const count = await ctas.count();
    for (let i = 0; i < count; i++) {
      const href = await ctas.nth(i).getAttribute("href");
      expect(href).toMatch(/^\/register\/.+/);
    }
  });

  test("signup strip hydrates and accepts input", async ({ page }) => {
    await page.goto(HOME, { waitUntil: "domcontentloaded" });
    const strip = page.getByTestId("signup-strip");
    await expect(strip).toBeVisible();
    await strip.getByLabel("Email address").fill("e2e-home-strip@test.aspiresports.com");
    // Do not submit — this spec runs post-merge against shared staging;
    // submission is covered by the newsletter API tests.
  });
});
```

Note: check how existing SoccerOne specs address the host (e.g. `soccerone-pickup-band.spec.ts` — they may set a `Host` header, use a base URL, or hit `/soccerone/` paths directly). Mirror that convention exactly; adjust `HOME` accordingly before committing.

- [ ] **Step 3: Run the spec locally**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- soccerone-home`
Expected: 3 passing tests (dev server running; hydration beacon makes the strip visible reliably).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/soccerone-home.spec.ts
git commit -m "test(e2e): SoccerOne homepage rebuild coverage + stale-reference sweep

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(Include any spec files fixed by the sweep in the same commit.)

---

### Task 9: Verification gate

**Files:** none (verification only)

- [ ] **Step 1: Type check** — `npx tsc --noEmit` → zero errors.
- [ ] **Step 2: Unit tests** — `npx vitest run tests/unit/` → all pass.
- [ ] **Step 3: Build** — `./scripts/with-bws.sh npm run build` → succeeds; no new `Astro.request.headers` warnings beyond the known prerender noise.
- [ ] **Step 4: API tests (targeted)** — with dev server up: `TEST_BASE_URL=http://localhost:4321 npm run test:api -- public-seasons` (or the repo's per-file invocation) → seasons tests pass.
- [ ] **Step 5: E2E (targeted)** — `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- soccerone-home soccerone-leagues-finder brand-skin` → pass (pre-existing staging-data failures per memory are triaged by file-overlap: only failures in files this branch touched count).
- [ ] **Step 6: Manual verify** — invoke the `verify` skill: drive the homepage in a real browser (hero card, futsal anchor jump, signup strip success path).
- [ ] **Step 7:** Do NOT merge yet — finish via `superpowers:finishing-a-development-branch` (PR to `main`; every merge auto-deploys to prod).

---

## Deferred / follow-ups (explicitly out of scope)

- **Reviews content**: owner to supply real Google rating + 3–6 quotes → populate `home-reviews.ts` (section appears automatically).
- **Futsal court count**: replace "Multiple dedicated futsal courts" once the owner confirms the number.
- **Futsal forming season**: when futsal leagues are entered as `forming` seasons, consider switching the "Get first access" CTAs from `/join?src=futsal-launch` to the season-interest flow.
- **Header nav "Futsal" item**: skipped — no futsal page exists yet; revisit when one does.
- **Pickup card "next session" binding**: the v4 mockup showed the next live session inside the Drop-In Pickup play card; the build keeps that card static since the tonight strip already carries live times. Revisit if we want double reinforcement.
- **leagues.astro `lfcta-eyebrow`**: the leagues page still uses a "NOW REGISTERING" eyebrow; migrate it to the docked-chip treatment in a separate pass.
- **WhatsApp deep link**: signup strip routes to `/join` — a direct group/channel link is blocked on the WABA reconnect (see memory).
