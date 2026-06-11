# SoccerOne Site Hardening — Design

**Date:** 2026-06-11 · **Status:** approved by founder (this session) · **Site is LIVE at gosoccerone.com**

Three sequential PRs. PR 1 fixes what's customer-visibly broken today; PR 2 locks the design system in without changing a pixel; PR 3 proposes visual polish behind an explicit founder review gate.

## Context

The `/soccerone/*` tree (served at gosoccerone.com root via middleware host rewrite) was built fast and hardcoded. The 2026-06-11 audit found dead CTAs, two fake 555 phone numbers, a contact email on a domain we don't own (`play@soccerone.com`), invented stats, time-bound copy, dead social icons, and a fully hardcoded design system (56× lime hex, ~370 font-family repeats, 7 ad-hoc dark shades).

Constraint from `project_multi-brand-architecture-decision`: one shared app; theme-driven `brand_profiles` branding comes AFTER launch. PR 2's token file is the seed for that work, not a replacement of it.

## Founder decisions (locked)

1. **Contact = email only**, address **`play@gosoccerone.com`** everywhere. The mailbox is being provisioned 2026-06-12 (gosoccerone.com currently has NO MX records — Migadu + Netlify DNS setup pending). Until then the address renders but bounces; founder accepted the one-day window.
2. **Social icons: hidden** until accounts exist (one-line re-add).
3. **Design scope: tokenize + consistency pass + 2–3 polish proposals** (proposals review-gated, keep current logo/colors/fonts).
4. **Stock media stays** (Pexels hero video, Unsplash facility photos) until real facility shots exist — tracked below, not forgotten.

## PR 1 — Working order

**New module** `src/lib/soccerone/contact.ts`:
```ts
/** Single source of truth for SoccerOne contact rendering. Mailbox
 *  provisioned 2026-06-12 (Migadu); update here only. */
export const SOCCERONE_CONTACT_EMAIL = "play@gosoccerone.com";
```

**`src/pages/soccerone/leagues.astro`**
- Featured CTA block ("NOW REGISTERING — Adult Open Soccer 2026 · Starts June 2 · $180/player · $1,200/team") becomes data-driven from the already-fetched `seasons`: renders first open season's real name, real `startDate`, real price/team price. **Hidden entirely when `seasons.length === 0`** — no dead `#` pay button above the "no open leagues" empty state.
- Bottom "Register a Team / Register as Individual" CTAs: same render-only-with-data rule.
- Header stats "16 / 8 / 2" → factual evergreen: "4 fields · 2 locations · 7AM–11PM daily".

**`src/pages/soccerone/index.astro`**
- "16 ACTIVE LEAGUES" stat → factual stat (fields/locations/hours — no counts that drift).
- "NEXT SEASON: JUNE 2026" → evergreen ("New seasons every cycle").
- Dead `/soccerone#programs` link → point at `/soccerone/leagues`.

**`src/pages/soccerone/memberships.astro`** — invented "400+ Active members" stat removed.

**`src/pages/soccerone/{downtown,worthington}/index.astro`**
- Fake `(614) 555-…` numbers → `play@gosoccerone.com` mailto.
- "Week of April 28, 2026" schedule boards → "A typical week" label (evergreen; no date math).

**`src/components/soccerone/SoccerOneFooter.astro`** — dead social icons removed (commented pattern for re-add); contact email added to Help column.
**`src/components/soccerone/SoccerOneHeader.astro`** — Sign In link added to desktop nav (currently footer/mobile-only).

Testing: `tests/e2e` smoke not required (pages are SSR templates); verification = build + manual prod smoke after deploy. Any page that reads search params keeps SSR (leagues already does).

## PR 2 — Design system lock-in (zero visual change)

- **`src/styles/soccerone-tokens.css`** — custom properties capturing the current look:
  - color: `--so-lime: #a3e635`, `--so-lime-bright: #bef264`, `--so-ink: #0a0a0d`, surfaces normalized to a 3-step dark scale (`--so-surface-1/2/3` collapsing the 7 ad-hoc shades to their nearest), standard lime alphas (`--so-lime-a10/15/20/30/50`).
  - type: `--so-font-display` (Anton), `--so-font-body` (DM Sans), `--so-font-mono` (JetBrains Mono); letter-spacing scale (tight/base/wide/uppercase = 0.01/0.04/0.08/0.12em).
  - shape: radius scale 4/6/8px; standard lime glow shadow.
- All 7 soccerone pages + header/footer refactored to `var()` references; Google Fonts loaded once (header), not per-page.
- **`docs/design-system-soccerone.md`** — reference doc: palette, type scale, component patterns (badge, card, CTA, stat block), do/don't, and the mapping table token → future `brand_profiles` key.
- **Brand surface**: SoccerOne favicon (lime/dark mark) + per-page `og:image`; a11y pass — visible focus states on lime CTAs, contrast spot-check (lime-on-ink ≈ 10.4:1, black-on-lime ≈ 11:1 — both pass AA/AAA).

Acceptance: visual diff of before/after screenshots shows no perceptible change; grep finds zero raw `#a3e635`/`font-family:` literals in soccerone page style blocks.

## PR 3 — Polish proposals (review-gated)

Mock 2–3 refinements as live screenshots; founder picks; each ships as its own commit:
1. Hero treatment that doesn't depend on stock video (dark/lime graphic field-lines motif).
2. Tightened card system (one radius, one border treatment, consistent stat typography).
3. Facility-page schedule board restyle as evergreen "typical week" grid.

Nothing in PR 3 ships without explicit founder approval per item.

## Deferred / tracked

- Replace stock media with real facility photos/video — **blocked on founder assets**.
- `play@gosoccerone.com` mailbox provisioning — **founder, 2026-06-12** (Migadu mailbox + MX records in Netlify DNS zone).
- Real social URLs once Zernio-managed accounts exist.
- Theme-driven `brand_profiles` migration (post-launch decision, separate project; PR 2's tokens are its input).
- Live data for pickup schedule / rental rates on facility pages (needs product decision on source of truth).
