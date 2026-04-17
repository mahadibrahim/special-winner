CREATE TYPE "public"."product_category" AS ENUM('jersey', 'shorts', 'socks', 'hoodie', 't_shirt', 'hat', 'bag', 'accessory', 'other');--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" varchar(100),
	"size" varchar(20) NOT NULL,
	"color" varchar(40),
	"price_override_cents" integer,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_product_id_size_color_unique" UNIQUE("product_id","size","color")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"category" "product_category" NOT NULL,
	"base_price_cents" integer NOT NULL,
	"images" jsonb,
	"available_post_registration" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_organization_id_slug_unique" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_product_variants_product_active" ON "product_variants" USING btree ("product_id","active");--> statement-breakpoint
CREATE INDEX "idx_products_org_active" ON "products" USING btree ("organization_id","active");--> statement-breakpoint
ALTER TABLE "sports" ADD CONSTRAINT "sports_organization_id_slug_unique" UNIQUE("organization_id","slug");