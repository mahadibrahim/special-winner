# Game-Day Operating Model — Design Spec

**Date:** 2026-05-06
**Status:** Draft for review
**Owner:** Director (mahad@gmail.com); operating partner once delegated
**Scope:** Game-day operations only. Registration, coach onboarding, season setup, financial close, and procurement are explicitly out of scope and will receive their own operating models.

---

## 1. Problem statement

Aspire Sports needs a single, scalable operating model for game-day operations that:

- Works across **multiple venues, sports, and event formats** (outdoor leagues, indoor leagues, tournaments, clinics, drop-in, private events). New venues and sports must plug in as configuration, not as model redesigns.
- **Automates and systematizes** as much as possible. For activities that can't be automated, defines clear procedures, single-accountable owners, and assignment + completion tracking.
- Enforces **single accountability** on every activity. Shared accountability is rejected by schema.
- Maps cleanly to **employee, contractor, and customer-facing manuals** without manual duplication.
- Gives the platform an **active role** — not just descriptive documentation, but a live tracking system that knows whether each activity completed by its expected time and escalates when it didn't.

The current state is a single-venue, founder-dependent operation. The model below is built for the next 12–24 months: 3–10 venues, 3+ sports, an operating partner, and a 1099 contractor pool for refs, photographers, and event leads.

---

## 2. Operating principles (load-bearing)

These principles drive every design choice in this spec. Apply in order when in doubt.

1. **Design for multi-venue, multi-sport scale.** Don't anchor to current state.
2. **Automate + systematize first.** Default question: "can the platform do this?" before "who should we assign this to?"
3. **For non-automatable steps:** clear procedure, named accountable owner, assignment tracking, completion tracking.
4. **RACI on every activity.** Responsible (does the work), Accountable (one person), Consulted (input before), Informed (told after).
5. **Single accountability is non-negotiable.** Exactly one person is Accountable per activity.
6. **Documentation lives in employee/contractor/customer manuals,** generated from the catalog — not maintained as separate Notion pages that drift.
7. **Every activity is system-trackable.** Completion is recorded as structured data; missed deadlines trigger reminders to the Responsible party and the Accountable owner.

---

## 3. Approach: activity catalog with multi-dimensional views

The model is a single **canonical catalog of activities**. Phase-views, role-views, sport-views, and the platform automation backlog are all generated from the catalog.

Considered but rejected:

- **Phase-first model** (organize by chronology) — easy to read as a runbook, but fragments role accountability and forces sport-specific items into awkward places.
- **Role-first model** (organize by job description) — good for hiring, but multi-role activities get duplicated and drift across files.

The catalog approach is the only one where adding a venue, sport, or role doesn't require editing existing documents. Phase and role views fall out as filters.

---

## 4. Activity schema

Every game-day activity is one record with this shape:

```yaml
id:          string         # stable slug, e.g., act.rainout_decision
name:        string         # human-readable
description: string         # one-line "what is this"
trigger:     string         # what causes this activity to start

phase:         enum           # which phase of the day (§5)
sport_tags:    string[]       # e.g., [outdoor:soccer, outdoor:flag_football]
venue_tags:    string[]       # e.g., [outdoor], [indoor, owned, concessions]
format_tags:   string[]       # e.g., [league], [tournament], [drop_in]
audience_tags: string[]       # e.g., [youth], [adult]; empty = applies to all

raci:
  accountable: role-id          # EXACTLY ONE
  responsible: role-id[]        # who does the work (can be multiple)
  consulted:   role-id[]        # input before action
  informed:    role-id[]        # told after action

automation_status: platform | hybrid | manual
platform_features: feat-id[]    # links to product backlog items
escalation_path:   string       # who handles failure / contested calls
sop_body:          markdown     # the actual procedure

# Tracking + reminders (§9)
tracking_method:    checklist | form | signature | photo_upload
                  | system_event | counter_increment | external_acknowledgment
tracking_artifact:  <discriminated union, see §10>
expected_completion: string       # parseable DSL, see §9
reminder_policy:    object | null # optional override of default
```

**Schema rules enforced by validator:**

- `accountable` must reference exactly one role (not zero, not multiple).
- `tracking_method = none` is disallowed — every activity must be system-trackable.
- `accountable = role.director` is a smell flag (warning, not error) outside `post_day` phase. The Director should rarely be the day-of accountable; they are an escalation target.
- All `role-id`, `feat-id`, and artifact references must resolve to existing files in the catalog.

