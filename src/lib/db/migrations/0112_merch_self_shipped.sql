ALTER TABLE "merch_variants" ADD COLUMN IF NOT EXISTS "weight_oz" integer;--> statement-breakpoint
ALTER TABLE "merch_variants" ADD COLUMN IF NOT EXISTS "length_in" integer;--> statement-breakpoint
ALTER TABLE "merch_variants" ADD COLUMN IF NOT EXISTS "width_in" integer;--> statement-breakpoint
ALTER TABLE "merch_variants" ADD COLUMN IF NOT EXISTS "height_in" integer;--> statement-breakpoint
ALTER TABLE "merch_orders" ADD COLUMN IF NOT EXISTS "shipping_carrier" varchar(60);--> statement-breakpoint
ALTER TABLE "merch_orders" ADD COLUMN IF NOT EXISTS "shipping_service" varchar(120);--> statement-breakpoint
ALTER TABLE "merch_orders" ADD COLUMN IF NOT EXISTS "tracking_number" varchar(120);--> statement-breakpoint
ALTER TABLE "merch_orders" ADD COLUMN IF NOT EXISTS "tracking_url" varchar(500);--> statement-breakpoint
ALTER TABLE "merch_orders" ADD COLUMN IF NOT EXISTS "shipped_at" timestamp;