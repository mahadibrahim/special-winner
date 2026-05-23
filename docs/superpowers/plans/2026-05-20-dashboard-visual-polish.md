# Dashboard Visual Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED SUB-SKILL for component tasks (7–15):** Use the `frontend-design` skill when building/redesigning each visual component. The approved visual reference is `docs/superpowers/specs/2026-05-20-dashboard-visual-polish-mockup.html` — open it in a browser; it is the source of truth for spacing, color weight, and card anatomy.

**Goal:** Re-skin the dual-persona dashboard (`/dashboard/play` + `/dashboard/family`) to the editorial design system — one unified card system, contained-panel sections, a two-axis (type + status) card model, venue + Directions on every event card, no numbered headers, no emoji.

**Architecture:** A small foundation layer — a type-config map, shared panel/badge class constants, and two card components (`DashboardCard`, `ExploreCard`) — is built first. Every dashboard component is then recomposed onto it. One data-layer change: the play games endpoint joins `venues` so game cards can show venue name + a Google Maps directions link. Drop-in and field-rental payloads already carry `venueName`, which their Directions links use directly — no schema/endpoint change needed there.

**Tech Stack:** Astro 5, React 19, Tailwind CSS 4 (CSS-token theme in `src/styles/globals.css`), `lucide-react` for icons, Drizzle ORM, Vitest (`tests/unit`, `tests/api`).

**Design reference:** `docs/superpowers/specs/2026-05-20-dashboard-visual-polish-design.md` (spec) and `...-mockup.html` (approved visual).

---

## Conventions for every task

- Branch is `feat/dashboard-visual-polish` (already checked out in this worktree).
- After each task: `npx tsc --noEmit` must report **zero** errors before committing.
- Component tasks have no unit-test harness in this repo — they are verified by `npx tsc --noEmit` + `npm run build` + visual check in the dev server. Logic/endpoint tasks (1–3) use real tests.
- Commit at the end of every task with the message shown.

---

## File structure

**New files**
- `src/lib/dashboard/maps.ts` — builds a Google Maps directions URL from a venue.
- `src/lib/dashboard/card-types.ts` — the `CardType` union + `CARD_TYPES` config map (icon, hue classes, eyebrow). Imports `lucide-react`.
- `src/lib/dashboard/dashboard-ui.ts` — panel / header / badge Tailwind class constants + raw section-icon SVG strings. No `lucide-react` import (so `.astro` files can import it freely).
- `src/components/dashboard/shell/DashboardCard.tsx` — the typed row-card primitive + `DashboardVenue` sub-component.
- `src/components/dashboard/shell/ExploreCard.tsx` — the Explore grid card.
- `tests/unit/dashboard-maps.test.ts`, `tests/unit/card-types.test.ts`, `tests/api/dashboard/play-games.test.ts`.

**Modified files**
- `src/pages/api/dashboard/play/games.ts` — venue join.
- `src/components/dashboard/shell/DashboardSection.astro` — becomes the panel.
- `src/components/dashboard/play/{PlayAttention,PlayUpcoming,PlayMembership,PlayExplore}.tsx` — recomposed.
- `src/components/dashboard/{MyDropInBookings,MyFieldRentals}.tsx` — recomposed.
- `src/pages/dashboard/play.astro`, `src/pages/dashboard/family.astro` — section wiring.
- `src/components/dashboard/{children-overview,coach-notes,payments-summary,announcements}.tsx` — re-skin to card chrome.
- `src/components/dashboard/shell/DashboardShell.astro` — minor header polish.

---

## Task 1: Google Maps directions helper

**Files:**
- Create: `src/lib/dashboard/maps.ts`
- Test: `tests/unit/dashboard-maps.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/dashboard-maps.test.ts
import { describe, it, expect } from "vitest";
import { directionsUrl } from "@/lib/dashboard/maps";

describe("directionsUrl", () => {
  it("prefers the address when present", () => {
    expect(directionsUrl({ name: "Aspire Downtown", address: "1810 N High St, Columbus OH" }))
      .toBe("https://www.google.com/maps/dir/?api=1&destination=1810%20N%20High%20St%2C%20Columbus%20OH");
  });
  it("falls back to the name when address is missing", () => {
    expect(directionsUrl({ name: "Aspire Downtown", address: null }))
      .toBe("https://www.google.com/maps/dir/?api=1&destination=Aspire%20Downtown");
  });
  it("returns null when neither is present", () => {
    expect(directionsUrl({ name: null, address: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/dashboard-maps.test.ts`
Expected: FAIL — `directionsUrl` is not defined.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/dashboard/maps.ts

/** A venue we can route to — at least one of name/address should be set. */
export interface RoutableVenue {
  name?: string | null;
  address?: string | null;
}

/**
 * Builds a Google Maps directions URL for a venue. Prefers the street
 * address (more reliable), falls back to the venue name. Returns null when
 * the venue has neither — callers should not render a Directions link.
 */
