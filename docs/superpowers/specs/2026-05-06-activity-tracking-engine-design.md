# Activity Tracking Engine — Design Spec

**Date:** 2026-05-06
**Status:** Draft for review
**Owner:** Director (mahad@gmail.com)
**Scope:** The runtime that turns the static activity catalog (Plan 1) into a live operating system: per-game completion records, computed expected-completion timestamps, reminder + handoff dispatch, and artifact submission UIs. This spec covers what was previously planned as Plan 2 + Plan 3 combined.

---

## 1. Problem statement

Plan 1 produced a 60-activity catalog with structured tracking metadata, but the operating model is dormant — no per-event records, no reminders, no enforcement of the handoff ladder, no UI for submitting evidence of completion. This spec fills that gap.

Concretely, the engine must:

- Create per-game activity completion records when games are scheduled (filtered by tag context)
- Recompute expected timestamps when games are rescheduled
- Cancel completion records when games are canceled
- Fire pre-reminders, overdue alerts, and escalation alerts at the right times
- Reassign responsibility up the chain (handoff, not skip) when activities go overdue
- Dispatch through every channel a worker has configured (email + Telegram + SMS)
- Provide artifact submission UIs (checklist, form, signature, photo, counter readback) so workers can record evidence of completion
- Auto-complete counter activities at phase_end based on underlying data
- Surface an overdue dashboard at `/admin/game-day/today`

The MVP must be self-contained and shippable: with the catalog in place and the engine running, a venue manager can run a real game-day with platform-tracked accountability — even before per-feature platform features (cancellation broadcast, weather dashboard, score entry, etc.) ship.

---

## 2. Operating principles (load-bearing)

Carries forward from the operating-model spec (`2026-05-06-game-day-operating-model-design.md`) and adds two engine-specific principles:

1. **Single accountability is non-negotiable.** Every activity has exactly one accountable role at any moment. Handoff transfers accountability; it doesn't dilute it.
2. **Handoff, not skip.** When the Responsible role doesn't act, the higher tier (Accountable, then escalation_path target, then Director) takes over the task — not just notifications. Per-completion `current_responsible_role` mutates as handoffs fire.
3. **Customer vs worker notification policy:** workers receive every channel they've configured at every stage. Customers (parents, players) get channel-preference filtering and opt-in respect. Tracking-engine reminders go only to workers.
4. **Live catalog read.** The engine reads the YAML catalog at runtime; no per-completion snapshots of activity metadata. Acceptable trade-off because the company isn't running yet — migration safety can be retrofitted later if needed.
5. **Auto-complete where the data already proves completion.** Counter activities (walk-on registration, live scoring, photo handoff) complete based on underlying rows — no extra human click required.

---

## 3. Approach

A live-catalog-backed runtime that:

- Co-locates the catalog loader, validator, and view generators in `src/lib/ops-catalog/` (moved from `scripts/`) so they're part of the runtime bundle
- Adds an `activity-tracking` module under `src/lib/activity-tracking/` containing pure functions for derive/compute/dispatch + thin wrappers exposed via API endpoints
- Adds new tables for per-completion records and three structured artifact submission tables
- Wires a Netlify Scheduled Function (every 5 minutes) that calls the tracker handler directly (no HTTP roundtrip) to fire reminders and handoffs
- Reuses the existing messaging gateway (`src/lib/messaging/`) for SMS / email / Telegram dispatch
- Adds five generic React renderer components that branch on `tracking_method` to produce the right submission UI
- Adds an admin dashboard at `/admin/game-day/today` following the `games-list.tsx` style

No new third-party dependencies beyond what's already in the platform (`yaml` was added in Plan 1, Drizzle migrations are standard, Netlify Scheduled Functions ship with `@netlify/functions`).

---

## 4. Schema additions

### 4.1 `activity_completions`

```sql
CREATE TYPE activity_completion_status AS ENUM (
  'pending', 'in_progress', 'overdue', 'completed', 'canceled', 'skipped_by_handoff'
);

CREATE TABLE activity_completions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  game_id                  uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  activity_id              text NOT NULL,                          -- 'act.<id>' catalog ref
  expected_at              timestamptz NOT NULL,
  status                   activity_completion_status NOT NULL DEFAULT 'pending',

  current_responsible_role text NOT NULL,                          -- 'role.<id>'
  responsible_history      jsonb NOT NULL DEFAULT '[]'::jsonb,
                                  -- [{role, assigned_at, reason}]

  completed_at             timestamptz,
  completed_by_user_id     uuid REFERENCES users(id) ON DELETE SET NULL,

  -- evidence pointers (exactly one non-null based on the activity's tracking_method)
  checklist_submission_id  uuid REFERENCES checklist_submissions(id) ON DELETE SET NULL,
  form_submission_id       uuid REFERENCES form_submissions(id) ON DELETE SET NULL,
  signature_submission_id  uuid REFERENCES signature_submissions(id) ON DELETE SET NULL,
  photo_id                 uuid REFERENCES media(id) ON DELETE SET NULL,

  reminders_fired          jsonb NOT NULL DEFAULT '[]'::jsonb,
                                  -- [{stage, fired_at, channel, recipient_user_id, delivery_status, error?}]

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  UNIQUE (game_id, activity_id)
);

CREATE INDEX activity_completions_due_idx
  ON activity_completions (organization_id, expected_at)
  WHERE status IN ('pending', 'in_progress', 'overdue');

CREATE INDEX activity_completions_game_idx
  ON activity_completions (game_id);
```

