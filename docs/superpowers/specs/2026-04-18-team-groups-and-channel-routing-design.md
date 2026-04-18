# Team Groups & Channel Routing Policy

**Status:** Draft — 2026-04-18, pending review
**Owner:** Mahad Ibrahim
**Reviewer:** (self)
**Depends on:** Phase 1 Messaging Layer (`2026-04-14-phase-1-messaging-layer-design.md`) — extends, does not replace
**Scope:** MVP for pilot organization; multi-tenant compatible

---

## Summary

Add a team-scoped group-chat layer on top of Aspire's existing messaging infrastructure. Every team automatically gets a Telegram group — parents-only by default — that serves as the primary channel for team broadcasts (reminders, schedule changes, announcements) and parent-to-parent conversation. Coach communication is formalized: coaches compose from the admin UI, and "Ace" (the Aspire bot) relays messages into the group prefixed with the coach's name. Non-linked parents receive the same content via email fan-out. SMS is reserved for high-signal use: identity verification, payment problems, and any event change within 24 hours of the event.

The design gives each channel a distinct role — Telegram for conversation, SMS for attention, email for record — and defines an explicit routing policy per message type rather than leaving channel selection to user preference. A single user-facing preference ("also email me a copy of team announcements") covers the 90% case for linked parents who want email backup. Everything else is policy-driven for consistency and safety.

## Goals

1. Give every team a default, branded, low-friction communication channel that replaces the organic WhatsApp/iMessage group chats that currently form per team.
2. Make coach broadcasts one-click from the admin dashboard and ensure delivery to every parent on the roster via whichever channel they use.
3. Reserve SMS for messages that genuinely need to command attention, protecting the channel's signal value.
4. Drive Telegram adoption as the default parent experience without making it mandatory.
5. Stay compatible with Phase 1 messaging infrastructure (gateway, conversations table, magic-link binding, compliance layer) and the multi-tenant data model.

## Non-goals

- **Player groups for U14+.** Legally and operationally more involved; deferred as a travel/AAU growth lever (v2). Captured in project memory.
- **Coach reply inbox / conversation threading on group posts.** Fire-and-forget broadcast model for MVP. Parents direct-message coaches via the existing 1:1 channel if they need a response.
- **Outbox / durable job queue.** Synchronous sends plus a nightly reconciliation cron are sufficient for MVP scale. Revisit when delivery SLA pressure emerges.
- **Per-message-type user preferences.** One toggle, not a preference matrix.
- **Parents-only side groups with coach also included.** Coach is never in the team group. This is a feature of the design, not a limitation.
- **Email inbound handler.** Already scaffolded (`RESEND_INBOUND_WEBHOOK_SECRET`) but not in scope here.
- **Per-org custom Telegram bots.** Single universal Ace bot serves all orgs for MVP; per-org bot identity is a future feature.
- **Real-time delivery receipts for Telegram group posts.** Telegram doesn't emit them; we rely on send-time success/failure.

## Relationship to existing Phase 1 messaging design

This spec extends and is consistent with `2026-04-14-phase-1-messaging-layer-design.md`. That spec establishes:

- Phone verification, opt-in tracking (`phone_opt_ins`), TCPA compliance layer
- 1:1 `conversations` / `conversation_messages` schema with channel field (`sms` | `email` | `telegram` | `web`)
- Magic-link authentication for parent web flows
- Bot action registry and LLM intent classification for inbound messages
- Staff inbox UI for coach/admin replies
- Outbound gateway with primary/fallback routing (`messagingPrimaryChannel`, `messagingFallbackChannel`)

This spec adds on top:

- **Team-scoped groups** (not 1:1 conversations) — new data model for group state and membership
- **Routing policy per message type** — a declarative table of which channels each message class uses, rather than relying purely on per-user preference
- **Coach compose UI** — admin dashboard flow for composing team broadcasts
- **Automated broadcasts** — system-initiated messages (day-before reminders, event change notifications) produced from structured triggers
- **Adoption mechanics** — registration-flow and dashboard nudges to drive Telegram linking

