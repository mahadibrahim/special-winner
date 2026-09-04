# Aspire Sports — Broadsheet Design System (v2)

> A match programme, not a magazine. Heavy condensed capitals, ink and sand bands alternating down the page, orange carrying real surface.

Last updated: 2026-09-03 · Supersedes the Editorial system (v1, 2026-04-16)
Design canvas: `Aspire Design System v2.dc.html` in the claude.ai/design project (reference page: `Aspire Classes & Camps.dc.html`, option 2a).

---

## What changed, and why

v1 was *The Athletic* meets *Tracksmith* — warm cream paper, Newsreader serif headlines, a single orange hot-spot held in reserve. It was calm and credible, and it under-sold a sports organisation. v2 keeps the warmth in the relief bands and replaces the voice: display type is now heavy condensed Archivo capitals, ink is a page surface rather than only a text colour, and orange is allowed to own a full band.

**Scope: the Aspire brand, everywhere it appears.** Public marketing, parent dashboard, coach and referee apps, admin, minibooks.

**Out of scope: SoccerOne — fully inert.** The app is multi-tenant. SoccerOne runs on its own locked token set (`src/styles/soccerone-tokens.css` — Anton / DM Sans / JetBrains Mono, lime on near-black, its own 2–20px radius scale), pinned to observed production values by founder decision. v2 does not touch it, **including shared flows (auth, checkout, dashboard) rendered under `data-brand="soccerone"`** — `src/lib/branding/themes.ts` overrides every v2 seam back to what v1 rendered there:

- the **v2 primitive names** (`--sand`, `--on-sand`, `--primary`, `--primary-foreground`, `--secondary`, `--rule-color`…) as well as the v1 alias names, because the v2 semantic vars resolve through the primitives;
- the **display-voice seams** (`--brand-display-weight/-leading/-tracking`) back to 500 / 1.05 / −0.02em — Anton has a single 400 face and Aspire's 900 would synthetic-bold it;
- the **radius scale seams** (`--radius-scale-xs`…`-4xl`) back to v1's values, so SoccerOne's shared flows keep their rounding while Aspire is square;
- `--primary-bright` → lime and `--primary-hover` → lime-bright, so the audited v2 CTAs (`bg-primary-bright … hover:bg-primary-hover`) render exactly like v1's lime buttons.

Only sub-pixel-scale details intentionally follow Aspire's base styles under SoccerOne (body letter-spacing 0 vs v1's −0.005em, focus-outline corner radius, dropped `ss01`/`ss02` features — all invisible at rendering scale).

**What did not change:** the orange itself (`oklch(0.58 0.19 35)`), the sand/cream ramp values, emerald as the youth accent, ochre as tertiary, the graded-imagery recipe, and every reveal animation. **v1 token names are aliased, not removed** — `--cream`, `--ink-2`, `--ink-muted`, `--primary-orange` and friends still resolve, so `bg-cream` / `text-ink-muted` / `text-primary-orange` keep working. Migrate at your own pace.

### Repo deviations from the design canvas

Recorded here so nobody "fixes" them back toward the canvas:

- **Emerald keeps its v1 trio** (`--emerald: oklch(0.55 0.12 160)`, `-bright`, `-soft`). The canvas swatch reads `0.52 0.08 155`, but that is v1's `--sage` value and the canvas's own prose declares emerald unchanged; live youth pages depend on the trio. `--sage` stays a separate literal (success states), not an emerald alias.
- **Youth extension tokens retained**: `--brand-red`, `--royal`, `--royal-bright` (logo-derived, 2026-08-18 youth redesign) are still real tokens with `@theme` mappings.
- **`--primary-hover` (`oklch(0.70 0.17 40)`)** is a repo addition: the hover for orange fills, lighter so ink text gains contrast on hover. Used by `.btn--primary:hover` and `hover:bg-primary-hover` utility sites.
- **The whole Tailwind radius scale** (`--radius-xs` … `--radius-4xl`) resolves through `var(--radius)` (0), so `rounded-2xl` cards go square too; `rounded-full` / pills are untouched.
- **Everything after the token blocks is layered** (`@layer base` / `@layer components`) per the CSS layering rule below — the canvas's flat stylesheet is not the repo shape.
- **Link colours are scoped to `.band-*` surfaces**, not a bare `a` rule. Legacy pages have unclassed links that inherit their surface colour (cream links on graded heroes); the canvas's global `a { color: var(--primary-text) }` painted those ~2.9:1 dark-orange-on-dark. New band-rhythm pages get the link rule automatically; legacy links keep inheritance until their page converts.

