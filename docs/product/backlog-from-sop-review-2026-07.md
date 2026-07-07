# Product backlog: builds implied by the 2026-07-07 SOP review

Source: the owner's SOP-review answers (ejections, incident reporting,
time tracking, payroll, refunds/credit, media publishing). This is a
planning doc for the owner — it names the problem, today's manual
workaround, a rough shape grounded in the current codebase, and a rough
priority. None of this is scoped or estimated yet; it's the "what and
roughly how," not a spec.

**Explicitly out of this backlog:** live per-goal scoring. The owner
declined it in the SOP review — final score only is fine. Not listed
below, and shouldn't be re-proposed without a new signal from the owner.

---

## 1. Account-credit balance

**Problem.** The owner wants refunds to default to store credit rather
than cash-back, with families able to see and spend that balance at
their next checkout.

**Reality check — this is already promised, just not built.** The
published refund policy (`src/pages/refund-policy.astro`) already says
partial refunds are "reviewed case by case. The default is a prorated
credit toward a future Aspire Sports [program/season]." But nothing in
the code can issue a non-cash credit. Every refund path —
`src/pages/api/admin/registrations/[id]/refund.ts` (admin-direct) and
`src/pages/api/admin/refunds/[id].ts` (customer-request queue) — funnels
through `adminRefund()` in `src/lib/payments/admin-refund.ts`, which only
knows how to call `stripe.refunds.create(...)` against the original
payment intent. There is no credit ledger anywhere in
`src/lib/db/schema/payments.ts` or elsewhere. The policy is currently
aspirational copy the product doesn't back up.

**Current manual workaround.** Admin either issues a real Stripe refund,
or (per the SOP) tracks a promised "credit" off-platform (spreadsheet /
memory) and manually discounts a future registration — with no system of
record and no way for a parent to see a balance.

**Rough shape.** Model it like the existing discount-code system
(`src/lib/db/schema/discounts.ts` — `discountCodes` + `discountUsages`,
an append-only usage ledger), not like a mutable balance column:
- New tables: `account_credits` (issuing event: amount, reason, source
  registration/refund, issued-by admin, org, expiry policy) and an
  append-only `account_credit_ledger` or reuse the issuance rows with a
  `redeemed_at`/`redemption_registration_id` pair — ledger over mutable
  balance avoids race conditions, matches the "explicit `orderBy`,
  no implicit latest-row" convention already used elsewhere in this repo.
- Attach credit to the same identity `payments.userId` already keys off
  (`src/lib/db/schema/payments.ts`) — i.e., the registering user's
  account, not the family_member/dependent — since a user's account is
  the durable "family" concept for billing.
- Admin action: extend `adminRefund()` (or add a sibling
  `issueAccountCredit()`) with an `asCredit: boolean` option that, instead
  of calling Stripe, writes a credit-issuance row for
  `refundAmountCents` and marks the registration refunded/credited.
- Checkout: `src/components/registration/payment-step.tsx` already has a
  slot for a value that reduces the charged amount before Stripe
  (`AppliedDiscount` / `computeSurchargeCents` in
  `src/lib/payments/surcharge.ts`) — add a parallel "apply account
  credit" control there, and a fetch of the user's balance to display
  it in `src/components/dashboard/payments-summary.tsx` or similar.

**Rough priority: High.** The policy already tells families this is how
refunds work; today it's not true. Closes a live policy/product gap and
the schema pattern (ledger table) already exists to copy.

---

## 2. Ejection / suspension tracker in the ref experience

**Problem.** Owner: "we need a tracker... don't want bad actors" —
i.e., a coach or player ejected in one match should not quietly show up
un-flagged in the next one; suspensions need to carry forward.

**Current manual workaround.** Ejections are captured only as a
`red_card` incident with free-text notes. In
`src/lib/db/schema/teams.ts`, `gameIncidentTypeEnum` is
`["yellow_card", "red_card", "injury", "other"]`, and `gameIncidents`
stores `player` as a bare `varchar(120)` — not a foreign key to any
roster/family-member row. There's no suspension concept, no
"carries forward to next match" flag, and nothing that would stop the
same person from playing/coaching next week. The ops-catalog SOP form
`docs/operations/catalog/artifacts/frm.ejection_log.yaml` (status:
`stub`) already asks the right paper-process questions — "carries a
suspension under league rules?", "escalated to director?" — confirming
this is process the org already wants to run, just not wired to
anything that blocks a roster.