Counter, system_event, and external_acknowledgment activities have all four submission FKs and `photo_id` null — their completion is recorded by `status = completed`, `completed_at`, `completed_by_user_id` (null for system-driven completions) without a separate evidence row.

### 4.2 Artifact submission tables

```sql
CREATE TABLE checklist_submissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id         uuid NOT NULL REFERENCES activity_completions(id) ON DELETE CASCADE,
  template_id           text NOT NULL,                             -- 'chk.<id>' catalog ref
  submitted_at          timestamptz NOT NULL DEFAULT now(),
  submitted_by_user_id  uuid NOT NULL REFERENCES users(id),
  items                 jsonb NOT NULL                              -- [{item_id, checked: bool, note?}]
);

CREATE TABLE form_submissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id         uuid NOT NULL REFERENCES activity_completions(id) ON DELETE CASCADE,
  template_id           text NOT NULL,                             -- 'frm.<id>' catalog ref
  submitted_at          timestamptz NOT NULL DEFAULT now(),
  submitted_by_user_id  uuid NOT NULL REFERENCES users(id),
  fields                jsonb NOT NULL                              -- {field_id: value}
);

CREATE TABLE signature_submissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id         uuid NOT NULL REFERENCES activity_completions(id) ON DELETE CASCADE,
  template_id           text NOT NULL,                             -- 'sig.<id>' catalog ref
  submitted_at          timestamptz NOT NULL DEFAULT now(),
  signed_by_user_id     uuid NOT NULL REFERENCES users(id),
  typed_name            text NOT NULL,
  signed_role           text NOT NULL                               -- the role they signed as
);
```

### 4.3 New columns on existing tables

```sql
ALTER TABLE venues
  ADD COLUMN owned             boolean NOT NULL DEFAULT false,
  ADD COLUMN concessions       boolean NOT NULL DEFAULT false,
  ADD COLUMN parking_managed   boolean NOT NULL DEFAULT false;
```

### 4.4 New table: `venue_role_assignments`

Resolves which humans are currently in which roles at which venues — needed because the catalog says the role and the engine needs the user list.

```sql
CREATE TABLE venue_role_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id            uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  role_id             text NOT NULL,                               -- 'role.<id>'
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from      timestamptz NOT NULL DEFAULT now(),
  effective_to        timestamptz,                                 -- null = active assignment
  notes               text,

  created_at          timestamptz NOT NULL DEFAULT now()
);

-- One active assignment per (venue, role, user)
CREATE UNIQUE INDEX venue_role_active_idx
  ON venue_role_assignments (venue_id, role_id, user_id)
  WHERE effective_to IS NULL;

-- Lookup index
CREATE INDEX venue_role_lookup_idx
  ON venue_role_assignments (venue_id, role_id, effective_from, effective_to);
```

A venue manager assigning a ref to "Saturday's matches" creates an entry with effective_from = Saturday morning and effective_to = Saturday night. A salaried venue manager has effective_to = null (open-ended).

For customer roles (`role.parent`, `role.player`), no assignment record — those are derived from registration relationships at runtime when needed (which is rare for the tracking engine since customer roles are mostly informed-only).

### 4.5 Migration

One Drizzle migration (`src/lib/db/migrations/NNNN_activity_tracking.sql`):
- Create the four new tables (`activity_completions`, `checklist_submissions`, `form_submissions`, `signature_submissions`, `venue_role_assignments`)
- Add the three `venues` columns
- All defaults backward-compatible (existing venues auto-flag as `owned=false`, `concessions=false`, `parking_managed=false`)

---

## 5. Bootstrap + lifecycle

### 5.1 Bootstrap on game INSERT

Wrap existing game-creation API endpoints (`POST /api/admin/games`, etc.) with `bootstrapActivityCompletions(gameId)`. Pseudocode:

```typescript
async function bootstrapActivityCompletions(gameId: string): Promise<void> {
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: { season: { with: { program: { with: { sport: true } } } }, venue: true },
  });
  if (!game) throw new Error(`Game ${gameId} not found`);

  const tagContext = deriveTagContext(game);              // §5.2
  const catalog = await getCatalog();                      // cached load from src/lib/ops-catalog
  const matchingActivities = filterActivitiesByContext(catalog.activities, tagContext);

  for (const activity of matchingActivities) {
    const expectedAt = computeExpectedAt(activity.expected_completion, game);
    await db.insert(activityCompletions).values({
      organizationId: game.organization_id,
      gameId: game.id,
      activityId: activity.id,
      expectedAt,
      currentResponsibleRole: activity.raci.accountable,
      responsibleHistory: [{ role: activity.raci.accountable, assignedAt: new Date(), reason: 'bootstrap' }],
    });
  }
}
```