The existing 1:1 `conversation_messages` table is extended to log group-targeted sends alongside user-targeted ones. No breaking changes to prior schema.

## Channel roles and routing policy

### Role per channel

- **Telegram.** The conversation layer. Team parent groups for broadcasts + parent-to-parent chat. 1:1 DMs for non-urgent notifications, receipts (as extra), and account-status messages.
- **SMS.** The attention and identity layer. Reserved for: identity/security (verification codes, security alerts), urgent time-critical messages (event changes within 24 hours, payment failures), and account-impacting events where missing the notification has real cost.
- **Email.** The system of record. Transactional messages for legal/billing paper trail (receipts, refunds, registration confirmations). Long-form content. Fallback channel for parents who have not linked Telegram.

### Full routing matrix

| Message type | Telegram | SMS | Email |
|---|---|---|---|
| Team broadcast — general | Group | — | Fan-out to non-linked |
| Event change, >24h before event | Group | — | Fan-out to non-linked |
| Event change, ≤24h before event | Group | All parents | Fan-out to non-linked |
| Coach/admin "urgent" override | Group | All parents | Fan-out to non-linked |
| Payment receipt | DM | — | Always (record) |
| Payment failed / card declined | DM | All parents | Always (record) |
| Refund issued | DM | — | Always (record) |
| Registration confirmation | DM | — | Always (record) |
| Password reset | — | Code (if phone verified) | Magic link (primary) |
| Phone verification | — | Code | — |
| Security alert (new login) | — | Yes | Always |
| Marketing / upsell | DM only | — | Opt-in only |

"Fan-out to non-linked" = the system iterates roster parents and sends email to each parent who hasn't linked Telegram. Linked parents rely on the group post and are not duplicated unless `users.also_email_copy = true`.

### User-configurable preference

A single toggle on the parent dashboard:

> "Also email me a copy of team announcements." *(default: off for Telegram-linked users)*

- For Telegram-linked parents with toggle off: team broadcasts appear in the group; no email duplicate.
- For Telegram-linked parents with toggle on: group post plus a personal email copy of each team broadcast.
- For non-linked parents: email always, since it's their only practical channel.

The toggle does not affect SMS routing (policy-driven) or transactional email (always on). Per-message-type preferences are deliberately not offered; letting users disable SMS for payment-failed or urgent event changes defeats SMS's reserved-signal purpose.

### Urgent override

Coaches and admins can mark any compose as **urgent** via a checkbox in the compose UI. Urgent forces SMS fan-out to all parents regardless of time-to-event — a manual override for situations the 24h rule doesn't capture ("bring black jerseys Saturday — really important"). All urgent sends are logged in `broadcast_log.is_urgent = true` for audit.

## Team groups: lifecycle, membership, moderation, naming

### Group type

Telegram **Supergroup** (not basic group). Supports up to 200K members, has permanent invite links, better admin controls, and will scale without breaking if a large org grows into multi-location teams.

### Naming template

```
[Org Short Name] [Sport] [Team] — [Season] [Audience]
```

Examples:

- Youth soccer: `Aspire Powell Soccer Red — Fall 2026 Parents`
- Adult basketball: `Aspire Powell Basketball Blue — Fall 2026 Players`
- Non-sports program (future): `Aspire Academy STEM Cohort A — Fall 2026 Parents`

Sport comes from `programs.sport_id` → `sports.display_name`. Telegram titles are capped at 128 characters; the template typically produces 40-60 character names.

### Audience type

`programs.audience_type` (new column) — enum: `parents` | `players`. Default `parents` for youth programs; `players` for adult programs. Determines who the team group is for and what suffix appears in the name. The same routing/lifecycle code serves both cases; only the roster query and naming suffix differ.

### Lifecycle

