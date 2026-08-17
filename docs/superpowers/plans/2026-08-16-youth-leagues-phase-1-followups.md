# Youth Leagues Phase 1 — Deferred Follow-Ups

Captured from the nine per-task reviews and the final whole-branch review of
`youth-leagues-redesign`. Everything here was deliberately deferred, not missed.
Grouped by when it has to be dealt with.

## Opened by the merge with `main` (#550, season audience vocabulary)

**0. Youth leagues now have a level vocabulary this branch does not surface.**
`#550` added `YOUTH_LEVELS = ["competitive_a", "competitive_b", "developmental",
"recreational"]` to `division-filters.ts`, with `skillLevelShort`/`skillLevelBadge`
rendering them. This branch's youth term page passes `showLevels={false}`
(`youth/leagues/soccer/[term].astro`) — correct at the time, because `LevelLadder`
renders the *adult* A/B/C/D tiers from `adult-soccer-content.ts` and showing those to
a parent was the defect being fixed. But it now means youth level information is
hidden entirely even though a real youth vocabulary exists.

The proper fix is a youth `LevelLadder` variant driven by `YOUTH_LEVELS`, then
turning `showLevels` back on for youth. Until then a parent cannot tell a
Competitive A division from a Recreational one on the term page. **This is the
highest-value follow-up in this document** — it is the other half of the leveling
explanation the whole redesign was commissioned to fix.

Merge resolution note: this branch's duplicate gender vocabulary (`GENDER_LABEL`,
`ADULT_GENDER_CHIPS`/`YOUTH_GENDER_CHIPS` built by hand) was collapsed onto `#550`'s
`DIVISION_GENDER_LABEL` / `ADULT_GENDERS` / `YOUTH_GENDERS`, and `KNOWN_GENDERS` now
derives from `DIVISION_GENDERS`. `division-slug.ts` keeps its own `GENDER_LABEL`
deliberately — it spells "Co-Ed" where the shared map spells "Coed", and those
strings are baked into indexed adult SEO titles.

## Gated — must land before the first youth season is published

These are dormant only because there is no youth league inventory yet. The day a
youth season goes live, they become customer-visible.

1. **Adult-voiced copy on youth division pages.** `DivisionPageLayout.astro:160-161,182`
   and the meta description at `:67` say things like "Sign up solo ($130) or bring
   a team" — on a U8 page. Needs an audience-aware copy pass.
2. **"Register — Solo or with your team"** (`season-tabs.tsx:108`) is wrong on both
   youth framings: developmental terms are individual-only, club terms are team-only.
   `playLine` already shows the parameterisation pattern; this is a one-prop fix.
3. ~~**Youth URLs are absent from the XML sitemap.**~~ **DONE (youth-landing-redesign):**
   `sitemap-leagues.xml.ts` now partitions rows by the same audience guards the pages
   apply and emits `/youth/leagues/[sport]/[term]` and division URLs via
   `divisionSlugMapForAudience` — a URL is advertised iff its page resolves it.
4. **`/youth/classes` and `/youth/leagues/soccer` missing from
   `src/lib/seo/aspire-sitemap-pages.mjs`.** Route discovery lists them with a trailing
   slash while each page's canonical is slash-less; the dev/CI fallback sitemap omits
   them entirely.
5. **PostHog cannot separate youth from adult.** `trackSeasonViewed({sport, term})`
   (`season-tabs.tsx:68`) carries no audience, and youth and adult genuinely share term
   slugs (`fall-2026` exists on both) — the funnels will merge the day youth ships.
   Also note the new `youth_age_group_cleared` event means `youth_age_group_selected`
   under-counts ladder engagement.

## Worth doing, no deadline

6. **Age-group naming convention is an unguarded string contract.**
   `matchesAgeGroup` compares the ladder's `"U10"` to `age_groups.name`, and
   `division-slug.ts:58` lowercases that name without slugifying. An admin who types
   `"U10 Boys"` or `"U-10"` silently breaks the ladder filter *and* emits a slug
   containing a space. Settle the convention (or slugify + normalise) before youth
   age groups get created in admin.
7. **Two copies of the slug collision rule.** `divisionSlugMap` (`division-slug.ts:75-86`,
   used by the sitemap) and `divisionSlugMapForAudience` (`division-page-data.ts:53-66`,
   used by the pages) implement the same fallback independently. Identical today; a
   change to one silently makes the sitemap advertise URLs that redirect.
8. **`GENDER_LABEL[d.gender]` can render blank.** `divisions-finder.tsx:166` dropped the
   old `: "Coed"` default while the two adult term pages still force-cast. Only an
   empty-string `division_gender` triggers it; the branch already ships
   `toDivisionGender()`, so both adult call sites should just use it.
9. **Ladder a11y and no-JS polish.** Age bands carry no `aria-pressed` until first click
   (SSR omits it), and the month/year selects have no `<noscript>` fallback — with JS
   off they look interactive and silently do nothing. Mitigated by the static 14-row
   ladder below, which fully answers "which group is my kid in".
10. **A `forming`-only term still has no crawlable link.** The new hero banner renders
    only for an open/active term (`partitionTerms`). Same residual the adult twin has.
11. **`catalogOk` is set before the JSON parse** (`youth/leagues/soccer/index.astro:44-45`),
    so a 200 with an unparseable body would cache a bannerless render. Narrow, bounded
    by `s-maxage=60` + SWR. Move the assignment below the parse to close it.
12. **Page-local `VENUE_NAMES`** (`youth/leagues/soccer/index.astro:98`) — a new youth
    venue added to `venue-facts.ts` without a matching entry renders a raw slug.
13. **Footer/adult residue:** the adult "Level" fact tile shows `naming.label` (gender)
    rather than a skill string. Pre-existing, not introduced by this branch.

## Known-weak tests (not introduced here, but don't over-read them)

14. **`registration-guest-flow.spec.ts:139-143`** — this `@critical` test's terminal
    assertion is `stripeIframeMounted || onDashboard || hasErrorBanner`, so it passes
    even on a Stripe config error banner. "@critical is green" is not evidence that
    payment works end to end.
15. **The seed heal shifts `/api/public/seasons` ordering on shared staging.** Audited:
    only `registration-guest-flow.spec.ts:147-150` reads `seasons[0]` unpinned, and it
    passes. A latent trap for the next spec that reads an unpinned index.

## What could not be verified at all

Staging has **no term-slugged youth seasons**, so `/youth/leagues/soccer/[term]` and
the division pages were never exercised against real data — only unit- and
type-verified. The dual club/developmental framing, the Boys/Girls chips, and the
age-group-less-season guard are all code-verified only. Seed youth data before
trusting any of it in production.
