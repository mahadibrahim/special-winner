# Unified Bookings Timeline — Design Spec

**Date:** 2026-06-18
**Status:** Approved (design); pending implementation plan.
**Scope:** Redesign the content of `/dashboard/bookings` into a single chronological timeline of all bookings (drop-ins + field rentals), and fix two brand-aware back-links surfaced by the routing audit. Shared component — auto-themes for both Aspire and SoccerOne.

## Problem

`/dashboard/bookings` renders two independent, separately-loading sections (`MyDropInBookings` + `MyFieldRentals`), each with its own header, its own upcoming/past split, and its own full-size empty state. When a user has, say, one drop-in booking and no rentals, the page shows a small card up top and a large empty "Field Rentals" block below, separated by `space-y-12` — sparse, flat, and unbalanced. The SoccerOne header/footer/skin are already applied automatically by `BaseLayout` (chrome swaps on `theme.chrome === "soccerone"`), so this is a **content-layout** problem, not a chrome problem.

Separately, the routing audit found two internal links that are wrong for SoccerOne users (who navigate under `/pickup`, not the generic `/dropin`):
- `SessionDetail.tsx` — the "← All sessions" back-link points to `/dropin`.
- `MyDropInBookings.tsx` — the empty-state "Browse drop-in sessions" link points to `/dropin`.

## Goals

- One cohesive **Upcoming / Past** timeline merging drop-ins and rentals, sorted by time.
- A page header with a live "N upcoming" count and a hero treatment on the next item, so the page reads as intentional rather than sparse.
- A single combined empty state (only when there are no bookings of either type).
- Brand-correct back-links (`/pickup` for SoccerOne, `/dropin` for Aspire).
- No duplication of booking logic beyond what's necessary; no new API endpoints; no schema changes.

## Non-goals

- No changes to `/dashboard/play` (which also uses `MyDropInBookings` and `MyFieldRentals`).
- No forked SoccerOne-only page — the shared component themes via tokens.
- No new booking/rental API endpoints; reuse `/api/dropin/bookings` and `/api/rentals/bookings`.

## Architecture

### New component: `src/components/dashboard/MyBookings.tsx`

Client component (`"use client"`) that owns data loading, normalization, and rendering for the bookings page.

**Data loading.** Fetches both endpoints in parallel with `Promise.allSettled`:
- `/api/dropin/bookings` → drop-in bookings
- `/api/rentals/bookings` → field rentals

If both reject → `ErrorBanner`. If one rejects → render the other's items plus a small inline note ("Couldn't load field rentals — refresh to retry"), so a single failing endpoint never blanks the page. Single `LoadingSkeleton` while either is in flight.

**Normalization (pure, unit-testable).** A module `src/lib/dashboard/normalize-bookings.ts` exports:

```ts
type BookingKind = "dropin" | "rental";

interface BookingItem {
  id: string;
  kind: BookingKind;
  cardType: CardType;          // "pickup" | "class" | "field_rental"
  title: string;               // e.g. "Soccer · 7v7" or "Field 2"
  startsAt: string;            // ISO
  endsAt: string | null;
  venueName: string | null;
  status: { label: string; tone: StatusTone };
  isPast: boolean;             // past OR cancelled/no_show
  raw: DropInBooking | FieldRental; // for action handlers
}

function normalizeBookings(
  dropins: DropInBooking[],
  rentals: FieldRental[],
  now: number,
): { upcoming: BookingItem[]; past: BookingItem[] };
```

- `upcoming` = items with `startsAt > now` and not cancelled/no_show, **ascending** by `startsAt`.
- `past` = cancelled/no_show OR `startsAt <= now`, **descending** by `startsAt`.
- Drop-in vs rental status mapping reuses the existing `statusTone`/`statusLabel` logic from the two current components (moved into the normalizer or a shared `dashboard-ui` helper). The `cardType` classification (pickup vs class) reuses the existing heuristic in `MyDropInBookings`.

**Rendering.**
- **Header:** `<h2 class="font-display …">My Bookings</h2>` + a muted "N upcoming" line. `font-display` resolves to Anton on SoccerOne, the serif on Aspire.
- **Upcoming section:** maps `upcoming` to `DashboardCard`. The **first** item passes `hero` for presence. Each card keeps its type eyebrow ("PICKUP GAME" / "RENTAL"), so the merged list stays labeled.
- **Past section:** maps `past` to compact (non-hero) `DashboardCard`s under a de-emphasized "Past" sub-header. Rendered only when non-empty.
- **Empty state:** when `upcoming` and `past` are both empty, a single `EmptyState` ("No bookings yet"). Primary CTA *Browse pickup* (`useBrandId()` → `/pickup` | `/dropin`). Secondary CTA *Book a field* → the brand's field-rental page (`/rent` on SoccerOne via the existing rewrite). Whether Aspire exposes a public rentals entry point — and its path — is confirmed at plan time; if Aspire has none, show only the *Browse pickup* CTA on Aspire.