---

## 5. Phase taxonomy

Seven phases form the chronological backbone. Sport- and venue-agnostic.

| Phase | Window | Typical activities |
|---|---|---|
| `pre_day` | T-72h to T-12h | Roster confirms, ref assignments, weather pre-check, parent reminders |
| `day_setup` | T-12h to T-2h | Facility unlock, equipment staging, signage, concession setup |
| `pre_game` | T-2h to T-0 (per match) | Field setup, ref check-in, walk-on registration, rainout decision |
| `in_game` | Match in progress | Timekeeping, score reporting, incident response |
| `post_game` | T+0 to ~T+30min (per match) | Score posting, equipment turnover, ref stipend, photo handoff |
| `end_of_day` | After final match | Facility close, cash reconcile, lost-and-found, daily digest |
| `post_day` | T+1 to T+72h | Photo publishing, rainout refunds, incident follow-ups, weekly metrics |

**Decisions:**

- **Per-match phases** (`pre_game/in_game/post_game`) repeat for each match within a day. A venue with 6 matches has 6 cycles between `day_setup` and `end_of_day`.
- **Phases are strictly ordered**, but activities within a phase are not. Activity-level sequencing lives in `sop_body`.
- **No nested sub-phases** — that's structured SOP content, not a model concept.
- **Multi-day events** (weekend tournaments) are N independent `pre_day → post_day` cycles. Cross-day continuity (carrying standings forward) is an artifact-layer concern, not a phase concern.

---

## 6. Role taxonomy

| Role ID | Tier | Accountability scope | Manual location |
|---|---|---|---|
| `role.director` | Leadership | Whole business / multi-venue. Rarely day-of accountable. | Employee manual |
| `role.venue_manager` | Leadership | Single venue, single day. The on-site decision-maker. | Employee manual |
| `role.event_lead` | Operational | Per-match operational lead | Employee/contractor handbook |
| `role.front_of_house` | Operational | Check-in, parent comms, walk-ons, concessions | Employee manual |
| `role.facilities` | Operational | Field/court/equipment readiness | Employee manual |
| `role.coach` | Field-side | One team's compliance, conduct, attendance | Coach handbook |
| `role.team_captain` | Field-side | Adult-league team without a coach | Captain's guide |
| `role.ref` | Field-side | Match officiating, score authority | Contractor handbook |
| `role.photographer` | Field-side | Media capture per assignment | Contractor handbook |
| `role.parent` | Customer | Youth program guardian — receives comms, not a worker | Hand-authored family handbook (not catalog-generated) |
| `role.player` | Customer | Adult registrant / athlete-self-account — not a worker | Hand-authored player handbook (not catalog-generated) |
| `role.platform` | System | Autonomous platform actions | Automation backlog (no doc) |

**Rules:**

- One human can wear multiple role slots at small venues. Real-world mapping happens at the venue staffing layer, not the catalog.
- `role.platform` as accountable forces honesty: the corresponding `platform_features` must exist or the activity is broken.
- The 12-role set is intentional. New roles require explicit catalog-level discussion, not per-activity decisions.
- **`role.parent` and `role.player` are customers, not workers.** They appear in `informed` cells (they receive cancellation broadcasts, schedule updates, etc.) and very rarely in `responsible`. They do **not** get role manuals generated from the catalog — customer-facing documentation (family handbook, player handbook, program rules, refund policy) is hand-authored.
- If a parent or player volunteers in a worker capacity (scorekeeper, ref), they are assigned a separate worker role for that engagement.

---

## 7. Tagging + view generation

### Tag taxonomies

| Dimension | Values | Wildcards |
|---|---|---|
| `sport_tags` | `outdoor:soccer`, `outdoor:flag_football`, `outdoor:lacrosse`, `indoor:soccer`, `indoor:basketball`, `indoor:volleyball`, `indoor:pickleball` | Bare category (`outdoor`, `indoor`) = all sports in that category. Empty = all sports. |
| `venue_tags` | `outdoor`, `indoor`, `owned`, `rented`, `single_field`, `multi_field`, `concessions`, `pro_shop`, `parking_managed` | Empty = all venues. |
| `format_tags` | `league`, `tournament`, `clinic`, `drop_in`, `practice`, `private_event` | Empty = all formats. |
| `audience_tags` | `youth`, `adult`, `mixed` | Empty = applies to all audiences. Used when behavior diverges between youth and adult contexts (e.g., coach pregame briefing applies only to youth; adult leagues are self-managed). |

