-- Camp day-sessions (Phase 4 Task 1): add the two enum values needed by the
-- camp materializer, isolated in their own migration file.
--
-- Postgres forbids using a newly-added enum value in the SAME transaction
-- (and drizzle wraps a batch migration in one transaction) that added it —
-- error 55P04 "unsafe use of new value of enum type". Splitting the enum
-- ADD VALUE statements into this standalone file (no other statement in
-- this file references 'camp' or 'registration') is the documented
-- workaround; 0149 adds the columns/index/FK that actually use these values.
--
-- Guarded with DO $$ ... EXCEPTION WHEN duplicate_object per CLAUDE.md's
-- idempotent-migration rule (the 0146 staging-journal-rebuild incident):
-- ALTER TYPE ... ADD VALUE has no IF NOT EXISTS form, so a re-run against a
-- DB that already has the value would otherwise error instead of no-op.
DO $$ BEGIN
  ALTER TYPE "public"."drop_in_session_kind" ADD VALUE 'camp';
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."drop_in_payment_method" ADD VALUE 'registration';
EXCEPTION WHEN duplicate_object THEN null;
END $$;
