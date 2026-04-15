# Phase 1 Implementation Plan: Messaging-First Parent Interface

**Status:** Draft, awaiting user review
**Spec:** `docs/superpowers/specs/2026-04-14-phase-1-messaging-layer-design.md`
**Blocked on:** (1) Phase 0 smoke test pass, (2) resolution of phone-first auth reservations, (3) 10DLC brand registration initiation

---

## Overview

This plan breaks Phase 1 into sequenced tasks with dependencies, verification criteria, and gating user decisions. It's designed to be executed in a separate session (or sessions) after the user has reviewed and approved both the spec and this plan.

Each task has:
- **Type:** `code` (implementation), `config` (external service setup), `decision` (user input required), `verification` (test/validation)
- **Dependencies:** prior tasks that must complete first
- **Acceptance:** how we know the task is done
- **Estimated effort:** rough time commitment (S/M/L/XL)

---

## Pre-work (user-gated, blocks everything)

### P1. Resolve phone-first auth reservations
**Type:** decision · **Effort:** S · **Dependencies:** none

The spec lists four open reservations from the brainstorming conversation that need product decisions before implementation starts:

1. **Shared-device / spouse scenarios** — Option A: each parent is a separate `users` record linked via `family_members_parents`, messages go to all linked parents. Option B: one parent is primary, secondary is attached. Decide.
2. **Lost phone recovery** — Which recovery tiers: (a) email recovery if email on file, (b) admin-mediated recovery, (c) third factor (security question, etc.)? Decide which tiers to support at launch.
3. **Legal framing** — Need a quick check that "magic link is our secure login mechanism" doesn't conflict with any youth-data-privacy rules the pilot org operates under. If concerns exist, document the defensible position.
4. **No-smartphone edge case** — Grandparent / non-SMS user falls back to email-only onboarding. Confirm this edge is in scope for pilot launch.

**Acceptance:** The four decisions are documented in the spec's "Decisions made during design" section. Spec updated to remove the reservations list.

### P2. Initiate Twilio 10DLC brand registration
**Type:** config · **Effort:** M · **Dependencies:** P1

10DLC brand + campaign approval takes 1–3 weeks at Twilio's end. This must be initiated before Week 1 of implementation so the approval lands before Week 9 launch.

- Create Twilio account (or use existing)
- Submit brand registration via Twilio Trust Hub: pilot org's legal entity info
- Submit campaign registration: use case "Mixed" (notifications + customer care), sample messages
- Provision phone number(s) for the pilot org

**Acceptance:** Brand submitted, campaign submitted. Twilio approval status tracked.

### P3. Phase 0 smoke test pass
**Type:** verification · **Effort:** S · **Dependencies:** Phase 0 code complete (already done)

Follow `BETA_LAUNCH_CHECKLIST.md` end-to-end against a real environment (Railway DB, Stripe test keys, Resend API key). Validate the full parent/admin/coach flows before layering new work on top.

**Acceptance:** Every checklist item passes or has a logged ticket. No P0 regressions from Phase 0 work.

---

## Week 1–2: Foundations

### 1.1 Schema migration — new tables and column additions
**Type:** code · **Effort:** M · **Dependencies:** P1

Create new Drizzle schema files:
- `src/lib/db/schema/conversations.ts` — `conversations`, `conversation_messages`, `bot_actions_log`
- `src/lib/db/schema/magic_links.ts` — `magic_links`
- `src/lib/db/schema/phone_verifications.ts` — `phone_verifications`, `phone_opt_ins`

Rename `src/lib/db/schema/messages.ts` → `src/lib/db/schema/announcements.ts` (content is only announcements). Update all imports across the codebase.

Extend `src/lib/db/schema/users.ts`:
- `messaging_primary_channel VARCHAR(20)`
- `messaging_fallback_channel VARCHAR(20)`
- `phone_verified BOOLEAN NOT NULL DEFAULT FALSE`
- `telegram_chat_id VARCHAR(100)`
- `telegram_username VARCHAR(100)`

