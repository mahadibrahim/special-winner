# Phase 1 Deployment Checklist

**Audience:** whoever is taking the Phase 1 messaging layer from code-complete to a running pilot
**Estimated time to pilot:** 1-3 weeks (10DLC brand approval at Twilio is the critical-path gating item)

This checklist exists because Phase 1 involves a handful of external services that must be set up in a specific order. If you follow it top to bottom, nothing should block on anything above it.

---

## 0. Pre-flight

- [ ] Read `docs/superpowers/specs/2026-04-14-phase-1-messaging-layer-design.md` — the full Phase 1 spec
- [ ] Read `docs/superpowers/decisions/2026-04-15-phase-1-auth-reservations.md` — the four auth reservation defaults. Override any you disagree with before shipping.
- [ ] Skim `docs/superpowers/plans/2026-04-14-phase-1-messaging-layer-plan.md` — the sequenced task plan, mostly for reference at this point since the code is written
- [ ] Confirm Phase 0 smoke test passed (see `BETA_LAUNCH_CHECKLIST.md` — Phase 0 is the gating prerequisite)

---

## 1. Database migration

- [ ] Make sure `DATABASE_URL` is set in your environment (local dev and/or Railway)
- [ ] Run `npm run db:push` to apply the Phase 1 schema migration (`src/lib/db/migrations/0001_loose_korvac.sql`)
- [ ] Verify new tables exist: `conversations`, `conversation_messages`, `bot_actions_log`, `magic_links`, `phone_verifications`, `phone_opt_ins`, `family_member_parents`
- [ ] Verify new columns exist on `users`: `phone_verified`, `messaging_primary_channel`, `messaging_fallback_channel`, `telegram_chat_id`, `telegram_username`
- [ ] Verify the old `messages.ts` filename has been renamed to `announcements.ts` in the schema module (table name is unchanged, just the source file)

**Rollback:** if the migration fails, the Drizzle snapshot in `src/lib/db/migrations/meta/0001_snapshot.json` gives you a target to rollback to. Or drop the new tables manually and roll back the file to the pre-migration state.

---

## 2. Twilio + 10DLC (critical path — start this first)

**Why first:** 10DLC brand/campaign approval takes 1-3 weeks at Twilio's end. If you start this on day 14 of a 2-week pilot ramp, you'll miss launch.

- [ ] Create a Twilio account if you don't have one: https://console.twilio.com
- [ ] Buy (or provision) a phone number for the pilot org
- [ ] Start brand registration via Twilio Trust Hub: https://console.twilio.com/us1/develop/sms/regulatory-compliance
  - Use the pilot organization's legal entity info
  - Expect 1-3 weeks for brand approval
- [ ] Create a 10DLC campaign under the brand
  - Use case: **Mixed** (notifications + customer care)
  - Sample messages required — the ones in `src/lib/messaging/notifications.ts` and `src/lib/sms/compliance.ts` are good starting points
  - Expect another 1-3 business days for campaign approval
- [ ] Create (or reuse) a Messaging Service and attach your phone number + campaign
- [ ] Populate environment variables:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER` (or `TWILIO_MESSAGING_SERVICE_SID` — messaging service is preferred)
  - `TWILIO_WEBHOOK_AUTH_TOKEN` (usually same as `TWILIO_AUTH_TOKEN`)
- [ ] Configure the Twilio phone number's "A message comes in" webhook to `POST https://your-app.com/api/messaging/inbound/sms`

**Local testing without 10DLC approval:** Twilio trial accounts can send SMS to verified caller IDs only. Add your own phone as a verified caller and you can test send/receive end-to-end against the inbound webhook.

---

## 3. Anthropic (for the bot classifier)

- [ ] Create an account at https://console.anthropic.com
- [ ] Generate an API key
- [ ] Populate:
  - `ANTHROPIC_API_KEY=sk-ant-...`
  - Optional: `ANTHROPIC_CLASSIFIER_MODEL=claude-haiku-4-5` (default)

**Cost expectation:** classification runs at ~$0.0001 per inbound message with prompt caching. At 5,000 messages/day, that's ~$0.50/day. Non-issue for the pilot.

**Fallback:** if `ANTHROPIC_API_KEY` is not set, the classifier automatically falls back to a dumb keyword-based rule-based classifier. It will work for the most common intents (schedule queries, absences, payment questions) but will route everything else to admin.

---

