# Kiosk Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/kiosk/[locationSlug]` into a SoccerOne-branded, iPad-hardened, unattended self-serve station with no dead-ends and no lingering PII.

**Architecture:** The kiosk becomes a single React island (`KioskRoot`) that never navigates away from `/kiosk/<slug>`. Both entry paths — "find my booking" and "walk-in" — resolve a self-serve **token**, then render the *existing* `SelfServe` cards inline. This deletes the duplicate waiver/photo/payment implementations inside `WalkInWizard`, so every fix below lands once. The self-serve cards are first restyled onto design-system tokens (they currently use hardcoded `stone-*`, which is illegible under the SoccerOne dark-token inversion).

**Tech Stack:** Astro 5, React 19, Tailwind CSS 4, Drizzle ORM, Stripe.js, Vitest (unit + API), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-07-13-kiosk-polish-design.md`

**Branch:** `feat/kiosk-polish` (already cut). **Worktree:** `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/command-center-polish` — run every command from here; do NOT `cd` to the main checkout.

## Global Constraints

- **Brand name is never hardcoded in the React tree.** Read it from `getBrandTheme(Astro.locals.brandId).displayName` in the Astro page and pass it down as a prop. An Aspire-hosted kiosk must still render correctly.
- **Never use raw Tailwind palette classes** (`stone-*`, `white`, `emerald-*`, `amber-*`) in any file this plan touches. Use design tokens: `bg-cream`, `bg-cream-2`, `bg-paper`, `text-ink`, `text-ink-2`, `text-ink-muted`, `text-ink-faint`, `border-border`, `bg-primary`, `text-cream`. Raw palette classes do not respond to the SoccerOne token inversion and go illegible on dark.
- **NEVER use an accent token as a text color** (`text-sage`, `text-ochre`). They do not invert — they are re-pointed per brand, and they are tuned for the dark SoccerOne palette. `--ochre` is `oklch(0.75 …)`, which lands at roughly **2:1** on the light Aspire background: a hard WCAG failure. Using them as text fixes SoccerOne by breaking Aspire. **Semantic color goes in a tint + border; text stays on ink tokens**, which invert by construction:
  - success → `border border-sage/40 bg-sage/10`, text `text-ink` / `text-ink-2`
  - warning → `border border-ochre/40 bg-ochre/10`, text `text-ink` / `text-ink-2`
  An accent token may color a **non-text glyph** (an `aria-hidden` ✓), which only needs the 3:1 non-text floor.
- **Errors:** persistent/actionable → `<ErrorBanner message={...} />` from `@/components/ui/error-banner`. Transient (declines, network blips) → `toast.error(...)` from sonner. Empty states → `<EmptyState />`. Per `CLAUDE.md`.
- **Every input stays ≥16px** (`text-base` or larger). Below 16px, iOS Safari zooms the viewport on focus.
- **Touch targets ≥44px**, and ≥60px for primary kiosk actions.
- **Waiver copy (pending owner sign-off — flag in the PR, do not treat as settled):** `"I acknowledge the inherent risks of recreational sports activity, including contact, falls, and weather-related conditions. I waive SoccerOne, operated by Aspire Sports, and its partner venues from liability for injuries that occur during this session, and I confirm that the player named above is physically able to participate."`
- **Playwright full runs only happen post-merge** (`test-full`). Run any new/changed E2E spec locally before merging: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- tests/e2e/kiosk.spec.ts`
- **Type check must stay at zero errors:** `npx tsc --noEmit`.

## File Structure

**Create:**
- `src/lib/time/day-bounds.ts` — `dayBoundsInTz(tz, now)`; the single source of "what is today at this facility".
- `src/components/kiosk/KioskRoot.tsx` — mode machine, idle reset, offline banner. Replaces `KioskLanding.tsx`.
- `src/components/kiosk/PhoneKeypad.tsx` — on-screen numeric keypad.
- `src/components/kiosk/IdleResetOverlay.tsx` — "Still there?" countdown modal.
- `src/components/kiosk/KioskMasthead.astro` — SoccerOne wordmark + facility + date, and the "Powered by Aspire Sports" strip.
- `src/styles/kiosk.css` — iPad hardening rules.
- `tests/unit/day-bounds.test.ts`, `tests/e2e/kiosk.spec.ts`
- `docs/kiosk-operator-notes.md` — Guided Access setup.

**Modify:**
- `src/pages/api/kiosk/[locationSlug]/search.ts` — timezone bounds; phone-only matching.
- `src/pages/api/kiosk/[locationSlug]/sessions.ts` — timezone bounds.
- `src/components/self-serve/{WaiverCard,PhotoCard,PayCard,SelfServe}.tsx` — token restyle; guardian language; camera rework; `onDone` prop.
- `src/components/kiosk/{FindBooking,WalkInWizard}.tsx` — shrink to token-resolvers.
- `src/pages/kiosk/[locationSlug]/index.astro`, `src/layouts/BaseLayout.astro` — masthead, head slot.
- `tests/api/kiosk/search.test.ts`

**Delete:** `src/lib/kiosk/return-slug.ts`, `src/components/kiosk/KioskLanding.tsx`.

---

### Task 1: `dayBoundsInTz` — fix the "today" bug

`search.ts` and `sessions.ts` both compute today's bounds in **UTC** while the kiosk page computes the date in the **location's timezone**. After 8pm Eastern, UTC has rolled to tomorrow, so a 6pm session drops out of both endpoints — during the evening block when the kiosk is busiest.

**Files:**
- Create: `src/lib/time/day-bounds.ts`
- Create: `tests/unit/day-bounds.test.ts`
- Modify: `src/pages/api/kiosk/[locationSlug]/search.ts:56-63`
- Modify: `src/pages/api/kiosk/[locationSlug]/sessions.ts:~32`

**Interfaces:**
- Produces: `dayBoundsInTz(tz: string, now?: Date): { start: Date; end: Date }` — UTC instants bounding the *local* calendar day in `tz`. Consumed by Tasks 2 and 6.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/day-bounds.test.ts
import { describe, expect, it } from "vitest";
import { dayBoundsInTz } from "@/lib/time/day-bounds";

const ET = "America/New_York";

