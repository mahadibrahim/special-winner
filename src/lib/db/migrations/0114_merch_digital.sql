-- Merch Phase 3e-i: digital goods. Idempotent (re-run-safe). The enum ADD VALUE
-- is safe in this transaction because nothing here uses 'delivered'.
ALTER TYPE "public"."merch_order_status" ADD VALUE IF NOT EXISTS 'delivered';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merch_download_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"token" varchar(64) NOT NULL,
	"asset_key" varchar(500) NOT NULL,
	"asset_name" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_merch_download_grants_token" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "merch_products" ADD COLUMN IF NOT EXISTS "digital_asset_key" varchar(500);--> statement-breakpoint
ALTER TABLE "merch_products" ADD COLUMN IF NOT EXISTS "digital_asset_name" varchar(255);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "merch_download_grants" ADD CONSTRAINT "merch_download_grants_order_item_id_merch_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."merch_order_items"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_merch_download_grants_order_item" ON "merch_download_grants" USING btree ("order_item_id");
