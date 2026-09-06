-- Winter-team-fixes: deposit-refund tracking on team_registrations + the
-- ops-ping kind that alerts on a refund. Regenerated as 0150 after the camp
-- Phase 4 PR (#644) claimed 0148/0149; net DDL is identical to the original
-- pair, recombined into one file.
--
-- Idempotent per CLAUDE.md (these were already applied to staging under the
-- old 0148/0149 numbers during development, so a re-run must no-op, not error):
-- ADD VALUE has no IF NOT EXISTS form, so it is guarded with DO $$ ... EXCEPTION
-- WHEN duplicate_object; the columns use ADD COLUMN IF NOT EXISTS. The new enum
-- value is not referenced by any column DDL in this file, so co-locating the
-- ALTER TYPE with the ADD COLUMNs is safe under the migrator's per-file
-- transaction (no 55P04 "unsafe use of new enum value" — nothing here uses it).
DO $$ BEGIN
  ALTER TYPE "public"."ops_ping_kind" ADD VALUE 'team_deposit_refunded' BEFORE 'dropin_booked';
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN IF NOT EXISTS "deposit_refund_status" varchar(20) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN IF NOT EXISTS "deposit_refund_id" varchar(255);--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN IF NOT EXISTS "deposit_refunded_cents" integer;--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN IF NOT EXISTS "deposit_refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN IF NOT EXISTS "deposit_refund_claimed_at" timestamp with time zone;