export function directionsUrl(venue: RoutableVenue): string | null {
  const destination = venue.address?.trim() || venue.name?.trim() || "";
  if (!destination) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/dashboard-maps.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/maps.ts tests/unit/dashboard-maps.test.ts
git commit -m "feat(dashboard): add Google Maps directions URL helper"
```

---

## Task 2: Games endpoint returns venue name + address

**Context:** `src/pages/api/dashboard/play/games.ts` currently selects `venueId` and `fieldNumber` but no venue name/address — the game card cannot show where to go. Add a venue lookup, mirroring the existing N+1-safe opponent-name pattern in the same file. The `venues` table (`src/lib/db/schema/teams.ts`) has `id`, `name` (notNull), `address` (nullable text).

**Files:**
- Modify: `src/pages/api/dashboard/play/games.ts`
- Test: `tests/api/dashboard/play-games.test.ts` (if a play-games API test already exists, add the `venue fields` test to it instead of creating a new file)

- [ ] **Step 1: Write the failing API test**

```ts
// tests/api/dashboard/play-games.test.ts
import { describe, it, expect } from "vitest";
import { signIn } from "../../utils/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("GET /api/dashboard/play/games — venue fields", () => {
  it("returns venueName and venueAddress on each game", async () => {
    const cookie = await signIn("player@test.aspiresports.com", "TestPlayer123!");
    const res = await fetch(`${BASE}/api/dashboard/play/games`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const { games } = await res.json();
    for (const g of games) {
      expect(g).toHaveProperty("venueName");
      expect(g).toHaveProperty("venueAddress");
    }
  });
});
```

> Note: confirm the player test account/credentials against `tests/utils/test-helpers.ts` and the e2e seed — adjust the email/password to whatever the seed provisions for an adult player with games. If no seeded player has games, the loop is vacuously true but `status === 200` still asserts the endpoint shape.

- [ ] **Step 2: Run test to verify it fails**

Start the dev server first (`npm run dev`), then:
Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/dashboard/play-games.test.ts`
Expected: FAIL — `venueName` / `venueAddress` missing.

- [ ] **Step 3: Implement the venue join**

In `src/pages/api/dashboard/play/games.ts`:

3a. Add `venues` to the schema import:
```ts
import { games, teams, venues } from "@/lib/db/schema/teams";
```

3b. After the opponent-name block (after `teamNameMap` is built), add a venue lookup:
```ts
  // Collect venue ids → fetch name + address in one query (N+1-safe).
  const venueIds = [...new Set(upcoming.map((g) => g.venueId).filter((v): v is string => v !== null))];
  const venueMap = new Map<string, { name: string; address: string | null }>();
  if (venueIds.length > 0) {
    const venueRows = await db
      .select({ id: venues.id, name: venues.name, address: venues.address })
      .from(venues)
      .where(inArray(venues.id, venueIds));
    for (const v of venueRows) venueMap.set(v.id, { name: v.name, address: v.address });
  }
```

3c. In the `result` map, add venue fields:
```ts
  const result = upcoming.map((g) => {
    const isHome = g.homeTeamId !== null && teamIds.includes(g.homeTeamId);
    const opponentId = isHome ? g.awayTeamId : g.homeTeamId;
    const opponentName = opponentId ? (teamNameMap.get(opponentId) ?? null) : null;
    const venue = g.venueId ? venueMap.get(g.venueId) : undefined;
    return {
      ...g,
      isHome,
      opponentName,
      venueName: venue?.name ?? null,
      venueAddress: venue?.address ?? null,
    };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/dashboard/play-games.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/dashboard/play/games.ts tests/api/dashboard/play-games.test.ts
git commit -m "feat(dashboard): return venue name + address from play games endpoint"
```

---

## Task 3: Card-type config + dashboard-ui constants

**Context:** Two small foundation modules, the single source of truth for the visual system. `card-types.ts` imports `lucide-react`; `dashboard-ui.ts` deliberately does not, so `.astro` files can import it without pulling React.

**Files:**
- Create: `src/lib/dashboard/card-types.ts`
- Create: `src/lib/dashboard/dashboard-ui.ts`
- Test: `tests/unit/card-types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/card-types.test.ts
import { describe, it, expect } from "vitest";
import { CARD_TYPES, type CardType } from "@/lib/dashboard/card-types";

describe("CARD_TYPES", () => {
  const types: CardType[] = ["league_game", "tournament", "pickup", "class", "field_rental"];
  it("defines every card type with a complete config", () => {
    for (const t of types) {
      const c = CARD_TYPES[t];
      expect(c.icon).toBeTruthy();
      expect(c.eyebrow.length).toBeGreaterThan(0);
      for (const k of ["tile", "edge", "tint", "accentText", "accentBorder"] as const) {
        expect(typeof c[k]).toBe("string");
        expect(c[k].length).toBeGreaterThan(0);
      }
    }
  });
  it("maps tournament onto the league-game hue but its own eyebrow", () => {
    expect(CARD_TYPES.tournament.edge).toBe(CARD_TYPES.league_game.edge);
    expect(CARD_TYPES.tournament.eyebrow).toBe("Tournament");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/card-types.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `card-types.ts`**

```ts
// src/lib/dashboard/card-types.ts
import { Trophy, Users, GraduationCap, Flag, type LucideIcon } from "lucide-react";

