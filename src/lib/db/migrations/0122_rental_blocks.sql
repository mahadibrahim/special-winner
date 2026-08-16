-- Rental blocks, part 2 of 2: tables, columns, constraints, indexes.
--
-- Additive and forward-compatible; every statement is idempotent so a
-- drifted database (see the 0024 incident) re-runs cleanly.
CREATE TABLE IF NOT EXISTS "field_rental_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"brand" varchar(20) DEFAULT 'soccerone' NOT NULL,
	"label" text NOT NULL,
	"renter_user_id" uuid,
	"renter_name" text NOT NULL,
	"renter_email" text,
	"renter_phone" text,
	"party_size" integer DEFAULT 1 NOT NULL,
	"purpose" text,
	"notes" text,
	"pattern" jsonb,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"discount_kind" varchar(10),
	"discount_value" integer,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"deposit_pct_snapshot" integer,
	"deposit_due_cents" integer DEFAULT 0 NOT NULL,
	"deposit_paid_at" timestamp with time zone,
	"deposit_expires_at" timestamp with time zone,
	"stripe_deposit_pi_id" text,
	"balance_due_cents" integer DEFAULT 0 NOT NULL,
	"balance_due_at" timestamp with time zone,
	"balance_paid_at" timestamp with time zone,
	"stripe_balance_pi_id" text,
	"last_reminder_at" timestamp with time zone,
	"reminder_stage" varchar(20),
	"status" "field_rental_block_status" DEFAULT 'draft' NOT NULL,
	"offline_payment_method" "field_rental_payment_method",
	"cancelled_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "field_rental_block_quote_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"field_number" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "field_rental_blocks" ADD CONSTRAINT "field_rental_blocks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "field_rental_blocks" ADD CONSTRAINT "field_rental_blocks_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "field_rental_blocks" ADD CONSTRAINT "field_rental_blocks_renter_user_id_users_id_fk" FOREIGN KEY ("renter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "field_rental_blocks" ADD CONSTRAINT "field_rental_blocks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "field_rental_block_quote_slots" ADD CONSTRAINT "field_rental_block_quote_slots_block_id_field_rental_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."field_rental_blocks"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "field_rental_block_quote_slots" ADD CONSTRAINT "field_rental_block_quote_slots_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_rental_blocks_org_status_idx" ON "field_rental_blocks" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_rental_blocks_location_status_idx" ON "field_rental_blocks" USING btree ("location_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_rental_blocks_balance_due_idx" ON "field_rental_blocks" USING btree ("balance_due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_rental_block_quote_slots_venue_starts_idx" ON "field_rental_block_quote_slots" USING btree ("venue_id","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_rental_block_quote_slots_block_idx" ON "field_rental_block_quote_slots" USING btree ("block_id");--> statement-breakpoint
ALTER TABLE "field_rentals" ADD COLUMN IF NOT EXISTS "block_id" uuid;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "field_rentals" ADD CONSTRAINT "field_rentals_block_id_field_rental_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."field_rental_blocks"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_rentals_block_starts_at_idx" ON "field_rentals" USING btree ("block_id","starts_at");--> statement-breakpoint
ALTER TABLE "field_rental_rate_card" ADD COLUMN IF NOT EXISTS "deposit_pct" integer DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE "field_rental_rate_card" ADD COLUMN IF NOT EXISTS "balance_due_lead_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "field_rental_rate_card" ADD COLUMN IF NOT EXISTS "block_hold_hours" integer DEFAULT 72 NOT NULL;--> statement-breakpoint
ALTER TABLE "field_rental_rate_card" ADD COLUMN IF NOT EXISTS "quote_marker_ttl_days" integer DEFAULT 14 NOT NULL;
