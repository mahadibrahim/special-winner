CREATE TYPE "public"."drop_in_audience" AS ENUM('adults', 'youth', 'all_ages');--> statement-breakpoint
CREATE TYPE "public"."drop_in_booking_source" AS ENUM('online_booking', 'walk_up');--> statement-breakpoint
CREATE TYPE "public"."drop_in_booking_status" AS ENUM('confirmed', 'waitlisted', 'pending_claim', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."drop_in_cancellation_reason" AS ENUM('user_request', 'no_show', 'admin_override', 'session_cancelled', 'expired_promotion');--> statement-breakpoint
CREATE TYPE "public"."drop_in_payment_method" AS ENUM('card_online', 'card_present', 'member_unlimited', 'member_allotment');--> statement-breakpoint
CREATE TYPE "public"."drop_in_session_kind" AS ENUM('pickup', 'class');--> statement-breakpoint
CREATE TYPE "public"."drop_in_session_status" AS ENUM('scheduled', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."drop_in_skill_level" AS ENUM('recreational', 'intermediate', 'advanced', 'all_levels');--> statement-breakpoint
CREATE TYPE "public"."skill_level" AS ENUM('recreational', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."skill_level_source" AS ENUM('self_reported', 'admin_assigned');--> statement-breakpoint
CREATE TYPE "public"."user_gender" AS ENUM('male', 'female', 'non_binary', 'prefer_not_to_say');--> statement-breakpoint
CREATE TABLE "brand_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"display_name" text NOT NULL,
	"logo_media_id" uuid,
	"hero_copy" jsonb,
	"color_tokens" jsonb,
	"footer_copy" text,
	"featured_venue_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_profiles_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "drop_in_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "drop_in_booking_status" NOT NULL,
	"source" "drop_in_booking_source" NOT NULL,
	"payment_method" "drop_in_payment_method" NOT NULL,
	"amount_paid_cents" integer DEFAULT 0 NOT NULL,
	"membership_id" uuid,
	"stripe_payment_intent_id" text,
	"stripe_refund_id" text,
	"promoted_at" timestamp with time zone,
	"promotion_expires_at" timestamp with time zone,
	"promotion_token" text,
	"team_assignment" text,
	"checked_in_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" "drop_in_cancellation_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drop_in_rate_card" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"default_session_rate_cents" integer DEFAULT 1500 NOT NULL,
	"default_member_rate_cents" integer DEFAULT 1200 NOT NULL,
	"cancel_window_hours" integer DEFAULT 24 NOT NULL,
	"promotion_window_minutes" integer DEFAULT 30 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid,
	CONSTRAINT "drop_in_rate_card_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "drop_in_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"bookable_resource_id" uuid,
	"kind" "drop_in_session_kind" NOT NULL,
	"sport_or_class_label" text NOT NULL,
	"format_label" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"capacity_male" integer,
	"capacity_female" integer,
	"skill_level" "drop_in_skill_level" DEFAULT 'all_levels' NOT NULL,
	"audience" "drop_in_audience" DEFAULT 'adults' NOT NULL,
	"members_only" boolean DEFAULT false NOT NULL,
	"session_rate_cents" integer,
	"member_rate_cents" integer,
	"team_count" integer DEFAULT 0 NOT NULL,
	"team_colors" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" "drop_in_session_status" DEFAULT 'scheduled' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_skill_levels" (
	"user_id" uuid NOT NULL,
	"sport" text NOT NULL,
	"level" "skill_level" NOT NULL,
	"source" "skill_level_source" NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"set_by_user_id" uuid,
	CONSTRAINT "user_skill_levels_user_id_sport_pk" PRIMARY KEY("user_id","sport")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gender" "user_gender";--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "partner_stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "partner_application_fee_pct" integer;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_logo_media_id_media_assets_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_in_bookings" ADD CONSTRAINT "drop_in_bookings_session_id_drop_in_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."drop_in_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_in_bookings" ADD CONSTRAINT "drop_in_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_in_rate_card" ADD CONSTRAINT "drop_in_rate_card_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_in_rate_card" ADD CONSTRAINT "drop_in_rate_card_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_in_sessions" ADD CONSTRAINT "drop_in_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_in_sessions" ADD CONSTRAINT "drop_in_sessions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_in_sessions" ADD CONSTRAINT "drop_in_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skill_levels" ADD CONSTRAINT "user_skill_levels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skill_levels" ADD CONSTRAINT "user_skill_levels_set_by_user_id_users_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_profiles_org_active_idx" ON "brand_profiles" USING btree ("organization_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "drop_in_bookings_one_active_per_user_session" ON "drop_in_bookings" USING btree ("session_id","user_id") WHERE status IN ('confirmed', 'waitlisted', 'pending_claim');--> statement-breakpoint
CREATE INDEX "drop_in_bookings_session_status_idx" ON "drop_in_bookings" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "drop_in_bookings_user_status_idx" ON "drop_in_bookings" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "drop_in_bookings_promotion_expiry_idx" ON "drop_in_bookings" USING btree ("promotion_expires_at") WHERE status = 'pending_claim';--> statement-breakpoint
CREATE INDEX "drop_in_sessions_org_starts_at_idx" ON "drop_in_sessions" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "drop_in_sessions_venue_starts_at_idx" ON "drop_in_sessions" USING btree ("venue_id","starts_at");--> statement-breakpoint
CREATE INDEX "drop_in_sessions_status_idx" ON "drop_in_sessions" USING btree ("status");--> statement-breakpoint
-- CHECK constraints (Drizzle doesn't emit these declaratively yet — added manually).
ALTER TABLE "drop_in_sessions" ADD CONSTRAINT "drop_in_sessions_gender_caps_paired" CHECK ((capacity_male IS NULL) = (capacity_female IS NULL));--> statement-breakpoint
ALTER TABLE "drop_in_sessions" ADD CONSTRAINT "drop_in_sessions_team_colors_match_count" CHECK (array_length(team_colors, 1) IS NOT DISTINCT FROM NULLIF(team_count, 0));--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_partner_application_fee_pct_range" CHECK (partner_application_fee_pct IS NULL OR partner_application_fee_pct BETWEEN 0 AND 100);