/** The kinds of event/membership a dashboard card can represent. */
export type CardType = "league_game" | "tournament" | "pickup" | "class" | "field_rental";

export interface CardTypeConfig {
  icon: LucideIcon;
  /** Eyebrow label rendered above the card title. */
  eyebrow: string;
  /** Solid icon-tile classes (background + icon color). */
  tile: string;
  /** 4px left-edge border color class. */
  edge: string;
  /** Faint type-tint card background class. */
  tint: string;
  /** Accent text color (eyebrow, type-toned figures). */
  accentText: string;
  /** Accent border color (Directions chip). */
  accentBorder: string;
}

const GAME_HUE = {
  tile: "bg-primary text-cream",
  edge: "border-l-primary",
  tint: "bg-primary/[0.06]",
  accentText: "text-primary",
  accentBorder: "border-primary/45",
} as const;

export const CARD_TYPES: Record<CardType, CardTypeConfig> = {
  league_game: { icon: Trophy, eyebrow: "League game", ...GAME_HUE },
  tournament:  { icon: Trophy, eyebrow: "Tournament", ...GAME_HUE },
  pickup: {
    icon: Users, eyebrow: "Pickup game",
    tile: "bg-navy text-cream", edge: "border-l-navy",
    tint: "bg-navy/[0.06]", accentText: "text-navy", accentBorder: "border-navy/45",
  },
  class: {
    icon: GraduationCap, eyebrow: "Class / clinic",
    tile: "bg-ochre text-cream", edge: "border-l-ochre",
    tint: "bg-ochre/[0.08]", accentText: "text-ochre", accentBorder: "border-ochre/45",
  },
  field_rental: {
    icon: Flag, eyebrow: "Field rental",
    tile: "bg-sage text-cream", edge: "border-l-sage",
    tint: "bg-sage/[0.08]", accentText: "text-sage", accentBorder: "border-sage/45",
  },
};
```

- [ ] **Step 4: Create `dashboard-ui.ts`**

```ts
// src/lib/dashboard/dashboard-ui.ts
// Panel + badge class constants shared by DashboardSection.astro (Astro) and
// the React island components. No lucide-react import here on purpose — keeps
// it safe to import from .astro files.

export type SectionAccent = "attention" | "default" | "explore";

/** Outer panel container, per section accent. */
export const PANEL_CLASS: Record<SectionAccent, string> = {
  attention: "rounded-2xl border border-ochre/30 bg-paper overflow-hidden",
  default:   "rounded-2xl border border-border bg-paper overflow-hidden",
  explore:   "rounded-2xl border border-sage/30 bg-paper overflow-hidden",
};

/** Panel header row. */
export const PANEL_HEADER_CLASS: Record<SectionAccent, string> = {
  attention: "flex items-center gap-2.5 px-4 py-3 border-b border-border bg-ochre/[0.07]",
  default:   "flex items-center gap-2.5 px-4 py-3 border-b border-border bg-cream/40",
  explore:   "flex items-center gap-2.5 px-4 py-3 border-b border-border bg-sage/[0.06]",
};

/** Tiny-caps section label. */
export const PANEL_LABEL_CLASS: Record<SectionAccent, string> = {
  attention: "text-[11px] font-semibold tracking-[0.15em] uppercase text-ochre",
  default:   "text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted",
  explore:   "text-[11px] font-semibold tracking-[0.15em] uppercase text-sage",
};

/** Solid icon tile in the panel header. */
export const PANEL_ICON_CLASS: Record<SectionAccent, string> = {
  attention: "w-[22px] h-[22px] rounded-md flex items-center justify-center bg-ochre text-cream shrink-0",
  default:   "w-[22px] h-[22px] rounded-md flex items-center justify-center bg-primary text-cream shrink-0",
  explore:   "w-[22px] h-[22px] rounded-md flex items-center justify-center bg-sage text-cream shrink-0",
};

/** Panel body wrapper. */
export const PANEL_BODY_CLASS = "p-4 flex flex-col gap-2.5";

/** Status badge tones — design-system badge recipe. */
export type StatusTone = "confirmed" | "action" | "pending";
export const STATUS_BADGE: Record<StatusTone, string> = {
  confirmed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  action:    "bg-amber-500/10 text-amber-700 border-amber-500/20",
  pending:   "bg-cream-3 text-ink-2 border-border",
};

