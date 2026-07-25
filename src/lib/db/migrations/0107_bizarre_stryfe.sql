CREATE TABLE "merch_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"printful_sync_product_id" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(140) NOT NULL,
	"description" text,
	"category" "product_category" DEFAULT 'other' NOT NULL,
	"images" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_merch_products_org_sync" UNIQUE("organization_id","printful_sync_product_id"),
	CONSTRAINT "uq_merch_products_org_slug" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
CREATE TABLE "merch_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"printful_sync_variant_id" varchar(64) NOT NULL,
	"printful_variant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"size" varchar(40),
	"color" varchar(60),
	"sku" varchar(100),
	"retail_price_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_merch_variants_sync" UNIQUE("printful_sync_variant_id")
);
--> statement-breakpoint
ALTER TABLE "merch_products" ADD CONSTRAINT "merch_products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_variants" ADD CONSTRAINT "merch_variants_product_id_merch_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."merch_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_merch_products_org_active" ON "merch_products" USING btree ("organization_id","active");--> statement-breakpoint
CREATE INDEX "idx_merch_variants_product_active" ON "merch_variants" USING btree ("product_id","active");