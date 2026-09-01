-- Enum-add ONLY (repo rule): an ALTER TYPE ... ADD VALUE must be alone in its
-- file so a strictly-later migration can USE the value — Postgres refuses
-- "unsafe use of new value" within the same transaction, and db-migrate.ts
-- gives each FILE its own transaction. Hand-adjusted to IF NOT EXISTS for
-- re-run safety: a bare ADD VALUE has no schema evidence for
-- db-migrate-bootstrap.ts to verify, so it can be re-executed (see the
-- INVARIANT comment in scripts/db-migrate.ts).
ALTER TYPE "public"."class_credit_source" ADD VALUE IF NOT EXISTS 'comp';
