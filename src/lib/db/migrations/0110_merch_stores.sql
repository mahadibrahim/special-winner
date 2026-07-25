-- Phase 3b: multi-store foundation. Idempotent (the runner is re-run-safe;
-- see scripts/db-migrate.ts). Enum ADD VALUEs are safe here because nothing in
-- this migration USES the new values in the same transaction.

-- enums --------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE "public"."merch_store_scope" AS ENUM('general', 'league', 'team'); EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."merch_store_visibility" AS ENUM('public', 'unlisted'); EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
ALTER TYPE "public"."merch_order_status" ADD VALUE IF NOT EXISTS 'awaiting_pickup';--> statement-breakpoint
ALTER TYPE "public"."merch_order_status" ADD VALUE IF NOT EXISTS 'collected';--> statement-breakpoint

-- merch_stores -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "merch_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"scope" "merch_store_scope" NOT NULL,
	"team_id" uuid,
	"name" varchar(255) NOT NULL,
	"slug" varchar(140) NOT NULL,
	"description" text,
	"visibility" "merch_store_visibility" DEFAULT 'public' NOT NULL,
	"share_token" varchar(40),
	"order_opens_at" timestamp,
	"order_closes_at" timestamp,
	"pickup_location" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_merch_stores_org_slug" UNIQUE("organization_id","slug"),
	CONSTRAINT "uq_merch_stores_token" UNIQUE("share_token")
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "merch_stores" ADD CONSTRAINT "merch_stores_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "merch_stores" ADD CONSTRAINT "merch_stores_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_merch_stores_org_scope" ON "merch_stores" USING btree ("organization_id","scope");--> statement-breakpoint
-- DB backstop for the "one general store per org" invariant (raw SQL; a partial
-- index isn't expressed in the Drizzle schema, so it's invisible to db:generate).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_merch_stores_one_general" ON "merch_stores" ("organization_id") WHERE "scope" = 'general';--> statement-breakpoint

-- new columns (store_id added NULLABLE; backfilled below; then SET NOT NULL) -
ALTER TABLE "merch_order_items" ALTER COLUMN "printful_sync_variant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "merch_order_items" ADD COLUMN IF NOT EXISTS "personalization" jsonb;--> statement-breakpoint
ALTER TABLE "merch_products" ADD COLUMN IF NOT EXISTS "store_id" uuid;--> statement-breakpoint
ALTER TABLE "merch_orders" ADD COLUMN IF NOT EXISTS "store_id" uuid;--> statement-breakpoint

-- backfill: one general store per org that has non-kit products -------------
INSERT INTO "merch_stores" ("organization_id","scope","name","slug","visibility")
SELECT o."id", 'general', COALESCE(o."name",'Aspire Sports') || ' Shop', 'general', 'public'
FROM "organizations" o
WHERE EXISTS (SELECT 1 FROM "merch_products" p WHERE p."organization_id" = o."id" AND p."kit_id" IS NULL)
  AND NOT EXISTS (SELECT 1 FROM "merch_stores" s WHERE s."organization_id" = o."id" AND s."scope" = 'general');--> statement-breakpoint
UPDATE "merch_products" p SET "store_id" = s."id"
FROM "merch_stores" s
WHERE p."kit_id" IS NULL AND p."store_id" IS NULL
  AND s."organization_id" = p."organization_id" AND s."scope" = 'general';--> statement-breakpoint

-- backfill: each existing kit becomes an unlisted team store ----------------
INSERT INTO "merch_stores" ("organization_id","scope","team_id","name","slug","visibility","share_token","order_opens_at","order_closes_at","pickup_location","active","created_at","updated_at")
SELECT k."organization_id", 'team', k."team_id", k."name", 'team-' || left(k."id"::text, 8), 'unlisted',
       k."share_token", k."order_opens_at", k."order_closes_at", k."pickup_location", k."active", k."created_at", k."updated_at"
FROM "merch_team_kits" k
WHERE NOT EXISTS (SELECT 1 FROM "merch_stores" s WHERE s."share_token" = k."share_token");--> statement-breakpoint
UPDATE "merch_products" p SET "store_id" = s."id"
FROM "merch_team_kits" k
JOIN "merch_stores" s ON s."share_token" = k."share_token" AND s."scope" = 'team'
WHERE p."kit_id" = k."id" AND p."store_id" IS NULL;--> statement-breakpoint

-- backfill order provenance: derive each order's store from its own items ----
-- (an order's items are single-store, so any item's product store is correct).
UPDATE "merch_orders" ord SET "store_id" = mp."store_id"
FROM "merch_order_items" oi
JOIN "merch_variants" mv ON mv."id" = oi."merch_variant_id"
JOIN "merch_products" mp ON mp."id" = mv."product_id"
WHERE oi."order_id" = ord."id" AND ord."store_id" IS NULL;--> statement-breakpoint
-- fallback: any remaining order (e.g. no items) -> its org's general store ---
UPDATE "merch_orders" ord SET "store_id" = s."id"
FROM "merch_stores" s
WHERE ord."store_id" IS NULL AND s."organization_id" = ord."organization_id" AND s."scope" = 'general';--> statement-breakpoint

-- constrain ----------------------------------------------------------------
ALTER TABLE "merch_products" ALTER COLUMN "store_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "merch_orders" ALTER COLUMN "store_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "merch_products" ADD CONSTRAINT "merch_products_store_id_merch_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."merch_stores"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "merch_orders" ADD CONSTRAINT "merch_orders_store_id_merch_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."merch_stores"("id") ON DELETE restrict ON UPDATE no action; EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint

-- swap product slug uniqueness org -> store --------------------------------
CREATE INDEX IF NOT EXISTS "idx_merch_products_store_active" ON "merch_products" USING btree ("store_id","active");--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "merch_products" ADD CONSTRAINT "uq_merch_products_store_slug" UNIQUE("store_id","slug"); EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
ALTER TABLE "merch_products" DROP CONSTRAINT IF EXISTS "uq_merch_products_org_slug";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_merch_products_org_active";
