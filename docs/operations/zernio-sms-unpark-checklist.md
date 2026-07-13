# Zernio SMS — un-park checklist

Outbound SMS can run through either Twilio (default) or Zernio, chosen by the
`SMS_PROVIDER` env var. The Zernio transport is built and tested but **parked**:
`SMS_PROVIDER` stays `twilio` until the steps below are green.

## Why parked

Zernio SMS to US numbers only delivers once the sending number has an **approved
carrier registration** (`/v1/sms/registrations`) — the same 10DLC hurdle Twilio
imposes. A number working for WhatsApp does **not** imply it is SMS-enabled:
WhatsApp and SMS are separate rails with separate registration.

Carrier registration was submitted **2026-07-09**.

**2026-07-13 — DECLINED.** Brand reached `VERIFIED` and the campaign
`TCR_ACCEPTED`, but the carrier declined the registration itself. Reviewer's
note:

> Opt-in form will need a checkbox added (unchecked and an optional field) next
> to the opt-in language.

Our forms captured *implied* consent ("By providing your phone number, you
agree…"), which is not valid consent for carrier review or under TCPA. Fixed in
PR #391: `SmsConsentCheckbox` (unchecked by default, optional) now appears at
every phone-collection surface, and the checkbox actually drives
`phone_opt_ins` via `recordPhoneOptIn()` in `src/lib/sms/opt-in.ts`.

> **Do not pre-check the box, and do not make it required.** Either change
> re-breaks the registration and invalidates the consent. The appeal points the
> reviewer at the live opt-in page, so the shipped form must match what the
> carrier is told.

A live send attempt while the registration is not approved returns:
`403 Your SMS registration is still under carrier review.`

The SMS-enabled number is **+16026544211** (throughput once approved: 240/min,
2000/day).

## Un-park steps

1. **Re-appeal with the checkbox live** (PR #391 shipped it). Open the Zernio
   brand page → "Review & appeal", and link the reviewer to a page with the
   opt-in form (e.g. a `/register/<season>` page, or the verify-phone form).
2. **Confirm the carrier registration is approved** (`/v1/sms/registrations` →
   `status: "approved"`). Until then, sends return `403` (under review), `404 No
   SMS-enabled number matches from`, or a `502` carrier failure.
3. **Set the env vars** (Netlify prod + Bitwarden `aspire-web-app`):
   - `ZERNIO_SMS_FROM` = `+16026544211` (the SMS-enabled number).
   - `SMS_PROVIDER` = `zernio`.
4. **Send one live verification text** through `sendSms()` and confirm delivery
   before relying on it for real traffic.
5. **Before real cutover, wire inbound.** Under Zernio, inbound SMS replies
   thread into a Zernio inbox conversation and arrive via the existing Zernio
   webhook (`/api/webhooks/zernio`), NOT the Twilio-shaped
   `src/pages/api/messaging/inbound/sms.ts` route. Inbound handling is separate,
   later work.

## Rollback

Set `SMS_PROVIDER` back to `twilio` and redeploy. Twilio stays fully wired; no
code change is needed to revert.
