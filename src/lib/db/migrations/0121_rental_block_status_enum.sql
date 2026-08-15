-- Rental blocks, part 1 of 2: enum types only.
--
-- The enum ships in its own migration file (the 55P04 lesson from 0097/0098):
-- a new enum value cannot be used in the same transaction that added it, so
-- the tables that reference these types land in 0122.
--
-- Written idempotently per the 0023/0024 convention, so a drifted database
-- that already carries the type does not abort the deploy. `ALTER TYPE ...
-- ADD VALUE` is deliberately NOT wrapped in a DO block: Postgres refuses to
-- run it from inside a function, so `IF NOT EXISTS` is the idempotency
-- mechanism there (same as 0094/0100).
DO $$ BEGIN CREATE TYPE "public"."field_rental_block_status" AS ENUM('draft', 'awaiting_deposit', 'active', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TYPE "public"."self_service_token_kind" ADD VALUE IF NOT EXISTS 'rental_block' BEFORE 'roster_entry';
