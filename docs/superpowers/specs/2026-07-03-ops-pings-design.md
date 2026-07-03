# Operational Pings: Real-Time Business Events to the Principals' WhatsApp Group

**Date:** 2026-07-03
**Status:** Approved design, pending implementation plan

## Purpose

As traffic grows, the principals need push-style awareness of business events across both brands — registrations, bookings, rentals, payments, new users — without watching dashboards. Money events ping a WhatsApp group instantly; low-signal events roll into a daily digest. Delivered via the existing Zernio integration, with an email fallback so pings are never silently lost.

## Decisions (settled during brainstorming)

| Question | Decision |
|---|---|
| Cadence | Instant pings for money events (registration paid, drop-in booked, rental confirmed, membership started, generic payment); daily 8am ET digest for new-user counts + a recap of yesterday's totals |
| Group | ONE WhatsApp group covering both brands; every message brand-tagged (`[Aspire]` / `[SoccerOne]`) |
| Provisioning | App-provisioned via Zernio (same pattern as team groups), triggered from an admin settings card |
| Membership | Principal phone numbers managed in the admin card; adding one syncs into the group via `addGroupParticipants`. Start with two principals |
| Credentials | `ZERNIO_API_KEY` / `ZERNIO_ACCOUNT_ID` confirmed present in Bitwarden + Netlify. Email fallback still ships |
| Fallback | When Zernio is unconfigured or a send fails, the ping is emailed to the org's detractor-alert address (currently aspiresportsohio@gmail.com) — degraded, never dropped |
| Flood control | Max 10 instant pings per rolling hour; overflow collapses into a single "…and N more — full recap in the morning digest" message. Per-event dedupe so webhook retries can't double-ping |
| Test button | Admin card has "Send test ping" for ten-second end-to-end verification |

## Architecture

Three small units plus call-site hooks:

### 1. Event emitter — `src/lib/ops/ping.ts`

`sendOpsPing(event: OpsPingEvent): Promise<void>` — fire-and-forget from call sites (never throws into callers; failures log + `captureServerException`, mirroring the dispute-alert convention).

```ts
type OpsPingEvent =
  | { kind: "registration_paid"; brand: Brand; eventId: string; label: string; amountCents: number }
  | { kind: "dropin_booked";     brand: Brand; eventId: string; label: string; amountCents: number }
  | { kind: "rental_confirmed";  brand: Brand; eventId: string; label: string; amountCents: number }
  | { kind: "membership_started";brand: Brand; eventId: string; label: string; amountCents: number }
  | { kind: "payment_succeeded"; brand: Brand; eventId: string; label: string; amountCents: number } // catch-all for money not covered above
  | { kind: "user_signup";       brand: Brand; eventId: string; label: string }; // digest-only, never instant
```

- `eventId` = the natural id (Stripe event id, booking id, user id) — dedupe key.
- `label` = the human line the call site composes ("Jordan M. — Pickup Soccer, Blue Field 9pm").
- Emitter responsibilities: dedupe check, rate-cap check, format the message (`💰 [SoccerOne] Pickup booking — Jordan M., $15.74 · Blue Field 9pm`), deliver via WhatsApp (fallback email), log the ping.

### 2. Delivery — `src/lib/ops/whatsapp.ts`

- Wraps `createZernioClientFromEnv()`.
- `provisionOpsGroup()` copies the team-group pattern (`provisionWhatsAppGroup` in `group-lifecycle.ts`): create group ("Aspire Sports — Ops"), capture `groupId` + conversation id + invite link, persist; idempotent.
- `syncOpsGroupMembers(phones)` → `addGroupParticipants` (existing 8-per-request chunking).
- `postToOpsGroup(text)` → `sendInboxMessage` with the stored conversation id. The conversation id is resolved and persisted at provision time (the known client gap: there is no send-by-groupId; the same seam team groups use).
- `isOpsWhatsAppReady()` gates the channel; not-ready or send-failure → email fallback via a plain transactional email to the detractor-alert address (subject `[Ops] ...`), logged in `email_logs`.

### 3. State — `ops_pings` table + org-settings block

New table `ops_pings`: `id`, `organizationId`, `kind`, `eventId` (unique per kind — dedupe), `brand`, `message`, `channel` (`whatsapp` | `email` | `suppressed`), `createdAt`. Doubles as the rate-cap window query (`count in last hour`) and the digest's recap source.

Org settings jsonb gains:

```ts
opsPings?: {
  enabled?: boolean;                 // master switch, default off (ships dark)
  principals?: Array<{ name: string; phone: string }>;
  whatsapp?: { groupId?: string; conversationId?: string; inviteLink?: string };
};
```

### 4. Call-site hooks (five, all fire-and-forget one-liners)

- `handle-registration-payment-succeeded.ts` → `registration_paid`
- Drop-in confirmations (the three Stripe paths converge on `dispatchBookingConfirmation`) → hook once in that dispatcher → `dropin_booked`
- `handle-field-rental-checkout-complete.ts` (+ walk-up sibling) → `rental_confirmed`
- Membership/subscription start handler → `membership_started`
- `signup.ts` after user insert → `user_signup` (digest-only)

Generic `payment_succeeded` fires from the Stripe dispatcher only for money types not already covered, avoiding double pings.

### 5. Digest — cron

`/api/cron/send-ops-digest` (guarded by `CRON_SECRET`, Netlify scheduled function at 8am ET = `0 12 * * *` UTC): yesterday's new-user count by brand + totals per money kind (from `ops_pings`), one WhatsApp message (email fallback). Suppressed-overflow pings are itemized here.

### 6. Admin card — settings page

"Operational pings" card: master toggle, principal list (name + phone, add/remove), group status (provisioned? invite link shown), "Provision group" button (first run), "Send test ping" button. Follows the sibling-card idiom (inline banner, Saved label).

## Error handling

- Emitter never throws into business flows; all failures logged + captured.
- Zernio send failure → immediate email fallback for that ping (channel recorded as `email`).
- Dedupe = unique index on (kind, eventId); insert-first, send-after (a crashed send leaves the row with channel `suppressed` → picked up by the digest, not re-pinged).
- Rate cap: 11th+ instant ping in a rolling hour records `suppressed` + one collapse notice per hour.

## Testing

- `tests/unit/`: message formatting, rate-cap window logic, dedupe key derivation.
- `tests/api/`: emitter endpoint-level behavior via a seeded org (dedupe on repeat eventId, cap collapse, fallback channel recording with Zernio unconfigured); digest cron auth + composition; settings card round-trip.
- Zernio HTTP calls mocked in tests (existing `tests/unit/zernio/messaging.test.ts` pattern); one manual end-to-end via the test button with real credentials.
- E2E: settings card add-principal flow (post-merge `test-full` caveat applies).

## Ships dark

`opsPings.enabled` defaults off. Launch = toggle on in the admin card, provision the group, add the two principals, send a test ping.

## Out of scope (YAGNI'd)

- Per-principal notification preferences or quiet hours.
- Slack/Telegram channels (the emitter's channel seam makes them additive later).
- Refund/dispute pings (dispute alert email already exists; fold in later if wanted).
- Two separate brand groups.
