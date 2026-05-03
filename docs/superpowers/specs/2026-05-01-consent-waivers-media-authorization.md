# Consent, Waivers, and Media Authorization — Design Spec

**Date:** 2026-05-01
**Status:** Decisions locked 2026-05-01 — Phase 1 in progress

## Locked decisions

- **Media-auth granularity:** 3 scopes (Internal / Promotional / Public).
- **Media-auth defaults:** all 3 scopes default ON. Parent must opt OUT (unchecks the box) to disable a scope.
- **Waiver freshness:** liability waiver valid for **365 days** from signing OR until org publishes a new version, whichever first. Media-auth and parental consents do not expire — only revocation removes them.
- **Electronic signatures everywhere.** Walk-up registration: parent types their own name on the admin's device. Recorded with admin user as witness in `consents.notes`.
- **No backfill.** No real customer data exists yet. Old `parentalConsentGivenAt`/`photoConsentGivenAt`/`waiverSignedAt` columns stay in place during Phase 1; Phase 2 stops writing to them; later cleanup phase drops them.
- **Hard-block at publish:** phased — soft-warn for 2 weeks post-launch, then hard-block.
**Owner:** Mahad

## Why

The current platform captures partial consent: per-registration waiver (boolean + signed-at), parental consent on family-member creation, photo consent on photo upload. None of these are versioned, none are scoped, and the media-tagger workflow ignores all of them at publish time. To onboard paying customers and pass a COPPA legal review, we need a unified consent system with a real audit trail and enforcement where it matters.

## Scope

Three flows, two actor types.

**Flows:**
1. **Parental consent** — COPPA-mandated affirmative consent for under-13 children (and our policy: under-18 minors).
2. **Liability waiver** — assumption of risk + medical-auth + code of conduct, per-season per-org.
3. **Media authorization** — granular consent for using the participant's likeness, separate from the waiver.

**Actor types:**
- **Parent** registering a dependent (existing wizard flow + guest checkout flow)
- **Adult self-registrant** registering for themselves (existing self-path)

## Schema (one migration)

### New tables

```typescript
// waivers — versioned waiver content per org
waivers {
  id: uuid PK
  organizationId: uuid FK (nullable for global default)
  type: enum('liability', 'media_authorization')   // liability = the waiver; media_authorization is its own track
  version: integer                                  // monotonically increasing per org+type
  content: text                                     // markdown
  effectiveAt: timestamp
  supersededAt: timestamp (nullable)
  createdAt, updatedAt
  // Constraint: only one (org, type, supersededAt IS NULL) row at a time
}

// consents — append-only audit log of every signed consent
consents {
  id: uuid PK
  familyMemberId: uuid FK
  registrationId: uuid FK (nullable — parental consent isn't tied to a registration)
  waiverId: uuid FK (nullable — parental consent doesn't reference a waiver row)
  type: enum('parental', 'liability', 'media_authorization')
  scope: enum('internal', 'promotional', 'public') (nullable — only set for media_authorization)
  status: enum('granted', 'revoked')
  signedByUserId: uuid FK (the actor who clicked the button)
  signedByName: varchar (typed name)
  signedAt: timestamp
  ipAddress: varchar
  userAgent: text
  contentHash: varchar (sha256 of waiver content at signing time — proves what was signed)
  createdAt
  // Indexes: (familyMemberId, type), (registrationId), (signedAt desc)
}
```

### Modifications to existing tables

- `family_members`: add `dateOfBirth` (already exists), add `selfRegisteredAt` for adult-self confirmation timestamp. **Deprecate** the inline `parentalConsentGivenAt/By/Ip` and `photoConsentGivenAt/By/Ip` columns — keep them for backfill, mark `@deprecated` in the schema doc, stop writing to them. New writes go through `consents`.
- `registrations`: keep `waiverSigned` boolean as a denormalized read-fast cache, populate it from a `consents` insert. Drop `waiverSignedAt/By` fields.

### Backfill

Migration also writes one `consents` row per existing family_member that has `parentalConsentGivenAt IS NOT NULL`, type=`parental`, status=`granted`. Same for photo consent → media_authorization scope=`internal`. Same for each registration with `waiverSigned=true` → liability consent.

## Wizard changes

### Parent path (registering a dependent)

Today: `who → waiver → payment`
Proposed: `who → parental-consent (new) → waiver → media-auth (new) → payment`

- **parental-consent step** (new): only shown if family member has no current parental consent on record. Single checkbox + typed name + this content gets logged as a `consents` row of type=`parental`. Skipped if already on file.
- **waiver step**: existing component, but persists via `consents` row of type=`liability`, with `contentHash` of the org's current waiver. Skipped if a current-version waiver consent exists for this season for this child.
- **media-auth step** (new): three checkboxes (Internal / Promotional / Public). Defaults: Internal=on, Promotional=off, Public=off. Each checkbox state writes a `consents` row of type=`media_authorization`, scope=that scope.

### Adult self path

Today: `who → waiver → payment`
Proposed: `who → age-confirmation (new) → waiver → media-auth (new) → payment`