## 4. Resend inbound (for bidirectional email)

- [ ] You already have Resend configured for outbound. For Phase 1 bidirectional email, also:
  - Configure Resend inbound email on a domain you control (e.g. `inbound.aspiresports.com`)
  - Set the inbound webhook destination to `POST https://your-app.com/api/messaging/inbound/email`
  - Set a webhook signing secret in Resend and add it to env as `RESEND_INBOUND_WEBHOOK_SECRET`

**If you don't care about inbound email** (SMS-only pilot), you can skip this entirely. Outbound email continues to work via the existing `RESEND_API_KEY`.

---

## 5. Telegram (fast follow, optional for initial pilot)

Phase 1 supports Telegram as a third channel. It's optional — skip if you want SMS-only at launch.

- [ ] Talk to `@BotFather` on Telegram: `/newbot`, give it a name (e.g. "Aspire Sports"), get a username and bot token
- [ ] Populate env:
  - `TELEGRAM_BOT_TOKEN=...` (from BotFather)
  - `TELEGRAM_BOT_USERNAME=...` (without the @, used for deep links)
  - `TELEGRAM_WEBHOOK_SECRET=...` (generate a random 32-char string)
- [ ] Register the webhook — one-time operation, can be done via curl:
  ```bash
  curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
    -H "Content-Type: application/json" \
    -d '{
      "url": "https://your-app.com/api/messaging/inbound/telegram",
      "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
      "allowed_updates": ["message", "callback_query"]
    }'
  ```
- [ ] Test by DMing your bot `/start` — you should get the "link your Aspire account" intro message

**Parent binding flow:** Parents click a Connect Telegram link from the dashboard. It calls `POST /api/dashboard/settings/telegram/link` which returns a `t.me/<bot>?start=<magic-token>` URL. Parent taps it, Telegram opens, sends `/start <token>` to the bot, our inbound webhook consumes the token and binds the chat ID to the parent's `users` row.

---

## 6. Cron (for day-before reminders)

- [ ] Set `CRON_SECRET` to a random string in env
- [ ] Configure a daily scheduler to hit `POST /api/cron/day-before-reminders` with the header `x-cron-secret: <CRON_SECRET>`

