# Activity Tracking Engine — Spec Coverage Report

Walks through `docs/superpowers/specs/2026-05-06-activity-tracking-engine-design.md` sections §4–§11 and points each load-bearing requirement at its implementation file/test, or marks it as intentionally deferred.

Generated 2026-05-06 at the close of Phase G of `docs/superpowers/plans/2026-05-06-activity-tracking-engine.md`.

## §4. Schema additions

| Requirement | Status | Pointer |
|---|---|---|
| `activity_completion_status` enum (6 values) | implemented | `src/lib/db/schema/activity-tracking.ts:8-15` |
| `activity_completions` table + indexes (`due_idx`, `game_idx`, unique on `(game_id, activity_id)`) | implemented | `src/lib/db/schema/activity-tracking.ts:17-47` |
| `checklist_submissions`, `form_submissions`, `signature_submissions` | implemented | `src/lib/db/schema/activity-tracking.ts:49-87` |
| `venues.owned`, `venues.concessions`, `venues.parking_managed` | implemented | `src/lib/db/schema/teams.ts` (venues table) |
| `venue_role_assignments` + active/lookup indexes | implemented | `src/lib/db/schema/activity-tracking.ts:89-123` |
| Drizzle migration | implemented | `src/lib/db/migrations/0023_overjoyed_toad.sql` |
| Evidence FKs nullable (only one set per row, per activity method) | implemented | columns are nullable; submit endpoint sets exactly one (see §5/§8) |

## §5. Bootstrap + lifecycle

| Requirement | Status | Pointer |
|---|---|---|
| `bootstrapActivityCompletions(gameId)` seeds rows on game INSERT | implemented | `src/lib/activity-tracking/bootstrap.ts` |
| Wire bootstrap into game-creation endpoint | implemented | `src/pages/api/admin/games.ts:257` (fire-and-forget on POST) |
| Tag context derivation (`sport_tags`, `venue_tags`, `format_tags`, `audience_tags`) | implemented | `src/lib/activity-tracking/derive-tag-context.ts` |
| Tag filter `filterActivitiesByContext` shared with catalog generators | implemented | `src/lib/activity-tracking/filter.ts` (single source) |
| `computeExpectedAt` DSL parser — `T±Nmin/h`, `phase_start/end`, `HH:MM`, `trigger+Nmin` | implemented | `src/lib/activity-tracking/dsl.ts` (with `trigger+Nmin` left as deferred-bootstrap per §10) |
| Phase heuristics (pre_day, day_setup, pre_game, in_game, post_game, end_of_day, post_day) | implemented | `src/lib/activity-tracking/dsl.ts` (`phase` switch) |
| `rescheduleActivityCompletions(gameId)` recomputes `expected_at`, demotes overdue→pending, clears `reminders_fired` | implemented | `src/lib/activity-tracking/lifecycle.ts:31-92` |
| `cancelActivityCompletions(gameId)` flips actionable rows to canceled | implemented | `src/lib/activity-tracking/lifecycle.ts:94-111` |
| Wire reschedule + cancel into game update endpoint | implemented | `src/pages/api/admin/games.ts:418, 427` |
| Already-completed rows preserved on reschedule + cancel | implemented + tested | `tests/api/activity-tracking/reschedule.test.ts:72`, `tests/api/activity-tracking/cancel.test.ts`, `tests/api/activity-tracking/full-flow.test.ts` |
| Bootstrap unit tests (sample game + catalog) | implemented | `tests/api/activity-tracking/bootstrap.test.ts`, `tests/unit/activity-tracking/filter.test.ts` |
| DSL parser exhaustive unit tests | implemented | `tests/unit/activity-tracking/dsl.test.ts` |

## §6. Cron tick + reminder/handoff dispatch