---

## The file

`src/styles/globals.css` is the system. It keeps the `@import "tailwindcss"` / `@import "tw-animate-css"` lines, the full `@theme inline` mapping (new token names *and* the v1 aliases, so existing utilities resolve), the `@layer base` block, `.rule` / `.rule-heavy` / `.label-sm` / `.drop-cap` / `.paper-grain`, the focus ring, the reveal animations, the reduced-motion guard, `.graded` (+ `--fill`), and the mobile tap-responsiveness block. Nothing from v1 was silently dropped.

---

## Typography

| Role | Family | Setting | Usage |
|------|--------|---------|-------|
| **Display** | Archivo | wght 900, wdth 78–84%, uppercase | h1–h3, hero, section heads, card titles, prices |
| **Body / UI** | Archivo | wght 400–700, wdth 100% | Body copy, labels, buttons, inputs |
| **Mono** | IBM Plex Mono | 400–500 | **(1)** discrete data values — times, ages, counts, statuses, prices · **(2)** technical annotation — token names, code, spec captions |

**Mono has two jobs, both narrow.**

1. **The data itself** — a value that is measured or counted. Not keys, not column heads, not nav items, not section labels: those are `.label` (Archivo 800, tracked). If you can't read the content aloud as a value, it isn't mono.
2. **Technical annotation** — token names, code samples, spec-sheet metadata. This job belongs to **documentation surfaces only** (this doc, code in coaching guides). It is not licence to annotate product UI in mono.

So `Tue · 4:30–5:15pm`, `18mo – 3 yrs` and `3 left` are mono under (1); `--primary-bright` and `radius 0 · pill 999px` on a spec sheet are mono under (2); `When`, `Where`, `Class`, `Pathway`, `Aspire Sports` are neither.

**Tune mono for the editorial register.** A class table should read like a schedule, not a log file, and mono is what pushes it technical. So where a mono **value** sits beside sans, match the surrounding size (14px next to 14–15px sans, not a size down), keep weight 400, and use the same colour as the adjacent sans — never add tracking to a mono value. Mono marks the value; it shouldn't announce it.

The one exception is **inline token and code spans inside prose** (job 2), which sit one step down — 12px in 14px copy, 13px in 15px. Plex Mono's x-height runs larger than Archivo's, so a matched size reads oversized mid-sentence. This carve-out applies to annotation only, never to a value in a table or card. Standalone annotation (band captions, swatch readouts, diagram tags) is its own element and sets its own size (10–11px) rather than stepping down from a parent.

**Links follow the same rule.** On light surfaces a link is `--primary-text` (5.92:1 on paper) and **hover darkens to ink** — brightening a link on a light background lowers its contrast, and `--primary-bright` measures only 3.32:1 on paper, so it must never be a light-surface text colour. On ink bands the pair inverts: `--primary-bright` link, cream hover.

**Names and categories are sans, not mono.** A value is measured or counted — a time, an age, a count, a status, a price. A *name* is neither: `Saturday Micros`, `Worthington Fieldhouse`, `Foundation`, `Technical`, `Coach Ade`. In a table row that means mono and sans interleave by column, and that is correct — the eye uses the shift to tell measurements from labels.

**Mixed content follows the same test per part.** A filter chip is the common case: `3–5` is an age band, so that chip is mono (`.chip--value`); `Classes` and `Worthington Fieldhouse` are a category and a name, so those chips are sans. The trailing count is always mono (`.chip__count`), because a count is always a value — so a sans chip can legitimately carry a mono number.

One family carries display and body. The display voice is a **width and weight setting**, not a second font file — which is why the whole system loads in a single variable face.

### Loading fonts

Loaded once in `src/layouts/BaseLayout.astro`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=IBM+Plex+Mono:wght@400;500&display=swap"
  rel="stylesheet"
