CREATE TYPE "public"."class_credit_source" AS ENUM('pack', 'block');--> statement-breakpoint
CREATE TABLE "class_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_credit_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"family_member_id" uuid NOT NULL,
	"source" "class_credit_source" NOT NULL,
	"pack_product_id" uuid,
	"block_id" uuid,
	"slot_template_id" uuid,
	"sessions_granted" integer NOT NULL,
	"price_paid_cents" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"stripe_checkout_session_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_pack_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"session_count" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"expiry_months" integer DEFAULT 6 NOT NULL,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_enrollments" ALTER COLUMN "membership_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD COLUMN "credit_grant_id" uuid;--> statement-breakpoint
ALTER TABLE "class_slot_templates" ADD COLUMN "block_rate_cents" integer;--> statement-breakpoint
ALTER TABLE "drop_in_bookings" ADD COLUMN "credit_grant_id" uuid;--> statement-breakpoint
ALTER TABLE "class_blocks" ADD CONSTRAINT "class_blocks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_credit_grants" ADD CONSTRAINT "class_credit_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_credit_grants" ADD CONSTRAINT "class_credit_grants_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_credit_grants" ADD CONSTRAINT "class_credit_grants_pack_product_id_class_pack_products_id_fk" FOREIGN KEY ("pack_product_id") REFERENCES "public"."class_pack_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_credit_grants" ADD CONSTRAINT "class_credit_grants_block_id_class_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."class_blocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_credit_grants" ADD CONSTRAINT "class_credit_grants_slot_template_id_class_slot_templates_id_fk" FOREIGN KEY ("slot_template_id") REFERENCES "public"."class_slot_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_pack_products" ADD CONSTRAINT "class_pack_products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_blocks_org_active_idx" ON "class_blocks" USING btree ("organization_id","active","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "class_credit_grants_checkout_session_uq" ON "class_credit_grants" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX "class_credit_grants_child_idx" ON "class_credit_grants" USING btree ("family_member_id","expires_at");--> statement-breakpoint
CREATE INDEX "class_pack_products_org_active_idx" ON "class_pack_products" USING btree ("organization_id","active");--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_credit_grant_id_class_credit_grants_id_fk" FOREIGN KEY ("credit_grant_id") REFERENCES "public"."class_credit_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drop_in_bookings_credit_grant_idx" ON "drop_in_bookings" USING btree ("credit_grant_id") WHERE credit_grant_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_membership_xor_grant" CHECK ((membership_id IS NOT NULL) <> (credit_grant_id IS NOT NULL));