Run `npm run db:generate` to produce migration files. Review the SQL.

**Acceptance:** `npm run db:push` succeeds against a fresh dev database. All new tables exist with correct indexes. `npm run build` succeeds with zero TypeScript errors.

### 1.2 Install new dependencies
**Type:** code · **Effort:** S · **Dependencies:** none

```bash
npm install twilio @anthropic-ai/sdk
```

**Acceptance:** `package.json` and `package-lock.json` updated. Build succeeds.

### 1.3 Environment variables and configuration
**Type:** config · **Effort:** S · **Dependencies:** 1.2, P2

Add to `.env.example` and Netlify environment:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_WEBHOOK_SIGNING_KEY`
- `ANTHROPIC_API_KEY`
- `MAGIC_LINK_BASE_URL` (defaults to `PUBLIC_APP_URL + /m`)

**Acceptance:** Values set in Netlify. Dev env has test values. `.env.example` documents all required vars.

### 1.4 Magic link module
**Type:** code · **Effort:** M · **Dependencies:** 1.1

Create `src/lib/auth/magic-link.ts`:

- `createMagicLink({ userId, purpose, purposeContext, expiresIn, channel, deliveredTo })` — generates 32-byte random token, hashes, inserts row, returns plaintext token
- `consumeMagicLink(token)` — hashes, atomic UPDATE to mark consumed, returns `{ userId, purpose, purposeContext }` or throws if invalid/expired/consumed
- `expirationForPurpose(purpose)` — returns appropriate TTL per the spec (15 min for login, 1 hour for payment, 24 hours for view-only)

Create `/m/[token]` route handler at `src/pages/m/[token].ts` (or `.astro`) that:
1. Receives plaintext token from URL
2. Calls `consumeMagicLink`
3. Creates Lucia session for the user
4. Redirects to purpose-specific landing page (based on `purpose` and `purposeContext`)

**Acceptance:** Unit tests pass for create / consume / expire / reuse-detection. Manual test: create a link, hit the URL, land in an authenticated session.

### 1.5 Migrate forgot-password to magic link
**Type:** code · **Effort:** S · **Dependencies:** 1.4

Replace the bespoke forgot-password token flow with a call into the magic-link module (purpose: `password_reset_login` or similar). This validates the generalized module works end-to-end and removes duplicate token code.

**Acceptance:** Forgot-password flow still works end-to-end. Test suite passes.

### 1.6 Phone OTP module
**Type:** code · **Effort:** M · **Dependencies:** 1.1, 1.2, 1.3

Create `src/lib/auth/phone-otp.ts`:

- `createPhoneVerification({ phone, purpose, purposeContext })` — generates 6-digit code, hashes, sends SMS via Twilio, returns opaque verification ID
- `verifyPhoneCode(verificationId, code)` — increments attempt counter, validates hash, marks consumed on success
- `purgeExpiredVerifications()` — cleanup cron (can be deferred to Phase 3)

Create API routes:
- `POST /api/auth/phone-verify/send` — accepts `{ phone, purpose }`, creates verification, sends SMS
- `POST /api/auth/phone-verify/check` — accepts `{ verificationId, code }`, returns signed `verified_phone_token` on success

**Acceptance:** Unit tests for happy path, wrong code, expired code, too many attempts. Manual test: send to a real phone, enter code, verify.

### 1.7 Anthropic client + prompt cache setup
**Type:** code · **Effort:** S · **Dependencies:** 1.2, 1.3

Create `src/lib/llm/client.ts` with Anthropic SDK initialization. Read `ANTHROPIC_API_KEY` from env. Export a singleton client.

Create `src/lib/llm/classifier.ts` as a stub that accepts a parent message + context and returns a placeholder `ClassifiedIntent`. Wire up the real classifier in Week 3.

**Acceptance:** Client instantiates. Stub returns correctly-shaped output.

---

## Week 3–4: Inbound + bot tier A (read-only)

### 2.1 Inbound email webhook
**Type:** code · **Effort:** M · **Dependencies:** 1.1, 1.5

Create `POST /api/messaging/inbound/email` that receives Resend inbound webhook payload:
- Verify webhook signature
- Parse sender email, subject, body, in-reply-to headers
- Match sender to a parent user via `users.email`
- Match to existing conversation via reply-to header or create a new conversation
- Insert `conversation_messages` record
- Enqueue for classification (Week 3.4)

**Acceptance:** Send a test email via Resend's console; webhook fires; conversation_messages row created.

### 2.2 Inbound SMS webhook
**Type:** code · **Effort:** M · **Dependencies:** 1.1, 1.6

Create `POST /api/messaging/inbound/sms` that receives Twilio webhook:
- Verify Twilio signature (critical — prevents spoofing)
- Parse From, Body
- Handle STOP/HELP/UNSUBSCRIBE/CANCEL/END/QUIT keywords **first**, before any other logic
- Match From phone to parent user
- If not matched, check pending phone verifications
- If still not matched, treat as unknown-parent message (log, admin inbox, canned response)
- Insert `conversation_messages` record
- Enqueue for classification

**Acceptance:** Send a test SMS from a seeded parent phone; webhook fires; conversation_messages row created. STOP keyword correctly opts out and logs.

### 2.3 Outbound messaging gateway
**Type:** code · **Effort:** L · **Dependencies:** 1.1, 1.6, 2.1, 2.2

Create `src/lib/messaging/gateway.ts`:

- `sendMessage({ parentUserId, body, channel?, conversationId? })` — resolves parent's preferred channel, checks opt-in status, dispatches to SMS/email sender, creates `conversation_messages` record, handles delivery webhooks for status updates.
- Split long SMS messages at semantic boundaries
- Handle delivery failure → fallback channel
- Insert outbound `conversation_messages` with `delivered_at` updated from delivery webhooks

**Acceptance:** Unit tests for channel resolution, opt-in check, split logic. Integration test: send an outbound message to a test parent, verify delivery via Twilio/Resend logs.

### 2.4 LLM classifier (real implementation)
**Type:** code · **Effort:** L · **Dependencies:** 1.7, 2.1, 2.2

Implement `src/lib/llm/classifier.ts` with real Anthropic call:

- System prompt describes: the bot's role, the organization context, the bot action registry (read-only actions only for Week 3), and the classification schema
- Use Anthropic tool-use API for structured output
- Enable prompt caching on the system prompt
- Return `ClassifiedIntent` with confidence threshold logic
- Error handling: fall back to rule-based classifier on Anthropic errors

**Acceptance:** Test suite of 30+ sample parent messages with expected classifications. Classifier achieves >85% accuracy on the test set.

### 2.5 Bot action registry (read-only actions)
**Type:** code · **Effort:** M · **Dependencies:** 2.4

Create `src/lib/bot/actions/` directory with one file per action:

- `lookup-schedule.ts` — returns upcoming events for the parent's kids
- `lookup-team-info.ts` — returns coach, roster, field for a kid/team
- `lookup-next-practice.ts` — returns next practice for a specified kid
- `faq-response.ts` — returns a curated FAQ answer
- `request-human.ts` — escalates immediately

Each action exports a handler that takes `(params, context)` and returns `ActionResult`. Register all actions in a central `registry.ts`.

**Acceptance:** Each action has unit tests. Integration test: classifier identifies intent → action executes → outbound response sent.

### 2.6 Inbound pipeline integration
**Type:** code · **Effort:** M · **Dependencies:** 2.1, 2.2, 2.3, 2.4, 2.5

Wire the pieces together: webhooks call classifier → classifier output dispatches to bot action or routes to admin inbox → bot action result triggers outbound response via gateway.

**Acceptance:** End-to-end test: send inbound email "what time is practice Saturday" → classifier returns lookup_schedule intent → action executes → outbound email sent with schedule info.

### 2.7 Minimal staff inbox UI
**Type:** code · **Effort:** L · **Dependencies:** 2.1–2.6

Create `/messages` route for admins:
- List of conversations sorted by `last_message_at DESC`
- Thread view with chronological messages
- Reply composer (defaults to parent's primary channel)
- Context panel showing parent info, kids, teams, registrations
- Channel indicators on each message
- Bot attribution on bot-sent messages

Defer filters, coach-specific view, and real-time updates to Week 5–6.

**Acceptance:** Admin logs in, navigates to `/messages`, sees conversations, opens a thread, reads bot/parent messages, replies, reply is delivered to parent.

---

## Week 5–6: Bot tier B + mutations

### 3.1 Mutation actions
**Type:** code · **Effort:** M · **Dependencies:** 2.5

Add to bot action registry:
- `rsvp_absent.ts` — marks a kid absent for an upcoming event
- `rsvp_present.ts` — reverses an absent mark
- `confirm_event_cancellation.ts` — acknowledgment-only
- `switch_primary_channel.ts` — updates `users.messaging_primary_channel`

Each includes a scope check (e.g., kid belongs to the requesting parent) and writes to `bot_actions_log` on execution.

**Acceptance:** Unit tests for scope check (deny requests for kids not belonging to parent), happy path, and reversibility.

### 3.2 Confirmation flow for pending mutations
**Type:** code · **Effort:** M · **Dependencies:** 3.1

When classifier returns a mutation with confidence between 0.6 and 0.85:
- Don't execute immediately
- Respond with a confirmation message: `"Mark Maya out for tonight's practice? Reply YES to confirm, NO if that's not right."`
- Track conversation state (`pending_confirmation` sub-state) on the `conversations` row
- Next inbound message is checked against pending action
- On YES → execute, write to log, confirm
- On NO or any other text → cancel, respond

**Acceptance:** Test sequence: ambiguous "can't make it tonight" → bot confirms → parent replies YES → action executes.

### 3.3 Admin reversal UI
**Type:** code · **Effort:** S · **Dependencies:** 3.1

In the admin staff inbox, add a "Bot Actions" tab on each conversation showing entries from `bot_actions_log`. Each reversible action has a "Reverse" button that undoes the action and marks `reversed_at` / `reversed_by_user_id`.

**Acceptance:** Admin reverses a bot-marked absence; kid is no longer absent; audit log reflects reversal.

### 3.4 Smart routing
**Type:** code · **Effort:** M · **Dependencies:** 2.6

Extend the inbound pipeline: when classifier returns `route_to_coach` or `route_to_admin`:
- Look up the appropriate staff user based on the parent's context (for coach routing: kid → team → coach)
- Update the conversation's `assigned_staff_id` and `assignment_role`
- Fire notification to the staff user (dashboard badge + out-of-band SMS/email if configured)
- Outbound response to parent: "A real person will get back to you shortly."

**Acceptance:** Send a message that classifies as `coach_question`; correct coach gets notified; conversation appears in their inbox.

### 3.5 Coach inbox view
**Type:** code · **Effort:** M · **Dependencies:** 2.7, 3.4

Extend `/messages` with coach-specific view: only shows conversations where the coach is assigned OR about kids on their teams. Coach can't reassign to admin; they can only reply or "request admin escalation."

**Acceptance:** Coach logs in, sees only their conversations, replies successfully.

### 3.6 Notification throttling + DND
**Type:** code · **Effort:** S · **Dependencies:** 3.4

Implement notification throttling: if the same staff member was notified in the last 5 minutes, aggregate into "3 new messages" instead of individual alerts.

Add user setting for DND hours (in `users` or `user_settings`). Notifications during DND still land in inbox but don't trigger out-of-band alerts.

**Acceptance:** Fire 5 messages to the same coach in 2 minutes; they receive 1 aggregated notification.

---

## Week 7–8: Outbound migration + registration paths

### 4.1 Migrate existing outbound touchpoints
**Type:** code · **Effort:** M · **Dependencies:** 2.3

Replace direct `sendEmail` calls with `messagingGateway.sendMessage` calls in:
- Registration confirmation
- Payment receipt
- Refund notification
- Waitlist promotion
- Announcement delivery (when target is a parent with SMS as primary)

For each, also create a SMS-friendly version of the message content (shorter, linkified).

**Acceptance:** Test each touchpoint: register → confirmation arrives via the parent's preferred channel. Pay → receipt arrives via preferred channel.

### 4.2 Remove password reset
**Type:** code · **Effort:** S · **Dependencies:** 1.5, 4.1

Parents no longer have passwords. Remove the password reset UI from the parent-facing auth pages. Redirect `/forgot-password` to `/signin` with a note "We sent a magic link to your phone/email." The magic link path becomes the primary authentication flow.

Keep password-based auth for staff users (admins, coaches) — they still log in with email+password.

**Acceptance:** Parent visits /forgot-password, is informed magic link is the login method. Staff flows unchanged.

### 4.3 Registration Path 1 — Self-service with inline OTP
**Type:** code · **Effort:** L · **Dependencies:** 1.6

Modify the existing registration wizard (`src/components/registration/registration-wizard.tsx`) to include phone verification:

- After the parent enters their phone number, show an inline SMS OTP step
- Parent enters 6-digit code, form validates, continues
- Form submission creates user + family member + registration + `phone_opt_ins.opted_in` in one transaction
- Welcome SMS sent on successful registration

**Acceptance:** Full self-service registration flow works end-to-end: form → phone verify → payment → confirmation SMS received.

### 4.4 Registration Path 2 — Returning parent magic path
**Type:** code · **Effort:** M · **Dependencies:** 1.4, 4.1

Add a "Open re-registration" flow:
- Admin triggers "registration is open" notification when creating a new season
- Each returning parent receives a magic link (purpose: `register_for_season`)
- Link opens a pre-filled registration form
- Parent confirms, pays with saved card, done

**Acceptance:** Create a test season; trigger returning-family notifications; one parent taps link, completes flow in under 60 seconds.

### 4.5 Registration Path 3 — Admin-added walk-up
**Type:** code · **Effort:** M · **Dependencies:** 1.6, 4.1

Extend the admin-side "add parent + kid" flow:
- Admin enters details, submits
- System creates `users`, `family_members`, `registrations` with `phone_opt_ins.status = pending`
- System sends opt-in welcome SMS
- Parent replies YES → opt-in flips to `opted_in`, confirmation sent

**Acceptance:** Admin adds a test parent; opt-in SMS arrives; replying YES activates messaging.

### 4.6 Schedule change and reminder notifications
**Type:** code · **Effort:** M · **Dependencies:** 4.1

New outbound touchpoints:
- Practice/game time change → notify affected parents
- Event cancellation → notify affected parents
- Day-of practice reminder (configurable per parent)
- Payment reminder (7 days, 1 day, overdue)
- Welcome message on first registration

Hooked into existing admin actions (editing a season schedule, cancelling an event, cron job for reminders).

**Acceptance:** Admin edits a practice time; affected parents receive SMS/email notification via the gateway.

---

## Week 9–10: Pilot launch

### 5.1 10DLC approval confirmation
**Type:** verification · **Effort:** S · **Dependencies:** P2

Confirm Twilio has approved the brand + campaign. Flip the SMS sending feature flag to production.

**Acceptance:** Twilio dashboard shows approved status; test SMS from production sends successfully.

### 5.2 Pilot org data migration
**Type:** code · **Effort:** M · **Dependencies:** 4.1–4.6

For the pilot org's existing parents:
- Set `messaging_primary_channel` based on existing data (email as default)
- Prompt existing parents (via email) to verify their phone number so they can opt into SMS
- Run migration to set `phone_opt_ins` for parents who have given consent via their existing waiver

**Acceptance:** Every pilot-org parent has a defined primary channel and opt-in status.

### 5.3 Pilot launch SMS
**Type:** code · **Effort:** S · **Dependencies:** 5.1, 5.2

Send a welcome-to-messaging SMS to all opted-in pilot org parents with a brief orientation: "Hi Sarah — you can now text us directly with questions about Maya's practices, schedule, or anything else. Try 'schedule this week' to see what's coming up. — Aspire"

**Acceptance:** SMS sent to pilot org opt-ins. Reply rate >10% within 24 hours indicates engagement.

### 5.4 Monitoring and iteration
**Type:** verification · **Effort:** ongoing · **Dependencies:** 5.3

- Classifier accuracy monitoring (flag low-confidence, route-to-human, classifier failures)
- Bot error rate tracking
- Delivery failure rate tracking
- Daily review of admin inbox for edge cases
- Weekly review with pilot org coach and admin

**Acceptance:** Two weeks of pilot operation with no P0 incidents and documented feedback captured.

---

## Post-Phase-1 fast follow (outside the 10-week plan but tracked)

### F1. Telegram channel integration
**Type:** code · **Effort:** M · **Dependencies:** pilot launch stable

- Create Telegram bot via BotFather
- Inbound webhook + outbound send module
- Per-parent opt-in flow (deep link binding)
- Inline keyboard buttons for confirmations
- Telegram as selectable primary channel

### F2. Server-Sent Events for real-time inbox
**Type:** code · **Effort:** M

Replace 10-second polling in staff inbox with SSE or equivalent, so new messages appear instantly.

### F3. Analytics and reporting
**Type:** code · **Effort:** M

Dashboard surfaces for: bot resolution rate, average classifier confidence, top intents, conversation volume, response time distribution, channel mix.

---

## Risks and mitigations

- **10DLC rejection.** If Twilio rejects the campaign, iterate on sample messages. Mitigation: start registration in P2 with buffer time; have a backup SMS provider (Sinch, MessageBird) evaluated in case Twilio is unusable.
- **Classifier accuracy below 85%.** If the LLM can't reliably classify, tier B mutations get unsafe. Mitigation: strict confidence threshold (0.85), button confirmation for 0.6-0.85, route to human for <0.6. Worst case: disable tier B mutations temporarily and run in tier A (read-only) mode.
- **Parent opt-in rate too low.** If only 20% of parents opt in, the messaging layer doesn't reach the critical mass to prove the thesis. Mitigation: make the welcome UX very compelling; run the pilot with proactive admin outreach encouraging opt-in.
- **Stripe checkout in magic-link task page fails.** Less likely (Stripe is reliable) but high-impact. Mitigation: extensive manual testing of the magic-link-to-payment flow before launch; fallback to emailed Stripe hosted checkout.
- **Phone-first auth reservations unresolved.** P1 blocks everything. Mitigation: drive to resolution in the first user-review session after this plan is reviewed.

---

## Definition of done for Phase 1

See the spec's "Definition of done" section. Copying here for ease of reference:

- [ ] Phase 0 complete, smoke test passed
- [ ] Phone-first auth reservations resolved with user
- [ ] Schema migration applied
- [ ] Twilio 10DLC approved
- [ ] Email + SMS inbound working
- [ ] Magic-link module functional; forgot-password migrated
- [ ] Phone OTP functional on registration wizard
- [ ] All 3 registration paths working
- [ ] Bot handles all 9 tier-B actions with >90% accuracy on test suite
- [ ] Smart routing working
- [ ] Staff inbox UI functional for admin + coach
- [ ] All outbound parent touchpoints migrated
- [ ] Pilot org running 2+ weeks without P0 incidents
- [ ] Bot actions log captures mutations with working reversal
- [ ] STOP/HELP keyword handling tested
- [ ] Monitoring in place

---

## Change log

- 2026-04-14: Initial draft. Awaiting user review.