/**
 * Raw lucide SVG inner markup for the Astro DashboardSection header icons
 * (Astro cannot render lucide-react components). 16×16 viewBox 24, stroke.
 */
export const SECTION_ICONS = {
  attention: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  calendar:  '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M3 10h18M8 2v5M16 2v5"/>',
  shield:    '<path d="M12 3 4 6v5c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6l-8-3Z"/>',
  compass:   '<circle cx="12" cy="12" r="9"/><path d="m15 9-4 1-1 4 4-1 1-4Z"/>',
} as const;

export type SectionIcon = keyof typeof SECTION_ICONS;
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run tests/unit/card-types.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests), zero type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard/card-types.ts src/lib/dashboard/dashboard-ui.ts tests/unit/card-types.test.ts
git commit -m "feat(dashboard): add card-type config + shared UI class constants"
```

---

## Task 4: DashboardSection.astro → contained panel

**Context:** `DashboardSection.astro` currently renders `{index} · {title}` as a bare heading. It becomes the **panel**: a bordered container with an icon + label header and a slotted body. The `index` prop is removed.

**Files:**
- Modify: `src/components/dashboard/shell/DashboardSection.astro`

- [ ] **Step 1: Replace the component**

```astro
---
import {
  PANEL_CLASS, PANEL_HEADER_CLASS, PANEL_LABEL_CLASS, PANEL_ICON_CLASS,
  PANEL_BODY_CLASS, SECTION_ICONS, type SectionAccent, type SectionIcon,
} from "@/lib/dashboard/dashboard-ui";

interface Props {
  title: string;
  icon: SectionIcon;
  accent?: SectionAccent;
  /** Optional right-aligned count, e.g. "3 events". */
  count?: string;
}

const { title, icon, accent = "default", count } = Astro.props;
---

<section class={PANEL_CLASS[accent]}>
  <div class={PANEL_HEADER_CLASS[accent]}>
    <span class={PANEL_ICON_CLASS[accent]}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
           set:html={SECTION_ICONS[icon]} />
    </span>
    <span class={PANEL_LABEL_CLASS[accent]}>{title}</span>
    {count && <span class="ml-auto text-[10px] font-medium tracking-wide text-ink-faint">{count}</span>}
  </div>
  <div class={PANEL_BODY_CLASS}>
    <slot />
  </div>
</section>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors. (Call-site errors in `play.astro`/`family.astro` for the removed `index` prop are fixed in Tasks 12–13 — if `tsc` flags them now, that is expected; proceed.)

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/shell/DashboardSection.astro
git commit -m "refactor(dashboard): DashboardSection becomes a contained panel, drop section numbers"
```

---

## Task 5: DashboardCard component

**Context:** The single typed row-card primitive every event/entity card composes. Build it with the `frontend-design` skill against the mockup — the mockup's `.v3-card` block is the exact target (left edge, solid icon tile, eyebrow, title, when-line, venue line, status badge, side action).

**Files:**
- Create: `src/components/dashboard/shell/DashboardCard.tsx`

- [ ] **Step 1: Build the component**

Implement `DashboardCard` and a `DashboardVenue` sub-component exported from the same file. Required API (later tasks depend on these exact names/props):

```tsx
"use client";
import type { ReactNode } from "react";
import { MapPin, Navigation, type LucideIcon } from "lucide-react";
import { CARD_TYPES, type CardType } from "@/lib/dashboard/card-types";
import { STATUS_BADGE, type StatusTone } from "@/lib/dashboard/dashboard-ui";

export interface DashboardVenueInfo {
  /** e.g. "Field 1 · Aspire Sports — Downtown / OSU" */
  label: string;
  /** Google Maps URL from directionsUrl(); null hides the chip. */
  mapsUrl: string | null;
}

export interface DashboardCardProps {
  /** Event type → icon, hue, eyebrow. Omit for a neutral entity card. */
  type?: CardType;
  /** Larger tile + serif title — use for the single "next" item in a section. */
  hero?: boolean;
  /** Overrides the type's eyebrow; required when `type` is omitted and an eyebrow is wanted. */
  eyebrow?: string;
  title: ReactNode;
  /** The "when" line (date/time/coach). */
  meta?: ReactNode;
  venue?: DashboardVenueInfo;
  status?: { label: string; tone: StatusTone };
  /** Right-side action (a Button/anchor). */
  action?: ReactNode;
  /** Dim text under the badge, e.g. "3 spots left". */
  sideText?: ReactNode;
  /** Icon for a neutral (typeless) card. Ignored when `type` is set. */
  icon?: LucideIcon;
  /** Extra body content below the venue line (notes etc.). */
  children?: ReactNode;
}