| Requirement | Status | Pointer |
|---|---|---|
| Netlify Scheduled Function (`*/5 * * * *`) | implemented | `netlify/functions/scheduled-activity-tracker-tick.ts` |
| Manual cron endpoint with `x-cron-secret` | implemented | `src/pages/api/cron/tick-activity-tracker.ts` |
| `runActivityTrackerTick` orchestrator | implemented | `src/lib/activity-tracking/tick.ts` |
| Stage computation (`pre_reminder` / `overdue_alert` / `escalation` / `final_escalation`) | implemented | `src/lib/activity-tracking/stage.ts` |
| Stage de-dup via `reminders_fired` log | implemented | `src/lib/activity-tracking/tick.ts` (skips if stage already fired) |
| First-overdue status flip (`pending → overdue`) | implemented | `src/lib/activity-tracking/tick.ts` |
| Handoff (`applyHandoff`) — Accountable takeover, escalation parsing, final → director | implemented | `src/lib/activity-tracking/handoff.ts` |
| `parseEscalationTarget` heuristic with venue_manager/director fallback | implemented | `src/lib/activity-tracking/handoff.ts` |
| `responsible_history` append on every handoff | implemented | `src/lib/activity-tracking/handoff.ts` |
| `dispatchReminders` per-stage send | implemented | `src/lib/activity-tracking/dispatch.ts` |
| `resolveRecipientUsers` per-stage (Accountable, Responsible CC, escalation, director) | implemented | `src/lib/activity-tracking/resolve-recipients.ts` |
| Org-wide fallback for empty venue role | implemented | `src/lib/activity-tracking/resolve-recipients.ts` |
| `workerChannelsConfigured` (email/telegram/sms by user-attached IDs) | implemented + tested | `src/lib/activity-tracking/dispatch.ts`, `tests/unit/activity-tracking/channel-select.test.ts` |
| SMS `bypassOptInCheck: true` for workers | implemented | `src/lib/activity-tracking/dispatch.ts` |
| Stage computation unit tests | implemented | `tests/unit/activity-tracking/stage.test.ts` |
| Handoff unit tests | implemented | `tests/unit/activity-tracking/handoff.test.ts` |
| Recipient resolution integration test | implemented | `tests/api/activity-tracking/resolve-recipients.test.ts` |
| Tick orchestrator integration test | implemented | `tests/api/activity-tracking/tick.test.ts`, `tests/api/activity-tracking/tick-endpoint.test.ts` |

## §7. Message templates

| Requirement | Status | Pointer |
|---|---|---|
| `pre_reminder` render module (sms/email/telegram variants) | implemented | `src/lib/activity-tracking/messages/pre-reminder.ts` |
| `overdue_alert` render module | implemented | `src/lib/activity-tracking/messages/overdue-alert.ts` |
| `escalation` render module | implemented | `src/lib/activity-tracking/messages/escalation.ts` |
| `final_escalation` render module | implemented | `src/lib/activity-tracking/messages/final-escalation.ts` |
| MessageVariants type (sms body / email subject+html+text / telegram HTML body) | implemented | `src/lib/activity-tracking/messages/types.ts` |
| Editorial email layout reuse | partial — current templates emit plain HTML; the editorial layout migration is tracked separately under `project_email_resend_setup` (0/8 transactional templates currently use editorial layout) | follow-up: editorial layout sweep |
| Template render unit tests | implemented (subset) | `tests/unit/activity-tracking/messages/escalation.test.ts` (one-stage smoke; per-stage exhaustive tests deferred — render functions are pure, regression risk low) |
| Per-org overrides | deferred | spec §12 |
| Localization | deferred | spec §12 |

## §8. Artifact submission UIs

