-- Extends the partial unique index to also block a second active hold once
-- a booking is in the 'pending_payment' state (walk-in remote payment
-- hold — see src/lib/db/schema/drop-in.ts). 'pending_payment' was added to
-- the drop_in_booking_status enum by 0084, already committed by the time
-- this file's transaction opens under the per-file migration runner
-- (scripts/db-migrate.ts) — see that script's header for why this couldn't
-- ship before the runner existed. Restores DB-level duplicate-hold
-- protection; the app-level guard added alongside the payment build stays
-- as belt-and-suspenders.
--
-- Plain DROP + CREATE (no CONCURRENTLY) inside the file's own transaction —
-- consistent with how this index was originally created in 0024 and safe
-- at current table sizes.
DROP INDEX IF EXISTS "drop_in_bookings_one_active_per_user_session";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drop_in_bookings_one_active_per_user_session" ON "drop_in_bookings" USING btree ("session_id","user_id") WHERE status IN ('confirmed', 'waitlisted', 'pending_claim', 'pending_payment');