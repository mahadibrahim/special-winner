DO $$ BEGIN CREATE TYPE "public"."self_service_send_channel" AS ENUM('email', 'sms', 'qr', 'kiosk_search', 'customer_dashboard'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."self_service_token_kind" AS ENUM('drop_in_booking', 'field_rental', 'roster_entry', 'walkin_session'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE "self_service_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"kind" "self_service_token_kind" NOT NULL,
	"target_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"venue_id" uuid,
	"sent_via" "self_service_send_channel" NOT NULL,
	"recipient_user_id" uuid,
	"recipient_email" text,
	"recipient_phone" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_by_ip" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drop_in_bookings" ADD COLUMN IF NOT EXISTS "waiver_signed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drop_in_bookings" ADD COLUMN IF NOT EXISTS "waiver_signed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drop_in_bookings" ADD COLUMN IF NOT EXISTS "waiver_signed_by" text;--> statement-breakpoint
ALTER TABLE "drop_in_rate_card" ADD COLUMN IF NOT EXISTS "check_in_window_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "field_rental_rate_card" ADD COLUMN IF NOT EXISTS "check_in_window_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "self_service_tokens" ADD CONSTRAINT "self_service_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_service_tokens" ADD CONSTRAINT "self_service_tokens_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_service_tokens" ADD CONSTRAINT "self_service_tokens_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_service_tokens" ADD CONSTRAINT "self_service_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "self_service_tokens_token_idx" ON "self_service_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "self_service_tokens_target_idx" ON "self_service_tokens" USING btree ("target_id","kind");--> statement-breakpoint
CREATE INDEX "self_service_tokens_expires_unclaimed_idx" ON "self_service_tokens" USING btree ("expires_at") WHERE consumed_at IS NULL;