### Matching rule (one rule, all dimensions)

- **OR within a dimension.** `sport_tags: [outdoor:soccer, outdoor:flag_football]` matches either.
- **AND across dimensions.** Activity applies only if every populated dimension matches the event.
- **Empty dimension = no constraint** on that dimension.

### Views (the deliverables)

**Primary (always generated by the pipeline):**

1. **Runbook** — markdown checklist for one venue + one event-day. Filter: phase ordered chronologically, tags match the event. Audience: Venue Manager day-of.
2. **Role view** — one chapter per worker role. Filter: `accountable = R` ∪ `responsible includes R`. Used in employee and contractor manuals. **Customer roles (`role.parent`, `role.player`) are explicitly excluded from this generator** — their documentation is hand-authored, not catalog-generated.
3. **Automation backlog** — deduplicated list of `platform_features` with referencing activities. Audience: engineering.

**Ad-hoc (run on demand):**

- **RACI matrix CSV** — wide-format spreadsheet for audit and training.
- **Sport addendum** — sport-specific activities for sport program documentation.

**Validator (runs before any render):**

- Schema check, single-accountability check, role/feature/artifact reference resolution, smell flags.

---

## 8. Storage + tooling + lifecycle

### File layout

```
docs/operations/
├── catalog/
│   ├── activities/          # one YAML per activity; filename = <id>.yaml
│   ├── roles/               # one YAML per role
│   ├── features/            # one YAML per platform feature stub
│   └── artifacts/           # checklist/form/signature/event templates
├── artifacts/               # generated; git-tracked for PR-readability
│   ├── runbooks/{venue_id}/{event_date}.md
│   ├── manuals/{role_id}.md
│   └── automation-backlog.json
└── README.md
```

**Why one file per activity:** best diff readability, no merge conflicts, easy grep, scales to 100+ activities.

**Why git-track generated artifacts:** PRs that change the catalog show downstream effects on manuals and runbooks in the same diff. Reviewers can verify the catalog edit produces the right manual change.

### Tooling

A small CLI in `scripts/ops-catalog/` (TypeScript):

```bash
npm run catalog:validate          # validator only — for CI gating
npm run catalog:render            # validate + render all primary artifacts
npm run catalog:render -- --view runbook --venue worthington --date 2026-06-03
npm run catalog:render -- --view raci-matrix
npm run catalog:render -- --view sport-addendum --sport flag_football
```

### Lifecycle

- **Catalog owner:** Director (today); operating partner once delegated.
- **Edit channel:** PRs only. Field staff who find SOP drift file PRs with corrections. Engineering files PRs when shipping features that flip an activity from `manual` to `platform`.
- **CI gate:** validator runs on every PR; merge blocked on failure.
- **Quarterly catalog review:** Director walks activities with `last_modified > 90 days`, reviews `accountable: role.director` smells, audits automation-status drift.
- **Versioning:** git history is the audit trail. No separate `version:` field.
- **Catalog change migration (required):** Catalogs change rarely. Every catalog-modifying PR must include a migration plan in the PR description, covering:
  - **In-flight events** (already scheduled, not yet executed): are they snapshot at the old catalog or upgraded to the new? Default is snapshot — in-flight events run on the catalog version present at scheduling time.
  - **Completed events:** untouched (artifact records remain as recorded).
  - **Future scheduled events:** use the new catalog.
  - If the change is purely additive (new activity, new role, new artifact stub), the migration plan can be `migration: none — additive only`. Subtractive or modifying changes require an explicit migration path.

### Boundaries (what the catalog does NOT produce)

- **The full employee manual.** Catalog produces *chapters* (one per role). HR boilerplate (code of conduct, time-off, dress code) lives separately. A manual-assembler script (out of scope) glues them.
- **Per-person assignments.** Catalog says "Venue Manager is accountable." Assigning Sarah Johnson to the Venue Manager slot at Worthington this Saturday is venue-staffing, a separate layer.
- **Real-time per-event execution data.** Catalog defines the activity. Tracking who actually did it on a given day is the platform's job (§9).

