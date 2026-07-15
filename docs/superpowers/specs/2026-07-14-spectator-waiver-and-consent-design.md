# Spectator waiver + channel-aware marketing consent

**Date:** 2026-07-14
**Branch:** `feat/spectator-waiver-and-consent`
**Status:** approved, ready for planning

## Goal

Two things, joined by one spine.

1. **A spectator waiver at the kiosk.** Anyone entering the facility signs a
   liability waiver — not just people who are playing.
2. **Contact data we can actually use.** A spectator is a lead (a parent
   watching today is a parent registering a kid next season), but a marketing
   list built from unverified, kiosk-typed contacts is worse than no list.

The spine: **the opt-in is only worth having if the contact is verified.**

## What already exists (do not rebuild)

Verified present before writing this spec:

- `src/components/kiosk/KioskRoot.tsx` — the kiosk island (mode machine, idle
  reset, offline banner). The spectator flow is a new mode inside it.
- `src/components/kiosk/PhoneKeypad.tsx` — the on-screen numeric keypad.
- Email verification: `users.email_verified`, `/api/auth/verify-email`,
  `/api/auth/send-verification`, `src/lib/email/templates/email-verification.tsx`.
- Phone verification: `users.phone_verified`, `phone_verifications` schema,
  `/api/auth/phone-verify/send` + `/check`.
- `src/lib/sms/send.ts` — already has a failure taxonomy (`not_configured` /
  `invalid_phone` / `provider_error`).
- `src/lib/registrations/resolve-person.ts` — the person dedupe/resolution path.

**The verification mechanisms are built. They are simply not wired into the
entry points that collect contact data** — kiosk walk-in, careers apply,
sponsor inquiry, guest checkout all take an email and phone and trust them.
That is where the garbage data comes from. This spec fixes it for the spectator
flow and builds the primitives the other entry points will reuse.

## Channel reality (checked, not assumed)

| Channel | State today | Verdict |
|---|---|---|
| **Email** | Resend live, verification built | Ships now. |
| **SMS** | `SMS_PROVIDER` unset in prod ⇒ defaults to **Twilio**, messaging service configured. **SMS works today.** | Ships now. |
| **SMS via Zernio** | 10DLC **declined 2026-07-13**; a send returns `403 Your SMS registration is still under carrier review.` Re-appeal expected imminently. | Dormant. Same code path — a provider flip, not a rebuild. |
| **WhatsApp** | `src/lib/ops/whatsapp.ts` is **ops-only** (group provisioning). Customer marketing needs WABA connected + Meta-verified **plus pre-approved templates**. | Dormant, and materially further out than SMS. |

The earlier belief that "SMS is blocked" was wrong — that is the Zernio
migration, not the current sending path.

## Design

### 1. Spectator flow (kiosk)

A third landing option: **"I'm here to watch."**

- **Lookup first.** Phone keypad (reuse `PhoneKeypad`). A returning spectator
  with a valid season waiver is waved straight through — one tap, no typing.
- **New spectator:** name, phone, email, signature. Under-18 spectators take the
  guardian path, reusing the guardian-consent logic corrected in PR #396 (a
  guardian signs on the child's behalf and the child is named).
- **New table `spectator_waivers`:** organization, location, person fields
  (name, phone, email), `is_minor`, guardian fields, signature (typed name),
  `signed_at`, `valid_until` (season/year), and the **exact waiver text shown**.
- **No booking, no token, no payment.** A spectator has none of those. Threading
  "no booking" special-cases through the money-handling code hardened in PR #396
  is how that code gets broken.

**Validity:** sign once per season. `valid_until` drives the lookup: a hit with
`valid_until > now` skips straight to "you're all set".

### 2. Identity — the line

- **Signing a waiver makes you a signature.** No account.
- **Ticking any marketing opt-in makes you a user** — a real, passwordless
  `users` row, so the lead is convertible and a later kid-registration resolves
  to the same person via `resolvePerson()`.

Nobody gets an account they did not ask for.

Verified safe: the welcome-series cron (`send-welcome-series.ts`) enrolls only
users **with a confirmed registration**. A spectator-created user has none, so
it cannot be swept into that drip by accident.

### 3. Channel-aware consent — the schema fix

