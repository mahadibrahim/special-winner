# League Season Metadata — Enablement Design Spec

**Date:** 2026-06-17
**Status:** Design validated in brainstorming. Pending spec review → implementation plan.
**Why:** The adult-soccer league pages (PRs #224/#226) shipped working code, but they're **dark in prod** — they key on `term_slug` / `division_gender` / `skill_level` / `day_of_week` on `seasons`, and those columns are **null on every prod season**. The 88 Fall 2026 → Spring 2027 division-seasons already exist (created by `scripts/seed-2026-27-catalog.ts`, status `draft`), but nothing populates the new metadata, and the admin season form can't set it. This spec makes the metadata (a) **enterable in admin** and (b) **backfilled in bulk** onto the existing catalog rows.

## Context (verified live)

- `GET /api/public/seasons?sport=soccer&audience=adult` returns 2 open seasons (Founders' Tournament, Summer 2026 Adult Co-Ed) — both with `term/gender/level/day = null`.
- `/adult/leagues/soccer/fall-2026` 302s to the landing (no season has `term_slug="fall-2026"`).
- Today is 2026-06-17; **Fall 2026 registration opens 2026-07-13** (per the catalog) — so Fall being in `draft` is schedule-correct. The current open term is Summer 2026.

## Scope decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Make metadata enterable | **Yes** — add fields to the admin season create/edit form + endpoint. |
| Bulk backfill | **Extend `scripts/seed-2026-27-catalog.ts`** to populate metadata, idempotently, and re-run against prod. |
| Summer 2026 | **Do not** backfill it. Fall 2026 (opens Jul 13) is the first live term; ~4 weeks with no current-term banner is acceptable. |
| Turning seasons on (status) | **Out of scope** — staff control status in `/admin/seasons` per the registration schedule. |
| `day_of_week` / `start_time` / `end_time` | **Left null for now** — operational (assigned when weekly schedules are set). The finder's day filter and the schedule view tolerate nulls. |

## Part A — Admin season metadata fields

Add 7 optional fields end-to-end so staff can set/maintain league metadata on any season.

**Endpoint** — `src/pages/api/admin/seasons.ts`:
- Extend the `seasonSchema` (zod) with optional/nullable fields:
  `termSlug: z.string().optional().nullable()`, `termLabel: z.string().optional().nullable()`,
  `divisionGender: z.enum(["coed","mens","womens"]).optional().nullable()`,
  `skillLevel: z.enum(["a","b","c","d","open"]).optional().nullable()`,
  `dayOfWeek: z.enum(["mon","tue","wed","thu","fri","sat","sun"]).optional().nullable()`,
  `startTime: z.string().optional().nullable()`, `endTime: z.string().optional().nullable()` (HH:MM).
- Map them into the POST insert and PUT update value objects. Auth/tenant guards (`requireAdminAccess`, `requireSameOrg*`) are unchanged — the endpoint is already generic.

**Form UI** — `src/components/admin/seasons-list.tsx`:
- Add the 7 keys to `formData` state, mirror existing field patterns (text input for term slug/label; `Select` for gender/level/day matching the age-group select; `type="time"` inputs for start/end), group them under a "League page metadata (optional)" section in the dialog.
- Add to the `handleSubmit()` payload builder and the `openEditDialog()` populate-on-edit logic.
- Time columns are SQL `time`; send `"HH:MM"` strings (the existing add-hold-form uses `type="time"` the same way).

## Part B — Backfill via the catalog seed

`scripts/seed-2026-27-catalog.ts` is the canonical, idempotent definition of the 88 seasons (already applied to prod). Extend it to own the metadata too:

1. **Declare metadata explicitly on each division** — add `gender` and `skill` to `DivSpec` (no label-parsing). Derivation table:

   | Division label | gender | skill |
   | --- | --- | --- |
   | Co-Ed B / C / D | `coed` | `b` / `c` / `d` |
   | Co-Ed 30+ / 40+ | `coed` | `null` (age bracket) |
   | Men's C / D | `mens` | `c` / `d` |
   | Men's 30+ | `mens` | `null` (age bracket) |
   | Open / A (Men's) | `mens` | `a` |
   | Women's Open | `womens` | `open` |
   | Futsal Co-Ed Rec / Comp | `coed` | `d` / `b` |
   | Futsal Men's A / B | `mens` | `a` / `b` |
   | Youth U6–U12, U7-U8 | `null` | `null` |

   `term_slug` = `session.key` (e.g. `fall-2026`); `term_label` = `session.label` (e.g. `Fall 2026`).

2. **Set the columns on insert** — add `term_slug, term_label, division_gender, skill_level` to the `insert into seasons (...)` values.

3. **Backfill existing rows** — the loop currently **skips** seasons that already exist (select-by-slug). Change the on-exists branch from skip to a metadata **`UPDATE`** that sets only `term_slug, term_label, division_gender, skill_level` (leaves status, pricing, dates untouched). This is what actually backfills the 88 already-created prod rows. Keep it gated behind `--commit` and idempotent.

4. **Run** (operational step, like the original): `railway run bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/seed-2026-27-catalog.ts --commit'` against the prod catalog DB. Dry-run first (default) to review the planned updates.

Futsal and youth divisions are a different sport/audience and won't appear on the adult-soccer page, but they get correct metadata for their future pages.

## Data flow (after this ships)

1. Catalog re-run sets `term/gender/level` on all Fall→Spring division-seasons (still `draft`).
2. Staff flip a term's seasons to `open`/`forming` in `/admin/seasons` per the schedule (Fall on ~Jul 13).
3. `/api/public/seasons` now returns those seasons **with** the metadata → the landing resolves the current term (banner) and `/adult/leagues/soccer/<term>` renders the finder; standings light up once games are played.
4. Going forward, staff set metadata on new seasons via the admin fields (Part A).

## Error / edge handling

- Age-bracket divisions (30+/40+) have `skill_level = null`; the finder/season page already map `null → "open"` for display (4-bar icon). Acceptable; a dedicated "age" facet is a future refinement (noted below).
- Admin fields are all optional/nullable — existing admin workflows are unaffected; leaving them blank is valid.

## Testing

- **API** (`tests/api/`): admin `POST /api/admin/seasons` and `PUT` accept + persist the 7 new fields; tenant/auth guards still enforced (a cross-org edit still 404s). Reuse existing admin-auth test helpers.
- **Unit** (`tests/unit/`): extract the division→metadata mapping (or assert each `DivSpec` has `gender`/`skill`) so the derivation table is locked; a small test that `term_slug`/`term_label` come from the session.
- **No new E2E needed** — the league-page E2E already covers rendering given metadata-bearing seasons (seeded). This spec just provides that metadata in prod.
- **Manual/staging verification:** run the extended catalog seed against staging, flip a Fall term to `open`, confirm `/adult/leagues/soccer/fall-2026` renders the finder.

## Out of scope (follow-ups)

- Populating Summer 2026 / Founders' Tournament metadata (decided no).
- Turning seasons on (status) — staff/schedule.
- `day_of_week` / `start_time` — set later when weekly schedules are assigned (admin fields support it now; values come with scheduling).
- A dedicated **age-division** facet (30+/40+) in the finder; today they fold under their gender + the "open" tier.
- Youth/futsal public pages.

## Open items to confirm in planning

- `skill_level` for 30+/40+ divisions: `null` (fold into "open" display) vs a new `"age"` enum value. Spec assumes `null`; revisit if the finder needs an explicit age facet.
- Whether to also surface a small "age bracket" tag on division rows now or defer.