---

## 9. Tracking + reminders

### Principle

Every activity has a system-trackable completion record and an expected completion time. If not marked complete by then, the platform pings the Responsible party first, then the Accountable owner, then escalates.

This converts the catalog from a static reference into an active operating system.

### `expected_completion` DSL

| Form | Example | Meaning |
|---|---|---|
| `T<offset>` | `T-90min`, `T+5min` | Relative to event kickoff (negative = before, positive = after) |
| `trigger<offset>` | `trigger+15min` | Relative to this activity's trigger firing |
| `phase_<edge>` | `phase_end`, `phase_start` | Bounded by the activity's phase |
| `<HH:MM>` | `21:00` | Absolute time of day |
| `T+<duration>` | `T+24h`, `T+72h` | For post-day activities |

### Default reminder + handoff ladder

Each tier is BOTH a notification AND a reassignment of responsibility. There is no "skip with reason" path — activities either complete or are handed up the chain.

| Time | Notification | New Responsible (handoff) |
|---|---|---|
| `expected - 15min` | Pre-reminder to current Responsible | (no change) |
| `expected + 15min` | Overdue alert to Responsible + Accountable | Accountable becomes Responsible-of-record |
| `expected + 60min` | Escalation alert to `escalation_path` target | `escalation_path` target becomes Responsible-of-record |
| `expected + 120min` | Final escalation to `role.director` | Director becomes Responsible-of-record |

Activities can override the timing per-record where the default doesn't fit (e.g., a rainout decision needs `pre_reminder_minutes: 60` because the call is consequential and the human needs lead time).

The handoff is recorded in the activity's per-event tracking record: `responsible_history: [(role, assigned_at, reason)]`. The dashboard always shows the current responsible, and audits can replay the handoff chain.

### Notification channels

The platform delivers reminders, alerts, and escalations via:

- **Email** (Resend) — default for all roles; richest content
- **Telegram** (existing bot) — preferred for staff and on-field workers; fast, threaded
- **SMS** (Twilio) — high-urgency only (overdue + escalation tiers); fallback when other channels haven't responded

Channel preference is configurable per person (not per role) — staff individually choose their preferred channels, with email as a guaranteed fallback. The default policy when no preference is set: email + Telegram for pre-reminders and overdue; email + Telegram + SMS for escalation tiers.

In-app push notifications are explicitly out of scope for now (no app).

### Required platform feature

```yaml
id: feat.activity_tracking_engine
description: |
  Core service that:
  - Computes expected_completion timestamps per scheduled event
  - Tracks per-event activity records (event_id × activity_id)
  - Fires pre-reminders, overdue alerts, escalations per reminder_policy
  - Surfaces overdue dashboard for Venue Manager + Director
priority: P0  # nothing else in the system works without this
```

This is the load-bearing feature that makes the catalog real.

---

## 10. Structured tracking artifacts

`tracking_artifact` is a discriminated union keyed on `tracking_method`. Free-text descriptions are disallowed.

```yaml
# tracking_method: checklist
tracking_artifact:
  template_id: chk.facility_close

# tracking_method: form
tracking_artifact:
  template_id: frm.incident_report

# tracking_method: signature
tracking_artifact:
  template_id: sig.ref_score_attestation
  required_role: role.ref

# tracking_method: photo_upload
tracking_artifact:
  media_kind: field_condition_pregame
  min_count: 1

# tracking_method: counter_increment
tracking_artifact:
  counter: walk_on_registrations
  min_count: 0  # 0 = "any count is valid completion"

# tracking_method: system_event
tracking_artifact:
  event_type: evt.cancellation_broadcast_sent

# tracking_method: external_acknowledgment
tracking_artifact:
  external_system: stripe | telegram | resend | quo
  record_kind: payout_receipt | broadcast_delivery | etc.
```

### Artifact templates as catalog files

Reusable templates live in `docs/operations/catalog/artifacts/`:

```yaml
# chk.facility_close.yaml
id: chk.facility_close
kind: checklist
status: stub | implemented
items:
  - id: exits_locked
    label: All exits locked
  - id: lights_out
    label: Lights out
  - id: alarm_armed
    label: Alarm armed
  - id: hvac_setpoint
    label: HVAC at overnight setpoint
```