**Per-kind actions.** Each `BookingItem` builds its action node by `kind`:
- Drop-in: Details (`/dropin/{sessionId}`), Check-in (when `isNearStart`), Cancel (confirmed) / Leave waitlist (waitlisted), "Here" badge when checked in.
- Rental: Check-in (when `isNearStart`), Cancel (when allowed), `HoldCountdown` for `pending_payment`, party-size + payment-status children.

Action handlers (cancel, check-in) call the existing endpoints (`/api/dropin/bookings/{id}/cancel`, `/api/rentals/bookings/{id}/cancel`, `/api/dashboard/check-in`) and reload both lists. The success-banner handling for `?rental=success` (currently in `MyFieldRentals`) moves into `MyBookings`.

### Shared extraction: `HoldCountdown`

Move `HoldCountdown` from `MyFieldRentals.tsx` into `src/components/dashboard/shell/HoldCountdown.tsx` and import it from both `MyBookings` (new) and `MyFieldRentals` (still used on `/dashboard/play`). Behavior unchanged.

### New hook: `src/lib/hooks/use-brand-id.ts`

```ts
export function useBrandId(): "aspire" | "soccerone" {
  if (typeof document === "undefined") return "aspire";
  const b = document.documentElement.getAttribute("data-brand");
  return b === "soccerone" ? "soccerone" : "aspire";
}
```

`BaseLayout` already sets `<html data-brand={theme.id}>`, so this is reliable post-hydration. Used for brand-correct links in client components.

### Page: `src/pages/dashboard/bookings.astro`

Replace the two `<section>`s with a single `<MyBookings client:load />`. Keep the existing `BaseLayout` wrapper, `max-w-3xl` container, and `pt-24` (nav offset).

### Audit fixes

- `SessionDetail.tsx`: the "← All sessions" link uses `useBrandId()` → `/pickup` (soccerone) | `/dropin` (aspire).
- The new `MyBookings` empty-state "Browse pickup" CTA uses the same hook. (The old `MyDropInBookings` empty-state link is left as-is, since it's now only reached on `/dashboard/play`; optionally apply the same hook there for consistency — low priority, noted not required.)

## Data flow

```
MyBookings mount
  └─ Promise.allSettled([GET /api/dropin/bookings, GET /api/rentals/bookings])
       └─ normalizeBookings(dropins, rentals, Date.now())  // pure
            └─ { upcoming, past }
                 └─ render header + Upcoming (hero first) + Past
action (cancel / check-in)
  └─ POST existing endpoint → reload() both fetches
```

## Error / loading / empty

- **Loading:** `LoadingSkeleton` until both settle.
- **Both fail:** `ErrorBanner`.
- **One fails:** render the succeeding kind + a small inline note for the failed kind.
- **Empty:** single `EmptyState` with two brand-aware CTAs.

## Testing

- **Unit** (`tests/unit/normalize-bookings.test.ts`): merge/sort correctness — upcoming ascending, past descending, cancelled/no_show routed to past, mixed kinds interleaved by time, empty inputs.
- **E2E**: on a SoccerOne host, `/dashboard/bookings` renders the unified list under SoccerOne chrome; the booking-detail "← All sessions" link resolves to `/pickup`. Reuse/extend the existing brand-skin e2e coverage.

## Components & responsibilities (summary)

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `MyBookings.tsx` | Load both sources, render unified timeline + actions | `normalize-bookings`, `DashboardCard`, `HoldCountdown`, `useBrandId`, existing APIs |
| `normalize-bookings.ts` | Pure merge/sort/normalize → `{upcoming, past}` | `card-types`, `dashboard-ui` |
| `HoldCountdown.tsx` | Live pending-payment countdown badge | — |
| `use-brand-id.ts` | Client brand detection from `data-brand` | — |
| `bookings.astro` | Render `<MyBookings>` in `BaseLayout` | `MyBookings` |

## Files touched

- **Add:** `src/components/dashboard/MyBookings.tsx`, `src/lib/dashboard/normalize-bookings.ts`, `src/components/dashboard/shell/HoldCountdown.tsx`, `src/lib/hooks/use-brand-id.ts`, `tests/unit/normalize-bookings.test.ts`.
- **Edit:** `src/pages/dashboard/bookings.astro` (render `MyBookings`), `src/components/dropin/SessionDetail.tsx` (brand-aware back-link), `src/components/dashboard/MyFieldRentals.tsx` (import shared `HoldCountdown`).
- **Unchanged:** `MyDropInBookings.tsx`, `MyFieldRentals.tsx` rendering (both still used on `/dashboard/play`), all API endpoints, DB schema.
