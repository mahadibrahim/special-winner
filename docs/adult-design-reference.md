# The Adult Section — Design Reference

Extracted 2026-08-17 from the live Adult section (`/adult`, `/adult/leagues`,
`/adult/pickup`, `/adult/tournaments`) — the code as shipped, not aspiration.
This is the reference point for redesign work elsewhere on the site: when a
youth (or any other) page needs a pattern, it should be one of these, recolored
for its audience — not a new invention.

Companion to `docs/design-system.md` (tokens, philosophy). Where the two
disagree, this file records what the Adult section actually does.

---

## 1. The page shapes

Two shapes cover the whole section.

### Hub (`/adult` — src/pages/adult.astro)

One screen, no prose sections:

1. **Video hero** (`hub-hero.astro`) — full-bleed muted video, navy oklch
   gradient overlay, serif display headline + subhead. Nothing else.
2. **Optional announcement** (`NextUpCard`) — one paper card, only when live.
3. **Three doors** (`CategoryCard`) — animated aurora gradient cards, one per
   offering, each a distinct color family (leagues red-orange, pickup teal,
   tournaments purple). Status chip + title + one-line blurb + arrow CTA.
4. Footer.

The hub *routes*; it does not *explain*. All inventory and persuasion live on
the category pages.

### Category page (`/adult/leagues` is the canonical deep one)

Section order, top to bottom (src/pages/adult/leagues.astro):

1. **Working hero** — video + overlay + serif display h1 + subhead, then
   **sport tiles inside the hero** (see §4). The hero is a navigation surface,
   not a poster. Crosslink lines (`text-sm text-cream/70`, underlined links)
   close it.
2. **Facts band** (`SeasonFactsBand`) — `bg-paper border-b border-border`,
   a single row of label/value pairs: uppercase `text-[11px]
   tracking-[0.15em]` labels over `font-display text-xl` values. Price,
   deadline, kickoff, format. Links to FAQ/refund in `text-primary`.
3. **How-it-works strip** (`how-it-works-strip.astro`) — 3 columns, each
   `border-t-2 border-ink pt-4`, mono `01 / 02 / 03` markers (a real sequence
   — the one sanctioned numbered pattern), serif `text-xl` step title, sm
   ink-muted body.
4. **Finder** (`CategoryFinder`, "Open now") — chip filters with mono
   uppercase group labels (SPORT / VENUE / DAY), then program cards (§5).
5. **Calendar band** (`SeasonCalendarBand`, "The league year.") — paper cards
   in a grid, term name + serif, mono month/games meta, status chips.
6. **FAQ** (`LandingFaq`) — numbered accordion cards on paper; the open item
   gets an orange number disc and a left accent rule.
7. **CTA banner** (`cta-banner.tsx`) — the one full-bleed orange flood on the
   page. Chip ("Registration is open"), huge serif headline, one supporting
   sentence, two ghost buttons, curved bottom edge into the navy footer.
8. **Navy footer** — script logo, italic serif tagline (the one italic
   display moment, with the closing word in `text-primary`), mono uppercase
   column headings, newsletter form with an orange Subscribe.

Lighter category pages (`pickup`, `tournaments`) are the same shape minus the
bands they don't need: `CategoryHero` → optional explainer (`PickupLevels`) →
finder → optional capture card → `CTABanner`. Sections are *dropped*, never
replaced with new inventions.

## 2. Type as practiced

- **Display**: Newsreader via `font-display`, weight 400–600. Page h1s are
  `font-semibold tracking-tight`, sized `clamp(2.5rem, 6vw, 4rem)` with
  `line-height: .95` (hub hero goes to 4.5rem / 6.5vw).
- **Headline voice**: short declaratives with terminal periods, sentence case
  — "Adult leagues." · "Pickup." · "Three ways to play. One standard." ·
  "The league year." Never title case, never a question except the CTA banner.
- **Headings are roman.** No italics in h1–h3. Italic serif appears exactly
  twice in the section: the footer tagline and BenefitTrio headlines (a
  documented pattern). Emphasis elsewhere is weight or accent color.
- **Section h2s**: `font-display text-2xl lg:text-3xl text-ink` on cream
  sections; no eyebrows above them (per the standing rule).
- **Body**: IBM Plex Sans, `text-sm`/`text-base`, `text-ink-2`/`text-ink-muted`,
  ~~subheads capped at `max-w-[520px]`–`[560px]`~~ **Retired 2026-08-18 by
  owner decision — body text spans the full content column. Existing adult
  pages still carry caps; drop them when touching those pages.**