### 5.2 Tag context derivation

```typescript
function deriveTagContext(game: GameWithRelations): TagContext {
  return {
    sport_tags: [`${game.venue.indoor ? 'indoor' : 'outdoor'}:${game.season.program.sport.slug}`],
    venue_tags: [
      game.venue.indoor ? 'indoor' : 'outdoor',
      game.venue.owned ? 'owned' : 'rented',
      ...(game.venue.concessions ? ['concessions'] : []),
      ...(game.venue.parking_managed ? ['parking_managed'] : []),
    ],
    format_tags: [game.season.program.programType],          // 'league' | 'camp' | 'clinic' | 'tournament' | ...
    audience_tags: [game.season.program.audienceType === 'parents' ? 'youth' : 'adult'],
  };
}
```

If the program adds a new sport or program type that the catalog doesn't have activities for, the resulting completion list may be unexpectedly small. The validator/render pipeline doesn't catch this — it's an operational alert handled in the dashboard ("this game has 0 activities — is the program set up correctly?").

### 5.3 `expected_completion` DSL parser

Pure function `computeExpectedAt(dsl: string, game: Game): Date`:

| DSL form | Computation |
|---|---|
| `T-90min` | `game.scheduledAt - 90 minutes` |
| `T+5min` | `game.scheduledAt + 5 minutes` |
| `T-72h` | `game.scheduledAt - 72 hours` |
| `T+24h` | `game.scheduledAt + 24 hours` |
| `phase_start` / `phase_end` | Heuristic per phase: pre_day = T-12h / T-2h; day_setup = T-12h / T-2h; pre_game = T-2h / T-0; in_game = T+0 / T+game.duration_or_90min; post_game = T+0 / T+30min; end_of_day = T+8h / venue 22:00; post_day = T+24h / T+72h |
| `<HH:MM>` (e.g., `21:00`) | That same calendar day's `HH:MM` in the organization's timezone (per `organizations.timezone`; venues do not currently carry their own tz column) |
| `trigger+<n>min` | Reserved for activities triggered by other completions; computed at trigger-fire time. Not bootstrap-time. |

Unit-tested exhaustively. All seed-catalog activities use the simple forms (`T±Nmin`, `T±Nh`, `phase_end`); `trigger+Nmin` shows up only for `act.incident_response` and a few others — these are bootstrapped with a sentinel `expected_at = null`, and the cron tick computes the actual expected_at when the trigger fires (deferred from bootstrap).

### 5.4 Reschedule

When `games.scheduledAt` changes (admin edits a game), call `rescheduleActivityCompletions(gameId, newScheduledAt)`:

```typescript
async function rescheduleActivityCompletions(gameId: string, newScheduledAt: Date) {
  const completions = await db.query.activityCompletions.findMany({
    where: and(
      eq(activityCompletions.gameId, gameId),
      inArray(activityCompletions.status, ['pending', 'in_progress', 'overdue']),
    ),
  });

  for (const completion of completions) {
    const activity = await getActivityFromCatalog(completion.activityId);
    if (!activity) continue;                                  // catalog out-of-sync; skip

    const newExpectedAt = computeExpectedAt(activity.expected_completion, { ...game, scheduledAt: newScheduledAt });

    await db.update(activityCompletions)
      .set({
        expectedAt: newExpectedAt,
        status: completion.status === 'overdue' ? 'pending' : completion.status,
        remindersFired: [],   // re-fire at new times
        updatedAt: new Date(),
      })
      .where(eq(activityCompletions.id, completion.id));
  }
}
```

Already-completed rows are not touched — they happened, history is preserved.

### 5.5 Cancellation

When `games.status` flips to `cancelled` or `postponed`, call `cancelActivityCompletions(gameId)`:

```typescript
await db.update(activityCompletions)
  .set({ status: 'canceled', updatedAt: new Date() })
  .where(and(
    eq(activityCompletions.gameId, gameId),
    inArray(activityCompletions.status, ['pending', 'in_progress', 'overdue']),
  ));
```

If a game un-cancels (rare), bootstrap is re-run; existing canceled rows stay canceled and new pending rows are created. This is operationally clean — the canceled rows form an audit trail of "we tried to do this and abandoned it."

---

## 6. Cron tick + reminder/handoff dispatch

### 6.1 Scheduler

```typescript
// netlify/functions/scheduled-activity-tracker-tick.ts
import { schedule } from '@netlify/functions';
import { runActivityTrackerTick } from '../../src/lib/activity-tracking/tick';

export const handler = schedule('*/5 * * * *', async () => {
  const result = await runActivityTrackerTick();
  return { statusCode: 200, body: JSON.stringify(result) };
});
```

