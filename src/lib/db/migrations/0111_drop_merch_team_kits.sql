-- Phase 3b: retire merch_team_kits (absorbed into merch_stores). Idempotent /
-- re-run-safe (see scripts/db-migrate.ts). By migration 0110 every kit-linked
-- product was repointed to a team store and kit_id is vestigial, so dropping
-- the column + table loses no data.
ALTER TABLE "merch_products" DROP CONSTRAINT IF EXISTS "merch_products_kit_id_merch_team_kits_id_fk";--> statement-breakpoint
ALTER TABLE "merch_products" DROP COLUMN IF EXISTS "kit_id";--> statement-breakpoint
DROP TABLE IF EXISTS "merch_team_kits" CASCADE;
