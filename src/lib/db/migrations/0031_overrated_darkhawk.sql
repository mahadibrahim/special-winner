-- Schema hardening: additive unique indexes, CHECK constraints, FK
-- onDelete tweaks, and one timezone-aware column type change. Every
-- statement is written idempotently so a re-run (or a partially-applied
-- migration) is safe.

ALTER TABLE "email_logs" DROP CONSTRAINT IF EXISTS "email_logs_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "email_logs" DROP CONSTRAINT IF EXISTS "email_logs_registration_id_registrations_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "payments_stripe_payment_intent_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "payments_stripe_charge_idx";--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance'
      AND column_name = 'event_date'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "attendance" ALTER COLUMN "event_date" SET DATA TYPE timestamp with time zone USING "event_date" AT TIME ZONE 'UTC';
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "domain_mappings_org_primary_uniq" ON "domain_mappings" USING btree ("organization_id") WHERE is_primary = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "programs_location_slug_uniq" ON "programs" USING btree ("location_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seasons_program_slug_uniq" ON "seasons" USING btree ("program_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "registrations_member_season_active_uniq" ON "registrations" USING btree ("family_member_id","season_id") WHERE status NOT IN ('cancelled', 'refunded');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripe_payment_intent_uniq" ON "payments" USING btree ("stripe_payment_intent_id") WHERE stripe_payment_intent_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripe_charge_uniq" ON "payments" USING btree ("stripe_charge_id") WHERE stripe_charge_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rosters_team_registration_uniq" ON "rosters" USING btree ("team_id","registration_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "standings_season_team_uniq" ON "standings" USING btree ("season_id","team_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "games" ADD CONSTRAINT "games_distinct_teams" CHECK ("games"."home_team_id" <> "games"."away_team_id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "games" ADD CONSTRAINT "games_non_negative_scores" CHECK (("games"."home_score" IS NULL OR "games"."home_score" >= 0) AND ("games"."away_score" IS NULL OR "games"."away_score" >= 0));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