Plus a manual endpoint at `POST /api/cron/tick-activity-tracker` (header `x-cron-secret`) that calls `runActivityTrackerTick` for testing/manual invocation. Same handler, two entry points.

### 6.2 What the tick does

```typescript
async function runActivityTrackerTick(now: Date = new Date()): Promise<TickResult> {
  const dueCompletions = await db.query.activityCompletions.findMany({
    where: and(
      inArray(activityCompletions.status, ['pending', 'in_progress', 'overdue']),
      lte(activityCompletions.expectedAt, addMinutes(now, 15)),  // include rows due in the next 15min for pre-reminder
    ),
  });

  const result = { processed: 0, fired: 0, errors: 0 };

  for (const completion of dueCompletions) {
    try {
      const activity = await getActivityFromCatalog(completion.activityId);
      if (!activity) {
        await logCatalogResolutionFailure(completion);
        continue;
      }

      const stage = computeStage(now, completion.expectedAt, activity.reminder_policy);
      if (!stage) continue;                                    // no stage applies right now
      if (stageAlreadyFired(completion.remindersFired, stage)) continue;

      // Handoff if applicable
      if (stage === 'overdue' || stage === 'escalation' || stage === 'final_escalation') {
        await applyHandoff(completion, activity, stage);
      }

      // Status update for first overdue transition
      if (stage === 'overdue' && completion.status === 'pending') {
        await db.update(activityCompletions)
          .set({ status: 'overdue', updatedAt: now })
          .where(eq(activityCompletions.id, completion.id));
      }

      // Dispatch
      const dispatched = await dispatchReminders(completion, activity, stage);
      result.fired += dispatched.length;

      // Log
      await appendRemindersFired(completion.id, dispatched);
    } catch (err) {
      result.errors++;
      console.error('[tracker-tick]', completion.id, err);
    }
    result.processed++;
  }

  // Counter auto-complete pass
  await runCounterAutoComplete(now);

  return result;
}
```

### 6.3 Stage computation

```typescript
function computeStage(now: Date, expectedAt: Date, policy?: ReminderPolicy): Stage | null {
  const preMin    = policy?.pre_reminder_minutes  ?? 15;
  const overMin   = policy?.overdue_alert_minutes ?? 15;
  const escMin    = policy?.escalation_minutes    ?? 60;

  const preStart  = subMinutes(expectedAt, preMin);
  const overStart = expectedAt;
  const escStart  = addMinutes(expectedAt, overMin);
  const finalStart = addMinutes(expectedAt, escMin);
  const finalFinalStart = addMinutes(expectedAt, escMin + 60);

  if (now >= finalFinalStart) return 'final_escalation';
  if (now >= finalStart)      return 'escalation';
  if (now >= escStart)        return 'overdue';      // (note: stage names overlap with status; OK)
  if (now >= preStart)        return 'pre_reminder';
  return null;
}
```

Stage labels in `reminders_fired` log: `pre_reminder | overdue_alert | escalation | final_escalation` (avoiding the overlap with status enum).

### 6.4 Handoff (reassignment of `current_responsible_role`)

```typescript
async function applyHandoff(completion: ActivityCompletion, activity: Activity, stage: Stage) {
  let newRole: string | null = null;

  if (stage === 'overdue_alert') {
    newRole = activity.raci.accountable;              // Accountable takes over
  } else if (stage === 'escalation') {
    newRole = parseEscalationTarget(activity.escalation_path) ?? 'role.venue_manager';
  } else if (stage === 'final_escalation') {
    newRole = 'role.director';
  }

  if (!newRole || newRole === completion.currentResponsibleRole) return;

  await db.update(activityCompletions)
    .set({
      currentResponsibleRole: newRole,
      responsibleHistory: [
        ...completion.responsibleHistory,
        { role: newRole, assignedAt: new Date(), reason: `handoff_${stage}` },
      ],
      updatedAt: new Date(),
    })
    .where(eq(activityCompletions.id, completion.id));
}
```

`parseEscalationTarget` is a small heuristic that scans `activity.escalation_path` for a `role.<id>` mention; if none found, defaults to `role.venue_manager` (or `role.director` if the activity is venue_manager-accountable).

### 6.5 Dispatch

```typescript
async function dispatchReminders(
  completion: ActivityCompletion,
  activity: Activity,
  stage: Stage,
): Promise<DispatchedReminder[]> {
  const recipients = await resolveRecipientUsers(completion, activity, stage);
  const dispatched: DispatchedReminder[] = [];

  for (const user of recipients) {
    const variants = renderTemplateForStage(stage, { activity, completion, game, venue, recipient: user });
    const channels = workerChannelsConfigured(user);

    for (const channel of channels) {
      try {
        await sendViaGateway(channel, user, variants);
        dispatched.push({ stage, channel, recipient_user_id: user.id, fired_at: new Date(), delivery_status: 'sent' });
      } catch (err) {
        dispatched.push({ stage, channel, recipient_user_id: user.id, fired_at: new Date(), delivery_status: 'failed', error: String(err) });
      }
    }
  }

  return dispatched;
}
```

