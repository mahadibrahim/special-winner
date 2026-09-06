-- Period-keyed assessment snapshots (Phase 3 S1).
--
-- Written idempotent from the start (the 0146 lesson: staging's migrate
-- workflow rebuilds the journal from main's committed set, which can orphan
-- a branch-applied migration and cause it to run again against a DB that
-- already has some/all of these objects). Every statement below is guarded
-- so a re-run is a no-op instead of erroring — see CLAUDE.md's idempotent
-- migration rule and the 0023/0024 pattern.
--
-- Statement order matters here (unlike a pure additive migration): the
-- column must exist and be backfilled BEFORE it can be made NOT NULL, and
-- the new unique index must exist BEFORE the old one is dropped (there is a
-- brief window where both indexes co-exist, which is fine — CREATE UNIQUE
-- INDEX CONCURRENTLY is not required here since this is an additive column
-- + index, not a full-table rewrite under load in a size-sensitive table).
--
-- DEVIATION FROM BRIEF: the brief specifies varchar(16), sized for future
-- monthly/quarterly tokens (e.g. "2026-09", 7 chars). But the brief's own
-- backfill formula is 'legacy:' || season_id, and season_id is a uuid —
-- 'legacy:' (7 chars) + a 36-char UUID = 43 chars, which does not fit in
-- varchar(16) (confirmed empirically: first migrate attempt failed with
-- Postgres 22001 "value too long for type character varying(16)").
-- Truncating the UUID to fit 16 chars would break the brief's explicit
-- "collision-proof" requirement for the backfill, so the column is widened
-- to varchar(64) instead — comfortably fits the full legacy token AND every
-- short future period token, so no downstream behavior is constrained.
ALTER TABLE "assessment_snapshots" ADD COLUMN IF NOT EXISTS "period_key" varchar(64);--> statement-breakpoint
-- Backfill: every pre-existing row gets a legacy period key derived from
-- its season_id. Collision-proof — the OLD unique index was
-- (family_member_id, season_id, domain_id), so 'legacy:' || season_id is
-- unique per (family_member_id, domain_id) exactly where the old triple
-- was, and the NEW unique index below is (family_member_id, period_key,
-- domain_id). WHERE period_key IS NULL makes this re-run safe: already
-- backfilled rows (or rows written post-migration with a real period_key)
-- are left untouched.
UPDATE "assessment_snapshots" SET "period_key" = 'legacy:' || "season_id" WHERE "period_key" IS NULL;--> statement-breakpoint
-- Guarded SET NOT NULL: re-running ALTER COLUMN ... SET NOT NULL when the
-- column is already NOT NULL is a Postgres no-op (no error), so this needs
-- no DO $$ wrapper — it only errors if a NULL value exists, which the
-- backfill above already prevents.
ALTER TABLE "assessment_snapshots" ALTER COLUMN "period_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_snapshots_member_period_domain_uniq" ON "assessment_snapshots" USING btree ("family_member_id","period_key","domain_id");--> statement-breakpoint
DROP INDEX IF EXISTS "assessment_snapshots_member_season_domain_uniq";--> statement-breakpoint
-- Guarded DROP NOT NULL: like SET NOT NULL above, re-running this when the
-- column is already nullable is a no-op, not an error.
ALTER TABLE "assessment_snapshots" ALTER COLUMN "season_id" DROP NOT NULL;
