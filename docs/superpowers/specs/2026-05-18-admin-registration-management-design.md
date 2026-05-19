# Admin Registration Management — Design

**Status:** Approved 2026-05-18.
**Branch:** `feat/admin-registration-management` (worktree branch starts as `worktree-feat-admin-registration-management`; rename before push).

## Problem

`/admin` has no UI for direct action on a registration row. When the founder's 2026-05-18 live-Stripe smoke test produced a `paid_zero` row (status=confirmed, paymentStatus=paid, amountDueCents=0 — correct behavior at the time, since FOUNDERS was 100% off) the "already registered for this season" guard then blocked retry, and there was no admin button to clear it. The fix required a manual `DELETE FROM registrations` via psql.

Existing surfaces stop short:

- `/admin/registrations` — read-only filterable list. Tenant-scoped via `locations.organizationId`.
- `/admin/refunds` — approve/deny queue for refunds the customer initiated via the self-service cancel flow (`POST /api/registrations/[id]/cancel` sets `refundStatus=pending_approval`).
- `POST /api/admin/refunds/[id]` — Stripe Connect-aware processor; only works when `refundStatus=pending_approval`.

This will hit a real customer in the first weeks of registration (refund requests, parent registered the wrong kid, junk row from a coupon edge case). Not strictly blocking 2026-05-20 but should ship in week 1 of real registrations.

## Scope

Add admin-initiated, direct actions on **any** registration row, independent of whether the customer has filed a refund request.

### In scope

1. **Detail page** at `/admin/registrations/[id]`. Action surface (not the list).
2. **Cancel** with reason — no policy gate; admin overrides.
3. **Refund** — direct Stripe refund, full or partial. Can stand alone (price adjustment) or pair with cancel.
4. **Delete** (hard) — for junk rows. Refuses if `amountPaidCents > 0 && paymentStatus != 'refunded'` unless `?force=true`.
5. **Manage link** in the existing list view pointing at the detail page.

### Out of scope (do not expand)

- Bulk operations
- Refund analytics / trends
- Reactivating cancelled registrations
- Free-form admin editing of waiver / payment-status fields
- Audit table for hard deletes (Stripe is the trail; one admin in v1)

## Architecture

### Endpoints — new

All under `src/pages/api/admin/registrations/[id]/`. Tenant scope via the existing `requireAdminAccess` + `requireOrganizationContext` + `locations.organizationId` pattern. Identical to `src/pages/api/admin/registrations.ts` (list) and `src/pages/api/admin/refunds/[id].ts`.

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/admin/registrations/[id]` | Full registration + family member + season + program + sport + location + payment history (joined from `payments`). |
| `POST` | `/api/admin/registrations/[id]/cancel` | Body: `{ reason?: string }`. Sets `status=cancelled`, `cancelledAt=now()`, `cancelledReason`, `cancelledBy=admin.id`. Does NOT auto-refund (refund is a separate explicit action). Promotes waitlist using existing `promoteFromWaitlist` helper logic. |
| `POST` | `/api/admin/registrations/[id]/refund` | Body: `{ amountCents: number, reason?: string, alsoCancel?: boolean }`. Calls extracted `adminRefund()` helper. Returns updated registration + Stripe refund id (or no-op result if `amountPaidCents == 0`). |
| `DELETE` | `/api/admin/registrations/[id]` | Hard delete the row. Refuses with 409 if `amountPaidCents > 0 && paymentStatus != 'refunded'` unless query `?force=true`. Cascades follow Drizzle FK behavior already in schema. |

### Helper — extracted

`src/lib/payments/admin-refund.ts` — pulled out of the existing `POST /api/admin/refunds/[id]`. Encapsulates:

- Stripe Connect branch detection (uses `organizations.stripeAccountId` + `stripeOnboardingComplete`)
- `reverse_transfer` + `refund_application_fee` for Connect flow
- Stable idempotency key (`${registrationId}:refund:${amountCents}`)
- `payments` row update (`status=refunded`, `refundReason`)
- `registrations` row update (`amountPaidCents`, `paymentStatus` partial vs full, `status=refunded` when full)
- Email send via `sendRefundNotificationEmail`

The existing queue endpoint (`POST /api/admin/refunds/[id]`) refactors to call this helper. Behavior must not change — verified by existing tests.

### UI

- **Page:** `src/pages/admin/registrations/[id].astro` — middleware-gated, BaseLayout + AdminLayout, renders `<RegistrationDetail client:load id={id} />`.
- **Component:** `src/components/admin/registration-detail.tsx` — fetches `GET /api/admin/registrations/[id]`, renders sections: header (player name, program/season, status badges), registration details, payment history table, action panel.
- **Action panel:** three buttons (Cancel, Refund, Delete) opening modals.
  - Cancel modal: optional reason textarea; confirm button.
  - Refund modal: amount input (cents, defaulting to `amountPaidCents`), optional `alsoCancel` checkbox, optional reason.
  - Delete modal: typed-confirmation requirement ("type `DELETE` to confirm"); shows `force` toggle only when the guard would block.
- **List wiring:** `src/components/admin/registrations-list.tsx` gets a "Manage" link per row → `/admin/registrations/${id}`.

UI feedback primitives: `ErrorBanner` for inline state errors, `toast` (sonner) for action-level success/failure.

## Data model

No schema changes. All required columns (`status`, `cancelledAt`, `cancelledReason`, `cancelledBy`, `refundStatus`, `refundAmountCents`, `paymentStatus`, `amountPaidCents`) already exist on `registrations`. The `payments` table already supports `status=refunded` + `refundReason`.

## Tenant scope

Every new endpoint MUST validate that the row's `program.location.organizationId == orgContext.organizationId` before reading or mutating, identical to the existing list endpoint. The detail GET joins through `locations` for the org filter; mutating endpoints re-fetch with the same filter inside the same handler.

## Tests

- `tests/api/admin-registrations.test.ts`
  - `GET /:id` returns 404 for cross-org access
  - `POST /:id/cancel` sets status=cancelled, records reason+admin id
  - `POST /:id/refund` partial → `paymentStatus=partial_refund`, `amountPaidCents` decremented
  - `POST /:id/refund` full → `paymentStatus=refunded`, `status=refunded`
  - `DELETE /:id` refuses when `amountPaidCents > 0 && paymentStatus != 'refunded'`
  - `DELETE /:id?force=true` succeeds anyway
- No new E2E required; existing admin smoke covers the navigation surface, and Stripe refunds against the test API key are already exercised by the refund-queue tests.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Helper extraction silently changes behavior of existing refund queue endpoint | Keep extraction byte-for-byte equivalent; existing tests must pass without modification |
| Admin force-deletes a paid row by mistake | Typed-confirmation modal; force toggle only appears when the guard would block |
| Stripe refund partial-success / network failure | Helper bubbles Stripe errors as 500 with details, identical to existing pattern; admin sees toast.error |
| Cross-org row access | Org filter on every join, copied from existing list endpoint |

## Branch + commit plan

One PR off `main` on `feat/admin-registration-management`. Commits in this order — each independently reviewable:

1. Spec doc (this file).
2. Extract `adminRefund()` helper; refactor existing refund-queue endpoint to use it. No behavior change.
3. Add four admin registration endpoints + API tests.
4. Add detail page + component; wire Manage link.
5. Manual smoke notes (if anything surfaces).

Squash on merge so the founder's "one commit per PR" preference is honored at the `main` history level while keeping reviewable diffs locally.

## Estimate

~3 hours including tests.
