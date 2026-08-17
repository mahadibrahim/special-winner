# Youth vs adult season vocabulary

**Date:** 2026-08-16
**Status:** Approved, not yet implemented

## Problem

An admin scheduling a youth program cannot describe it correctly. Two season
fields carry adult-league vocabulary as their only vocabulary:

- `seasons.division_gender` offers `coed | mens | womens`. Youth needs Boys and
  Girls.
- `seasons.skill_level` offers `a | b | c | d | open` — the SoccerOne adult tier
  ladder. Parents need to know whether a program is competitive, developmental,
  or recreational.

The gender half was fixed first as a bug (`boys`/`girls` added to the shared
value set; they fit the existing `varchar(10)` column, so no migration). This
spec covers the rest: making both fields audience-aware end to end.

Scheduling a youth program is a genuinely different act from scheduling an adult
one. The fields are the same; the words are not.

## Decisions

Recorded here because each closed off a plausible alternative.

| Decision | Chosen | Rejected because |
|---|---|---|
| Youth tiers | Competitive A / Competitive B / Developmental / Recreational | No "All levels" tier — the existing blank (`—`) already covers "doesn't apply". Competitive youth leagues run A and B divisions; Developmental and Recreational are not subdivided |
| Storage | Disjoint values in one column, widened | Short codes (`dev`) read as jargon in exports and Studio; reusing `a`/`b`/`c` per audience makes a stored value meaningless without a join to `programs.audience_type` — the exact shape of the bug being fixed |
| Audience source | `programs.audience_type` of the selected program | `deriveAudience()` puts the *age range* first, and those fields are editable in the same form — typing `8` into "youngest age" would flip the vocabulary mid-edit |
| Server validation | Accepts the union of both vocabularies | Cross-checking value against audience would make a preserved stale value un-saveable (400 on an unrelated edit) |
| Stale values | Preserved and flagged in the dropdown | Clearing them means an admin who opens a season to change the price silently erases someone's level |
| Term label/slug | Unchanged, shown for both audiences | Only the vocabulary was wrong; hiding fields is a separate question |

## Data model

Audience-scoped lists in `src/lib/leagues/division-filters.ts`, with the union
as the stored type:

```
YOUTH_GENDERS = coed | boys | girls
ADULT_GENDERS = coed | mens | womens

YOUTH_LEVELS  = competitive_a | competitive_b | developmental | recreational
ADULT_LEVELS  = a | b | c | d | open
```

`coed` is deliberately in both gender lists. The level lists are fully disjoint,
so a stored level identifies its own audience.

Competitive youth leagues run A and B divisions, so the youth "competitive" tier
carries the division letter with it: `competitive_a`, `competitive_b`.
Developmental and Recreational are not subdivided, and there is no bare
`competitive` value — a competitive youth league is always A or B.

Storing `competitive_a` rather than reusing the adult `a` is what preserves
disjointness. Reusing `a` would make the stored value ambiguous between an
adult elite division and a youth competitive one, which is the failure this
whole design is built to avoid.

### Migration

One statement, from `npm run db:generate`:

```sql
ALTER TABLE "seasons" ALTER COLUMN "skill_level" SET DATA TYPE varchar(16);
```

`skill_level` is currently `varchar(8)`; the longest youth value
(`competitive_a`) is 13 characters and the shortest (`recreational`) is 12, so
every one of them overflows today's column. Postgres widens a varchar in place
with no table rewrite, and re-running is a no-op, so this satisfies the repo's
additive-and-idempotent migration convention. 16 leaves three characters of
headroom without inviting the column to become a free-text field.

`division_gender` stays `varchar(10)` — `boys` and `girls` already fit.

## Audience resolution

`audienceType` is added to the `/api/admin/programs` select (one column) and to
the `Program` interface in `seasons-list.tsx`.

A pure helper resolves it:

```ts
audienceForProgram(audienceType: string): "youth" | "adult"
```

`"adults"` and `"adult"` both mean adult — the column is a free-text
`varchar(20)` with no enum constraint, and both spellings exist in the data.
Everything else, including the `"parents"` default, means youth.
`deriveAudience()` in `src/lib/programs/derive.ts` is left alone for the
read-path callers it already serves.

