# Aspire Sports — Editorial Design System

> *The Athletic* meets *Tracksmith*, not a SaaS dashboard.

Last updated: 2026-04-16

---

## Philosophy

The Aspire Sports visual identity is **warm, editorial, and confident**. Every surface feels like a well-typeset magazine — warm off-white paper, purposeful serif headlines, restrained use of a single hot-spot accent color. We avoid cold grays, generic SaaS patterns, and system fonts.

---

## Typography

| Role | Family | Weight | Usage |
|------|--------|--------|-------|
| **Display** | Newsreader | 400–600, italic | Headlines (h1–h3), hero text, pull quotes |
| **Body** | IBM Plex Sans | 400–600 | Body copy, UI labels, buttons, form inputs |
| **Mono** | IBM Plex Mono | 400–500 | Code snippets, data values, technical labels |

### Loading fonts

Every page `<head>` must include:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500;1,6..72,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
  rel="stylesheet"
/>
```

### Tailwind classes

- `font-display` or `font-serif` — Newsreader (headlines, editorial text)
- `font-sans` — IBM Plex Sans (default body, UI)
- `font-mono` — IBM Plex Mono (code, data)

### Editorial patterns

- **Section labels**: `text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted` (e.g., "§ COACH DASHBOARD")
- **Drop cap**: Add `.drop-cap` class for editorial first-paragraph treatment
- **Rule lines**: `.rule` (thin border divider), `.rule-heavy` (2px ink)
- **No eyebrow text**: Do not place kicker/eyebrow labels above headlines unless absolutely necessary. Headlines and supporting copy carry the message on their own. When status, date, or audience info must surface near a heading, use one of these treatments instead: a status chip docked to the card/section corner, the info woven into the meta row or first sentence of copy, or a bare accent bar with no text. Data labels inside key-value blocks and captions under content are fine — this rule targets text above headlines. (App-chrome "§" section labels above are navigation, not eyebrows, and remain allowed.)

**Do not use**: Inter, Roboto, Arial, Geist, or system-ui as primary fonts.

---

## Color Palette

### Core colors

| Token | Tailwind class | Description |
|-------|---------------|-------------|
| `--cream` | `bg-cream`, `text-cream` | Warm off-white foundation. The background of everything. |
| `--cream-2` | `bg-cream-2` | Slightly darker cream for subtle card insets, hover states |
| `--cream-3` | `bg-cream-3` | Deeper cream for active states, pressed buttons |
| `--ink` | `text-ink` | Primary text color. Dark charcoal, never pure black. |
| `--ink-2` | `text-ink-2` | Secondary text, slightly lighter |
| `--ink-muted` | `text-ink-muted` | Muted labels, placeholders, helper text |
| `--ink-faint` | `text-ink-faint` | Disabled text, decorative elements |
| `--navy` | `bg-navy`, `text-navy` | Heritage navy. Sidebar backgrounds, quote marks, depth. |
| `--navy-deep` | `bg-navy-deep` | Deeper navy for sidebar chrome |
| `--primary` | `bg-primary`, `text-primary` | The Aspire red-orange. Single accent hot-spot. |
| `--paper` | `bg-paper` | Card surfaces that lift off the cream background |
| `--ochre` | `text-ochre` | Warm secondary accent for subtle highlights |
| `--sage` | `text-sage` | Success states, positive indicators |

### Semantic tokens (shadcn bridge)

| Token | Maps to | Usage |
|-------|---------|-------|
| `--background` | `--cream` | Page background |
| `--foreground` | `--ink` | Default text |
| `--card` | `--paper` | Card backgrounds |
| `--border` | warm gray | Borders, dividers, input outlines |
| `--primary` | `--primary-orange` | CTA buttons, links, accents |
| `--secondary` | `--navy` | Secondary actions |
| `--muted` | `--cream-2` | Muted backgrounds |
| `--destructive` | red-orange | Delete, error states |
| `--success` | `--sage` | Positive states |
| `--warning` | `--ochre` | Warning states |

### What NOT to use

| Avoid | Use instead |
|-------|------------|
| `text-white` (on light bg) | `text-ink` |
| `text-gray-500` | `text-ink-muted` |
| `bg-gray-100` | `bg-cream` or `bg-cream-2` |
| `bg-white` | `bg-paper` |
| `bg-[#0a0a0f]` | `bg-cream` (light) or `bg-navy-deep` (sidebar) |
| `border-white/10` | `border-border` |
| `text-blue-400` | `text-primary` |
| Cold Tailwind grays (`gray-100`–`gray-900`) | Editorial tokens (`cream`, `ink`, `navy`) |

---

## Dark Mode

Dark mode (`class="dark"` on `<html>`) is reserved for **immersive reading contexts**: minibooks, coaching guides, resource study pages. It is NOT the default.

All semantic tokens have dark-mode overrides defined in `globals.css`. In dark mode:
- Background → deep navy
- Text → warm cream-white
- Primary → brighter orange
- Cards → slightly lighter navy

---

## Layout Patterns

### Public pages (homepage, programs, guides)

```html
<body class="bg-cream text-ink antialiased">
  <Navigation client:load />
  <main>...</main>
  <Footer client:idle />
</body>
```

### Coach pages

```html
<body class="min-h-screen flex flex-col bg-cream text-ink antialiased">
  <Navigation client:load />
  <main class="flex-1 pt-28 pb-16 px-4">
    <div class="max-w-7xl mx-auto">
      <!-- Section label bar -->
      <div class="flex items-center justify-between mb-2">
        <p class="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted">§ Page Title</p>
        <p class="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted">Date</p>
      </div>
      <div class="h-px bg-border mb-10"></div>
      <!-- Breadcrumb -->
      <nav class="text-sm text-ink-muted mb-6">
        <a href="/coach" class="hover:text-ink">Coach Dashboard</a> / <span class="text-ink">Page</span>
      </nav>
      <!-- Content -->
    </div>
  </main>
  <Footer client:idle />
</body>
```

### Admin pages

Admin uses a sidebar layout via `<AdminLayout>`. The sidebar is navy-deep with cream text. The content area inherits the cream background from the body.

```html
<body class="bg-cream text-ink antialiased">
  <AdminLayout client:load currentPath="/admin/page" user={user}>
    <!-- Page content goes here -->
  </AdminLayout>
</body>
```

---

## Component Patterns

### Cards

```html
<!-- Standard card -->
<div class="bg-paper border border-border rounded-lg p-5">

<!-- Inset card (slightly darker) -->
<div class="bg-cream-2 rounded-lg p-3">

<!-- Accent card (primary highlight) -->
<div class="bg-primary/5 border border-primary/20 rounded-lg p-5">
```

### Buttons

```html
<!-- Primary CTA -->
<button class="bg-primary text-cream hover:bg-primary/90 rounded px-4 py-2 text-sm font-medium">

<!-- Secondary / outline -->
<button class="border border-border text-ink-muted hover:text-ink hover:bg-cream-2 rounded px-4 py-2 text-sm font-medium">

<!-- Ghost -->
<button class="text-ink-muted hover:text-ink hover:bg-cream-2 rounded px-4 py-2 text-sm font-medium">
```

### Badges

```html
<!-- Status badges use Tailwind's color utilities with /10 or /20 opacity -->
<span class="bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 text-xs px-2 py-0.5 rounded">Active</span>
<span class="bg-amber-500/10 text-amber-700 border border-amber-500/20 text-xs px-2 py-0.5 rounded">Pending</span>
```

### Stat cards

```html
<div class="bg-paper border border-border rounded-2xl p-5">
  <div class="flex items-center gap-3 mb-3">
    <div class="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
      <Icon class="w-5 h-5 text-white" />
    </div>
    <span class="text-sm text-ink-muted">Label</span>
  </div>
  <p class="text-3xl font-bold text-ink">42</p>
</div>
```

### Quick action links

```html
<a class="flex items-center gap-3 p-3 rounded-lg bg-cream-2 hover:bg-cream-3 transition-colors group">
  <Icon class="w-5 h-5 text-ink-muted group-hover:text-primary" />
  <span class="text-sm text-ink-2 group-hover:text-ink">Link text</span>
  <ChevronRight class="w-4 h-4 text-ink-faint ml-auto" />
</a>
```

---

## Icon colors on colored backgrounds

When an icon sits on a gradient or solid-color background, use `text-white`:

```html
<div class="bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl">
  <span class="text-white">ET</span>  <!-- white on colored bg: OK -->
</div>
```

When an icon sits on cream/paper, use `text-ink`, `text-ink-muted`, or `text-primary`.

---

## Migration from dark theme

When converting a component from the old dark SaaS theme:

| Old pattern | New pattern |
|-------------|-------------|
| `class="dark"` on `<html>` | Remove it |
| `bg-[#0a0a0f]` | `bg-cream` |
| `text-white` | `text-ink` (unless on colored bg) |
| `text-gray-400`, `text-gray-500` | `text-ink-muted` |
| `text-gray-300` | `text-ink-2` |
| `text-gray-600` | `text-ink-faint` |
| `bg-white/[0.02]`, `bg-white/[0.03]` | `bg-paper`, `bg-cream-2` |
| `border-white/[0.06]`, `border-white/10` | `border-border` |
| `hover:bg-white/5` | `hover:bg-cream-2` |
| `text-blue-400`, `text-blue-500` | `text-primary` |
| `bg-blue-500/20` | `bg-primary/10` |
| `bg-gray-900`, `bg-gray-800` | `bg-navy-deep`, `bg-navy` |

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
| adult-match-night.jpg | photo-1517466787929-bc90951d0974 (images.unsplash.com) |
| soccer-action.jpg | photo-1431324155629-1a6deb1dec8d |
| five-aside-turf.jpg | photo-1574629810360-7efbbe195018 |
| pickup-game.jpg | photo-1551958219-acbc608c6377 |
| youth-training.jpg | photo-1606925797300-0b35e9d1794e |
| team-huddle.jpg | photo-1529900748604-07564a03e7a6 |

## Sport color & youth surfaces (2026-08-17 — youth redesign)

### Sport palette

Sport tint answers "which game"; the accent roles above answer "who it's for".
They are different axes and a surface may carry both. One source:

- `sportColor(sport)` from `src/lib/design/sport-colors.ts` — resolves
  `sports.color` (admin-set hex, wins) → `SPORT_FALLBACK_COLORS[slug]` →
  neutral grey. Used by `CardShell` media bands (via `ProgramCardV2`) and the
  league sport-picker hero tiles.
- Never inline a sport's color as an `oklch()`/hex literal in a page. That is
  how the same sport ended up different colors on a card and the tile above it.
- Futsal deliberately sits adjacent to soccer in hue — sibling sports should
  read as related.

### Youth marketing surfaces — rules applied

- Every accent is **emerald** (the youth role). Adult's orange belongs only on
  adult surfaces.
- Heroes use the graded photo treatment (`.graded--emerald`), never raw photos
  and never flat navy voids.
- `CategoryCard` has three youth aurora palettes (`youth-a` emerald, `youth-b`
  amber, `youth-c` teal) so the hub's three doors never repeat a color.
- Copy rules (owner-directed, enforced by an E2E spec on format claims): no
  eyebrow/kicker text above headlines, no format claims (roster sizes, ball
  sizes, field dimensions, game lengths), no oppositional language about other
  clubs, the facility is not a selling point, pricing indicative on hub pages
  with exact figures on programme pages.

### `.graded--fill`

`.graded` is unlayered CSS, and Tailwind v4 emits utilities inside a cascade
layer — so unlayered rules always beat utilities. `position: relative` on
`.graded` therefore silently defeats `class="absolute inset-0"`, the container
keeps auto height, and `.graded > img { height: 100% }` resolves to **zero**:
the image renders at 0px with no error. Use the `graded--fill` modifier to
deploy the grade as a hero background layer:

```html
<section class="relative bg-navy-deep overflow-hidden">
  <div class="graded graded--emerald graded--fill z-0" aria-hidden="true">
    <img src="..." alt="" />
  </div>
  <div class="relative z-10">…content…</div>
</section>
```

The `bg-navy-deep` on the section is the fallback ground so cream text never
lands on cream if the photo is missing. General lesson: if a Tailwind utility
appears to do nothing, check for a bare class rule in `globals.css`.
