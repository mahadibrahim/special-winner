-- Idempotent type/table statements (0023/0024/0063/0065 convention): tolerate
-- a drifted DB that already carries the type/table/constraint.
DO $$ BEGIN CREATE TYPE "public"."suspension_status" AS ENUM('active', 'served', 'appealed', 'season', 'permanent'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
-- Postgres cannot add an enum value and use it in the same transaction, so
-- this must be its own migration applied before any row uses 'ejection'
-- (enforced here: no seed/insert in this migration references it).
ALTER TYPE "public"."game_incident_type" ADD VALUE IF NOT EXISTS 'ejection';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suspensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"person_name" varchar(120) NOT NULL,
	"family_member_id" uuid,
	"game_incident_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"games_missed" integer DEFAULT 1 NOT NULL,
	"games_served" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"status" "suspension_status" DEFAULT 'active' NOT NULL,
	"escalated_to_director" boolean DEFAULT false NOT NULL,
	"set_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "suspensions_non_negative_games_missed" CHECK ("suspensions"."games_missed" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_game_incident_id_game_incidents_id_fk" FOREIGN KEY ("game_incident_id") REFERENCES "public"."game_incidents"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_set_by_user_id_users_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suspensions_org_status_idx" ON "suspensions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suspensions_team_idx" ON "suspensions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suspensions_game_incident_idx" ON "suspensions" USING btree ("game_incident_id");