```yaml
# frm.incident_report.yaml
id: frm.incident_report
kind: form
status: implemented
fields:
  - id: incident_type
    label: Type of incident
    type: enum
    options: [injury, behavior, ejection, equipment_failure, other]
    required: true
  - id: persons_involved
    type: text
    required: true
  - id: narrative
    type: long_text
    required: true
  - id: actions_taken
    type: long_text
    required: true
  - id: follow_up_required
    type: boolean
```

### Stub vs implemented

- `status: stub` — exists in the catalog so references resolve, but the platform doesn't implement it yet. Renders as "*(pending implementation)*" in role manuals. Visible in the automation backlog as outstanding work.
- `status: implemented` — platform actually produces this artifact when humans/system act.

---

## 11. Comprehensive seed catalog

The initial catalog is comprehensive across game-day operations — every meaningful unit of accountability. Future workflows (registration, coach onboarding, etc.) will get their own catalogs and live in sibling directories.

Activity grain rule: if an activity is too small to have its own tracked completion event, it's a sub-task and belongs in `sop_body`. "Pick up the trash bag" = sub-task. "Facility close" = activity (one tracked event with a checklist of sub-tasks inside).

### `pre_day` (T-72h to T-12h) — 8 activities

| ID | Accountable | Tracking | Automation | Tags |
|---|---|---|---|---|
| `act.attendance_roster_confirm` | `platform` | `system_event` | `platform` | — |
| `act.ref_assignment_confirm` | `event_lead` | `checklist` | `hybrid` | — |
| `act.weather_pre_check` | `venue_manager` | `checklist` | `hybrid` | venue:outdoor |
| `act.equipment_inventory_check` | `facilities` | `checklist` | `manual` | — |
| `act.parent_t24_reminder` | `platform` | `system_event` | `platform` | — |
| `act.coach_pregame_briefing_dispatch` | `platform` | `system_event` | `platform` | — |
| `act.field_assignment_publish` | `platform` | `system_event` | `platform` | — |
| `act.staff_schedule_confirm` | `venue_manager` | `checklist` | `hybrid` | — |

### `day_setup` (T-12h to T-2h) — 9 activities

| ID | Accountable | Tracking | Automation | Tags |
|---|---|---|---|---|
| `act.facility_unlock` | `venue_manager` | `checklist` | `manual` | — |
| `act.opening_walkthrough` | `venue_manager` | `form` | `manual` | — |
| `act.equipment_staging` | `facilities` | `checklist` | `manual` | — |
| `act.signage_setup` | `facilities` | `photo_upload` | `manual` | — |
| `act.concession_setup` | `front_of_house` | `checklist` | `manual` | venue:concessions |
| `act.concession_inventory_count` | `front_of_house` | `form` | `manual` | venue:concessions |
| `act.preshift_staff_briefing` | `venue_manager` | `signature` | `manual` | — |
| `act.first_aid_kit_check` | `venue_manager` | `checklist` | `manual` | — |
| `act.parking_setup` | `facilities` | `checklist` | `manual` | venue:parking_managed |

### `pre_game` (T-2h to T-0, per match) — 11 activities

| ID | Accountable | Tracking | Automation | Tags |
|---|---|---|---|---|
| `act.field_court_setup` | `facilities` | `photo_upload` | `manual` | — |
| `act.flag_field_line_check` | `facilities` | `photo_upload` | `manual` | sport:outdoor:flag_football |
| `act.ref_check_in` | `event_lead` | `signature` | `hybrid` | — |
| `act.photographer_check_in` | `photographer` | `signature` | `hybrid` | — |
| `act.team_check_in` | `event_lead` | `form` | `hybrid` | — |
| `act.coach_pregame_briefing` | `event_lead` | `signature` | `manual` | format:league, audience:youth |
| `act.walk_on_registration` | `front_of_house` | `counter_increment` | `hybrid` | format:drop_in,clinic |
| `act.weather_check_pregame` | `venue_manager` | `checklist` | `hybrid` | venue:outdoor |
| `act.rainout_decision` | `venue_manager` | `form` | `hybrid` | venue:outdoor |
| `act.cancellation_broadcast` | `platform` | `system_event` | `platform` | — |
| `act.field_condition_photo` | `venue_manager` | `photo_upload` | `manual` | — |

> **Adult leagues are self-managed.** No captain or coach pregame briefing — adult teams handle their own pre-match coordination. The youth coach pregame briefing is the only audience-tagged activity in the seed.

