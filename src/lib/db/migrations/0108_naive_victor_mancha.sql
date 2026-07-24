CREATE TYPE "public"."merch_fulfillment_type" AS ENUM('printful_pod', 'self_shipped', 'pickup', 'digital');--> statement-breakpoint
CREATE TYPE "public"."merch_order_status" AS ENUM('pending', 'paid', 'submitted', 'shipped', 'cancelled', 'failed');--> statement-breakpoint
CREATE TABLE "merch_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"merch_variant_id" uuid NOT NULL,
	"fulfillment_type" "merch_fulfillment_type" DEFAULT 'printful_pod' NOT NULL,
	"product_name" varchar(255) NOT NULL,
	"variant_name" varchar(255) NOT NULL,
	"size" varchar(40),
	"color" varchar(60),
	"printful_sync_variant_id" varchar(64) NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merch_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"status" "merch_order_status" DEFAULT 'pending' NOT NULL,
	"stripe_checkout_session_id" varchar(255),
	"stripe_payment_intent_id" varchar(255),
	"printful_order_id" varchar(64),
	"shipping_address" jsonb NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"shipping_cents" integer NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'usd' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_merch_orders_session" UNIQUE("stripe_checkout_session_id"),
	CONSTRAINT "uq_merch_orders_pi" UNIQUE("stripe_payment_intent_id")
);
--> statement-breakpoint
ALTER TABLE "merch_order_items" ADD CONSTRAINT "merch_order_items_order_id_merch_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."merch_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_order_items" ADD CONSTRAINT "merch_order_items_merch_variant_id_merch_variants_id_fk" FOREIGN KEY ("merch_variant_id") REFERENCES "public"."merch_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_orders" ADD CONSTRAINT "merch_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_orders" ADD CONSTRAINT "merch_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_merch_order_items_order" ON "merch_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_merch_orders_org_status" ON "merch_orders" USING btree ("organization_id","status");