- **Mono (IBM Plex Mono) is the signature micro-voice**: statuses
  (`text-[9px] tracking-widest uppercase`), facts lines (`text-xs`), step
  numbers, chip-group labels, footer column heads, card meta. Mono = data;
  serif = statement; sans = prose.

## 3. Color as practiced

- Page ground is **cream**; cards are **paper** with `border-border`.
- Dark surfaces are **navy** (`oklch(0.18 0.07 262)` family): hero overlays
  are layered navy-alpha gradients over video, footer is navy-deep. Text on
  dark is `text-cream` with `/90 /70` steps.
- **Orange (`--primary`) is the adult accent** and appears as a *hot spot*:
  live tiles, Notify/Subscribe/Register actions, FAQ open state, the CTA
  flood. One flood per page (the CTA banner); everywhere else it's small.
- **In-hero sport tiles** carry the sport color axis (`sport-colors.ts` —
  soccer `oklch(0.66 0.21 35)`, flag football `oklch(0.75 0.14 85)`).
  Coming-soon tiles are translucent navy (`oklch(0.2 0.06 262/0.7)`) with
  `border-cream/25` — muted state = muted surface, not a gray badge.
- **Door auroras** (hub only): each door a distinct animated gradient family
  so the three never repeat; drift animation, static under reduced motion.
- Dark action buttons (`REGISTER →`, `SHOW 3 MORE`) are near-black/navy pills
  — dark, not orange, so orange keeps its signal value.

## 4. The working hero (the section's signature)

The bold-catalog hero formula (`category-hero.astro`, repeated inline in
`adult/leagues.astro`):

```
video (muted, loop, poster) → absolute inset-0 z-0
navy gradient overlay        → z-1  (180deg .45→.82 + 100deg .7→.25 alphas)
content max-w-[1080px]       → z-2:
  h1 serif display (short, period)
  subhead text-cream/90, max-w-[520px]
  grid of sport/format tiles: rounded-2xl p-4,
    live    = solid sport-color bg, text-ink, mono status ("● Now registering"),
              serif tile title text-2xl, mono meta line, → bottom-right
    pending = translucent navy, cream/80 text, "Coming soon" + "Interested? Notify me"
  crosslink lines (text-sm text-cream/70, underlined links)
```

Properties worth preserving anywhere this is reused: the hero answers "what
can I do right now" above the fold; live vs coming-soon is honest; every tile
is a real destination or a real capture.

## 5. Cards

- **Program card** (finder): sport-colored media band with mono sport label +
  status pill top-right → paper body: serif title, icon meta rows (venue ·
  time · start), tinted meta chips (`SOLO OR TEAM`, `EARLY-BIRD`), hairline
  rule, then price block (`$100` serif-large + tiny label) opposite a dark
  pill CTA. Two-CTA variant: outline `SIGN UP SOLO` + solid dark
  `RESERVE A TEAM · $200`.
- **Generic paper card**: `bg-paper border border-border rounded-xl p-5`,
  mono kicker → serif title → sm body → bordered dl facts row.
- **Chips**: rounded-full, tinted `/10` bg + stronger text of the same hue,
  tiny uppercase.

## 6. Spacing & rhythm

- Content column: `max-w-[1080px] mx-auto px-6 sm:px-9` everywhere.
- Sections: `py-12 lg:py-16`, separated by `border-b border-border` or a
  surface change (cream → paper band → cream → orange flood → navy). The
  page alternates surface, it does not stack same-ground sections.
- Heroes are compact: `pt-16 pb-8` — the fold belongs to the tiles.
- Density is medium-generous: one idea per band; the only dense surface is
  the finder grid, and its cards stay airy inside.

## 7. Copy rules observed

- No eyebrows/kickers above headlines. Mono statuses live *inside* tiles and
  cards as metadata, docked to the element they describe.
- Facts are real and specific ($ figures, dates, "7-game season") — sourced
  from the catalog or authored constants, never invented.
- Coming-soon inventory is shown honestly and converted into capture
  ("Interested? Notify me"), not hidden and not faked.
- Crosslinks between audiences are one quiet line, not a section.

## 8. Known deviations / open questions

- `docs/design-system.md` says "emerald = youth" but the token palette has no
  emerald — youth accenting is an open design decision, deliberately NOT
  settled by this document.
- The hub door auroras and in-hero tile colors are inline oklch values in
  markup, predating `sport-colors.ts`; new work should prefer the token/
  helper sources per the sport-color rule in design-system.md.
