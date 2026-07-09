# Zernio as a selectable SMS transport

**Date:** 2026-07-09
**Branch:** `feat/zernio-sms-transport`
**Status:** Approved — ready for implementation plan

## Goal

Add Zernio as an alternative **outbound** SMS vendor, selected by a config
flag, with Twilio remaining the default and fully-wired fallback. Ship it
**parked** (flag stays `twilio`) until the Zernio number is SMS-enabled and its
US carrier registration is approved.

## Motivation

We already run WhatsApp messaging and social publishing through Zernio. Moving
SMS onto Zernio too consolidates vendors (one API key, one account, one inbox)
and threads SMS replies into the same Zernio inbox conversation surface that
WhatsApp inbound already uses. This is a vendor-consolidation play, **not** a
way to avoid 10DLC: US SMS via Zernio still requires an approved carrier
registration (`/v1/sms/registrations`), the same regulatory hurdle Twilio's
Trust Hub imposes.

## Current state

All outbound SMS funnels through a single chokepoint, `sendSms()` in
`src/lib/sms/send.ts`. It performs the opt-in gate, phone normalization, a
length cap, and returns `{ ok, messageId }`. Only ~10 lines inside it are
Twilio-specific (`client.messages.create`); the surrounding compliance
machinery is vendor-agnostic. `isSmsConfigured()` / `getTwilioClient()` /
`getSmsFrom()` live in `src/lib/sms/client.ts`.

The Twilio message SID is returned as `messageId`; the result reason union
includes a Twilio-specific `twilio_error`. No call site switches on
`twilio_error` — every consumer passes `.reason` through opaquely (e.g.
`phone-otp.ts` surfaces it as an error string, `dispatch.ts` stores it as
`lastReason`), so the label can be renamed safely.

## Design

### 1. New transport — `src/lib/sms/zernio-sms.ts`

A thin typed client, **separate** from `src/lib/zernio/messaging.ts` (that one
is WhatsApp-account-based, keyed on `accountId`/`conversationId`; SMS is
`from`/`to` E.164-based with a different response shape). Mirrors the existing
Zernio client's injectable-`fetchImpl` pattern for testability.

- `createZernioSmsClient({ apiKey, from, fetchImpl })` → `.send({ to, text, mediaUrls? })`
- Calls `POST /v1/sms/messages` with body `{ from, to, text, mediaUrls? }` and
  `Authorization: Bearer <apiKey>`.
- Returns the Zernio response `{ id, conversationId, status }`.
- Reuses the existing `ZERNIO_API_KEY`. New env: `ZERNIO_SMS_FROM` (E.164 sender).
- Reads the JSON `error` body on non-2xx and surfaces it (same approach as the
  existing client's `post()`), with clear handling for the documented failures:
  - `404` — no SMS-enabled number matches `from`
  - `409` — same Idempotency-Key still processing
  - `422` — Idempotency-Key reused with a different body
  - `502` — carrier-side send failed

### 2. Provider selection — inside `src/lib/sms/`

- New env `SMS_PROVIDER` = `twilio` (default) | `zernio`. **Unset ⇒ `twilio`**,
  so current behavior is byte-for-byte unchanged.
- `isSmsConfigured()` becomes provider-aware: checks the **active** provider's
  credentials — Twilio (SID + token + from/messaging-service) **or** Zernio
  (`ZERNIO_API_KEY` + `ZERNIO_SMS_FROM`).
- `sendSms()` keeps its exact signature, opt-in gate, normalization, length cap,
  and `{ ok, messageId }` result shape. Only the post-gate send dispatches to
  the active transport. Zernio's response `id` maps to `messageId`.
- Rename the result reason `twilio_error` → `provider_error` (vendor-neutral).
  Safe — no consumer branches on it.

### 3. v1 scope (YAGNI)

- **Text-only** through `sendSms`. The Zernio client *accepts* `mediaUrls`, but
  `sendSms`'s public signature does not expose MMS yet — no caller needs it.
- **No idempotency key** in v1. The current architecture does not persist an
  outbound message id *before* sending to key off of, so a stable key isn't
  available without new plumbing. Noted as future hardening.
- **Inbound SMS is out of scope.** Under Zernio, inbound replies do not hit the
  Twilio-shaped `src/pages/api/messaging/inbound/sms.ts` route; they thread into
  a Zernio inbox conversation and arrive via the existing Zernio webhook
  (`/api/webhooks/zernio`), like WhatsApp inbound. Wiring Zernio inbound SMS
  through the inbound pipeline is separate, later work. It must be done before
  Zernio becomes the *real* SMS provider, but is not needed to build/park the
  outbound transport.

### 4. Verification (the un-park gate)

We cannot send live yet: carrier registration was **submitted 2026-07-09** and
is pending approval, and the number's SMS-enablement is unconfirmed (a number
working for WhatsApp says nothing about SMS — separate rails, separate
registration). Deliverable: a short doc note plus an optional tiny script
showing how to confirm the number's SMS status via the API, so the parked state
has an explicit checklist to un-park:

1. Confirm the number is SMS-enabled in the Zernio account.
2. Confirm the carrier registration (`/v1/sms/registrations`) is approved.
3. Set `ZERNIO_SMS_FROM` and flip `SMS_PROVIDER=zernio`.
4. Send one live verification text before relying on it.

### 5. Tests

- `tests/unit/sms/zernio-sms.test.ts` (mock `fetchImpl`):
  - success maps `id` → `messageId`; `from`/`to`/`text` passed through correctly
  - `404` and `502` responses surface as `provider_error` with the API detail
- Provider-selection tests:
  - `SMS_PROVIDER` routes `sendSms` to the correct transport
  - `isSmsConfigured()` is provider-aware (true only when the active provider's
    creds are present)

## Files touched

- **new** `src/lib/sms/zernio-sms.ts` — Zernio SMS transport client
- **edit** `src/lib/sms/send.ts` — provider dispatch, `provider_error` rename
- **edit** `src/lib/sms/client.ts` — provider-aware `isSmsConfigured()`
- **new** `tests/unit/sms/zernio-sms.test.ts` — transport + selection tests
- **edit** `.env.example` — document `SMS_PROVIDER`, `ZERNIO_SMS_FROM`
- **new/edit** short doc — un-park checklist + status-check note

## Non-goals

- Runtime auto-failover between vendors (this is a config switch, not live
  redundancy — both vendors never send in parallel).
- MMS through `sendSms`.
- Idempotency-key plumbing.
- Zernio inbound SMS handling.
- Removing or unwiring Twilio.
