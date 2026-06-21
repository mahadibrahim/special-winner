# Search & Person 360 — Design Spec

- **Date:** 2026-06-21
- **Status:** Approved design (validated via interactive mockups); ready for implementation planning
- **Slice:** A follow-on to the venue front-desk command center (PR #269). Adds the **second, non-spatial way** to act — search — and a comprehensive person card.

## Context

The venue command center (`/admin/venue`) is **calendar-first**: every action is reached by finding a thing *on the grid* (click an activity → roster → walk-in). There is no path for "I just have a name/phone at the desk," for a player not on a visible session, or for an empty field. The building blocks exist as *separate* pages — `/admin/lookup` (player/account search) and `/admin/venue/walk-up` — but they aren't surfaced in the hub, and there is no single rich view of a person.

## Problem

A front desk needs a **lexical** way in (search by name/phone/email) alongside the **spatial** calendar, and a **comprehensive person view** to answer "who is this, what are they here for, what do they owe, what's missing" and take the obvious actions — without leaving the command center.

## Goals

- A **search + quick-actions bar** in the command center (find a person, start a walk-in, find a booking) — reachable via a visible bar and a `⌘K` shortcut.
- An **adaptive person-360 card** (right-side slide-over) that re-shapes by person type and carries inline actions.
- **Clearly labeled children**, with the **parent's** contact surfaced and family linked both ways.
- Reuse the existing search endpoint, person/contact model, and check-in/send-link/walk-in flows. One new aggregation endpoint.

## Non-goals

- **Global `⌘K` across all of admin** — this slice scopes search to the venue command center (front desk). A global palette can reuse the same components later.
- **A dedicated full person page** (`/admin/people/[id]`) — the slide-over links to it via "Open full profile →", but the page itself is a fast-follow.
- **Card-present payment** (Stripe Terminal) — tracked separately on the roadmap.
- **Editing** the person's full profile inline beyond contact/photo — deep edits stay on existing detail pages.

## Audience & context

Venue admin + front-desk staff, inside `/admin/venue`. Responsive (the slide-over becomes a full-screen sheet on mobile).

## The person model (three shapes, one card)

A "person" the desk encounters is one of three, all already in the schema:

- **Child player** — a `family_members` row with `parent_user_id` set (dependent, COPPA). **No own contact** — phone/email come from the parent `users` row.
- **Adult player** — a `family_members` row with `self_user_id` set (linked to their own account). Own contact + membership.
- **Parent / account** — a `users` row that manages dependents and pays; may not be a player.

**One adaptive card component** renders all three; the *content* shifts (below). This is a single, consistent surface, not three card designs.

## The search & actions bar

- A search input in the command-center header (reuse the debounced, 2-char-min pattern and the `GET /api/admin/lookup` endpoint, which already searches `users` by email/name and `family_members` by name, org-scoped).
- Results grouped **Players** (family_members, each with an age + "dependent of <parent>" / "adult" sub-line) and **Parents / accounts** (users). Clicking a result opens the person card.
- A **`⌘K`** shortcut focuses the search.
- Persistent **`+ Walk-in`** (start a walk-in without an open calendar slot — pick the session, then the existing who→waiver→payment flow) and **`Find booking`** actions live next to the search.

## The adaptive person-360 card (slide-over)

A right-side **Sheet** (reuse `src/components/ui/sheet.tsx`). Shared header + type-specific body.

**Header (all types):** avatar (with a 📷 to capture/replace via `AvatarUploader`), name, a **type badge + avatar tint** (child = teal, adult = slate, parent = ochre), age/DOB, and at-a-glance **flags** (medical ⚠, membership, balance). Contact block — see per-type.

**Child:**
- Badge **"Child · age N"**; contact block labeled **"Parent · <name>"** showing the *parent's* phone/email.
- **Today** (rostered/checked-in sessions) with **waiver / photo / paid / checked-in** chips and inline **Check in · Send to parent · Capture photo**. Link actions are explicitly **"Send to parent."**
- **Consents (COPPA):** parental / liability / media chips.
- Distinct tint so a minor is unmistakable.

**Adult player:**
- Badge **"Adult player"**; own contact.
- **Today** with the four status chips + Check in / Send link.
- **Membership:** plan, renewal, recent visits (if a member).

**Parent / account:**
- Badge **"Parent · account"**; own contact.
- **Family:** a roster of the dependents they manage (each row clickable → that person's card), with each child's today/status at a glance.
- **Account & billing:** total paid, outstanding balance, payment method on file, registration count.
- Primary action pivots to **"+ Walk-in for family"** + Message (no "today as a player").

**Sticky action bar (player types):** Check in · Send link (→ parent for a child) · Add to session (walk-in) · Message. Plus an **"Open full profile →"** link (opens the future dedicated page).

**Family linkage both ways:** from a child, jump to the parent and siblings; from a parent, see all dependents.

## Data / API

New endpoint: **`GET /api/admin/person/[id]?as=family_member|user`** → a type-discriminated payload, tenant-scoped (org/location) via the existing helpers; admin-gated.

Returns `{ type: "child" | "adult" | "parent", person: {...}, contact: {...}, today: [...], registrations: [...], payments: {...}, membership?: {...}, consents: [...], family?: [...] }` composed from:

- **Identity/contact:** `family_members` (+ linked parent/self `users` for contact); `users` for the parent case.
- **Today:** the person's rostered/checked-in sessions for the current date (reuse the check-in day-view / roster queries; match by `family_member_id` / `recipient_user_id`).
- **Registrations:** `registrations` by `family_member_id` (season, status, payment status).
- **Payments / balance:** aggregate `payments` via the person's registrations (total paid, outstanding); last payment.
- **Membership:** `memberships` by `user_id` (adult/parent).
- **Consents:** `consents` by `family_member_id` (liability / media / parental, current/granted).
- **Family (parent case):** `family_members` where `parent_user_id = <user>` (each with a light today/status summary).

## Reuse

- Search: `GET /api/admin/lookup` + the debounced `LookupSearch` input pattern.
- Card primitives: `Sheet` (slide-over), `AvatarUploader`, the `StatusChip` pattern + `Badge`, `SendLinkActions` (email/SMS/QR).
- Actions: `/api/admin/check-in/check-in`, `/api/admin/check-in/send-link`, `/api/admin/check-in/upload-photo`, the walk-in flow (`WalkInFlow` + kiosk `walkin/start`), and `/messages` for Message.
- The command center's `ActivityDetailPanel` `RowData`/chip patterns are the model for the Today section.

## Components (decomposition)

- `CommandSearchBar` (input + results + `⌘K` + Walk-in/Find-booking actions) → opens `PersonCard`.
- `PersonCard` (Sheet shell; fetches `usesPerson(id, as)`) → composes `PersonHeader` + a type-specific body:
  - `PersonTodaySection`, `RegistrationsSection`, `PaymentsSection`, `ConsentsSection`, `MembershipSection`, `FamilySection`.
- `usePerson` hook + the `GET /api/admin/person/[id]` endpoint (the single data contract).
- A small pure `derivePersonType(row)` helper (child/adult/parent) — unit-tested.

## Error / loading / empty

- Shared `ErrorBanner` / `LoadingSkeleton` / `EmptyState` primitives.
- Card loading → skeleton in the Sheet; fetch error → `ErrorBanner` inside the Sheet (don't blank it).
- Search: empty/short query → idle prompt; no matches → "No one matches '<q>'."

## Testing

- **Unit:** `derivePersonType` (child vs adult vs parent from the row shape); the payments/balance aggregation; the search result grouping.
- **API:** `GET /api/admin/person/[id]` returns the correct type-discriminated, tenant-scoped payload for a child (parent contact), an adult (own contact + membership), and a parent (family roster); 401/404/cross-org-denied.
- **E2E (Playwright):** from the command center, search a name → open the card → assert the child card shows "Child" + parent contact + COPPA; click a quick action. Use `waitForHydration`; account for the staging-DB latency caveat (CLAUDE.md) with realistic timeouts on data-dependent assertions.

## Rollout

- Ship the `GET /api/admin/person/[id]` endpoint first (additive, read-only), then the `CommandSearchBar` + `PersonCard` into the command center.
- No schema changes anticipated (all reads off existing tables).
- "Open full profile →" links to a `/admin/people/[id]` page that is a documented fast-follow (the slide-over is sufficient for v1).