`phone_opt_ins` today has a single `status` per `(organization_id, phone)`, with
a unique index on exactly that pair. **It cannot represent "yes to SMS, no to
WhatsApp."** Those are legally distinct consents under different regimes
(TCPA/10DLC vs Meta's opt-in policy). Conflating them is a compliance defect,
not an inconvenience.

- Add **`channel`** (`'sms' | 'whatsapp'`) to `phone_opt_ins`.
- Unique index becomes `(organization_id, phone, channel)`.
- Backfill existing rows to `channel = 'sms'` (that is what they are).
- Migration must be idempotent (`ADD COLUMN IF NOT EXISTS`, `DO $$ … EXCEPTION
  WHEN duplicate_object`) per the 0023/0024 convention — prod has been
  `db:push`-drifted before.

Email consent lives alongside, keyed on the user.

Each consent row stores: channel, status, `opted_in_at`, `opt_in_source`
(`kiosk_spectator`), and **the exact opt-in text shown to the person**.

### 4. Verification — applied where it pays

- **Email → double opt-in.** Ticking the box sends a confirmation email. The
  person is **not on the marketing list until they click it.** An unverified
  address is thereby structurally incapable of entering the list.
- **SMS → OTP.** Reuses `/api/auth/phone-verify/send` + `/check`. Works today.
- **WhatsApp → parked** (see §5). Consent captured, delivery deferred.

Contact details are collected for **every** spectator (a liability record needs
a way to reach the person after an incident) but are **verified only when they
opt in**. Unverified contact data therefore never reaches an inbox.

### 5. Dormant channels — built once, not twice

Add **`channel_dormant`** to `sendSms`'s existing failure taxonomy, detected on
the documented `403 Your SMS registration is still under carrier review`
(see `docs/operations/zernio-sms-unpark-checklist.md`).

On a dormant channel:

1. **Record the consent anyway.** Consent is captured at the form. Delivery is a
   separate, best-effort concern.
2. **Park a pending verification.**
3. **Tell the person honestly** — "we'll text you to confirm" — never a silent
   failure.
4. **A retry job flushes the queue when the channel wakes up.**

So when Zernio's re-appeal lands (expected within days), nothing is rebuilt and
no consent is lost. The same machinery serves WhatsApp when Meta approves.

**Staleness guard (important).** A consent parked in July and flushed in October
is exactly what gets a WABA flagged. On flush:

- Consent **≤ 90 days old** → send the confirmation and proceed.
- Consent **> 90 days old** → do **not** blast. Re-confirm instead.
- The first message on a newly-live channel **names when and where they opted
  in**: "You signed up at Worthington on 14 July — reply STOP to opt out."

### 6. Compliance rules, encoded in code rather than in memory

These are not style preferences. Each one has already cost this project
something.

- **Every opt-in box ships UNCHECKED.** A pre-checked box is precisely what got
  the 10DLC registration declined on 2026-07-13. Enforce it with a test.
- **The opt-in text shown is stored with the consent record.** The carrier
  reviewer asks to see the live form; the stored evidence must match what was
  displayed.
- **Marketing consent is separable from the waiver.** The waiver is a *condition
  of entry*; consent obtained as a condition of something else is not consent.
  Signing the waiver must be possible while declining every channel.

### 7. WhatsApp box: visible now, consent parked

Per the owner's decision, the WhatsApp opt-in is **shown to customers now**,
with consent parked until the channel can deliver. The staleness guard in §5 is
the mitigation for the freshness risk this creates.

## Testing

- **Unit:** the unchecked-by-default invariant (every consent box renders
  unchecked); `channel_dormant` classification from a 403; the 90-day staleness
  boundary.
- **API:** consent is recorded per-channel and SMS/WhatsApp consents do not
  overwrite each other (the bug the schema change fixes); a dormant SMS send
  records consent and parks a verification rather than failing; an email opt-in
  does **not** enter the marketing list until the confirmation link is clicked.
- **E2E:** the spectator kiosk flow — lookup → sign → decline all channels →
  admitted; and lookup hits an existing valid waiver and skips the form. The
  full Playwright job only runs **post-merge**, so these must be run locally
  before merging.
- Any fixture that seeds a session anchors to `now`, never a fixed UTC hour
  (see `docs/superpowers/specs/` history — this broke `main` on 2026-07-14).

## Out of scope (deliberately)

- **Wiring verification into the other entry points** (kiosk walk-in, careers
  apply, sponsor inquiry, guest checkout). They have the same garbage-data hole,
  but each has a different friction tolerance — blocking a walk-in on an OTP is
  not the same trade as verifying a careers applicant. This spec builds the
  primitives; a follow-up applies them. Do not braid them together.
- **Auto-linking spectators to existing family/player records.** Match on phone
  later if wanted. Creating person records for people who only ever watched is
  how non-transacting people end up in marketing.
- **WhatsApp delivery.** Blocked on WABA + Meta template approval. The consent
  and retry machinery ships; the transport does not.