`resolveRecipientUsers` per stage:

- `pre_reminder` → users in the *original* `accountable` (which equals `current_responsible_role` at this stage since no handoff has fired yet)
- `overdue_alert` → users in `current_responsible_role` (just-handed-off Accountable) AND the original Responsible (CC for awareness)
- `escalation` → users in the new `current_responsible_role` (escalation target)
- `final_escalation` → `role.director` users

User resolution: query `venue_role_assignments` for the venue + role + active. If no users in that role at that venue, fall back to organization-wide assignments (e.g., `role.director` org-level) before logging an unreachable-recipient warning.

### 6.6 Worker channel selection

```typescript
function workerChannelsConfigured(user: User): Channel[] {
  const channels: Channel[] = [];
  if (user.email)           channels.push('email');
  if (user.telegramChatId)  channels.push('telegram');
  if (user.phone)           channels.push('sms');
  return channels;
}
```

Every available channel fires every stage. SMS uses `bypassOptInCheck: true` because workers consent via employment/contractor terms (HR boilerplate to be added in the employee-manual assembly effort).

---

## 7. Message templates

Per-stage modules at `src/lib/activity-tracking/messages/`:

```
pre-reminder.ts       exports renderPreReminder(ctx): MessageVariants
overdue-alert.ts      exports renderOverdueAlert(ctx): MessageVariants
escalation.ts         exports renderEscalation(ctx): MessageVariants
final-escalation.ts   exports renderFinalEscalation(ctx): MessageVariants
```

Each `render*` function produces three channel-specific variants:

```typescript
interface MessageVariants {
  sms:      { body: string };                      // SMS-friendly, full URL in body
  email:    { subject: string; html: string; text: string };  // uses editorial layout
  telegram: { body: string; parse_mode: 'HTML' };
}
```

Template content is hardcoded English copy for MVP. Per-org overrides + localization defer until a customer asks.

The email layout reuses the editorial layout that the email-templates effort started (per project memory: `feedback_ops_design_principles.md`, `project_email_resend_setup.md`). If the layout file isn't shared yet, this work creates the shared `src/lib/email/layouts/editorial.ts` and migrates the tracking-engine emails to it (small reusable effort).

---

## 8. Artifact submission UIs

### 8.1 URL pattern

```
GET   /admin/activity-completions/<id>            -- renders the appropriate UI
POST  /api/admin/activity-completions/<id>/submit -- accepts artifact payload
POST  /api/admin/activity-completions/<id>/cancel -- admin-marks-canceled
POST  /api/admin/activity-completions/<id>/reassign -- admin manual reassign
```

### 8.2 Renderer dispatch

A single React page component branches on the activity's `tracking_method`:

```typescript
function ActivityCompletionPage({ completionId }) {
  const { completion, activity, template } = useCompletion(completionId);

  switch (activity.tracking_method) {
    case 'checklist':
      return <ChecklistRenderer completion={completion} template={template} onSubmit={...} />;
    case 'form':
      return <FormRenderer completion={completion} template={template} onSubmit={...} />;
    case 'signature':
      return <SignatureRenderer completion={completion} template={template} onSubmit={...} />;
    case 'photo_upload':
      return <PhotoUploadRenderer completion={completion} mediaKind={activity.tracking_artifact.media_kind} onSubmit={...} />;
    case 'counter_increment':
      return <CounterReadback completion={completion} counterId={activity.tracking_artifact.counter} />;
    case 'system_event':
      return <SystemEventReadback completion={completion} eventType={activity.tracking_artifact.event_type} />;
    case 'external_acknowledgment':
      return <ExternalAckReadback completion={completion} externalRef={activity.tracking_artifact} />;
  }
}
```

### 8.3 Renderer specs

**ChecklistRenderer:** Loads `chk.<id>.yaml` template via the catalog API; renders each item as a checkbox with optional note field. Submit body: `{items: [{item_id, checked, note?}]}`. Server validates: every item present, each `checked` boolean, no unknown item_ids. Client-side enforcement: all items required-checked before submit button enables.

**FormRenderer:** Loads `frm.<id>.yaml` template; renders `fields` based on `type`:
- `text` → `<input type="text" />`
- `long_text` → `<textarea />`
- `enum` → `<select>` with `options`
- `boolean` → `<input type="checkbox" />`
- `number` → `<input type="number" />`
- `date` → `<input type="date" />`

Required fields enforced client + server. Submit body: `{fields: {field_id: value}}`. Validation: type-correct, required fields present, no unknown field_ids.

**SignatureRenderer:** Loads `sig.<id>.yaml` template; renders `prompt` text, "type your full name" input, and "Sign" button. Validation:
- Typed name length ≥ 3
- Signing user's role matches `template.required_role` (verify via `venue_role_assignments` at submission time; reject if user not currently in that role at this venue)

