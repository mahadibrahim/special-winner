CREATE TYPE "public"."host_profile_status" AS ENUM('active', 'paused', 'revoked');--> statement-breakpoint
ALTER TYPE "public"."drop_in_payment_method" ADD VALUE IF NOT EXISTS 'host_comp';--> statement-breakpoint
ALTER TYPE "public"."job_application_role" ADD VALUE IF NOT EXISTS 'host';--> statement-breakpoint
ALTER TYPE "public"."ops_ping_kind" ADD VALUE IF NOT EXISTS 'host_incident' BEFORE 'test';--> statement-breakpoint
CREATE TABLE "host_game_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"host_profile_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"incident_flagged" boolean DEFAULT false NOT NULL,
	"incident_details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" "host_profile_status" DEFAULT 'active' NOT NULL,
	"preferred_venue_id" uuid,
	"bio" text,
	"photo_key" text,
	"application_id" uuid,
	"approved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_alert_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_alert_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"venue_id" uuid,
	"sport" varchar(100),
	"active" boolean DEFAULT true NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drop_in_bookings" ADD COLUMN "referral_source" varchar(40);--> statement-breakpoint
ALTER TABLE "drop_in_rate_card" ADD COLUMN "fill_alert_window_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "drop_in_rate_card" ADD COLUMN "fill_alert_threshold_pct" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "drop_in_sessions" ADD COLUMN "host_user_id" uuid;--> statement-breakpoint
ALTER TABLE "drop_in_sessions" ADD COLUMN "fill_alert_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "date_of_birth" varchar(10);--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "games_played" varchar(10);--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "weekly_commitment" boolean;--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "photo_key" text;--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "motivation_video_key" text;--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "demo_video_key" text;--> statement-breakpoint
ALTER TABLE "host_game_reports" ADD CONSTRAINT "host_game_reports_session_id_drop_in_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."drop_in_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_game_reports" ADD CONSTRAINT "host_game_reports_host_profile_id_host_profiles_id_fk" FOREIGN KEY ("host_profile_id") REFERENCES "public"."host_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_profiles" ADD CONSTRAINT "host_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_profiles" ADD CONSTRAINT "host_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_profiles" ADD CONSTRAINT "host_profiles_preferred_venue_id_venues_id_fk" FOREIGN KEY ("preferred_venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_profiles" ADD CONSTRAINT "host_profiles_application_id_job_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."job_applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_profiles" ADD CONSTRAINT "host_profiles_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_alert_sends" ADD CONSTRAINT "pickup_alert_sends_session_id_drop_in_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."drop_in_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_alert_sends" ADD CONSTRAINT "pickup_alert_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_alert_subscriptions" ADD CONSTRAINT "pickup_alert_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_alert_subscriptions" ADD CONSTRAINT "pickup_alert_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_alert_subscriptions" ADD CONSTRAINT "pickup_alert_subscriptions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "host_game_reports_session_unique" ON "host_game_reports" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "host_profiles_user_org_unique" ON "host_profiles" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "host_profiles_org_status_idx" ON "host_profiles" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "pickup_alert_sends_user_sent_idx" ON "pickup_alert_sends" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE INDEX "pickup_alert_sends_session_idx" ON "pickup_alert_sends" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "pickup_alert_subs_user_idx" ON "pickup_alert_subscriptions" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "pickup_alert_subs_org_active_idx" ON "pickup_alert_subscriptions" USING btree ("organization_id","active");--> statement-breakpoint
ALTER TABLE "drop_in_sessions" ADD CONSTRAINT "drop_in_sessions_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;