export function DashboardVenue({ label, mapsUrl }: DashboardVenueInfo): JSX.Element { /* ... */ }
export function DashboardCard(props: DashboardCardProps): JSX.Element { /* ... */ }
```

Rendering rules (match the mockup):
- Outer: `rounded-xl border border-border border-l-4 p-3` + the type's `edge` + `tint`; a **neutral** card (no `type`) uses `border-l-border` and `bg-cream-2`, no left-edge accent.
- Icon tile: `w-10 h-10 rounded-[11px]` with the type's `tile` classes; `hero` → `w-[46px] h-[46px]`. The icon is `CARD_TYPES[type].icon` at 20px; a neutral card accepts an `icon` via `eyebrow`-less usage — for neutral cards pass the icon through a new optional `icon?: LucideIcon` prop (add it to the interface).
- Eyebrow: `text-[9px] font-bold tracking-[0.13em] uppercase` in the type's `accentText`.
- Title: `font-semibold text-sm text-ink`; `hero` → `font-display text-xl`.
- `meta`: `text-xs text-ink-2` with a small leading `Clock`/`Calendar` icon supplied by the caller as part of the node, or keep meta plain text — keep it plain text, callers pass a string.
- `DashboardVenue`: a `MapPin` (12px, type-accent or `text-primary` for neutral), the `label` in `text-[11px] text-ink-2`, then — when `mapsUrl` is set — a **Directions chip**: an `<a target="_blank" rel="noopener">` with `Navigation` icon, `text-[10px] font-semibold`, the type's `accentBorder`, `rounded-full px-2 py-0.5`.
- Status badge: `text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border` + `STATUS_BADGE[tone]`.
- `action` and `sideText` stack in a right-aligned column.

Neutral cards (no `type`) render the `icon` prop in a `bg-cream-3 text-ink-muted` tile; when `type` is set the type icon and `tile` win and `icon` is ignored.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/shell/DashboardCard.tsx
git commit -m "feat(dashboard): add DashboardCard typed row-card primitive"
```

---

## Task 6: ExploreCard component

**Context:** The Explore section uses a 3-up grid of vertical cards (icon, title, description, link), not row cards. Mockup reference: the `.v3-exc` block.

**Files:**
- Create: `src/components/dashboard/shell/ExploreCard.tsx`

- [ ] **Step 1: Build the component**

```tsx
"use client";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

export interface ExploreCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  cta: string;
  /** cross-sell card → sage treatment; default → primary. */
  variant?: "default" | "cross-sell";
  target?: string;
}

export function ExploreCard(props: ExploreCardProps): JSX.Element { /* ... */ }
```

Rendering (match `.v3-exc`):
- `<a>` block, `rounded-xl border p-3.5`; default → `border-border bg-cream-2`; cross-sell → `border-sage/30 bg-sage/[0.06]`.
- Icon in a `w-[30px] h-[30px] rounded-lg` solid tile — `bg-primary text-cream` default, `bg-sage text-cream` cross-sell.
- Title `text-[13px] font-semibold` — `text-ink` default, `text-sage` cross-sell.
- Description `text-[11px] text-ink-muted`.
- CTA row: `cta` text + `ArrowRight` 11px, `text-[11px] font-semibold` in primary/sage; `group-hover` nudges the arrow.

Use the `frontend-design` skill for the final polish.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/shell/ExploreCard.tsx
git commit -m "feat(dashboard): add ExploreCard grid card"
```

---

## Task 7: Recompose PlayAttention

**Context:** `PlayAttention` self-hides when there is nothing pending, so it owns its **own panel** (it is not wrapped by `DashboardSection`). Keep all existing data-fetch logic (`/api/rentals/bookings`, `/api/dropin/bookings`, `/api/payments/history`) and the `AttentionItem` model unchanged — this task is presentation only.

**Files:**
- Modify: `src/components/dashboard/play/PlayAttention.tsx`

- [ ] **Step 1: Recompose the render**

- Remove the `kindIcon` emoji map (`📍⏳💳`).
- Replace the hand-rolled `<section>` + `<h2>` + `border-stone-200` items with: an outer panel using `PANEL_CLASS.attention`, `PANEL_HEADER_CLASS.attention`, `PANEL_ICON_CLASS.attention`, `PANEL_LABEL_CLASS.attention`, `PANEL_BODY_CLASS` from `dashboard-ui.ts`; header icon = lucide `<TriangleAlert size={13} />`; label text "Needs your attention"; `count` = `${items.length} item${items.length === 1 ? "" : "s"}`.
- Each `AttentionItem` renders a `<DashboardCard>`:
  - `kind: "check_in"` → `type="field_rental"` is wrong; check-ins span rentals and drop-ins. Map kind→card props as: `check_in` → no `type`, `icon={MapPin}`, `eyebrow="Check in"`, `status={{label:"Check in", tone:"confirmed"}}`; `expiring_hold` → `type="field_rental"`, `status={{label:"Action needed", tone:"action"}}`; `outstanding_balance` → no `type`, `icon={CreditCard}`, `eyebrow="Balance due"`, `status={{label:"Balance due", tone:"action"}}`.
  - `title` = `item.label`, `meta` = `item.sublabel`.
  - `action` = the existing "Go" button (keep `Button asChild` → `<a href={item.href}>`).
- Keep the `loading` → `null` and `items.length === 0` → `null` early returns exactly as they are.

The visual target is the mockup's Attention panel. Use the `frontend-design` skill.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/play/PlayAttention.tsx
git commit -m "refactor(dashboard): recompose PlayAttention onto the card system"
```

