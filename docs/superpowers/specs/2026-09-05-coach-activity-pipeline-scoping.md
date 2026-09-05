# Coach → Activity Pipeline: Scoping

**Date:** 2026-09-05 · **Status:** DECIDED — all §6 decisions resolved with the owner 2026-09-05; §6 records the answers. Phase 0+1 plan is the next artifact.
**Trigger:** The classes-dashboard launch work (#620/#622) revealed that the coach toolchain cannot reach class children at all. Owner directive: scope the FULL coach→activity pipeline — coaches will run camps, classes, and developmental leagues, and this connection point is critical to the product's north star (curriculum → coach → kid/parent development loop).

---

## 1. Current state — three activity types, three different spines

| | **Camp** | **Class** | **Developmental league** |
|---|---|---|---|
| Modeled as | `programs.programType='camp'` + seasons; camp-specific columns live on seasons (`halfDayPriceCents`, age range) | `class_slot_templates` → cron-materialized `drop_in_sessions` (`kind='class'`) | `programs.programType='league'` + seasons (`skillLevel='developmental'` is a display facet only) |
| How kids attach | Plain `registrations` row on the camp season — **no groups, ever** | `class_enrollments` → auto-booked `drop_in_bookings` (carry `familyMemberId`) | `registrations` → **manually** admin-built `teams` + `rosters` |
| Dated sessions | **None.** Only a season date range. Known gap (`src/lib/admin/venue-day-data.ts:15-17`); `ActivityType "camp"` is a declared-but-dead branch | Yes — one `drop_in_sessions` row per occurrence | Games only (`games`); practices exist only as coach-created `session_plans` |
| Coach anchor | None | None (`class_slot_templates` has no coach column; `drop_in_sessions.hostUserId` is the GoodRec host concept, not coaching) | `teams.coachUserId` / `assistantCoachUserId` (nullable, max 2) |
| Coach tools reach kids? | **No** | **No** | **Conditionally** — only after admin creates team + assigns coach + hand-rosters each child |
| Parent surfaces would display coach data? | Yes (all keyed on `familyMemberId` + guardianship) | Yes — except the domain radar (see §4) | Yes (works today) |

**The chokepoints, verified at file level:**
- Every coach read/write funnels through `teams WHERE coachUserId/assistantCoachUserId = me` → `rosters ⋈ registrations` (`src/lib/coach/get-coach-teams.ts:24`, `src/lib/auth/roles.ts:235-350`, `src/pages/api/coach/players/index.ts:73-82`).
- `coach_notes.teamId` NOT NULL; `attendance.teamId`+`rosterId` NOT NULL; `session_plans.teamId` NOT NULL; `session_captures.rosterId` NOT NULL.
- `assessment_snapshots.seasonId` NOT NULL (`recomputePlayerSnapshots` is a documented no-op without a season — `src/lib/curriculum/snapshots.ts:107-109`); classes have no season.
- Class check-in stamps only `dropInBookings.checkedInAt`; camps have nothing to check into.

**What is ALREADY format-aware (the good news):**
- `curriculum_sequences.programType` enum is `["league","class","camp","clinic"]` — the curriculum layer models class/camp arcs end-to-end; only the **delivery** layer (`session_plans.teamId`) is team-locked.
- Templates/activities/skills key on **sport + development stage**, not team.
- The UI vocabulary layer (`groupNoun()`: league→"team", camp→"camp group", class→"class") already abstracts the grouping noun.
- Assessment rows themselves (`player_assessments`, `player_skill_summary`, `player_achievements`) are team-free; only the **route auth** and the **snapshot season** block them.
- Parent surfaces need **zero** changes (verified in the #620 work): all keyed on `familyMemberId`.

---

## 2. The design question: what is the unit a coach coaches?

Today the answer is hardcoded: *a team*. The scoping question is what replaces it.

### Option A — "everything becomes a team" (shadow teams for classes/camps)
Create hidden `teams`+`rosters` for each class template / camp group.
- ✖ `rosters.registrationId` is NOT NULL and class children have **no registrations row** — this option cascades into faking registrations, corrupting revenue/count reporting that reads them.
- ✖ Enrollment churn (weekly class joins/ends, mid-block switches) would need continuous roster sync.
- ✖ Semantic abuse leaks everywhere (standings, team hub, exports).
- **Rejected.**

### Option B — polymorphic **coaching groups** (recommended)
A new thin table names what a coach coaches; a resolver turns any group kind into a member list; write-side tables gain a polymorphic activity anchor.

```
coaching_assignments
  id, organizationId,
  coachUserId          NOT NULL → users
  role                 enum('lead','assistant')
  kind                 enum('team','class_template','camp_group')   -- extensible
  targetId             uuid  -- polymorphic by kind (repo-established pattern:
                            --  self_service_tokens, feedback_requests, resource_blocks)
  active, timestamps; unique (coachUserId, kind, targetId)
```

- **Member resolution per kind** (one resolver, `getCoachGroups(userId)`):
  - `team` → `rosters ⋈ registrations` (existing path, unchanged)
  - `class_template` → `class_enrollments WHERE slotTemplateId = targetId AND status='active'`
  - `camp_group` → (Phase 4; requires camp groups to exist at all, §5)
- **Write anchors relaxed additively:** `coach_notes` gains nullable `activityKind`/`activityId` and `teamId` becomes nullable (dual-anchor CHECK: exactly one of team/activity set); same treatment later for `session_plans`. `attendance` is NOT generalized — class attendance already lives on `dropInBookings.checkedInAt` (see Phase 1).
- **Auth chokepoint gains one branch:** `canCoachReachPlayer(userId, familyMemberId)` = existing roster branch OR active class enrollment in one of the coach's assigned templates (later OR camp-group membership).
- ✔ Follows three established polymorphic patterns in this codebase; additive migrations only; `teams.coachUserId` keeps working during transition (the resolver reads BOTH the legacy columns and the new table, so nothing breaks on day one).
- ✔ Solves multi-coach (>2 per group) for free, which `teams`' two columns never could.

### Option C — per-type point fixes (coach column on class templates, etc.)
Fastest for classes alone, but produces three parallel auth branches, three "my groups" queries, and no path for camps — and we know all three types are coming. **Rejected as the end-state; its class-template piece is effectively Phase 1 of Option B anyway.**

---

## 3. Phasing (Option B)

### Phase 0 — Foundations (small, pure-additive)
`coaching_assignments` table + migration; `getCoachGroups()` resolver reading legacy team columns AND the new table; `canCoachReachPlayer()` with the class-enrollment branch; coach portal "My groups" list showing both teams and (once assigned) class slots. *No behavior change for existing league coaches.*

### Phase 1 — Classes coaching (October launch-critical)
- Admin: coach picker on the class template form (writes a `class_template` assignment).
- Coach: class roster page (mirror of the admin `template-roster.tsx` — enrollment list + per-session attendee/check-in state from `dropInBookings`).
- Glows/grows + notes for class children: `coach_notes` dual-anchor migration; the existing glows flow gets a class-session variant (roster = enrolled children of that session).
- Class attendance = `dropInBookings.checkedInAt`, markable from the coach's session view (no new table; the kiosk/admin walk-up path already writes it).
- Parents: **zero work** — notes/glows appear via existing surfaces.

### Phase 2 — League operations hardening (no schema)
The league pipeline works but every link is manual and currently unexercised (2026-27: 88 seasons, **zero teams**). Ops tooling: bulk team scaffold is there; add roster auto-placement for developmental tiers (everyone who registers gets placed), coach-assignment visibility (which seasons have coachless teams — the sequence-distribution endpoint already warns), and a pre-season checklist surface. Mostly product/ops, not architecture.

### Phase 3 — Assessments everywhere + the radar
- Assessment write route: swap `isPlayerOnCoachTeam` for `canCoachReachPlayer`; `seasonId` validator accepts null for non-league contexts.
- **Snapshot redesign** (the one genuinely hard data question): `assessment_snapshots` requires a season; classes are continuous. Proposal: introduce a `periodKey` (e.g. `2026-Q4` or season id string) replacing the NOT NULL season FK — unique becomes `(familyMemberId, periodKey, domainId)`; league snapshots keep season-shaped keys, classes get calendar quarters. Radar reads periods. Migration is additive-with-backfill (existing rows get their season id as periodKey).

### Phase 4 — Camps (biggest lift, furthest out; camps next run summer 2027)
Camps need **structure before coaching**: camp day-sessions (either a `drop_in_session_kind='camp'` or a dedicated table — the venue command center already has dead branches waiting for exactly this) and camp groups (pods). Then `camp_group` joins `coaching_assignments`, camp check-in joins the day view, and the camp curriculum arcs (already modeled: camp sequences with "Day" units) become distributable.

### Phase 5 — Unified session lifecycle
`session_plans` dual-anchor so field mode / captures / wrap-up / glows work for a class session identically to a practice; curriculum distribution targets class templates (sequence → weekly class plans). Curriculum layer needs no changes.

---

## 4. Known hard edges (called out so nobody rediscovers them)

1. **The radar/season coupling** (Phase 3) is the only place where "just add a nullable column" doesn't work — the snapshot uniqueness and the recompute function assume seasons. Needs the periodKey decision.
2. **Class enrollment churn**: a child who ends enrollment mid-quarter keeps their notes/assessments (they're familyMemberId-anchored — good) but drops out of the coach's reach (`canCoachReachPlayer` goes false). Decide: read-only grace window for the coach, or hard cutoff? (Suggest: coach keeps read access to children they've previously assessed; write access follows active membership.)
3. **Substitute coaches**: template-level assignment doesn't model "coach X covers Tuesday's session". Session-level override is deliberately deferred; the assignments table's shape doesn't preclude a `class_session` kind later.
4. **`attendance` table stays league-only** by design — folding class check-ins into it would duplicate `dropInBookings.checkedInAt`, which kiosk/walk-up/claim flows already write.
5. **Coach credentials/compliance** are org-scoped, not group-scoped — no change needed for any phase (verified).

---

## 5. What this does NOT cover (explicitly out of scope)

- A fixture/game generator for leagues (separate, pre-existing deferral).
- Camp pricing/registration changes (`halfDayPriceCents` is write-only config today — separate thread).
- Any parent-dashboard work (already class-aware after #620/#622).
- Messaging/notification fan-out from coach activity (rides on existing coach_notes visibility flags).

## 6. Owner decisions — RESOLVED 2026-09-05

1. **Staffing model: session-level, not template-level.** Coaches are assigned to *sessions*, with flexibility for turnover and absences. Implementation shape: each class slot carries a **default coach** that auto-stamps sessions as the materializer generates them (staffing happens "at a set interval" with no weekly admin work), plus a **staffing surface** where admins reassign individual sessions (sick days, coverage). This supersedes §2's `class_template` kind as the primary anchor: `coaching_assignments.kind` gains `class_session` (targetId → drop_in_sessions.id); the template-level default remains as config that feeds propagation, not as the authorization anchor.
2. **Multi-coach: lead + one or two assistants per session.** The assignments table models `role: lead|assistant` with no hard cap; admin UI presents lead + up to 2 assistants.
3. **Access policy: the development record is the CHILD's longitudinal file.** Kids may pass through many coaches from micros to elite teams, all adding to one record. **Write** access requires an active assignment covering the child. **Read** access to a child's development record is open to the org's coaching staff (so a newly assigned coach sees full history before their first session, and former coaches keep continuity). Supersedes §4.2's narrower options.
4. **Development reporting is player-centric, not activity-centric.** All activities (league, classes, camps) feed ONE development record per child. Snapshots bucket **monthly at the player level** (periodKey = e.g. `2026-09`), independent of source activity; a **quarterly complete rollup** aggregates three months. Seasons become assessment *context*, not the reporting spine. Product deliverable alongside the plumbing: a monthly subset report and a fuller quarterly report pushed to parents; the record itself stays always-visible on the dashboards. Supersedes §3 Phase 3's "league keeps season keys" framing — league snapshots ALSO move to monthly player-level buckets (season stays as a queryable dimension on raw assessments).
5. **Developmental league rostering: auto-place with admin review.** The system drafts balanced rosters (age group, team-size caps) as registrations confirm; admins review/adjust before publishing. Competitive tiers stay hand-picked.
6. **Camp pods: formation strategy is per-camp-type.** Summer/day camps seed pods strictly age-banded; technical/skills camps seed by skill level (drawing on the development record); staff can adjust either before or during the week. Schema: `camp_groups` + membership with a per-camp `formationStrategy` (age | skill | manual), not a hardcoded rule.
7. **Sequencing: strictly one phase at a time, back-to-back, all phases ASAP.** Order: Phase 0+1 (classes coaching, October) → Phase 2 (league ops: auto-rostering + staffing for 2026-27) → Phase 3 (player-centric snapshots + monthly/quarterly reports) → Phase 4 (camps) → Phase 5 (unified session lifecycle).
