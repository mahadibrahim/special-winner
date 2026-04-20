CREATE TYPE "public"."media_asset_status" AS ENUM('uploading', 'uploaded', 'culled', 'edited', 'tagged', 'published', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."media_asset_type" AS ENUM('photo', 'video', 'video_clip');--> statement-breakpoint
CREATE TYPE "public"."media_audit_action" AS ENUM('create', 'update', 'delete', 'approve', 'publish', 'revoke');--> statement-breakpoint
CREATE TYPE "public"."media_audit_entity" AS ENUM('asset', 'tag', 'session', 'agreement');--> statement-breakpoint
CREATE TYPE "public"."media_edit_pass" AS ENUM('none', 'ai_only', 'human_reviewed');--> statement-breakpoint
CREATE TYPE "public"."media_payout_status" AS ENUM('unearned', 'pending_approval', 'approved', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."media_rate_type" AS ENUM('per_game', 'per_day', 'flat');--> statement-breakpoint
CREATE TYPE "public"."media_session_type" AS ENUM('game', 'team_posed', 'practice', 'event');--> statement-breakpoint
CREATE TYPE "public"."media_shoot_status" AS ENUM('assigned', 'confirmed', 'checked_in', 'uploading', 'uploaded', 'tagging', 'ready', 'published', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE 'media_staff';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE 'media_editor';--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shoot_session_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"asset_type" "media_asset_type" NOT NULL,
	"storage_key" text NOT NULL,
	"thumbnail_key" text,
	"original_filename" varchar(500) NOT NULL,
	"file_size_bytes" bigint,
	"mime_type" varchar(100),
	"width" integer,
	"height" integer,
	"duration_seconds" integer,
	"captured_at" timestamp,
	"uploaded_at" timestamp,
	"multipart_upload_id" varchar(255),
	"burst_group_id" uuid,
	"status" "media_asset_status" DEFAULT 'uploading' NOT NULL,
	"edit_pass" "media_edit_pass" DEFAULT 'none' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"entity_type" "media_audit_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "media_audit_action" NOT NULL,
	"diff" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_staff_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"stripe_connect_account_id" varchar(255),
	"preferred_rate_type" "media_rate_type",
	"preferred_rate_cents" integer,
	"service_location_ids" uuid[],
	"active" boolean DEFAULT true NOT NULL,
	"onboarded_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shoot_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid,
	"game_id" uuid,
	"venue_id" uuid,
	"assigned_user_id" uuid,
	"assigned_by_user_id" uuid,
	"session_type" "media_session_type" NOT NULL,
	"status" "media_shoot_status" DEFAULT 'assigned' NOT NULL,
	"scheduled_start" timestamp NOT NULL,
	"scheduled_end" timestamp NOT NULL,
	"confirmed_at" timestamp,
	"checked_in_at" timestamp,
	"checked_in_lat" numeric(10, 6),
	"checked_in_lng" numeric(10, 6),
	"checked_out_at" timestamp,
	"rate_type" "media_rate_type",
	"rate_cents" integer,
	"payout_status" "media_payout_status" DEFAULT 'unearned' NOT NULL,
	"stripe_transfer_id" varchar(255),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_shoot_session_id_shoot_sessions_id_fk" FOREIGN KEY ("shoot_session_id") REFERENCES "public"."shoot_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_audit_log" ADD CONSTRAINT "media_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_staff_profiles" ADD CONSTRAINT "media_staff_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_staff_profiles" ADD CONSTRAINT "media_staff_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoot_sessions" ADD CONSTRAINT "shoot_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoot_sessions" ADD CONSTRAINT "shoot_sessions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoot_sessions" ADD CONSTRAINT "shoot_sessions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoot_sessions" ADD CONSTRAINT "shoot_sessions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoot_sessions" ADD CONSTRAINT "shoot_sessions_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoot_sessions" ADD CONSTRAINT "shoot_sessions_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_session_idx" ON "media_assets" USING btree ("shoot_session_id");--> statement-breakpoint
CREATE INDEX "media_assets_org_idx" ON "media_assets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "media_assets_status_idx" ON "media_assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "media_assets_captured_at_idx" ON "media_assets" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "media_audit_log_entity_idx" ON "media_audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "media_audit_log_actor_idx" ON "media_audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "media_staff_profiles_org_idx" ON "media_staff_profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "shoot_sessions_org_idx" ON "shoot_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "shoot_sessions_assigned_idx" ON "shoot_sessions" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "shoot_sessions_scheduled_idx" ON "shoot_sessions" USING btree ("scheduled_start");--> statement-breakpoint
CREATE INDEX "shoot_sessions_status_idx" ON "shoot_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shoot_sessions_game_idx" ON "shoot_sessions" USING btree ("game_id");