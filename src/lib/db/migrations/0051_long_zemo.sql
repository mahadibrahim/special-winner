CREATE TYPE "public"."game_incident_type" AS ENUM('yellow_card', 'red_card', 'injury', 'other');--> statement-breakpoint
CREATE TYPE "public"."game_side" AS ENUM('home', 'away');--> statement-breakpoint
CREATE TABLE "game_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"reported_by_user_id" uuid,
	"type" "game_incident_type" NOT NULL,
	"side" "game_side" NOT NULL,
	"player" varchar(120),
	"minute" integer,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "referee_notes" text;--> statement-breakpoint
ALTER TABLE "game_incidents" ADD CONSTRAINT "game_incidents_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_incidents" ADD CONSTRAINT "game_incidents_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_incidents_game_idx" ON "game_incidents" USING btree ("game_id");