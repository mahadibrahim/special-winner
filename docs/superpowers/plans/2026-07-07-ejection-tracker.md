# Ejection / Suspension Tracker (Thin Slice) — Implementation Plan

Product backlog build #4. Owner: "we need a tracker... don't want bad actors." **Owner suspension rules (2026-07-07):** one game per single ejection; **multiple ejections escalate → season, possibly permanent** (director discretion). v1 = capture the ejection + a carry-forward suspension + surface a team-level flag to admins and the next assigned ref, and **surface a person's ejection history so the director escalates**. NO auto-blocking of roster assignment (deferred — `gameIncidents.player` is free text, not a roster FK).

## Critical design constraint (why a NEW endpoint, not the existing report flow)
`src/pages/api/referee/matches/[gameId]/report.ts` **deletes ALL `gameIncidents` for the game and reinserts** the submitted array on every submit. Folding ejections into that array would let a later routine score correction silently erase an ejection record (and its suspension trail via the FK). So ejections are created via a **new, additive-only** endpoint. Also add a defensive `type <> 'ejection'` guard to the bulk delete.

## Global Constraints
- Migration off post-#3 main → **0070** (verify `ls src/lib/db/migrations | tail`). **Enum value addition uses `ALTER TYPE "game_incident_type" ADD VALUE IF NOT EXISTS 'ejection'`** (per 0039/0044) — NOT the `DO $$ ... duplicate_object` wrap (that's for new types/constraints). New table (suspensions) idempotent per 0063/0065. `db:generate` → hand-verify the enum line got `IF NOT EXISTS` → `./scripts/with-bws.sh npm run db:migrate` (confirmed staging).
- Tenant-scope: referee endpoint inherits it from the `gameOfficials` assignment check; the admin list MUST filter `organizationId` explicitly + `getLocationIdsForUser` for location_admin (mirror `/api/admin/incidents`).
- Person subject = free-text `personName` (mirrors `gameIncidents.player`; no roster FK) + nullable `familyMemberId` hook (unpopulated in v1). No `resolvePerson()`.
- **CI-robust fixtures**: self-seed team/game/gameOfficials/ejection rows directly (explicit orderBy); re-seed fresh + run tests twice (build-#1 lesson).
- Explicit orderBy on every `.limit(1)`; `EmptyState`/`LoadingSkeleton` on the admin list; `useHydrationBeacon` on new referee islands.

## Tasks (TDD; commit per task)

1. **Schema + enum** — add `"ejection"` to `gameIncidentTypeEnum` in `src/lib/db/schema/teams.ts`. New `src/lib/db/schema/suspensions.ts`: `suspensionStatusEnum` = `["active","served","appealed","season","permanent"]` (season/permanent per owner escalation). `suspensions` (id, organizationId FK cascade, teamId FK cascade, personName varchar(120) notNull, familyMemberId FK set-null nullable, gameIncidentId FK restrict notNull, reason text notNull, gamesMissed int (default 1 per owner — one game), gamesServed int default 0, notes text, status default 'active', escalatedToDirector bool default false, setByUserId FK set-null, timestamps; indexes org+status, team, gameIncident; check gamesMissed >= 0). Export from `schema/index.ts`. `db:generate` → 0070 → verify enum `ADD VALUE IF NOT EXISTS` → `db:migrate`. Smoke test import + check constraint.

2. **Extract `requireAssignedOfficial`** — pull the inline `gameOfficials where gameId+userId` check from `report.ts` into `src/lib/referee/require-assigned-official.ts`; `report.ts` calls it (existing referee report tests must still pass). Unit test: assigned true / not-assigned false / wrong-game false.

3. **Ejection zod schema** — `src/lib/suspensions/ejection-schema.ts`: `{ side: enum[home,away], player: str 1..120, minute: int>=0 nullish, reason: str min1, carriesSuspension: bool, gamesMissed: int>=0 nullish (default 1 when carriesSuspension), suspensionNotes: str nullish, escalatedToDirector: bool default false }`. Unit tests: valid without suspension; valid with; missing reason rejected; negative gamesMissed rejected; bad side rejected.

4. **`POST /api/referee/matches/[gameId]/ejections`** — `requireAssignedOfficial` (401/404) → parse schema (400) → resolve game's home/away teamId + organizationId (games→seasons→programs→locations) → txn: insert `gameIncidents` (type 'ejection', side, player, minute, description=reason, reportedByUserId); if carriesSuspension insert `suspensions` (teamId by side, personName=player, reason, gamesMissed default 1, notes, escalatedToDirector, gameIncidentId, setByUserId, status 'active') → 201 {incident, suspension|null}. Unit tests (mock db like report-endpoint.test.ts): 401; 404 not assigned; 400 bad; 201 without suspension (no suspensions insert); 201 with (both inserts, teamId matches side).

5. **Defensive fix in report.ts** — bulk delete becomes `and(eq(gameId), ne(type,'ejection'))`; reject a bulk-array entry with `type:'ejection'` (400); keep `INCIDENT_TYPES` = yellow/red/injury/other (ejections only via Task 4). Test: ejection row survives a subsequent /report resubmit; bulk ejection entry → 400.

6. **Referee flag surfacing** — `getRefereeMatchDetail` (`src/lib/referee/referee-queries.ts`) gains `activeSuspensions: ActiveSuspensionFlag[]` = suspensions with status in (active,season,permanent) for either team in the game, org-scoped, orderBy createdAt; empty for TBD-team games. Unit tests: home team; away team; excludes served/appealed; excludes unrelated team; empty for TBD.

7. **Referee UI** — `src/components/referee/ejection-form.tsx` (client:load standalone card: player, side, minute, reason, carries-suspension toggle → gamesMissed (default 1) + notes + escalated-to-director; POSTs Task 4; appends to a read-only local list) + `active-suspension-banner.tsx` (renders activeSuspensions: person + games remaining + highest severity). Wire into `src/pages/referee/matches/[gameId].astro`. Manual verify.

8. **`GET /api/admin/suspensions`** — `requireOrgAdminAccess`; `?status=`/`?teamId=`; org filter + location_admin `getLocationIdsForUser` (teams→seasons→programs→locations), select with team name + linked incident game/minute/side + **the person's ejection count/history** (count of gameIncidents type='ejection' with matching personName in org — for director escalation decisions), orderBy desc createdAt. API tests (self-seeded): 401; parent 403; lists fixture; status filter; teamId filter; 400 bad status.

9. **Admin `/admin/suspensions` list page** — `suspensions-list.tsx` (status filter, table: person, team, reason, games missed/served, status incl. season/permanent, escalated flag, **prior-ejection count**, linked game) + `index.astro` (NOT super-admin-only, so location_admin sees their teams). Manual verify.

10. **Tenant isolation + pre-push** — cross-org test (Org A admin `/api/admin/suspensions` never contains Org B row; use `/api/test/org-fixtures?slug=orgb`). Full checklist (catalog:validate, db:seed:e2e, the suspension/ejection/referee test files + regression, build, tsc 0).

## Key decisions
- New additive ejection endpoint (not the delete-all-reinsert report array) to protect the ejection/suspension record.
- Enum value added, not an is_ejection boolean (a coach ejection isn't a red card).
- gamesMissed default 1 (owner: one game); season+permanent statuses for escalation.
- Escalation is director-driven: v1 surfaces the person's ejection history/count in the admin list (auto-escalation unreliable given free-text names / no roster FK); the director sets season/permanent status.
- Banner is team-level ("active suspension on these rosters — verify") — no per-person auto-matching in v1.

## Owner questions (surface at PR)
- Escalation thresholds: at how many ejections does it become season vs permanent — is 2nd ejection = season, 3rd = permanent, or all director-discretion off the surfaced count? (v1 surfaces the count + lets the director set status; no hardcoded threshold.)
- A status-transition action (active→served, or set season/permanent) is a follow-on — v1 sets status at creation only + the director can escalate via that action once built. Confirm that's acceptable for v1 (log ejections + surface history now, escalation-action next).

## Follow-on (not this PR)
- Auto-block roster assignment (needs a real roster FK on the person).
- Status-transition endpoint (serve/appeal/escalate-to-season-or-permanent + increment gamesServed).
- Per-person name matching for the banner; edit/void a mistaken ejection.