- **age-confirmation step** (new): shows DOB-derived age, single checkbox "I confirm I am 18 or older and consenting on my own behalf." Persists `selfRegisteredAt` on the family_member row. No parental consent row.
- **waiver step**: same as parent path but signed by the participant.
- **media-auth step**: same UI as parent path.

### Guest checkout (both paths)

Same wizard sequence, but the family_member row is created during checkout. Guest checkout's transaction MUST also write the `consents` rows with the captured IP/user-agent.

## Backend write path

- New helper: `recordConsent({ familyMemberId, registrationId?, type, scope?, waiverId?, signedByUserId, signedByName, ipAddress, userAgent, contentHash })` in `src/lib/consents/record.ts`. Single chokepoint for all consent inserts.
- All registration-creation paths call `recordConsent` for the relevant types. Wizard endpoint, guest-checkout endpoint, walk-up registration endpoint.
- Walk-up registration: admin types in the parent's name + checks "paper consent on file" — records via `recordConsent` with `signedByName = "<parent name> (paper, witnessed by <admin name>)"` and a flag in `userAgent` like `walk-up:admin=<id>` for audit.

## Admin compliance views

New page `/admin/compliance` with three tabs:

1. **Per-child consent status** — table of family_members in the org, with columns: parental consent (date), waiver (version + date), media auth (Internal/Promotional/Public toggles colored by status). Filter: "missing X for season Y".
2. **Waiver content management** — list/create/version waivers. Saving a new version sets `supersededAt` on the prior current version. Existing consents remain valid (they reference the old version's hash); new registrations auto-require re-consent.
3. **Roster compliance for events** — given a session/event, show the roster + their media-auth status for the intended use scope. Used by the photographer/media tagger before a shoot.

## Media-tagger enforcement

At **publish time** (not tag time):

- Compute the asset's `intendedScope` from session metadata: training session → `internal`; promotional shoot → `promotional`; press release → `public`.
- For each tagged family_member, look up active media-auth consent for that scope. No active consent → block publish, surface a "missing consent for X, Y, Z" warning to the admin.
- Tag-time stays open. The friction is at publish, where it actually matters.
- Phase the rollout: for the first 2 weeks after launch, log violations but soft-warn (admin can override). After 2 weeks, hard-block.

## Revocation

- Parent dashboard: a "Manage consent" page per family_member listing all active consents, with revoke buttons.
- Revocation writes a new `consents` row with `status='revoked'`. The query for "is this consent active" becomes "most-recent row for (familyMemberId, type, scope) has status='granted' AND no superseding revoke."
- Revocation does NOT cascade to already-published assets. Privacy policy commits to "withdraw consent by removing the photo" — a request goes to support@aspiresportsohio.com (manual takedown). Future-publications respect the revoke.

## E-signature legal grade

- Typed name + IP + user-agent + UTC timestamp + content hash = sufficient under UETA + ESIGN Act for the use cases here (waivers, media releases). This is the same standard most youth-sports SaaS uses.
- Not implementing DocuSign-style cryptographic signing in V1. Can layer in later if a customer demands it.

## Out of scope for V1

- Per-program waiver overrides. Org-level only for now.
- Multilingual waiver text. English only for now.
- Cryptographic signature/blockchain audit. Standard timestamp + hash only.
- Bulk re-consent UI when waiver version changes. The system enforces individual re-consent at next registration; no batched re-consent campaign in V1.

## Phasing

1. **Phase 1 — Schema + backfill migration.** New `waivers` and `consents` tables, backfill from existing columns. Deploy + verify backfill against prod data shape.
2. **Phase 2 — `recordConsent` helper + wire into existing registration paths.** No UI changes yet; all paths now write structured consent rows. Old columns kept readable for backwards compat.
3. **Phase 3 — Wizard step decomposition.** Add parental-consent step, age-confirmation step, media-auth step. Update guest checkout to call same helper.
4. **Phase 4 — Admin compliance views.** Per-child status table + waiver content management.
5. **Phase 5 — Media-tagger enforcement.** Soft-warn for 2 weeks, then hard-block. Adds the "intended scope" field to shoot sessions.
6. **Phase 6 — Parent revocation UI.** Self-serve revoke from family-member dashboard.

Phases 1–3 are launch-blocker; 4–6 can ship post-beta.

## Open questions for user sign-off

1. **Media-auth granularity:** do you want 3 scopes (Internal / Promotional / Public) or simpler binary (allow / disallow)? **Default proposed: 3 scopes.**
2. **Hard-block on publish:** is the "soft-warn for 2 weeks then hard-block" rollout acceptable, or do you want hard-block from day one? **Default proposed: phased.**
3. **Media auth defaults:** Internal=on, Promotional=off, Public=off. Acceptable?
4. **Waiver scope:** per-season per-child. Each new registration in a new season requires re-sign. Acceptable?
5. **Walk-up registration:** record paper consent via admin proxy with audit metadata, or require electronic capture even for in-person registrations?
6. **Backfill choice:** backfill existing photoConsent rows as `media_authorization` scope=`internal` only, NOT promotional or public. Existing parents would need to re-consent for those scopes. Acceptable?