describe("dayBoundsInTz", () => {
  it("bounds the local day, not the UTC day", () => {
    // 8:30pm ET on Jul 13 === 00:30 UTC on Jul 14. The UTC day has rolled
    // over but the *local* day is still Jul 13.
    const now = new Date("2026-07-14T00:30:00Z");
    const { start, end } = dayBoundsInTz(ET, now);
    // Local Jul 13 00:00 ET === 04:00 UTC (EDT, UTC-4).
    expect(start.toISOString()).toBe("2026-07-13T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-14T04:00:00.000Z");
  });

  it("keeps an evening session inside today's bounds (the regression)", () => {
    const now = new Date("2026-07-14T00:30:00Z"); // 8:30pm ET Jul 13
    const sixPmEt = new Date("2026-07-13T22:00:00Z"); // 6pm ET Jul 13
    const { start, end } = dayBoundsInTz(ET, now);
    expect(sixPmEt >= start && sixPmEt < end).toBe(true);
  });

  it("handles a timezone west of UTC at midday", () => {
    const now = new Date("2026-07-13T16:00:00Z"); // 12pm ET
    const { start, end } = dayBoundsInTz(ET, now);
    expect(start.toISOString()).toBe("2026-07-13T04:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(86_400_000);
  });

  it("falls back to Eastern on an unknown timezone rather than throwing", () => {
    const now = new Date("2026-07-13T16:00:00Z");
    expect(() => dayBoundsInTz("Not/AZone", now)).not.toThrow();
    expect(dayBoundsInTz("Not/AZone", now).start.toISOString()).toBe(
      dayBoundsInTz(ET, now).start.toISOString(),
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/day-bounds.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/time/day-bounds"`.

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/time/day-bounds.ts
/**
 * UTC instants bounding the *local* calendar day at a facility.
 *
 * The kiosk endpoints previously used UTC day bounds. After 8pm Eastern
 * the UTC date has already rolled over, so "today" silently excluded the
 * evening sessions that were actually in progress — the busiest block.
 * Every kiosk query for "today" must go through this helper.
 */
const FALLBACK_TZ = "America/New_York";

/** Wall-clock Y/M/D at `instant` as observed in `tz`. */
function localYmd(tz: string, instant: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** Offset in ms that `tz` is ahead of UTC at `instant`. */
function tzOffsetMs(tz: string, instant: Date): number {
  const { y, m, d } = localYmd(tz, instant);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(y, m - 1, d, get("hour"), get("minute"), get("second"));
  // Drop sub-second precision on both sides so the difference is exact.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function dayBoundsInTz(
  tz: string,
  now: Date = new Date(),
): { start: Date; end: Date } {
  let zone = tz;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(now);
  } catch {
    // An unknown/garbage timezone must not 500 the kiosk.
    zone = FALLBACK_TZ;
  }

  const { y, m, d } = localYmd(zone, now);
  // Midnight local, expressed as UTC: take the naive UTC midnight for the
  // local Y/M/D and subtract the zone's offset at that moment. Computing the
  // offset at local noon (rather than at midnight) keeps this correct across
  // DST transitions, where midnight itself may not exist or may be ambiguous.
  const localNoonUtcGuess = new Date(Date.UTC(y, m - 1, d, 12));
  const offset = tzOffsetMs(zone, localNoonUtcGuess);
  const start = new Date(Date.UTC(y, m - 1, d) - offset);

  // Add a calendar day, then re-derive the offset so a DST boundary inside
  // the day yields a 23- or 25-hour day rather than a broken 24.
  const nextGuess = new Date(Date.UTC(y, m - 1, d + 1, 12));
  const nextOffset = tzOffsetMs(zone, nextGuess);
  const end = new Date(Date.UTC(y, m - 1, d + 1) - nextOffset);

  return { start, end };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/day-bounds.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Use it in `search.ts`**

In `src/pages/api/kiosk/[locationSlug]/search.ts`, add the import and replace the UTC bounds block:

```ts
import { dayBoundsInTz } from "@/lib/time/day-bounds";
```

Replace:
```ts
  // UTC day bounds for today
  const now = new Date();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);
```
with:
```ts
  // "Today" means today *at the facility* — see dayBoundsInTz. Using UTC
  // bounds here dropped evening sessions after 8pm Eastern.
  const { start: todayStart, end: todayEnd } = dayBoundsInTz(tz);
```

- [ ] **Step 6: Use it in `sessions.ts`**

Apply the identical change in `src/pages/api/kiosk/[locationSlug]/sessions.ts`. It has the same `Date.UTC(...)` bounds bug. If it does not already resolve `tz` from the location, derive it the same way `search.ts` does: `const tz = location.timezone ?? "America/New_York";`

- [ ] **Step 7: Type check and commit**

```bash
npx tsc --noEmit
git add src/lib/time/day-bounds.ts tests/unit/day-bounds.test.ts "src/pages/api/kiosk/[locationSlug]/search.ts" "src/pages/api/kiosk/[locationSlug]/sessions.ts"
git commit -m "fix(kiosk): scope 'today' to the facility timezone, not UTC

Evening sessions dropped out of kiosk search and the walk-in session list
after 8pm Eastern, when the UTC date had already rolled over."
```

---

### Task 2: Phone-only search

Typing two characters currently lists other customers' names and sessions to whoever is standing at the kiosk. Match on phone digits only.

**Files:**
- Modify: `src/pages/api/kiosk/[locationSlug]/search.ts`
- Modify: `tests/api/kiosk/search.test.ts`

**Interfaces:**
- Produces: `GET /api/kiosk/<slug>/search?q=<digits>` — requires ≥4 digits after stripping non-digits; returns `{ results: [] }` otherwise. Each result's `title` is now `"First L."`, not a full name.

- [ ] **Step 1: Write the failing API tests**

Add to `tests/api/kiosk/search.test.ts` (follow the existing file's fixture/base-URL conventions):

```ts
it("returns nothing for a name query", async () => {
  const res = await fetch(`${BASE}/api/kiosk/${SLUG}/search?q=test`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.results).toEqual([]);
});

it("returns nothing for fewer than 4 digits", async () => {
  const res = await fetch(`${BASE}/api/kiosk/${SLUG}/search?q=123`);
  const body = await res.json();
  expect(body.results).toEqual([]);
});

it("matches on the last 4 digits of a phone number", async () => {
  const res = await fetch(`${BASE}/api/kiosk/${SLUG}/search?q=${SEEDED_LAST4}`);
  const body = await res.json();
  expect(body.results.length).toBeGreaterThan(0);
});

it("abbreviates the surname so a digit collision reveals little", async () => {
  const res = await fetch(`${BASE}/api/kiosk/${SLUG}/search?q=${SEEDED_LAST4}`);
  const body = await res.json();
  // "Casey Tester" -> "Casey T."
  expect(body.results[0].title).toMatch(/^\S+ \S\.$/);
});
```

Define `SEEDED_LAST4` from the e2e seed fixture's phone (read `src/lib/db/seeds/seed-e2e-tests.ts` and use the last 4 digits of the seeded drop-in booker's phone).

- [ ] **Step 2: Run and confirm failure**

Start the dev server first (`npm run dev`), then:
Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/kiosk/search.test.ts`
Expected: FAIL — the name query still returns results, and `title` is a full name.

- [ ] **Step 3: Implement**

In `search.ts`, replace the query-guard and the term construction:

```ts
  const q = url.searchParams.get("q") ?? "";
  // Phone digits only. A name-prefix search on a public kiosk listed other
  // customers' names to whoever was standing there; requiring the number
  // means only someone who knows it can surface a booking.
  const qDigits = q.replace(/\D/g, "");
  if (qDigits.length < 4) {
    return json({ results: [] }, 200);
  }
  const last4 = qDigits.slice(-4);
```

Delete the `const term = \`%${q}%\`;` line and every `ilike(<nameColumn>, term)` disjunct from the `or(...)` clauses in **both** the drop-in and field-rental queries, leaving only the trailing-4 phone match (`ilike(<phoneColumn>, \`%${last4}\`)`).

Abbreviate the surname when building each result's `title`. Add near the other helpers:

```ts
/** "Casey Tester" -> "Casey T." — enough for the right person to recognize
 *  their own booking, not enough to be worth harvesting. */
function abbreviateName(first: string | null, last: string | null): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (!f && !l) return "Guest";
  if (!l) return f;
  return `${f} ${l[0].toUpperCase()}.`;
}
```

Use it wherever `title` is currently assembled from the full name — for field rentals, split `renterName` on the first space and pass the halves.

- [ ] **Step 4: Run tests**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/kiosk/search.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the endpoint's doc comment**

The header comment still claims it matches on name. Rewrite the "Search matches" block to describe phone-only matching and the abbreviated title.

- [ ] **Step 6: Commit**

```bash
git add "src/pages/api/kiosk/[locationSlug]/search.ts" tests/api/kiosk/search.test.ts
git commit -m "fix(kiosk): match bookings by phone digits, not by name

A 2-character name query listed other customers' names and sessions to
anyone standing at the kiosk."
```

---

### Task 3: Restyle the self-serve cards onto design tokens

`WaiverCard`, `PhotoCard`, `PayCard`, and `SelfServe`'s screens use hardcoded `bg-white`, `text-stone-600`, `bg-stone-900`, `emerald-*`, `amber-*`. Those do not respond to the SoccerOne token inversion, so **texted self-serve links on `gosoccerone.com` are illegible today** — this is a live bug, independent of the kiosk. It must be fixed before the kiosk renders these cards.

**Files:**
- Create: `src/components/self-serve/card-styles.ts`
- Modify: `src/components/self-serve/WaiverCard.tsx`
- Modify: `src/components/self-serve/PhotoCard.tsx`
- Modify: `src/components/self-serve/PayCard.tsx`
- Modify: `src/components/self-serve/SelfServe.tsx`
- Modify: `src/pages/self-serve/[token].astro`

**Interfaces:**
- Produces: `WaiverCard` gains a `playerName: string` prop (used for the guardian consent line). All four files export unchanged component names.

- [ ] **Step 1: Introduce shared card classes in their own module**

Create `src/components/self-serve/card-styles.ts` (a component file must not
double as a style module — the cards, `PhotoCard`, and the kiosk all import
from here):

```ts
// src/components/self-serve/card-styles.ts
export const CARD_CLASS = "p-5 rounded-xl border border-border bg-paper space-y-3";
export const DONE_CARD_CLASS =
  "p-4 rounded-xl border border-sage/40 bg-sage/10 text-ink text-sm flex items-center gap-2";
export const INPUT_CLASS =
  "w-full px-4 py-3 bg-paper border border-border focus:border-ink focus:outline-none rounded-lg text-base text-ink placeholder:text-ink-faint transition-colors";
export const PRIMARY_BTN =
  "w-full px-6 py-4 rounded-xl bg-primary text-cream text-base font-medium transition-all hover:bg-primary/90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed";
export const GHOST_BTN =
  "w-full px-6 py-4 rounded-xl border border-border bg-paper text-ink text-base transition-colors hover:bg-cream-2";
```

- [ ] **Step 2: Replace the palette classes in all four files**

Mechanical substitution across `WaiverCard.tsx`, `PhotoCard.tsx`, `PayCard.tsx`, `SelfServe.tsx`:

| Replace | With |
|---|---|
| `bg-white` | `bg-paper` |
| `bg-stone-50` | `bg-cream-2` |
| `bg-stone-900 text-white` | `bg-primary text-cream` |
| `text-stone-600`, `text-stone-700` | `text-ink-muted` |
| `border` (bare, on cards/inputs) | `border border-border` |
| `border-emerald-200 bg-emerald-50 text-emerald-900` | `border border-sage/40 bg-sage/10` + `text-ink` / `text-ink-2` |
| `border-amber-200 bg-amber-50 text-amber-900` | `border border-ochre/40 bg-ochre/10` + `text-ink` / `text-ink-2` |
| `text-rose-700` | replace the whole `<div>` with `<ErrorBanner message={error} />` |
| `border-stone-400` (spinner) | `border-ink-faint` |

Apply the shared classes from Step 1 to the card wrappers, inputs, and buttons. Import them into all four files from `./card-styles`.

In `SelfServe.tsx`, the header (`text-xl font-semibold` / `text-sm text-stone-600`) becomes:
```tsx
<header className="space-y-1">
  <h1 className="font-display text-3xl font-medium italic text-ink">
    Hi {context.displayName}
  </h1>
  <p className="text-sm text-ink-muted">{context.summary}</p>
</header>
```

- [ ] **Step 3: Add the guardian consent line to `WaiverCard`**

`WalkInWizard` has parent/guardian language; `WaiverCard` does not. Merging onto `WaiverCard` without this would drop guardian consent for minors. A minor is detected by `signerName` differing from the player's name (the self-serve context sets `signerName` to the guardian).

Change the props and body:

```tsx
interface Props {
  token: string;
  signerName: string;
  /** The player. When it differs from signerName, a guardian is signing. */
  playerName: string;
  done: boolean;
  onDone: () => void;
}

const WAIVER_TEXT = `I acknowledge the inherent risks of recreational sports activity, including contact, falls, and weather-related conditions. I waive SoccerOne, operated by Aspire Sports, and its partner venues from liability for injuries that occur during this session, and I confirm that the player named above is physically able to participate.`;
```

Inside the component:

```tsx
  const guardianSigning =
    playerName.trim().length > 0 &&
    signerName.trim().toLowerCase() !== playerName.trim().toLowerCase();

  const acceptLabel = guardianSigning
    ? `I am the parent or legal guardian of ${playerName} and accept these terms on their behalf.`
    : "I have read and accept these terms.";
```

Render `{acceptLabel}` as the checkbox label, and label the name field `{guardianSigning ? "Parent/guardian signature" : "Signature"}`.

In `SelfServe.tsx`, pass the new prop:
```tsx
<WaiverCard
  token={token}
  signerName={context.signerName ?? context.displayName}
  playerName={context.displayName}
  done={waiverDone}
  onDone={onWaiverDone}
/>
```

- [ ] **Step 4: Widen the self-serve page container**

`src/pages/self-serve/[token].astro` uses `max-w-md`, which is cramped on an iPad. Change to `max-w-2xl` to match the kiosk column, and change the error block's `border-rose-200 bg-rose-50 text-rose-800` to use `<ErrorBanner>`-consistent tokens (`border-border bg-paper text-ink`).

- [ ] **Step 5: Verify visually on both brands**

```bash
npm run dev
```
Open a self-serve token URL on the Aspire host and on a SoccerOne host (per `soccerone-routing.ts`). Confirm no low-contrast text on either. Every card should read cleanly on the dark SoccerOne background.

- [ ] **Step 6: Type check and commit**

```bash
npx tsc --noEmit
git add src/components/self-serve "src/pages/self-serve/[token].astro"
git commit -m "fix(self-serve): style cards with design tokens, add guardian consent

The cards used hardcoded stone/white/emerald classes, which don't respond
to the SoccerOne token inversion — texted self-serve links were illegible
on the SoccerOne brand. Also carries over the parent/guardian signing
language that only existed in the walk-in wizard."
```

---

### Task 4: Camera that cannot dead-end

`capture="user"` bounces to the iOS Camera app and emits **no error event** when blocked, so a denied permission is an unrecoverable flow on an unattended iPad. Replace it with an in-page `getUserMedia` preview, which surfaces a catchable error.

**Files:**
- Modify: `src/components/self-serve/PhotoCard.tsx`

**Interfaces:**
- Consumes: `CARD_CLASS`, `DONE_CARD_CLASS`, `PRIMARY_BTN`, `GHOST_BTN` from `src/components/self-serve/card-styles.ts` (Task 3).
- Produces: `PhotoCard` props unchanged (`{ token, done, onDone }`).

- [ ] **Step 1: Rewrite `PhotoCard`**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImageIcon, RotateCcw } from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { CARD_CLASS, DONE_CARD_CLASS, PRIMARY_BTN, GHOST_BTN } from "./card-styles";

interface Props {
  token: string;
  done: boolean;
  onDone: () => void;
}

/** Longest edge of the uploaded image. Gym Wi-Fi is slow and the front desk
 *  only needs to recognize a face. */
const MAX_EDGE = 800;
const JPEG_QUALITY = 0.85;

/** Draw a video frame to a downscaled JPEG File. */
function frameToFile(video: HTMLVideoElement): Promise<File | null> {
  const { videoWidth: w, videoHeight: h } = video;
  if (!w || !h) return Promise.resolve(null);
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) =>
    canvas.toBlob(
      (blob) =>
        resolve(blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : null),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
}

export function PhotoCard({ token, done, onDone }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A mounted iPad must never sit with its camera light on. Stopping every
  // track is the whole point of this ref.
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      // The <video> mounts in the same commit as cameraOn — attach after paint.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {
            /* autoplay rejection is harmless; the element is muted+playsInline */
          });
        }
      });
    } catch (err) {
      // The whole reason for getUserMedia over capture="user": this is
      // reachable. capture="user" fails silently and strands the customer.
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCameraError(
          "Camera access is blocked on this device. Choose a photo from the device instead, or ask the front desk.",
        );
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setCameraError(
          "No camera found on this device. Choose a photo from the device instead.",
        );
      } else {
        setCameraError(
          "The camera couldn't be started. Choose a photo from the device instead.",
        );
      }
    }
  };

  const capture = async () => {
    if (!videoRef.current) return;
    const f = await frameToFile(videoRef.current);
    if (!f) {
      setCameraError("Couldn't capture the photo. Try again.");
      return;
    }
    stopCamera();
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const pickFromDevice = (f: File | null) => {
    if (!f) return;
    stopCamera();
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const reset = () => {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/self-serve/${token}/photo`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? `Upload failed (${res.status})`);
        return;
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className={DONE_CARD_CLASS}>
        <span aria-hidden="true">&#10003;</span>
        <span>Photo added</span>
      </div>
    );
  }

  return (
    <div className={CARD_CLASS}>
      <h2 className="font-medium text-ink">Add your photo</h2>
      <p className="text-sm text-ink-muted">
        Helps the front desk recognize you at check-in.
      </p>

      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => pickFromDevice(e.target.files?.[0] ?? null)}
      />

      {preview ? (
        <div className="flex flex-col items-center gap-4 py-2">
          <img
            src={preview}
            alt="Profile preview"
            className="w-40 h-40 rounded-full object-cover ring-2 ring-border"
          />
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Retake
          </button>
        </div>
      ) : cameraOn ? (
        <div className="space-y-3">
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full aspect-square rounded-xl object-cover bg-cream-2"
          />
          <button type="button" onClick={capture} className={PRIMARY_BTN}>
            Capture
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={startCamera}
            className={`${PRIMARY_BTN} inline-flex items-center justify-center gap-2`}
          >
            <Camera className="w-5 h-5" />
            Take a photo
          </button>
          <button
            type="button"
            onClick={() => uploadRef.current?.click()}
            className={`${GHOST_BTN} inline-flex items-center justify-center gap-2`}
          >
            <ImageIcon className="w-5 h-5" />
            Choose from device
          </button>
        </div>
      )}

      <ErrorBanner message={cameraError} onDismiss={() => setCameraError(null)} />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {file && (
        <button type="button" onClick={upload} disabled={busy} className={PRIMARY_BTN}>
          {busy ? "Uploading…" : "Save photo"}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the failure path by hand**

`getUserMedia` requires a secure context — it works on `localhost`. Run `npm run dev`, open a self-serve link, and:
1. Allow the camera → preview appears, Capture produces a round preview, Save uploads.
2. Block the camera in the browser's site settings, reload, tap "Take a photo" → the `NotAllowedError` banner appears **and "Choose from device" still works**. This is the dead-end the task exists to remove; confirm it explicitly.
3. Navigate away mid-preview → the camera indicator turns off (tracks stopped).

- [ ] **Step 3: Type check and commit**

```bash
npx tsc --noEmit
git add src/components/self-serve/PhotoCard.tsx
git commit -m "fix(self-serve): in-page camera capture that can't dead-end

capture=\"user\" bounces to the iOS Camera app and emits no error when
blocked, stranding an unattended kiosk. getUserMedia surfaces a catchable
NotAllowedError, keeps the upload fallback reachable, downscales before
upload, and stops the tracks so a mounted iPad doesn't hold the camera open."
```

---

### Task 5: `SelfServe` gains `onDone`; delete the sessionStorage breadcrumb

The kiosk will render `SelfServe` inline, so completion must be a callback rather than a page navigation.

**Files:**
- Modify: `src/components/self-serve/SelfServe.tsx`
- Delete: `src/lib/kiosk/return-slug.ts`
- Modify: `src/components/kiosk/KioskLanding.tsx` (remove the sessionStorage write; the file is deleted in Task 6)

**Interfaces:**
- Produces: `SelfServe` props gain `onDone?: () => void`. When present it is called instead of navigating; the `kioskSlug` redirect path is retained for links opened standalone.

- [ ] **Step 1: Add the prop and thread it to `CheckedInScreen`**

In `SelfServe.tsx`, add `onDone` to the props:

```tsx
export default function SelfServe({
  token,
  context,
  kioskSlug,
  publishableKey,
  onDone,
}: {
  token: string;
  context: Context;
  kioskSlug?: string | null;
  publishableKey?: string;
  /** Kiosk-embedded mode: reset the kiosk in place instead of navigating.
   *  Absent for a texted link opened standalone. */
  onDone?: () => void;
}) {
```

Delete the `KIOSK_RETURN_SLUG_KEY` import, the `returnSlug` sessionStorage `useEffect`, and the `SLUG_RX` fallback read. Keep the query-param path:

```tsx
  const returnSlug = kioskSlug && SLUG_RX.test(kioskSlug) ? kioskSlug : null;
```

Pass `onDone` through:
```tsx
  if (allDone || nothingOutstanding) {
    return (
      <CheckedInScreen
        spaceName={context.spaceName ?? null}
        summary={context.summary}
        returnSlug={returnSlug}
        onDone={onDone}
      />
    );
  }
```

- [ ] **Step 2: Make `CheckedInScreen` prefer the callback**

```tsx
function CheckedInScreen({
  spaceName,
  summary,
  returnSlug,
  onDone,
}: {
  spaceName: string | null;
  summary: string;
  returnSlug: string | null;
  onDone?: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(KIOSK_REDIRECT_SECONDS);
  // Embedded in a kiosk (onDone) or opened from a kiosk-issued link
  // (returnSlug) — either way, hand the device back for the next person.
  const returning = Boolean(onDone || returnSlug);

  useEffect(() => {
    if (!returning) return;
    if (secondsLeft <= 0) {
      if (onDone) onDone();
      else if (returnSlug) window.location.href = `/kiosk/${returnSlug}`;
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, returning, returnSlug, onDone]);
```

In the JSX, replace the `{returnSlug && (...)}` block with `{returning && (...)}`, and swap the `<a href>` for a `<button onClick={() => (onDone ? onDone() : (window.location.href = `/kiosk/${returnSlug}`))}>` styled with `PRIMARY_BTN`.

- [ ] **Step 3: Delete the breadcrumb module**

```bash
git rm src/lib/kiosk/return-slug.ts
grep -rn "KIOSK_RETURN_SLUG_KEY\|return-slug" src/
```
Expected: the only remaining hit is in `KioskLanding.tsx`. Remove that `useEffect` and its import (the file itself is replaced in Task 6).

- [ ] **Step 4: Type check and commit**

```bash
npx tsc --noEmit
git add -A src/components/self-serve/SelfServe.tsx src/components/kiosk/KioskLanding.tsx src/lib/kiosk/return-slug.ts
git commit -m "refactor(self-serve): completion callback instead of a sessionStorage breadcrumb"
```

---

### Task 6: `KioskRoot` — one page, two token-resolvers, no navigation

Collapse the duplicate wizard. `FindBooking` and `WalkInWizard` both become *token resolvers*; the finish flow is the shared `SelfServe`.

**Files:**
- Create: `src/components/kiosk/KioskRoot.tsx`
- Create: `src/components/kiosk/PhoneKeypad.tsx`
- Modify: `src/components/kiosk/FindBooking.tsx`
- Modify: `src/components/kiosk/WalkInWizard.tsx`
- Delete: `src/components/kiosk/KioskLanding.tsx`
- Modify: `src/pages/kiosk/[locationSlug]/index.astro`

**Interfaces:**
- Consumes: `SelfServe` + its `onDone` (Task 5).
- Produces:
  - `KioskRoot(props: { locationSlug: string; locationName: string; brandName: string; publishableKey: string })` — default export, the kiosk island.
  - `FindBooking(props: { locationSlug: string; onToken: (token: string) => void; onBack: () => void })`
  - `WalkInWizard(props: { locationSlug: string; onToken: (token: string) => void; onBack: () => void })`
  - `PhoneKeypad(props: { value: string; onChange: (v: string) => void; maxLength?: number })`

- [ ] **Step 1: Build `PhoneKeypad`**

An on-screen keypad, so the iOS keyboard never covers half the kiosk.

```tsx
"use client";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export function PhoneKeypad({
  value,
  onChange,
  maxLength = 10,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  const press = (k: string) => {
    if (k === "") return;
    if (k === "⌫") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= maxLength) return;
    onChange(value + k);
  };

  return (
    <div className="grid grid-cols-3 gap-3">
      {KEYS.map((k, i) => (
        <button
          key={i}
          type="button"
          disabled={k === ""}
          onClick={() => press(k)}
          aria-label={k === "⌫" ? "Delete" : k || undefined}
          className={
            k === ""
              ? "invisible"
              : "h-20 rounded-xl border border-border bg-paper text-2xl font-medium text-ink transition-colors hover:bg-cream-2 active:scale-[0.98]"
          }
        >
          {k}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `FindBooking` as a token resolver**

Keep the existing debounced search effect, but: drive `q` from `PhoneKeypad` instead of a text input; require 4 digits; and replace the `window.location.href` navigation in `openResult` with `onToken(body.token)`.

```tsx
  const openResult = async (r: Result) => {
    setOpening(true);
    setError(null);
    try {
      const res = await fetch(`/api/kiosk/${locationSlug}/token-for-target`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: r.kind, targetId: r.targetId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((body as { error?: string }).error ?? `Couldn't open (${res.status})`);
        return;
      }
      // The kiosk tab never leaves /kiosk/<slug> — hand the token up and let
      // KioskRoot render the finish flow inline.
      onToken((body as { token: string }).token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setOpening(false);
    }
  };
```

Note: `token-for-target` currently returns `{ url }`. Check `src/pages/api/kiosk/[locationSlug]/token-for-target.ts` — if it returns only a URL, add `token` to the response body alongside `url` (leave `url` in place; nothing else depends on it changing).

Display copy becomes: heading "Find your booking", helper text "Enter the phone number on your booking.", and the digit display showing `value` formatted, with `text-4xl font-display`. Gate the search on `q.length >= 4`.

- [ ] **Step 3: Shrink `WalkInWizard` to session + contact**

Delete `WaiverStep`, `PhotoStep`, `PaymentStep`, the `Elements`/`loadStripe`/`stripePromiseCache` imports, `submitWaiver`, `submitPhoto`, `clientSecret`, `paymentAmounts`, and the `"waiver" | "photo" | "payment" | "done"` members of `Step`. Keep `SessionStep` and `ContactStep` exactly as they are — they are the good, editorial implementations and there is nothing equivalent in the self-serve cards.

`Step` becomes `type Step = "session" | "contact";` and `STEPS: Step[] = ["session", "contact"]`.

`startBooking` ends by handing the token up:

```tsx
      setToken(body.token);   // remove this line
      onToken(body.token);    // and this replaces it — SelfServe takes over
```

Props become `{ locationSlug, onToken, onBack }` — `locationName` and `publishableKey` are no longer used here (the masthead owns the name; `PayCard` gets the key from `KioskRoot`).

Keep the progress bar, but it now reads `Step 01 / 02` for the wizard's own two steps. Update the header copy to say "Step 1 of 2 — then waiver, photo, and payment" so the customer isn't surprised by what follows.

- [ ] **Step 4: Build `KioskRoot`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import SelfServe from "@/components/self-serve/SelfServe";
import { FindBooking } from "./FindBooking";
import { WalkInWizard } from "./WalkInWizard";

type Mode = "landing" | "find" | "walkin" | "finish";

interface Props {
  locationSlug: string;
  locationName: string;
  brandName: string;
  publishableKey: string;
}

export default function KioskRoot({
  locationSlug,
  locationName,
  brandName,
  publishableKey,
}: Props) {
  useHydrationBeacon();

  const [mode, setMode] = useState<Mode>("landing");
  const [token, setToken] = useState<string | null>(null);
  const [context, setContext] = useState<unknown | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumping this remounts the whole interactive subtree, which is how a
  // reset destroys state rather than clearing it field by field.
  const [nonce, setNonce] = useState(0);

  const reset = useCallback(() => {
    setToken(null);
    setContext(null);
    setError(null);
    setLoadingToken(false);
    setMode("landing");
    setNonce((n) => n + 1);
    try {
      sessionStorage.clear();
    } catch {
      /* unavailable — nothing to clear */
    }
  }, []);

  // Both entry paths converge here: a token is all the finish flow needs.
  const onToken = useCallback(async (t: string) => {
    setLoadingToken(true);
    setError(null);
    try {
      const res = await fetch(`/api/self-serve/${t}`);
      if (!res.ok) {
        setError(`Couldn't open your booking (${res.status}). Please see the front desk.`);
        return;
      }
      setContext(await res.json());
      setToken(t);
      setMode("finish");
    } catch {
      setError("Couldn't reach the server. Please see the front desk.");
    } finally {
      setLoadingToken(false);
    }
  }, []);

  return (
    <div key={nonce} className="space-y-8">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loadingToken && (
        <p className="text-sm text-ink-muted">Opening your booking…</p>
      )}

      {mode === "landing" && (
        <Landing
          locationName={locationName}
          brandName={brandName}
          onFind={() => setMode("find")}
          onWalkIn={() => setMode("walkin")}
        />
      )}

      {mode === "find" && (
        <FindBooking
          locationSlug={locationSlug}
          onToken={onToken}
          onBack={reset}
        />
      )}

      {mode === "walkin" && (
        <WalkInWizard
          locationSlug={locationSlug}
          onToken={onToken}
          onBack={reset}
        />
      )}

      {mode === "finish" && token && context && (
        <SelfServe
          token={token}
          context={context as never}
          publishableKey={publishableKey}
          onDone={reset}
        />
      )}
    </div>
  );
}
```

`Landing` is the two-button screen lifted verbatim from `KioskLanding.tsx` (the `Already booked` / `Just dropping in` cards), minus the sessionStorage `useEffect`. Keep its markup — it is already correct and on-token. Take `brandName` where it currently hardcodes nothing, and render the facility name as the headline as it does today.

- [ ] **Step 5: Point the Astro page at `KioskRoot`**

In `src/pages/kiosk/[locationSlug]/index.astro`, add the brand import and swap the island:

```astro
import { getBrandTheme } from "@/lib/branding/themes";
const brandName = getBrandTheme(Astro.locals.brandId).displayName;
```
```astro
<KioskRoot
  client:load
  locationSlug={slug!}
  locationName={locationName!}
  brandName={brandName}
  publishableKey={import.meta.env.STRIPE_PUBLISHABLE_KEY ?? ""}
/>
```

Delete `src/components/kiosk/KioskLanding.tsx`.

- [ ] **Step 6: Walk both paths end to end**

```bash
npm run dev
```
1. `/kiosk/<slug>` → "Find my booking" → keypad → a seeded phone → result → **the URL must still be `/kiosk/<slug>`** and the waiver/photo/payment cards render inline.
2. Back → "Walk-in registration" → session → contact → the same inline cards appear. Confirm no second waiver UI.
3. Finish a booking → the checked-in screen counts down → the kiosk returns to landing with all fields empty.

- [ ] **Step 7: Type check and commit**

```bash
npx tsc --noEmit
git add -A src/components/kiosk "src/pages/kiosk/[locationSlug]/index.astro"
git commit -m "refactor(kiosk): single page, shared finish flow

FindBooking and WalkInWizard now both resolve a token and hand off to the
shared SelfServe cards, so the tab never leaves /kiosk/<slug> and the
duplicate waiver/photo/payment implementations in WalkInWizard are gone."
```

---

### Task 7: Idle reset and offline banner

An abandoned walk-in currently leaves name, email, phone, and DOB on a public screen indefinitely.

**Files:**
- Create: `src/components/kiosk/IdleResetOverlay.tsx`
- Modify: `src/components/kiosk/KioskRoot.tsx`

**Interfaces:**
- Consumes: `reset()` from Task 6.
- Produces: `IdleResetOverlay(props: { secondsLeft: number; onStay: () => void })`

- [ ] **Step 1: Build the overlay**

```tsx
"use client";

export function IdleResetOverlay({
  secondsLeft,
  onStay,
}: {
  secondsLeft: number;
  onStay: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Are you still there?"
      className="fixed inset-0 z-50 flex items-center justify-center bg-cream/95 p-6"
    >
      <div className="w-full max-w-md space-y-5 rounded-xl border border-border bg-paper p-8 text-center">
        <h2 className="font-display text-3xl font-medium italic text-ink">
          Still there?
        </h2>
        <p className="text-sm text-ink-muted">
          We'll clear this screen in {secondsLeft}s to protect your details.
        </p>
        <button
          type="button"
          onClick={onStay}
          className="w-full rounded-xl bg-primary px-6 py-4 text-base font-medium text-cream transition-all hover:bg-primary/90 active:scale-[0.99]"
        >
          I'm still here
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the timer into `KioskRoot`**

Add to `KioskRoot`:

```tsx
/** Idle seconds before we warn, on any screen holding personal details. */
const IDLE_WARN_AFTER_MS = 60_000;
/** Countdown shown in the warning before the hard reset. */
const IDLE_GRACE_SECONDS = 20;
```

```tsx
  const [idleSeconds, setIdleSeconds] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  // Suppressed while a charge is in flight — never wipe the screen
  // mid-payment. SelfServe owns that window; the kiosk only knows the mode.
  const armed = mode !== "landing";

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!armed) {
      setIdleSeconds(null);
      return;
    }
    let warnTimer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(warnTimer);
      setIdleSeconds(null);
      warnTimer = setTimeout(() => setIdleSeconds(IDLE_GRACE_SECONDS), IDLE_WARN_AFTER_MS);
    };
    const onActivity = () => arm();
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    arm();
    return () => {
      clearTimeout(warnTimer);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [armed, nonce]);

  // Countdown, then the hard reset.
  useEffect(() => {
    if (idleSeconds === null) return;
    if (idleSeconds <= 0) {
      reset();
      return;
    }
    const t = setTimeout(() => setIdleSeconds((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [idleSeconds, reset]);
```

Render, inside the returned tree:

```tsx
      {!online && (
        <div className="rounded-xl border border-ochre/40 bg-ochre/10 px-5 py-4 text-sm text-ink">
          No internet connection. Please see the front desk — we can check you
          in by hand.
        </div>
      )}

      {idleSeconds !== null && (
        <IdleResetOverlay
          secondsLeft={idleSeconds}
          onStay={() => setIdleSeconds(null)}
        />
      )}
```

Note: `onStay` clears the countdown; the `pointerdown` listener that fired to reach the button already re-armed the warn timer.

- [ ] **Step 3: Verify by hand**

Run `npm run dev`, open the kiosk, enter the walk-in contact step, fill in a name, and wait. At 60s the overlay appears; at 80s the kiosk returns to landing and the name field is empty on re-entry. Tapping "I'm still here" cancels it. Confirm the landing screen never triggers the overlay.

- [ ] **Step 4: Commit**

```bash
npx tsc --noEmit
git add src/components/kiosk/IdleResetOverlay.tsx src/components/kiosk/KioskRoot.tsx
git commit -m "feat(kiosk): idle reset and offline banner

An abandoned walk-in left name, email, phone and DOB on a public screen.
60s idle -> a 20s warning -> a hard state-destroying reset. Never armed on
the landing screen, which holds nothing."
```

---

### Task 8: SoccerOne branding and the Aspire attribution

**Files:**
- Create: `src/components/kiosk/KioskMasthead.astro`
- Modify: `src/pages/kiosk/[locationSlug]/index.astro`

**Interfaces:**
- Consumes: `brandName` (Task 6), `getBrandTheme`.
- Produces: `<KioskMasthead brandName={...} locationName={...} today={...} />`

- [ ] **Step 1: Build the masthead**

Deliberately **not** `SoccerOneHeader`: that carries nav links and a Sign In, and every link is an escape hatch off an unattended kiosk. This reuses the `.so-wordmark` treatment — the SoccerOne tokens are already bundled into every page by `BaseLayout`, so it costs no new CSS.

```astro
---
interface Props {
  brandName: string;
  locationName: string;
  today: string;
}
const { brandName, locationName, today } = Astro.props;
const isSoccerOne = brandName === "SoccerOne";
---
<div class="border-b border-border">
  <div class="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
    <div class="flex items-baseline gap-3">
      {isSoccerOne ? (
        <span class="so-wordmark" aria-label="SoccerOne">
          <span class="wm-soccer">SOCCER</span><span class="wm-one">ONE</span>
        </span>
      ) : (
        <span class="font-display text-xl font-medium italic text-ink">{brandName}</span>
      )}
      <span class="text-[11px] font-semibold tracking-[0.18em] uppercase text-ink-muted">
        {locationName}
      </span>
    </div>
    <p class="text-[11px] font-medium tracking-[0.08em] uppercase text-ink-faint">
      {today}
    </p>
  </div>
</div>
```

- [ ] **Step 2: Add the attribution strip**

At the bottom of the `<main>` in `src/pages/kiosk/[locationSlug]/index.astro`:

```astro
<footer class="border-t border-border mt-auto">
  <div class="max-w-2xl mx-auto px-6 py-4 text-center">
    <p class="text-[11px] tracking-[0.12em] uppercase text-ink-faint">
      Powered by <span class="text-ink-muted font-semibold">Aspire Sports</span>
    </p>
  </div>
</footer>
```

Make `<main>` a `flex flex-col` with `min-h-screen` so the footer sits at the bottom on a tall iPad screen.

- [ ] **Step 3: Fix the title**

Replace the hardcoded Aspire title. The page already computes `brandName` (Task 6, Step 5):

```astro
title={locationName ? `${locationName} kiosk — ${brandName}` : `Kiosk — ${brandName}`}
```

Replace the existing `§ The Front Desk` masthead block with `<KioskMasthead brandName={brandName} locationName={locationName!} today={today} />`. Keep the `today` computation — it is already correctly zoned to the location.

The "Kiosk not configured" error state should render the masthead too, with `locationName` omitted, so a mistyped URL still looks like the product.

- [ ] **Step 4: Verify on both hosts**

Run `npm run dev`. On the SoccerOne host the masthead shows the SOCCER/ONE wordmark on the dark skin, and "Powered by Aspire Sports" is legible but quiet. On the Aspire host it falls back to the Aspire display name and the cream skin. No nav links anywhere on the page.

- [ ] **Step 5: Commit**

```bash
git add src/components/kiosk/KioskMasthead.astro "src/pages/kiosk/[locationSlug]/index.astro"
git commit -m "feat(kiosk): SoccerOne masthead and Powered by Aspire Sports strip"
```

---

### Task 9: iPad hardening

**Files:**
- Create: `src/styles/kiosk.css`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/pages/kiosk/[locationSlug]/index.astro`
- Create: `docs/kiosk-operator-notes.md`

**Interfaces:**
- Produces: `BaseLayout` gains a named `head` slot (it has none today).

- [ ] **Step 1: Add a `head` slot to `BaseLayout`**

Inside `<head>`, immediately before `</head>`, add:

```astro
    <slot name="head" />
```

This is additive — every existing caller is unaffected.

- [ ] **Step 2: Write the kiosk stylesheet**

```css
/* src/styles/kiosk.css — unattended, mounted-iPad hardening. */

.kiosk-surface {
  /* Kill the ~300ms double-tap-zoom delay on every tap. */
  touch-action: manipulation;
  /* Rubber-banding must not reveal Safari's chrome on a mounted device. */
  overscroll-behavior: none;
  /* iOS inflates text in some orientations without this. */
  -webkit-text-size-adjust: 100%;
  /* Long-press selection highlights are noise on a kiosk... */
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  /* Respect the notch/home indicator when installed to the home screen. */
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}

/* ...but never on the fields people actually have to type into. */
.kiosk-surface input,
.kiosk-surface textarea {
  -webkit-user-select: text;
  user-select: text;
  /* Below 16px, iOS Safari zooms the viewport on focus and never zooms back. */
  font-size: max(16px, 1rem);
}

/* Primary kiosk actions are hit at arm's length, standing up. */
.kiosk-surface button {
  min-height: 44px;
}
```

- [ ] **Step 3: Apply it in the kiosk page**

In `src/pages/kiosk/[locationSlug]/index.astro`:

```astro
import "@/styles/kiosk.css";
```

```astro
<Fragment slot="head">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
</Fragment>
```

Add `kiosk-surface` to the `<main>` class list.

Note: `BaseLayout` already emits a `viewport` meta. Two `viewport` tags means the **last one wins** in Safari, and the slot renders after it — so this override is correct as written. Verify in devtools that `viewport-fit=cover` is the effective value.

- [ ] **Step 4: Make `← Back` a real target**

In `FindBooking` and `WalkInWizard`, the back control is a bare text button (~20px tall). Replace its class with:

```tsx
className="inline-flex items-center gap-2 min-h-[44px] px-4 -ml-4 rounded-lg text-base text-ink-muted hover:text-ink transition-colors"
```

- [ ] **Step 5: Write the operator note**

```markdown
<!-- docs/kiosk-operator-notes.md -->
# Kiosk — facility setup

The kiosk is a web page, not an app. Locking the iPad to it is a **device**
setting, not something the code can do.

## One-time iPad setup

1. Settings → Accessibility → **Guided Access** → on. Set a passcode. This
   passcode is the only way out of the kiosk — do not lose it.
2. Safari → open `https://gosoccerone.com/kiosk/<location-slug>`.
3. Share → **Add to Home Screen**. Launch from that icon: it runs full-screen
   with no address bar, so nobody can browse away.
4. Triple-click the side button → **Guided Access** → Start.
5. Settings → Display & Brightness → Auto-Lock → **Never**.
6. Leave it on a charger. It is designed to run all day.

## What the kiosk does on its own

- Clears the screen after 60 seconds of inactivity (with a 20-second warning),
  so no customer's details are left on display.
- Returns to the start screen automatically after each check-in.
- Shows an honest "no connection" message if the Wi-Fi drops. It does **not**
  queue registrations offline — a queued booking could be sold out by the time
  it reached us, and telling someone that an hour later is worse than telling
  them now.

## If something goes wrong

Exit Guided Access with the passcode and reload the page. Nothing is stored on
the device.
```

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit
npm run build
git add src/styles/kiosk.css src/layouts/BaseLayout.astro "src/pages/kiosk/[locationSlug]/index.astro" src/components/kiosk docs/kiosk-operator-notes.md
git commit -m "feat(kiosk): iPad hardening + operator notes

viewport-fit, no double-tap zoom, no overscroll, 16px inputs (iOS zooms
below that), 44px targets. Device lockdown is Guided Access, documented."
```

---

### Task 10: E2E coverage

**Files:**
- Create: `tests/e2e/kiosk.spec.ts`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Confirm no existing kiosk spec would break**

```bash
grep -rln "kiosk" tests/e2e/
```
Expected: no matches (the kiosk has no E2E coverage today). If any spec appears, read it and update it in this task — per `CLAUDE.md`, full Playwright runs are **post-merge only**, so a broken spec will not fail the PR and will silently break `main`.

- [ ] **Step 2: Write the spec**

```ts
import { expect, test } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

// The seeded facility slug; matches src/lib/db/seeds/seed-e2e-tests.ts.
const KIOSK = "/kiosk/worthington";

test.describe("kiosk", () => {
  test("landing shows the brand, the facility, and the Aspire attribution", async ({ page }) => {
    await page.goto(KIOSK, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(page.getByText(/powered by/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /find my booking/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /walk-in registration/i })).toBeVisible();
  });

  test("find-my-booking never leaves the kiosk URL", async ({ page }) => {
    await page.goto(KIOSK, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await page.getByRole("button", { name: /find my booking/i }).click();
    // Phone keypad, not a text input — the whole point of the search change.
    await expect(page.getByRole("button", { name: "5" })).toBeVisible();
    for (const d of ["5", "5", "5", "5"]) {
      await page.getByRole("button", { name: d, exact: true }).click();
    }
    // Whether or not a booking matches the seed, the URL must not change.
    await expect(page).toHaveURL(new RegExp(`${KIOSK}$`));
  });

  test("a name query surfaces nobody", async ({ page }) => {
    // Regression guard for the privacy fix: the keypad is digits-only, so
    // there is no way to type a name at all.
    await page.goto(KIOSK, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await page.getByRole("button", { name: /find my booking/i }).click();
    await expect(page.locator('input[type="text"]')).toHaveCount(0);
  });

  // THE regression guard for the camera dead-end (Task 4). PhotoCard was
  // rewritten from <input capture="user"> — which on iOS bounces to the
  // Camera app and emits NO error event when blocked — to getUserMedia,
  // precisely so a denied permission becomes visible and recoverable rather
  // than a silent dead-end on an unattended iPad. Nothing else in the suite
  // proves that, and it cannot be proven by reading the diff.
  test("a blocked camera shows an error and leaves the upload fallback usable", async ({ page }) => {
    // Force the denial deterministically — do not rely on browser permission
    // state, which differs between headed local runs and headless CI.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: () =>
            Promise.reject(
              new DOMException("Permission denied", "NotAllowedError"),
            ),
        },
      });
    });

    await page.goto(KIOSK, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    // Drive the walk-in flow to the photo step. (Session + contact steps are
    // Task 6's WalkInWizard; the waiver is Task 3's WaiverCard.)
    // ... reach the photo step, then:
    await page.getByRole("button", { name: /take a photo/i }).click();

    // The whole point: the failure is SEEN.
    await expect(page.getByText(/camera access is blocked/i)).toBeVisible();
    // ...and the customer is not stranded.
    await expect(
      page.getByRole("button", { name: /choose from device/i }),
    ).toBeEnabled();
  });

  test("walk-in reaches the contact step", async ({ page }) => {
    await page.goto(KIOSK, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await page.getByRole("button", { name: /walk-in registration/i }).click();
    await expect(page.getByText(/pick a session|no open sessions/i)).toBeVisible();
  });
});
```

- [ ] **Step 3: Run it locally — it will not run on the PR**

```bash
npm run dev   # in another shell
PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- tests/e2e/kiosk.spec.ts
```
Expected: 5 passed. If the seeded facility slug differs, read `src/lib/db/seeds/seed-e2e-tests.ts` and fix `KIOSK` — do not weaken the assertions to make it pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/kiosk.spec.ts
git commit -m "test(kiosk): e2e coverage for branding, no-navigation, and digits-only search"
```

---

### Task 11: Full pre-push verification

Per `CLAUDE.md`'s pre-push checklist. This touches admin-adjacent routes and shared components, so it warrants the full run.

- [ ] **Step 1: No schema changes to migrate**

```bash
git diff main --name-only -- src/lib/db/schema/
```
Expected: empty. If not, run `npm run db:generate` and commit the migration.

- [ ] **Step 2: Re-seed and run the API suite**

```bash
npm run db:seed:e2e
# with the dev server already up, started with R2_MOCK=1 CRON_SECRET=<x> E2E_TEST_ENDPOINTS=yes
CRON_SECRET=<same> TEST_BASE_URL=http://localhost:4321 npm run test:api
```

- [ ] **Step 3: Playwright, build, types**

```bash
PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test
npm run build
npx tsc --noEmit
```
Expected: build clean, zero type errors. Known-flaky staging-data failures are documented in memory — triage by file overlap with this branch before chasing any.

- [ ] **Step 4: Confirm the duplication is actually gone**

```bash
grep -rn "PaymentElement\|confirmPayment" src/components/kiosk/
```
Expected: **no matches.** Payment now lives only in `PayCard`. If the wizard still has a payment path, the consolidation is incomplete and Task 6 is not done.

- [ ] **Step 5: Open the PR**

Flag the waiver wording explicitly in the PR body — it is legal copy and needs the owner's sign-off, not a reviewer's rubber stamp:

> **Needs a decision:** the waiver now names *"SoccerOne, operated by Aspire Sports, and its partner venues"* (it previously named only Aspire Sports, on a SoccerOne-branded kiosk). Confirm or replace this wording.

---

## Self-Review

**Spec coverage:** §1 single-page → Tasks 5, 6. §2 branding → Task 8 (+ `brandName` threading in 6). §3 idle reset → Task 7. §4 phone search → Task 2 (API) + Task 6 (keypad). §5 correctness: `dayBoundsInTz` → Task 1; camera → Task 4; missing `catch` → Tasks 4, 6 (the surviving fetches all have `catch`); `ErrorBanner`/`role="alert"` → Task 3; offline → Task 7. §6 iPad → Task 9. Testing → Tasks 1, 2, 10, 11. Out-of-scope items are correctly absent.

**Added beyond the spec:** the token-restyle of the self-serve cards (Task 3). The spec assumed the cards were reusable as-is; reading them showed they use hardcoded `stone-*`/`white` classes that are illegible under the SoccerOne inversion — which is a live bug for texted links today, and would have made the kiosk visually worse. The guardian consent line (Task 3, Step 3) is the same class of finding: it exists only in `WalkInWizard` and would have been silently dropped by the merge.

**Type consistency:** `onToken(token: string)` is the shared resolver signature in Tasks 5 and 6. `reset()` is used by Tasks 6 and 7. `dayBoundsInTz(tz, now)` returns `{ start, end }` in Tasks 1 and 2. `WaiverCard` gains `playerName` in Task 3 and is passed it from `SelfServe` in the same task. `CARD_CLASS`/`DONE_CARD_CLASS`/`PRIMARY_BTN`/`GHOST_BTN` live in `src/components/self-serve/card-styles.ts` (Task 3) and are consumed in Task 4.
