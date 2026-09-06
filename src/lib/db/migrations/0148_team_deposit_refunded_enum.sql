-- Winter-team-fixes, task 1: deposit refund tracking on team_registrations,
-- plus the ops-ping kind Task 2 needs to alert on a deposit refund.
--
-- The enum ADD VALUE and the unrelated table's ADD COLUMNs are safe to ship
-- in one file — see the 0084 precedent (drop_in_booking_status/
-- drop_in_cancellation_reason ADD VALUE + an unrelated drop_in_bookings ADD
-- COLUMN, same file). The 55P04 "unsafe use of new value" restriction only
-- bites when a later statement in the SAME transaction USES the newly added
-- enum value (a cast, a column typed as that enum, a comparison) — none of
-- the team_registrations columns below reference ops_ping_kind at all, so
-- there is nothing here for that restriction to catch. db-migrate.ts gives
-- this whole file one transaction; a later, separate migration file (or
-- runtime app code, in its own transaction after this one commits) can use
-- 'team_deposit_refunded' safely regardless.
--
-- Written idempotently per the 0023/0024 convention (ADD VALUE IF NOT
-- EXISTS, ADD COLUMN IF NOT EXISTS) — the current live convention per
-- 0145/0146/0147.
ALTER TYPE "public"."ops_ping_kind" ADD VALUE IF NOT EXISTS 'team_deposit_refunded' BEFORE 'dropin_booked';--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN IF NOT EXISTS "deposit_refund_status" varchar(20) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN IF NOT EXISTS "deposit_refund_id" varchar(255);--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN IF NOT EXISTS "deposit_refunded_cents" integer;--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN IF NOT EXISTS "deposit_refunded_at" timestamp with time zone;