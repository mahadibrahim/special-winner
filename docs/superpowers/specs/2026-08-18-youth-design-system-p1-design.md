# Youth design system Phase 1 — classes page v2 + band primitives

Date: 2026-08-18 · Branch: `youth-design-system-p1` · Status: approved by owner
(via six mockup iterations; the approved visual is committed alongside as
`2026-08-18-youth-classes-v2-mockup.html` — it is the design source of truth
for values, copy, and band order).

## Scope rule (owner-directed)

**Youth only.** Nothing outside `/youth/**` (and the shared files that youth
consumes) changes. Adult surfaces do NOT adopt this system in this phase —
primitives are built cleanly enough that they *could* later, but no adult
page is touched, and shared components must default to their existing
rendering (new variants are opt-in props).

## What was approved (the system)

1. **Expanded palette** — two new brand tokens joining the system, drawn from
   the logo's red-white-blue: `--brand-red: oklch(0.52 0.19 27)` and
   `--royal: oklch(0.50 0.16 260)` (+ `--royal-bright: oklch(0.62 0.15 258)`).
   Emerald remains the youth signature; red is the hot CTA/flood color on
   youth surfaces; royal is the structural blue (jump bar, cards, FAQ discs).
2. **Band grammar** — pages compose full-bleed color-blocked bands; section
   headers are bold serif with a `--brand-red` tinted closing phrase; the
   kicker rule element (3px accent line above h2s) is retired on youth
   surfaces.
3. **Primitives** (all new, youth-scoped consumers only this phase):
   - **Sticky jump bar** — royal band, mono uppercase pill links, cream
     active pill; declares the page's section contract.
   - **Feature band** — full-bleed color band, photo-slot third (gradient
     placeholder until real imagery), title + age/kicker line + prose + CTA.
     Powers the pathway step bands AND the cross-promo bands.
   - **Statement cards** — solid color card row (royal/emerald/red rotation):
     mono label, large serif statement, supporting line.
   - **Pull-quote coach feature** — circular portrait (placeholder until
     photo), large italic serif quote with red emphasis word, credential
     chips, one tie line. NO commitment that the DoC personally coaches any
     group.
   - **Booking cards + overlap header** — red flood band ("Book it right
     here." + live mono status line) with catalog-driven class cards
     overlapping out of it: colored level band with spots-left pill, name,
     day/time/start/venue rows, price, red Book CTA. This is a re-skin
     VARIANT of the existing finder card, prop-gated so adult finder
     rendering is unchanged.
   - **Pricing cards** — three-card cost explainer. ⚠️ Ships describing
     TODAY'S true model (block pricing, exact figures on class cards, live
     "from $" from the catalog). The owner's target model (annual
     registration + per-session with block discounts + private training) is
     platform work in ops; the band upgrades when the rate card exists.
     Never publish sample rates as real.
4. **Page shape — /youth/classes v2** (band order per the mockup):
   hero (graded photo, bold-ages subhead, red CTA + philosophy ghost CTA) →
   jump bar → pathway cards (age *below* title, "years old" phrasing, hook
   lines, anchor CTAs to step bands) → philosophy band ("Development here is
   a system, not a vibe." — four steps + CTA to the philosophy page) →
   what-it-feels-like statement cards (Group / Coaching / Feedback only) →
   coach pull-quote → pricing → book-it-here + booking cards → FAQ (ages,
   moving up, days, year-round, cost, WHERE — the local-SEO entry) → five
   step bands → cross-promo bands (leagues; camps) → close band.
5. **Philosophy page stub** — `/youth/philosophy` v1 (the four-step system +
   coach quote + CTA back to classes) so the philosophy CTA has a real
   destination. Full build later.

## Copy rules (owner-directed, accumulated this session — apply everywhere)

- Ages read "18 months – 3 years old" style, and sit BELOW the step title.
- NO weeknight commitment (sessions will span the week incl. weekends).
- NO indoors-only commitment for classes (venues may expand outdoors).
- NO "the Director takes the group himself" commitment anywhere.
- Camps are NOT only school-break: day camps on breaks PLUS specialty camps
  (tryout prep, skills) — generalize all camps copy.
- Standing rules hold: no format claims, no oppositional copy, facility not
  a selling point, honest inventory, customer-forward voice.
- Coach quote wording must be owner-blessed before shipping as a quotation;
  until then render the method as prose attribution, not quote marks.

## Prod copy fixes shipping with this phase (pre-existing surfaces)

- `PATHWAY` Select blurb: remove "takes himself"; ages → "years old" forms.
- Sport-page tile meta "Weeknight training, five steps" → de-commit days.
- Sport-page classes lede "Weeknight training in small groups…" → same.
- Sport-page FAQ "Is it indoors in the winter?" → answer without venue
  commitment ("winter is a real season — every class card shows where").
- Soccer intro "It's all indoors in central Ohio, so…" → soften venue claim.
- Camps meta/lede ("school-break and summer day camps", "when there is no
  school") → generalized camps copy.

## Local SEO ("classes near me")

- Classes page: "Where classes run" element naming venue + served
  communities (Worthington, Powell, Dublin, Westerville…), a "Where are
  classes held?" FAQ, and title/meta carrying Columbus + Worthington.
  Location facts are allowed on non-hub pages.
- Suburb satellite pages: NOT this phase — widen issue #556's scope to
  include classes queries.
- No new structured-data markup (schema owned by the in-flight SEO branch);
  reference existing NAP/JSON-LD infra only.

## Out of scope

- Adult surfaces (owner-directed).
- Phase 2 recomposition of sport pages / hub / camps / leagues surfaces.
- Suburb satellites, GBP work (ops), rate-card platform work, real
  photography (slots ship with graded gradient placeholders).

## Success criteria

- `/youth/classes` renders the approved mockup's band order with live
  catalog booking cards; every copy rule above verified on the page.
- New tokens + band grammar documented in `docs/design-system.md`.
- Adult pages byte-identical (finder variant is opt-in; verify /adult/*
  unchanged).
- Prod copy fixes verified on sport pages + camps page.
- tsc clean, build clean, landing/classes e2e updated and green locally;
  owner reviews rendered pages in browser before push (standing gate).