---

## Task 8: Recompose PlayUpcoming

**Context:** Keep both fetches (`/api/dashboard/play/games`, `/api/dropin/bookings`) and all filtering logic. Add the new `venueName`/`venueAddress` fields (from Task 2) to the `Game` interface. This task restyles + adds the venue line.

**Files:**
- Modify: `src/components/dashboard/play/PlayUpcoming.tsx`

- [ ] **Step 1: Extend the `Game` interface**

Add to `interface Game`:
```ts
  venueName: string | null;
  venueAddress: string | null;
```

- [ ] **Step 2: Recompose the render**

- The component renders **inside** `DashboardSection` (wired in Task 12) — so it returns just the cards, not a panel. Keep `LoadingSkeleton` / `ErrorBanner` / `EmptyState` returns; they now sit inside the panel body.
- `nextGame` → `<DashboardCard hero type="league_game">`:
  - `title` = `<>vs <span>{opponentName ?? "Opponent TBD"}</span></>` (the opponent emphasis is handled by the hero serif title + `accentText`).
  - `meta` = `${fmtDate} · ${fmtTime}` + field number when present.
  - `venue` = `{ label: venueLabel(nextGame), mapsUrl: directionsUrl({ name: venueName, address: venueAddress }) }` where `venueLabel` builds `"Field N · <venueName>"` (or just the venue name when no field number; `"Venue TBD"` when `venueName` is null).
  - `status` = `nextGame.isHome ? {label:"Home", tone:"confirmed"} : undefined`; also keep the postponed/cancelled badge logic — if status is postponed/cancelled, that wins (`tone:"pending"` / a neutral).
- `restGames` → `<DashboardCard type="league_game">` (non-hero), same mapping, in the "More games" group. Keep the `h3` sub-headers ("More games", "Pickup sessions") but restyle them to `text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted`.
- Drop-in `bookings` → `<DashboardCard type="pickup">`: `title` = `sportOrClassLabel` (+ `formatLabel`), `meta` = `fmtDateTime(startsAt)`, `venue` = `{ label: session.venueName ?? "Venue TBD", mapsUrl: directionsUrl({ name: session.venueName }) }`, `action` = the existing "Details" link to `/dropin/${sessionId}`.
- Remove all `border-stone-*`, `bg-amber-50`, `bg-stone-50` classes — the cards now own their chrome.
- Import `directionsUrl` from `@/lib/dashboard/maps`.

Use `frontend-design` for polish against the mockup's "What's coming up" panel.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/play/PlayUpcoming.tsx
git commit -m "refactor(dashboard): recompose PlayUpcoming with type cards + venue line"
```

---

## Task 9: Recompose PlayMembership

**Context:** Keep the three fetches and all grouping/standings logic. Restyle teams + registrations onto `DashboardCard` (neutral — these are entity cards, not events) and restyle the standings table.

**Files:**
- Modify: `src/components/dashboard/play/PlayMembership.tsx`

- [ ] **Step 1: Recompose**

- Returns cards directly (wrapped by `DashboardSection` in Task 12). Keep `LoadingSkeleton`/`ErrorBanner`/`EmptyState`.
- Keep the three `h3` sub-headers ("My teams", "Standings", "Registrations"), restyled to `text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted`.
- Each team → `<DashboardCard>` neutral, `icon={Shield}` (lucide), `eyebrow="My team"`, `title` = the team name preceded by the existing color dot, `meta` = `${division ?? ""} · ${fmtRecord(record)}` rendered with the record in `font-mono`. Keep it neutral (no type hue) per the spec — entity card.
- Standings tables: replace `border-stone-200` → `border-border`; header row `bg-cream-2`; zebra rows `bg-paper` / `bg-cream-2` (remove `bg-white`); my-team row keeps `font-semibold` and the `text-primary` marker.
- Each registration → `<DashboardCard>` neutral, `icon={ClipboardList}`, `eyebrow="League registration"`, `title` = program name, `meta` = season name + location, `status` = `statusBadge(reg.status)` mapped to a `StatusTone` (`active`/`confirmed`→`confirmed`, `waitlisted`/default→`pending`), `action` = the existing "View" link.
- Delete the local `statusBadgeClass` helper — status colors now come from `STATUS_BADGE`.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/play/PlayMembership.tsx
git commit -m "refactor(dashboard): recompose PlayMembership onto the card system"
```

---

## Task 10: Recompose PlayExplore