**Rough shape.**
- Schema: add `"ejection"` (or split ejections out from `red_card` with
  an `is_ejection` boolean) to `gameIncidentTypeEnum`, and a new
  `suspensions` table (person — ideally resolved to a `familyMemberId`
  once rosters are linkable, org, reason, `games_missed` or
  `expires_after_game_id`, `status: active|served|appealed`, linked
  `gameIncidentId`).
- The referee match-report UI (`src/components/referee/match-report.tsx`,
  posting to `src/pages/api/referee/matches/[gameId]/report.ts`) already
  lets a ref log an incident per match; extend the incident row with an
  "ejection" flag + optional suspension length, matching
  `frm.ejection_log.yaml`'s fields (`carries_suspension`,
  `suspension_notes`, `escalated_to_director`).
- Surface active suspensions to admin (roster/team admin page) and to
  the next assigned ref for that person's team — a simple "flagged"
  banner is enough for v1; auto-blocking roster assignment is a stretch
  goal once `player` is a real foreign key rather than free text.

**Rough priority: Medium-high.** Safety/reputation-sensitive (owner's own
words), and the incident data model is most of the way there — this is
additive to `gameIncidents`, not a rebuild.

---

## 3. In-app, contemporaneous incident reporting

**Problem.** Owner wants incidents (injuries, altercations, medical
events) captured digitally, same-day, not on paper after the fact.

**Current state — there is no in-app incident-submission UI.** Searching
`src/pages` and `src/components` for "incident" turns up only the
referee match-report's *game* incidents (yellow/red/injury/other tied to
a specific game/ref report) — nothing for a general staff-facing
incident report. The real incident process today lives entirely in the
ops catalog as **paper-form stubs**:
`docs/operations/catalog/artifacts/frm.incident_response.yaml` and
`frm.incident_report_full.yaml` (both `status: stub`) define exactly the
fields the org wants (type, time observed, people involved, first
responder, care given, 911 called y/n, parent notified on-site,
witness statements, post-event status, photos, insurance/liability
flag) — but they're field definitions for a paper/PDF form, not a
running app screen.

**Current manual workaround.** Per the manuals
(`docs/operations/artifacts/manuals/role.venue_manager.md`,
`role.event_lead.md`), staff fill out the paper form on-site and it gets
transcribed/filed later — same-day digital capture doesn't happen.

**Rough shape.**
- This is exactly what the org's own `feat.form_renderer` platform
  feature (referenced from `platform_features` in several `act.*.yaml`
  activities) is meant to back — build a mobile-first incident-report
  form component under `src/components/staff/` (or extend
  `src/components/referee/` conventions) that renders the
  `frm.incident_response.yaml` field set, POSTing to a new
  `src/pages/api/staff/incidents` (or `/admin/incidents`) endpoint.