### `in_game` (per match) — 6 activities

| ID | Accountable | Tracking | Automation | Tags |
|---|---|---|---|---|
| `act.timekeeping` | `ref` | `system_event` | `hybrid` | — |
| `act.live_score_update` | `ref` | `counter_increment` | `hybrid` | — |
| `act.score_reporting_final` | `ref` | `signature` | `hybrid` | — |
| `act.incident_response` | `venue_manager` | `form` | `manual` | — |
| `act.code_of_conduct_enforcement` | `event_lead` | `form` | `manual` | — |
| `act.spectator_management` | `front_of_house` | `form` | `manual` | — |

> **Note on `act.incident_response` vs `act.incident_report_finalization`:** the in-game activity captures what was done in the moment (apply first aid, eject, call 911) via a quick form. The post-game finalization fills out the full structured report. Distinct artifacts (`frm.incident_response` vs `frm.incident_report_full`).

### `post_game` (T+0 to ~T+30min, per match) — 8 activities

| ID | Accountable | Tracking | Automation | Tags |
|---|---|---|---|---|
| `act.score_post_to_standings` | `platform` | `system_event` | `platform` | — |
| `act.equipment_turnover` | `facilities` | `checklist` | `manual` | — |
| `act.field_reset_between_matches` | `facilities` | `checklist` | `manual` | — |
| `act.ref_stipend_log` | `event_lead` | `form` | `hybrid` | — |
| `act.photo_handoff` | `photographer` | `counter_increment` | `hybrid` | — |
| `act.incident_report_finalization` | `venue_manager` | `form` | `manual` | — |
| `act.field_damage_report` | `facilities` | `form` | `manual` | venue:owned |
| `act.ejection_logging` | `ref` | `form` | `manual` | — |

### `end_of_day` — 9 activities

| ID | Accountable | Tracking | Automation | Tags |
|---|---|---|---|---|
| `act.facility_close_walkthrough` | `venue_manager` | `checklist` | `manual` | — |
| `act.facility_lock_alarm` | `venue_manager` | `checklist` | `manual` | venue:owned |
| `act.cash_concession_reconcile` | `front_of_house` | `form` | `hybrid` | venue:concessions |
| `act.lost_and_found_inventory` | `front_of_house` | `form` | `manual` | — |
| `act.daily_digest_send` | `platform` | `system_event` | `platform` | — |
| `act.staff_debrief` | `venue_manager` | `form` | `manual` | — |
| `act.staff_clock_out` | `venue_manager` | `signature` | `hybrid` | — |
| `act.equipment_storage` | `facilities` | `checklist` | `manual` | — |
| `act.trash_disposal` | `facilities` | `checklist` | `manual` | venue:owned |

### `post_day` (T+1 to T+72h) — 9 activities

| ID | Accountable | Tracking | Automation | Tags |
|---|---|---|---|---|
| `act.photo_publish` | `photographer` | `counter_increment` | `hybrid` | — |
| `act.rainout_refund_decision` | `director` | `form` | `hybrid` | venue:outdoor |
| `act.rainout_reschedule` | `director` | `form` | `hybrid` | venue:outdoor |
| `act.incident_followup` | `venue_manager` | `form` | `manual` | — |
| `act.weekly_metrics_rollup` | `platform` | `system_event` | `platform` | — |
| `act.standings_update` | `platform` | `system_event` | `platform` | — |
| `act.staff_payroll_event` | `platform` | `external_acknowledgment` | `platform` | — |
| `act.ref_payroll_event` | `platform` | `external_acknowledgment` | `platform` | — |
| `act.weekly_safety_review` | `director` | `form` | `manual` | — |

**Total: 60 activities across 7 phases.**

### Coverage validation

- **All 7 phases populated** ✓
- **All non-customer roles as `accountable` at least once:** venue_manager (16), event_lead (6), facilities (11), front_of_house (6), ref (4), photographer (3), platform (11), director (3). Sums to 60 ✓
- **Automation mix:** 11 platform, 18 hybrid, 31 manual — demonstrating realistic distribution where most activities still need humans ✓
- **Sport-specific activities:** 1 (`flag_field_line_check`) — exercises sport tag filter ✓
- **Venue-conditional activities:** 6 (concessions ×2, parking_managed ×1, owned ×3) — exercises venue tag AND-across-dimensions ✓
- **Format-conditional activities:** 2 (coach pregame briefing × league, drop-in walk-on) ✓
- **Audience-conditional activities:** 1 (`coach_pregame_briefing` × youth) — exercises audience tag ✓
- **`accountable: role.director` instances:** 3, all in `post_day` (refund/reschedule/safety review) — does not trigger smell flag ✓

