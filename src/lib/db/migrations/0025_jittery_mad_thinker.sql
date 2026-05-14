DO $$ BEGIN CREATE TYPE "public"."field_rental_cancellation_reason" AS ENUM('user_request', 'admin_override', 'venue_unavailable'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."field_rental_payment_method" AS ENUM('card_online', 'card_present', 'cash', 'comp'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."field_rental_payment_status" AS ENUM('unpaid', 'paid', 'refunded'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."field_rental_source" AS ENUM('online_booking', 'admin_created'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."field_rental_status" AS ENUM('pending_payment', 'confirmed', 'cancelled', 'completed', 'no_show'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE "field_rental_rate_card" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"default_hourly_rate_cents" integer DEFAULT 8000 NOT NULL,
	"cancel_window_hours" integer DEFAULT 24 NOT NULL,
	"booking_increment_minutes" integer DEFAULT 60 NOT NULL,
	"min_duration_minutes" integer DEFAULT 60 NOT NULL,
	"max_duration_minutes" integer DEFAULT 240 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid,
	CONSTRAINT "field_rental_rate_card_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "field_rentals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"field_number" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "field_rental_status" NOT NULL,
	"source" "field_rental_source" NOT NULL,
	"renter_user_id" uuid,
	"renter_name" text NOT NULL,
	"renter_email" text,
	"renter_phone" text,
	"party_size" integer DEFAULT 1 NOT NULL,
	"purpose" text,
	"notes" text,
	"payment_method" "field_rental_payment_method" NOT NULL,
	"amount_due_cents" integer NOT NULL,
	"amount_paid_cents" integer DEFAULT 0 NOT NULL,
	"payment_status" "field_rental_payment_status" DEFAULT 'unpaid' NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_refund_id" text,
	"payment_expires_at" timestamp with time zone,
	"waiver_signed" boolean DEFAULT false NOT NULL,
	"waiver_signed_at" timestamp with time zone,
	"waiver_signed_by" text,
	"checked_in_at" timestamp with time zone,
	"checked_in_by_user_id" uuid,
	"created_by_user_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" "field_rental_cancellation_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "rental_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "rental_hourly_rate_cents" integer;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "rental_open_minute" integer;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "rental_close_minute" integer;--> statement-breakpoint
ALTER TABLE "field_rental_rate_card" ADD CONSTRAINT "field_rental_rate_card_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_rental_rate_card" ADD CONSTRAINT "field_rental_rate_card_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_rentals" ADD CONSTRAINT "field_rentals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_rentals" ADD CONSTRAINT "field_rentals_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_rentals" ADD CONSTRAINT "field_rentals_renter_user_id_users_id_fk" FOREIGN KEY ("renter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_rentals" ADD CONSTRAINT "field_rentals_checked_in_by_user_id_users_id_fk" FOREIGN KEY ("checked_in_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_rentals" ADD CONSTRAINT "field_rentals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "field_rentals_venue_starts_at_idx" ON "field_rentals" USING btree ("venue_id","starts_at");--> statement-breakpoint
CREATE INDEX "field_rentals_org_starts_at_idx" ON "field_rentals" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "field_rentals_renter_starts_at_idx" ON "field_rentals" USING btree ("renter_user_id","starts_at");--> statement-breakpoint
CREATE INDEX "field_rentals_active_field_idx" ON "field_rentals" USING btree ("venue_id","field_number","starts_at") WHERE status IN ('pending_payment', 'confirmed');