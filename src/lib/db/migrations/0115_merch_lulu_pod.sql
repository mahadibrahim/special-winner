-- Merch Lulu POD: print books fulfilled by Lulu. Idempotent (re-run-safe).
-- The enum ADD VALUE is safe in this file because nothing here uses 'lulu_pod'
-- (columns are plain varchar/integer) — same precedent as 0114.
ALTER TYPE "public"."merch_fulfillment_type" ADD VALUE IF NOT EXISTS 'lulu_pod';--> statement-breakpoint
ALTER TABLE "merch_products" ADD COLUMN IF NOT EXISTS "lulu_pod_package_id" varchar(32);--> statement-breakpoint
ALTER TABLE "merch_products" ADD COLUMN IF NOT EXISTS "lulu_page_count" integer;--> statement-breakpoint
ALTER TABLE "merch_products" ADD COLUMN IF NOT EXISTS "lulu_interior_asset_key" varchar(500);--> statement-breakpoint
ALTER TABLE "merch_products" ADD COLUMN IF NOT EXISTS "lulu_cover_asset_key" varchar(500);--> statement-breakpoint
ALTER TABLE "merch_orders" ADD COLUMN IF NOT EXISTS "lulu_print_job_id" varchar(64);--> statement-breakpoint
ALTER TABLE "merch_orders" ADD COLUMN IF NOT EXISTS "lulu_shipping_level" varchar(20);
