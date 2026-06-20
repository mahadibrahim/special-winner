# Type-aware Offering Creation & Publishing — Design Spec

- **Date:** 2026-06-20
- **Status:** Approved design; ready for implementation planning
- **Slice:** A (first of a larger "make the admin usable" effort — see Non-goals)

## Context

Aspire's admin creates programs and seasons through a one-size-fits-all form
that is shaped for **leagues**. Creating anything else — a summer camp, a class,
a tournament — means using that league form and ignoring the fields that don't
apply. There is also no single, discoverable "create" action: an admin creates a
**Program** on `/admin/programs`, then separately creates a **Season** on
`/admin/seasons`, and the new season defaults to **Draft** (invisible to the
public) with no obvious "publish" step.

This surfaced when adding a real Summer Camp: the path was unclear, the form
showed league concepts (divisions, team rosters, term labels) irrelevant to a
camp, and the season sat in Draft so it never appeared on `/youth/camps`.

Two bugs found and fixed while getting that camp live (separate PRs, prerequisites
in spirit but not blocking this design):
- Season save rejected round-tripped times (`HH:MM:SS` vs `HH:MM`).
- Season dates rendered a day early in timezones behind UTC.

## Problem

The create-and-publish experience is (1) **not discoverable**, (2) **not
type-aware** (league-shaped for every offering), and (3) **easy to leave
unpublished** (the Draft trap). Non-technical venue staff and owners both hit this.

## Goals

- A single, discoverable **"+ New offering"** entry point.
- A **type-aware** form that shows only the fields relevant to the chosen type
  (Camp, Class, Tournament, League).
- An explicit, obvious **publish** decision (Save draft vs Publish now).
- Create the underlying **Program + first Season in one flow** (no two-page hop).
- Reuse the existing data model and public catalog pipeline; this is a
  create-experience redesign, not a model rewrite.

## Non-goals (scope guard)

- **Navigation / IA redesign** (slice B).
- **Venue-admin portal** redesign (slice C).
- **Editing** existing offerings in the large Season Hub, and bulk operations.
  The wizard is for *creation*; edit continues to use existing surfaces for now
  (they inherit the type-aware field logic where cheap, but a full edit redesign
  is out of scope).
- Changing how the public site reads/derives offerings beyond the minimal
  audience-derivation update noted below.

## The four offering types

All types share: name · sport · location/space · description · registration
open/close window · capacity · status.

| Field group | Camp | Class | Tournament | League |
|---|---|---|---|---|
| Dates | Start–end (the week) | Term start–end | Event date / **multi-day** range | Season start–end |
| Times | Daily start–end | Recurring day(s) + time | Day + time | Game day + time |
| Pricing | **Full-day + half-day** | **Membership** (see Open Decisions) | Per-team (+ optional free-agent) | Individual + team |
| Who registers | Per kid (individual) | Per kid (individual) | Team captain (+ free agents) | Individual + team |
| Capacity | Max kids | Max kids | Max **teams** | Max players/teams |
| Age | **Youngest–oldest** | **Youngest–oldest** | Age group/division | Age group |
| Divisions | — | Optional skill level | Gender + skill divisions | Gender + skill |
| Deposit | Yes | Optional | — | Optional |

League is the current form and is correct as-is.

## UX: the "New offering" wizard

Entry point: a primary **`+ New offering`** button on the Seasons (catalog) page,
replacing the implicit "Add Program → Add Season" two-step.

**Step 1 — Type.** Radio choice: Camp · Class · Tournament · League. A one-line
description under each so staff pick correctly.

**Step 2 — Details.** A form rendering **only the selected type's fields** (per the
matrix). Field components are shared primitives; the type config decides which are
shown and which are required.

**Step 3 — Review & publish.** A plain-language summary of what will be created,
with two explicit actions:
- **Save as draft** — created but not public (status `draft`).
- **Publish now** — created and live (status `open`).

This makes going live a deliberate, labeled choice and removes the Draft trap.

Behind the scenes, the wizard creates the **Program** (carrying `programType`) and
its **first Season** (the offering's dated instance) in one transaction, reusing the existing
`POST /api/admin/seasons` (and program creation) logic.

## Data model changes

The model (`programs.programType` + `seasons` carrying dates/price/etc.) already
supports type-awareness. Additive, forward-compatible migrations (per repo
convention — `ADD COLUMN IF NOT EXISTS`, idempotent):

- `seasons.half_day_price_cents` — integer, nullable. Camp half-day price.
- `seasons.min_age` / `seasons.max_age` — integer, nullable. The "youngest–oldest
  accepted" range for camps and classes (today age is only an optional age-group
  reference, which is why the camp showed "All ages").
- **Class ↔ Membership link** — shape depends on the Open Decision below; spec the
  column/relation once that is settled.

**Audience derivation update:** the public youth/adult split currently uses
`ageGroup.minAge` (or falls back to `program.audienceType`). Extend
`deriveAudience` so an explicit `season.maxAge < 18` classifies as youth. This is
what makes a camp with ages 5–12 land on `/youth/camps` deterministically rather
than relying on the `audienceType` default.

## Reuse / what stays the same

- The Program + Season data model.
- The public catalog pipeline: `/api/public/seasons` + `CategoryFinder` +
  `/youth/camps` etc. (unchanged except they now benefit from real age data).
- Season validation and the `status: "open"` publish semantics.
- Pricing/registration flows downstream of the season.

## Open decisions

- **Class pricing model — UNRESOLVED.** Owner is leaning **membership** (recurring
  revenue) over per-session/per-term. Spec the Class step to attach a **Membership**
  product (integrating with the existing `/admin/memberships` module); if membership
  is confirmed, Class needs no per-session price fields at all. Lock before
  implementing the Class type. Camp/Tournament/League are unaffected.

## Validation & edge cases

- End date ≥ start date; for multi-day tournaments the range may span days.
- `max_age ≥ min_age` when both set.
- Half-day price optional; if set, must be ≥ 0 and ≤ full-day price (warn, don't
  hard-block — half-day cheaper than full is the norm but not enforced).
- Times remain optional and are normalized to `HH:MM` (see the time-save fix).
- Publishing requires the type's required fields to be present; "Save as draft"
  permits partial data.

## Testing approach

- Unit: type→field-config mapping (which fields show/are required per type);
  audience derivation with explicit min/max age; price/age validators.
- API: creating each type via the wizard endpoint produces a correct
  program + season; publish sets `status: "open"`; draft stays hidden from
  `/api/public/seasons`.
- E2E (Playwright): create + publish a Camp end-to-end; assert it appears on
  `/youth/camps`. Use `waitForHydration` per the repo's Playwright conventions.

## Rollout

- Additive migrations ship ahead of UI (forward-compatible).
- The wizard is added alongside existing pages; once it covers all four types,
  the old "Add Program / Add Season" entry points redirect into it.
- No data backfill required; existing seasons keep working (new columns nullable).