Submit body: `{typed_name}`. Server fills `signed_by_user_id` from session, `signed_role` from the template.

**PhotoUploadRenderer:** Reuses the existing media upload infrastructure (`src/components/admin/media/...` from Media Phase 2). Renders any existing media tagged with the activity's `media_kind` for this game/venue, plus an "upload new" affordance. Submit: `{media_id}` (selecting an existing) OR triggers fresh upload that returns the new media_id and submits.

**CounterReadback:** Read-only. Loads counter source (e.g., `walk_on_registrations` for `counter.walk_on_registrations`) via a catalog-side adapter that knows the table for each counter id. Displays:
- Current count
- Time window (e.g., "pre-game window: 14:30 – 16:00")
- Status (pending / completed)
- List of underlying rows (with deep links: e.g., each walk-on registration shown with payment link)

For `min_count > 0` activities, also shows progress: "3 of 5 expected."

**SystemEventReadback / ExternalAckReadback:** Read-only. Show the system event the activity is waiting for (e.g., "waiting for evt.cancellation_broadcast_sent — fires when a cancellation is broadcast for this game"). When the event fires (via `markCompleteBySystemEvent`), the page reloads and shows completed status + timestamp.

### 8.4 Counter auto-complete worker

A second cron-tick path (or extension of the main tick — implementation choice; same scheduled function):

```typescript
async function runCounterAutoComplete(now: Date) {
  const dueCounters = await db.query.activityCompletions.findMany({
    where: and(
      lte(activityCompletions.expectedAt, now),                    // window has passed
      inArray(activityCompletions.status, ['pending', 'in_progress']),
    ),
  });

  for (const completion of dueCounters) {
    const activity = await getActivityFromCatalog(completion.activityId);
    if (!activity || activity.tracking_method !== 'counter_increment') continue;

    const count = await queryCounterSource(activity.tracking_artifact.counter, completion);
    const minCount = activity.tracking_artifact.min_count;

    if (count >= minCount) {
      await markComplete(completion.id, { systemDriven: true, count });
    } else {
      // Falls through to overdue ladder via the main tick on next pass
      // (count fell short; escalation will fire and a human will investigate)
    }
  }
}
```

`queryCounterSource(counterId, completion)` is a small adapter map:

```typescript
const counterSources: Record<string, (completion: Completion) => Promise<number>> = {
  'counter.walk_on_registrations': c => db.select(...).where(eq(walkOnRegistrations.gameId, c.gameId))...count,
  'counter.live_scores':           c => db.select(...).where(eq(gameEvents.gameId, c.gameId)).where(...)...count,
  'counter.photos_uploaded':       c => db.select(...).where(eq(media.gameId, c.gameId)).where(eq(media.kind, ...))...count,
  'counter.photos_published':      c => db.select(...).where(...)...count,
};
```

### 8.5 System event activities

Platform code that emits a tracked event also marks the matching completion. Helper:

```typescript
async function markCompleteBySystemEvent(gameId: string, eventType: string) {
  // Find activity_completions for this game whose activity has tracking_artifact.event_type = eventType
  // (may be 0, 1, or rare 2+ matches)
  const completions = await findCompletionsByEventType(gameId, eventType);
  for (const c of completions) {
    await markComplete(c.id, { systemDriven: true, eventType });
  }
}
```

Existing platform code (e.g., `src/lib/messaging/broadcast.ts` cancellation flow) is updated to call this helper after the event fires:

```typescript
export async function sendCancellationBroadcast(gameId, ...) {
  // ... existing broadcast code ...
  await markCompleteBySystemEvent(gameId, 'evt.cancellation_broadcast_sent');
}
```

### 8.6 External acknowledgment activities

Webhook handlers (Stripe payouts, Twilio delivery receipts, etc.) call `markCompleteByExternalAck`:

```typescript
async function markCompleteByExternalAck(
  gameId: string | null,
  externalSystem: string,
  recordKind: string,
  externalRef: string,
) {
  // Match activity_completions where the activity's tracking_artifact has matching external_system + record_kind
  // For payroll events: gameId may be null (org-wide event) or the most-recent associated game
  // For now, payroll events match by week-of-game; specifics defer to Plan 4 (payroll integration)
}
```

For the seed catalog, the only external_acknowledgment activities are payroll-related (`act.staff_payroll_event`, `act.ref_payroll_event`). Their wiring depends on the payroll integration (`feat.payroll_integration`, P1 in Plan 4+). Until that ships, these activities sit pending and eventually escalate — flagging that the payroll integration hasn't run.

---

## 9. Dashboard

### 9.1 Page

`src/pages/admin/game-day/today.astro` — Astro shell with `<ActivityTrackingDashboard client:load />` React component. BaseLayout per project convention (CLAUDE.md). Auth-gated to admin role via existing middleware.