Options for the scheduler:
- **Netlify scheduled functions** (easiest if you're already on Netlify)
- **GitHub Actions cron** (free, checked into the repo)
- **cron-job.org** or another uptime-monitor-as-cron service
- **Railway cron** if you host the DB there

Recommended frequency: once per day, around 5pm local time (sends reminders ~24h before evening events).

---

## 7. Environment variables summary

Double-check every variable is set:

```
# Core
DATABASE_URL=
AUTH_SECRET=
PUBLIC_APP_URL=

# Stripe (existing)
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Email (existing)
RESEND_API_KEY=
RESEND_FROM_EMAIL=
RESEND_INBOUND_WEBHOOK_SECRET=   # NEW — for bidirectional email

# Phase 1 — SMS
TWILIO_ACCOUNT_SID=               # NEW
TWILIO_AUTH_TOKEN=                # NEW
TWILIO_PHONE_NUMBER=              # NEW (or TWILIO_MESSAGING_SERVICE_SID)
TWILIO_MESSAGING_SERVICE_SID=     # NEW (preferred over phone number)
TWILIO_WEBHOOK_AUTH_TOKEN=        # NEW

# Phase 1 — LLM
ANTHROPIC_API_KEY=                # NEW
ANTHROPIC_CLASSIFIER_MODEL=       # NEW (optional)

# Phase 1 — Magic links
MAGIC_LINK_BASE_URL=              # NEW (optional, defaults to $PUBLIC_APP_URL/m)

# Phase 1 — Telegram (optional for initial pilot)
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=

# Phase 1 — Cron
CRON_SECRET=                      # NEW
```

---

## 8. Dry-run checklist (after all services configured)

Before letting real parents near the system:

- [ ] **Magic-link flow:** trigger a password-reset from an existing account, confirm the email contains a `/m/<token>` URL, tap it, confirm it lands you in an authenticated session on the dashboard
- [ ] **Phone OTP flow:** log in, go to `/dashboard/settings/verify-phone`, enter your own phone, confirm you receive the 6-digit code, enter it, confirm the success badge and that `users.phone_verified` flips to true in the DB
- [ ] **Inbound SMS:** send "what time is practice" from your verified phone to the Twilio number. Check: the SMS webhook fires, a conversation is created, the classifier runs, a response comes back
- [ ] **STOP compliance:** reply STOP from the same phone. Confirm: you get the opt-out confirmation, `phone_opt_ins` row flips to `opted_out`
- [ ] **Re-opt-in:** reply START. Confirm: opt-in flips back to `opted_in`
- [ ] **Schedule change notification:** log in as admin, edit a game's scheduledAt. Confirm: affected parents get a "heads up, game moved from X to Y" text
- [ ] **Game cancellation:** change a game's status to "cancelled". Confirm: affected parents get a cancellation text
- [ ] **Game deletion:** delete a game. Confirm: affected parents get a cancellation text BEFORE the row is removed
- [ ] **Day-before reminder cron:** manually trigger `POST /api/cron/day-before-reminders` with the correct `x-cron-secret` header. Confirm reminders fire for events within the 16-36h window
- [ ] **Walk-up registration:** admin visits `/admin/walk-up-registration`, fills out the form, submits. Confirm: parent gets the opt-in welcome SMS. Reply YES as the parent. Confirm: `phone_opt_ins` flips to `opted_in` and the confirmation message arrives
- [ ] **Re-registration campaign:** admin visits `/admin/re-registration-campaign`, picks a season, runs dry-run. Confirm: the preview shows returning families. Run real campaign. Confirm: families receive magic links and tapping them auto-auths + pre-fills the form
- [ ] **Staff inbox:** admin visits `/messages`, sees recent conversations. Click one, reply. Confirm: parent gets the reply through their preferred channel, appears in the thread
- [ ] **Coach inbox scoping:** log in as a coach (not admin). Visit `/messages`. Confirm you only see conversations about parents whose kids are on your team — not other coaches' conversations
- [ ] **Bot action reversal:** find a conversation where the bot marked a kid absent. As admin, open the bot actions log and hit "Reverse". Confirm attendance row flips back to "present"

If any of those fail, don't let parents in yet. Fix the failure before proceeding to pilot launch.

---

## 9. Pilot launch

Once the dry-run passes end-to-end, proceed to the narrow parent rollout:

- [ ] Pick 10-20 parents from your pilot org who will tolerate a beta
- [ ] Verify their phone numbers via the admin users list
- [ ] Manually opt them in via `phone_opt_ins` (or run the walk-up flow for each)
- [ ] Send a "hey, we're launching a new messaging experience" intro message — just a welcome and a prompt to try asking the bot a question
- [ ] Monitor the admin staff inbox daily for the first week
- [ ] Review bot classifier accuracy on the first 100 messages — anything below 85% correct classification is a tuning opportunity
- [ ] Daily review of delivery failures and escalations

---

## 10. Going wider

Don't expand beyond the pilot org until you have at least 2 weeks of stable operation and a few measurable wins (parent feedback, reduction in admin inbox volume, etc.). Phase 3 adds the multi-tenant support needed for a second org; expanding beyond the pilot means going through Phase 2 and Phase 3 first.

---

## What each path looks like in prod

**A parent texts in "when is Maya's next practice?":**
1. Twilio webhook fires `POST /api/messaging/inbound/sms`
2. Signature verified, STOP/HELP check runs, parent looked up by phone
3. Conversation row resolved or created
4. `conversation_messages` row inserted (direction=inbound, channel=sms)
5. `routeInboundMessage` called async
6. Classifier context built (parent, kids, teams, upcoming events, recent conversation)
7. Anthropic Haiku called with structured output — intent classified as `schedule_query`, confidence high
8. Action dispatched: `lookup_schedule` runs, returns the next event
9. Response body composed from action result
10. Outbound gateway sends the reply via Twilio
11. `conversation_messages` row inserted (direction=outbound, channel=sms, sender=bot)

**Admin edits a game's start time:**
1. Admin hits PUT `/api/admin/games` with new scheduledAt
2. Endpoint loads the previous scheduledAt and status
3. Database update runs
4. `notifyScheduleChange` fires async
5. Notification module loads game context (teams, venue, season)
6. Finds every parent of kids on home or away team rosters
7. Composes "heads up, game moved from X to Y" text per parent
8. Sends via outbound gateway (channel preference, opt-in check, fallback)
9. Admin gets a 200 OK before most of the sends have completed — delivery happens in the background

---

Last updated: 2026-04-15