---

## 12. Artifact templates needed

The catalog references the following artifact templates. Each becomes a stub file in `docs/operations/catalog/artifacts/` and a corresponding implementation ticket in the platform backlog.

**Checklists (16):** `chk.ref_assignment_confirm`, `chk.weather_pre_check`, `chk.equipment_inventory`, `chk.staff_schedule_confirm`, `chk.facility_unlock`, `chk.equipment_staging`, `chk.concession_setup`, `chk.first_aid`, `chk.parking_setup`, `chk.weather_pregame`, `chk.equipment_turnover`, `chk.field_reset`, `chk.facility_close_walkthrough`, `chk.facility_lock_alarm`, `chk.equipment_storage`, `chk.trash_disposal`.

**Forms (18):** `frm.opening_walkthrough_findings`, `frm.concession_inventory`, `frm.team_check_in`, `frm.rainout_decision`, `frm.incident_response`, `frm.code_of_conduct_event`, `frm.spectator_complaint`, `frm.ref_stipend_log`, `frm.incident_report_full`, `frm.field_damage_report`, `frm.ejection_log`, `frm.cash_reconcile`, `frm.lost_and_found_inventory`, `frm.staff_debrief`, `frm.rainout_refund`, `frm.rainout_reschedule`, `frm.incident_followup`, `frm.weekly_safety_review`.

**Signatures (6):** `sig.staff_briefing_signin`, `sig.ref_check_in`, `sig.photographer_check_in`, `sig.coach_pregame`, `sig.ref_score_attestation`, `sig.staff_clock_out`.

**System events (10):** `evt.attendance_broadcast_sent`, `evt.t24h_reminder_sent`, `evt.coach_pregame_dispatch`, `evt.field_assignment_published`, `evt.cancellation_broadcast_sent`, `evt.timekeeping_clock`, `evt.score_posted`, `evt.standings_updated`, `evt.daily_digest_sent`, `evt.weekly_metrics_run`.

**Counters (4):** `counter.live_scores`, `counter.walk_on_registrations`, `counter.photos_uploaded`, `counter.photos_published`.

**Photo-upload media kinds (4):** `signage_setup`, `field_setup`, `flag_lines`, `field_condition_pregame`.

**External acknowledgments (2):** W2 payroll receipt, 1099 ref stipend payout receipt.

**Total: 60 artifact templates referenced.** Each requires a stub file in the catalog and an implementation ticket. Stubs without implementation render as "*(pending implementation)*" in role manuals until the platform feature ships.

---

## 13. Platform features needed

The following platform features are referenced by the catalog. Each gets a stub file in `docs/operations/catalog/features/` and becomes part of the engineering backlog.

| Feature ID | Priority | Description |
|---|---|---|
| `feat.activity_tracking_engine` | P0 | Per-event activity records, expected_completion computation, reminder/escalation firing, overdue dashboard |
| `feat.weather_alert_dashboard` | P1 | Weather forecast surfaced in admin for pre-day and pregame checks |
| `feat.cancellation_broadcast` | P1 | One-call cancellation cascading to team Telegram + parent SMS + email |
| `feat.team_checkin_panel` | P1 | Per-match roster/jersey/eligibility verification UI |
| `feat.ref_checkin_signature` | P1 | Ref signs in via QR code at venue; logs arrival timestamp |
| `feat.live_score_entry` | P1 | Ref enters scores in real-time from a phone interface |
| `feat.score_attestation` | P1 | Both teams' captains/coaches sign the final score before standings update |
| `feat.standings_engine` | P0 | Computes standings from posted scores, handles ties, playoff seeding |
| `feat.rainout_decision_form` | P2 | Structured rainout decision with reason codes feeding refund/reschedule |
| `feat.daily_digest_generator` | P1 | Per-venue end-of-day summary to Director and Venue Manager |
| `feat.weekly_metrics_run` | P2 | Cross-venue weekly roll-up: attendance, incidents, payroll, revenue |
| `feat.payroll_integration` | P1 | W2 + 1099 stipend payouts triggered by post_day events |
| `feat.media_tagger_handoff` | P1 | Connects post_game photo_handoff to existing media phase 2 tagger |
| `feat.checklist_renderer` | P0 | Generic checklist UI used by all `chk.*` artifact templates |
| `feat.form_renderer` | P0 | Generic form UI used by all `frm.*` artifact templates |
| `feat.signature_capture` | P0 | Generic signature UI for `sig.*` artifact templates |
| `feat.photo_upload_capture` | P1 | Generic photo upload tied to activity completion |
| `feat.counter_service` | P0 | Generic counter increments for `counter.*` artifacts |
| `feat.external_ack_listener` | P1 | Webhook receivers for Stripe/Telegram/Resend/Quo to satisfy `external_acknowledgment` |

