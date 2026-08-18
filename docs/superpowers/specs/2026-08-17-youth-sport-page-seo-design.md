# Youth sport-page SEO — design (Approach A)

Date: 2026-08-17 · Branch: `youth-hub-v3` · Status: approved by owner

## Context

The youth funnel is now sport-first (hub `/youth` → sport pages `/youth/soccer`,
`/youth/futsal` → offering pages). The owner designated `/youth` an **organic /
SEO entry**, with the searchable substance living on the **sport pages**, since
real query demand is sport-shaped ("youth soccer columbus", "toddler soccer
classes") rather than generic. The hub stays a tight router.

Page shapes follow `docs/adult-design-reference.md`. This spec adds content
depth, not structure changes.

## Voice — customer-forward (governs every line of new copy)

Written from the parent's side of the table:

- **Second person, kid-centered.** "Your kid", "you" — never "we offer" /
  "our program provides". Aspire appears as the answer, not the subject.
- **Outcomes over inventory.** What the kid experiences beats what Aspire has.
  Facts (ages, days, prices) appear as answers to the parent's question, never
  as boasts.
- **Plain words, honest specifics.** No superlatives ("premier", "elite"), no
  jargon. Only claims we can back.
- Standing rules hold: no format claims, no oppositional copy, the facility is
  not a selling point, no eyebrow text, roman headings.

Approved sample (sport-page intro register):

> Your kid wants to play soccer — or you want them to try it. Either way,
> there's a place for them here: leagues by age group from U6 to U19, weeknight
> classes that start at 18 months with you on the floor beside them, and camps
> that cover school breaks. It's all indoors in central Ohio, so the season
> your kid falls in love with the game doesn't end in November. Every coach
> they'll have trains under our Director of Coaching, so Tuesday's session
> means the same thing as Thursday's. Start with what's open above, or find
> their age group and go from there.

## Workstreams

### 1. Sport-page editorial intro

A prose block (~150 words, one to two paragraphs) directly under the hero on
each sport page. Copy authored per sport in `src/lib/youth/sport-pages.ts`
(new `intro: string[]` field, one string per paragraph), rendered by
`src/components/youth/youth-sport-page.astro` in a `max-w-[640px]` text
section. Location words (Columbus / central Ohio) are allowed here — the
de-location rule applies to the hub only. Futsal's intro must not make format
claims about how futsal differs from soccer (standing rule); it sells the
sibling-sport relationship ("same staff, same curriculum") instead.

### 2. Age-anchor sections

On sport pages, each pathway card gains one customer-forward sentence (reuse
`PATHWAY[].blurb` — already in voice) and the classes section renders each
step with a stable anchor id: `#micros`, `#minis`, `#juniors`, `#academy`,
`#select` (slug derived from the step name, "Aspire Micros" → `micros`).
Cards become `<div id={slug}>` with `scroll-mt-28` so header offset is
correct. These are the landing targets for age queries ("soccer for 3 year
olds columbus" → `/youth/soccer#minis`).

### 3. Sport-specific FAQs

`LandingFaq` (existing component) on each sport page, above the coach
section. 4–5 questions per sport, authored in the sport-pages registry
(new `faqs: LandingFaqItem[]`-shaped field, typed locally to avoid importing
component types into lib). Questions answer only what is true today, e.g.:

- What age can my kid start soccer? (18 months — Micros, with a grown-up)
- Is it indoors in winter? (yes — indoor seasons run all year)
- Does my kid need experience or a team? (no — developmental leagues build
  teams; classes meet kids where they are)
- What does it cost? (reuse `PRICING.body` so figures cannot drift)

**No FAQPage JSON-LD** — structured data is owned by the in-flight Phase-A
SEO branch (`feat/seo-content-phase-a`); adding it here would collide.

### 4. Hub crawlable intro

2–3 indexable sentences on `/youth` between the hero and the benefit trio,
customer-forward, no location words (hub rule), linking the two sport pages
inline. Lives in `HERO` neighborhood of `src/lib/youth/landing-content.ts`
(new `INTRO` export) so copy stays out of markup.

### 5. Sitemap + canonicals (plumbing)

- Add `/youth/soccer`, `/youth/futsal` to `ASPIRE_SSR_PUBLIC_PAGES` in
  `src/lib/seo/aspire-sitemap-pages.mjs`.
- Fix pre-existing gap: `/youth/classes` is missing from that list — add it.
- Canonicals already render on the new routes (`[sport].astro`); verify in
  page source during testing.

### 6. Voice retrofit of existing session copy

One pass over copy added earlier this session, adjusting wording (not
structure) to the voice: hub subhead, sport tile metas, hub FAQ answers,
close-band copy, sport-page section ledes. Keep diffs small and reviewable.

## Out of scope

- City-guide satellite pages (`/youth-soccer-columbus`) — phase 2 after the
  sport pages have indexing history.
- Programmatic age×sport pages — rejected (thin-content risk).
- FAQPage / any new JSON-LD — SEO branch owns it.
- New components — everything reuses existing patterns.

## Success criteria

- `/youth/soccer` and `/youth/futsal` each carry ≥200 words of indexable,
  honest, customer-forward prose (intro + age sentences + FAQ answers).
- Age anchors resolve and scroll correctly with the sticky header.
- Both routes appear in the built sitemap; canonicals verified.
- Every new sentence passes the voice rules and standing copy rules.
- `npx tsc --noEmit` clean; e2e landing spec still green; owner approves the
  rendered pages in the browser before commit (standing gate).
