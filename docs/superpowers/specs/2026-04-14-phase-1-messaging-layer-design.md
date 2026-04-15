# Phase 1: Messaging-First Parent Interface

**Status:** Approved 2026-04-14, implementation plan pending user review
**Owner:** Mahad Ibrahim
**Reviewer:** (self)
**Depends on:** Phase 0 (Platform Health & Curriculum Integration) must be complete
**Scope:** Pilot — one real organization, not multi-tenant public launch

---

## Summary

Ship a messaging-first parent interaction layer that meets parents on the channels they already use (SMS and email at launch, Telegram as fast follow), eliminating the "install our app" friction that defines every competing youth sports platform. Parents primarily interact with Aspire through SMS and email; the web dashboard remains a full-featured first-class experience but is reached through magic links rather than browsed into.

The bot handles low-risk mutations (schedule queries, RSVPs, cancellation confirmations, Q&A) via an LLM-backed understanding layer with button fallbacks for safety. Higher-risk actions (payments, registration, refunds, legal agreements) flow through secure magic-link web pages. Coaches and admins live in the web app — messaging is the parent surface. When parents send messages the bot can't confidently handle, an LLM-based intent classifier routes them to the right human (coach or admin) via a new unified staff inbox.

This phase proves the differentiation thesis in contact with reality — real parents, real SMS, real money — in a single-organization pilot. It is designed with multi-tenant public launch (Phase 3) in mind, so the data model, tenant scoping, and messaging infrastructure don't require rewriting when we scale beyond one org.

## Goals

1. **Validate the differentiation thesis** — parents interact with Aspire primarily through SMS and email, and it feels dramatically better than competitors.
2. **Deliver a compelling partner-conversation artifact** — something real and working that Mahad can demo to prospective local operators.
3. **Establish the data model and infrastructure for multi-tenant messaging** without prematurely shipping the multi-tenant launch.
4. **Prove the bot's tier-B capability bar** is both useful enough to be differentiating and bounded enough to be safe.
5. **Route conversations the bot can't handle to the right human** via intent classification.

## Non-goals

- Multi-tenant public launch (Phase 3)
- Bot tier C (text-based payments, text-based registration) — deferred indefinitely
- Telegram channel in initial ship (fast follow, weeks after launch)
- WhatsApp, iMessage, Facebook Messenger, Discord — none in scope, possibly never
- Voice/MMS support
- Multi-language support
- Bot-initiated proactive outreach ("we haven't heard from Sarah in a while")
- Self-service organization onboarding
- Analytics / reporting dashboards on bot performance
- Coach-facing messaging interface (coaches respond from the web app, not from their phone)

## Context

### Phase 0 dependency

This phase cannot begin until Phase 0 (Platform Health & Curriculum Integration) is complete. Specifically:

- The admin dashboard must be performance-parallelized (new staff inbox UI will be added to similar admin surfaces and shouldn't inherit the sequential-query anti-pattern)
- Dead UI must be cleaned up (we don't want to ship a messaging layer alongside existing broken buttons)
- The smoke test in Phase 0 must pass before Phase 1 implementation begins, so we know what we're building on is actually working

### Existing infrastructure this phase builds on

- **Email (`src/lib/email/`)** — Resend v6.7.0, `sendEmail()` helper, 7 working templates, `emailLogs` table. Extended here for transactional and conversational email.
- **Announcements (`src/lib/db/schema/messages.ts` — misnamed)** — existing broadcast-outbound mechanism. Kept as-is; broadcast and 1:1 conversations are separate primitives. Schema file will be renamed to `announcements.ts` and a new `conversations.ts` created.
- **Forgot password token flow (`src/pages/api/auth/forgot-password.ts`)** — existence proof of a signed-token pattern. Generalized into a magic-link system.
- **Lucia session auth (`src/lib/auth/`)** — kept for web sessions. Magic links produce Lucia sessions when consumed.
- **Stripe (`src/lib/stripe/`)** — used for magic-link payment task pages.
- **`users.phone` column** — already exists, no schema change needed.
- **`organizations`, `seasons`, `teams`, `registrations`, `users`, `family_members` schema** — already tenant-scoped in the right ways for the messaging layer's data needs.

### Net-new things this phase creates

- **SMS infrastructure** (Twilio, 10DLC brand/campaign registration, inbound webhook, send/receive helpers). 100% greenfield.
- **LLM integration** (Anthropic SDK, intent classification, action dispatch). 100% greenfield.
- **Bidirectional messaging data model** (`conversations`, `conversation_messages`, `conversation_participants`). Greenfield.
- **Magic-link auth system** (generalized from the forgot-password token pattern). New module.
- **Phone OTP verification flow** (for registration-path 1 and for recovery). Greenfield.
- **Bot action registry** (declarative set of what the bot is allowed to do). Greenfield.
- **Intent classifier** (LLM prompt + structured output → action or escalation). Greenfield.
- **Staff inbox UI** (new "Messages" section in web app for coaches + admins). Greenfield.
- **Inline phone OTP on registration wizard** (modification to existing wizard). Extension.

---

## Architecture overview

```
┌────────────────────────────────────────────────────────────────┐
│                         PARENT SURFACE                         │
│                                                                │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐                │
│  │   SMS    │   │  Email   │   │  Web (via    │                │
│  │ (Twilio) │   │ (Resend) │   │ magic-link)  │                │
│  └─────┬────┘   └─────┬────┘   └───────┬──────┘                │
└────────┼─────────────┼─────────────────┼───────────────────────┘
         │             │                 │
┌────────▼─────────────▼─────────────────▼───────────────────────┐
│                    MESSAGING GATEWAY                            │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  Inbound webhook handlers                            │      │
│  │  (POST /api/messaging/inbound/{sms|email})           │      │
│  └──────────────────┬───────────────────────────────────┘      │
│                     │                                           │
│  ┌──────────────────▼───────────────────────────────────┐      │
│  │  Channel normalization → Message record              │      │
│  │  Parent lookup by phone/email                         │      │
│  │  Create/resume Conversation                           │      │
│  └──────────────────┬───────────────────────────────────┘      │
│                     │                                           │
│  ┌──────────────────▼───────────────────────────────────┐      │
│  │  LLM intent classifier                               │      │
│  │  (Anthropic Haiku, structured output)                │      │
│  │  → { intent, confidence, action, route_to }          │      │
│  └──────────────────┬───────────────────────────────────┘      │
│                     │                                           │
│          ┌──────────┴──────────┐                                │
│          │                     │                                │
│  ┌───────▼────────┐   ┌────────▼─────────┐                      │
│  │  Bot executes  │   │  Route to human  │                      │
│  │  tier-B action │   │  (staff inbox)   │                      │
│  └───────┬────────┘   └────────┬─────────┘                      │
│          │                     │                                │
│  ┌───────▼────────┐   ┌────────▼─────────┐                      │
│  │ Outbound reply │   │  Notification    │                      │
│  │ via channel    │   │  to coach/admin  │                      │
│  └────────────────┘   └──────────────────┘                      │
└────────────────────────────────────────────────────────────────┘
                      │
┌─────────────────────▼──────────────────────────────────────────┐
│                      STAFF SURFACE                              │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  Web app: /messages                                  │      │
│  │  Threaded conversations, parent/kid context          │      │
│  │  Coach inbox (their teams) + Admin inbox (everything)│      │
│  │  Reply → outbound via parent's preferred channel     │      │
│  └──────────────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────────────┘
```

### Key principles

- **Channel-agnostic message model.** A `conversation_message` has a `channel` field (`sms`, `email`, `telegram`, `web`), but the conversation itself spans channels. A parent can text in, we respond via email, they reply via text — same thread.
- **Parent is the conversation participant, not the phone.** The phone is an authentication factor and a delivery address, but the logical participant is the parent account. Multi-channel parents (phone + email) have their messages merged into one thread.
- **Bot, not staff, is the first responder.** Every inbound message is classified first. Only when the LLM can't confidently handle does it route to a human.
- **Tenant scoping is baked in from day one.** Every conversation, message, and bot action is scoped to an organization, even though the pilot only has one org. This is the difference between pilot-first code and multi-tenant-retrofit code.

---

## Data model

### New tables

#### `conversations`

A conversation is a thread between a parent and the organization (any staff + bot). One parent may have multiple conversations if they have multiple kids across multiple teams, but the default model is one conversation per parent per organization.

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, archived, muted
  assigned_staff_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- current responder on staff side
  assignment_role VARCHAR(20),  -- 'bot', 'coach', 'admin', null
  last_message_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_inbound_at TIMESTAMP,  -- for "unread from parent" logic
  last_outbound_at TIMESTAMP,
  subject_context JSONB,  -- { team_id, registration_id, season_id } — captured at conversation start for context
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_org_parent ON conversations(organization_id, parent_user_id);
CREATE INDEX idx_conversations_assignment ON conversations(organization_id, assignment_role, assigned_staff_id);
CREATE INDEX idx_conversations_last_message ON conversations(organization_id, last_message_at DESC);
```

#### `conversation_messages`

Each message is one side of the exchange — inbound or outbound — on one channel.

```sql
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,  -- denormalized for tenant queries
  direction VARCHAR(10) NOT NULL,  -- 'inbound' | 'outbound'
  channel VARCHAR(20) NOT NULL,  -- 'sms' | 'email' | 'telegram' | 'web'
  sender_type VARCHAR(20) NOT NULL,  -- 'parent' | 'bot' | 'coach' | 'admin' | 'system'
  sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  external_message_id VARCHAR(255),  -- Twilio SID, Resend message ID, Telegram update ID
  body TEXT NOT NULL,
  body_html TEXT,  -- for email
  attachments JSONB,  -- [{ url, mime, name }]
  intent_classification JSONB,  -- { intent, confidence, action, route_to, reasoning } — populated by LLM for inbound
  bot_action_result JSONB,  -- { action, success, details } — populated when bot executes
  delivered_at TIMESTAMP,
  failed_at TIMESTAMP,
  failure_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversation_messages_conversation ON conversation_messages(conversation_id, created_at);
CREATE INDEX idx_conversation_messages_org ON conversation_messages(organization_id, created_at DESC);
CREATE INDEX idx_conversation_messages_external ON conversation_messages(external_message_id);
```

#### `magic_links`

Generalized single-use signed tokens bound to a specific action.

```sql
CREATE TABLE magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,  -- sha256 of the plaintext token; plaintext never stored
  purpose VARCHAR(50) NOT NULL,  -- 'login', 'pay_invoice', 'view_development_report', 'register_for_season', 'update_medical_info', etc.
  purpose_context JSONB,  -- { invoice_id, season_id, kid_id, etc. } — action-specific scope
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,  -- single-use: consumed_at IS NOT NULL means the link has been used
  delivered_channel VARCHAR(20),  -- 'sms' | 'email' | 'telegram'
  delivered_to VARCHAR(255),  -- phone or email
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_magic_links_token_hash ON magic_links(token_hash);
CREATE INDEX idx_magic_links_user_purpose ON magic_links(user_id, purpose, expires_at);
```

**Security notes:**
- The token itself is a cryptographically random 32-byte value, base64url-encoded (~43 chars). Never logged, never stored in plaintext.
- Only the SHA-256 hash is persisted. Consumption verifies by hashing the incoming token and comparing.
- Default expiration: 1 hour for high-sensitivity purposes (pay, register, update medical); 15 minutes for login; 24 hours for low-sensitivity purposes (view a development report).
- Single-use enforced at consumption time with a transactional `UPDATE ... WHERE consumed_at IS NULL`.
- Consumption produces a Lucia session scoped to the user, so downstream code uses the existing session auth.

#### `phone_verifications`

Short-lived OTP codes for phone number verification during registration and recovery.

```sql
CREATE TABLE phone_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,  -- sha256 of the 6-digit code
  purpose VARCHAR(50) NOT NULL,  -- 'registration', 'phone_change', 'recovery'
  purpose_context JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMP NOT NULL,  -- typically 10 minutes
  consumed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_phone_verifications_phone ON phone_verifications(phone, created_at DESC);
```

#### `phone_opt_ins`

10DLC compliance: track opt-in status per phone number per organization, with audit trail of opt-in/opt-out events.

```sql
CREATE TABLE phone_opt_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  phone VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,  -- 'pending' | 'opted_in' | 'opted_out'
  opted_in_at TIMESTAMP,
  opted_out_at TIMESTAMP,
  opt_in_source VARCHAR(50),  -- 'registration_form' | 'welcome_reply_yes' | 'admin_added'
  stop_keyword_triggered TEXT,  -- 'STOP', 'UNSUBSCRIBE', etc. — stored for audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_phone_opt_ins_org_phone ON phone_opt_ins(organization_id, phone);
```

#### `bot_actions_log`

Audit trail of every action the bot took on behalf of a parent, for recovery and debugging.

```sql
CREATE TABLE bot_actions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  triggered_by_message_id UUID REFERENCES conversation_messages(id) ON DELETE SET NULL,
  action_type VARCHAR(50) NOT NULL,  -- 'rsvp_absent', 'rsvp_present', 'confirm_cancellation', 'lookup_schedule', etc.
  action_params JSONB,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  reversible BOOLEAN NOT NULL DEFAULT TRUE,
  reversed_at TIMESTAMP,
  reversed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Schema changes to existing tables

#### `users`

Add fields for messaging preferences:

```sql
ALTER TABLE users
  ADD COLUMN messaging_primary_channel VARCHAR(20),  -- 'sms' | 'email' | 'telegram'
  ADD COLUMN messaging_fallback_channel VARCHAR(20),
  ADD COLUMN phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN telegram_chat_id VARCHAR(100),  -- for Telegram fast-follow
  ADD COLUMN telegram_username VARCHAR(100);
```

`phone` column already exists; no change.

#### `messages.ts` → rename to `announcements.ts`

Rename `src/lib/db/schema/messages.ts` to `src/lib/db/schema/announcements.ts` to match what the file actually contains. Create new `src/lib/db/schema/conversations.ts` for the new tables above. Update all imports accordingly.

---

## Channels

### Email (extend existing infrastructure)

**Infrastructure:** Existing `src/lib/email/` module. Add:
- **Inbound webhook handler** at `/api/messaging/inbound/email` using Resend's inbound webhook feature. Parses incoming email, matches sender to a parent via email address, creates a `conversation_messages` record, hands off to the classifier.
- **Reply-threading logic.** When we send an outbound conversation message via email, we set a `Reply-To` address scoped to the conversation (e.g., `conv-{id}@inbound.aspire.sh`) or use Resend's threaded reply-to. The inbound webhook uses the To address to reconstruct which conversation the reply belongs to.
- **Rich rendering.** Outbound conversational emails use a simpler template than the existing transactional templates — closer to a plain-text-ish layout, to feel like a personal message rather than a marketing email. New template: `src/lib/email/templates/conversation-message.tsx`.

**Fallback behavior:** If SMS delivery fails for a parent who has both channels, attempt email. If both fail, mark the message `failed` and surface in the admin inbox.

### SMS (new via Twilio, 10DLC-compliant)

**Infrastructure:**
- Add `twilio` dependency.
- New module `src/lib/sms/` with:
  - `client.ts` — Twilio client initialization
  - `send.ts` — outbound SMS with built-in rate limiting and `phone_opt_ins` status check
  - `webhook.ts` — inbound webhook handler
  - `templates.ts` — message templates scoped for 160-char SMS limits and the "Reply YES/NO" button-equivalent pattern
  - `compliance.ts` — opt-in/out helpers, STOP/HELP keyword handling, audit logging

**10DLC compliance requirements:**
- Brand registration (pilot org's business entity) via Twilio Trust Hub. User-gated task since it requires legal info — flagged in the implementation plan as a pre-build step, not code.
- Campaign registration with a declared use case (notifications, customer care, mixed). We use "mixed" to cover outbound reminders + 2-way bot conversations.
- Sample message content submitted with the campaign.
- Opt-in language on every first message: `"Msg&data rates may apply. Reply STOP to opt out, HELP for info."`
- STOP, UNSUBSCRIBE, CANCEL, END, QUIT keywords processed before any other logic. Immediate opt-out + confirmation reply.
- HELP keyword returns a canned response with org contact info.
- All opt-in/opt-out events logged to `phone_opt_ins` with timestamp + source.

**Inbound webhook:**
- `POST /api/messaging/inbound/sms` receives Twilio webhook payload
- Signature verification against Twilio auth token (critical — prevents webhook spoofing)
- Parse message, look up parent by `From` phone number
- If phone not matched: check pending registration OTPs; otherwise treat as an unknown-parent message (logged, admin inbox, canned response)
- If phone matched: create `conversation_messages`, enqueue for classification

**Outbound sending:**
- Check `phone_opt_ins.status` = `opted_in` before sending. If `opted_out`, do not send.
- For multi-segment messages (>160 chars), split at semantic boundaries, not mid-word.
- Log every send with Twilio SID for reconciliation.
- Handle Twilio delivery webhooks to update `conversation_messages.delivered_at` and `failed_at`.

### Telegram (fast follow, post-launch)

**Explicitly deferred from initial Phase 1 ship.** Designed into the data model (`telegram_chat_id`, `telegram_username` columns on `users`; `telegram` as a valid `channel` value), but the bot integration and UI opt-in path lands after SMS + email are stable in the pilot.

**When added (post-launch milestone within Phase 1 window):**
- Add `@aspire-bot` or org-branded Telegram bot via BotFather
- Inbound via Telegram Bot API (webhook, not long polling)
- Opt-in flow: parent clicks `t.me/aspire-bot?start={magic_token}` from a message or profile settings page; the token binds their Telegram chat ID to their parent account
- Telegram-specific UX: inline keyboards for buttons, rich media, reply threads
- Parents who opt into Telegram can choose it as their primary channel; SMS remains fallback

---

## Identity and authentication

### The model

- **Phone is the primary identity.** A parent's account is anchored to a verified phone number. Email is a secondary channel (optional but supported).
- **No passwords.** Authentication is via magic links delivered to a verified channel.
- **Magic links produce Lucia sessions.** Consuming a magic link creates a standard Lucia session, so all existing session-auth code works unchanged.
- **Session expiration unchanged.** Magic links auth once; the resulting session has the same duration as the current Lucia default (typically 30 days). Parents who arrive via magic link and click around the web dashboard stay logged in for the session lifetime.

### Three registration paths

#### Path 1 — New parent, self-service (volume path)

1. Parent lands on a public registration page (`/register/{season-slug}` or similar).
2. Form collects: parent name, phone, child name + DOB, medical info, emergency contact, waiver.
3. When parent enters phone number and tabs away, the form POSTs to `/api/auth/phone-verify/send` which creates a `phone_verifications` record and sends an OTP via SMS.
4. Parent enters the 6-digit code inline in the form. Client POSTs to `/api/auth/phone-verify/check`. On success, the form gets a signed `verified_phone_token` that must accompany the final registration submission.
5. Parent completes the form, Stripe payment, submits. The registration endpoint:
   - Creates a `users` record (parent) with `phone_verified = true`
   - Creates `family_members` record (child)
   - Creates `registrations` record
   - Creates `phone_opt_ins` with status `opted_in`, source `registration_form`
   - Triggers the payment (Stripe Checkout)
   - Sends a welcome SMS confirming registration and opt-in
6. Parent now exists. No password was created. No email verification required.

#### Path 2 — Returning parent, new season (magic path)

1. Admin opens registration for a new season.
2. System sends a "registration is open" SMS to every parent with an active past-season registration for the same program (or for the org, configurable). Message contains a magic-link token with `purpose: register_for_season`, `purpose_context: { season_id }`, expiration 72 hours.
3. Parent taps link. Server validates token, creates a Lucia session bound to the parent user, renders a pre-filled registration form with name, phone, kid, medical info, emergency contact all populated from existing records.
4. Parent ticks the new waiver, confirms saved payment method, submits.
5. Server creates `registrations`, charges saved card via Stripe, sends confirmation SMS.
6. Total time: ~30 seconds.

#### Path 3 — Admin-added walk-up

1. Admin (front desk / coach) uses the web app's "add parent + kid" flow.
2. Enters parent name, phone, kid info, medical, waiver (signed on-screen), payment (cash/check/card-on-file).
3. Submission creates `users`, `family_members`, `registrations`, and a `phone_opt_ins` with status `pending`.
4. System sends an opt-in welcome SMS: "Hi Sarah — Maya is registered. Reply YES to opt in to schedule updates and reminders. STOP to opt out, HELP for info."
5. Parent replies YES. Inbound webhook handler detects the opt-in, flips `phone_opt_ins.status` to `opted_in`, sends confirmation follow-up.
6. Account is active.

### Magic link lifecycle

1. **Issuance:** `createMagicLink({ userId, purpose, purposeContext, expiresIn, channel })` generates a 32-byte random token, hashes it, inserts into `magic_links`, returns the plaintext token (only time it exists unhashed).
2. **Delivery:** The plaintext token is embedded in a short URL (`https://aspire.sh/m/{token}` or similar) and delivered via the specified channel.
3. **Consumption:** The URL handler at `/m/{token}` looks up by hash, validates expiration and `consumed_at IS NULL`, atomically marks consumed, creates a Lucia session, then redirects to the purpose-specific task page with `purposeContext` available.
4. **Expiration:** Expired links return a "this link has expired, request a new one" page with a button to resend.
5. **Single-use enforcement:** Consumption uses `UPDATE magic_links SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL RETURNING id`. If rows affected = 0, the link is invalid.

### Reservations flagged for resolution before implementation

The user flagged reservations about phone-first auth during brainstorming that were not fully resolved. These must be addressed before Phase 1 implementation begins:

- **Shared-device / spouse scenarios:** How do two parents of the same kid coexist on the same account? Option A: each parent is their own `users` record, linked to the same `family_members` via a `family_members_parents` join table. Messaging addressed to "the family" goes to all linked parents. Option B: one parent is primary, secondary parents are attached. Needs product decision.
- **Lost phone recovery:** If a parent loses their phone and gets a new number, the existing phone is no longer reachable. Recovery flow: (a) email recovery if an email is on file, (b) admin-mediated recovery if no email, (c) third factor (security question, last payment amount) for orgs that require it. Needs product decision on which tiers to support.
- **Legal framing:** Some orgs may have legal requirements about password-based auth (e.g., youth data privacy policies that mandate "secure login"). Needs a quick legal check or a policy statement that "magic-link is our secure login mechanism" is defensible.
- **Parent without smartphone (edge case):** Grandparent without SMS capability. Fall-back: email-only onboarding path where the welcome flow goes via email instead of SMS. Path 3 covers this (admin adds parent with email instead of phone), but needs to be explicit in the UX.

These reservations are **not blockers** — none of them invalidate the design — but each needs a decision before we ship. The implementation plan should surface them as early user-gated tasks.

---

## The bot

### Capability tier: B (low-risk mutations)

The bot can:
- **Answer questions:** schedule lookups (this week, next practice, game times, location), team info (coach name, contact), program info, FAQ responses from a curated knowledge base
- **Take low-risk actions:** mark a kid absent for an upcoming practice/game (RSVP no), confirm a cancelled event, change contact preferences (primary channel switch)
- **Dispatch high-risk actions via magic link:** payments, new registration, refund request, medical info update, account settings

The bot **cannot**:
- Charge a credit card based on a text reply
- Register a new kid based on a conversational exchange
- Issue a refund
- Modify medical info, emergency contacts, or waivers
- Remove a kid from a roster
- Any action that would cost money, create legal liability, or be hard to reverse

### Understanding model: LLM-first with button fallback

**Inbound message flow:**

1. Inbound message arrives, `conversation_messages` record created with direction `inbound`.
2. Classifier invocation: the message is sent to Anthropic Haiku with a structured-output schema:

```typescript
interface ClassifiedIntent {
  intent: 'schedule_query' | 'rsvp_absent' | 'rsvp_present' | 'payment_question' |
          'registration_question' | 'coach_question' | 'admin_question' |
          'general_chitchat' | 'unclear';
  confidence: number;  // 0.0 to 1.0
  action: {
    type: 'bot_respond' | 'bot_execute' | 'route_to_coach' | 'route_to_admin';
    // If bot_execute:
    executable_action?: {
      name: string;  // e.g., 'mark_kid_absent'
      params: Record<string, any>;
      requires_confirmation: boolean;
    };
    // If route_to_coach/admin:
    routing_reason?: string;
  };
  reasoning: string;  // short explanation for audit/debugging
}
```

3. **Confidence threshold logic:**
   - `confidence >= 0.85`: execute the action (bot_respond or bot_execute)
   - `confidence < 0.85 and > 0.6`: bot responds with a confirmation button/prompt
   - `confidence <= 0.6`: route to human (admin inbox by default, or routing suggestion if available)

4. **Button fallback pattern for SMS** (since SMS has no inline buttons):
   - Instead of executing a low-confidence action directly, the bot replies with a confirmation like: `"Got it — mark Maya out for tonight's practice? Reply YES to confirm, NO if that's not right."`
   - The conversation stays in a `pending_confirmation` sub-state. The next inbound message is checked against the pending action.
   - On Telegram (post-launch), the same pattern uses inline keyboard buttons instead of `YES`/`NO` text.

5. **Action execution:** if confirmed, execute the action via a bot_actions dispatcher, write to `bot_actions_log`, send an outbound confirmation message.

### Bot action registry

Declarative registry of every action the bot is allowed to take. Each action has:
- `name` — stable identifier
- `description` — natural-language description used in the LLM prompt
- `params_schema` — JSON schema for required parameters
- `requires_confirmation` — boolean
- `reversible` — boolean
- `handler` — TypeScript function `(params, context) => ActionResult`
- `scope_check` — function that verifies the parent has permission for this action (e.g., the kid they're marking absent must be their kid)

**Phase 1 actions:**

1. **`lookup_schedule`** — read-only. Returns upcoming events for the parent's kids.
2. **`lookup_team_info`** — read-only. Returns coach name, team roster, field location for a specified kid/team.
3. **`lookup_next_practice`** — read-only. Returns next practice for a specified kid.
4. **`rsvp_absent`** — mutation, reversible. Marks a kid absent for an upcoming event. Requires kid-ownership scope check. Notifies coach.
5. **`rsvp_present`** — mutation, reversible. Reverses an absent mark.
6. **`confirm_event_cancellation`** — read-only (acknowledgment). Responds that the parent saw the cancellation; no state change.
7. **`switch_primary_channel`** — mutation, reversible. Updates `users.messaging_primary_channel`.
8. **`faq_response`** — read-only. Returns a curated FAQ answer based on the query. FAQ content is org-scoped and lives in a new `faq_entries` table or a JSONB column on `organizations.settings`.
9. **`request_human`** — meta-action. Escalates the conversation to a human immediately.

Any other intent → route to human. The bot will not invent new actions.

### LLM integration details

- **Model:** `claude-haiku-4-5` (fast, cheap, sufficient for classification)
- **Prompt caching:** the system prompt (which includes the bot action registry, org context, and current parent context) is cached via Anthropic prompt caching. The cache TTL is 5 minutes, so any parent active within a 5-minute window shares cache hits with themselves. For higher cache hit rates, batch routine queries where possible.
- **Structured output:** use Anthropic's tool-use API with a single `classify_intent` tool that forces the model to produce the `ClassifiedIntent` schema above.
- **Cost model:** Haiku at ~$0.25/MTok input, ~$1.25/MTok output. A typical classification call: ~500 input tokens (system prompt, cached after first call), ~100 output tokens. ~$0.0001 per message. At 5,000 messages/day: ~$0.50/day. Non-issue for the pilot.
- **Fallback:** if Anthropic API is unreachable, the bot falls back to a rule-based classifier (keyword matching) for the most common intents. The fallback is intentionally dumb — it only handles `rsvp_absent` (detecting "sick", "can't come", "won't be there"), `lookup_schedule` (detecting "when", "schedule", "practice"), and escalates everything else. This prevents a full outage but doesn't try to be smart.
- **Error handling:** if classification fails, the message is routed to admin inbox with a `classification_failed` flag and a canned response is sent to the parent: `"I got your message — a real person will get back to you shortly. (My bot brain is having a moment.)"`

---

## Smart routing

Based on the classifier output, inbound messages are routed:

- **Bot-handled intents** (`schedule_query`, `rsvp_absent`, etc. with high confidence): the bot responds or executes directly. Staff inbox sees these as "resolved by bot" entries, viewable but not demanding action.
- **Coach-routed intents** (`coach_question` — questions about a kid's development, injury severity, practice-specific concerns): lands in the coach's inbox. The coach is determined by the kid → team → coach lookup. If the kid is on multiple teams, routes to all relevant coaches with the first-to-claim pattern.
- **Admin-routed intents** (`admin_question` — payment disputes, registration changes, refunds, roster changes): lands in the admin inbox.
- **Unclear intents** (`unclear`, classifier low-confidence, classifier failed): admin inbox by default. Admin can reassign to a coach.

### Notification behavior when a message is routed

- Assigned staff member receives a notification in-app (dashboard badge), plus an out-of-band notification (SMS or email, per their preferences).
- The notification is throttled: if the same staff member was notified in the last 5 minutes, the subsequent routing aggregates into a single "3 new messages" notification.
- Staff members can set `do not disturb` hours; notifications during DND still land in the inbox but don't trigger out-of-band alerts.

---

## Staff inbox UI

### Location in app

- **New route:** `/messages` (admin + coach)
- **Admin inbox:** all conversations in the org
- **Coach inbox:** conversations where the coach is assigned (by routing), plus conversations about kids on their team
- **Filters:** assignment (mine / unassigned / all), status (active / archived), direction (needs reply / waiting on parent), intent (coach questions / admin questions / bot-handled)

### Conversation view

- **Threaded:** newest message at the bottom, infinite scroll up
- **Context panel:** parent name, phone, kid names, team(s), active registrations, payment status, recent activity — all at a glance
- **Channel indicators:** each message shows which channel it came from (SMS icon, email icon, etc.)
- **Bot attribution:** messages sent by the bot are visually distinct (italic, bot icon, "sent automatically"). Staff can see what the bot said and said not.
- **Reply composer:** staff types a reply, picks the channel to send via (defaults to parent's primary; can override), hits send. Outbound goes through the messaging gateway.
- **Quick actions:** "Reassign to coach/admin," "Mark resolved," "Archive," "Silence," "View parent profile," "View kid profile"

### Coach-specific view

- Coach inbox only shows conversations about kids on their team
- Coach can't reassign to admin; they can only reply or request admin escalation
- Coach inbox respects DND hours (no urgent notifications during off-hours)

### Admin-specific view

- Admin inbox shows everything in the org
- Admin can reassign any conversation to any staff member
- Admin has access to `bot_actions_log` — can see every action the bot took, reverse any reversible action
- Admin can silence / archive / delete conversations

### Pagination and performance

- Conversations list paginated 20 per page, ordered by `last_message_at DESC`
- Messages within a conversation paginated 50 per page, most-recent-first in UI but server returns them in chronological order
- Real-time updates via polling every 10 seconds (or Server-Sent Events if we want to get fancy — defer SSE to post-launch; polling is fine for pilot)

---

## Outbound messaging migration

Every existing outbound-to-parent touchpoint migrates from email-only to the messaging gateway, which delivers via the parent's preferred channel:

- **Registration confirmation** — currently email template `registration-confirmation.tsx`. Replaced with a messaging-gateway call that renders the content for the target channel.
- **Payment receipt** — currently email template `payment-receipt.tsx`. Same treatment.
- **Refund notification** — same.
- **Waitlist promotion** — same.
- **Announcements with `sendEmail` flag** — extends to route via the messaging gateway when the target parent has SMS as primary.
- **Email verification** — becomes "channel verification" — applies to email-based channel binding only. SMS uses OTP.
- **Password reset** — **removed.** No passwords in Phase 1. Parents use magic-link login instead.

**New outbound touchpoints:**

- **Schedule change notifications** — practice moved, game cancelled, field changed
- **Practice reminders** — day-of nudge (configurable per-parent)
- **Upcoming payment reminders** — 7 days before due, 1 day before due, overdue
- **Welcome message** on first registration
- **Re-registration prompt** when a new season opens for a returning family

### Channel preference resolution

Each parent has `messaging_primary_channel` and `messaging_fallback_channel`. The gateway:

1. Checks if the primary channel has opt-in (for SMS, `phone_opt_ins.status = opted_in`)
2. Attempts delivery via primary
3. If primary fails or is opted-out, attempts fallback
4. If both fail, marks the message as failed and surfaces to admin inbox

Parents can change their primary channel from settings (or by texting "use email instead" to the bot — this is one of the bot's mutations).

---

## Phased rollout within Phase 1

Phase 1 is itself broken into a week-level sequence to manage risk. Each sub-phase ends with something demonstrable.

### Week 1–2: Foundations
- Schema migration (new tables, renames, `users` column additions)
- Twilio account setup (10DLC registration kicked off — user-gated task, blocks SMS send testing)
- Anthropic SDK integration, first classifier prototype against sample messages
- Magic link module (`src/lib/auth/magic-link.ts`), generalized from forgot-password
- Phone OTP module (`src/lib/auth/phone-otp.ts`)

### Week 3–4: Inbound + bot tier A (read-only)
- Email inbound webhook
- SMS inbound webhook (feature-flagged; real SMS not live until 10DLC approved)
- Classifier integrated into inbound pipeline
- Bot action registry with read-only actions only (schedule, team info)
- Bot responds to questions, routes everything else to admin inbox
- Basic staff inbox UI (list + thread view, no fancy filters)

### Week 5–6: Bot tier B + mutations
- Add mutation actions (`rsvp_absent`, `rsvp_present`, channel switch)
- Confirmation flow for pending mutations
- `bot_actions_log` + admin reversal UI
- Smart routing (coach vs admin) based on classifier output

### Week 7–8: Outbound migration
- Every existing outbound-to-parent touchpoint migrated to messaging gateway
- Three registration paths implemented (inline OTP form, returning-family magic link, admin-added opt-in flow)
- Outbound schedule change / reminder / payment notifications

### Week 9–10: Polish, pilot launch
- 10DLC approved (unblocking real SMS)
- Pilot org data migrated to new identity model (parents' phones opt-ed in, preferences set)
- Pilot org parents receive welcome-to-messaging SMS with brief orientation
- Monitor, iterate, respond to real-world friction

### Post-Phase-1 (fast follow)
- Telegram channel integration
- SSE for real-time inbox updates
- Analytics dashboards

Week estimates assume one developer working full-time. Parallelizable work (schema + classifier + UI) can compress the timeline if more hands are available.

---

## Compliance

### 10DLC (US SMS)

- Brand registration: pilot org's legal entity, via Twilio Trust Hub (user-gated task, must be started before week 1 to have campaign approved by week 9)
- Campaign use case: "Mixed" (notifications + 2-way customer care)
- Sample messages submitted with campaign
- Opt-in language required on every first message
- STOP/HELP/UNSUBSCRIBE/CANCEL/END/QUIT keyword handling
- Audit trail via `phone_opt_ins`

### TCPA (US telephone consumer protection)

- Express written consent captured at registration via the waiver checkbox, which includes messaging-consent language
- Consent documentation retained in `phone_opt_ins.opt_in_source` and the underlying `registrations.waiver_accepted_at`

### GDPR / CCPA (data privacy)

- Conversation messages retained for 2 years by default (configurable per-org in Phase 3)
- Right to deletion: `/api/parent/delete-my-data` endpoint cascades through `conversations`, `conversation_messages`, `magic_links`, `phone_verifications`, `phone_opt_ins`
- Right to export: `/api/parent/export-my-data` returns a JSON bundle of all the above
- These are implemented as stubs in Phase 1 (returning "contact admin" responses) and fully in Phase 3 before public launch

### Audit logging

- Every bot action: `bot_actions_log`
- Every opt-in/opt-out event: `phone_opt_ins` with timestamp + source
- Every staff reply: `conversation_messages` with sender_user_id
- Every magic link: `magic_links` with creation + consumption timestamps

---

## Definition of done

- [ ] Phase 0 complete, smoke test passed
- [ ] Phone-first auth reservations resolved with user (shared device, recovery, legal framing, no-smartphone edge)
- [ ] Schema migration applied; new tables created; `messages.ts` renamed to `announcements.ts`; `conversations.ts` created
- [ ] Twilio 10DLC brand + campaign approved; sending/receiving SMS works in the pilot org
- [ ] Email inbound webhook live; reply-threading works end-to-end
- [ ] Magic-link module functional; forgot-password flow migrated to use it
- [ ] Phone OTP flow functional on the registration wizard
- [ ] Three registration paths all work end-to-end
- [ ] Bot handles all 9 tier-B actions correctly with >90% accuracy on a test suite of 100+ sample parent messages
- [ ] Smart routing: LLM classifier + coach/admin routing delivers to correct inbox
- [ ] Staff inbox UI for admin and coach, with thread view, context panel, reply composer, reassignment
- [ ] All outbound parent touchpoints migrated to the messaging gateway
- [ ] Pilot org has 10+ real parents actively using the messaging layer for 2+ weeks without P0 incidents
- [ ] `bot_actions_log` captures every bot mutation with successful reversal path tested
- [ ] STOP/HELP keyword handling tested with real SMS
- [ ] Monitoring / alerting for bot error rates, classifier failures, delivery failures

## Out of scope (explicit)

- All items listed under "Non-goals" above
- All items in Phase 2 and Phase 3
- Messaging for staff-to-staff (coach ↔ admin internal messaging)
- Messaging for parent-to-parent (team chat)
- File attachments in parent messages (text only at launch)
- Voice calls or voicemail
- MMS (images via SMS) — defer
- Rich link previews (open graph unfurling in messages)
- Message search by content
- Saved replies / canned responses for staff (nice-to-have, deferred)

## Open questions / reservations

- **Phone-first auth reservations** (flagged but not resolved during brainstorming) — blocking resolution before implementation
- **Coach vs admin permission boundary in the inbox** — who can reassign, who can archive, who can see `bot_actions_log`. Draft rules included in the Staff Inbox section but need validation with a real coach + admin.
- **Pricing / billing model** — out of scope for Phase 1 (pilot is free for the pilot org) but will be a Phase 3 decision
- **Conversation retention policy default** — 2 years assumed but not confirmed with user
- **DND hours configuration UX** — designed conceptually but specific UX deferred to implementation

## Change log

- 2026-04-14: Initial draft, approved for spec writing. Implementation blocked on Phase 0 completion and phone-first auth reservation resolution.