| Trigger | Action |
|---|---|
| Kid rostered on a team | Event handler: schedule group creation for 7 days before team's first scheduled event (or immediately if first event is <7d away). If no events scheduled yet, defer — group creation job is scheduled when the team's first event is added to the schedule. |
| 7 days before first event | Scheduled job: Ace creates Supergroup, sets avatar + description, generates permanent invite link, writes row to `team_groups` |
| Parent linked Telegram + on roster | Ace DMs parent the invite link; parent taps → joins group |
| Non-linked parent on roster | Email sent: "Your team chat is live. Connect Telegram to join, or we'll email you updates." |
| Roster change (add/remove kid) | Event handler adjusts group membership (DM new parents invite; remove departed parents) |
| Parent presses "Leave group" in dashboard | Ace removes them; `team_group_memberships.opted_out_at` set; reconciliation honors it |
| Season end (last event + 7 days, or season `end_date` + 7 days, whichever comes first) | Ace posts farewell message, leaves the group. Row marked `archived_at`. Group persists in Telegram with history; parents remain members with read access. |

### Membership policy (household)

- Both parents on `family_member_parents` with `can_receive_messages = true` are invited.
- Each parent can press "Leave this group" in the dashboard as an independent escape hatch.
- Leaving sets `opted_out_at`; reconciliation will not re-add.
- Rejoin available from dashboard — clears `opted_out_at`, triggers re-invite on next sync.

### Moderation

- Telegram group admins: **Ace (bot) + org admins only.** Coach is not in the group and has no Telegram admin rights.
- Day-to-day moderation:
  - Ace auto-removes members whose Aspire account is deactivated or whose kid is removed from the roster.
  - Ace applies basic spam filtering (simple heuristic for MVP; upgradable later).
  - Org admins can manually remove problem members via Telegram or via an admin UI ("Remove [Parent] from [Team Red] group").
- Parent-to-parent disputes: handled by org admin intervention, as with any customer-service matter.

### Multi-team families

A parent with kids on multiple teams is a member of multiple groups — one per team. No combined "my teams" Telegram view; Telegram's native group list handles this. The dashboard shows all teams the parent is connected to, each with a leave option.

### Reconciliation (nightly cron)

Runs at a low-traffic time. For every `team_groups` row with `status = 'active'`:

1. Compute expected membership = parents from `family_member_parents` where kid is on the team's roster, `can_receive_messages = true`, not `opted_out_at`, has linked Telegram.
2. Query Telegram: actual group members.
3. Diff expected vs actual.
4. Missing expected → DM them the invite link (Telegram bots cannot silently add users).
5. Unexpected actual (kid removed from team, account deactivated) → bot removes them.
6. Log drift and fixes to `reconciliation_log`.

Performance budget: <5 minutes for a typical org (20 teams, ~400 memberships) given Telegram's ~30 msg/sec bot rate limit. Sequential with rate limiting.

## Compose flow (coach + admin)

### Two modes

- **Team broadcast.** Message posts in team group(s) + email fan-out to non-linked parents.
- **Direct message.** Personal DM to each recipient (no group). Used for org-wide announcements, upsells, targeted parent communications.

Coaches default to team broadcast for their own teams. Admins can choose either mode and target more broadly.

### Coach compose UI

Entry: admin dashboard → "My Teams" → select team → "Send Announcement."

Form fields:

- **Message** — textarea, plain text, max 4,000 chars (under Telegram's 4,096 limit with prefix headroom)
- **Attach photo** — optional, single image (field maps, bracket sheets)
- **Mark as urgent** — checkbox; forces SMS fan-out to all parents regardless of time-to-event
- **Send time** — "Send now" (default) or "Schedule for later" (date + time picker)

Preview pane shows exactly what parents will see in the group:

```
From Coach Mike:
Practice Saturday moved to the turf field at 9am.
```

Submit is synchronous (2-3 seconds). Confirmation summarizes per-channel delivery:

```
Sent to Aspire Red — Fall 2026 Parents
  Telegram group (15 members)
  3 parents via email (not linked to Telegram)
  No SMS (game is 42h away)
```

### Admin compose UI

Same form, plus target selector:

- **This team** (default when entered from a team page)
- **Multiple teams** (multi-select)
- **Whole program** (e.g., "all Fall 2026 Soccer teams")
- **Whole organization** — auto-switches mode to **Direct Message** to avoid spamming every team group with unrelated content

Per-team confirmation aggregated across targets.

### Automated broadcasts

System-initiated, no UI. Template library:

| Trigger | Message |
|---|---|
| Day-before reminder cron | `Heads up — practice tomorrow at 5pm, Field 2.` |
| Event reschedule | `Heads up — practice Saturday has moved from 9am to 10am.` |
| Event venue change | `Heads up — Saturday's game is now at Field 3 instead of Field 1.` |
| Event cancellation | `Saturday's game has been cancelled. Rescheduling details to follow.` |
| Season end archive | `Season wrapped — thanks for a great season. This group is now archived.` |

Automated messages are attributed to Ace directly — no "From Coach" prefix.

### Attribution prefixes

| Source | Prefix in the group |
|---|---|
| Coach compose | `From Coach [First Name]:` |
| Admin compose | `From [Org Short Name] Admin:` |
| Automated (Ace) | No prefix — plain message in Ace's voice |

Org admin attribution uses the organization name rather than the individual admin's name to feel institutional.

### Permissions

- Coach can compose only for teams they're assigned to (`team_coaches` join).
- Org admin can compose for any team / program / org within their organization.
- Cross-org compose is never allowed (multi-tenant isolation).

### Delivery log

Every broadcast writes to `broadcast_log`:

- Composer (user_id or "system")
- Target (team_ids, recipient count)
- Channels used (Telegram group, SMS count, email count)
- Per-recipient delivery status (for SMS/email; Telegram group posts logged as one row)
- Timestamp, urgent flag, scheduled-for if applicable

Surfaced in admin UI as "Sent Announcements" — filterable by team, composer, date. Supports audit, review, and delivery troubleshooting.

## Onboarding and adoption

Implementing **prompted at registration (skippable) + continuous nudge** from brainstorming.

### Registration flow

New step in the existing registration wizard, after payment, before the confirmation page. Telegram link is **never blocking** — skip is always one tap away.

```
Stay connected

Your team uses Telegram to share reminders, schedule changes, and
quick updates.

[Connect Telegram]   — primary CTA; opens Telegram with magic link
[Skip for now]       — secondary link

We'll email you updates if you skip this. You can connect anytime
from your dashboard.
```

On successful link: `users.telegram_chat_id` populated. On skip: registration proceeds, `users.telegram_linked_at` stays null.

### Magic-link binding (existing)

`POST /api/dashboard/settings/telegram/link` (already built) returns a deep link to `tg://resolve?domain=AspireAceBot&start=<token>`. Tapping opens Telegram, user sends `/start <token>`, bot binds their Telegram user ID to the Aspire user. Confirmation message from Ace.

### Continuous nudge surfaces (unlinked parents)

| Surface | Nudge |
|---|---|
| Dashboard home (top) | Dismissible banner: "Connect Telegram for real-time team updates." Reappears every 14 days if dismissed. |
| First team group broadcast (email version) | Footer: "3 parents on your team have already joined the group chat. [Join them]" — social proof when it exists |
| Every transactional email footer | Small link: "Prefer fewer emails? Get quick updates via Telegram." |
| Registration confirmation email | After the receipt block: "You skipped Telegram — connect anytime." |

Nudge frequency capped: a parent sees at most one nudge banner per 14 days and at most 3 nudges per week across all surfaces.

### Group invite flow (linked parents)

When their team's group is created (7 days before first event):

1. Ace DMs the parent: "Your Aspire Red team group is live. Tap to join: [button]"
2. Parent taps, Telegram opens the group, parent taps Join.
3. `team_group_memberships.joined_at` populated.

If the parent ignores the DM invite, reconciliation resends it **once** 48 hours later. After that, parent stays uninvited until they rejoin from the dashboard.

### Leave / rejoin recovery

Parents who press "Leave this group" in the dashboard see a persistent banner:

```
You left Aspire Red parents group.
You still get broadcasts via email. [Rejoin group] to return.
```

Rejoin clears `opted_out_at`; reconciliation re-adds on next run (or immediately via event handler).

### Adoption metrics (admin dashboard)

- **Telegram link rate** — % of registered parents who've linked (per org, trending)
- **Group join rate** — % of invited parents who've joined their team group
- **Nudge conversion** — % of banner taps that complete linking

Provides operators the feedback loop to tune registration UX per org.

## Data model

### New tables

**`team_groups`** — one row per team per season.

```
id                         uuid PK
team_id                    uuid FK teams
program_id                 uuid FK programs
organization_id            uuid FK organizations (denorm for queries)
telegram_chat_id           varchar unique nullable (null until created)
audience_type              varchar ('parents' | 'players')
name                       varchar
invite_link                text nullable
status                     varchar ('scheduled' | 'active' | 'creation_failed'
                                    | 'bot_removed' | 'archived')
creation_scheduled_for     timestamp
created_at                 timestamp nullable
archived_at                timestamp nullable
```

**`team_group_memberships`** — who is in each group.

```
id                         uuid PK
team_group_id              uuid FK team_groups
user_id                    uuid FK users
role                       varchar ('parent' | 'player' | 'admin' | 'bot')
joined_at                  timestamp nullable
opted_out_at               timestamp nullable  -- user pressed "Leave group"
removed_at                 timestamp nullable
last_synced_at             timestamp  -- reconciliation tracking
```

**`broadcast_log`** — every broadcast intent.

```
id                         uuid PK
organization_id            uuid FK organizations
initiator_id               uuid FK users nullable (null = automated)
initiator_type             varchar ('coach' | 'admin' | 'system')
target_type                varchar ('team_group' | 'multi_team' | 'org_dm')
team_ids                   uuid[]
message_type               varchar ('custom' | 'day_before_reminder'
                                    | 'event_change' | 'cancellation' | ...)
body                       text
is_urgent                  boolean
scheduled_for              timestamp nullable
sent_at                    timestamp nullable
channels_used              jsonb
delivery_summary           jsonb
```

**`scheduled_broadcasts`** — future sends (coach-scheduled, day-before reminders, group-creation invite sends).

```
id                         uuid PK
organization_id            uuid FK organizations
team_id                    uuid FK teams nullable
initiator_id               uuid FK users nullable
message_type               varchar
body                       text
channels_policy            varchar  -- routing rule to apply
scheduled_for              timestamp
cancel_if                  jsonb  -- e.g., { "event_cancelled": true }
status                     varchar ('pending' | 'sent' | 'cancelled')
```

**`reconciliation_log`** — nightly cron output.

```
id                         uuid PK
ran_at                     timestamp
team_group_id              uuid FK team_groups
drift_detected             jsonb  -- { added: [user_ids], removed: [user_ids] }
fixes_applied              jsonb
errors                     jsonb
```

### Schema extensions

**`programs`**:

```
audience_type              varchar(20) default 'parents'
                             -- 'parents' | 'players'
```

**`users`**:

```
also_email_copy            boolean default false
```

**`conversation_messages`** (existing from Phase 1):

```
+ team_group_id            uuid FK team_groups nullable
+ broadcast_id             uuid FK broadcast_log nullable
+ target_type              varchar default 'user'
                             -- 'user' | 'team_group'
```

All extensions backwards-compatible (nullable or defaulted columns).

## Error handling and self-healing

### Synchronous failures (coach/admin compose)

- **Telegram API 5xx or timeout** → confirmation screen shows "Telegram group post failed — retry?" Retry resends only failed channels.
- **Twilio send failure (single number)** → per-recipient errors shown; coach can retry or contact manually.
- **Resend bounce** → hard bounces flip `users.email_valid = false`, surface in admin UI.
- **Pipeline-wide failure** (DB down, etc.) → standard 500; broadcast row not written; retry is idempotent.

**Idempotency.** Each compose carries a client-side nonce. Server dedupes any duplicate nonce within 5 minutes. Prevents double-sends from network retries or frantic re-clicking.

### Asynchronous failures

- **Group creation job fails** (Telegram rejects bot setup, etc.) → retry with exponential backoff, up to 3 attempts over ~10 minutes. After final failure, `team_groups.status = 'creation_failed'`, alert org admin.
- **Roster event handler fails** → logged silently; nightly reconciliation catches the drift and re-invites.
- **Bot kicked from group** → reconciliation detects (getChat returns 403), marks `status = 'bot_removed'`, alerts org admin. Group is inactive until human intervention.
- **Parent blocks Ace's DMs** → Telegram 403 on next DM. Logged. `telegram_chat_id` marked inactive; future sends to that parent route via email/SMS.

### Delivery receipts

- **Twilio status callback** → updates `conversation_messages.delivery_status` with `delivered` | `failed` | `undelivered`.
- **Resend webhook** → `delivered` | `bounced` | `complained`.
- **Telegram** — no delivery receipts for group posts. DM sends return immediate success/failure in API response, logged at send time.

### Reconciliation cron

Detailed behavior above (see Team Groups → Reconciliation). Writes to `reconciliation_log` for visibility into drift patterns.

### Monitoring

Three admin-dashboard signals:

- **Delivery failure rate** — % failed over rolling 7d. Alert threshold: >5%.
- **Reconciliation drift rate** — # drift events per night. Persistent high = handler bugs.
- **Unlinked parent percentage** — % of rostered parents without Telegram. Product adoption signal.

No PagerDuty-grade alerting in MVP; email to org admin on critical failures (bot kicked, creation repeatedly failing). Upgrade path if SLA pressure emerges.

## Architecture summary

**Recommended approach: hybrid (event-driven + nightly reconciliation).** Adopted in brainstorming.

- **Group membership sync:** roster change emits an event → handler updates group within seconds. Nightly reconciliation cron detects and fixes any drift.
- **Group lifecycle:** event-driven creation (first event scheduled → group-create job scheduled 7 days out). Cron-driven archival at season end.
- **Coach compose:** synchronous — form → gateway call → group post + inline fan-out. Coach sees delivery result immediately.
- **Scheduled broadcasts:** new `scheduled_broadcasts` table processed by the existing day-before-reminder cron, extended with new `message_type` values.
- **Delivery tracking:** existing Twilio and Telegram webhooks; Resend webhook to be wired (secret already reserved in `.env.example`).

No new worker process. No new job runner infrastructure. All patterns (gateway, cron, webhook handlers) already in the codebase.

## Open items for implementation

None blocking. The following are small decisions that can land during plan/implementation without new design discussion:

1. **Exact copy for nudge banners and invite DMs.** Use the drafts in the onboarding section as starting points; refine with real org input.
2. **Ace avatar and bot description** — pending design system input.
3. **Admin UI ergonomics for "Sent Announcements" list** — default filters, pagination, search.

## Out of scope / deferred

- Player groups for U14+ (parental consent flow, COPPA review) — v2, travel/AAU growth feature
- Coach reply inbox / conversation threading on group posts — post-MVP
- Per-message-type user preference matrix — post-MVP if data shows demand
- Per-org custom Telegram bots — future tenant personalization
- Parents-only side groups separate from the main team group — not planned; single parents-only group is the design
- Email inbound handler — separate design; scaffolding exists in `.env.example`
- Outbox / durable job queue — revisit when SLA pressure emerges
- Multi-language message templates — future localization pass
