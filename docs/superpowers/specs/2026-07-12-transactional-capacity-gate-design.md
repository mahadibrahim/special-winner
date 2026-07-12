# Transactional Capacity Gate — Design (Tracker P2 39b40b5d-af23-816f)

Owner decisions (2026-07-12): overflow policy = REFUND + FRONT OF WAITLIST; capacity gates count confirmed + pending_payment + pending_claim as occupying.

## Build
1. Shared helper `checkSessionCapacityLocked(tx, sessionId)` in src/lib/dropin/booking.ts: caller must hold the session row FOR UPDATE; counts confirmed+pending_payment+pending_claim; returns {taken, capacity, full}.
2. Free path (`createConfirmedBookingFreePath`): existing lock stays; capacity check switches to the shared helper (was confirmed-only); `already_booked` guard gains pending_payment.
3. Paid path (`handle-dropin-checkout-complete.ts`): after its existing FOR UPDATE session lock, run the helper BEFORE inserting confirmed. If full → overflow policy: insert the booking as `waitlisted` with front-of-line priority, auto-refund the PaymentIntent (reuse the payment build's refund pattern: idempotency key `${pi.id}:overflow-refund`, stripeRefundId marker, loud alert tag `dropin_overflow_refunded`), and dispatch an honest message ("session filled up as you paid — you're first in line and refunded; we'll text you the moment a spot opens").
4. Front-of-line mechanism: additive column `waitlist_priority integer NOT NULL DEFAULT 0` on drop_in_bookings (migration 008X, additive-only — NO enum use); `promoteNextWaitlister` orders by priority DESC, createdAt ASC. Overflow inserts priority 100.
5. Walk-in path (walkin/start): already session-locked (payment build); its capacity check (if any) switches to the shared helper — verify what it does today and align.
6. Public waitlistCount: stop counting pending_claim (it's already counted as taken) — fixes the double-report.

## Tests
API: free-path full-by-holds → rejected; paid webhook overflow → waitlisted(priority 100) + refunded exactly once + message dispatched; promotion order honors priority; already_booked with pending_payment → 409; waitlistCount no longer double-counts. Concurrency reasoning documented (locks serialize both confirm points).

## Non-goals
Kiosk capture-method changes; partial refunds; cross-session moves.
