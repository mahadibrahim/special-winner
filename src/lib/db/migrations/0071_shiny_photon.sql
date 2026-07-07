-- Idempotent type/table statements (0023/0024/0063/0065/0070 convention):
-- tolerate a drifted DB that already carries the type/table/constraint.
DO $$ BEGIN CREATE TYPE "public"."labor_flag_reason" AS ENUM('missing_location', 'out_of_range'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."labor_role" AS ENUM('coach', 'venue_manager', 'referee'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_location_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notice_version" varchar(32) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"role" "labor_role" NOT NULL,
	"game_id" uuid,
	"clock_in_at" timestamp with time zone NOT NULL,
	"clock_in_lat" numeric(10, 6),
	"clock_in_lng" numeric(10, 6),
	"clock_out_at" timestamp with time zone,
	"clock_out_lat" numeric(10, 6),
	"clock_out_lng" numeric(10, 6),
	"clock_in_distance_m" integer,
	"flagged_out_of_range" boolean DEFAULT false NOT NULL,
	"flag_reason" "labor_flag_reason",
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_clock_out_after_in" CHECK ("time_entries"."clock_out_at" IS NULL OR "time_entries"."clock_out_at" > "time_entries"."clock_in_at"),
	CONSTRAINT "time_entries_referee_iff_game_id" CHECK (("time_entries"."role" = 'referee' AND "time_entries"."game_id" IS NOT NULL) OR ("time_entries"."role" <> 'referee' AND "time_entries"."game_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "latitude" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "longitude" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "radius_m" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_location_consents" ADD CONSTRAINT "staff_location_consents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_location_consents" ADD CONSTRAINT "staff_location_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_location_consents_user_org_uniq" ON "staff_location_consents" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_location_consents_org_idx" ON "staff_location_consents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_entries_org_idx" ON "time_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_entries_user_idx" ON "time_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_entries_venue_idx" ON "time_entries" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_entries_game_idx" ON "time_entries" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "time_entries_one_open_shift_per_user" ON "time_entries" USING btree ("user_id") WHERE "time_entries"."clock_out_at" IS NULL AND "time_entries"."game_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "time_entries_one_per_game_user" ON "time_entries" USING btree ("game_id","user_id") WHERE "time_entries"."game_id" IS NOT NULL;
