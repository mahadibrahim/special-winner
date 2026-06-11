# SoccerOne Design System

Locked in 2026-06-11 (founder decision — current logo, colors, and type stay). The implementation source of truth is **`src/styles/soccerone-tokens.css`**; this doc is the human reference. The Aspire (cream/editorial) system lives in `docs/design-system.md` — the two brands share the app but never share tokens.

## Identity

Dark, loud, athletic. Warehouse-soccer aesthetic: near-black surfaces, a single lime accent doing all the work, condensed display type in all-caps, mono type for data (times, prices, stats). High contrast, hard edges, minimal decoration.

- Wordmark: `SOCCER` (white) + `ONE` (lime), Anton, tracked tight. Rendered in `SoccerOneHeader.astro` / `SoccerOneFooter.astro` — there is no image logo asset yet.
- Favicon: `public/soccerone-favicon.svg` (ink tile, lime S1).

## Color

| Token | Value | Use |
|---|---|---|
| `--so-lime` | `#a3e635` | THE accent. CTAs, active states, stat numerals, live dots |
| `--so-lime-bright` | `#bef264` | Hover/active on lime elements |
| `--so-ink` | `#0a0a0d` | Page background |
| `--so-surface` | `#0e0e10` | Cards, panels, raised blocks |
| `--so-white` | `#ffffff` | Headings, body on dark |
| `--so-navy-deep/navy/navy-raised` | `#080c18/#0a1929/#0d2035` | **Downtown facility accent only** — the deliberate blue cast on downtown-branded cards/badges/map art. Never mix with ink/surface |

**Lime alphas** — canonical scale for new work: `a04 a08 a10 a12 a15 a20 a25 a30 a40 a50 a60 a70`. Typical uses: `a04–a12` background washes, `a15–a30` borders/dividers, `a50–a70` SVG strokes and secondary text on dark. The `a02/a03/a05/a06/a07/a14/a35/a80` tokens are **legacy** (pre-token styles were preserved exactly) — don't reach for them in new code.

Text on lime is always ink/near-black (contrast ≈ 11:1). Lime on ink ≈ 10.4:1. Both AAA.

## Type

| Token | Family | Use |
|---|---|---|
| `--so-font-display` | Anton | Headlines, stat numerals, wordmark. Always with uppercase + generous tracking |
| `--so-font-body` | DM Sans | Everything readable |
| `--so-font-mono` | JetBrains Mono | Times, prices, dates, schedule data — anything tabular/numeric |

Loaded once per page via the head `<link>` (Anton + DM Sans + JetBrains Mono). **Do not** reference other families — `Space Grotesk`/`Inter` appeared in early components but were never loaded and silently fell back; they were mapped to `--so-font-body` in the token migration.

Letter-spacing scale: `--so-track-tight` (0.01em, display), `--so-track-base` (0.04em), `--so-track-wide` (0.08em, buttons), `--so-track-caps` (0.12em, eyebrow labels).

## Shape & effects

Radii: `--so-radius-xs/sm/md/lg/xl/pill` = 2/4/6/8/12/20px. Buttons and inputs `sm`, cards `md`–`lg`, hero containers `xl`, chips `pill`. Lime glow for live indicators: `--so-glow-lime`.

## Component patterns

- **Eyebrow label**: mono or body, `--so-track-caps`, lime, 11–12px, uppercase. Precedes section headings.
- **Stat block**: Anton numeral (lime or white) over a small muted label. Stats must be *facts that can't drift* (field counts, hours) — never invented counts (the "16 Active Leagues"/"400+ members" era is over; see the 2026-06-11 working-order PR).
- **CTA button**: lime fill, ink text, Anton or bold body, `--so-track-wide`, hover → `--so-lime-bright`. Secondary: transparent, `a20`–`a30` lime border.
- **Card**: `--so-surface` (or navy scale for downtown), 1px `a15`–`a20` border, `md`/`lg` radius.
- **Schedule/“typical week” boards**: mono time column, type badges per cell. Labels stay undated ("A typical week"), never "Week of <date>".
- **Empty states**: headline + evergreen sub-line + email capture (`/api/public/newsletter`) — pattern shipped on `/leagues`.

## Rules

1. Brand colors and fonts in `<style>` blocks come from `var(--so-*)` — raw hex/rgba/font strings fail review. (Inline SVG *attributes* are the one exception: `stroke="var(…)"` doesn't work in presentation attributes, so SVG art keeps literal values.)
2. New shade/step → add a token first, with a use note.
3. Copy is evergreen: no dates, no counts that change, no prices outside data-driven components.
4. Contact is `SOCCERONE_CONTACT_EMAIL` from `src/lib/soccerone/contact.ts` — never a literal address.
5. A11y: the focus-visible lime ring ships globally in the tokens sheet; don't suppress outlines.

## Token → brand_profiles mapping (future)

Per the 2026-06-10 multi-brand decision, post-launch theming moves to `brand_profiles` rows. Each `--so-*` token maps 1:1 to a profile key (`accent`, `accent_hover`, `bg`, `surface`, `font_display`, `font_body`, `font_mono`, `radius_*`). When that work starts, this file's `:root` block becomes the SoccerOne seed row and pages keep their `var()` references unchanged.

## Open items (tracked in the hardening spec)

- Real facility photos/video to replace Pexels/Unsplash stock (founder assets).
- Raster `og:image` (1200×630) per brand — pages currently inherit title/description OG meta only.
- Social icons return to the footer once accounts exist.