- New `incidents` table: org-scoped, `reported_by_user_id`, `venue_id`,
  optional `game_id`, `family_member_id` (nullable — bystanders/staff
  aren't family_members), the field set from the stub YAML, `status`
  (open/escalated/closed), timestamps.
- COPPA care: incident subjects are frequently minors — store by
  `family_member_id` (per the People model in this repo's CLAUDE.md,
  resolved via `resolvePerson()`) rather than free-text names, and gate
  read access the same way media/consent data is gated today (tenant +
  role check via `requireSameOrg*` helpers).
- Tie completion into the existing activity-tracking engine
  (`src/lib/activity-tracking/`) so a filed incident can satisfy the
  `act.*` SOP activity automatically instead of a separate manual
  sign-off — the engine already exists for exactly this kind of
  "did the required thing happen" tracking.

**Rough priority: High.** Liability-sensitive, same-day capture is the
explicit ask, and the field schema is already fully specified in the
stub YAMLs — this is "wire up a form to a table," not "invent the
process."

---

## 4. In-app check-in/out time tracking with geolocation

**Problem.** Owner wants to avoid paying for Homebase-style SaaS; needs
coaches/venue-managers clocked hourly and refs clocked per-match, with
location verification (they were actually at the venue).

**Current state — nothing exists.** There is no clock-in/out schema, no
geofence/geolocation code anywhere in `src/lib`, `src/pages`, or
`src/components` (grepped for `clock_in`, `geofence`, `geolocation`,
`timesheet`). Venues (`src/lib/db/schema/teams.ts`) only store a text
`address` — no lat/lng today, so geofencing needs a venue coordinates
migration first. What *does* exist is process-shaped: the ops catalog's
`act.staff_clock_out.yaml` and the ref stipend flow
(`act.ref_stipend_log.yaml`) describe exactly this SOP —
"staff signs out at end of shift, feeds payroll integration" — with
`tracking_method: signature` today (an in-person signature capture at
`/admin/activity-completions/[id]`, per
`src/components/admin/activity-completions/external-ack-readback.tsx`),
not a phone-based geofenced clock.

**Current manual workaround.** In-person signature-based clock-out
witnessed by the venue manager/front-of-house, per
`docs/operations/artifacts/manuals/role.venue_manager.md` — no location
verification, no digital timestamp source of truth, and (per
`feat.payroll_integration.yaml`, `status: stub`) no feed into payroll at
all yet; it's paper/signature only.

**Rough shape.**
- Schema: `venues` gets `latitude`/`longitude` (+ optional `radius_m`);
  new `labor_events` (or `time_entries`) table: `user_id`, `venue_id`,
  `role` (coach/venue_manager/referee), `clock_in_at`, `clock_out_at`,
  `clock_in_lat/lng`, `distance_from_venue_m`, `flagged_out_of_range`
  (bool, don't hard-block on a bad GPS fix — flag for admin review),
  optional `game_id` for per-match ref check-ins.
- Mobile-friendly `client:load` React component (a "my shift" page under
  something like `/dashboard/shifts` or `/coach/clock`) using the
  browser Geolocation API at the two tap events (clock in / clock out).
  For refs, hang the check-in off the existing `game_officials` table
  (`src/lib/db/schema/teams.ts` — already has `feeCents`,
  `officialPaymentStatusEnum`) rather than inventing a parallel ref
  identity.
- Replace the `signature` tracking_method on `act.staff_clock_out` /
  `act.ref_stipend_log` with a `system_event` completion fired the
  moment a clock-out row lands — activity-tracking engine
  (`src/lib/activity-tracking/mark-complete.ts`,
  `markCompleteBySystemEvent`) already supports exactly this trigger
  shape, so this activity type doesn't need new plumbing there.

**Rough priority: Medium.** Real, recurring SaaS-fee savings, but the
biggest net-new build of the six (new schema, new mobile UI, geofencing
logic, no existing code to extend) — sequence after #5's export target
is defined so the two are built against the same data shape.

---

## 5. Gusto-format payroll export

**Problem.** Owner runs payroll through Gusto today, weekly, via manual
upload — wants an export the office can pull straight into Gusto instead
of hand-building it.

**Current state.** `feat.payroll_integration.yaml` is explicitly
`status: stub`. The two payroll SOP activities
(`act.staff_payroll_event.yaml` W-2, `act.ref_payroll_event.yaml` 1099)
both say outright: "there's no live payroll API connection today... the
office pulls this export and enters it into the org's actual payroll
provider" — and today there isn't even an export, just the manual
external-acknowledgment readback at `/admin/activity-completions/[id]`
(`src/components/admin/activity-completions/external-ack-readback.tsx`)
confirming payroll *was run*, after the fact, by hand.

**Current manual workaround.** Director/payroll admin manually compiles
hours and stipends from wherever they're tracked today (largely
off-platform per #4) into Gusto's upload format by hand, weekly.

**Rough shape.**
- This is downstream of #4: once `labor_events`/`time_entries` (hourly
  staff) and per-match ref stipends (`game_officials.feeCents` × matches
  worked, per `act.ref_stipend_log`) exist as real rows, add an admin
  export endpoint (`/api/admin/payroll/export` or similar) that groups
  by pay period and org, and renders Gusto's documented CSV import
  columns (employee identifier, hours or fixed amount, pay
  type/earning code, memo) — two output flavors: W-2 hours (from #4) and
  1099 stipends (from `game_officials`).
- Keep it an export, not a live API push, matching the org's actual
  Gusto usage today (manual weekly upload) — a live Gusto API
  integration is a much bigger, separate ask (OAuth, employee mapping)
  not implied by anything in the SOP answers.
- Once this exists, `markCompleteByExternalAck` in
  `src/lib/activity-tracking/mark-complete.ts` — currently a documented
  placeholder ("won't be wired until the payroll integration lands,"
  "Returns 0 today") — is the natural hook to auto-close the
  `act.staff_payroll_event`/`act.ref_payroll_event` SOP activities once
  Gusto's own confirmation is recorded.

**Rough priority: Medium**, sequenced right after #4 (shares the
underlying labor data) rather than in parallel — building the export
before the source data exists means exporting nothing.

---

## 6. Media publish: roster-based do-not-publish shortlist

**Problem.** The current publish gate is stricter than the owner wants
for routine team photo/video: it requires an explicit, active,
per-person, per-scope consent row before *any* tagged media can publish.
The owner wants team media to publish by default, with a short
opt-out/do-not-publish list per roster, reserving the individual
face-tag consent gate for content that *features* a specific kid.

**How it works today.** `src/lib/consents/publish-check.ts` —
`checkSessionPublishConsent()` — pulls every family_member **face-tagged**
(`mediaTags.familyMemberId` set) across a shoot session, then requires a
`granted`, non-expired `media_authorization` consent row
(`src/lib/db/schema/consents.ts` — `consents` table, scoped by
`mediaAuthScopeEnum`: `internal|promotional|public`) for each one before
`canPublish` is true. Notably, `mediaTags` already distinguishes
face-tags from **team tags** (`mediaTags.teamId` set, `familyMemberId`
null) — team tags are explicitly carved out as not gating publish today
("Tags without a familyMemberId (team tags) don't gate publish"). So the
codebase already has the seam for a two-tier model; it's just not
connected to a do-not-publish list, and the rollout is currently
soft-warn only via `isMediaAuthHardBlockEnabled()` /
`MEDIA_AUTH_HARD_BLOCK` env var.

**Current manual workaround.** Photographers/editors are expected to
know (informally, or from memory) which kids' families opted out, and
manually avoid publishing team media that includes them — no system
enforcement, easy to miss.

**Rough shape.**
- Add a roster/team-level "do not publish" list: reuse the existing
  `consents` table's shape but flip the default — either (a) a new
  `consentStatusEnum` state consumed the same way (a `revoked`-style row
  scoped `type='media_authorization'`, no scope restriction, meaning
  "never publish team media with this person"), or (b) a lighter
  standalone `media_do_not_publish` table keyed on `family_member_id` +
  org, since it's a boolean flag, not a versioned/expiring consent.
  Table (b) is simpler and avoids overloading the consent semantics that
  already carry expiry/scope logic for the individual-featuring case.
- Change `checkSessionPublishConsent()`'s default posture for **team
  tags**: publish team-tagged media unless a tagged family_member is on
  the do-not-publish list for that org (cheap: one more `WHERE NOT IN`
  against the new table). Leave the **face-tag** path exactly as it is
  today — still requires the affirmative, scope-specific
  `media_authorization` grant, since that's the "featuring an individual
  kid" case the strict model is right for.
- Admin surface: a roster page control ("exclude from team media
  publish") next to wherever family/roster consent status is already
  shown, writing to the new table — keep it a simple per-person toggle,
  not a new workflow.

**Rough priority: Medium.** Not urgent/safety-critical like #2/#3, but
low-lift relative to the others (one new table + one query change) and
removes a real, already-identified gap between the strict per-tag model
and how the owner actually wants routine team content to flow.

---

## Rough sequencing

1. **Account credit** (#1) and **incident reporting** (#3) — highest
   priority, both close a live gap between what's already promised/
   expected and what the code does, and both have a clear existing
   pattern to extend (discount ledger; stub form schema).
2. **Ejection/suspension tracker** (#2) — safety-sensitive, additive to
   the existing incident model.
3. **Media do-not-publish shortlist** (#6) — small, standalone, ship
   whenever convenient.
4. **Time tracking + geofencing** (#4) — biggest net-new build; do the
   schema/UX design work before #5.
5. **Gusto export** (#5) — sequenced after #4 so there's real labor data
   to export.
