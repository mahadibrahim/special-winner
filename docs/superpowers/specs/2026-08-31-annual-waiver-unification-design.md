# Annual waiver unification — one signature, valid a year, platform-wide

**Date:** 2026-08-31
**Status:** Approved design, pending implementation plan
**Owner policy (verbatim intent):** "Waivers only need to be signed once a year. We
don't want parents being asked over and over to sign a waiver."
**Branch:** `annual-waivers`, stacked on `classes-purchase-ladder` (PR #592). The PR
for this work targets main after #592 merges.

## Problem

Nine surfaces capture liability waivers into five different tables with divergent
validity rules:

- Class/drop-in bookings (`drop_in_bookings.waiver*`): valid **forever** once signed
  (per-child, per-org, no date filter — `book-child.ts:323-334`), except the paid
  drop-in door, which asks **every time**.
- Season/league/camp registrations (`registrations.waiver*`): per-registration; every
  new registration asks again (v2 defers to a post-payment completion CTA + reminder
  emails).
- Field rentals (`field_rentals.waiver*`): mandatory at every booking, no reuse.
- Kiosk/self-serve (`drop_in_bookings` / `field_rentals` / `field_rental_players`):
  per-target idempotency only.
- Spectators (`spectator_waivers.validUntil`): the only true annual-style gate.

Meanwhile a canonical per-person consent system already exists and is underused:
`consents` (type `liability`, `familyMemberId` NOT NULL, `expiresAt = signedAt +
365d`, `contentHash`, `waiverId` → versioned `waivers` docs, IP/UA audit) — written
by registration + self-serve + admin walk-up, read only by the compliance dashboard.

## Design

### Canonical rule

> A person has a valid liability waiver for an organization iff a `consents` row of
> type `liability` exists for their `family_members` row, scoped to that org, with
> `expiresAt > now` (i.e. signed within the last 365 days).

`family_members` rows represent people (adult self XOR dependent — the people
model), so this covers adults and children uniformly. Guardian-vs-adult consent
language remains decided per-signature by the existing
`waiverConsentVariant(isMinor)` machinery — unchanged.

### Schema (one addition)

- `consents.organizationId` — uuid, FK organizations (cascade), **nullable** (legacy
  rows). Waivers are per-organization legal releases (distinct legal entities); today
  the org is only implied through `waiverId`/`registrationId` joins. New liability
  rows always set it. Backfill migration: populate from `waivers.organizationId` via
  `waiverId`, then from `registrationId → registrations → seasons → organizationId`
  for rows still NULL; rows that remain NULL after both are treated as
  not-org-scoped and never satisfy the canonical predicate (the legacy fallback
  below covers those signers instead).
- Partial index on (`familyMemberId`, `type`, `organizationId`, `expiresAt`) for the
  hot-path predicate.

### Shared helpers (`src/lib/consents/liability.ts`)

```ts
/** Canonical write: records the consents row (org-scoped, 365-day expiry,
 *  contentHash/waiverId from resolveActiveLiabilityWaiver) for the person, via
 *  resolvePerson when only user context exists. Callers keep writing their local
 *  booking/registration waiver columns for audit continuity — those become
 *  denormalized copies, no longer gates. Accepts an optional dbOrTx. */
export async function recordLiabilityWaiver(opts: {
  familyMemberId: string;
  organizationId: string;
  signedByUserId: string | null;   // null for guest/kiosk signers without accounts
  signedByName: string;
  consentVariant: "adult" | "guardian";
  consentText: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  registrationId?: string | null;
  dbOrTx?: DbClient;
}): Promise<void>;

/** Canonical read: consents-first, with a TRANSITION fallback so recent signers
 *  are never re-asked at cutover — a legacy signed drop_in_bookings row (org-scoped
 *  join, waiverSignedAt within 365d) or registrations row (season → org, same
 *  window) also satisfies. The fallback reads signature rows only (waiverSignedAt
 *  NOT NULL) — derived copies with null signedAt cannot anchor a date. */
export async function hasValidLiabilityWaiver(
  familyMemberId: string,
  organizationId: string,
  dbOrTx?: DbClient,
): Promise<boolean>;
```

`WAIVER_VALID_DAYS = 365` lives here; the self-serve endpoint's duplicated inline
365-day math is replaced by this module.

### Write-side wiring (every capture surface calls `recordLiabilityWaiver`)

1. `book-child.ts` fresh-signature branch (class booking / trial).
2. Paid drop-in fulfillment (`handle-dropin-checkout-complete.ts`) when metadata
   carries a signature and a `familyMemberId`.
3. `POST /api/dropin/bookings/[id]/waiver` (post-payment WaiverCard).
4. Self-serve/kiosk endpoint (all branches that record a signature; the existing
   best-effort consents insert is replaced by the helper).
5. Registration paths (`create-registration.ts`, `[id]/complete.ts`, walk-up admin)
   — these already write consents; they switch to the helper for the org-scoped row.
6. Rentals booking + rental-player signing.

Adults sign too: where today only a `userId` exists (adult drop-in, rentals),
`resolvePerson()` supplies the self `family_members` row.

### Read-side wiring (every ask-gate consults the helper)

1. **Classes engine** (`book-child.ts`): replace the forever-valid on-file query with
   `hasValidLiabilityWaiver`. Derived bookings keep stamping `waiverSigned: true`
   with null signature fields (unchanged shape).
2. **`/api/classes/summary`** `hasWaiverOnFile` → helper; dashboard waiver nudge
   keys on validity alone (drop the `hasEverBooked` condition — with expiry, a
   veteran family's lapsed waiver must nudge).
3. **Drop-in modal (paid + free paths)**: probe validity (via the summary flag the
   card already has, or a light fetch in the public modal) and show the waiver panel
   only when invalid; server 422 handshake remains the authoritative fallback.
   The paid path's server side also consults the helper so a valid-waiver child's
   paid booking lands `waiverSigned: true` without client-sent fields.
4. **Registration v2 completion**: at registration creation, when the participant
   has a valid waiver, stamp `registrations.waiverSigned = true` (`waiverSignedBy =
   "On file (annual waiver)"`), so the completion CTA and the waiver-reminder cron
   (`send-waiver-reminders`) skip it. The completion endpoint also short-circuits
   `{ alreadySigned: true }` via the helper.
5. **Rentals booking**: `waiverAccepted`/`waiverName` become optional when the
   renter has a valid waiver on file (validator consults the helper via the API
   layer); the booking row copies `waiverSigned: true` + "On file" attribution.
   Rental **players** keep per-person invites but a player matching an existing
   person with a valid waiver is auto-marked signed (status `signed`, signer "On
   file (annual waiver)") at invite time.
6. **Self-serve/kiosk `build-context`**: outstanding-waiver derivation consults the
   helper so a signed-elsewhere person isn't re-asked at the kiosk.
7. **Auto-booking cron**: no change (it books when the engine says waiver ok; the
   engine's predicate change flows through). `skippedNoWaiver` now also captures
   mid-enrollment expiry — the dashboard nudge covers recovery.

### Out of scope (deliberate)

- Spectator waivers (separate facility-entry document; keeps its calendar-year
  `validUntil` gate).
- Media consent / other consent types.
- Unifying the four legal-text sources (flagged as follow-up; each surface keeps its
  current text and continues stamping it into `consentText`/`waiverTextShown`).
- Waiver-document supersession forcing early re-signature (`waivers.supersededAt`
  exists but triggers no re-ask today; unchanged).
- Consent-variant unification beyond touched call sites.

### Legal/audit posture

Nothing is deleted or weakened: every surface keeps its local signature columns and
gains a consents row with content hash + versioned document reference + IP/UA where
available — strictly more auditable than today. The 365-day expiry matches the
`consents` system's existing liability expiry, so the compliance dashboard's
"expired" state becomes operationally true platform-wide.

## Testing

- Unit: predicate windows (364d valid / 366d invalid), legacy-fallback branches,
  helper write shape.
- API: per-surface — class 422 skipped with a valid consents row and with only a
  legacy recent booking row; re-ask fires when the signature is >365d old; paid
  drop-in server-side stamping; registration creation auto-satisfy + reminder-cron
  exclusion; rentals optional-waiver acceptance + rental-player auto-sign;
  self-serve outstanding derivation; org isolation (valid waiver at org A never
  satisfies org B).
- E2E: extend the existing drop-in-door spec — child with a valid consents row goes
  straight to payment with no waiver panel; expired-signature child sees the panel.

## Execution

Same model as the purchase ladder: Fable orchestrates; Opus subagents on schema/
helpers/engine/webhook surfaces, Sonnet on UI/registration/rentals wiring and tests;
task-scoped reviews; final whole-branch review; CI green on origin gates the PR.
