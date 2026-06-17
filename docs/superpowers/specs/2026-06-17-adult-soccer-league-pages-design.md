# Adult Soccer League Pages — Design Spec

**Date:** 2026-06-17
**Status:** Design validated in brainstorming (visual companion). Pending spec review → implementation plan.
**Canonical product data:** `docs/sports/adult-soccer-leagues.md` (League Guide source of truth).

## Goal

Aspire is multi-sport and multi-venue. Its league pages must do **two jobs at once**:

1. **Find & book fast** — a visitor can quickly see what's available and register themselves or a team, without being overwhelmed.
2. **Deep sport-specific reference** — rules, divisions/skill levels, schedule, and (once underway) results, like the Arena Sports adult-soccer reference.

The existing fast path (`/adult/leagues` catalog → season card → `/register`) already serves Job 1 across all sports. The **gap** is Job 2: a deep, sport-specific league experience. This spec fills it for **adult soccer first** (prove the pattern, generalize later).

## Scope decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Unit | **Adult soccer only**, now. Generalize to other sports / youth later. |
| Structure | **Two pages**: an evergreen **landing** + per-season **season pages**. |
| Placement | Nest under the existing hub: `/adult/leagues/soccer` (landing). Generalizes to `/adult/leagues/<sport>` and `/youth/leagues/<sport>`. |
| The fast catalog | `/adult/leagues` (multi-sport) is **unchanged**; it gains an entry into the soccer landing. |
| Design | **Bolder, full Aspire palette** (navy-deep hero, orange-bright, ochre/sage tier coding), **photo hero** (stock now, swap for real Aspire photography). |
| Season-page UX | **Tabbed** body (no long scroll); live registration state pinned in the hero. |
| Data grounding | Real Fall 2026 facts per the canonical doc. |

## Routing & IA

```
/adult/leagues                      catalog (all sports) — unchanged; add a "Soccer league details →" entry
/adult/leagues/soccer               Adult Soccer landing (evergreen)
/adult/leagues/soccer/fall-2026     Season page (live; per term)
/adult/leagues/soccer/summer-2026   Season page (completed; keeps final results)
```

- Both pages **SSR** (no prerender) — they read request-time brand/org context and live season data, and per CLAUDE.md any `/adult/**` route stays SSR.
- Entry points to the landing: the `/adult/leagues` catalog (soccer tile/link), `/sports/soccer`, the footer, and nav (`Adult → Leagues`).
- The landing always **points to the current registering term**; the season page is the booking + reference surface for one term.

---

## Page 1 — Adult Soccer landing (`/adult/leagues/soccer`)

**Job:** evergreen "what Aspire adult soccer is" + a durable pointer to whatever term is currently registering. Never goes stale.

Sections (top → bottom), in the bold editorial style:

1. **Compact photo hero** + **"Now Registering" banner** — headline ("Adult soccer at Aspire"), one-line value prop, and a prominent banner: *"Now registering — Fall '26 · closes Sep 3 → See season"* linking to the current season page. If no term is open, the banner shows the next forming term or an interest CTA.
2. **What we run** — evergreen format cards: Coed, Men's, Women's 7v7 (+ Futsal note). Short descriptions; each links into the current season page filtered to that format.
3. **Find your level** — the A/B/C/D ladder (signal-bar icon + verbatim definitions from the canonical doc). The same component used in the season finder.
4. **How it works** — format facts (7v7, 7-game season no playoffs, 50-min games, roster ≤14, refs, walled-arena).
5. **Rules reference** — summary + link to the full ruleset (Rules content module / PDF).
6. **Seasons** — current (→ season page), upcoming/forming, and past seasons with final results (→ season pages).

Data: resolves the **current term** via the public seasons API (sport=soccer, audience=adult, status=open), grouped by term, earliest-open first (explicit `orderBy` — multi-tenant hazard). Format/level/rules copy comes from the **content module** (below).

---

## Page 2 — Season page (`/adult/leagues/soccer/<term>`)

**Job:** the booker's money page for one term — what's available, days/times, register, rules, and results once underway. Stateful.