### 9.2 Default view

All `activity_completions` for games scheduled today (in venue timezone), filtered to the admin's accessible orgs/venues, where `status IN (pending, in_progress, overdue)`. Sorted by `expected_at` ascending.

Row shape:

| Status badge | Activity name | Game (venue + opponent) | Expected at | Current responsible | Actions |
|---|---|---|---|---|---|
| 🔴 Overdue | Rainout decision | Worthington vs Powell | 14:00 (15m late) | Venue Manager (Sarah C.) | [Open] [Reassign] |
| 🟡 Pending | Ref check-in | Worthington vs Powell | 14:30 (in 15m) | Event Lead (Mike R.) | [Open] |
| 🟢 Completed | Field setup | Worthington vs Powell | 14:00 ✓ done at 13:55 | Facilities (Devon P.) | [View evidence] |

### 9.3 Filters

- Date range — default "today (00:00 to 23:59 venue tz)"; presets: yesterday, last 7 days, this week, custom
- Venue — multi-select (defaults to all admin-accessible)
- Phase — multi-select
- Status — multi-select (default: non-completed)
- Role responsible — multi-select
- Activity — type-ahead search

### 9.4 Tabs

- **By time** — flat sortable table (default)
- **By phase** — grouped/collapsed per phase header (chronological narrative, like a runbook)

### 9.5 Per-row actions

- **Open** → `/admin/activity-completions/<id>` (renderer page from §8)
- **Reassign** → modal: pick role/user; logged in `responsible_history` with reason
- **Mark canceled** → modal: require reason; logged

### 9.6 Mobile

Cards-stacked layout below `md` breakpoint. Each row collapses to a card with status, name, and primary action visible. Filters move into a top sheet/drawer.

### 9.7 Per-org tenant scoping

All queries scoped via `requireSameOrg*` per `src/lib/auth/require-resource-ownership.ts`. Filters can't escape the admin's org boundary. (CLAUDE.md emphasizes this.)

---

## 10. Edge cases + idempotency

### 10.1 Cron tick re-runs

Two scheduled invocations at the same minute: `reminders_fired` log is the de-dupe mechanism. Each `(completion_id, stage)` checks the log; if fired, skip. Both runs idempotent.

### 10.2 Concurrent submissions

Two workers submit the same artifact: the second one sees `status = 'completed'` already and returns 409 Conflict. Server-side check via `WHERE status != 'completed'` in the UPDATE; rowcount=0 means already done.

### 10.3 Dispatch failure per channel

Try-catch per channel-send. Failures logged in `reminders_fired` with `delivery_status: 'failed'`. No inline retry. No fall-through to alternate channel — the worker has all their channels firing already.

Admin can see failures on the per-completion detail page.

### 10.4 Cron tick crash

Each completion processed in isolated try-catch. One row's failure doesn't kill the tick. Whole-tick crashes (e.g., DB unreachable) just fail the Netlify Scheduled Function invocation; next run picks up. No state corruption — work is per-row idempotent.

### 10.5 Catalog out-of-sync

Completion row's `activity_id` doesn't resolve at runtime: log warning, skip dispatch, dashboard renders the stale row as "(activity removed from catalog)" with a manual cancel option.

### 10.6 Backfill (game scheduled in the past)

Bootstrap creates completions with `expected_at < now`. Cron tick on next pass treats them as overdue immediately, fires escalation once, and they appear on the dashboard. Admin can bulk-cancel with the reassign/cancel actions.

### 10.7 Missing role assignments

`venue_role_assignments` has no entry for the role the activity's accountable for at the venue: dispatch resolves to zero recipients, logs an unreachable-recipient warning, dashboard shows the row with "(no users in role X — assign someone in venue settings)" hint.

### 10.8 Catalog schema migration

For activity-level migration: per the operating model spec, every catalog change PR includes a migration plan. For the engine, additive changes are no-op. Subtractive changes (activity removed) leave dangling rows that the engine handles gracefully (§10.5). Field-level changes (e.g., changing tracking_method) on an in-flight activity could create incoherent state — the migration plan must specify operator action (e.g., bulk-cancel and re-bootstrap affected games).

---

## 11. Testing

### 11.1 Unit tests (`tests/unit/activity-tracking/`)

- DSL parser (`computeExpectedAt`): all DSL forms × edge cases (year boundaries, DST, organization tz)
- Tag matching: reuse the same logic as the catalog generators (single source of truth — the `filterActivitiesByContext` function moves to `src/lib/ops-catalog/views/_filtering.ts` and is imported by both)
- Stage computation: `computeStage(now, expectedAt, policy)` for each transition + edge boundaries
- Worker channel selection
- Bootstrap activity selection: given a sample game + catalog, assert correct subset of activities matches
- Counter auto-complete: count >= min_count → completed; count < min_count → fall-through

### 11.2 Integration tests (`tests/api/activity-tracking/`)

Hit the running dev server over HTTP per CLAUDE.md test conventions:

