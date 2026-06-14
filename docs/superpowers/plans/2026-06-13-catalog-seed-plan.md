# 2026-27 catalog seed — plan

**Date:** 2026-06-13
**Status:** draft — pending founder approval + prod inspection
**Goal:** Populate the Aspire org's prod catalog with the full 2026-27 division grid (~25 programs × up to 4 sessions ≈ 80-100 seasons) so the advertised grid exists and can collect interest, opening paid registration selectively.

## Data model (confirmed from `seed-e2e-tests.ts`)

- A **division** = a `programs` row (`programType: 'league' | 'camp' | 'clinic' | 'training'`, `audienceType: 'adults' | 'parents'`, scoped to `locationId` + `sportId`).
- A **session** of a division = a `seasons` row under that program (`status`, `startDate`/`endDate` as `YYYY-MM-DD` strings, `registrationOpens`/`Closes`/`earlyBirdDeadline` as timestamps, `priceCents`, `teamPriceCents`, `signupModes`, `depositCents`, `maxParticipants`, optional `ageGroupId`/`venueId`).
- Idempotency pattern: **select-by-slug, insert only if absent** (so the seed is safely re-runnable).

## Verified inputs

- **Dates (school-calendar-verified):** Fall Sep 14–Nov 8 2026; Winter 1 Nov 9 2026–Jan 17 2027 (byes Thanksgiving Nov 25-27 + winter break Dec 21–Jan 3); **Winter 2 Jan 18–Mar 20 2027**; Spring Apr 5–May 30 2027. Registration windows per the preview (Fall opens Jul 13 / EB Aug 3 / closes Sep 3; Winter 1 Sep 14 / Sep 28 / Oct 29; Winter 2 Nov 16 / Dec 7 / Jan 7; Spring Feb 8 / Feb 22 / Mar 25).
- **Pricing:** adult 7v7 team $1,050 / EB $1,000 / individual $120 / deposit $200; futsal 5v5 team $750; youth league $120/player; classes + Drop League TBD.
- **Capacity model:** Worthington 2 turf (7v7) + 1 futsal; Downtown 1 turf (7v7), no futsal.

## Division grid to seed (from the verified preview roster)

**Downtown — adult only (1 field):** Coed D, Coed C, Coed B, Men's Open/A (4 leagues) + Drop League (weight-loss, `training`/`league`).

**Worthington — adult 7v7 (2 fields):** Coed B, Coed C, Coed D, Coed 30+, Coed 40+, Men's C, Men's D, Men's 30+, Women's Open (9).

**Worthington — futsal 5v5:** Futsal Coed Rec, Futsal Men's B, Futsal Coed Comp, Futsal Men's A (4).

**Worthington — youth leagues (Sat):** U6, U8, U10, U12 rec + Youth Futsal U7-U8 (5).

**Worthington — classes (`clinic`/`training`):** Lil' Kickers U3-U5, Academy U4-U8, Academy U7-U10 (3).

**Camps (`camp`, one-off weeks, not ×4):** Thanksgiving (Nov 23-25), Winter (Dec 28-Jan 1), Spring (Mar 22-26 + Mar 29-Apr 2).

Adult leagues + futsal run all 4 sessions; youth leagues all 4; classes likely all 4; Drop League TBD cadence; camps are dated one-offs.

## Status strategy

Seed everything as **`draft`** (invisible). Then the founder reviews in `/admin` and flips the advertised slate to **`forming`** (the advertise step — PR #193 shipped this) and opens 0-few divisions to paid registration for launch. Rationale: seeding directly to `forming` would publish ~80 divisions on the live site (gosoccerone + aspire) the instant it runs; draft-first keeps the reveal a deliberate, reversible admin action.

## Procedure (script: `scripts/seed-2026-27-catalog.ts`, branch-specific, deleted after merge)

1. **`--inspect`** (read-only): dump org/locations/venues/sports/ageGroups/existing programs+seasons. Confirms FK targets + collision risk.
2. **`--dry-run`** (read-only): resolve all FKs by slug, generate the full season list, print exactly what would be inserted/skipped. Writes nothing. This is the review gate.
3. **Live run:** idempotent insert (select-by-slug first). Prints created vs skipped counts.
4. **Verify:** re-run `--inspect`; confirm counts; smoke `/admin/seasons` + the public catalog (draft → not visible yet).

**Guards:** refuse unless the resolved org slug matches the expected Aspire org; default to `--dry-run` (live requires an explicit `--commit` flag); never delete/update existing rows (insert-only, skip-on-conflict).

## Decisions (founder, 2026-06-13)

1. **Futsal = its own `sport`** — seed creates a `futsal` sport; futsal divisions hang off it.
2. **Create field venues** (idempotent — some may already exist; resolve-by-slug/name first, create if absent): Worthington Turf A / Turf B / Futsal Court; Downtown Turf.
3. **Drop League — DEFERRED.** Founder says a spec exists, but it is NOT in the local project folder (searched "Drop League"/"Man v Fat"/"weight loss"/"weigh-in" — only the unrelated drop-in booking feature). Likely in Notion. Don't invent format/pricing; add once the spec is located.
4. **Classes — DEFERRED.** Lil' Kickers / Academy will be **membership-based**, not per-class; pricing not yet decided. Leave out of this seed.
5. **Seed status = `draft`** for everything. Founder flips to `forming` in admin as the deliberate advertise step.
6. **Age groups — create any missing** (youth U6/U8/U10/U12 + U7-U8 futsal; adult Adult-18+/Over-30/Over-40).

**In scope for this seed:** Downtown adult leagues (4), Worthington adult 7v7 (9), Worthington futsal (4), youth leagues (5), camps (3 dated weeks) — across 4 sessions ≈ ~80 seasons. **Out:** classes, Drop League.

## Runner (solved)

`tsx` is broken under Node v25.9.0 (esbuild resolution). **Native Node runs `.ts` directly** (v25 type-stripping), so scripts run via `node`, not `tsx`. Scripts must be **standalone** (only the `postgres` driver, no project imports, no `@/` alias) to satisfy native resolution. `scripts/inspect-catalog.ts` is written this way and verified to load. The seed script will follow the same pattern.

## Execution gate (needs founder action)

Prod reads/writes are a production action the safety layer (correctly) gates. **Next step:** founder runs the read-only inspection to reveal current prod state (org/locations/venues/sports/age-groups/existing programs):

```
! railway run bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/inspect-catalog.ts'
```

Paste the output back → I write the precise idempotent seed script → founder runs `--dry-run` (read-only, prints planned inserts) → review → `--commit` (write) → verify.
