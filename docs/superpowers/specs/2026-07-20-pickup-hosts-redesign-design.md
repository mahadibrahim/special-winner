# Manage Pickup and Hosts — redesign spec

**Date:** 2026-07-20
**Branch:** `feat/pickup-hosts-redesign` (stacked on `feat/rename-pickup-nav`, PR #431)
**Surface:** `/admin/dropins` (Sessions / Rate card / Hosts tabs) + session detail + post-session feedback form

## Why

The owner saw live pickup sessions on the public site but couldn't find or manage
them in the admin. Investigation found: naming mismatch (fixed in PR #431), a
misleading empty state (fixed in #431), no Delete anywhere in the UI despite a
guarded hard-delete endpoint existing, a host-assignment picker that dead-ends
when the org has zero hosts (prod's current state), and no visibility of host
coverage or session fill without clicking into each session. Owner direction:

- Primary jobs are **weekly schedule ops** and **fill monitoring**; day-of
  running is secondary.
- Host **vetting via the public application stays primary**; once vetted,
  assignment must be easy. Admin needs a manual add path for known regulars.
- **Host assignment is optional** — owners fill in as needed. Unhosted is a
  normal state, not a warning.
- Add a **lightweight host review**: ride the existing post-session NPS ask
  (which already funnels high scorers to Google reviews); ratings become the
  substrate for a future host incentive system (out of scope now).

## 1. Sessions tab → week-schedule view

Replace the flat table in `SessionsList.tsx` with a week-at-a-time schedule:

- **Week navigator**: `◀ {Mon} – {Sun} ▶` plus a "Today" reset. Defaults to the
  current week. Client fetches `GET /api/admin/dropin/sessions?from=&to=` with
  the visible week's bounds (the endpoint already supports `from`/`to`).
- **Day grouping**: one section per day, Mon–Sun. Days with no sessions render a
  muted row with a quiet `+ add` linking to the new-session form pre-filled with
  that date (`/admin/dropin/sessions/new?date=YYYY-MM-DD`; form reads the param).
- **Session card** (links to detail): sport/format · start–end time · venue name
  · kind badge (pickup/class) · status badge when not scheduled (cancelled
  renders the card muted, not hidden).
  - **Fill bar**: `confirmedCount / capacity` with waitlist count when > 0.
    Uses the counts the list endpoint already returns.
  - **Host line**: host name when assigned; otherwise muted "No host" text with
    an inline **Assign** affordance. Neutral styling — never amber/warning.
  - **Overflow menu** `⋯`: View, Edit, Repeat weekly, Cancel, Delete.
- **Location scope**: the venue-picker scoping and empty-state copy from PR #431
  carry over; the week view shows a one-line scope hint when a venue is pinned.

API change (additive): list endpoint also returns `hostUserId` and `hostName`
(left join `users` on `dropInSessions.hostUserId`).

## 2. Delete

- **Where**: card overflow menu + session detail header.
- **Behavior**: calls the existing `DELETE /api/admin/dropin/sessions/:id`
  (hard delete; server 409s when any non-cancelled booking exists and removes
  the field-time ledger block). Confirm dialog explains: "Permanently removes
  this session. If people are booked, use Cancel instead — it refunds and
  notifies them."
- **Enablement**: shown always; on 409 the error toast surfaces the server
  message. (No client-side pre-check needed — the list doesn't know booking
  states beyond counts, and the server is authoritative.)
- **Cleanup**: fix the stale header comment in `[id].ts` that says "soft-delete
  (status = cancelled)" — the implementation hard-deletes.

## 3. Host assignment

- Inline **Assign** on cards opens a popover listing **active** hosts (from
  `GET /api/admin/hosts`, already filtered client-side today). Selecting one
  calls the existing `PUT /api/admin/dropin/sessions/:id/host`.
- Detail page keeps its Assign / Change / Remove section unchanged.
- **Zero-hosts state**: popover (and detail picker) show "No active hosts yet —
  approve applicants or add one in the Hosts tab" with a link, instead of an
  empty `<select>`.

## 4. Hosts tab

Vetting flow untouched. Additions:

- **Coverage line** (informational, not alarm-styled): "N upcoming pickup
  sessions have no host" linking to the Sessions tab. Server: cheap count query
  added to `GET /api/admin/hosts` response (upcoming = `startsAt > now()`,
  `status = 'scheduled'`, `kind = 'pickup'`, `hostUserId is null`, same
  org/location scope as the sessions list).
- **Add host manually** (secondary button): search existing users by name/email
  (reuse the admin user-lookup endpoint if one fits, else a minimal
  `GET /api/admin/hosts/user-search?q=`), pick one → `POST /api/admin/hosts`
  `{ userId }` creates an **active** `host_profiles` row (409 if a profile
  already exists for that user+org). Org-scoped via `requireOrgAdminAccess`.
- **Ratings columns**: average host rating (1 decimal) and rating count per
  host, from the new `host_ratings` table (see §5). Blank until ratings exist.

## 5. Host reviews (rides the existing feedback engine)

No new ask, no new email/SMS, Google-review funnel untouched.

- **Dispatch** (`src/lib/feedback/dispatch.ts`, `nps_drop_in` kind): when the
  session row has `hostUserId`, stamp `hostUserId` and `hostName` into
  `FeedbackRequestMetadata` (two new optional fields).
- **Form** (`/feedback/[token]`): when metadata carries a host, render one
  optional question after the NPS score: "How was your host, {firstName}?" —
  1–5 stars + optional short comment. Skippable; submitting NPS alone still
  completes the request.
- **Storage**: new table `host_ratings` mirroring `referee_ratings`' shape:
  `id, organization_id, feedback_request_id (unique), session_id, host_user_id,
  rating (1–5 check), comment, created_at`. Written by a new
  `POST /api/feedback/[token]/host-rating` endpoint following the referee
  endpoint's token-validation pattern (or folded into the score submit if the
  form posts once — implementation's choice, but one write path only).
- **Migration**: additive only — new table, no enum changes. (Per repo
  convention: idempotent, own migration file via `db:generate`.)
- **Out of scope**: host-facing rating visibility, incentives, thresholds.

## Non-goals

- No changes to rate card tab, public pickup pages, host self-claim flow, or
  the kind=`class` behavior (cards show class sessions identically minus
  host-claim semantics — hosts can be assigned to either kind by admins, as the
  API already allows; only self-claim is pickup-only).
- No calendar drag-and-drop, no multi-week view, no day-of check-in changes.

## Testing

- **API tests** (`tests/api/`): `POST /api/admin/hosts` (create, duplicate 409,
  cross-org 404), host-rating submit (valid, out-of-range, expired token,
  unhosted session no-op), sessions list returns host fields, hosts response
  includes unhosted count.
- **Unit** (`tests/unit/`): week-bucketing helper (sessions → day groups,
  timezone-safe using the org timezone convention).
- **E2E** (`tests/e2e/`): grep existing dropin/admin specs for selectors that
  assume the table layout and update them; add a spec for week navigation +
  assign-host popover (with `waitForHydration`, click-driven). Note post-merge
  `test-full` gap — update specs in the same PR.
- **Visual**: verify in browser on both brands (BrandTheme token inversion).
