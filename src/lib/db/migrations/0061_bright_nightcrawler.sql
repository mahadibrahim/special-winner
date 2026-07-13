-- Hardened to IF NOT EXISTS (2026-07-12, per-file migration runner work):
-- the hash-based runner in scripts/db-migrate.ts RE-EXECUTES a migration
-- whose tracking row is missing (the old watermark-based drizzle migrate()
-- silently skipped it). Every migration must therefore be re-run-safe —
-- a bare ADD VALUE would abort a deploy with "enum value already exists"
-- if this file were ever re-run against a DB that already has the value.
-- Editing this file changes its hash; db:migrate:bootstrap self-heals the
-- tracking row (it recomputes hashes from current file contents), and a
-- re-run of this statement is now a no-op either way.
ALTER TYPE "public"."ops_ping_kind" ADD VALUE IF NOT EXISTS 'job_application' BEFORE 'test';