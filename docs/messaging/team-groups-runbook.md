# Team Groups: Operator Runbook

## Pending manual creation

Telegram Bot API does not allow bots to create groups programmatically. When a
team's group is due for creation (7 days before first event), the system marks
it `status = 'pending_manual_creation'` rather than failing.

### What to do

1. Dashboard shows a "Groups awaiting creation" list on the admin home (future feature).
2. For each pending group:
   a. In the Telegram app, create a new Supergroup.
   b. Add the Ace bot (@AspireAceBot or the configured bot) as an admin with "Invite Users" and "Change Info" permissions.
   c. Copy the group's chatId.
   d. (Future) Paste the chatId into the admin UI and press "Promote to active".
3. The system will set the title, description, generate an invite link, and DM-invite all eligible parents.

### Automation path

This manual step is a Telegram API limitation. If we later adopt a paid
"template bot" provider, we can automate creation. Until then, org admins
must perform the above flow per team per season.

## Archival

- Groups auto-archive 7 days after season `end_date`.
- Ace posts a farewell, leaves the group.
- Group persists in Telegram with full history for parents.

## Reconciliation

- Runs nightly via `POST /api/cron/reconcile-team-groups`.
- Schedule via cron-job.org, GitHub Actions, or equivalent external scheduler.
- Inspect drift in `reconciliation_log` table.

## Urgent override

- Coaches and admins see "Mark as urgent" checkbox in compose.
- Urgent forces SMS fan-out to all parents regardless of time-to-event.
- All urgent sends logged with `broadcast_log.is_urgent = true` — review periodically.

## Cron schedule (suggested)

| Endpoint | Frequency |
|---|---|
| `/api/cron/create-scheduled-team-groups` | every 1 hour |
| `/api/cron/reconcile-team-groups` | every 24 hours, low-traffic window |
| `/api/cron/archive-team-groups` | every 24 hours |
| `/api/cron/process-scheduled-broadcasts` | every 15 minutes |

All cron endpoints require header `x-cron-secret: $CRON_SECRET`.

## Environment variables

- `TELEGRAM_BOT_TOKEN` — the Ace bot token
- `TELEGRAM_DRY_RUN=true` — set in test environments to stub all Telegram HTTP calls
- `CRON_SECRET` — shared secret for cron endpoints
- `TEST_TEAM_ID` — (optional) seed team UUID used by E2E tests
