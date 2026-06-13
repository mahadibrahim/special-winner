DO $$ BEGIN CREATE TYPE "public"."drop_division" AS ENUM('mens', 'womens'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."drop_player_status" AS ENUM('registered', 'active', 'graduated', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."drop_season_status" AS ENUM('draft', 'open', 'active', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drop_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_season_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"division" "drop_division" NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(32),
	"dob" date,
	"height_cm" integer NOT NULL,
	"season_start_weight_g" integer NOT NULL,
	"current_weight_g" integer NOT NULL,
	"bmi" numeric(4, 1) NOT NULL,
	"maintenance_status" boolean DEFAULT false NOT NULL,
	"consent_at" timestamp NOT NULL,
	"status" "drop_player_status" DEFAULT 'registered' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drop_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid,
	"division" "drop_division" NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"session_day" integer,
	"max_players" integer,
	"status" "drop_season_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drop_players" ADD CONSTRAINT "drop_players_drop_season_id_drop_seasons_id_fk" FOREIGN KEY ("drop_season_id") REFERENCES "public"."drop_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_players" ADD CONSTRAINT "drop_players_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_players" ADD CONSTRAINT "drop_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_seasons" ADD CONSTRAINT "drop_seasons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_seasons" ADD CONSTRAINT "drop_seasons_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drop_players_season_idx" ON "drop_players" USING btree ("drop_season_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drop_players_season_email_uniq" ON "drop_players" USING btree ("drop_season_id",lower("email"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drop_seasons_org_idx" ON "drop_seasons" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drop_seasons_org_slug_uniq" ON "drop_seasons" USING btree ("organization_id","slug");
