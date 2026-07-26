-- Merch Phase 3d: bundles. Columns/tables only, idempotent (re-run-safe).
DO $$ BEGIN CREATE TYPE "public"."merch_bundle_discount_type" AS ENUM('percent', 'fixed'); EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merch_bundle_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bundle_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"label" varchar(255),
	"quantity" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merch_bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(140) NOT NULL,
	"description" text,
	"images" jsonb,
	"discount_type" "merch_bundle_discount_type" NOT NULL,
	"discount_value" integer NOT NULL,
	"fulfillment_type" "merch_fulfillment_type" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_merch_bundles_store_slug" UNIQUE("store_id","slug")
);
--> statement-breakpoint
ALTER TABLE "merch_order_items" ADD COLUMN IF NOT EXISTS "bundle_id" uuid;--> statement-breakpoint
ALTER TABLE "merch_order_items" ADD COLUMN IF NOT EXISTS "bundle_name" varchar(255);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "merch_bundle_items" ADD CONSTRAINT "merch_bundle_items_bundle_id_merch_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."merch_bundles"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "merch_bundle_items" ADD CONSTRAINT "merch_bundle_items_product_id_merch_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."merch_products"("id") ON DELETE restrict ON UPDATE no action; EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "merch_bundles" ADD CONSTRAINT "merch_bundles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "merch_bundles" ADD CONSTRAINT "merch_bundles_store_id_merch_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."merch_stores"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_merch_bundle_items_bundle" ON "merch_bundle_items" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_merch_bundles_store_active" ON "merch_bundles" USING btree ("store_id","active");