**Files:**
- Modify: `src/components/dashboard/play/PlayExplore.tsx`

- [ ] **Step 1: Recompose**

- Keep the `cards` data array; add an `icon` field to each entry: Adult leagues → `Trophy`, Book a field → `MapPin`, Kids' camp → `Star` (from `lucide-react`).
- Replace the hand-rolled `<a>` markup with `<ExploreCard>` (Task 6) per card. The cross-sell card passes `variant="cross-sell"`.
- Render in `<div className="grid gap-3 sm:grid-cols-3">`.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/play/PlayExplore.tsx
git commit -m "refactor(dashboard): recompose PlayExplore onto ExploreCard"
```

---

## Task 11: Recompose MyDropInBookings + MyFieldRentals

**Context:** These are the components rendering the bright-white bordered boxes in the original screenshot. They render inside the "What you're part of" panel on `/dashboard/play`. Re-skin onto `DashboardCard` and remove their own panel/heading chrome (the `DashboardSection` provides it) — but keep their internal `<h3>` sub-headers ("Drop-in bookings", "Field rentals") restyled to the tiny-caps style, and keep all booking/cancel/check-in/countdown logic untouched.

**Files:**
- Modify: `src/components/dashboard/MyDropInBookings.tsx`
- Modify: `src/components/dashboard/MyFieldRentals.tsx`

- [ ] **Step 1: Recompose MyDropInBookings**

- Each booking row → `<DashboardCard type="pickup">` (drop-in sessions are pickup/class — use `type="class"` when the session is a class; if the payload exposes a class/game distinction use it, otherwise default all to `pickup`).
- `title` = session label, `meta` = date/time, `venue` = `{ label: venueName ?? "Venue TBD", mapsUrl: directionsUrl({ name: venueName }) }`, `status` = the booking status mapped to a `StatusTone`, `action` = the existing Cancel / check-in controls (keep their handlers verbatim).
- Remove the white-card chrome, `border-stone-*`, serif heading box. Restyle the section's `<h3>` to tiny-caps.

- [ ] **Step 2: Recompose MyFieldRentals**

- Each rental → `<DashboardCard type="field_rental">`; `title` = `Field ${fieldNumber}` / venue, `meta` = start–end, `venue` line, `status` from rental status, `action` = existing pay/cancel/countdown controls (keep verbatim, including the hold countdown).
- Same chrome cleanup. Keep the `EmptyState` ("No field rentals yet").

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/MyDropInBookings.tsx src/components/dashboard/MyFieldRentals.tsx
git commit -m "refactor(dashboard): recompose drop-in + field-rental lists onto the card system"
```

---

## Task 12: Wire play.astro to the new panels

**Files:**
- Modify: `src/pages/dashboard/play.astro`

- [ ] **Step 1: Update the DashboardSection usages**

- `PlayAttention` stays as a direct child (it renders its own panel) — leave its placement, remove any stale comment referencing "1 ·".
- Section 2: `<DashboardSection icon="calendar" title="What's coming up" accent="default">` — remove `index`.
- Section 3: `<DashboardSection icon="shield" title="What you're part of" accent="default">` — remove `index`. It wraps `PlayMembership`, `MyDropInBookings`, `MyFieldRentals`.
- Section 4: `<DashboardSection icon="compass" title="Explore" accent="explore">` — remove `index`.
- Keep the `client:visible` / `client:load` directives as they are.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors; build succeeds.

- [ ] **Step 3: Visual check**

Start `npm run dev`, sign in as an adult player, open `/dashboard/play`. Confirm: no numbered headers, panels contained, type colors on cards, Directions chips present, no emoji.

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard/play.astro
git commit -m "refactor(dashboard): wire play dashboard to contained-panel sections"
```

---

## Task 13: Wire family.astro to the new panels

**Files:**
- Modify: `src/pages/dashboard/family.astro`

- [ ] **Step 1: Update DashboardSection usages**

Section 1 `<DashboardSection icon="attention" title="Needs your attention" accent="attention">`, 2 `icon="calendar"`, 3 `icon="shield"`, 4 `icon="compass" accent="explore"` — remove every `index` prop.

- [ ] **Step 2: Replace the blue phone-verify banner**

Replace the inline `from-blue-500/10 … text-blue-400` phone-verify `<a>` block with the ochre attention treatment: `bg-ochre/[0.07] border border-ochre/30`, icon tile `bg-ochre text-cream`, link text `text-ochre`. Keep the href, copy, and the `{!isPhoneVerified && (...)}` guard.

- [ ] **Step 3: Replace the Explore section cards**

Replace the four hand-rolled emoji `<a>` cards (`📘 How we coach`, `⚽ Register for a season`, `🛍️ store`, `💬 Need Help?`) with `ExploreCard` instances in a `grid gap-3 sm:grid-cols-3` (the Help card can be a fourth grid item or kept as a row card — render it as an `ExploreCard` with `icon={MessageCircle}`). Icons: `BookOpen` (How we coach), `CalendarPlus` (Register for a season), `ShoppingBag` (store), `MessageCircle` (Need Help). Keep the `{externalStore && ...}` conditional.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/family.astro
git commit -m "refactor(dashboard): wire family dashboard to panels, drop blue banner + emoji"
```