- Schedule a game → assert N completions created, each with computed `expected_at`
- Reschedule a game → assert `expected_at` recomputed, status reset for overdue rows, completed rows untouched
- Cancel a game → assert pending completions canceled, completed rows untouched
- Submit checklist → 200, status flips to completed, evidence row created
- Submit checklist twice → second returns 409
- Submit form with missing required field → 400, no status change
- Submit signature with wrong-role user → 403
- Counter phase-end with count >= min_count → status flips to completed via cron tick
- Counter phase-end with count < min_count → status flips to overdue via cron tick
- Manual cron tick endpoint with valid `x-cron-secret` → fires reminders for due rows; idempotent on re-call
- Manual cron tick with invalid secret → 401

### 11.3 E2E tests (Playwright, `tests/e2e/activity-tracking/`)

- Full flow: admin creates a game → completions appear in dashboard → admin clicks a checklist activity → submits → status flips
- Reassign flow: admin opens overdue activity → reassign modal → confirm → row updates
- Mobile viewport: dashboard renders as stacked cards with filters in drawer

(Defer until UI stabilizes if E2E becomes blocking.)

### 11.4 Test data

A new helper `tests/utils/activity-tracking-helpers.ts` exposes setup functions (`createTestGameWithCompletions`, `tickAndAssertReminders`, etc.) that integration tests call in their own setup blocks. No global seed file (per project policy: seeds were removed pre-launch; only `seed-e2e-tests.ts` exists for the E2E staging schema reset).

---

## 12. Out of scope (deferred to follow-up)

- **Per-org template overrides** for reminder messages
- **Localization** of templates
- **Customer-facing overdue alerts** (parents seeing "your kid's coach is late checking in") — engine doesn't fire to customer roles
- **Bulk operations** on the dashboard (multi-select cancel, multi-reassign)
- **Historical analytics** (overdue rate trends, mean time to complete by activity, etc.) — defer to PostHog or dedicated reporting
- **Activity dependencies** (Activity B's expected_at depends on Activity A's completion_at). The DSL's `trigger+Nmin` form is reserved but not implemented; current tick treats `trigger+*` activities as deferred-bootstrap (expected_at remains null) until manually set or until a future plan ships dependency tracking.
- **Per-completion comments / notes / discussion threads** — operationally useful but not MVP
- **Catalog migration tooling** (auto-rebootstrap of in-flight games on additive catalog edits) — current rule is "in-flight games keep their existing completions; new games pick up new catalog"

---

## 13. Open questions

None load-bearing. Smaller items deferred during brainstorming:

1. **Phase_end heuristic per phase** — I picked defaults (post_day = T+72h, end_of_day = venue 22:00, etc.). Operator may want to override individual heuristics; tunable in code, not catalog.
2. **`role.parent` / `role.player` resolution** — derived from registrations when needed (rare for tracking engine since they're informed-only). Implementation detail handled in the user-resolution helper.
3. **Activity dispatch when reassigned to a role with no current users** — falls through to "next role in chain" logic; spec says fall back to org-level Director. Edge case worth documenting in the runbook.

---

## 14. Implementation handoff

Once this spec is approved, the implementation plan (Plan 2) decomposes into roughly:

1. **Migration + module move** — Drizzle migration for the new tables/columns, move `scripts/ops-catalog/{loader,validator,types,views}` to `src/lib/ops-catalog/` so it's runtime-accessible
2. **Bootstrap + lifecycle** — `bootstrapActivityCompletions`, `rescheduleActivityCompletions`, `cancelActivityCompletions`; wire into game create/update/cancel API endpoints
3. **Tag derivation + DSL parser** — pure functions with unit tests
4. **Cron tick + scheduler** — `runActivityTrackerTick`, Netlify Scheduled Function, manual cron endpoint
5. **Dispatch + templates** — `dispatchReminders`, `workerChannelsConfigured`, four message-render modules, integration with `src/lib/messaging/`
6. **Handoff logic** — `applyHandoff`, `parseEscalationTarget`, `responsible_history` updates
7. **Counter auto-complete** — `runCounterAutoComplete`, counter source adapters
8. **System event helpers** — `markCompleteBySystemEvent`, integration with broadcast code
9. **External ack helpers** — `markCompleteByExternalAck` (stub for now; live wiring in Plan 4 payroll integration)
10. **`venue_role_assignments` admin UI** — list + create/edit/end-effective on `/admin/venues/<id>/staff`
11. **Artifact renderer page** — `/admin/activity-completions/<id>` with branching component
12. **Five renderer components** — checklist, form, signature, photo upload, counter readback (+ system_event/external_ack readbacks)
13. **Submit endpoints** — `POST /api/admin/activity-completions/<id>/submit` per method
14. **Cancel + reassign endpoints**
15. **Dashboard** — `/admin/game-day/today` with filters, tabs, mobile layout

The plan will be authored separately via the writing-plans skill.