/>
```

### Scale

| Class | Size | Leading | Width | Use |
|---|---|---|---|---|
| `.display-xl` | clamp(48px, 7vw, 88px) | 0.92 | 78% | One per page. Hero only. |
| `.display-l` | clamp(36px, 4vw, 52px) | 0.98 | 80% | Band headings |
| `.display-m` | 30px | 1.02 | 82% | Sub-sections, cross-link cards |
| `.display-s` | 20px | 1.05 | 84% | Card titles, stat figures |
| `.label` | 12px / 800 / 0.1em | — | 100% | Structural labels, table heads |
| `.data` | 11px mono / 0.1em | — | — | Discrete data values — times, ages, counts, statuses |
| `.body-l` | 18px | 1.55 | 100% | Hero subhead, pull copy |
| `.body-copy` | 16px | 1.6 | 100% | Default |
| `.body-s` | 14px | 1.55 | 100% | Card copy, meta |

`h1`–`h3` take the display family, weight 900 and condensed width automatically, **but not uppercase** — shouting every dashboard heading wrecks app density. The condensed capital voice is opt-in via `.display-*`.

### Rules of the display voice

- **Never letter-space a display line.** The width axis does that work. Negative tracking (−0.015em) only.
- **Never below 19px.** Condensed capitals stop being legible; drop to `.label` instead.
- **Never for reading.** Any run over ~12 words is body copy, mixed case, normal width. This is the guard on minibooks and coaching guides: their headings are display, their prose is not.
- **Balance, don't wrap.** `text-wrap: balance` on display, `pretty` on body.

### No eyebrow text

**Carried over from v1 and still binding.** Do not place a kicker above a headline. Where status, age, or audience must surface near a heading, use:

- a status chip docked to the card corner, or the **ink cap bar** (`.fixture__cap`) which carries category + status *above the card*, not above the headline inside it;
- the fact woven into the meta row or the first sentence;
- a bare orange accent bar with no text.

Legal: data labels inside key-value blocks, table column heads, captions under content, and the app-chrome `§` section labels. Illegal: a tracked uppercase line sitting directly on top of a headline.

---

## Colour

### Ink — the structural base

| Token | Value | Use |
|---|---|---|
| `--ink` | `oklch(0.20 0.021 245)` | Ink bands, primary text on sand, table headers |
| `--ink-lift` | `oklch(0.25 0.025 248)` | Panels raised on ink (cross-link pair, sub-nav) |
| `--ink-deep` | `oklch(0.16 0.020 245)` | Footer floor, photo scrim base |
| `--on-ink` | `oklch(0.972 0.008 80)` | Text on ink |
| `--on-ink-2` | `oklch(0.80 0.014 80)` | Secondary on ink |
| `--on-ink-muted` | `oklch(0.655 0.013 80)` | Muted / table head labels on ink |

`--ink` is the one token whose **value changed** from v1 (was `oklch(0.18 0.008 260)`). Everything else in the light ramp carried over.

### Sand — the relief surface

| Token | Value | Use |
|---|---|---|
| `--sand` | `oklch(0.972 0.008 80)` | Relief band background |
| `--sand-inset` | `oklch(0.955 0.012 78)` | Insets, hover |
| `--sand-deep` | `oklch(0.935 0.018 76)` | Pressed states |
| `--paper` | `oklch(0.99 0.003 80)` | Cards lifting off sand |
| `--on-sand` / `-2` / `-muted` / `-faint` | ink / `0.38 0.010 80` / `0.48 0.012 80` / `0.56 0.010 80` | Text on sand |

### Accents

| Token | Value | Role |
|---|---|---|
| `--primary` | `oklch(0.58 0.19 35)` | **Unchanged value, far more surface.** Surfaces and non-text only: bands, accent bars, rules, display-xl headlines. With ink, either direction, it measures **3.85:1** — large text only (≥24px, or ≥18.66px bold) |
| `--primary-bright` | `oklch(0.66 0.21 35)` | Small orange-and-ink text, either direction — **5.30:1**. Nav items, button fills, mono chips and numerals under 24px, orange text on an ink fill. Also the closer band, dark-mode primary |
| `--primary-text` | `oklch(0.52 0.19 33)` | **New in v2.** Small orange text on light surfaces — 5.92:1 on paper, 5.60:1 on sand, 5.32:1 on sand-inset |
| `--primary-hover` | `oklch(0.70 0.17 40)` | Repo addition: hover for orange fills — lighter, so ink text gains contrast |
| `--emerald` (+`-bright`, `-soft`) | `oklch(0.55 0.12 160)` … | Youth (v1 trio, see deviations) |
| `--sage` | `oklch(0.52 0.08 155)` | Success states |
| `--ochre` | `oklch(0.75 0.12 75)` | Tertiary highlight, waitlist |
| `--navy` / `--navy-deep` | `oklch(0.24 0.06 260)` / `oklch(0.18 0.07 262)` | Pickup, neutral depth |
| `--brand-red` / `--royal` / `--royal-bright` | `oklch(0.52 0.19 27)` … | Youth logo-derived extensions |

**Orange on ink is the signature pairing.** Text on orange is always `--ink`, never cream — `--primary-foreground` is ink in v2. This inverts v1. In markup, prefer `text-primary-foreground` over `text-ink` on orange fills: it resolves to ink on Aspire and to dark-on-lime under the SoccerOne brand override, so shared components stay correct on both tenants.

### The orange contrast rule

Measured WCAG ratios, not estimates. **Three orange values, one job each.**

| Pairing | Ratio | Verdict |
|---|---|---|
| ink on `--primary` | 3.85:1 | Large text only — ≥24px, or ≥18.66px bold |
| `--primary` on ink | 3.85:1 | Same pair reversed, same verdict |
| cream on `--primary` | 4.33:1 | Fails small text; cream-on-orange is off-system anyway |
| **ink on `--primary-bright`** | **5.30:1** | Safe at any size |
| **`--primary-bright` on ink** | **5.30:1** | Safe at any size |
| `--primary` text on `--paper` | 4.58:1 | Passes, but only just |
| `--primary` text on `--sand` | 4.33:1 | **Fails** |
| `--primary` text on `--sand-inset` | 4.12:1 | **Fails** — the worst light surface |
| **`--primary-text` on `--paper`** | **5.92:1** | Safe |
| **`--primary-text` on `--sand`** | **5.60:1** | Safe |
| **`--primary-text` on `--sand-inset`** | **5.32:1** | Safe |
| `--primary-text` on ink | 2.98:1 | Fails — it is a *light-surface* value only |

So, by surface:

- **On ink** — small orange-and-ink text in either direction uses `--primary-bright`.
- **On sand or paper** — small orange text uses `--primary-text`; `--primary` cannot serve as one light-surface rule at one value.
- **`--primary`** keeps the surfaces where type clears the 3:1 large-text floor — display-xl headlines, 34px numerals — plus every non-text use: accent bars, rules.

Weight does not rescue 12px: WCAG's large-text threshold is 18.66px bold, so a 12px/700 nav item is still held to 4.5:1.

**An ink wash cannot be an active state on an orange band.** A 10% ink wash over `--primary-bright` darkens it enough to pull ink text **below the 4.5:1 floor** (~4.4). Active and hover states on orange use a **cream** wash, which lightens the band instead and holds above 5.7:1 at 10% and 6.1:1 at 16%. Signal the active item with weight and a 3px inset underscore.

The solid-on-solid figures are exact — computed by compositing the token values and applying the WCAG formula. Figures for **alpha washes are approximate by nature** (they shift with compositing rounding), so they are quoted as thresholds, not decimals. Re-measure rather than reason if you change a value.

### What NOT to use

| Avoid | Use instead |
|---|---|
| Newsreader, any serif | Archivo display |
| Cream as the only background | Alternating `.band-ink` / `.band-sand` |
| Rounded cards (`rounded-lg`, `rounded-2xl`) | Square. `--radius: 0` |
| Card drop shadows | Hairline rules — `--rule-color`, `--rule-on-ink` |
| Cream/white text on orange | `text-primary-foreground` (ink) on orange |
| Tracked caps above a headline | Corner chip or ink cap bar |
| Letter-spaced display type | The width axis |

---

## Geometry

**v2 is square.** `--radius: 0`, and the whole Tailwind radius scale resolves through it. Radius survives in exactly two places: filter chips and status pills (`--radius-pill: 999px`, `rounded-full`).

Shadows are gone as a separating device. Structure comes from **rules and bands**: a 1px hairline on sand, an alpha hairline on ink, a 2px `.rule-heavy` under band headings, and the 5px orange `--accent-bar` on step cards. The one legitimate shadow is a page-level lift on a floating overlay.

---

## Band rhythm

A page is a stack of full-bleed bands that alternate ink and sand.

1. **Never two ink bands adjacent** unless one is orange or a photo scrim.
2. **Orange appears at most twice per page** — conventionally the in-page nav bar and the closer.
3. **Open on ink, close on orange.** Header and hero are ink; the final CTA band is orange; the footer returns to ink.
4. Every band is full-bleed; the content inside it is what has a max width.

Reference order, youth programme page: header (ink) → product sub-nav (ink-lift) → hero (photo + scrim) → in-page nav (orange) → pathway (sand) → philosophy (ink) → what it's like (sand) → coaching (ink) → pricing (sand) → schedule (paper) → open classes (sand) → FAQs (ink) → cross-links (ink-lift) → closer (orange) → footer (ink).

---

## Components

Full rendered set: the design canvas. The classes live in `globals.css` `@layer components`. Highlights:

- **Step card** (`.step-card`, `--invert`) — orange top bar, title, mono age band, one sentence. The last card in a run inverts to ink. **No numeral**: the bar anchors the card, and the sequence is carried by document order plus the age band each card names.
- **Fixture card** (`.fixture`, `.fixture__cap`, `.fixture__chip`) — ink cap bar carrying category + status chip, display title, key-value meta grid — keys as labels, times and ages in mono — then a price band above a full-width orange button. The cap bar is mixed content: the category is a name (sans) and the age band a value (mono). Used for classes, camps, leagues, sessions.
- **Tier card** — display title, mono tier number, one sentence, then a two-row rate block (standard / technical) divided by a dashed hairline. The recommended tier gets an ink hairline ring and an orange fill button.
- **Data table** (`.table__head`, `.table__row`, `.table__action`) — ink header row whose column heads are **labels, not mono** (Archivo 800 in `--on-ink-2`), hairline rows, paper zebra. Mono appears only in the cells holding measured values; name and category columns stay sans. The per-row action is a **button, not a data label**: Archivo 800. Right-most column is fixed-width, never `auto`.
- **In-page nav** (`.inpage-nav`) — band on `--primary-bright`, **Archivo 600** uppercase items in full-strength ink (5.30:1), each `white-space: nowrap`. Active takes weight 700, a 3px ink underscore and a **cream** wash; hover a lighter cream wash. Never an ink wash — see the contrast rule. One link pushed right.
- **Quadrant grid** (`.quadrants`, `--accent`) — four points on ink separated by hairlines. Replaces stat boxes. No numerals and no markers: **colour arrives through the structure** — the dividing rules go orange and the titles carry `--primary-bright`. If a band needs more life, colour something already there before adding an element.
- **Buttons** (`.btn` + `--primary` / `--ink` / `--outline` / `--on-ink` / `--ghost`) — square, uppercase, 0.1em tracked, Archivo 800. In utility form: `bg-primary-bright text-primary-foreground hover:bg-primary-hover`.
- **Chips** (`.chip`, `--value`, `__count`) — the one place radius survives. Font follows the content per the mono rule.
- **Closer band** — `--primary-bright`, display-xl in ink, one ink button with `--primary-bright` label. Any subline on it is full-strength ink, never alpha.

**On numerals generally.** v2 uses almost none. A number earns its place only where the count itself is the information — a price, a spot count, a tier label, a table value, a filter-chip count. It is never a decorative anchor, and "ordered" is not an exemption. **A card that loses its numeral needs nothing in its place** — don't substitute a decorative bar for a decorative numeral.

---

## Dark mode

v1 reserved dark for immersive reading. In v2 ink is already a default surface, so `.dark` is only a deepening: sand relief bands become ink-lift, orange brightens to `--primary-bright`, and the surface/text aliases invert together so utilities stay correct.

---

## Migration: v1 → v2

| v1 pattern | v2 pattern |
|---|---|
| `--cream` / `--cream-2` / `--cream-3` | `--sand` / `--sand-inset` / `--sand-deep`. **Old names aliased** — `bg-cream` still works. |
| `--ink-2` / `--ink-muted` / `--ink-faint` | `--on-sand-2` / `--on-sand-muted` / `--on-sand-faint`. Old names aliased. |
| `--primary-orange` (+ `-bright`, `-soft`) | `--primary` (+ `-bright`, `-soft`). Old names aliased. |
| `text-primary` used as small text on a light surface | `text-primary-text` — new text-only orange |
| `--ink` | Unchanged name, **new value** — was `oklch(0.18 0.008 260)`, now `oklch(0.20 0.021 245)`. The only value change in the ramp. |
| `.font-serif` / `.serif` (Newsreader) | Resolves to the display face. `--brand-font-serif` aliases `--brand-font-display`. |
| `.drop-cap` (serif, 5.5rem, weight 500) | Retained, now a condensed capital at 5rem / 900 |
| `.label-sm` (11px / 700 / 0.12em) | Retained as-is; `.label` (12px / 800 / 0.1em) is the v2 default |
| Newsreader italic pull quote | Display caps, or body-l at 24px in `--on-ink` with an orange `<em>` |
| `bg-cream text-ink` on every page | Alternating `.band-ink` / `.band-sand` |
| `rounded-lg` / `rounded-2xl` card | Square (automatic — radius tokens are 0); chips keep `rounded-full` |
| `bg-primary text-cream` / `text-white` button | `bg-primary-bright text-primary-foreground hover:bg-primary-hover` |
| `bg-ink text-cream hover:bg-primary` button | keep rest state; hover → `hover:bg-primary-bright hover:text-primary-foreground` |
| Status badge, tinted + rounded | Mono chip in the ink cap bar, or corner pill |
| Stat card (icon tile + 3xl bold number) | Quadrant grid — orange rules, accent titles, no icon tile, no numeral |
| Sidebar `bg-navy-deep` | `--sidebar: var(--ink)`; accent rows `--ink-lift` |
| Dark mode = immersive reading only | Dark mode = deepening |
| Drop shadow separation | `--rule-color` / `--rule-on-ink` hairlines |
| `.graded` navy→orange at 0.78/0.32 | Same recipe, ink base at 0.82/0.34 |
| Reveal animations (`.fade-up`, `.fade-slide-in`…) | Unchanged |

### Order of work

1. ✅ `globals.css` replaced, font `<link>` swapped (this landing). The aliases mean nothing breaks on contact; every surface changes voice at once.
2. ✅ `--radius` 0 with pills exempted.
3. ✅ `--primary-foreground` flipped to ink; every same-line `bg-primary* + text-cream/text-white` combo audited and moved to `bg-primary-bright text-primary-foreground` (incl. the shadcn Button default variant).
4. Convert marketing pages to band rhythm — highest visible return. Reference page: `Aspire Classes & Camps.dc.html` option 2a.
5. App chrome: sidebar to ink, tables to ink headers.
6. ~~Minibooks last~~ — **resolved as out of scope (2026-09-04)**: the minibooks and print guides are print-first KDP/Lulu **products** with their own documented design system (`src/data/minibooks/DESIGN-SYSTEM.md` — Crimson Pro / Source Serif 4, fonts vendored as static files specifically for print-to-PDF embedding quality, 6×9" trim). Restyling them changes sellable physical books; that is a product decision for the owner, not part of the web migration. Transactional **emails** did convert (Archivo stacks + weight-800 headings in `email-theme.tsx`, with grotesque fallbacks so stripped-webfont clients keep the voice); the **training decks** await vendored Archivo woff2 assets (tracked).
7. Optional cleanup: codemod `bg-cream`→`bg-sand`, `text-ink-muted`→`text-on-sand-muted`, `text-primary-orange`→`text-primary`, then delete the alias block. Do this after everything else is stable.

---

## Graded imagery

Photography on public marketing surfaces never appears raw. Every image passes through the brand grade so mismatched (stock) photography reads as one set:

- CSS: wrap in `.graded` (ink→orange duotone) or `.graded--emerald` (youth contexts).
- React: `<GradedImage src alt variant?="navy|emerald" />` from `@/components/ui/graded-image`.
- Recipe: `grayscale(1) contrast(1.08) brightness(.96)` on the img + a `linear-gradient(135deg, oklch(0.20 0.021 245 / .82), oklch(0.58 0.19 35 / .34))` multiply overlay (v2 rebased the base from navy to ink).
- Hero text legibility over photos: `.hero-scrim` — a diagonal ink wash.
- Removing the grade per-image (when real photography arrives) = drop the class.

### `.graded--fill`

Use the `graded--fill` modifier to deploy the grade as a hero background layer:

```html
<section class="relative bg-ink overflow-hidden">
  <div class="graded graded--emerald graded--fill z-0" aria-hidden="true">
    <img src="..." alt="" />
  </div>
  <div class="relative z-10">…content…</div>