---

## Task 14: Re-skin family deep components

**Context:** `children-overview`, `coach-notes`, `payments-summary`, `announcements` render inside the family "What you're part of" panel. Re-skin them to the design system — **visual only, no logic or data-wiring change** (they keep their current mock-data behavior; that is explicitly out of scope per the spec). The type-hue system does NOT apply here — these are entity cards; use the neutral `DashboardCard` treatment or plain design-system card classes (`bg-paper`/`bg-cream-2`, `border-border`).

**Files:**
- Modify: `src/components/dashboard/children-overview.tsx`
- Modify: `src/components/dashboard/coach-notes.tsx`
- Modify: `src/components/dashboard/payments-summary.tsx`
- Modify: `src/components/dashboard/announcements.tsx`

- [ ] **Step 1: children-overview.tsx**

- Remove gradient avatar rings, `sportColors` gradient map, gradient skill bars → flat design-system equivalents (avatar tile `bg-cream-3`/`bg-primary`; progress bars `bg-primary`).
- Replace `text-amber-400` / `text-emerald-400` / `text-amber-200` (dark-theme colors, low-contrast on cream) with design-system tokens — badges use the `STATUS_BADGE` recipe, accents use `text-primary`/`text-ochre`.
- Card chrome → `border-border`, `bg-paper`/`bg-cream-2`, one radius.
- Keep every prop, fetch, and the empty/loading branches unchanged.

- [ ] **Step 2: coach-notes.tsx**

- Remove emoji-free already; remove `bg-blue-500/10` (focus category), `from-white/[0.04]` gradient, `blur-2xl` decorative orb, `text-violet-400`/`text-pink-400`/`text-emerald-400`.
- Category colors → design-system palette: progress→sage, achievement→ochre, focus→primary, encouragement→ochre (or navy). Note tiles use solid/tinted design-system hues.
- `border-stone`/`border-white/*` → `border-border`. Keep `mockNotes` and all logic.

- [ ] **Step 3: payments-summary.tsx**

- Remove `bg-blue-500/10` ("processing"), `text-emerald-400`/`text-amber-400`/`text-red-400` → `STATUS_BADGE` recipe + design-system text tokens.
- Stat-card chrome → `bg-paper border-border`. Keep `mockPayments` and all logic.

- [ ] **Step 4: announcements.tsx**

- It uses shadcn `<Card>` + `text-muted-foreground`; bring it in line with the other cards' chrome (`bg-paper border-border`, `text-ink-muted`). Keep the dialog and all logic.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/children-overview.tsx src/components/dashboard/coach-notes.tsx src/components/dashboard/payments-summary.tsx src/components/dashboard/announcements.tsx
git commit -m "refactor(dashboard): re-skin family components to the editorial design system"
```

---

## Task 15: DashboardShell header polish + final verification

**Files:**
- Modify: `src/components/dashboard/shell/DashboardShell.astro`

- [ ] **Step 1: Header polish**

`DashboardShell.astro` is already close (clean avatar, no status dot). Confirm the greeting/name typography matches the mockup: name in `font-display` (Newsreader), avatar tile `rounded-xl`. Adjust spacing only if it diverges from the mockup. No structural change.

- [ ] **Step 2: Full typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors; build succeeds.

- [ ] **Step 3: Dual-persona E2E**

Run the existing dual-persona E2E (it must still pass — persona routing, tabs, `aspire_dash` cookie):
`PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- dashboard`
Expected: PASS. If the persona spec filename differs, run the full `npm test` dashboard group.

- [ ] **Step 4: Visual review — both dashboards, all personas**

With `npm run dev` running, sign in and confirm against the mockup:
- `/dashboard/play` (adult player) — four contained panels, type-colored cards, Directions chips, no numbers, no emoji, no `stone`/blue.
- `/dashboard/family` (parent) — same panel system, ochre phone banner, ExploreCard grid.
- A both-persona account — tabs render, both destinations consistent.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/shell/DashboardShell.astro
git commit -m "polish(dashboard): finalize shell header, dashboard visual polish complete"
```

---

## Done criteria

- Both dashboards render with one card system, contained panels, design-system color only.
- No numbered section headers, no emoji, no `border-stone-*`, no blue.
- Every game / pickup / class / rental card shows its venue and a working Directions link.
- `npx tsc --noEmit` clean, `npm run build` succeeds, dual-persona E2E green.
- Out of scope (untouched): mock-data wiring in family cards, the `/account` relocation, IA/persona-routing changes.
