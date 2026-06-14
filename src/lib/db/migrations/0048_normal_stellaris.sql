DO $$ BEGIN CREATE TYPE "public"."drop_match_status" AS ENUM('scheduled', 'final'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drop_food_diary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_player_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"submitted" boolean DEFAULT false NOT NULL,
	"coach_confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drop_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_season_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"home_team_id" uuid NOT NULL,
	"away_team_id" uuid NOT NULL,
	"home_pitch_score" integer DEFAULT 0 NOT NULL,
	"away_pitch_score" integer DEFAULT 0 NOT NULL,
	"home_bonus_goals" numeric(4, 1) DEFAULT '0' NOT NULL,
	"away_bonus_goals" numeric(4, 1) DEFAULT '0' NOT NULL,
	"home_final_score" numeric(4, 1) DEFAULT '0' NOT NULL,
	"away_final_score" numeric(4, 1) DEFAULT '0' NOT NULL,
	"status" "drop_match_status" DEFAULT 'scheduled' NOT NULL,
	"played_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drop_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_season_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"color" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drop_weigh_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_player_id" uuid NOT NULL,
	"drop_season_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"weigh_in_date" date,
	"weight_g" integer NOT NULL,
	"delta_vs_prior_week_g" integer,
	"delta_vs_season_start_g" integer,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drop_players" ADD COLUMN IF NOT EXISTS "drop_team_id" uuid;--> statement-breakpoint
ALTER TABLE "drop_players" ADD COLUMN IF NOT EXISTS "weeks_lost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "drop_players" ADD COLUMN IF NOT EXISTS "hat_tricks_awarded" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "drop_players" ADD COLUMN IF NOT EXISTS "five_pct_awarded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drop_players" ADD COLUMN IF NOT EXISTS "ten_pct_awarded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drop_food_diary" ADD CONSTRAINT "drop_food_diary_drop_player_id_drop_players_id_fk" FOREIGN KEY ("drop_player_id") REFERENCES "public"."drop_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_matches" ADD CONSTRAINT "drop_matches_drop_season_id_drop_seasons_id_fk" FOREIGN KEY ("drop_season_id") REFERENCES "public"."drop_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_matches" ADD CONSTRAINT "drop_matches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_matches" ADD CONSTRAINT "drop_matches_home_team_id_drop_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."drop_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_matches" ADD CONSTRAINT "drop_matches_away_team_id_drop_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."drop_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_teams" ADD CONSTRAINT "drop_teams_drop_season_id_drop_seasons_id_fk" FOREIGN KEY ("drop_season_id") REFERENCES "public"."drop_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_teams" ADD CONSTRAINT "drop_teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_weigh_ins" ADD CONSTRAINT "drop_weigh_ins_drop_player_id_drop_players_id_fk" FOREIGN KEY ("drop_player_id") REFERENCES "public"."drop_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_weigh_ins" ADD CONSTRAINT "drop_weigh_ins_drop_season_id_drop_seasons_id_fk" FOREIGN KEY ("drop_season_id") REFERENCES "public"."drop_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_weigh_ins" ADD CONSTRAINT "drop_weigh_ins_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drop_food_diary_player_week_uniq" ON "drop_food_diary" USING btree ("drop_player_id","week_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drop_matches_season_week_idx" ON "drop_matches" USING btree ("drop_season_id","week_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drop_teams_season_idx" ON "drop_teams" USING btree ("drop_season_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drop_weigh_ins_player_idx" ON "drop_weigh_ins" USING btree ("drop_player_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drop_weigh_ins_player_week_uniq" ON "drop_weigh_ins" USING btree ("drop_player_id","week_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drop_players_team_idx" ON "drop_players" USING btree ("drop_team_id");