</section>
```

The solid band colour on the section is the fallback ground so light text never lands on sand if the photo is missing.

### Stock sources (license traceability — Unsplash License, self-hosted)

| File | Source |
|---|---|
| adult-match-night.jpg | photo-1517466787929-bc90951d0974 (images.unsplash.com) |
| soccer-action.jpg | photo-1431324155629-1a6deb1dec8d |
| five-aside-turf.jpg | photo-1574629810360-7efbbe195018 |
| pickup-game.jpg | photo-1551958219-acbc608c6377 |
| youth-training.jpg | photo-1606925797300-0b35e9d1794e |
| team-huddle.jpg | photo-1529900748604-07564a03e7a6 |

---

## Sport color & youth surfaces (2026-08-17 — youth redesign)

### Sport palette

Sport tint answers "which game"; accent roles answer "who it's for". They are different axes and a surface may carry both. One source:

- `sportColor(sport)` from `src/lib/design/sport-colors.ts` — resolves `sports.color` (admin-set hex, wins) → `SPORT_FALLBACK_COLORS[slug]` → neutral grey. Used by `CardShell` media bands (via `ProgramCardV2`) and the league sport-picker hero tiles.
- Never inline a sport's color as an `oklch()`/hex literal in a page.
- Futsal deliberately sits adjacent to soccer in hue — sibling sports should read as related.

### Youth marketing surfaces — rules applied

- Every accent is **emerald** (the youth role). Adult's orange belongs only on adult surfaces.
- Heroes use the graded photo treatment (`.graded--emerald`), never raw photos and never flat voids.
- Copy rules (owner-directed, enforced by an E2E spec on format claims): no eyebrow/kicker text above headlines, no format claims (roster sizes, ball sizes, field dimensions, game lengths), no oppositional language about other clubs, the facility is not a selling point, pricing indicative on hub pages with exact figures on programme pages.
- **Full-width body text (owner rule, 2026-08-18):** no max-width measure caps on paragraph text on new/touched pages.
- The youth band primitives (`src/components/youth/bands/*` — jump bar, feature band, statement cards, pricing cards, coach section, deadline banner, division table) predate v2 and now render in the Archivo display voice via the font seams. Recompose them toward the v2 band grammar as pages are touched (order-of-work step 4), not in a big bang.
- Accent roles on youth: emerald = youth signature · brand-red = youth hot CTA/flood · royal = structural (jump bar, cards, discs).

---

## CSS layering (2026-08-29)

Tailwind v4 emits every utility inside the `utilities` cascade layer, and **unlayered author CSS beats all layered CSS regardless of specificity**. A bare class rule in a global stylesheet therefore silently overrides any Tailwind utility on the same property — the utility appears to do nothing, with no error (the `.graded` / `absolute inset-0` incident).

Rules:

- **Every style rule in `globals.css` lives inside an `@layer` block.** Element defaults (`a`, `h1`, focus rings) → `@layer base`. Class rules (`.display-*`, `.band-*`, `.btn`, `.fixture`, `.graded`, `.fade-up`…) → `@layer components`. Utilities then predictably win over both. Token-only statements (`:root`, `.dark`, `@theme`) are exempt.
- Enforced by `tests/unit/globals-css-layering.test.ts`, which fails on any unlayered top-level rule.
- The `prefers-reduced-motion` block keeps winning despite being layered: its declarations are `!important`, and the cascade reverses layer order for important rules, so a layered important beats even `!`-prefixed utilities.

## Styling React islands (Astro + React)

Astro's scoped `<style>` blocks are compiled to `data-astro-*` attribute selectors that are only stamped onto elements in the `.astro` template — **they never reach the DOM a React island renders**. Relying on a parent page's scoped styles to style island internals fails silently (this caused a prod incident).

Convention for any `.tsx` component rendered with a `client:*` directive:

- Style island internals exclusively with **Tailwind utilities and the global design tokens** (`bg-sand`, `text-ink`, `var(--emerald)`, …). Both travel with the component wherever it mounts.
- If an island genuinely needs bespoke CSS a utility can't express, either embed a `<style>` tag in the island's own JSX with island-prefixed class names (see `partners-section.tsx`, `SoccerOneSeasonTabs.tsx`), or add a layered rule to `globals.css`. Never put it in the parent `.astro` page's scoped `<style>`. Embedded island styles are unlayered, so keep their selectors on bespoke class names that no Tailwind utility also targets.
- Astro scoped `<style>` blocks are fine for markup that lives in the same `.astro` file; just don't write selectors there that target an island's internal markup.

---

## Open questions

- **Real rates.** The pricing pattern is documented with placeholder amounts on the canvas. Replace before launch.
- **Coach bios.** The coaching band needs sourced copy and real photography; it currently ships as a placeholder.
- **Photography.** The grade is tuned for the stock set in the licence table above. Real photography should drop the grade per-image, not globally.
