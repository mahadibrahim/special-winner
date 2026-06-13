-- Index-only migration: written idempotently (IF NOT EXISTS) because the
-- bootstrap reconciler (scripts/db-migrate-bootstrap.ts) only recognises
-- CREATE TABLE / ADD COLUMN effects — it can't verify indexes, so it leaves
-- this migration untracked and the migrator re-runs it on every deploy.
-- Plain CREATE INDEX therefore breaks the SECOND deploy after merge with
-- "relation already exists" (this happened on the merge after PR #185).
-- Same pattern as 0031.
CREATE INDEX IF NOT EXISTS "age_groups_org_idx" ON "age_groups" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_magic_links_expires_at" ON "magic_links" USING btree ("expires_at");
