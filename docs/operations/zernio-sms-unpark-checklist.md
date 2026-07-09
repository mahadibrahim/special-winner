# Zernio SMS — un-park checklist

Outbound SMS can run through either Twilio (default) or Zernio, chosen by the
`SMS_PROVIDER` env var. The Zernio transport is built and tested but **parked**:
`SMS_PROVIDER` stays `twilio` until the steps below are green.

## Why parked

Zernio SMS to US numbers only delivers once the sending number has an **approved
carrier registration** (`/v1/sms/registrations`) — the same 10DLC hurdle Twilio
imposes. A number working for WhatsApp does **not** imply it is SMS-enabled:
WhatsApp and SMS are separate rails with separate registration.

Carrier registration was submitted **2026-07-09** and is pending approval.

## Un-park steps

1. **Confirm the number is SMS-enabled** in the Zernio account (the number used
   for WhatsApp may not be). If it is not, provision/enable an SMS number.
2. **Confirm the carrier registration is approved** (`/v1/sms/registrations`).
   Until then, sends return `404 No SMS-enabled number matches from` or a `502`
   carrier failure.
3. **Set the env vars** (Netlify prod + Bitwarden `aspire-web-app`):
   - `ZERNIO_SMS_FROM` = the approved SMS-enabled number in E.164.
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