### Compact photo hero (pinned action)
- Photo background under a navy-deep gradient (legible text); slim nav with the `Aspire` logo above.
- Status pill (**Registration Open** / **In Progress** / **Complete**), `Fall '26 · Adult Soccer` headline, one inline facts line (Indoor 7v7 · Sep 14–Nov 8 · 7-game season, no playoffs · venues · # divisions).
- **Register CTAs**: "Register a team — $1,050" + "Join solo — $120" + early-bird/closing deadline.

### Tabbed body (the UX technique)
Static reference info lives in tabs so the page is ~one screen, not a long scroll. Tabs:

1. **Divisions & Times** (default) — the **finder** (see below).
2. **Schedule** — weekly pattern (night × time, color-coded by tier); per-venue notes. Becomes the real game schedule once published.
3. **Standings** — pre-season empty state ("Standings begin Week 1 — <date>"); live league table + results once `active`; final table when `completed`. Reads live standings/games data.
4. **Rules** — the ruleset from the content module (The game / Coed / Conduct & safety / Roster & standings) + full-ruleset link.
5. **FAQ** — adult-soccer-specific.

### Divisions finder (default tab)
The core interaction. Replaces the generic site card with a dense, scannable design:

- **Level ladder** (A/B/C/D) — signal-bar icon (ascending = higher), label, verbatim definition. **Doubles as a filter.**
- **Filter chips** — Format (Coed / Men's / Women's), Night (Mon–Sun), Venue (Worthington / Downtown / Futsal). One active per group; "clear filters"; live result count.
- **Result rows** (not cards) — each open division: tier bars · name + tags (format · level · age/solo-ok) · night·time · venue · status (spots / forming) · **Register inline**. Forming → "Notify me" (interest list). Empty filter result → "no match, clear a filter / join interest list."
- Age divisions (30+/40+) surface as tagged rows + a hint line.

### Season-page states (by `status`)
- **Forming** → "Join the interest list" emphasis; no register.
- **Open** → register + schedule preview; standings empty state.
- **Active** → schedule + live standings/results; (optional) late-add.
- **Completed** → final standings + "Next season →" pointer.

---

## Design system

- **Palette (bolder, fuller):** navy-deep hero, orange-bright accent/CTAs, **tier color-coding used consistently** — `D = sage`, `C = ochre`, `B = orange`, `A / Open = ink/navy` — in the ladder, division rows, and schedule chips so level is readable at a glance.
- **Type:** Newsreader display (headlines, season title), IBM Plex Sans (UI/body), IBM Plex Mono (labels, facts, status).
- **Imagery:** photographic hero behind a navy gradient overlay (text legible). Use stock now (tagged), swap for Aspire photography later. This is the affordance the brand currently lacks.
- **Row layout** for divisions (intentionally distinct from the standard `bg-paper` site card).
- Built on `BaseLayout`; uses shared UI primitives (`ErrorBanner`, `EmptyState`, `LoadingSkeleton`) for feedback states.

---

## Data model & API

Each **division** (e.g. "Coed B · Mon 6–8 · Worthington") is one `seasons` row. A **term** ("Fall 2026") groups the ~13 division-seasons that the season page aggregates.

Current schema gaps for the finder/term model (additive, forward-compatible per repo convention):

1. **Term grouping** — add `term_slug` + `term_label` to `seasons` (e.g. `fall-2026` / "Fall 2026"). The season page = all adult-soccer seasons sharing a term; the route param is the term slug. *(Recommended over a new `terms` table for now.)*
2. **Finder facets** — add nullable structured columns to `seasons`: `division_gender` (`coed`/`mens`/`womens`), `skill_level` (`a`/`b`/`c`/`d`/`open`), `day_of_week`, `start_time`, `end_time`. Age (30+/40+) reuses the existing `ageGroup`. *(Parsing these from free-text names/`scheduleNotes` is too fragile for filtering.)*
3. **Public API** — extend `/api/public/seasons` to accept a `term` filter and return the new fields (it already filters by sport/location/audience/status). Keep its cache headers.

Reuse, unchanged:
- **Registration:** `/register/[seasonId]` (individual) and `/register/team/[seasonId]`; forming → `/api/public/season-interest`.
- **Standings/results:** existing standings/games tables (`teams.ts`) feed the Standings tab.

**Rules & level content** — evergreen copy lives in a typed **content module** (e.g. `src/lib/leagues/adult-soccer-content.ts`): level definitions, rules sections, format facts, FAQ — sourced from `docs/sports/adult-soccer-leagues.md`. Rendered on both pages. No DB for this. Optional full-ruleset PDF link.

> This schema/API work (items 1–3) is the **primary implementation decision** for the plan. The exact migration shape is for `writing-plans`; the requirement is: the finder must filter by level/format/day/venue and the season page must aggregate a term, driven by structured data, not string parsing.

## Error / loading / empty states

- Finder data load → `LoadingSkeleton` rows; API failure → `ErrorBanner` with retry.
- No divisions match filters → inline empty state + interest-list CTA.
- Standings pre-season → `EmptyState` ("Standings begin Week 1 — <date>").
- No open term on the landing → banner falls back to next forming term / interest CTA.

## Analytics

PostHog events: `league_page_view` (brand, sport, term), `division_filter` (facet, value), `division_register_click` (division, level, venue, mode), `season_interest_submit`. Lets us see which levels/nights/venues drive registration.

## Testing

- **Unit:** term grouping + finder filter logic (level/format/day/venue), current-term resolution (with `orderBy`), content-module shape.
- **API:** `/api/public/seasons?sport=soccer&audience=adult&term=…` returns the new fields and filters correctly.
- **E2E:** season page loads → filter to a division → Register routes to the wizard; tab switching; forming → interest list. Use `useHydrationBeacon` + `waitForHydration`, click-driven interactions.

## Out of scope (follow-ups)

- Generalizing to other sports and to youth (`/adult/leagues/<sport>`, `/youth/leagues/<sport>`).
- Admin UI for editing divisions/term metadata (data entry via seed/admin for now).
- Real Aspire photography (stock placeholder until then).
- The full downloadable ruleset PDF asset.
- Reconciling the SoccerOne-branded version of these pages (shared inventory; brand skin).

## Open items to confirm in planning

- Term modeling: confirm `term_slug`/`term_label` fields vs a `terms` table.
- Whether the season page's Register CTAs deep-link to a specific division or to a chooser when multiple divisions are open.
- Source/format of the full-ruleset PDF.
