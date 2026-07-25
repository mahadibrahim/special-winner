CREATE TYPE "public"."merch_product_source" AS ENUM('printful', 'manual');--> statement-breakpoint
CREATE TABLE "merch_team_kits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"share_token" varchar(40) NOT NULL,
	"order_opens_at" timestamp,
	"order_closes_at" timestamp,
	"pickup_location" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_merch_team_kits_token" UNIQUE("share_token")
);
--> statement-breakpoint
ALTER TABLE "merch_products" ALTER COLUMN "printful_sync_product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "merch_variants" ALTER COLUMN "printful_sync_variant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "merch_variants" ALTER COLUMN "printful_variant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "merch_products" ADD COLUMN "source" "merch_product_source" DEFAULT 'printful' NOT NULL;--> statement-breakpoint
ALTER TABLE "merch_products" ADD COLUMN "fulfillment_type" "merch_fulfillment_type" DEFAULT 'printful_pod' NOT NULL;--> statement-breakpoint
ALTER TABLE "merch_products" ADD COLUMN "kit_id" uuid;--> statement-breakpoint
ALTER TABLE "merch_products" ADD COLUMN "personalization" jsonb;--> statement-breakpoint
ALTER TABLE "merch_team_kits" ADD CONSTRAINT "merch_team_kits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_team_kits" ADD CONSTRAINT "merch_team_kits_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_merch_team_kits_org" ON "merch_team_kits" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "merch_products" ADD CONSTRAINT "merch_products_kit_id_merch_team_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."merch_team_kits"("id") ON DELETE cascade ON UPDATE no action;