| Requirement | Status | Pointer |
|---|---|---|
| `GET /admin/activity-completions/<id>` page shell | implemented | `src/pages/admin/activity-completions/[id].astro` |
| `POST /api/admin/activity-completions/<id>/submit` (single endpoint, branches on tracking_method) | implemented | `src/pages/api/admin/activity-completions/[id]/submit.ts` |
| `POST .../cancel` (admin marks one completion canceled) | implemented | `src/pages/api/admin/activity-completions/[id]/cancel.ts` |
| `POST .../reassign` (admin manual reassign) | implemented | `src/pages/api/admin/activity-completions/[id]/reassign.ts` |
| Renderer dispatch React page (branches by tracking_method) | implemented | `src/components/admin/activity-completions/page.tsx` |
| ChecklistRenderer (template load, items checkboxes, optional notes, validation) | implemented + tested | `src/components/admin/activity-completions/checklist-renderer.tsx`, `tests/api/activity-tracking/submit-checklist.test.ts` |
| FormRenderer (text/long_text/enum/boolean/number/date) | implemented + tested | `src/components/admin/activity-completions/form-renderer.tsx`, `tests/api/activity-tracking/submit-form.test.ts` |
| SignatureRenderer (typed name, role check) | implemented + tested | `src/components/admin/activity-completions/signature-renderer.tsx`, `tests/api/activity-tracking/submit-signature.test.ts` |
| **PhotoUploadRenderer (real media-pick UI, fresh upload, kind tagging)** | **stub** — renders a bare media_id input + `mark out-of-band` admin override; the spec'd "list existing media tagged with `media_kind` for this game/venue" UX requires `media_assets.gameId` and `media_assets.kind` columns that don't exist yet (see plan errata #3) | `src/components/admin/activity-completions/photo-upload-renderer.tsx`, `src/pages/api/admin/activity-completions/[id]/mark-photo-out-of-band.ts` (override path); follow-up: add `gameId`/`kind` columns to `media_assets` and rebuild the renderer |
| CounterReadback (read-only counter source display) | implemented | `src/components/admin/activity-completions/counter-readback.tsx` |
| SystemEventReadback / ExternalAckReadback | implemented | `src/components/admin/activity-completions/system-event-readback.tsx`, `external-ack-readback.tsx` |
| Counter auto-complete worker (in tick) | implemented + tested | `src/lib/activity-tracking/counter-autocomplete.ts`, `tests/api/activity-tracking/counter-autocomplete.test.ts` |
| Counter source adapter map (walk_on_registrations, live_scores, photos_uploaded, photos_published) | partial — `walk_on_registrations` and `live_scores` adapter shapes wired; `photos_uploaded` / `photos_published` cannot resolve until `media_assets.gameId`/`media_assets.kind` exist | `src/lib/activity-tracking/counter-autocomplete.ts`; follow-up tied to media schema work |
| `markCompleteBySystemEvent(gameId, eventType)` helper | implemented + tested | `src/lib/activity-tracking/mark-complete.ts:37`, `tests/api/activity-tracking/system-event-completion.test.ts` |
| Wire system-event helper into broadcast cancellation | implemented | `src/lib/messaging/notifications.ts:229` (calls on `evt.cancellation_broadcast_sent`) |
| `markCompleteByExternalAck` | deferred | spec §8.6: payroll-related activities only; defers to Plan 4 (payroll integration). Current behavior: rows sit pending and escalate, which is the spec'd UX for missing payroll integration |

## §9. Dashboard

| Requirement | Status | Pointer |
|---|---|---|
| `src/pages/admin/game-day/today.astro` shell with `<ActivityTrackingDashboard client:load />` | implemented | `src/pages/admin/game-day/today.astro` |
| Default view: today's pending/in_progress/overdue completions sorted by expected_at | implemented | `src/pages/api/admin/activity-completions/today.ts`, `src/components/admin/game-day/activity-tracking-dashboard.tsx` |
| Status / activity / game / expected / responsible / actions row layout | implemented | `src/components/admin/game-day/activity-tracking-dashboard.tsx` |
| Filters (date range, venue, phase, status, role, activity search) | implemented | `src/components/admin/game-day/activity-tracking-dashboard.tsx` |
| Tabs: by-time + by-phase | implemented | `src/components/admin/game-day/activity-tracking-dashboard.tsx` |
| Per-row actions (Open, Reassign, Mark canceled) | implemented | dashboard component links to `/admin/activity-completions/<id>` and the cancel/reassign endpoints |
| Mobile cards layout below md breakpoint | implemented | dashboard component uses Tailwind responsive grid + drawer for filters |
| Per-org tenant scoping via `requireOrganizationContext` | implemented | `src/pages/api/admin/activity-completions/today.ts` (and all submit/cancel/reassign endpoints) — validates `completion.organizationId === orgContext.organizationId` |
| Today endpoint integration test | implemented | `tests/api/activity-tracking/today-endpoint.test.ts` |

## §10. Edge cases + idempotency

| Requirement | Status | Pointer |
|---|---|---|
| §10.1 Cron tick re-runs idempotent (per-stage de-dup via `reminders_fired`) | implemented | `src/lib/activity-tracking/tick.ts` |
| §10.2 Concurrent submissions — second submit returns 409 (status-conditional UPDATE) | implemented + tested | `src/pages/api/admin/activity-completions/[id]/submit.ts:158-179`, `tests/api/activity-tracking/submit-checklist.test.ts` |
| §10.3 Per-channel dispatch failure logged in `reminders_fired` with `delivery_status: 'failed'`, no fall-through | implemented | `src/lib/activity-tracking/dispatch.ts` |
| §10.4 Per-completion try-catch in tick, one row's failure doesn't kill the tick | implemented | `src/lib/activity-tracking/tick.ts` |
| §10.5 Catalog out-of-sync — completion's `activity_id` doesn't resolve, log warning + skip | implemented | `src/lib/activity-tracking/tick.ts` (skip-with-log when `getActivityFromCatalog` returns undefined) |
| §10.6 Backfill (game in past) — bootstrap creates rows with `expected_at < now`; tick treats as overdue immediately | implemented | flows naturally from bootstrap + tick logic; no special branch needed |
| §10.7 Missing role assignments → zero recipients → unreachable-recipient warning | implemented | `src/lib/activity-tracking/resolve-recipients.ts` (logs + returns empty) |
| §10.8 Catalog schema migration policy (additive no-op, subtractive leaves dangling rows handled by §10.5, field-level requires migration plan) | documented in spec; in-flight games keep existing completions; auto-rebootstrap deferred per §12 | follow-up plan needed if a field-level catalog migration ships |

## §11. Testing

| Requirement | Status | Pointer |
|---|---|---|
| §11.1 DSL parser unit tests (forms × edge cases × tz/DST) | implemented | `tests/unit/activity-tracking/dsl.test.ts` |
| §11.1 Tag matching unit tests | implemented | `tests/unit/activity-tracking/filter.test.ts`, `tests/unit/activity-tracking/derive-tag-context.test.ts` |
| §11.1 Stage computation unit tests | implemented | `tests/unit/activity-tracking/stage.test.ts` |
| §11.1 Worker channel selection | implemented | `tests/unit/activity-tracking/channel-select.test.ts` |
| §11.1 Bootstrap activity selection unit test | implemented | `tests/api/activity-tracking/bootstrap.test.ts` (DB-backed; pure-data subset covered by `filter.test.ts`) |
| §11.1 Counter auto-complete unit test | implemented | `tests/api/activity-tracking/counter-autocomplete.test.ts` |
| §11.1 Catalog cache unit test | implemented | `tests/unit/activity-tracking/catalog-cache.test.ts` |
| §11.1 Handoff unit test | implemented | `tests/unit/activity-tracking/handoff.test.ts` |
| §11.2 Schedule game → assert N completions | implemented | `tests/api/activity-tracking/bootstrap.test.ts` |
| §11.2 Reschedule a game → expected_at recomputed | implemented | `tests/api/activity-tracking/reschedule.test.ts` |
| §11.2 Cancel a game → pending canceled, completed preserved | implemented | `tests/api/activity-tracking/cancel.test.ts` |
| §11.2 Submit checklist → 200, completed, evidence row | implemented | `tests/api/activity-tracking/submit-checklist.test.ts` |
| §11.2 Submit checklist twice → 409 | implemented | `tests/api/activity-tracking/submit-checklist.test.ts` |
| §11.2 Submit form with missing required field → 400 | implemented | `tests/api/activity-tracking/submit-form.test.ts` (basic 400 cases; full required-field matrix TBD with real `frm.<id>` content) |
| §11.2 Submit signature with wrong-role user → 403 | partial — endpoint validates typed_name length and signed_role; the spec'd "verify signing user holds required_role at venue" check is `TODO` per `submit.ts:127-130`, contingent on Phase F venue-role admin UI being wired into the submit path | follow-up |
| §11.2 Counter phase-end completes via cron tick | implemented | `tests/api/activity-tracking/counter-autocomplete.test.ts` |
| §11.2 Manual cron endpoint with valid + invalid secret | implemented | `tests/api/activity-tracking/tick-endpoint.test.ts` |
| §11.2 Full-flow integration test (bootstrap → reschedule → submit → cancel) | implemented | `tests/api/activity-tracking/full-flow.test.ts` (Phase G Task 31) |
| §11.3 Playwright E2E tests | deferred | spec §11.3 calls them out as defer-able until UI stabilizes; plan §G also defers them |
| §11.4 Test data helpers (`tests/utils/activity-tracking-helpers.ts`) | implemented | `tests/utils/activity-tracking-helpers.ts` (library-direct), `tests/utils/admin-org-game-context.ts` (HTTP-driven) |

---

## Gaps that didn't get implemented

These are NOT intentionally deferred — they're spec items that the implementation didn't fully meet. None block the engine from operating end-to-end on a game with checklist/form/signature/counter/system_event activities, but each is a real coverage gap worth a follow-up.

1. **Signature submit role check (§11.2 / §8.3)** — `submit.ts:127-130` has a `TODO` comment to verify the signing user currently holds the activity's `required_role` at the venue via `venue_role_assignments`. Today the endpoint accepts a typed name from any admin and writes `signed_role` from the template without verifying. The 403-on-wrong-role test in §11.2 is therefore not yet wirable. Phase F shipped the venue-role admin UI but didn't wire it into the submit path. Follow-up: small PR to import `venue_role_assignments` lookup into the signature branch of `submit.ts` and add the matching test.

2. **PhotoUploadRenderer is a stub (§8.3)** — the spec calls for "renders any existing media tagged with the activity's `media_kind` for this game/venue, plus an upload-new affordance." The current renderer accepts a raw `media_id` string; there's an admin override (`mark-photo-out-of-band.ts`) for unblocking flows. Real implementation requires `media_assets.gameId` and `media_assets.kind` columns (plan errata #3 calls this out). Follow-up: schema PR adding those columns + renderer rebuild.

3. **`counter.photos_uploaded` / `counter.photos_published` adapters (§8.4)** — same root cause as #2. The adapter map references `media.gameId` and `media.kind` which don't exist on `media_assets`. The other counters (`walk_on_registrations`, `live_scores`) are wired. Follow-up bundled with #2.

4. **Per-stage exhaustive message render tests (§7)** — only `escalation.test.ts` exists. The render functions are pure with no DB or network dependency, so smoke coverage is acceptable for MVP, but full-stage matrix (each render × each channel × edge cases like role-name fallback, missing recipient name) is light. Follow-up: tests/unit/activity-tracking/messages/{pre-reminder,overdue-alert,final-escalation}.test.ts.

5. **Editorial email layout migration (§7)** — message templates emit plain HTML. `project_email_resend_setup` memory says 0/8 transactional templates use the editorial layout on main. The activity-tracking emails should adopt the layout when it lands. Follow-up tracked in the email-templates effort, not this plan.

## Intentionally deferred (per spec §12 + plan tail)

- E2E Playwright tests for the renderer pages and dashboard (§11.3, plan §G) — defer until UI stabilizes
- Real artifact content (real `chk.<id>` items, real `frm.<id>` field schemas, real `sig.<id>` prompts) — operator authorship, ongoing follow-up PRs
- Real SOP body content — operator authorship, ongoing follow-up PRs
- Catalog migration tooling (auto-rebootstrap of in-flight games on additive catalog edits)
- Per-org template overrides; localization
- Customer-facing overdue alerts (engine fires only to worker roles)
- Bulk operations on the dashboard (multi-select cancel/reassign)
- Historical analytics (overdue rate trends, MTC by activity)
- Activity dependencies (`trigger+Nmin` DSL form is reserved; rows bootstrap with sentinel and cron tick computes when trigger fires — full dependency-tracking deferred)
- Per-completion comments / notes / discussion threads
- Phone notification template short-link redirect (currently uses full URL in SMS)
- `markCompleteByExternalAck` (§8.6) — payroll integration deferred to Plan 4