Both dropdowns read from the currently-selected program, so changing the program
picker swaps both vocabularies immediately.

## Stale values

Until this work, the level dropdown offered `a|b|c|d|open` on every season
regardless of audience, so youth seasons in staging and production may already
hold an adult value.

When the stored value is not in the current audience's list, it is appended to
the dropdown as a selectable item marked with its origin:

```
—
Competitive A
Competitive B
Developmental
Recreational
Adult tier: B · Competitive      ← stored value, preserved
```

The stale marker leads with "Adult tier:" rather than trailing it. The adult
label for `b` is "B · Competitive" and the youth label for `competitive_b` is
"Competitive B" — as a trailing parenthetical the two read almost identically
in a dropdown. Leading with the audience is what separates them at a glance.
For the same reason the youth labels use a plain space, not the `·` separator
the adult labels use.

Opening and saving a season never silently drops it. The admin re-picks a youth
tier when they choose to.

## Display

`league-context-rail.tsx` is the summary panel beside the registration form —
the sidebar on desktop, a pinned strip on mobile. It wraps **every**
registration, youth and adult (`register-experience.tsx:60,67,80`).

It currently renders the level as `Tier {value.toUpperCase()}`, which assumes a
single letter. A youth season would render **"Tier DEVELOPMENTAL"** in a badge
sized for one character — customer-facing, mid-checkout.

A shared `skillLevelLabel(value)` helper fixes this:

| Stored | Rendered |
|---|---|
| `b` | `Tier B` |
| `open` | `Tier OPEN` (unchanged from today) |
| `developmental` | `Developmental` |
| `competitive_a` | `Competitive A` |
| unrecognized | echoed unchanged |

All five adult values keep today's uppercase `Tier X` treatment, including
`open` — changing that is a separate cosmetic question and out of scope here.
Youth drops the "Tier" prefix and the all-caps, so a parent reads a word that
means something to them.
`tierColorClass()` in `rail-content.ts` gains colors for the three youth values
rather than falling through to its default.

**Rule: nothing reads the raw `skill_level` for display.** This field now has
two vocabularies, so every future consumer would otherwise need to know all
nine values. The helper is what stops that from spreading.

## Testing

Unit tests only — no DB, no running server:

- `audienceForProgram()` — `parents`, `adults`, `adult`, unknown, empty
- Option lists are disjoint apart from `coed`, and **every value fits its column
  width** (the check that would have caught the `varchar(8)` problem before it
  shipped)
- Stale-value handling — a youth season holding `b` keeps `b` in its options,
  marked
- `skillLevelLabel()` — `b` → `Tier B`, `developmental` → `Developmental`,
  `competitive_a` → `Competitive A`, unknown echoed
- `seasonSchema` accepts all nine level values, still rejects junk
- `tests/unit/rail-content.test.ts` extended for the youth tier colors

## Scope

**Touched:** `division-filters.ts`, `seasons-list.tsx`,
`offering-wizard/DetailsStep.tsx`, `offering-wizard/OfferingWizard.tsx`,
`api/admin/programs.ts`, `api/admin/seasons.ts`, `league-context-rail.tsx`,
`rail-content.ts`, `schema/programs.ts`, one migration.

**Not touched:** adult-only surfaces (`divisions-finder.tsx` filter chips,
`SoccerOneLeaguesFinder.tsx`, drop-league), age groups, pricing, signup modes,
`deriveAudience()`.

The offering wizard creates the program, so its audience comes from the wizard's
own `audienceType` field rather than a lookup.

## Known limitations

`src/lib/landing/skill-levels.ts` has a similar-sounding vocabulary
(`recreational | intermediate | advanced | all_levels`) used by pickup and
drop-in landing pages. It is a separate concept on a separate field and is
deliberately not merged here. Note that `recreational` appears in both — same
word, two unrelated fields.

The adult tier `b` is labelled `B · Competitive` in the admin dropdown, while
`competitive` is the name of a *youth* tier. An admin looking at a season with a
preserved stale value sees `B · Competitive (adult tier)` sitting next to
`Competitive`. The parenthetical is what disambiguates them; renaming the adult
tier labels is out of scope.