---

## 14. Out of scope (for this spec)

The following are real operational concerns, but they need their own operating models — folding them in would balloon this spec and dilute the design:

- **Registration workflow** (parent signs up child → payment → roster placement)
- **Coach onboarding** (background check, waiver, training, comms group setup)
- **Season setup** (calendar, age groups, pricing, capacity, schedule generation)
- **Indoor facility scheduling** (court block sales, drop-in, leagues, tournaments, pro-shop, concessions) — different operational model from event-day; will plug into this catalog at the event-execution layer but adds non-game-day workflows
- **Procurement + kit distribution**
- **Financial close** (Stripe reconciliation, payroll, expense categorization, weekly P&L)
- **Per-person staff assignments** (which human fills which role at which venue on which day)
- **Vendor + partnership management**

Each of these will get its own catalog (`docs/operations/catalogs/<workflow>/`) using the same schema and tooling defined here. The activity-catalog model is reusable across all of them.

---

## 15. Resolved questions (from initial review)

1. **Reminder delivery channels** → email (Resend), Telegram (existing bot), SMS (Twilio). No in-app push. Per-person preferences with email as guaranteed fallback. Folded into §9.
2. **Multi-event-per-day tracking** → confirmed required. Per-match instances tracked separately by `(event_id, match_id, activity_id)`. Folded into platform feature `feat.activity_tracking_engine` in §13.
3. **Activity completion override** → rejected. **Handoff, not skip.** When the Responsible doesn't show, the higher tier (Accountable, then escalation_path target, then Director) takes over the task itself, not just notifications. Tracked in `responsible_history` per event. Folded into §9 as the reminder + handoff ladder.
4. **Catalog change → live-event impact** → in-flight events snapshot at scheduling time and run on the catalog version present then. Every catalog-modifying PR must include an explicit migration plan (or `migration: none — additive only` for purely additive changes). Folded into §8 lifecycle.
5. **Customer-role manuals (parent/player)** → not generated. Parents and players are customers, not workers. Customer-facing documentation is hand-authored. Folded into §6 roles and §7 view generation.
6. **Age/audience tagging** → resolved by adding `audience_tags` dimension (`youth`, `adult`, `mixed`) to §7. Adult leagues are self-managed; the only seed activity using this is `coach_pregame_briefing` (youth-only). The original `act.captain_pregame_briefing` was dropped entirely — adult teams self-manage pre-match coordination.

---

## 16. Implementation handoff

Once this spec is approved:

1. **Phase 1: Catalog infrastructure** — schema validators, artifact directory layout, CLI tool (`scripts/ops-catalog/`), CI gating. No platform integration yet.
2. **Phase 2: Catalog content** — write the 62 activity records, 12 role definitions, ~55 artifact stubs, 19 feature stubs into the catalog. Generate the first runbooks and role manuals.
3. **Phase 3: Tracking engine MVP** — `feat.activity_tracking_engine` core: per-event records, expected_completion, basic overdue alerts. Wire to existing Telegram/SMS/email infrastructure.
4. **Phase 4: Artifact renderers** — `feat.checklist_renderer`, `feat.form_renderer`, `feat.signature_capture`, `feat.counter_service`. Implement the highest-priority artifact templates.
5. **Phase 5+: Per-feature implementation** — each P1/P2 feature ships independently, flipping its associated activities from `manual`/`hybrid` toward `platform`.

The detailed plan for these phases will be produced by the writing-plans skill once this spec is approved.
